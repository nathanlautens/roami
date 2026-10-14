-- Open Roams: "I'm free a few nights, which one works?" with a buzzer.
--
-- The host picks some nights, invites friends and sets a buzzer. Until the
-- buzzer, everyone votes on which nights work and what vibe they're in the
-- mood for, and can pitch/upvote ideas. At the buzzer, the top night locks
-- into a normal Roam, and everyone who said that night works is In.
--
-- Needs the earlier migrations (initial schema, and mock friends for the
-- test helpers at the bottom). Run once in SQL Editor.

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────
create table public.open_roams (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  buzzer_at timestamptz not null,
  -- open: voting · locked: became a Roam · expired: every night had passed by the buzzer
  status text not null default 'open' check (status in ('open', 'locked', 'expired')),
  locked_roam_id uuid references public.roams (id) on delete set null,
  winning_night timestamptz,
  winning_vibe text,
  winning_idea text,
  created_at timestamptz not null default now()
);

-- Each night is stored as its start time (the app sends 7pm local).
create table public.open_roam_nights (
  open_roam_id uuid not null references public.open_roams (id) on delete cascade,
  night_start timestamptz not null,
  primary key (open_roam_id, night_start)
);

create table public.open_roam_invites (
  open_roam_id uuid not null references public.open_roams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_at timestamptz not null default now(),
  voted_at timestamptz,
  primary key (open_roam_id, user_id)
);

create index open_roam_invites_user_idx on public.open_roam_invites (user_id);

create table public.open_roam_night_votes (
  open_roam_id uuid not null,
  user_id uuid not null,
  night_start timestamptz not null,
  primary key (open_roam_id, user_id, night_start),
  foreign key (open_roam_id, user_id) references public.open_roam_invites (open_roam_id, user_id) on delete cascade,
  foreign key (open_roam_id, night_start) references public.open_roam_nights (open_roam_id, night_start) on delete cascade on update cascade
);

create table public.open_roam_vibe_votes (
  open_roam_id uuid not null,
  user_id uuid not null,
  vibe text not null check (vibe in ('quiet', 'drinks', 'food', 'active', 'chill', 'chaos')),
  primary key (open_roam_id, user_id, vibe),
  foreign key (open_roam_id, user_id) references public.open_roam_invites (open_roam_id, user_id) on delete cascade
);

create table public.open_roam_ideas (
  id uuid primary key default gen_random_uuid(),
  open_roam_id uuid not null references public.open_roams (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.open_roam_idea_votes (
  idea_id uuid not null references public.open_roam_ideas (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (idea_id, user_id)
);

-- ─────────────────────────────────────────────────────────────
-- Privacy: only people on an open Roam can see it and its votes.
-- All writes go through the functions below.
-- ─────────────────────────────────────────────────────────────
create function public.is_on_open_roam(r uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.open_roam_invites i where i.open_roam_id = r and i.user_id = auth.uid());
$$;

alter table public.open_roams enable row level security;
alter table public.open_roam_nights enable row level security;
alter table public.open_roam_invites enable row level security;
alter table public.open_roam_night_votes enable row level security;
alter table public.open_roam_vibe_votes enable row level security;
alter table public.open_roam_ideas enable row level security;
alter table public.open_roam_idea_votes enable row level security;

create policy "see open Roams you're on" on public.open_roams for select to authenticated
  using (public.is_on_open_roam(id));
create policy "see their nights" on public.open_roam_nights for select to authenticated
  using (public.is_on_open_roam(open_roam_id));
create policy "see who's on them" on public.open_roam_invites for select to authenticated
  using (public.is_on_open_roam(open_roam_id));
create policy "see night votes" on public.open_roam_night_votes for select to authenticated
  using (public.is_on_open_roam(open_roam_id));
create policy "see vibe votes" on public.open_roam_vibe_votes for select to authenticated
  using (public.is_on_open_roam(open_roam_id));
create policy "see ideas" on public.open_roam_ideas for select to authenticated
  using (public.is_on_open_roam(open_roam_id));
create policy "see idea votes" on public.open_roam_idea_votes for select to authenticated
  using (exists (select 1 from public.open_roam_ideas i where i.id = idea_id and public.is_on_open_roam(i.open_roam_id)));

-- ─────────────────────────────────────────────────────────────
-- Functions the app calls
-- ─────────────────────────────────────────────────────────────

-- Start an open Roam. Nights are start times (7pm local). Returns its id.
create function public.start_open_roam(
  p_nights timestamptz[],
  p_buzzer_at timestamptz,
  p_invitees uuid[],
  p_idea text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  new_id uuid;
  n int;
  first_night timestamptz;
  last_night timestamptz;
  invited int;
begin
  if me is null then raise exception 'not_signed_in'; end if;

  select count(distinct x), min(x), max(x) into n, first_night, last_night from unnest(p_nights) x;
  if n = 0 then raise exception 'no_nights'; end if;
  if n > 7 then raise exception 'too_many_nights'; end if;
  if first_night <= now() then raise exception 'night_in_past'; end if;
  if last_night > now() + interval '15 days' then raise exception 'too_far_ahead'; end if;
  if p_buzzer_at <= now() then raise exception 'buzzer_in_past'; end if;
  if p_buzzer_at > first_night then raise exception 'buzzer_after_first_night'; end if;
  if (select count(*) from public.open_roams where host_id = me and status = 'open') >= 3 then
    raise exception 'too_many_open_roams';
  end if;

  insert into public.open_roams (host_id, buzzer_at) values (me, p_buzzer_at) returning id into new_id;
  insert into public.open_roam_nights (open_roam_id, night_start)
    select distinct new_id, x from unnest(p_nights) x;

  -- The host is free on every night they picked.
  insert into public.open_roam_invites (open_roam_id, user_id, voted_at) values (new_id, me, now());
  insert into public.open_roam_night_votes (open_roam_id, user_id, night_start)
    select new_id, me, night_start from public.open_roam_nights where open_roam_id = new_id;

  if nullif(trim(coalesce(p_idea, '')), '') is not null then
    perform public.pitch_open_roam_idea(new_id, p_idea);
  end if;

  insert into public.open_roam_invites (open_roam_id, user_id)
  select distinct new_id, f from unnest(p_invitees) f
  where f <> me and public.are_friends(me, f)
  on conflict do nothing;

  get diagnostics invited = row_count;
  if invited = 0 then raise exception 'no_friends_invited'; end if;

  return new_id;
end;
$$;

-- Cast (or change) your votes. Replaces any earlier votes.
create function public.vote_open_roam(p_open uuid, p_nights timestamptz[], p_vibes text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  o public.open_roams;
begin
  select * into o from public.open_roams where id = p_open;
  if not found or not public.is_on_open_roam(p_open) then raise exception 'not_invited'; end if;
  if o.status <> 'open' or now() >= o.buzzer_at then raise exception 'voting_closed'; end if;

  delete from public.open_roam_night_votes where open_roam_id = p_open and user_id = me;
  insert into public.open_roam_night_votes (open_roam_id, user_id, night_start)
    select p_open, me, n.night_start
    from public.open_roam_nights n
    where n.open_roam_id = p_open and n.night_start = any (p_nights);

  delete from public.open_roam_vibe_votes where open_roam_id = p_open and user_id = me;
  insert into public.open_roam_vibe_votes (open_roam_id, user_id, vibe)
    select distinct p_open, me, v from unnest(p_vibes) v
    where v in ('quiet', 'drinks', 'food', 'active', 'chill', 'chaos');

  update public.open_roam_invites set voted_at = now() where open_roam_id = p_open and user_id = me;
end;
$$;

-- Pitch an idea (up to 3 each). You automatically upvote your own.
create function public.pitch_open_roam_idea(p_open uuid, p_text text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  o public.open_roams;
  new_id uuid;
begin
  select * into o from public.open_roams where id = p_open;
  if not found or not public.is_on_open_roam(p_open) then raise exception 'not_invited'; end if;
  if o.status <> 'open' or now() >= o.buzzer_at then raise exception 'voting_closed'; end if;
  if (select count(*) from public.open_roam_ideas where open_roam_id = p_open and author_id = me) >= 3 then
    raise exception 'too_many_ideas';
  end if;

  insert into public.open_roam_ideas (open_roam_id, author_id, text)
  values (p_open, me, left(trim(p_text), 60))
  returning id into new_id;
  insert into public.open_roam_idea_votes (idea_id, user_id) values (new_id, me);
  return new_id;
end;
$$;

-- Upvote or un-upvote an idea. Returns true if you now upvote it.
create function public.toggle_open_roam_idea_vote(p_idea uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  idea public.open_roam_ideas;
  o public.open_roams;
begin
  select * into idea from public.open_roam_ideas where id = p_idea;
  if not found or not public.is_on_open_roam(idea.open_roam_id) then raise exception 'not_invited'; end if;
  select * into o from public.open_roams where id = idea.open_roam_id;
  if o.status <> 'open' or now() >= o.buzzer_at then raise exception 'voting_closed'; end if;

  if exists (select 1 from public.open_roam_idea_votes where idea_id = p_idea and user_id = me) then
    delete from public.open_roam_idea_votes where idea_id = p_idea and user_id = me;
    return false;
  end if;
  insert into public.open_roam_idea_votes (idea_id, user_id) values (p_idea, me);
  return true;
end;
$$;

-- The buzzer. Anyone on the open Roam can call this once the buzzer time has
-- passed; the first call locks the winner into a Roam, later calls just
-- return that Roam. Returns the Roam's id (null if every night had passed).
create function public.resolve_open_roam(p_open uuid)
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
  if not found or not public.is_on_open_roam(p_open) then raise exception 'not_invited'; end if;
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

-- ─────────────────────────────────────────────────────────────
-- Test friends vote on open Roams (needs the mock friends migration)
-- ─────────────────────────────────────────────────────────────
create function public.mock_open_roam_vote()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.voted_at is null
     and exists (select 1 from public.mock_people where user_id = new.user_id)
     and random() < 0.85 then -- some of them ghost, like real life
    insert into public.open_roam_night_votes (open_roam_id, user_id, night_start)
      select new.open_roam_id, new.user_id, n.night_start
      from public.open_roam_nights n
      where n.open_roam_id = new.open_roam_id and random() < 0.55;
    insert into public.open_roam_vibe_votes (open_roam_id, user_id, vibe)
      select new.open_roam_id, new.user_id, v
      from unnest(array['drinks', 'food', 'chill', 'active', 'chaos', 'quiet']) v
      order by random()
      limit 1 + (random() < 0.4)::int;
    insert into public.open_roam_idea_votes (idea_id, user_id)
      select i.id, new.user_id from public.open_roam_ideas i
      where i.open_roam_id = new.open_roam_id and random() < 0.5;
    update public.open_roam_invites set voted_at = now()
      where open_roam_id = new.open_roam_id and user_id = new.user_id;
  end if;
  return null;
end;
$$;

create trigger mock_friends_vote_open_roams
  after insert on public.open_roam_invites
  for each row execute function public.mock_open_roam_vote();

-- Test helper: a test friend starts an open Roam that includes you, with the
-- buzzer going off in 3 minutes, so you can watch the whole thing happen.
create function public.seed_mock_open_roam()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  host uuid;
  others uuid[];
  new_id uuid;
  base timestamptz := date_trunc('day', now()) + interval '1 day 19 hours';
begin
  select array_agg(user_id order by random()) into others from public.mock_people where owner_id = me;
  if others is null or array_length(others, 1) < 3 then raise exception 'load_test_friends_first'; end if;
  host := others[1];

  insert into public.open_roams (host_id, buzzer_at) values (host, now() + interval '3 minutes') returning id into new_id;
  insert into public.open_roam_nights (open_roam_id, night_start)
    values (new_id, base), (new_id, base + interval '1 day'), (new_id, base + interval '3 days');
  insert into public.open_roam_invites (open_roam_id, user_id, voted_at) values (new_id, host, now());
  insert into public.open_roam_night_votes (open_roam_id, user_id, night_start)
    select new_id, host, night_start from public.open_roam_nights where open_roam_id = new_id;
  insert into public.open_roam_ideas (open_roam_id, author_id, text) values
    (new_id, host, 'Bowling + bad pizza'),
    (new_id, host, 'Karaoke. Hear me out.');

  -- Everyone else (their votes come from the trigger), then you.
  insert into public.open_roam_invites (open_roam_id, user_id)
    select new_id, x from unnest(others[2:]) x;
  insert into public.open_roam_invites (open_roam_id, user_id) values (new_id, me);

  return new_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permissions and live updates
-- ─────────────────────────────────────────────────────────────
revoke execute on function
  public.start_open_roam(timestamptz[], timestamptz, uuid[], text),
  public.vote_open_roam(uuid, timestamptz[], text[]),
  public.pitch_open_roam_idea(uuid, text),
  public.toggle_open_roam_idea_vote(uuid),
  public.resolve_open_roam(uuid),
  public.is_on_open_roam(uuid),
  public.mock_open_roam_vote(),
  public.seed_mock_open_roam()
from public, anon;

grant execute on function
  public.start_open_roam(timestamptz[], timestamptz, uuid[], text),
  public.vote_open_roam(uuid, timestamptz[], text[]),
  public.pitch_open_roam_idea(uuid, text),
  public.toggle_open_roam_idea_vote(uuid),
  public.resolve_open_roam(uuid),
  public.is_on_open_roam(uuid),
  public.seed_mock_open_roam()
to authenticated;

alter publication supabase_realtime add table
  public.open_roams, public.open_roam_invites, public.open_roam_night_votes,
  public.open_roam_vibe_votes, public.open_roam_ideas, public.open_roam_idea_votes;
