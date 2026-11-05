// Performance indexes: present, re-runnable, and usable by the queries they're for.
// Run: npm run test:indexes
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
  create role supabase_auth_admin;
`);
const files = ['20261014200000_initial_schema', '20261014210000_dev_sms_hook', '20261014230000_mock_friends', '20261015000000_open_roams',
  '20261016210000_release_ready', '20261016220000_safety_and_push', '20261025000000_bug_fixes', '20261103000000_security_hardening',
  '20261105000000_performance_indexes'];
for (const f of files) await db.exec(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'));

let failures = 0;
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; };

// Safe to run again.
try {
  await db.exec(readFileSync('supabase/migrations/20261105000000_performance_indexes.sql', 'utf8'));
  check('the index file can be run again', true);
} catch (e) {
  check(`the index file can be run again (${e.message})`, false);
}

const sql = readFileSync('supabase/migrations/20261105000000_performance_indexes.sql', 'utf8');
const expected = [...sql.matchAll(/create index if not exists (\w+)/g)].map((m) => m[1]);
const { rows } = await db.query(`select indexname from pg_indexes where schemaname = 'public'`);
const have = new Set(rows.map((r) => r.indexname));
for (const name of expected) check(`index ${name} exists`, have.has(name));

// With sequential scans off, the planner picks an index if one fits the query.
async function usesIndex(name, query) {
  await db.exec('set enable_seqscan = off;');
  const plan = (await db.query(`explain ${query}`)).rows.map((r) => r['QUERY PLAN']).join('\n');
  await db.exec('reset enable_seqscan;');
  check(`${name} uses an index (${plan.match(/\w+_idx/)?.[0] ?? 'none'})`, /Index|Bitmap/.test(plan) && !/Seq Scan/.test(plan));
}
await usesIndex('the buzzer job', `select id from public.open_roams where status = 'open' and buzzer_at <= now() order by buzzer_at`);
await usesIndex('the "starting in 30" job', `select * from public.roams where status = 'live' and reminded_at is null
  and starts_at between now() + interval '20 minutes' and now() + interval '35 minutes'`);
await usesIndex('friendships by addressee', `select * from public.friendships where addressee_id = '00000000-0000-0000-0000-00000000000a'`);
await usesIndex('friendships by requester', `select * from public.friendships where requester_id = '00000000-0000-0000-0000-00000000000a'`);
await usesIndex('the report rate limit', `select count(*) from public.reports where reporter_id = '00000000-0000-0000-0000-00000000000a' and created_at > now() - interval '1 hour'`);
await usesIndex('pending requests for a Roam', `select * from public.invite_requests where roam_id = '00000000-0000-0000-0000-00000000000a' and status = 'pending'`);
await usesIndex('circles by owner', `select * from public.crews where owner_id = '00000000-0000-0000-0000-00000000000a'`);

console.log(failures ? `\n${failures} failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
