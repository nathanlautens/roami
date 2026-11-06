import { clock, DAY, DAYS, HOUR, MINUTE, splitMinutes } from './format';
import type { Invite, Response, Roam, Vibe } from './types';

export const VIBES: { id: Vibe; label: string }[] = [
  { id: 'quiet', label: 'Quiet' },
  { id: 'drinks', label: 'Drinks' },
  { id: 'food', label: 'Food' },
  { id: 'active', label: 'Active' },
  { id: 'chill', label: 'Chill' },
  { id: 'chaos', label: 'Chaos' },
];

export function vibeLabel(v: Vibe | null) {
  return VIBES.find((x) => x.id === v)?.label ?? null;
}

export const PROMPTS = [
  "Pub quiz, I'm carrying",
  'Sunset walk?',
  'Someone feed me',
  'Coffee and gossip',
  'Bad film, good snacks',
  'Dancing. Non-negotiable.',
];

// ─── When ───────────────────────────────────────────────────────

export type WhenId = 'now' | 'tonight' | 'tomorrow' | 'weekend';

export const WHENS: { id: WhenId; label: string; sub: string }[] = [
  { id: 'now', label: 'Right now', sub: 'next 3h' },
  { id: 'tonight', label: 'Tonight', sub: '6pm–late' },
  { id: 'tomorrow', label: 'Tomorrow', sub: 'all day' },
  { id: 'weekend', label: 'Weekend', sub: 'Sat–Sun' },
];

function at(d: Date, h: number, m = 0) {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Turns a quick pick into a start/end window. */
export function windowFor(id: WhenId, now = new Date()): { start: Date; end: Date } {
  const lateTonight = at(now, 23, 59);
  switch (id) {
    case 'now':
      return { start: now, end: new Date(now.getTime() + 3 * HOUR) };
    case 'tonight': {
      const six = at(now, 18);
      const start = now > six ? now : six;
      // Already late? Run tonight into the small hours.
      const end = start.getHours() >= 22 ? new Date(start.getTime() + 3 * HOUR) : lateTonight;
      return { start, end };
    }
    case 'tomorrow': {
      const t = addDays(now, 1);
      return { start: at(t, 10), end: at(t, 23, 59) };
    }
    case 'weekend': {
      const day = now.getDay(); // 0 Sun … 6 Sat
      if (day === 6 || day === 0) {
        const sunday = day === 6 ? addDays(now, 1) : now;
        return { start: now, end: at(sunday, 23, 59) };
      }
      const sat = addDays(now, 6 - day);
      return { start: at(sat, 10), end: at(addDays(sat, 1), 23, 59) };
    }
  }
}

// ─── Status ─────────────────────────────────────────────────────

export type RoamState = 'live' | 'on' | 'up_for_grabs' | 'cancelled' | 'done' | 'fizzled';

export function roamState(roam: Roam, inCount: number, now = new Date()): RoamState {
  if (roam.status === 'cancelled') return 'cancelled';
  const ended = new Date(roam.ends_at) <= now;
  // inCount includes the host
  if (ended) return inCount > 1 ? 'done' : 'fizzled';
  if (roam.status === 'up_for_grabs') return 'up_for_grabs';
  return inCount > 1 ? 'on' : 'live';
}

export const STATE_LABEL: Record<RoamState, string> = {
  live: 'Waiting for takers',
  on: "It's on",
  up_for_grabs: 'Up for grabs',
  cancelled: 'Called off',
  done: 'Done',
  fizzled: 'Fizzled',
};

/** A Maybe quietly becomes a Can't an hour before the start. */
export function effectiveResponse(inv: Pick<Invite, 'response'>, roam: Roam, now = new Date()): Response | null {
  if (inv.response === 'maybe' && now.getTime() > new Date(roam.starts_at).getTime() - HOUR) {
    return 'cant';
  }
  return inv.response;
}

export function isActive(roam: Pick<Roam, 'status' | 'ends_at'>, now = new Date()) {
  return roam.status !== 'cancelled' && new Date(roam.ends_at) > now;
}

// ─── Formatting ─────────────────────────────────────────────────

function dayWord(d: Date, now: Date) {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(d) - startOf(now)) / DAY);
  if (diff === 0) return d.getHours() >= 17 ? 'Tonight' : 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return DAYS[d.getDay()];
}

export function formatWhen(roam: Pick<Roam, 'starts_at' | 'ends_at'>, now = new Date()) {
  const s = new Date(roam.starts_at);
  const e = new Date(roam.ends_at);
  if (s <= now && e > now) return `Now – ${clock(e)}`;
  const late = e.getHours() === 23 && e.getMinutes() === 59;
  const sameDay = s.toDateString() === e.toDateString();
  if (sameDay) return `${dayWord(s, now)}, ${clock(s)}${late ? '–late' : `–${clock(e)}`}`;
  return `${dayWord(s, now)} ${clock(s)} – ${dayWord(e, now)}${late ? '' : ` ${clock(e)}`}`;
}

export function startsIn(roam: Roam, now = new Date()) {
  const mins = Math.round((new Date(roam.starts_at).getTime() - now.getTime()) / MINUTE);
  if (mins <= 0) return 'Happening now';
  if (mins < 60) return `Starts in ${mins}m`;
  const { h, m } = splitMinutes(mins);
  if (h < 24) return `Starts in ${h}h ${m}m`;
  return `Starts in ${Math.round(h / 24)}d`;
}

export function daysAgo(iso: string | null, now = new Date()) {
  if (!iso) return 'never roamed yet';
  const d = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
  if (d <= 0) return 'last roamed today';
  if (d === 1) return 'last roamed yesterday';
  return `last roamed ${d} days ago`;
}

/** Circles you haven't roamed with in two weeks get a nudge. */
export function isStale(iso: string | null, now = new Date()) {
  if (!iso) return true;
  return now.getTime() - new Date(iso).getTime() > 14 * DAY;
}

// ─── Errors from the database, in Roami's voice ─────────────────

const ERRORS: Record<string, string> = {
  starts_in_past: "That time's already been and gone.",
  too_far_ahead: 'Roams are for the next 7 days. Spontaneity, remember?',
  too_many_roams: "You've got 5 Roams on the go. Let some land first.",
  no_friends_invited: 'Pick at least one friend to send it to.',
  roam_full: "It's full! Ask the host to bump the spots.",
  roam_cancelled: 'This one got called off.',
  roam_over: "This Roam's already over.",
  not_invited: "You're not on this one.",
  already_taken: "Someone beat you to it. They're hosting now.",
  not_in: 'You need to be In to take this over.',
  not_friends: 'You can only bring your own friends.',
  already_invited: "They're already on this Roam.",
  not_host: 'Only the host can do that.',
  blocked: "You can't add this person.",
  invalid_friend: "You can't add yourself. Iconic, though.",
  host_use_cant_make_it: "You're hosting. Use \"I can't make it\" instead.",
  too_many_reports: 'Slow down a sec and try again later.',
  too_many_requests: "That's a lot of friend requests. Try again in a bit.",
  invalid_avatar: 'That photo needs uploading again.',
};

export const GENERIC_ERROR = 'Something went sideways. Try again?';

/** Turns a database error code inside `e` into a friendly line from `messages`. */
export function matchError(messages: Record<string, string>, e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  const key = Object.keys(messages).find((k) => msg.includes(k));
  return key ? messages[key] : GENERIC_ERROR;
}

export function friendlyError(e: unknown): string {
  return matchError(ERRORS, e);
}
