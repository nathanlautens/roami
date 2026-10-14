// Checks open Roams + the buzzer. Run: npm run test:open
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
for (const f of ['20261014200000_initial_schema', '20261014230000_mock_friends', '20261015000000_open_roams']) {
  await db.exec(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'));
}

const A = '00000000-0000-0000-0000-00000000000a'; // host
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';
const D = '00000000-0000-0000-0000-00000000000d'; // not invited
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}'), ('${C}'), ('${D}');
  update public.profiles set display_name = 'Nate' where id = '${A}';
  update public.profiles set display_name = 'Jo' where id = '${B}';
  update public.profiles set display_name = 'Sam' where id = '${C}';
  update public.profiles set display_name = 'Dee' where id = '${D}';
  insert into public.friendships (requester_id, addressee_id, status) values
    ('${B}', '${A}', 'accepted'), ('${C}', '${A}', 'accepted'), ('${D}', '${A}', 'accepted');`);

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

const n1 = `date_trunc('day', now()) + interval '2 days 19 hours'`;
const n2 = `date_trunc('day', now()) + interval '3 days 19 hours'`;
const n3 = `date_trunc('day', now()) + interval '5 days 19 hours'`;
const nights = `array[${n1}, ${n2}, ${n3}]::timestamptz[]`;

await expectError('buzzer must be before the first night', A,
  `select public.start_open_roam(${nights}, ${n1} + interval '1 hour', array['${B}']::uuid[])`, 'buzzer_after_first_night');
await expectError('nights must be in the future', A,
  `select public.start_open_roam(array[now() - interval '1 day']::timestamptz[], now() + interval '1 hour', array['${B}']::uuid[])`, 'night_in_past');

const open = (await as(A, `select public.start_open_roam(${nights}, now() + interval '1 hour', array['${B}', '${C}']::uuid[], 'That new taco place') id`)).rows[0].id;
check('open Roam created', !!open);
check('host is free on all 3 nights', (await as(A, `select count(*)::int n from public.open_roam_night_votes where user_id = '${A}'`)).rows[0].n === 3);
check("host's idea is there with their upvote", (await as(B, `select count(*)::int n from public.open_roam_idea_votes`)).rows[0].n === 1);
check('invitees can see it', (await as(B, `select * from public.open_roams`)).rows.length === 1);
check('uninvited friends cannot', (await as(D, `select * from public.open_roams`)).rows.length === 0);
check('uninvited friends cannot see votes', (await as(D, `select * from public.open_roam_night_votes`)).rows.length === 0);

// Votes: Jo and Sam both pick night 2; Jo also night 1
await as(B, `select public.vote_open_roam('${open}', array[${n1}, ${n2}]::timestamptz[], array['food', 'drinks'])`);
await as(C, `select public.vote_open_roam('${open}', array[${n2}]::timestamptz[], array['food'])`);
check('voted_at is set', (await as(A, `select count(*)::int n from public.open_roam_invites where voted_at is not null`)).rows[0].n === 3);
await as(B, `select public.vote_open_roam('${open}', array[${n2}]::timestamptz[], array['food'])`);
check('re-voting replaces earlier votes', (await as(B, `select count(*)::int n from public.open_roam_night_votes where user_id = '${B}'`)).rows[0].n === 1);
await expectError('uninvited cannot vote', D, `select public.vote_open_roam('${open}', array[${n2}]::timestamptz[], array['food'])`, 'not_invited');

// Ideas
const idea = (await as(C, `select public.pitch_open_roam_idea('${open}', 'Bowling + bad pizza') id`)).rows[0].id;
check('pitching an idea upvotes it', (await as(C, `select count(*)::int n from public.open_roam_idea_votes where idea_id = '${idea}'`)).rows[0].n === 1);
check('toggle adds an upvote', (await as(B, `select public.toggle_open_roam_idea_vote('${idea}') v`)).rows[0].v === true);
check('toggle again removes it', (await as(B, `select public.toggle_open_roam_idea_vote('${idea}') v`)).rows[0].v === false);
await as(B, `select public.toggle_open_roam_idea_vote('${idea}')`);
await as(C, `select public.pitch_open_roam_idea('${open}', 'two')`);
await as(C, `select public.pitch_open_roam_idea('${open}', 'three')`);
await expectError('max 3 ideas each', C, `select public.pitch_open_roam_idea('${open}', 'four')`, 'too_many_ideas');

await expectError('too early to resolve', B, `select public.resolve_open_roam('${open}')`, 'too_early');

// The buzzer goes off
await db.exec(`update public.open_roams set buzzer_at = now() - interval '1 second' where id = '${open}'`);
await expectError('voting closes at the buzzer', B, `select public.vote_open_roam('${open}', array[${n1}]::timestamptz[], array['food'])`, 'voting_closed');
const rid = (await as(B, `select public.resolve_open_roam('${open}') id`)).rows[0].id;
check('buzzer creates a Roam', !!rid);
const r = (await as(A, `select r.*, (r.starts_at = ${n2}) as is_n2 from public.roams r where id = '${rid}'`)).rows[0];
check('top night wins (night 2: 3 free)', r.is_n2 === true);
check('Roam is hosted by the open Roam host', r.host_id === A);
check('top vibe wins (food)', r.vibe === 'food');
check('top idea becomes the plan (Bowling, 2 votes)', r.what === 'Bowling + bad pizza');
const ins = (await as(A, `select user_id from public.roam_invites where roam_id = '${rid}' and response = 'in'`)).rows.map((x) => x.user_id).sort();
check('everyone free that night is In', JSON.stringify(ins) === JSON.stringify([A, B, C].sort()));
check('resolving again returns the same Roam', (await as(C, `select public.resolve_open_roam('${open}') id`)).rows[0].id === rid);
check('open Roam is locked', (await as(A, `select status from public.open_roams where id = '${open}'`)).rows[0].status === 'locked');

// Tie-break: equal free counts, more vibe enthusiasm wins
const open2 = (await as(A, `select public.start_open_roam(array[${n1}, ${n3}]::timestamptz[], now() + interval '1 hour', array['${B}', '${C}']::uuid[]) id`)).rows[0].id;
await as(B, `select public.vote_open_roam('${open2}', array[${n1}]::timestamptz[], array[]::text[])`);
await as(C, `select public.vote_open_roam('${open2}', array[${n3}]::timestamptz[], array['chaos', 'drinks'])`);
await db.exec(`update public.open_roams set buzzer_at = now() - interval '1 second' where id = '${open2}'`);
const rid2 = (await as(A, `select public.resolve_open_roam('${open2}') id`)).rows[0].id;
check('tie broken by vibe votes (later night wins)', (await as(A, `select (starts_at = ${n3}) ok from public.roams where id = '${rid2}'`)).rows[0].ok === true);
check('no ideas: plan named after the vibe', (await as(A, `select what from public.roams where id = '${rid2}'`)).rows[0].what === 'Drinks night');

// Every night already passed by the time someone looks
const open3 = (await as(A, `select public.start_open_roam(array[${n1}]::timestamptz[], now() + interval '1 hour', array['${B}']::uuid[]) id`)).rows[0].id;
await db.exec(`update public.open_roam_nights set night_start = now() - interval '1 day' where open_roam_id = '${open3}';
  update public.open_roams set buzzer_at = now() - interval '2 days' where id = '${open3}'`);
check('stale open Roam expires instead of locking', (await as(A, `select public.resolve_open_roam('${open3}') id`)).rows[0].id === null);

// Test friends
await as(A, 'select public.seed_mock_friends()');
const mockOpen = (await as(A, 'select public.seed_mock_open_roam() id')).rows[0].id;
check('test open Roam includes me', (await as(A, `select count(*)::int n from public.open_roam_invites where open_roam_id = '${mockOpen}' and user_id = '${A}'`)).rows[0].n === 1);
const voters = (await as(A, `select count(*)::int n from public.open_roam_invites where open_roam_id = '${mockOpen}' and voted_at is not null`)).rows[0].n;
check(`test friends voted automatically (${voters} of 10)`, voters >= 5);
check('my vote is still open', (await as(A, `select voted_at from public.open_roam_invites where open_roam_id = '${mockOpen}' and user_id = '${A}'`)).rows[0].voted_at === null);
const mockIds = (await db.query('select user_id from public.mock_people')).rows.map((x) => `'${x.user_id}'`).join(',');
const mine = (await as(A, `select public.start_open_roam(array[${n1}]::timestamptz[], now() + interval '1 hour', array[${mockIds}]::uuid[]) id`)).rows[0].id;
check('test friends vote on my open Roams too', (await as(A, `select count(*)::int n from public.open_roam_invites where open_roam_id = '${mine}' and voted_at is not null`)).rows[0].n >= 5);
check('clearing test friends removes their open Roam', (await as(A, 'select public.clear_mock_friends() n')).rows[0].n === 10
  && (await as(A, `select count(*)::int n from public.open_roams where id = '${mockOpen}'`)).rows[0].n === 0);

console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
