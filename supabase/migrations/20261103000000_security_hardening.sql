-- Security hardening. Run once in SQL Editor, after the earlier migrations.
-- Safe to run again.
--
--  1. Profiles: you can only see people you're connected to (friends, friend
--     requests, people on the same Roam or vote, people you've blocked).
--     Before, any signed-in account could list every user's name and photo.
--     Friend codes and invite links now go through functions that return one
--     person at a time.
--  2. Profile edits: only your name and photo can be changed, and your photo
--     must be one you uploaded to Roami (no links to outside images, which
--     could track who looks at your profile).
--  3. Friendships and blocks can't be checked for any two people from the app
--     any more (are_friends / is_blocked_between were callable directly).
--  4. Friend requests are rate limited (30 an hour), so nobody can spam them.
--  5. The old phone-number lookup (match_contacts) is removed.
--  6. The old test SMS hook and its table of login codes are removed.
--  7. Profile photos: images only, 5 MB max. You can list your own photo
--     folder (needed to delete old photos and your photos when you delete
--     your account; before, those deletes silently did nothing).

-- ─── 1. Who can see a profile ───────────────────────────────────
create or replace function public.can_see_profile(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p = auth.uid()
    or exists (
      select 1 from public.friendships f
      where (f.requester_id = auth.uid() and f.addressee_id = p)
         or (f.addressee_id = auth.uid() and f.requester_id = p))
    or exists (
      select 1 from public.roam_invites mine
      join public.roam_invites theirs on theirs.roam_id = mine.roam_id
      where mine.user_id = auth.uid() and theirs.user_id = p)
    or exists (
      select 1 from public.open_roam_invites mine
      join public.open_roam_invites theirs on theirs.open_roam_id = mine.open_roam_id
      where mine.user_id = auth.uid() and theirs.user_id = p)
    or exists (
      select 1 from public.invite_requests q
      join public.roams r on r.id = q.roam_id
      where q.invitee_id = p and (r.host_id = auth.uid() or q.requester_id = auth.uid()))
    or exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = p);
$$;

revoke execute on function public.can_see_profile(uuid) from public, anon;
grant execute on function public.can_see_profile(uuid) to authenticated;

drop policy if exists "profiles are readable when signed in" on public.profiles;
drop policy if exists "profiles you're connected to" on public.profiles;
create policy "profiles you're connected to"
  on public.profiles for select to authenticated
  using (public.can_see_profile(id));

-- Friend code ("3F9A12BC" = the first 8 characters of someone's id): one match or nothing.
create or replace function public.find_by_friend_code(p_code text)
returns table (id uuid, display_name text, avatar_url text)
language plpgsql stable security definer set search_path = public as $$
declare
  clean text := lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-fA-F]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if length(clean) <> 8 then return; end if;
  return query
    select p.id, p.display_name, p.avatar_url
    from public.profiles p
    where p.id >= (clean || '-0000-0000-0000-000000000000')::uuid
      and p.id <= (clean || '-ffff-ffff-ffff-ffffffffffff')::uuid
      and p.display_name is not null
      and p.id <> auth.uid()
      and not public.is_blocked_between(auth.uid(), p.id)
      and (select count(*) from public.profiles x
           where x.id >= (clean || '-0000-0000-0000-000000000000')::uuid
             and x.id <= (clean || '-ffff-ffff-ffff-ffffffffffff')::uuid
             and x.display_name is not null) = 1;
end;
$$;

-- Invite link (roami://add/<full id>): the full id is the invitation.
create or replace function public.profile_for_invite(p_id uuid)
returns table (id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar_url
  from public.profiles p
  where p.id = p_id and auth.uid() is not null and p.display_name is not null
    and not public.is_blocked_between(auth.uid(), p.id);
$$;

revoke execute on function public.find_by_friend_code(text), public.profile_for_invite(uuid) from public, anon;
grant execute on function public.find_by_friend_code(text), public.profile_for_invite(uuid) to authenticated;

-- ─── 2. Profile edits ───────────────────────────────────────────
revoke update on public.profiles from anon, authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

create or replace function public.check_profile_photo()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.avatar_url is not distinct from old.avatar_url then return new; end if;
  if new.avatar_url is not null
     and new.avatar_url !~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/' || new.id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'invalid_avatar';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_profile_photo() from public, anon, authenticated;

drop trigger if exists check_profile_photo on public.profiles;
create trigger check_profile_photo before insert or update of avatar_url on public.profiles
  for each row execute function public.check_profile_photo();

-- ─── 3. Friendship and block checks are internal ────────────────
-- Circles only need "is this person MY friend?", so that's all the app gets.
create or replace function public.is_my_friend(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.are_friends(auth.uid(), p);
$$;

revoke execute on function public.is_my_friend(uuid) from public, anon;
grant execute on function public.is_my_friend(uuid) to authenticated;

drop policy if exists "crew members are private to the crew owner" on public.crew_members;
create policy "crew members are private to the crew owner"
  on public.crew_members for all to authenticated
  using (exists (select 1 from public.crews c where c.id = crew_id and c.owner_id = (select auth.uid())))
  with check (
    exists (select 1 from public.crews c where c.id = crew_id and c.owner_id = (select auth.uid()))
    and public.is_my_friend(member_id)
  );

revoke execute on function public.are_friends(uuid, uuid), public.is_blocked_between(uuid, uuid) from public, anon, authenticated;

-- ─── 4. Friend requests: 30 an hour ─────────────────────────────
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
    if (select count(*) from public.friendships
        where requester_id = me and created_at > now() - interval '1 hour') >= 30 then
      raise exception 'too_many_requests';
    end if;
    if not exists (select 1 from public.profiles where id = p_target and display_name is not null) then
      raise exception 'invalid_friend';
    end if;
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

revoke execute on function public.add_friend(uuid) from public, anon;
grant execute on function public.add_friend(uuid) to authenticated;

-- ─── 5. Old phone-number lookup ─────────────────────────────────
drop function if exists public.match_contacts(text[]);

-- ─── 6. Old test SMS hook ───────────────────────────────────────
-- (If "Send SMS hook" is still switched on under Authentication -> Hooks,
-- switch it off. Roami signs in with email.)
drop function if exists public.send_sms_hook(jsonb);
drop table if exists public.dev_sms_codes;

-- ─── 7. Profile photo uploads ───────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets
    set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
        file_size_limit = 5 * 1024 * 1024
    where id = 'avatars';
  end if;
end;
$$;

drop policy if exists "you list your own avatars" on storage.objects;
create policy "you list your own avatars"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
