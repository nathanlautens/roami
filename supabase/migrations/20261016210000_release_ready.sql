-- Getting Roami ready for the app stores.
--
--  1. Delete my account (both stores require it).
--  2. The buzzer fires on the server every minute, even if nobody has the
--     app open. Needs pg_cron: Database -> Extensions -> pg_cron -> enable,
--     BEFORE running this file.
--  3. Test helpers (fake friends, test votes) can no longer be called from
--     the app, so real users can't create fake accounts. To use them again
--     while testing, run the grant at the very bottom of this file.
--
-- Run once in SQL Editor, after the earlier migrations.

-- ─────────────────────────────────────────────────────────────
-- 1. Delete my account
-- ─────────────────────────────────────────────────────────────
-- Deleting the auth user cascades to the profile, friendships, circles,
-- hosted Roams, answers, open Roams and votes. The app removes your photos
-- from storage first (storage files can only be deleted via the Storage API).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

create policy "you delete your own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ─────────────────────────────────────────────────────────────
-- 2. Server-side buzzer
-- ─────────────────────────────────────────────────────────────
-- The locking logic, callable only by the database itself.
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

  -- Top night: most people free. Tie: the night whose people cast more vibe
  -- votes (more enthusiasm). Still tied: the earlier night. Skip nights over.
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

  -- Host is In; everyone free that night is In; everyone else gets to answer.
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
  set status = 'locked', locked_roam_id = rid, winning_night = win, winning_vibe = win_vibe, winning_idea = win_idea
  where id = p_open;

  return rid;
end;
$$;

revoke execute on function public.lock_open_roam(uuid) from public, anon, authenticated;

-- What the app calls: same as before, but checks you're on the open Roam.
create or replace function public.resolve_open_roam(p_open uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.is_on_open_roam(p_open) then raise exception 'not_invited'; end if;
  return public.lock_open_roam(p_open);
end;
$$;

-- Locks every open Roam whose buzzer has gone off. Returns how many.
create or replace function public.resolve_due_open_roams()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id from public.open_roams
    where status = 'open' and buzzer_at <= now()
    order by buzzer_at
    limit 200
  loop
    begin
      perform public.lock_open_roam(r.id);
      n := n + 1;
    exception when others then
      raise log 'roami buzzer failed for %: %', r.id, sqlerrm;
    end;
  end loop;
  return n;
end;
$$;

revoke execute on function public.resolve_due_open_roams() from public, anon, authenticated;

-- Run it every minute (if pg_cron is enabled).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'roami-buzzer';
    perform cron.schedule('roami-buzzer', '* * * * *', 'select public.resolve_due_open_roams()');
  else
    raise warning 'pg_cron is not enabled: the buzzer will only fire when someone opens the app. Enable it under Database -> Extensions, then run this file again.';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Lock away the test helpers
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_proc where proname = 'seed_mock_friends') then
    revoke execute on function public.seed_mock_friends() from authenticated;
    revoke execute on function public.clear_mock_friends() from authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'seed_mock_open_roam') then
    revoke execute on function public.seed_mock_open_roam() from authenticated;
  end if;
end;
$$;

-- To turn test friends back on while testing, run:
--   grant execute on function public.seed_mock_friends(), public.clear_mock_friends(), public.seed_mock_open_roam() to authenticated;
-- and to remove every test friend for good:
--   delete from auth.users where id in (select user_id from public.mock_people);
