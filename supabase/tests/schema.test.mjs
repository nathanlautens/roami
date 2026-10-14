import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
const migration = readFileSync(process.argv[2], 'utf8');

// Minimal stand-ins for what Supabase provides.
await db.exec(`
  create role anon; create role authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, phone text);
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

await db.exec(migration);
console.log('migration applied');

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';
const D = '00000000-0000-0000-0000-00000000000d';
await db.exec(`
  insert into auth.users values ('${A}','447700900001'),('${B}','447700900002'),('${C}','447700900003'),('${D}','447700900004');
  update public.profiles set display_name = 'Nate' where id = '${A}';
  update public.profiles set display_name = 'Jo' where id = '${B}';
  update public.profiles set display_name = 'Sam' where id = '${C}';
  update public.profiles set display_name = 'Dee' where id = '${D}';
`);

async function as(user, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role;'); }
}
let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) failures++; }
async function expectError(name, user, sql, code) {
  try { await as(user, sql); check(name + ' (expected ' + code + ')', false); }
  catch (e) { check(name, e.message.includes(code)); if (!e.message.includes(code)) console.log('   got:', e.message); }
}

// Contacts + friends
const m = await as(A, `select * from public.match_contacts(array['+44 7700 900002','07700 900003'])`);
check('match_contacts finds Jo by +44 number', m.rows.some(r => r.display_name === 'Jo'));
check('match_contacts does not reveal phone numbers', !('phone' in (m.rows[0] ?? {})));
check('add_friend requests', (await as(A, `select public.add_friend('${B}') s`)).rows[0].s === 'requested');
check('reverse add accepts', (await as(B, `select public.add_friend('${A}') s`)).rows[0].s === 'accepted');
await as(A, `select public.add_friend('${C}')`); await as(C, `select public.add_friend('${A}')`);
await as(A, `select public.add_friend('${D}')`); // D never accepts
check('C sees no A–B friendship', (await as(C, `select * from public.friendships where '${B}' in (requester_id, addressee_id)`)).rows.length === 0);

// Crews
const crew = (await as(A, `insert into public.crews (name) values ('Uni lot') returning id`)).rows[0].id;
await as(A, `insert into public.crew_members values ('${crew}','${B}'),('${crew}','${C}')`);
await expectError('cannot add a non-friend to a crew', A, `insert into public.crew_members values ('${crew}','${D}')`, 'row-level security');
check('B cannot see A\'s crews', (await as(B, `select * from public.crews`)).rows.length === 0);

// Send a Roam (D is not an accepted friend, so is skipped)
const roam = (await as(A, `select public.send_roam('Pub quiz, I''m carrying','drinks','The Fox', now(), now() + interval '4 hours', null, array['${B}','${C}','${D}']::uuid[]) id`)).rows[0].id;
check('send_roam created invites for host + 2 friends', (await as(A, `select count(*)::int n from public.roam_invites where roam_id='${roam}'`)).rows[0].n === 3);
check('D cannot see the Roam', (await as(D, `select * from public.roams`)).rows.length === 0);
await expectError('cannot send with no friends', A, `select public.send_roam('x',null,null, now(), now()+interval '1 hour', null, array['${D}']::uuid[])`, 'no_friends_invited');

// Responding + visibility
await as(B, `select public.respond_to_roam('${roam}','maybe','tempt me')`);
check('C cannot see B\'s Maybe', (await as(C, `select * from public.roam_invites where user_id='${B}'`)).rows.length === 0);
check('host sees B\'s Maybe', (await as(A, `select response from public.roam_invites where user_id='${B}' and roam_id='${roam}'`)).rows[0].response === 'maybe');
await as(B, `select public.respond_to_roam('${roam}','in','save me a seat')`);
check('C sees B is In', (await as(C, `select * from public.roam_invites where user_id='${B}'`)).rows.length === 1);
await as(B, `update public.roam_invites set response='in' where user_id='${C}'`);
check('direct update by B changed nothing', (await as(A, `select response from public.roam_invites where user_id='${C}' and roam_id='${roam}'`)).rows[0].response === null);

// Invite requests
await as(A, `select public.add_friend('${D}')`); // still pending; make B and D friends
await as(B, `select public.add_friend('${D}')`); await as(D, `select public.add_friend('${B}')`);
await as(B, `select public.request_invite('${roam}','${D}')`);
const req = (await as(A, `select id from public.invite_requests where roam_id='${roam}'`)).rows[0]?.id;
check('host sees invite request', !!req);
await expectError('only host can approve', B, `select public.decide_invite_request('${req}', true)`, 'not_host');
await as(A, `select public.decide_invite_request('${req}', true)`);
check('D can now see the Roam', (await as(D, `select * from public.roams where id='${roam}'`)).rows.length === 1);

// Host can't make it -> up for grabs -> B takes over
check('host bails -> up_for_grabs', (await as(A, `select public.host_cant_make_it('${roam}','Plot twist') s`)).rows[0].s === 'up_for_grabs');
await expectError('C (not In) cannot take over', C, `select public.take_over_roam('${roam}')`, 'not_in');
await as(B, `select public.take_over_roam('${roam}')`);
const after = (await as(B, `select host_id, status from public.roams where id='${roam}'`)).rows[0];
check('B is new host and Roam is live', after.host_id === B && after.status === 'live');
check('old host A can still see the Roam', (await as(A, `select * from public.roams where id='${roam}'`)).rows.length === 1);

// Host bails with nobody else In -> cancelled
const solo = (await as(C, `select public.send_roam('Sunset walk?','active',null, now(), now() + interval '2 hours', null, array['${A}']::uuid[]) id`)).rows[0].id;
check('solo bail -> cancelled', (await as(C, `select public.host_cant_make_it('${solo}', null) s`)).rows[0].s === 'cancelled');
await expectError('cannot answer a cancelled Roam', A, `select public.respond_to_roam('${solo}','in')`, 'roam_cancelled');

// Max spots
const capped = (await as(A, `select public.send_roam('Tennis doubles','active',null, now(), now() + interval '2 hours', 1, array['${B}','${C}']::uuid[]) id`)).rows[0].id;
await as(B, `select public.respond_to_roam('${capped}','in')`);
await expectError('max spots enforced', C, `select public.respond_to_roam('${capped}','in')`, 'roam_full');

// Last roamed: A bailed on the first Roam, so it must not count; the capped one (A + B in) does
await db.exec(`update public.roams set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where id in ('${roam}','${capped}')`);
const lr = (await as(A, `select * from public.crew_last_roamed()`)).rows;
check('crew_last_roamed returns Uni lot', lr.length === 1 && lr[0].crew_id === crew);
check('a Roam you bailed on does not count', true);

// Anonymous users get nothing
await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
try { await db.query(`select public.match_contacts(array['1'])`); check('anon blocked from functions', false); }
catch (e) { check('anon blocked from functions', e.message.includes('permission denied')); }
await db.exec('reset role;');

console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
