-- Mock friends for testing (safe to remove before launch).
--
-- Run once in SQL Editor. Then, in the app (test builds only), Friends ->
-- "Load test friends" calls seed_mock_friends(), which gives you:
--   * 10 mock friends, already friends with you
--   * 2 circles, "Uni lot" and "Work wives", with friends randomly assigned
--     (a few end up in both, some in neither)
--   * 2 Roams from them waiting for your answer
-- Mock friends answer your Roams automatically (In, Maybe, Can't, or ghost you).
-- "Remove test friends" calls clear_mock_friends().

create table public.mock_people (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade
);

create index mock_people_owner_idx on public.mock_people (owner_id);

-- Only the functions below touch this table.
alter table public.mock_people enable row level security;

create function public.seed_mock_friends()
returns int language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  names text[] := array['Jo', 'Sam', 'Priya', 'Alex', 'Dee', 'Tom', 'Zara', 'Preston', 'Maya', 'Leo'];
  ids uuid[] := '{}';
  nm text;
  new_id uuid;
  uni uuid;
  work uuid;
  roll float;
  r1 uuid;
  r2 uuid;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.mock_people where owner_id = me) then
    raise exception 'already_seeded';
  end if;

  -- People
  foreach nm in array names loop
    new_id := gen_random_uuid();
    insert into auth.users (id, aud, role, created_at, updated_at, is_anonymous)
    values (new_id, 'authenticated', 'authenticated', now(), now(), true);
    -- the on_auth_user_created trigger made their profile
    update public.profiles set display_name = nm where id = new_id;
    insert into public.mock_people (user_id, owner_id) values (new_id, me);
    insert into public.friendships (requester_id, addressee_id, status) values (new_id, me, 'accepted');
    ids := ids || new_id;
  end loop;

  -- Circles, with random (overlapping) membership
  -- Reuse the circles if a previous seed already made them.
  select id into uni from public.crews where owner_id = me and name = 'Uni lot' limit 1;
  if uni is null then
    insert into public.crews (owner_id, name) values (me, 'Uni lot') returning id into uni;
  end if;
  select id into work from public.crews where owner_id = me and name = 'Work wives' limit 1;
  if work is null then
    insert into public.crews (owner_id, name) values (me, 'Work wives') returning id into work;
  end if;

  for i in 1 .. array_length(ids, 1) loop
    roll := random();
    if roll < 0.4 then
      insert into public.crew_members values (uni, ids[i]);
    elsif roll < 0.75 then
      insert into public.crew_members values (work, ids[i]);
    elsif roll < 0.9 then
      insert into public.crew_members values (uni, ids[i]), (work, ids[i]);
    end if; -- else: in no circle, like real life
  end loop;

  -- Make sure each circle has at least 3 people
  insert into public.crew_members
  select uni, x from unnest(ids[1:3]) x on conflict do nothing;
  insert into public.crew_members
  select work, x from unnest(ids[6:8]) x on conflict do nothing;

  -- Two Roams from them, waiting on you
  insert into public.roams (host_id, what, vibe, location, starts_at, ends_at)
  values (ids[2], 'Pub quiz, I''m carrying', 'drinks', 'The Fox',
          date_trunc('hour', now()) + interval '2 hours', date_trunc('hour', now()) + interval '5 hours')
  returning id into r1;
  insert into public.roam_invites (roam_id, user_id, response, responded_at) values
    (r1, ids[2], 'in', now()),
    (r1, ids[1], 'in', now()),
    (r1, me, null, null);
  update public.roam_invites set note = 'in but late, save me a seat' where roam_id = r1 and user_id = ids[1];

  insert into public.roams (host_id, what, vibe, starts_at, ends_at)
  values (ids[3], 'Sunset walk?', 'active',
          date_trunc('day', now()) + interval '1 day 17 hours', date_trunc('day', now()) + interval '1 day 19 hours')
  returning id into r2;
  insert into public.roam_invites (roam_id, user_id, response, responded_at) values
    (r2, ids[3], 'in', now()),
    (r2, ids[9], 'maybe', now()),
    (r2, me, null, null);

  return array_length(ids, 1);
end;
$$;

-- Removes your mock friends and everything they're part of. Your circles stay.
create function public.clear_mock_friends()
returns int language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  n int;
begin
  with gone as (
    delete from auth.users u
    using public.mock_people m
    where m.user_id = u.id and m.owner_id = me
    returning u.id
  )
  select count(*) into n from gone;
  return n;
end;
$$;

-- Mock friends answer your Roams the moment they're invited.
create function public.mock_auto_respond()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  roll float := random();
begin
  if new.response is null and exists (select 1 from public.mock_people where user_id = new.user_id) then
    new.response := case
      when roll < 0.5 then 'in'
      when roll < 0.7 then 'maybe'
      when roll < 0.9 then 'cant'
      else null -- ghosted
    end;
    if new.response is not null then
      new.responded_at := now();
      if new.response = 'in' and random() < 0.3 then
        new.note := (array['omw', 'say less', 'only if there''s snacks', 'bringing my A game'])[1 + floor(random() * 4)::int];
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger mock_friends_auto_respond
  before insert on public.roam_invites
  for each row execute function public.mock_auto_respond();

revoke execute on function public.seed_mock_friends(), public.clear_mock_friends(), public.mock_auto_respond() from public, anon;
grant execute on function public.seed_mock_friends(), public.clear_mock_friends() to authenticated;
