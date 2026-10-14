// Checks the mock-friends seed. Run: npm run test:mock
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
await db.exec(readFileSync('supabase/migrations/20261014200000_initial_schema.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/20261014230000_mock_friends.sql', 'utf8'));

const ME = '00000000-0000-0000-0000-0000000000aa';
const OTHER = '00000000-0000-0000-0000-0000000000bb';
await db.exec(`insert into auth.users (id) values ('${ME}'), ('${OTHER}');
  update public.profiles set display_name = 'Nate' where id = '${ME}';
  update public.profiles set display_name = 'Someone' where id = '${OTHER}';`);

async function as(user, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  try { return await db.query(sql); } finally { await db.exec('reset role;'); }
}
let failures = 0;
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; };

check('seed creates 10 friends', (await as(ME, 'select public.seed_mock_friends() n')).rows[0].n === 10);

const friends = await as(ME, `select count(*)::int n from public.friendships where status = 'accepted'`);
check('all 10 are accepted friends', friends.rows[0].n === 10);

const circles = await as(ME, `select c.name, count(m.member_id)::int n from public.crews c left join public.crew_members m on m.crew_id = c.id group by c.name order by c.name`);
check('two circles exist', circles.rows.length === 2);
check('each circle has at least 3 people', circles.rows.every((r) => r.n >= 3));
console.log('     circles:', circles.rows.map((r) => `${r.name} (${r.n})`).join(', '));

const waiting = await as(ME, `select count(*)::int n from public.roam_invites where user_id = '${ME}' and response is null`);
check('2 Roams are waiting on me', waiting.rows[0].n === 2);
const visibleNotes = await as(ME, `select note from public.roam_invites where note is not null`);
check('I can see notes from friends who are In', visibleNotes.rows.length === 1);

try { await as(ME, 'select public.seed_mock_friends()'); check('seeding twice is blocked', false); }
catch (e) { check('seeding twice is blocked', e.message.includes('already_seeded')); }

// Mock friends answer my Roams
const ids = (await as(ME, `select f.requester_id id from public.friendships f`)).rows.map((r) => `'${r.id}'`).join(',');
const roam = (await as(ME, `select public.send_roam('Test roam', null, null, now(), now() + interval '2 hours', null, array[${ids}]::uuid[]) id`)).rows[0].id;
const answers = await as(ME, `select response from public.roam_invites where roam_id = '${roam}' and user_id <> '${ME}'`);
check('mock friends were invited', answers.rows.length === 10);
check('most mock friends answered automatically', answers.rows.filter((r) => r.response).length >= 5);

// Other people can't see or remove my mock friends
check("other users don't see my mock list", (await as(OTHER, 'select * from public.mock_people')).rows.length === 0);
check("other users can't clear my mock friends", (await as(OTHER, 'select public.clear_mock_friends() n')).rows[0].n === 0);

// Real friends don't auto-respond
await db.exec(`insert into public.friendships (requester_id, addressee_id, status) values ('${OTHER}', '${ME}', 'accepted')`);
const r2 = (await as(ME, `select public.send_roam('Real one', null, null, now(), now() + interval '2 hours', null, array['${OTHER}']::uuid[]) id`)).rows[0].id;
check("real friends don't auto-answer", (await as(ME, `select response from public.roam_invites where roam_id = '${r2}' and user_id = '${OTHER}'`)).rows[0].response === null);

check('clear removes all 10', (await as(ME, 'select public.clear_mock_friends() n')).rows[0].n === 10);
check('only the real friend is left', (await as(ME, `select count(*)::int n from public.friendships`)).rows[0].n === 1);
check('circles stay', (await as(ME, 'select count(*)::int n from public.crews')).rows[0].n === 2);
check('can seed again after clearing', (await as(ME, 'select public.seed_mock_friends() n')).rows[0].n === 10);
check('re-seeding reuses the same 2 circles', (await as(ME, 'select count(*)::int n from public.crews')).rows[0].n === 2);

console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
