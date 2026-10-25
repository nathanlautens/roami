-- Bug fixes from the October code review. Run once in SQL Editor, after the
-- earlier migrations. Safe to run again.
--
--  1. Pushes: one notification for someone whose phone has since logged out
--     could jam the queue for everyone. Now every due push is cleared, and
--     only people with a phone get sent one.
--  2. Pushes: if two people use Roami on the same phone, only the person
--     currently signed in gets that phone's pushes.
--  3. Buzzer: people who didn't vote for the winning night now get the
--     "BZZZT! It's locked in" push instead of a generic invite.
--  4. Blocks: "Can I bring someone?" can't be used to bring a person into the
--     Roam of someone who blocked them (or they blocked). Blocking also
--     removes each of you from the other's open votes.
--  5. Spots: two people tapping In at the same moment can't overfill a Roam.
--  6. Up for grabs: if the last person who's In leaves, the Roam is called off
--     instead of waiting forever for a host.
--  7. Requests: can't ask to bring someone to a Roam that's over or called off,
--     and a request can only be decided once.
--  8. Unfriending takes you out of each other's circles.
--  9. Editing a Roam: times are checked like a new Roam.

-- ─── 1. Push queue ──────────────────────────────────────────────
create or replace function public.send_due_pushes()
returns int language plpgsql security definer set search_path = public as $$
declare
  batch jsonb;
  due bigint[];
  sendable int;
begin
  perform public.queue_starting_soon();

  select coalesce(array_agg(id), '{}') into due
  from (
    select id from public.notifications
    where sent_at is null and send_after <= now()
    order by send_after
    limit 100
    for update skip locked
  ) d;

  if array_length(due, 1) is null then return 0; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'to', t.token, 'title', n.title, 'body', n.body, 'data', n.data, 'sound', 'default', 'channelId', 'default')), '[]'),
         count(*)
    into batch, sendable
  from public.notifications n
  join public.push_tokens t on t.user_id = n.user_id
  where n.id = any (due);

  if sendable > 0 then
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
  end if;

  -- Cleared either way: a push for someone with no phone can't be sent later either.
  update public.notifications set sent_at = now() where id = any (due);
  delete from public.notifications where created_at < now() - interval '7 days';
  return sendable;
end;
$$;

revoke execute on function public.send_due_pushes() from public, anon, authenticated;

-- ─── 2. One phone, one account ──────────────────────────────────
create or replace function public.push_token_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_tokens where token = new.token and user_id <> new.user_id;
  return new;
end;
$$;

revoke execute on function public.push_token_owner() from public, anon, authenticated;

drop trigger if exists push_token_owner on public.push_tokens;
create trigger push_token_owner before insert or update of token on public.push_tokens
  for each row execute function public.push_token_owner();

-- ─── 3. Buzzer push for people who picked another night ─────────
-- Same as before, except the open Roam points at its new Roam *before* the
-- invites go in, so the invite push knows it came from the buzzer.
create or replace function public.lock_open_roam(p_open uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  o public.open_roams;
  win timestamptz;
  win_vibe text;
  win_idea text;
  what text;
  rid uuid;
begin
  select * into o from public.open_roams where id = p_open for update;
  if not found then raise exception 'not_found'; end if;
  if o.status = 'locked' then return o.locked_roam_id; end if;
  if o.status = 'expired' then return null; end if;
  if now() < o.buzzer_at then raise exception 'too_early'; end if;

  select n.night_start into win
  from public.open_roam_nights n
  where n.open_roam_id = p_open and n.night_start + interval '5 hours' > now()
  order by
    (select count(*) from public.open_roam_night_votes v
      where v.open_roam_id = p_open and v.night_start = n.night_start) desc,
    (select count(*) from public.open_roam_vibe_votes vv
      join public.open_roam_night_votes v on v.open_roam_id = vv.open_roam_id and v.user_id = vv.user_id
      where vv.open_roam_id = p_open and v.night_start = n.night_start) desc,
    n.night_start asc
  limit 1;

  if win is null then
    update public.open_roams set status = 'expired' where id = p_open;
    return null;
  end if;

  select vibe into win_vibe
  from public.open_roam_vibe_votes
  where open_roam_id = p_open
  group by vibe
  order by count(*) desc, array_position(array['drinks', 'food', 'chill', 'active', 'chaos', 'quiet'], vibe)
  limit 1;

  select i.text into win_idea
  from public.open_roam_ideas i
  left join public.open_roam_idea_votes v on v.idea_id = i.id
  where i.open_roam_id = p_open
  group by i.id, i.text, i.created_at
  order by count(v.user_id) desc, i.created_at asc
  limit 1;

  what := coalesce(win_idea, initcap(coalesce(win_vibe, 'hang')) || ' night');

  insert into public.roams (host_id, what, vibe, starts_at, ends_at)
  values (o.host_id, what, win_vibe, win, win + interval '5 hours')
  returning id into rid;

  update public.open_roams set locked_roam_id = rid where id = p_open;

  insert into public.roam_invites (roam_id, user_id, response, responded_at)
  select rid, i.user_id,
    case when i.user_id = o.host_id or exists (
      select 1 from public.open_roam_night_votes v
      where v.open_roam_id = p_open and v.user_id = i.user_id and v.night_start = win
    ) then 'in' end,
    case when i.user_id = o.host_id or exists (
      select 1 from public.open_roam_night_votes v
      where v.open_roam_id = p_open and v.user_id = i.user_id and v.night_start = win
    ) then now() end
  from public.open_roam_invites i
  where i.open_roam_id = p_open;

  update public.open_roams
  set status = 'locked', winning_night = win, winning_vibe = win_vibe, winning_idea = win_idea
  where id = p_open;

  return rid;
end;
$$;

revoke execute on function public.lock_open_roam(uuid) from public, anon, authenticated;

-- ─── 4 + 7. "Can I bring someone?" ──────────────────────────────
create or replace function public.request_invite(p_roam uuid, p_friend uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.roams;
begin
  select * into r from public.roams where id = p_roam;
  if not found or not public.is_on_roam(p_roam) then raise exception 'not_invited'; end if;
  if r.status = 'cancelled' then raise exception 'roam_cancelled'; end if;
  if r.ends_at <= now() then raise exception 'roam_over'; end if;
  if not public.are_friends(me, p_friend) then raise exception 'not_friends'; end if;
  if public.is_blocked_between(r.host_id, p_friend) then raise exception 'not_friends'; end if;
  if exists (select 1 from public.roam_invites i where i.roam_id = p_roam and i.user_id = p_friend) then
    raise exception 'already_invited';
  end if;

  insert into public.invite_requests (roam_id, requester_id, invitee_id)
  values (p_roam, me, p_friend)
  on conflict (roam_id, invitee_id) do nothing;
end;
$$;

create or replace function public.decide_invite_request(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  req public.invite_requests;
  r public.roams;
begin
  select * into req from public.invite_requests where id = p_request for update;
  if not found or not public.is_roam_host(req.roam_id) then raise exception 'not_host'; end if;
  if req.status <> 'pending' then return; end if;

  select * into r from public.roams where id = req.roam_id;
  if p_approve and (r.status = 'cancelled' or r.ends_at <= now()) then raise exception 'roam_over'; end if;
  if p_approve and public.is_blocked_between(r.host_id, req.invitee_id) then
    p_approve := false;
  end if;

  update public.invite_requests
  set status = case when p_approve then 'approved' else 'declined' end
  where id = p_request;

  if p_approve then
    insert into public.roam_invites (roam_id, user_id) values (req.roam_id, req.invitee_id)
    on conflict do nothing;
  end if;
end;
$$;

-- Blocking also removes each of you from the other's open votes.
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

  delete from public.open_roam_invites i using public.open_roams o
  where i.open_roam_id = o.id and o.status = 'open'
    and ((o.host_id = me and i.user_id = p_user) or (o.host_id = p_user and i.user_id = me));

  delete from public.invite_requests
  where (requester_id = me and invitee_id = p_user) or (requester_id = p_user and invitee_id = me);
end;
$$;

-- ─── 5 + 6. Answering a Roam ────────────────────────────────────
create or replace function public.respond_to_roam(p_roam uuid, p_response text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.roams;
  taken int;
begin
  if p_response not in ('in', 'maybe', 'cant') then raise exception 'invalid_response'; end if;

  -- Lock the Roam so two people can't take the last spot at once.
  select * into r from public.roams where id = p_roam for update;
  if not found or not public.is_on_roam(p_roam) then raise exception 'not_invited'; end if;
  if r.status = 'cancelled' then raise exception 'roam_cancelled'; end if;
  if r.ends_at <= now() then raise exception 'roam_over'; end if;
  if r.host_id = me then raise exception 'host_use_cant_make_it'; end if;

  if p_response = 'in' and r.max_spots is not null then
    select count(*) into taken from public.roam_invites i
    where i.roam_id = p_roam and i.response = 'in' and i.user_id not in (me, r.host_id);
    if taken >= r.max_spots then raise exception 'roam_full'; end if;
  end if;

  update public.roam_invites
  set response = p_response,
      note = nullif(trim(coalesce(p_note, '')), ''),
      responded_at = now()
  where roam_id = p_roam and user_id = me;

  -- Up for grabs and the last person who's In just left: call it off.
  if r.status = 'up_for_grabs' and p_response <> 'in'
     and not exists (select 1 from public.roam_invites i where i.roam_id = p_roam and i.response = 'in') then
    update public.roams set status = 'cancelled' where id = p_roam;
  end if;
end;
$$;

-- ─── 8. Unfriending leaves circles ──────────────────────────────
create or replace function public.leave_circles_on_unfriend()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.crew_members m using public.crews c
  where m.crew_id = c.id
    and ((c.owner_id = old.requester_id and m.member_id = old.addressee_id)
      or (c.owner_id = old.addressee_id and m.member_id = old.requester_id));
  return null;
end;
$$;

revoke execute on function public.leave_circles_on_unfriend() from public, anon, authenticated;

drop trigger if exists leave_circles_on_unfriend on public.friendships;
create trigger leave_circles_on_unfriend after delete on public.friendships
  for each row execute function public.leave_circles_on_unfriend();

-- ─── 9. Editing a Roam ──────────────────────────────────────────
create or replace function public.update_roam(
  p_roam uuid, p_what text, p_location text, p_starts_at timestamptz, p_ends_at timestamptz
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_roam_host(p_roam) then raise exception 'not_host'; end if;
  if p_ends_at <= now() then raise exception 'starts_in_past'; end if;
  if p_ends_at > now() + interval '7 days' then raise exception 'too_far_ahead'; end if;
  update public.roams
  set what = trim(p_what),
      location = nullif(trim(coalesce(p_location, '')), ''),
      starts_at = p_starts_at,
      ends_at = p_ends_at
  where id = p_roam and status <> 'cancelled' and ends_at > now();
  if not found then raise exception 'roam_over'; end if;
end;
$$;

grant execute on function
  public.request_invite(uuid, uuid),
  public.decide_invite_request(uuid, boolean),
  public.block_user(uuid),
  public.respond_to_roam(uuid, text, text),
  public.update_roam(uuid, text, text, timestamptz, timestamptz)
to authenticated;
