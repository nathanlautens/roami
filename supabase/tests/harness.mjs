// Shared setup for the database tests: an in-memory Postgres (PGlite) with
// minimal stand-ins for what Supabase provides, plus small check helpers.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

/** Minimal stand-ins for Supabase's roles, auth schema, realtime and storage. */
const SUPABASE_STUBS = `
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
`;

/** The database, once `setup` has run. */
export let db;

/** The SQL of one migration in supabase/migrations, by file name without `.sql`. */
export const migrationSql = (name) => readFileSync(`supabase/migrations/${name}.sql`, 'utf8');

/**
 * Starts a fresh database with the Supabase stand-ins, runs `extraSql`, then
 * applies the named migrations (in order) and any SQL files given by path.
 */
export async function setup({ migrations = [], files = [], extraSql = '' } = {}) {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  if (extraSql) await db.exec(extraSql);
  for (const name of migrations) await db.exec(migrationSql(name));
  for (const path of files) await db.exec(readFileSync(path, 'utf8'));
  return db;
}

/**
 * Runs `sql` as a signed-in user. `null` runs it as an anonymous visitor;
 * `''` runs it with the authenticated role but no user id.
 */
export async function as(user, sql, params = []) {
  const anon = user === null || user === undefined;
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${anon ? 'anon' : 'authenticated'};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}

/** First row of a query run as the database owner. */
export const one = async (sql) => (await db.query(sql)).rows[0];

let failures = 0;
export function check(name, ok) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (!ok) failures++;
}

/** Passes if running `sql` as `user` fails with an error mentioning `code`. */
export async function expectError(name, user, sql, code) {
  try { await as(user, sql); check(`${name} (expected ${code})`, false); }
  catch (e) { check(name, e.message.includes(code)); if (!e.message.includes(code)) console.log('   got:', e.message); }
}

/** Prints the summary and exits non-zero if anything failed. */
export function done() {
  console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}
