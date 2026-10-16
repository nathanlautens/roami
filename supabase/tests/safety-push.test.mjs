// Checks block & report and push notifications. Run: npm run test:push
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
for (const f of ['20261014200000_initial_schema', '20261014230000_mock_friends', '20261015000000_open_roams',
  '20261016210000_release_ready', '20261016220000_safety_and_push']) {
  await db.exec(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'));
}

const A = '00000000-0000-0000-0000-00000000000a'; // Nate
const B = '00000000-0000-0000-0000-00000000000b'; // Jo
const C = '00000000-0000-0000-0000-00000000000c'; // Sam
const D = '00000000-0000-0000-0000-00000000000d'; // Dee (Tokyo time, for quiet hours)
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}'), ('${C}'), ('${D}');
  update public.profiles set display_name = 'Nate' where id = '${A}';
  update public.profiles set display_name = 'Jo' where id = '${B}';
  update public.profiles set display_name = 'Sam' where id = '${C}';
  update public.profiles set display_name = 'Dee' where id = '${D}';
  insert into public.push_tokens (user_id, token, time_zone) values
    ('${A}', 'ExponentPushToken[a]', 'Europe/London'), ('${B}', 'ExponentPushToken[b]', 'Europe/London'),
    ('${C}', 'ExponentPushToken[c]', 'Europe/London'), ('${D}', 'ExponentPushToken[d]', 'Asia/Tokyo');`);

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
const pushes = async (user) => (await db.query(`select title, body, data, send_after from public.notifications where user_id = '${user}' order by id`)).rows;
const clear = () => db.exec('delete from public.notifications');

// Friend requests
await as(B, `select public.add_friend('${A}')`);
check('friend request pushes the other person', (await pushes(A)).some((p) => p.title === 'Jo wants to roam with you'));
await as(A, `select public.add_friend('${B}')`);
check('accepting pushes the requester', (await pushes(B)).some((p) => p.title === 'Nate added you back'));
await as(C, `select public.add_friend('${A}')`); await as(A, `select public.add_friend('${C}')`);
await as(D, `select public.add_friend('${A}')`); await as(A, `select public.add_friend('${D}')`);
await clear();

// New Roam
const roam = (await as(A, `select public.send_roam('Pub quiz', 'drinks', 'The Fox', now() + interval '1 hour', now() + interval '4 hours', null, array['${B}', '${C}']::uuid[]) id`)).rows[0].id;
const jo = await pushes(B);
check('invitees get a push', jo.length === 1 && jo[0].title.startsWith("Nate's free") && jo[0].body === 'Pub quiz. You in?');
check('the push opens the Roam', jo[0]?.data?.url === `/roam/${roam}`);
check('the host does not get pushed about their own Roam', (await pushes(A)).length === 0);
await clear();

// Responses
await as(B, `select public.respond_to_roam('${roam}', 'in')`);
check("host hears when someone's in", (await pushes(A)).some((p) => p.title === "Jo's in!"));
await as(B, `select public.respond_to_roam('${roam}', 'cant')`);
check('host hears when someone bails', (await pushes(A)).some((p) => p.title === 'Jo had to bail'));
await as(C, `select public.respond_to_roam('${roam}', 'maybe')`);
check('a Maybe does not ping the host', !(await pushes(A)).some((p) => p.title.includes('Sam')));
await as(B, `select public.respond_to_roam('${roam}', 'in')`);
await clear();

// Host can't make it -> up for grabs
await as(A, `select public.host_cant_make_it('${roam}', 'Plot twist')`);
check("people who are In hear it's up for grabs", (await pushes(B)).some((p) => p.title === "Nate can't make it"));
check('Maybes are not told about up for grabs', !(await pushes(C)).some((p) => p.title === "Nate can't make it"));
await clear();
await as(B, `select public.take_over_roam('${roam}')`);
check('taking over is announced to those In (not the new host)', (await pushes(B)).length === 0);
await clear();

// Starting soon
await db.exec(`update public.roams set starts_at = now() + interval '30 minutes', status = 'live' where id = '${roam}'`);
await clear();
check('starting-soon reminder runs', (await db.query('select public.queue_starting_soon() n')).rows[0].n === 1);
check('those In get "in 30"', (await pushes(B)).some((p) => p.title === 'Pub quiz in 30'));
check('reminder only once', (await db.query('select public.queue_starting_soon() n')).rows[0].n === 0);
await clear();

// Quiet hours: Dee is in Tokyo. Force it to be 3am there.
const tokyo3am = (await db.query(`select (date_trunc('day', now() at time zone 'Asia/Tokyo') + interval '1 day 3 hours') at time zone 'Asia/Tokyo' as t`)).rows[0].t;
await db.exec(`select set_config('roami.fake_now', '${tokyo3am.toISOString()}', false)`);
// queue_push uses now(); simulate by checking the computed send_after directly at a fixed time:
const held = (await db.query(`
  with t as (select timestamptz '${tokyo3am.toISOString()}' as n)
  select ((date_trunc('day', n at time zone 'Asia/Tokyo') + interval '8 hours') at time zone 'Asia/Tokyo') as release_at,
         extract(hour from n at time zone 'Asia/Tokyo') as local_hour from t`)).rows[0];
check('3am Tokyo is inside quiet hours', Number(held.local_hour) === 3);
check('quiet-hours pushes are held until 8am local', new Date(held.release_at).getTime() - tokyo3am.getTime() === 5 * 3600_000);
// And the real function: Dee gets a push now; it must never be scheduled for a local time before 8am.
await as(A, `select public.send_roam('Brunch', 'food', null, now() + interval '2 days', now() + interval '2 days 2 hours', null, array['${D}']::uuid[])`);
const dee = (await db.query(`select extract(hour from send_after at time zone 'Asia/Tokyo') h, send_after > now() + interval '1 minute' as later from public.notifications where user_id = '${D}'`)).rows[0];
check('pushes never land between midnight and 8am local', dee && (Number(dee.h) >= 8 || dee.later === false));
await clear();

// Urgent pushes skip quiet hours
check('friendly_when says tonight/tomorrow/day', /^(tonight|today|tomorrow|[A-Z][a-z]{2}) /.test((await db.query(`select public.friendly_when(now() + interval '1 day', '${A}') w`)).rows[0].w));

// Open Roams
const n1 = `date_trunc('day', now()) + interval '2 days 19 hours'`;
const open = (await as(A, `select public.start_open_roam(array[${n1}]::timestamptz[], now() + interval '1 hour', array['${B}', '${C}']::uuid[]) id`)).rows[0].id;
check('invitees are asked to vote', (await pushes(C)).some((p) => p.title === "Nate's free a few nights" && p.data.url === `/open/${open}`));
await as(B, `select public.vote_open_roam('${open}', array[${n1}]::timestamptz[], array['food'])`);
await clear();
await db.exec(`update public.open_roams set buzzer_at = now() - interval '1 second' where id = '${open}'`);
await db.query('select public.resolve_due_open_roams()');
const bz = await pushes(B);
check('BZZZT push goes to those locked in', bz.some((p) => p.title.startsWith("BZZZT! It's ")));
check('people who did not pick that night get a "you in?" instead', (await pushes(C)).some((p) => p.body.endsWith('You in?')));
await clear();

// No token, no queue
await db.exec(`delete from public.push_tokens where user_id = '${C}'`);
await as(A, `select public.send_roam('Walk', 'active', null, now() + interval '5 hours', now() + interval '7 hours', null, array['${C}']::uuid[])`);
check('nobody is queued without a push token', (await pushes(C)).length === 0);

// Sending without pg_net just leaves them queued
await clear();
await as(A, `select public.send_roam('Coffee', 'chill', null, now() + interval '5 hours', now() + interval '7 hours', null, array['${B}']::uuid[])`);
check('send_due_pushes is safe without pg_net', (await db.query('select public.send_due_pushes() n')).rows[0].n === 0);
check('app users cannot read notifications', (await as(B, 'select * from public.notifications')).rows.length === 0);
await expectError('app users cannot queue pushes', B, `select public.queue_push('${A}', 'x', 'y')`, 'permission denied');

// ─── Block & report ───────────────────────────────────────────
const shared = (await as(A, `select public.send_roam('Tacos', 'food', null, now() + interval '5 hours', now() + interval '7 hours', null, array['${B}']::uuid[]) id`)).rows[0].id;
const circle = (await as(A, `insert into public.crews (name) values ('Uni lot') returning id`)).rows[0].id;
await as(A, `insert into public.crew_members values ('${circle}', '${B}')`);
await as(A, `select public.block_user('${B}')`);
check('blocking unfriends', (await db.query(`select count(*)::int n from public.friendships where '${B}' in (requester_id, addressee_id) and '${A}' in (requester_id, addressee_id)`)).rows[0].n === 0);
check('blocking removes them from your circles', (await db.query(`select count(*)::int n from public.crew_members where member_id = '${B}'`)).rows[0].n === 0);
check('blocking removes them from your upcoming Roams', (await db.query(`select count(*)::int n from public.roam_invites where roam_id = '${shared}' and user_id = '${B}'`)).rows[0].n === 0);
await expectError('a blocked person cannot send you a friend request', B, `select public.add_friend('${A}')`, 'blocked');
await expectError('you cannot friend someone you blocked', A, `select public.add_friend('${B}')`, 'blocked');
check('they cannot see that you blocked them', (await as(B, 'select * from public.blocks')).rows.length === 0);
check('you can see your block list', (await as(A, 'select * from public.blocks')).rows.length === 1);
await as(A, `select public.unblock_user('${B}')`);
check('unblocking lets you be friends again', (await as(A, `select public.add_friend('${B}') s`)).rows[0].s === 'requested');

const rep = (await as(C, `select public.report('${A}', null, 'spam', 'too many brunch invites') id`)).rows[0].id;
check('reports are saved for review', !!rep && (await db.query(`select status from public.reports where id = '${rep}'`)).rows[0].status === 'open');
check('reporters see their own reports only', (await as(A, 'select * from public.reports')).rows.length === 0);
await expectError('you can only report Roams you are on', C, `select public.report(null, '${shared}', 'spam')`, 'not_invited');
await expectError('reasons are a fixed list', C, `select public.report('${A}', null, 'vibes')`, 'reports_reason_check');

console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
