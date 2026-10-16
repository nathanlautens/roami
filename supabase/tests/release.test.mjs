// Checks the release migration. Run: npm run test:release
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  create schema auth;
  create table auth.users (
    id uuid primary key, phone text, aud text, role text,
    created_at timestamptz, updated_at timestamptz, is_anonymous boolean not null default false
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  alter table storage.objects enable row level security;
`);
for (const f of ['20261014200000_initial_schema', '20261014230000_mock_friends', '20261015000000_open_roams', '20261016210000_release_ready']) {
  await db.exec(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'));
}

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}'), ('${C}');
  update public.profiles set display_name = 'Nate' where id = '${A}';
  update public.profiles set display_name = 'Jo' where id = '${B}';
  update public.profiles set display_name = 'Sam' where id = '${C}';
  insert into public.friendships (requester_id, addressee_id, status) values ('${B}', '${A}', 'accepted'), ('${C}', '${A}', 'accepted');`);

async function as(user, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  try { return await db.query(sql); } finally { await db.exec('reset role;'); }
}
let failures = 0;
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; };
async function expectError(name, user, sql, code) {
  try { await as(user, sql); check(name, false); }
  catch (e) { check(name, e.message.includes(code)); if (!e.message.includes(code)) console.log('   got:', e.message); }
}

// Test helpers are locked away
await expectError('app users cannot create test friends', A, 'select public.seed_mock_friends()', 'permission denied');
await expectError('app users cannot start test votes', A, 'select public.seed_mock_open_roam()', 'permission denied');

// Server-side buzzer
const n1 = `date_trunc('day', now()) + interval '2 days 19 hours'`;
const open = (await as(A, `select public.start_open_roam(array[${n1}]::timestamptz[], now() + interval '1 hour', array['${B}', '${C}']::uuid[]) id`)).rows[0].id;
await as(B, `select public.vote_open_roam('${open}', array[${n1}]::timestamptz[], array['food'])`);
await expectError('app users cannot call the internal lock', A, `select public.lock_open_roam('${open}')`, 'permission denied');
await expectError('app users cannot run the buzzer job', A, `select public.resolve_due_open_roams()`, 'permission denied');
check('buzzer job does nothing before the buzzer', (await db.query('select public.resolve_due_open_roams() n')).rows[0].n === 0);
await db.exec(`update public.open_roams set buzzer_at = now() - interval '1 second' where id = '${open}'`);
check('buzzer job locks it when the time comes', (await db.query('select public.resolve_due_open_roams() n')).rows[0].n === 1);
const o = (await db.query(`select status, locked_roam_id from public.open_roams where id = '${open}'`)).rows[0];
check('open Roam is locked into a Roam', o.status === 'locked' && !!o.locked_roam_id);
check('Jo (free that night) is In', (await db.query(`select response from public.roam_invites where roam_id = '${o.locked_roam_id}' and user_id = '${B}'`)).rows[0].response === 'in');
check('the app call still returns the same Roam', (await as(C, `select public.resolve_open_roam('${open}') id`)).rows[0].id === o.locked_roam_id);
check('running the job again does nothing', (await db.query('select public.resolve_due_open_roams() n')).rows[0].n === 0);
const other = '00000000-0000-0000-0000-0000000000dd';
await db.exec(`insert into auth.users (id) values ('${other}')`);
await expectError('outsiders still cannot resolve', other, `select public.resolve_open_roam('${open}')`, 'not_invited');

// Delete my account
const roam = (await as(B, `select public.send_roam('Jo''s thing', null, null, now(), now() + interval '2 hours', null, array['${A}']::uuid[]) id`)).rows[0].id;
await as(B, `insert into public.crews (name) values ('Jo''s circle')`);
await expectError('signed-out users cannot delete', '', 'select public.delete_my_account()', 'not_signed_in');
await as(B, 'select public.delete_my_account()');
check('auth user is gone', (await db.query(`select count(*)::int n from auth.users where id = '${B}'`)).rows[0].n === 0);
check('profile is gone', (await db.query(`select count(*)::int n from public.profiles where id = '${B}'`)).rows[0].n === 0);
check('their friendships are gone', (await db.query(`select count(*)::int n from public.friendships where '${B}' in (requester_id, addressee_id)`)).rows[0].n === 0);
check('their hosted Roams are gone', (await db.query(`select count(*)::int n from public.roams where id = '${roam}'`)).rows[0].n === 0);
check('their circles are gone', (await db.query(`select count(*)::int n from public.crews where owner_id = '${B}'`)).rows[0].n === 0);
check('their votes are gone', (await db.query(`select count(*)::int n from public.open_roam_night_votes where user_id = '${B}'`)).rows[0].n === 0);
check('other people are untouched', (await db.query(`select count(*)::int n from auth.users`)).rows[0].n === 3);

console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
