import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Calendar sync with the calendars on this phone: Apple Calendar on iPhone
 * (plus any Google calendars added in Settings), and the phone's calendar on
 * Android (which is Google Calendar).
 *
 *  a) Roams you're In on (or hosting) are added to the calendar you choose.
 *  b) Saying Can't, the host calling it off, or being removed takes them out.
 *     Edits to the time, place or plan update the event.
 *  c) When you're deciding (answering a Roam, voting on nights, picking
 *     nights), Roami shows what's already on your calendar.
 *
 * Calendar access isn't in Expo Go; it works in TestFlight / Play builds.
 * Event ids only make sense on this phone, so the link between a Roam and its
 * calendar event is stored on the phone.
 */

type CalendarModule = typeof import('expo-calendar');
let mod: Promise<CalendarModule> | null = null;
function cal() {
  mod ??= import('expo-calendar');
  return mod;
}

export const calendarAvailable = !isRunningInExpoGo() && Platform.OS !== 'web';

// ─── Preferences (on this phone) ────────────────────────────────

type Prefs = { sync: boolean; calendarId: string | null; showPlans: boolean; asked: boolean };
type Link = { eventId: string; starts: string; ends: string; what: string; location: string | null };

const PREFS_KEY = 'roami.calendar.prefs';
const LINKS_KEY = 'roami.calendar.links';

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best effort
  }
}

export function calendarPrefs(): Prefs {
  return readJSON<Prefs>(PREFS_KEY, { sync: false, calendarId: null, showPlans: false, asked: false });
}
export function setCalendarPrefs(patch: Partial<Prefs>) {
  writeJSON(PREFS_KEY, { ...calendarPrefs(), ...patch, asked: true });
}
function links(): Record<string, Link> {
  return readJSON<Record<string, Link>>(LINKS_KEY, {});
}
function saveLinks(l: Record<string, Link>) {
  writeJSON(LINKS_KEY, l);
}

// ─── Access + calendars ─────────────────────────────────────────

export async function requestCalendarAccess() {
  if (!calendarAvailable) return false;
  const C = await cal();
  const { status } = await C.requestCalendarPermissions();
  return status === 'granted';
}

export async function hasCalendarAccess() {
  if (!calendarAvailable) return false;
  try {
    const C = await cal();
    const { status } = await C.getCalendarPermissions();
    return status === 'granted';
  } catch {
    return false;
  }
}

export type PhoneCalendar = { id: string; title: string; color: string | null; account: string | null };

export async function writableCalendars(): Promise<PhoneCalendar[]> {
  const C = await cal();
  const all = await C.getCalendars();
  return all
    .filter((c) => c.allowsModifications && (c.entityType === undefined || String(c.entityType) === 'event'))
    .map((c) => ({ id: c.id, title: c.title, color: c.color ?? null, account: c.source?.name ?? null }));
}

export async function defaultCalendarId(): Promise<string | null> {
  const C = await cal();
  if (Platform.OS === 'ios') {
    try {
      return C.getDefaultCalendarSync().id;
    } catch {
      // fall through
    }
  }
  const all = await C.getCalendars();
  const writable = all.filter((c) => c.allowsModifications);
  return (writable.find((c) => c.isPrimary) ?? writable[0])?.id ?? null;
}

// ─── a) + b) Keep Roams in the calendar in step ─────────────────

type InviteRow = {
  roam_id: string;
  response: string | null;
  roam: {
    id: string;
    host_id: string;
    what: string;
    location: string | null;
    starts_at: string;
    ends_at: string;
    status: string;
    host: { display_name: string | null } | null;
  } | null;
};

let syncing: Promise<void> | null = null;

/** Adds, updates and removes calendar events to match your Roams. Safe to call often. */
export function syncCalendar(userId: string) {
  if (!calendarAvailable || !calendarPrefs().sync) return Promise.resolve();
  syncing ??= doSync(userId).finally(() => {
    syncing = null;
  });
  return syncing;
}

async function doSync(userId: string) {
  if (!(await hasCalendarAccess())) return;
  const C = await cal();
  const prefs = calendarPrefs();
  const calendarId = prefs.calendarId ?? (await defaultCalendarId());
  if (!calendarId) return;

  const now = new Date().toISOString();
  const linked = links();
  const linkedIds = Object.keys(linked);

  const select = 'roam_id, response, roam:roams!inner(id, host_id, what, location, starts_at, ends_at, status, host:profiles!roams_host_id_fkey(display_name))';
  const [upcoming, known] = await Promise.all([
    supabase.from('roam_invites').select(select).eq('user_id', userId).gt('roam.ends_at', now),
    linkedIds.length
      ? supabase.from('roam_invites').select(select).eq('user_id', userId).in('roam_id', linkedIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  if (upcoming.error || known.error) return;

  const rows = new Map<string, InviteRow>();
  for (const r of [...((known.data ?? []) as unknown as InviteRow[]), ...((upcoming.data ?? []) as unknown as InviteRow[])]) {
    rows.set(r.roam_id, r);
  }

  const shouldBeIn = (r: InviteRow) =>
    !!r.roam && r.roam.status !== 'cancelled' && new Date(r.roam.ends_at) > new Date() && (r.roam.host_id === userId || r.response === 'in');

  // Add or update
  for (const r of rows.values()) {
    if (!r.roam || !shouldBeIn(r)) continue;
    const roam = r.roam;
    const existing = linked[roam.id];
    const details = {
      title: `${roam.what} · Roami`,
      startDate: new Date(roam.starts_at),
      endDate: new Date(roam.ends_at),
      location: roam.location ?? undefined,
      notes: roam.host_id === userId ? "You're hosting. Sent from Roami." : `With ${roam.host?.display_name ?? 'friends'}. Sent from Roami.`,
    };
    try {
      if (!existing) {
        const calendar = await C.ExpoCalendar.get(calendarId);
        const event = await calendar.createEvent({ ...details, alarms: [{ relativeOffset: -60 }] });
        linked[roam.id] = { eventId: event.id, starts: roam.starts_at, ends: roam.ends_at, what: roam.what, location: roam.location };
      } else if (
        existing.eventId &&
        (existing.starts !== roam.starts_at || existing.ends !== roam.ends_at || existing.what !== roam.what || existing.location !== roam.location)
      ) {
        const event = await C.ExpoCalendarEvent.get(existing.eventId);
        await event.update(details);
        linked[roam.id] = { ...existing, starts: roam.starts_at, ends: roam.ends_at, what: roam.what, location: roam.location };
      }
    } catch {
      // You deleted the event yourself: respect that and don't re-add it.
      if (existing) linked[roam.id] = { ...existing, eventId: '' };
    }
  }

  // Remove: you said Can't, it was called off, or you're no longer on it.
  for (const roamId of linkedIds) {
    const link = linked[roamId];
    const r = rows.get(roamId);
    const over = r?.roam && new Date(r.roam.ends_at) <= new Date() && r.roam.status !== 'cancelled';
    if (over) {
      delete linked[roamId]; // it happened: keep the memory in the calendar
      continue;
    }
    if (r && shouldBeIn(r)) continue;
    if (link.eventId) {
      try {
        const event = await C.ExpoCalendarEvent.get(link.eventId);
        await event.delete();
      } catch {
        // already gone
      }
    }
    delete linked[roamId];
  }

  saveLinks(linked);
}

/** Turning sync off: optionally remove the events Roami added. */
export async function removeAllRoamiEvents() {
  if (!calendarAvailable) return;
  const C = await cal();
  const l = links();
  for (const link of Object.values(l)) {
    if (!link.eventId) continue;
    try {
      const event = await C.ExpoCalendarEvent.get(link.eventId);
      await event.delete();
    } catch {
      // already gone
    }
  }
  saveLinks({});
}

// ─── c) What's already on your calendar ─────────────────────────

export type BusyEvent = { title: string; start: Date; end: Date; allDay: boolean };

/** Your events (from every calendar) overlapping a time range, excluding Roami's own. */
export async function busyBetween(start: Date, end: Date): Promise<BusyEvent[]> {
  if (!calendarAvailable || !calendarPrefs().showPlans || !(await hasCalendarAccess())) return [];
  try {
    const C = await cal();
    const calendars = await C.getCalendars();
    const ours = new Set(Object.values(links()).map((l) => l.eventId));
    const events = await C.listEvents(calendars.map((c) => c.id), start, end);
    return events
      .filter((e) => !ours.has(e.id) && !e.title?.endsWith('· Roami'))
      .filter((e) => String(e.availability ?? 'busy') !== 'free')
      .map((e) => ({ title: e.title || 'Busy', start: new Date(e.startDate), end: new Date(e.endDate), allDay: !!e.allDay }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  } catch {
    return [];
  }
}

export function busyLabel(e: BusyEvent) {
  if (e.allDay) return `${e.title} (all day)`;
  const t = (d: Date) => {
    const h = d.getHours() % 12 || 12;
    const m = d.getMinutes();
    return `${h}${m ? `:${String(m).padStart(2, '0')}` : ''}${d.getHours() >= 12 ? 'pm' : 'am'}`;
  };
  return `${e.title}, ${t(e.start)}–${t(e.end)}`;
}
