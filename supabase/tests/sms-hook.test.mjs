// Checks the dev SMS hook: the auth server can save codes, app users can't see them.
// Run: npm run test:sms-hook
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role supabase_auth_admin;
  grant usage on schema public to anon, authenticated;
`);
await db.exec(readFileSync(process.argv[2], 'utf8'));

let failures = 0;
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; };

const event = { user: { phone: '447700900123' }, sms: { otp: '123456' } };

await db.exec('set role supabase_auth_admin');
await db.query('select public.send_sms_hook($1::jsonb)', [JSON.stringify(event)]);
const saved = await db.query('select phone, otp from public.dev_sms_codes');
check('auth server saves the code', saved.rows.length === 1 && saved.rows[0].otp === '123456' && saved.rows[0].phone === '447700900123');
await db.exec('reset role');

for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`);
  try {
    const r = await db.query('select * from public.dev_sms_codes');
    check(`${role} cannot read codes`, r.rows.length === 0);
  } catch (e) {
    check(`${role} cannot read codes`, e.message.includes('permission denied'));
  }
  try {
    await db.query('select public.send_sms_hook($1::jsonb)', [JSON.stringify(event)]);
    check(`${role} cannot call the hook`, false);
  } catch (e) {
    check(`${role} cannot call the hook`, e.message.includes('permission denied'));
  }
  await db.exec('reset role');
}

// Old codes get cleaned up
await db.exec(`insert into public.dev_sms_codes (phone, otp, created_at) values ('1', '000000', now() - interval '2 days')`);
await db.exec('set role supabase_auth_admin');
await db.query('select public.send_sms_hook($1::jsonb)', [JSON.stringify(event)]);
await db.exec('reset role');
check('codes older than a day are deleted', (await db.query(`select * from public.dev_sms_codes where otp = '000000'`)).rows.length === 0);

console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
