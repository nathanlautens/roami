// Checks the fixes from the October code review. Run: npm run test:fixes
import { setup, as, check, expectError, one, migrationSql, done } from './harness.mjs';

const db = await setup({
  migrations: [
    '20261014200000_initial_schema',
    '20261014230000_mock_friends',
    '20261015000000_open_roams',
    '20261016210000_release_ready',
    '20261016220000_safety_and_push',
    '20261025000000_bug_fixes',
  ],
});


const A = '00000000-0000-0000-0000-00000000000a'; // Nate
const B = '00000000-0000-0000-0000-00000000000b'; // Jo
const C = '00000000-0000-0000-0000-00000000000c'; // Sam
const D = '00000000-0000-0000-0000-00000000000d'; // Dee
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}'), ('${C}'), ('${D}');
  update public.profiles set display_name = 'Nate' where id = '${A}';
  update public.profiles set display_name = 'Jo' where id = '${B}';
  update public.profiles set display_name = 'Sam' where id = '${C}';
  update public.profiles set display_name = 'Dee' where id = '${D}';`);


// Everyone is friends with Nate; Jo and Sam are friends too.
for (const [x, y] of [[A, B], [A, C], [A, D], [B, C]]) {
  await as(x, `select public.add_friend('${y}')`);
  await as(y, `select public.add_friend('${x}')`);
}

// 1. A push for someone with no phone doesn't jam the queue
await db.exec(`insert into public.notifications (user_id, title, body) select '${D}', 'x', 'y' from generate_series(1, 150)`);
await db.query('select public.send_due_pushes()');
await db.query('select public.send_due_pushes()');
check('pushes for people with no phone are cleared, not stuck', (await one(`select count(*)::int n from public.notifications where sent_at is null`)).n === 0);

// 2. Same phone, new account: only the signed-in person keeps the token
await as(A, `insert into public.push_tokens (user_id, token) values ('${A}', 'ExponentPushToken[shared]')`);
await as(B, `insert into public.push_tokens (user_id, token) values ('${B}', 'ExponentPushToken[shared]')`);
const owners = (await db.query(`select user_id from public.push_tokens where token = 'ExponentPushToken[shared]'`)).rows;
check("a phone's pushes follow whoever signed in last", owners.length === 1 && owners[0].user_id === B);

// 3. Buzzer: people who picked another night get the locked-in push
await db.exec(`insert into public.push_tokens (user_id, token) values ('${C}', 'ExponentPushToken[c]') on conflict (user_id) do update set token = excluded.token`);
const open = (await as(A, `select public.start_open_roam(array[now() + interval '2 days', now() + interval '3 days']::timestamptz[], now() + interval '1 hour', array['${B}', '${C}']::uuid[]) id`)).rows[0].id;
const nights = (await db.query(`select night_start from public.open_roam_nights where open_roam_id = '${open}' order by night_start`)).rows.map((r) => r.night_start.toISOString());
await as(B, `select public.vote_open_roam('${open}', array['${nights[0]}']::timestamptz[], array['food'])`);
await as(C, `select public.vote_open_roam('${open}', array['${nights[1]}']::timestamptz[], array[]::text[])`);
await db.exec(`delete from public.notifications; update public.open_roams set buzzer_at = now() - interval '1 minute' where id = '${open}'`);
await db.query(`select public.resolve_due_open_roams()`);
const samPush = await one(`select title from public.notifications where user_id = '${C}' order by id limit 1`);
check('someone who picked another night gets "BZZZT! It\'s locked in"', samPush?.title === "BZZZT! It's locked in");

// 4. Blocks and "can I bring someone?"
const roam = (await as(A, `select public.send_roam('Pub quiz', 'drinks', null, now() + interval '1 hour', now() + interval '4 hours', 1, array['${B}', '${C}']::uuid[]) id`)).rows[0].id;
await as(D, `select public.block_user('${A}')`);
// Dee blocked Nate, so they're not friends any more; Jo is friends with Dee? Make them friends to try the loophole.
await as(B, `select public.add_friend('${D}')`); await as(D, `select public.add_friend('${B}')`);
await expectError("can't bring someone into the Roam of a person who blocked them", B, `select public.request_invite('${roam}', '${D}')`, 'not_friends');

// Blocking removes you from each other's open votes
const open2 = (await as(A, `select public.start_open_roam(array[now() + interval '4 days']::timestamptz[], now() + interval '1 hour', array['${B}', '${C}']::uuid[]) id`)).rows[0].id;
await as(C, `select public.block_user('${A}')`);
check("blocking removes you from the other person's open votes",
  (await one(`select count(*)::int n from public.open_roam_invites where open_roam_id = '${open2}' and user_id = '${C}'`)).n === 0);

// 5. Spots: the Roam has 1 spot
await as(B, `select public.respond_to_roam('${roam}', 'in')`);
check('a full Roam stays full', (await one(`select count(*)::int n from public.roam_invites where roam_id = '${roam}' and response = 'in'`)).n === 2);

// 6. Up for grabs and the last person leaves: called off
await as(A, `select public.host_cant_make_it('${roam}', null)`);
check('host bailing with someone In puts it up for grabs', (await one(`select status from public.roams where id = '${roam}'`)).status === 'up_for_grabs');
await as(B, `select public.respond_to_roam('${roam}', 'cant')`);
check('when the last person leaves, it is called off', (await one(`select status from public.roams where id = '${roam}'`)).status === 'cancelled');

// 7. Requests on a Roam that's over / deciding twice
await expectError("can't ask to bring someone to a called-off Roam", B, `select public.request_invite('${roam}', '${C}')`, 'roam_cancelled');
const roam2 = (await as(A, `select public.send_roam('Tacos', 'food', null, now() + interval '1 hour', now() + interval '3 hours', null, array['${B}']::uuid[]) id`)).rows[0].id;
await as(D, `select public.unblock_user('${A}')`);
await as(A, `select public.add_friend('${D}')`); await as(D, `select public.add_friend('${A}')`);
await as(B, `select public.request_invite('${roam2}', '${D}')`);
const req = (await db.query(`select id from public.invite_requests where roam_id = '${roam2}'`)).rows[0].id;
await as(A, `select public.decide_invite_request('${req}', false)`);
await as(A, `select public.decide_invite_request('${req}', true)`);
check('a declined request stays declined', (await one(`select count(*)::int n from public.roam_invites where roam_id = '${roam2}' and user_id = '${D}'`)).n === 0);

// 8. Unfriending leaves circles
const crew = (await as(A, `insert into public.crews (name) values ('Uni lot') returning id`)).rows[0].id;
await as(A, `insert into public.crew_members (crew_id, member_id) values ('${crew}', '${D}')`);
await as(D, `delete from public.friendships where '${A}' in (requester_id, addressee_id) and '${D}' in (requester_id, addressee_id)`);
check('unfriending takes them out of your circles', (await one(`select count(*)::int n from public.crew_members where crew_id = '${crew}'`)).n === 0);

// 9. Editing a Roam checks the times
await expectError("can't move a Roam more than 7 days out", A,
  `select public.update_roam('${roam2}', 'Tacos', null, now() + interval '10 days', now() + interval '10 days 2 hours')`, 'too_far_ahead');
await expectError("can't edit a called-off Roam", A,
  `select public.update_roam('${roam}', 'Pub quiz', null, now() + interval '1 hour', now() + interval '2 hours')`, 'roam_over');

// Running the file twice is safe
await db.exec(migrationSql('20261025000000_bug_fixes'));
check('the fix file can be run again', true);

done();
