-- ─────────────────────────────────────────────────────────────
-- Performance: indexes for the lookups the app and the jobs make
--
-- Postgres doesn't index foreign keys on its own. Without these, privacy
-- rules (RLS) that filter on a column, the every-minute jobs (buzzer,
-- reminders, push cleanup), rate limits and cascading deletes (deleting an
-- account, blocking someone) scan whole tables, which gets slower with every
-- user.
--
-- Run in SQL Editor after the earlier files. Safe to run more than once.
-- ─────────────────────────────────────────────────────────────

-- Friendships: "you see your own friendships" filters on either side.
-- Requester + created_at also serves the friend-request rate limit.
create index if not exists friendships_requester_idx on public.friendships (requester_id, created_at);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

-- Circles: private to their owner; members are removed when unfriended or blocked.
create index if not exists crews_owner_idx on public.crews (owner_id);
create index if not exists crew_members_member_idx on public.crew_members (member_id);

-- Roams: the 5-active-Roams limit counts by host; the "starting in 30" job
-- scans live Roams by start time every minute.
create index if not exists roams_host_idx on public.roams (host_id, ends_at);
create index if not exists roams_reminder_due_idx on public.roams (starts_at)
  where status = 'live' and reminded_at is null;

-- "Can they come too?" requests are loaded per Roam.
create index if not exists invite_requests_roam_idx on public.invite_requests (roam_id) where status = 'pending';
create index if not exists invite_requests_requester_idx on public.invite_requests (requester_id);
create index if not exists invite_requests_invitee_idx on public.invite_requests (invitee_id);

-- Open Roams: the buzzer job looks for open votes whose buzzer has gone off, every minute.
create index if not exists open_roams_due_idx on public.open_roams (buzzer_at) where status = 'open';
create index if not exists open_roams_host_idx on public.open_roams (host_id);
create index if not exists open_roams_locked_roam_idx on public.open_roams (locked_roam_id) where locked_roam_id is not null;
create index if not exists open_roam_ideas_open_idx on public.open_roam_ideas (open_roam_id);
create index if not exists open_roam_ideas_author_idx on public.open_roam_ideas (author_id);
create index if not exists open_roam_idea_votes_user_idx on public.open_roam_idea_votes (user_id);
-- Votes cascade when a night is removed; the primary key starts (open_roam_id, user_id).
create index if not exists open_roam_night_votes_night_idx on public.open_roam_night_votes (open_roam_id, night_start);

-- Safety: "is either of us blocked?" checks both directions; reports are rate limited per reporter.
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);
create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at);
create index if not exists reports_reported_user_idx on public.reports (reported_user_id) where reported_user_id is not null;
create index if not exists reports_roam_idx on public.reports (roam_id) where roam_id is not null;

-- Push queue: per-person lookups, and the job deletes week-old rows every minute.
create index if not exists notifications_user_idx on public.notifications (user_id);
create index if not exists notifications_created_idx on public.notifications (created_at);
