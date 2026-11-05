// Performance indexes: present, re-runnable, and usable by the queries they're for.
// Run: node supabase/tests/indexes.test.mjs
import { harness, migration } from './harness.mjs';

const { db, check, done } = await harness(['20261014200000_initial_schema', '20261014210000_dev_sms_hook', '20261014230000_mock_friends', '20261015000000_open_roams', '20261016210000_release_ready', '20261016220000_safety_and_push', '20261025000000_bug_fixes', '20261103000000_security_hardening', '20261105000000_performance_indexes']);

// Safe to run again.
try {
  await db.exec(migration('20261105000000_performance_indexes'));
  check('the index file can be run again', true);
} catch (e) {
  check(`the index file can be run again (${e.message})`, false);
}

const sql = migration('20261105000000_performance_indexes');
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

done();
