-- Block & report, and server-sent push notifications.
--
-- Before running: Database -> Extensions -> enable pg_net (sends the pushes)
-- and pg_cron (if you haven't already). Then run this in SQL Editor.

-- ═════════════════════════════════════════════════════════════
-- BLOCK & REPORT
-- ═════════════════════════════════════════════════════════════
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid references public.profiles (id) on delete set null,
  roam_id uuid references public.roams (id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'fake', 'other')),
  details text check (char_length(details) <= 500),
  -- open: needs a look · actioned: dealt with · dismissed: no action needed
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table public.blocks enable row level security;
alter table public.reports enable row level security;

create policy "you see who you've blocked" on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy "you see your own reports" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- Block someone: unfriends them, takes them out of your circles (and you out
-- of theirs), and removes each of you from the other's upcoming Roams.
create or replace function public.block_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_user is null or p_user = me then raise exception 'invalid_user'; end if;

  insert into public.blocks (blocker_id, blocked_id) values (me, p_user) on conflict do nothing;

  delete from public.friendships
  where least(requester_id, addressee_id) = least(me, p_user)
    and greatest(requester_id, addressee_id) = greatest(me, p_user);

  delete from public.crew_members m using public.crews c
  where m.crew_id = c.id
    and ((c.owner_id = me and m.member_id = p_user) or (c.owner_id = p_user and m.member_id = me));

  delete from public.roam_invites i using public.roams r
  where i.roam_id = r.id and r.ends_at > now()
    and ((r.host_id = me and i.user_id = p_user) or (r.host_id = p_user and i.user_id = me));

  delete from public.invite_requests
  where (requester_id = me and invitee_id = p_user) or (requester_id = p_user and invitee_id = me);
end;
$$;

create or replace function public.unblock_user(p_user uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_user;
$$;

-- Report a person and/or a Roam. Reports land in public.reports for you to
-- review in the dashboard (Table Editor -> reports).
create or replace function public.report(p_user uuid, p_roam uuid, p_reason text, p_details text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_user is null and p_roam is null then raise exception 'nothing_to_report'; end if;
  if p_roam is not null and not public.is_on_roam(p_roam) then raise exception 'not_invited'; end if;
  if (select count(*) from public.reports where reporter_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_reports';
  end if;

  insert into public.reports (reporter_id, reported_user_id, roam_id, reason, details)
  values (me, p_user, p_roam, p_reason, nullif(trim(coalesce(p_details, '')), ''))
  returning id into new_id;
  return new_id;
end;
$$;

-- Friend requests respect blocks (either direction). Same as before otherwise.
create or replace function public.add_friend(p_target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  existing public.friendships;
begin
  if me is null or p_target is null or p_target = me then
    raise exception 'invalid_friend';
  end if;
  if public.is_blocked_between(me, p_target) then raise exception 'blocked'; end if;

  select * into existing from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(me, p_target)
    and greatest(f.requester_id, f.addressee_id) = greatest(me, p_target);

  if not found then
    insert into public.friendships (requester_id, addressee_id) values (me, p_target);
    return 'requested';
  elsif existing.status = 'accepted' then
    return 'accepted';
  elsif existing.addressee_id = me then
    update public.friendships set status = 'accepted' where id = existing.id;
    return 'accepted';
  else
    return 'requested';
  end if;
end;
$$;

revoke execute on function public.is_blocked_between(uuid, uuid), public.block_user(uuid), public.unblock_user(uuid),
  public.report(uuid, uuid, text, text) from public, anon;
grant execute on function public.block_user(uuid), public.unblock_user(uuid), public.report(uuid, uuid, text, text),
  public.is_blocked_between(uuid, uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════
-- PUSH NOTIFICATIONS
-- ═════════════════════════════════════════════════════════════
alter table public.push_tokens add column if not exists time_zone text;
alter table public.roams add column if not exists reminded_at timestamptz;

create table public.notifications (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_due_idx on public.notifications (send_after) where sent_at is null;

-- Internal only: no policies, so the app can't read or write it.
alter table public.notifications enable row level security;

-- The recipient's time zone (from their phone), London if we don't know.
create or replace function public.user_tz(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select time_zone from public.push_tokens where user_id = p_user and time_zone in (select name from pg_timezone_names)),
    'Europe/London'
  );
$$;

-- "tonight 7pm", "tomorrow 12:30pm", "Fri 7pm", in the recipient's time zone.
create or replace function public.friendly_when(p_at timestamptz, p_user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  tz text := public.user_tz(p_user);
  local_at timestamp := p_at at time zone tz;
  today date := (now() at time zone tz)::date;
  clock text := lower(replace(to_char(local_at, 'FMHH12:MIam'), ':00', ''));
begin
  if local_at::date = today then
    return (case when extract(hour from local_at) >= 17 then 'tonight ' else 'today ' end) || clock;
  elsif local_at::date = today + 1 then
    return 'tomorrow ' || clock;
  else
    return to_char(local_at, 'Dy') || ' ' || clock;
  end if;
end;
$$;

-- Queue a push. Quiet hours: nothing between midnight and 8am in the
-- recipient's time zone unless it's urgent (a Roam starting very soon).
create or replace function public.queue_push(p_user uuid, p_title text, p_body text, p_data jsonb default '{}', p_urgent boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  tz text;
  local_now timestamp;
  send_at timestamptz := now();
begin
  if p_user is null then return; end if;
  if not exists (select 1 from public.push_tokens where user_id = p_user) then return; end if;

  tz := public.user_tz(p_user);
  local_now := now() at time zone tz;
  if not p_urgent and extract(hour from local_now) < 8 then
    send_at := (date_trunc('day', local_now) + interval '8 hours') at time zone tz;
  end if;

  insert into public.notifications (user_id, title, body, data, send_after)
  values (p_user, p_title, p_body, p_data, send_at);
end;
$$;

create or replace function public.display_name_of(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from public.profiles where id = p_user), 'Someone');
$$;

-- ─── Triggers: when things happen, queue the right pushes ───────

-- New invite (sent Roam, approved "bring someone", or a buzzer lock for
-- people who didn't pick that night).
create or replace function public.push_on_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.roams;
begin
  select * into r from public.roams where id = new.roam_id;
  if new.user_id = r.host_id or new.response is not null then return null; end if;
  if exists (select 1 from public.open_roams o where o.locked_roam_id = r.id) then
    perform public.queue_push(new.user_id, 'BZZZT! It''s locked in',
      format('%s is %s. You in?', r.what, public.friendly_when(r.starts_at, new.user_id)),
      jsonb_build_object('url', '/roam/' || r.id));
    return null;
  end if;
  perform public.queue_push(
    new.user_id,
    format('%s''s free %s', public.display_name_of(r.host_id), public.friendly_when(r.starts_at, new.user_id)),
    format('%s. You in?', r.what),
    jsonb_build_object('url', '/roam/' || r.id),
    r.starts_at < now() + interval '3 hours'
  );
  return null;
end;
$$;

create trigger push_on_invite after insert on public.roam_invites
  for each row execute function public.push_on_invite();

-- Someone says In, or bails.
create or replace function public.push_on_response()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.roams;
  who text := public.display_name_of(new.user_id);
begin
  select * into r from public.roams where id = new.roam_id;
  if new.user_id = r.host_id or r.status = 'cancelled' then return null; end if;

  if new.response = 'in' and old.response is distinct from 'in' then
    perform public.queue_push(r.host_id, format('%s''s in!', who),
      format('%s. It''s a date (sort of).', r.what), jsonb_build_object('url', '/roam/' || r.id));
  elsif old.response = 'in' and new.response is distinct from 'in' then
    perform public.queue_push(r.host_id, format('%s had to bail', who),
      format('%s. Their loss.', r.what), jsonb_build_object('url', '/roam/' || r.id));
  end if;
  return null;
end;
$$;

create trigger push_on_response after update of response on public.roam_invites
  for each row execute function public.push_on_response();

-- Host can't make it, called off, taken over, or the plan changed.
create or replace function public.push_on_roam_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  u record;
  host text := public.display_name_of(new.host_id);
  link jsonb := jsonb_build_object('url', '/roam/' || new.id);
begin
  if new.status = 'up_for_grabs' and old.status <> 'up_for_grabs' then
    for u in select user_id from public.roam_invites where roam_id = new.id and response = 'in' and user_id <> new.host_id loop
      perform public.queue_push(u.user_id, format('%s can''t make it', host),
        format('%s is up for grabs. Take the wheel?', new.what), link);
    end loop;
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    for u in select user_id from public.roam_invites where roam_id = new.id and response in ('in', 'maybe') and user_id <> new.host_id loop
      perform public.queue_push(u.user_id, format('%s called off %s', host, new.what),
        coalesce(new.bail_note, 'Rain check?'), link);
    end loop;
  elsif new.host_id <> old.host_id then
    for u in select user_id from public.roam_invites where roam_id = new.id and response = 'in' and user_id <> new.host_id loop
      perform public.queue_push(u.user_id, format('%s took the wheel', host),
        format('%s is back on.', new.what), link);
    end loop;
  elsif new.starts_at <> old.starts_at or new.what <> old.what or new.location is distinct from old.location then
    for u in select user_id from public.roam_invites where roam_id = new.id and response in ('in', 'maybe') and user_id <> new.host_id loop
      perform public.queue_push(u.user_id, format('%s updated the plan', host),
        format('%s · %s%s', new.what, public.friendly_when(new.starts_at, u.user_id),
          case when new.location is not null then ' · ' || new.location else '' end), link);
    end loop;
  end if;
  return null;
end;
$$;

create trigger push_on_roam_change after update on public.roams
  for each row execute function public.push_on_roam_change();

-- Friend requests.
create or replace function public.push_on_friendship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.queue_push(new.addressee_id, format('%s wants to roam with you', public.display_name_of(new.requester_id)),
      'Add them back?', jsonb_build_object('url', '/friends'));
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    perform public.queue_push(new.requester_id, format('%s added you back', public.display_name_of(new.addressee_id)),
      'Go throw out a Roam.', jsonb_build_object('url', '/'));
  end if;
  return null;
end;
$$;

create trigger push_on_friendship after insert or update on public.friendships
  for each row execute function public.push_on_friendship();

-- "Can I bring someone?"
create or replace function public.push_on_invite_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.roams;
begin
  select * into r from public.roams where id = new.roam_id;
  perform public.queue_push(r.host_id, format('%s wants to bring %s', public.display_name_of(new.requester_id), public.display_name_of(new.invitee_id)),
    format('%s. Yay or nay?', r.what), jsonb_build_object('url', '/roam/' || r.id));
  return null;
end;
$$;

create trigger push_on_invite_request after insert on public.invite_requests
  for each row execute function public.push_on_invite_request();

-- Open Roams: invited to vote, and the buzzer result.
create or replace function public.push_on_open_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o public.open_roams;
begin
  select * into o from public.open_roams where id = new.open_roam_id;
  if new.user_id = o.host_id or new.voted_at is not null then return null; end if;
  perform public.queue_push(new.user_id, format('%s''s free a few nights', public.display_name_of(o.host_id)),
    format('Pick a night before the buzzer (%s).', public.friendly_when(o.buzzer_at, new.user_id)),
    jsonb_build_object('url', '/open/' || o.id));
  return null;
end;
$$;

create trigger push_on_open_invite after insert on public.open_roam_invites
  for each row execute function public.push_on_open_invite();

create or replace function public.push_on_buzzer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  u record;
begin
  if new.status = 'locked' and old.status = 'open' then
    for u in
      select i.user_id from public.open_roam_invites i
      where i.open_roam_id = new.id
        and (i.user_id = new.host_id or exists (
          select 1 from public.open_roam_night_votes v
          where v.open_roam_id = new.id and v.user_id = i.user_id and v.night_start = new.winning_night))
    loop
      perform public.queue_push(u.user_id,
        format('BZZZT! It''s %s', trim(to_char(new.winning_night at time zone public.user_tz(u.user_id), 'Day'))),
        format('%s · %s. You''re locked in.',
          coalesce(new.winning_idea, initcap(coalesce(new.winning_vibe, 'hang')) || ' night'),
          public.friendly_when(new.winning_night, u.user_id)),
        jsonb_build_object('url', '/roam/' || new.locked_roam_id));
    end loop;
  end if;
  return null;
end;
$$;

create trigger push_on_buzzer after update of status on public.open_roams
  for each row execute function public.push_on_buzzer();

-- ─── Sending (every minute) ─────────────────────────────────────

-- "Starts in 30": a nudge to the host and everyone In.
create or replace function public.queue_starting_soon()
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.roams;
  u record;
  n int := 0;
begin
  for r in
    select * from public.roams
    where status = 'live' and reminded_at is null
      and starts_at between now() + interval '20 minutes' and now() + interval '35 minutes'
  loop
    update public.roams set reminded_at = now() where id = r.id;
    for u in select user_id from public.roam_invites where roam_id = r.id and response = 'in' loop
      perform public.queue_push(u.user_id, format('%s in 30', r.what), 'Look cute. See you there.',
        jsonb_build_object('url', '/roam/' || r.id), true);
    end loop;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Sends due pushes through Expo's push service (via pg_net). Returns how many.
create or replace function public.send_due_pushes()
returns int language plpgsql security definer set search_path = public as $$
declare
  batch jsonb;
  ids bigint[];
begin
  perform public.queue_starting_soon();

  select coalesce(jsonb_agg(jsonb_build_object(
           'to', t.token, 'title', n.title, 'body', n.body, 'data', n.data, 'sound', 'default', 'channelId', 'default')), '[]'),
         coalesce(array_agg(n.id), '{}')
    into batch, ids
  from (
    select * from public.notifications
    where sent_at is null and send_after <= now()
    order by send_after
    limit 100
  ) n
  join public.push_tokens t on t.user_id = n.user_id;

  if array_length(ids, 1) is null then return 0; end if;

  if exists (select 1 from pg_extension where extname = 'pg_net') then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := batch,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  else
    raise warning 'pg_net is not enabled, so pushes are queued but not sent.';
    return 0;
  end if;

  update public.notifications set sent_at = now() where id = any (ids);
  delete from public.notifications where created_at < now() - interval '7 days';
  return array_length(ids, 1);
end;
$$;

revoke execute on function public.user_tz(uuid), public.friendly_when(timestamptz, uuid),
  public.queue_push(uuid, text, text, jsonb, boolean), public.display_name_of(uuid),
  public.queue_starting_soon(), public.send_due_pushes()
from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'roami-push';
    perform cron.schedule('roami-push', '* * * * *', 'select public.send_due_pushes()');
  else
    raise warning 'pg_cron is not enabled: pushes will be queued but not sent. Enable it under Database -> Extensions, then run this file again.';
  end if;
end;
$$;
