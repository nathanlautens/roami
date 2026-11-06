// Shared setup for the database tests: Supabase stand-ins, migrations and check helpers.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

export const migration = (name) => readFileSync(`supabase/migrations/${name}.sql`, 'utf8');

const SUPABASE = `
  create role anon; create role authenticated; create role supabase_auth_admin;
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
  alter table storage.objects enable row level security;`;

/**
 * `hosted`: like hosted Supabase, new functions are callable by anon and authenticated unless revoked.
 * `bare`: only the roles (for files that don't need the auth/storage stand-ins).
 */
export async function harness(migrations, { hosted = false, bare = false } = {}) {
  const db = new PGlite();
  await db.exec(bare ? 'create role anon; create role authenticated; create role supabase_auth_admin; grant usage on schema public to anon, authenticated;' : SUPABASE);
  if (hosted) await db.exec('alter default privileges in schema public grant execute on functions to anon, authenticated;');
  for (const m of migrations) await db.exec(migration(m));

  let failures = 0;
  const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; };
  /** Runs `sql` as `user`: null is the signed-out (anon) role, '' is authenticated with no user. */
  async function as(user, sql, params = []) {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user === null ? 'anon' : 'authenticated'};`);
    try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
  }
  async function expectError(name, user, sql, code) {
    try { await as(user, sql); check(`${name} (expected ${code})`, false); }
    catch (e) { check(name, e.message.includes(code)); if (!e.message.includes(code)) console.log('   got:', e.message); }
  }
  /** Creates people: { [id]: 'Display name' }. */
  async function users(people) {
    for (const [id, name] of Object.entries(people)) {
      await db.exec(`insert into auth.users (id) values ('${id}'); update public.profiles set display_name = '${name}' where id = '${id}';`);
    }
  }
  const one = async (sql) => (await db.query(sql)).rows[0];
  function done() {
    console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
    process.exit(failures ? 1 : 0);
  }
  return { db, check, as, expectError, users, one, done };
}
