-- Roami v1 schema
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Everything is protected by row level security. Writes that need rules
-- (sending, responding, hand-offs) go through the functions at the bottom.

-- ─────────────────────────────────────────────────────────────
-- Profiles
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 30),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Names and photos are visible to any signed-in Roamer (needed to show
-- who's in and to find friends). Phone numbers are never stored here.
create policy "profiles are readable when signed in"
  on public.profiles for select to authenticated using (true);

create policy "you can edit your own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- A profile row is created automatically when someone first signs in.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Push tokens are private to their owner.
create table public.push_tokens (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

create policy "you manage your own push token"
  on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- Friends (two-way, must be accepted)
-- ─────────────────────────────────────────────────────────────
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index friendships_pair_idx on public.friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);

alter table public.friendships enable row level security;

create policy "you see your own friendships"
  on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

create policy "either side can remove a friendship"
  on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

create function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(a, b)
      and greatest(f.requester_id, f.addressee_id) = greatest(a, b)
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- Crews (private to the person who made them)
-- ─────────────────────────────────────────────────────────────
create table public.crews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table public.crew_members (
  crew_id uuid not null references public.crews (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  primary key (crew_id, member_id)
);

alter table public.crews enable row level security;
alter table public.crew_members enable row level security;

create policy "crews are private to their owner"
  on public.crews for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "crew members are private to the crew owner"
  on public.crew_members for all to authenticated
  using (exists (select 1 from public.crews c where c.id = crew_id and c.owner_id = (select auth.uid())))
  with check (
    exists (select 1 from public.crews c where c.id = crew_id and c.owner_id = (select auth.uid()))
    and public.are_friends((select auth.uid()), member_id)
  );

-- ─────────────────────────────────────────────────────────────
-- Roams and responses
-- ─────────────────────────────────────────────────────────────
create table public.roams (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  what text not null check (char_length(what) between 1 and 80),
  vibe text check (vibe in ('quiet', 'drinks', 'food', 'active', 'chill', 'chaos')),
  location text check (char_length(location) <= 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_spots int check (max_spots between 1 and 20),
  -- live: normal · up_for_grabs: host can't make it, someone who's In can take over
  -- cancelled: host couldn't make it and nobody else was In
  status text not null default 'live' check (status in ('live', 'up_for_grabs', 'cancelled')),
  bail_note text check (char_length(bail_note) <= 80),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- One row per person on a Roam, the host included (host is always 'in').
create table public.roam_invites (
  roam_id uuid not null references public.roams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  response text check (response in ('in', 'maybe', 'cant')),
  note text check (char_length(note) <= 80),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (roam_id, user_id)
);

create index roam_invites_user_idx on public.roam_invites (user_id);

-- "Can I bring someone?" requests, approved by the host.
create table public.invite_requests (
  id uuid primary key default gen_random_uuid(),
  roam_id uuid not null references public.roams (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  unique (roam_id, invitee_id)
);

alter table public.roams enable row level security;
alter table public.roam_invites enable row level security;
alter table public.invite_requests enable row level security;

create function public.is_on_roam(r uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.roam_invites i where i.roam_id = r and i.user_id = auth.uid());
$$;

create function public.is_roam_host(r uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.roams x where x.id = r and x.host_id = auth.uid());
$$;

create policy "you see Roams you're on"
  on public.roams for select to authenticated using (public.is_on_roam(id));

-- You see your own answer, the host sees everyone's,
-- and everyone on the Roam sees who's In (not Maybe or Can't).
create policy "responses are visible by the rules"
  on public.roam_invites for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_roam_host(roam_id)
    or (response = 'in' and public.is_on_roam(roam_id))
  );

create policy "requests are visible to requester and host"
  on public.invite_requests for select to authenticated
  using (requester_id = (select auth.uid()) or public.is_roam_host(roam_id));

-- ─────────────────────────────────────────────────────────────
-- Functions the app calls
-- ─────────────────────────────────────────────────────────────

-- Find friends from your contacts. Takes phone numbers, returns matching Roamers.
create function public.match_contacts(p_phones text[])
returns table (id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar_url
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.display_name is not null
    and u.id <> auth.uid()
    and regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = any (
      select regexp_replace(x, '\D', '', 'g') from unnest(p_phones[1:2000]) x
    );
$$;

-- Send a friend request, or accept one if they already asked you.
create function public.add_friend(p_target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  existing public.friendships;
begin
  if me is null or p_target is null or p_target = me then
    raise exception 'invalid_friend';
  end if;

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

-- Send a Roam to a set of friends. Returns the new Roam's id.
create function public.send_roam(
  p_what text,
  p_vibe text,
  p_location text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_max_spots int,
  p_invitees uuid[]
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  new_id uuid;
  invited int;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_starts_at < now() - interval '10 minutes' then raise exception 'starts_in_past'; end if;
  if p_ends_at > now() + interval '7 days' then raise exception 'too_far_ahead'; end if;
  if (select count(*) from public.roams r
      where r.host_id = me and r.status <> 'cancelled' and r.ends_at > now()) >= 5 then
    raise exception 'too_many_roams';
  end if;

  insert into public.roams (host_id, what, vibe, location, starts_at, ends_at, max_spots)
  values (me, trim(p_what), p_vibe, nullif(trim(coalesce(p_location, '')), ''), p_starts_at, p_ends_at, p_max_spots)
  returning id into new_id;

  insert into public.roam_invites (roam_id, user_id, response, responded_at)
  values (new_id, me, 'in', now());

  insert into public.roam_invites (roam_id, user_id)
  select distinct new_id, f
  from unnest(p_invitees) f
  where f <> me and public.are_friends(me, f)
  on conflict do nothing;

  get diagnostics invited = row_count;
  if invited = 0 then raise exception 'no_friends_invited'; end if;

  return new_id;
end;
$$;

-- Answer a Roam: 'in', 'maybe' or 'cant', with an optional note.
create function public.respond_to_roam(p_roam uuid, p_response text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.roams;
  taken int;
begin
  if p_response not in ('in', 'maybe', 'cant') then raise exception 'invalid_response'; end if;

  select * into r from public.roams where id = p_roam;
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
end;
$$;

-- The host can't make it. If anyone else is In, the Roam goes up for grabs;
-- otherwise it's cancelled. Returns the Roam's new status.
create function public.host_cant_make_it(p_roam uuid, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.roams;
  others int;
  new_status text;
begin
  select * into r from public.roams where id = p_roam;
  if not found or r.host_id <> me then raise exception 'not_host'; end if;
  if r.status = 'cancelled' or r.ends_at <= now() then raise exception 'roam_over'; end if;

  update public.roam_invites set response = 'cant', responded_at = now()
  where roam_id = p_roam and user_id = me;

  select count(*) into others from public.roam_invites i
  where i.roam_id = p_roam and i.response = 'in';

  new_status := case when others > 0 then 'up_for_grabs' else 'cancelled' end;

  update public.roams
  set status = new_status, bail_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_roam;

  return new_status;
end;
$$;

-- Someone who's In takes over a Roam that's up for grabs. First one wins.
create function public.take_over_roam(p_roam uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if not exists (select 1 from public.roam_invites i
                 where i.roam_id = p_roam and i.user_id = me and i.response = 'in') then
    raise exception 'not_in';
  end if;

  update public.roams set host_id = me, status = 'live', bail_note = null
  where id = p_roam and status = 'up_for_grabs' and ends_at > now();

  if not found then raise exception 'already_taken'; end if;
end;
$$;

-- The host edits what, where or when.
create function public.update_roam(
  p_roam uuid, p_what text, p_location text, p_starts_at timestamptz, p_ends_at timestamptz
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_roam_host(p_roam) then raise exception 'not_host'; end if;
  update public.roams
  set what = trim(p_what),
      location = nullif(trim(coalesce(p_location, '')), ''),
      starts_at = p_starts_at,
      ends_at = p_ends_at
  where id = p_roam and status <> 'cancelled' and ends_at > now();
end;
$$;

-- Ask the host if a friend of yours can come too.
create function public.request_invite(p_roam uuid, p_friend uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if not public.is_on_roam(p_roam) then raise exception 'not_invited'; end if;
  if not public.are_friends(me, p_friend) then raise exception 'not_friends'; end if;
  if exists (select 1 from public.roam_invites i where i.roam_id = p_roam and i.user_id = p_friend) then
    raise exception 'already_invited';
  end if;

  insert into public.invite_requests (roam_id, requester_id, invitee_id)
  values (p_roam, me, p_friend)
  on conflict (roam_id, invitee_id) do nothing;
end;
$$;

-- The host says yes or no to a "can I bring someone" request.
create function public.decide_invite_request(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  req public.invite_requests;
begin
  select * into req from public.invite_requests where id = p_request;
  if not found or not public.is_roam_host(req.roam_id) then raise exception 'not_host'; end if;

  update public.invite_requests
  set status = case when p_approve then 'approved' else 'declined' end
  where id = p_request;

  if p_approve then
    insert into public.roam_invites (roam_id, user_id) values (req.roam_id, req.invitee_id)
    on conflict do nothing;
  end if;
end;
$$;

-- When you last roamed with anyone in each of your crews.
create function public.crew_last_roamed()
returns table (crew_id uuid, last_roamed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, max(r.ends_at)
  from public.crews c
  join public.crew_members m on m.crew_id = c.id
  join public.roam_invites them on them.user_id = m.member_id and them.response = 'in'
  join public.roam_invites mine on mine.roam_id = them.roam_id and mine.user_id = auth.uid() and mine.response = 'in'
  join public.roams r on r.id = them.roam_id and r.status <> 'cancelled' and r.ends_at < now()
  where c.owner_id = auth.uid()
  group by c.id;
$$;

-- Only signed-in users may call these.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.match_contacts(text[]),
  public.add_friend(uuid),
  public.send_roam(text, text, text, timestamptz, timestamptz, int, uuid[]),
  public.respond_to_roam(uuid, text, text),
  public.host_cant_make_it(uuid, text),
  public.take_over_roam(uuid),
  public.update_roam(uuid, text, text, timestamptz, timestamptz),
  public.request_invite(uuid, uuid),
  public.decide_invite_request(uuid, boolean),
  public.crew_last_roamed(),
  public.are_friends(uuid, uuid),
  public.is_on_roam(uuid),
  public.is_roam_host(uuid)
to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Live updates and profile photos
-- ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.roams, public.roam_invites, public.invite_requests, public.friendships;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "you upload your own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "you replace your own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
