// Security checks: who can see and call what. Run: npm run test:security
import { setup, as, check, expectError, migrationSql, done } from './harness.mjs';

const db = await setup({
  // Like hosted Supabase: new functions are callable by anon and authenticated unless revoked.
  extraSql: `create role supabase_auth_admin;
  alter default privileges in schema public grant execute on functions to anon, authenticated;`,
  migrations: [
    '20261014200000_initial_schema',
    '20261014210000_dev_sms_hook',
    '20261014230000_mock_friends',
    '20261015000000_open_roams',
    '20261016210000_release_ready',
    '20261016220000_safety_and_push',
    '20261025000000_bug_fixes',
    '20261103000000_security_hardening',
  ],
});

const A = '3f9a12bc-0000-4000-8000-00000000000a'; // Nate
const B = '00000000-0000-0000-0000-00000000000b'; // Jo, Nate's friend
const C = '00000000-0000-0000-0000-00000000000c'; // Sam, a stranger to Nate
const D = '00000000-0000-0000-0000-00000000000d'; // Dee, on a Roam with Nate via Jo
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}'), ('${C}'), ('${D}');
  update public.profiles set display_name = 'Nate' where id = '${A}';
  update public.profiles set display_name = 'Jo' where id = '${B}';
  update public.profiles set display_name = 'Sam' where id = '${C}';
  update public.profiles set display_name = 'Dee' where id = '${D}';`);

const ids = async (user, sql) => (await as(user, sql)).rows.map((r) => r.id);

await as(A, `select public.add_friend('${B}')`); await as(B, `select public.add_friend('${A}')`);
await as(B, `select public.add_friend('${D}')`); await as(D, `select public.add_friend('${B}')`);

// 1. Profiles: only people you're connected to
let seen = await ids(A, `select id from public.profiles`);
check('you can see yourself and your friends', seen.includes(A) && seen.includes(B));
check("you can't list strangers' profiles", !seen.includes(C) && !seen.includes(D));
await as(B, `select public.send_roam('Pub quiz', 'drinks', null, now() + interval '1 hour', now() + interval '3 hours', null, array['${A}', '${D}']::uuid[])`);
seen = await ids(A, `select id from public.profiles`);
check('you can see people on the same Roam', seen.includes(D) && !seen.includes(C));
check('signed-out callers see no profiles', (await as(null, `select id from public.profiles`)).rows.length === 0);

// Friend codes and invite links
const byCode = (await as(C, `select * from public.find_by_friend_code('3F9A12BC')`)).rows;
check('a friend code finds exactly that person', byCode.length === 1 && byCode[0].id === A);
check('a wrong friend code finds nobody', (await as(C, `select * from public.find_by_friend_code('ffffffff')`)).rows.length === 0);
check('an invite link shows that one person', (await as(C, `select * from public.profile_for_invite('${A}')`)).rows[0]?.display_name === 'Nate');
await as(A, `select public.block_user('${C}')`);
check("a friend code can't find someone who blocked you", (await as(C, `select * from public.find_by_friend_code('3F9A12BC')`)).rows.length === 0);
check("an invite link can't show someone who blocked you", (await as(C, `select * from public.profile_for_invite('${A}')`)).rows.length === 0);
check('you can still see people you blocked (to unblock them)', (await ids(A, `select id from public.profiles`)).includes(C));
await as(A, `select public.unblock_user('${C}')`);
await expectError("signed-out callers can't use friend codes", null, `select * from public.find_by_friend_code('3F9A12BC')`, 'permission denied');

// 2. Profile edits
await as(A, `update public.profiles set display_name = 'Nate L' where id = '${A}'`);
check('you can change your name', (await db.query(`select display_name from public.profiles where id = '${A}'`)).rows[0].display_name === 'Nate L');
await expectError("you can't change other columns", A, `update public.profiles set created_at = now() - interval '9 years' where id = '${A}'`, 'permission denied');
await expectError('outside photo links are rejected', A, `update public.profiles set avatar_url = 'https://evil.example/pixel.gif' where id = '${A}'`, 'invalid_avatar');
await expectError("another person's photo is rejected", A,
  `update public.profiles set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/avatars/${B}/a.jpg' where id = '${A}'`, 'invalid_avatar');
await as(A, `update public.profiles set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/avatars/${A}/avatar-1.jpg' where id = '${A}'`);
check('your own uploaded photo is accepted', !!(await db.query(`select avatar_url from public.profiles where id = '${A}'`)).rows[0].avatar_url);
await as(B, `update public.profiles set display_name = 'Hacked' where id = '${A}'`);
check("you can't edit someone else's profile", (await db.query(`select display_name from public.profiles where id = '${A}'`)).rows[0].display_name === 'Nate L');

// 3. Friendship / block checks are internal
await expectError("can't check whether any two people are friends", C, `select public.are_friends('${A}', '${B}')`, 'permission denied');
await expectError("can't check who blocked whom", C, `select public.is_blocked_between('${A}', '${B}')`, 'permission denied');
const crew = (await as(A, `insert into public.crews (name) values ('Uni lot') returning id`)).rows[0].id;
await as(A, `insert into public.crew_members (crew_id, member_id) values ('${crew}', '${B}')`);
check('you can still put friends in circles', true);
await expectError("you can't put strangers in circles", A, `insert into public.crew_members (crew_id, member_id) values ('${crew}', '${C}')`, 'row-level security');

// 4. Friend requests are rate limited
await db.exec(`insert into auth.users (id) select gen_random_uuid() from generate_series(1, 31);
  update public.profiles set display_name = 'Bot' where display_name is null;`);
const bots = (await db.query(`select id from public.profiles where display_name = 'Bot'`)).rows.map((r) => r.id);
let limited = false;
for (const bot of bots) {
  try { await as(C, `select public.add_friend('${bot}')`); } catch (e) { limited = e.message.includes('too_many_requests'); break; }
}
check('friend requests stop after 30 an hour', limited);
await expectError("can't send a request to an account that doesn't exist", B, `select public.add_friend(gen_random_uuid())`, 'invalid_friend');

// 5 + 6. Removed leftovers
check('phone-number lookup is gone', (await db.query(`select count(*)::int n from pg_proc where proname = 'match_contacts'`)).rows[0].n === 0);
check('test SMS codes table is gone', (await db.query(`select to_regclass('public.dev_sms_codes') t`)).rows[0].t === null);

// Audit: every table has row level security
const noRls = (await db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)).rows.map((r) => r.relname);
check(`every table has row level security${noRls.length ? ` (missing: ${noRls})` : ''}`, noRls.length === 0);

// Audit: what can be called. Signed-out: nothing. Signed-in: only the app's own functions.
const callable = async (role) => (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype and has_function_privilege('${role}', p.oid, 'execute')
  order by 1`)).rows.map((r) => r.proname);
const anonCan = await callable('anon');
check(`signed-out callers can't call any function${anonCan.length ? ` (can: ${anonCan})` : ''}`, anonCan.length === 0);
const allowed = new Set(['add_friend', 'block_user', 'can_see_profile', 'crew_last_roamed', 'decide_invite_request', 'delete_my_account',
  'find_by_friend_code', 'host_cant_make_it', 'is_my_friend', 'is_on_open_roam', 'is_on_roam', 'is_roam_host', 'pitch_open_roam_idea',
  'profile_for_invite', 'report', 'request_invite', 'resolve_open_roam', 'respond_to_roam', 'send_roam', 'start_open_roam', 'take_over_roam',
  'toggle_open_roam_idea_vote', 'unblock_user', 'update_roam', 'vote_open_roam']);
const extra = (await callable('authenticated')).filter((f) => !allowed.has(f));
check(`signed-in users can only call the app's functions${extra.length ? ` (also: ${extra})` : ''}`, extra.length === 0);

// Photo storage: your own folder only
await db.exec(`grant usage on schema storage to authenticated; grant select, insert, delete on storage.objects to authenticated;
  insert into storage.objects (bucket_id, name) values ('avatars', '${A}/avatar-1.jpg'), ('avatars', '${B}/avatar-2.jpg');`);
const files = (await as(A, `select name from storage.objects`)).rows.map((r) => r.name);
check('you can list your own photos (so old ones can be deleted)', files.includes(`${A}/avatar-1.jpg`));
check("you can't list other people's photos", !files.some((f) => f.startsWith(B)));
await expectError("you can't upload into someone else's folder", A, `insert into storage.objects (bucket_id, name) values ('avatars', '${B}/x.jpg')`, 'row-level security');
await as(A, `delete from storage.objects where name = '${B}/avatar-2.jpg'`);
check("you can't delete someone else's photo", (await db.query(`select count(*)::int n from storage.objects where name = '${B}/avatar-2.jpg'`)).rows[0].n === 1);

// Running the file twice is safe
await db.exec(migrationSql('20261103000000_security_hardening'));
check('the hardening file can be run again', true);

done();
