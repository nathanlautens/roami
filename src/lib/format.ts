import type { Profile } from './types';

// ─── Time ───────────────────────────────────────────────────────

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "7pm", "7:30pm" */
export function clock(d: Date) {
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/** Whole minutes split into hours and days, for countdowns. */
export function splitMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  return { h, m: mins % 60, d: Math.floor(h / 24), hOfDay: h % 24 };
}

// ─── People ─────────────────────────────────────────────────────

/** "You" for me, otherwise their name (or the fallback). */
export function displayName(p: Profile | null | undefined, me?: string | null, fallback = '?') {
  return p?.id === me ? 'You' : p?.display_name ?? fallback;
}

/** "Jo, Priya, Sam +2" */
export function joinShort(names: string[], max = 3) {
  return names.slice(0, max).join(', ') + (names.length > max ? ` +${names.length - max}` : '');
}

/** "1 person", "3 people" */
export function people(n: number) {
  return `${n} ${n === 1 ? 'person' : 'people'}`;
}
