import { useEffect, useState } from 'react';

import { useAuth } from './auth';
import { PROFILE, useLoader } from './data';
import { VIBES } from './roams';
import { supabase } from './supabase';
import type { Profile, Vibe } from './types';

/** An open Roam ("find a night") with everything needed to show and vote on it. */
export type OpenRoam = {
  id: string;
  host_id: string;
  buzzer_at: string;
  status: 'open' | 'locked' | 'expired';
  locked_roam_id: string | null;
  winning_night: string | null;
  winning_vibe: Vibe | null;
  winning_idea: string | null;
  host: Profile | null;
  nights: string[]; // night start times, earliest first
  people: { user_id: string; voted_at: string | null; profile: Profile | null }[];
  nightVotes: { user_id: string; night_start: string }[];
  vibeVotes: { user_id: string; vibe: Vibe }[];
  ideas: { id: string; text: string; author: Profile | null; voters: string[]; created_at: string }[];
};

const OPEN_FIELDS = `id, host_id, buzzer_at, status, locked_roam_id, winning_night, winning_vibe, winning_idea, created_at,
  host:profiles!open_roams_host_id_fkey(${PROFILE})`;

/** Loads full details for a set of open Roams in a few queries. */
async function loadDetails(ids: string[]): Promise<OpenRoam[]> {
  if (!ids.length) return [];
  const [roams, nights, people, nightVotes, vibeVotes, ideas] = await Promise.all([
    supabase.from('open_roams').select(OPEN_FIELDS).in('id', ids),
    supabase.from('open_roam_nights').select('open_roam_id, night_start').in('open_roam_id', ids),
    supabase
      .from('open_roam_invites')
      .select(`open_roam_id, user_id, voted_at, profile:profiles!open_roam_invites_user_id_fkey(${PROFILE})`)
      .in('open_roam_id', ids),
    supabase.from('open_roam_night_votes').select('open_roam_id, user_id, night_start').in('open_roam_id', ids),
    supabase.from('open_roam_vibe_votes').select('open_roam_id, user_id, vibe').in('open_roam_id', ids),
    supabase
      .from('open_roam_ideas')
      .select(`id, open_roam_id, text, created_at, author:profiles!open_roam_ideas_author_id_fkey(${PROFILE}), open_roam_idea_votes(user_id)`)
      .in('open_roam_id', ids),
  ]);
  for (const r of [roams, nights, people, nightVotes, vibeVotes, ideas]) if (r.error) throw r.error;

  const by = <T extends { open_roam_id: string }>(rows: T[] | null, id: string) => (rows ?? []).filter((x) => x.open_roam_id === id);

  return ((roams.data ?? []) as unknown as Omit<OpenRoam, 'nights' | 'people' | 'nightVotes' | 'vibeVotes' | 'ideas'>[]).map((o) => ({
    ...o,
    nights: by(nights.data, o.id).map((n) => n.night_start).sort(),
    people: by(people.data as unknown as (OpenRoam['people'][number] & { open_roam_id: string })[], o.id),
    nightVotes: by(nightVotes.data, o.id),
    vibeVotes: by(vibeVotes.data as unknown as { open_roam_id: string; user_id: string; vibe: Vibe }[], o.id),
    ideas: by(ideas.data as unknown as { open_roam_id: string; id: string; text: string; created_at: string; author: Profile | null; open_roam_idea_votes: { user_id: string }[] }[], o.id)
      .map((i) => ({ id: i.id, text: i.text, created_at: i.created_at, author: i.author, voters: i.open_roam_idea_votes.map((v) => v.user_id) }))
      .sort((a, b) => b.voters.length - a.voters.length || a.created_at.localeCompare(b.created_at)),
  }));
}

/** Open Roams you're on: still voting, or locked in the last day. */
export function useOpenRoams() {
  const { userId } = useAuth();
  return useLoader<OpenRoam[]>(
    async () => {
      if (!userId) return [];
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data, error } = await supabase
        .from('open_roam_invites')
        .select('open_roam_id, open:open_roams!inner(status, buzzer_at)')
        .eq('user_id', userId)
        .gte('open.buzzer_at', since);
      if (error) throw error;
      return loadDetails((data ?? []).map((r) => r.open_roam_id));
    },
    [],
    ['open_roams', 'open_roam_invites', 'open_roam_night_votes', 'open_roam_vibe_votes', 'open_roam_ideas', 'open_roam_idea_votes'],
  );
}

export function useOpenRoam(id: string) {
  return useLoader<OpenRoam | null>(
    async () => (await loadDetails([id]))[0] ?? null,
    null,
    ['open_roams', 'open_roam_invites', 'open_roam_night_votes', 'open_roam_vibe_votes', 'open_roam_ideas', 'open_roam_idea_votes'],
  );
}

// ─── Standings (same rules as the buzzer in the database) ───────

export type Standings = {
  leadNight: string | null;
  freeBy: Map<string, string[]>; // night -> user ids free
  vibeCounts: Map<Vibe, number>;
  leadVibe: Vibe | null;
  leadIdea: OpenRoam['ideas'][number] | null;
  votedCount: number;
  waitingOn: Profile[];
};

const VIBE_ORDER: Vibe[] = ['drinks', 'food', 'chill', 'active', 'chaos', 'quiet'];

export function standings(o: OpenRoam): Standings {
  const freeBy = new Map<string, string[]>(o.nights.map((n) => [n, []]));
  for (const v of o.nightVotes) freeBy.get(v.night_start)?.push(v.user_id);

  const vibesPerUser = new Map<string, number>();
  const vibeCounts = new Map<Vibe, number>();
  for (const v of o.vibeVotes) {
    vibesPerUser.set(v.user_id, (vibesPerUser.get(v.user_id) ?? 0) + 1);
    vibeCounts.set(v.vibe, (vibeCounts.get(v.vibe) ?? 0) + 1);
  }

  const enthusiasm = (night: string) => (freeBy.get(night) ?? []).reduce((n, u) => n + (vibesPerUser.get(u) ?? 0), 0);
  const leadNight =
    [...o.nights].sort(
      (a, b) =>
        (freeBy.get(b)?.length ?? 0) - (freeBy.get(a)?.length ?? 0) || enthusiasm(b) - enthusiasm(a) || a.localeCompare(b),
    )[0] ?? null;

  const leadVibe =
    [...vibeCounts.entries()].sort((a, b) => b[1] - a[1] || VIBE_ORDER.indexOf(a[0]) - VIBE_ORDER.indexOf(b[0]))[0]?.[0] ?? null;

  return {
    leadNight,
    freeBy,
    vibeCounts,
    leadVibe,
    leadIdea: o.ideas[0] ?? null,
    votedCount: o.people.filter((p) => p.voted_at).length,
    waitingOn: o.people.filter((p) => !p.voted_at).map((p) => p.profile).filter((p): p is Profile => !!p),
  };
}

// ─── Formatting ─────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function nightShort(iso: string) {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()}`;
}
export function nightLong(iso: string) {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function nightDayName(iso: string) {
  return LONG_DAYS[new Date(iso).getDay()];
}
export function vibeName(v: Vibe | null) {
  return VIBES.find((x) => x.id === v)?.label ?? null;
}

export function buzzerIn(iso: string, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'Buzzing now';
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `Buzzer in ${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `Buzzer in ${h}h ${mins % 60}m`;
  const d = Math.floor(h / 24);
  return `Buzzer in ${d}d ${h % 24}h`;
}

/** Re-renders every `ms` so countdowns stay fresh. */
export function useTick(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** "Jo, Priya +2" */
export function namesShort(people: (Profile | null | undefined)[], me?: string | null, max = 3) {
  const names = people.map((p) => (p?.id === me ? 'You' : p?.display_name ?? '?'));
  return names.slice(0, max).join(', ') + (names.length > max ? ` +${names.length - max}` : '');
}

// ─── The buzzer ─────────────────────────────────────────────────

/**
 * Locks in any open Roam whose buzzer has gone off. Safe to call repeatedly.
 * Returns how many actually locked (a phone clock running ahead of the
 * server gets "too_early" and simply tries again on the next tick).
 */
export async function resolveDue(openRoams: OpenRoam[], now = Date.now()) {
  const due = openRoams.filter((o) => o.status === 'open' && new Date(o.buzzer_at).getTime() <= now);
  const results = await Promise.all(due.map((o) => supabase.rpc('resolve_open_roam', { p_open: o.id })));
  return results.filter((r) => !r.error).length;
}

// Which buzzer results you've already seen (kept on this phone).
const SEEN_KEY = 'roami.buzzerSeen';
export function seenBuzzers(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
export function markBuzzerSeen(id: string) {
  try {
    const s = seenBuzzers();
    s.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-100)));
  } catch {
    // best effort
  }
}

/** Friendly errors from the open Roam functions. */
const ERRORS: Record<string, string> = {
  no_nights: 'Pick at least one night.',
  too_many_nights: 'Seven nights max. Commitment issues?',
  night_in_past: "One of those nights has already happened.",
  too_far_ahead: 'Nights have to be in the next two weeks.',
  buzzer_in_past: "The buzzer can't be in the past.",
  buzzer_after_first_night: 'The buzzer has to go off before your first night.',
  too_many_open_roams: 'You have 3 votes going already. Let one buzz first.',
  no_friends_invited: 'Pick at least one friend.',
  voting_closed: 'Too late, the buzzer already went off.',
  too_many_ideas: "That's 3 ideas from you. Let someone else cook.",
  load_test_friends_first: 'Load test friends first.',
};
export function openRoamError(e: unknown) {
  const msg = (e as { message?: string })?.message ?? String(e);
  const key = Object.keys(ERRORS).find((k) => msg.includes(k));
  return key ? ERRORS[key] : 'Something went sideways. Try again?';
}
