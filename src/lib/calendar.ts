import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import { clock } from './roams';
import { kv } from './storage';
import { supabase } from './supabase';

/**
 * Sync with the phone's calendars (Apple Calendar, or Google Calendar on Android): Roams you're In
 * on are added, updated and removed, and your own plans are shown when you decide. Event ids only
 * make sense on this phone, so the Roam-to-event links are stored here. Not available in Expo Go.
 */

type CalendarModule = typeof import('expo-calendar');
let mod: Promise<CalendarModule> | null = null;
const cal = () => (mod ??= import('expo-calendar'));

export const calendarAvailable = !isRunningInExpoGo();

// ─── Preferences (on this phone) ────────────────────────────────

type Prefs = { sync: boolean; calendarId: string | null; showPlans: boolean; asked: boolean };
type Link = { eventId: string; starts: string; ends: string; what: string; location: string | null };

const PREFS_KEY = 'roami.calendar.prefs';
const LINKS_KEY = 'roami.calendar.links';


export function calendarPrefs(): Prefs {
  return kv.getJSON<Prefs>(PREFS_KEY, { sync: false, calendarId: null, showPlans: false, asked: false });
}
export function setCalendarPrefs(patch: Partial<Prefs>) {
  kv.setJSON(PREFS_KEY, { ...calendarPrefs(), ...patch, asked: true });
}
const links = () => kv.getJSON<Record<string, Link>>(LINKS_KEY, {});
const saveLinks = (l: Record<string, Link>) => kv.setJSON(LINKS_KEY, l);

// ─── Access + calendars ─────────────────────────────────────────

export const requestCalendarAccess = async () => calendarAvailable && (await (await cal()).requestCalendarPermissions()).status === 'granted';
const hasCalendarAccess = async () =>
  calendarAvailable && (await (await cal()).getCalendarPermissions().catch(() => null))?.status === 'granted';

export type PhoneCalendar = { id: string; title: string; color: string | null; account: string | null };

export async function writableCalendars(): Promise<PhoneCalendar[]> {
  return (await (await cal()).getCalendars())
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
let again = false;

/**
 * Adds, updates and removes calendar events to match your Roams. Safe to call
 * often: if a sync is already running, one more runs straight after it, so a
 * change made mid-sync (you just tapped In) is never missed.
 */
export function syncCalendar(userId: string): Promise<void> {
  if (!calendarAvailable || !calendarPrefs().sync) return Promise.resolve();
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = (async () => {
    do {
      again = false;
      try {
        await doSync(userId);
      } catch {
        // best effort; the next change tries again
      }
    } while (again);
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function calendarFor(C: CalendarModule, preferred: string) {
  try {
    return await C.ExpoCalendar.get(preferred);
  } catch {
    // The chosen calendar was deleted or hidden: use the phone's default instead.
    const fallback = await defaultCalendarId();
    if (!fallback || fallback === preferred) throw new Error('no_calendar');
    setCalendarPrefs({ calendarId: fallback });
    return C.ExpoCalendar.get(fallback);
  }
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

  // The host is always In, until they say they can't make it (then their answer is Can't).
  const shouldBeIn = (r: InviteRow) =>
    !!r.roam && r.roam.status !== 'cancelled' && new Date(r.roam.ends_at) > new Date() && r.response === 'in';

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
        const calendar = await calendarFor(C, calendarId);
        const event = await calendar.createEvent({ ...details, alarms: [{ relativeOffset: -60 }] });
        linked[roam.id] = { eventId: event.id, starts: roam.starts_at, ends: roam.ends_at, what: roam.what, location: roam.location };
        // Saved straight away, so an app closed mid-sync can't leave a duplicate behind.
        saveLinks(linked);
        continue;
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
  saveLinks(linked);

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
    await deleteEvent(C, link.eventId);
    delete linked[roamId];
  }

  saveLinks(linked);
}

/** Turning sync off: optionally remove the events Roami added. */
export async function removeAllRoamiEvents() {
  if (!calendarAvailable) return;
  const C = await cal();
  for (const link of Object.values(links())) await deleteEvent(C, link.eventId);
  saveLinks({});
}

async function deleteEvent(C: CalendarModule, eventId: string) {
  if (!eventId) return;
  await C.ExpoCalendarEvent.get(eventId).then((e) => e.delete()).catch(() => {}); // already gone is fine
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

export const busyLabel = (e: BusyEvent) => (e.allDay ? `${e.title} (all day)` : `${e.title}, ${clock(e.start)}–${clock(e.end)}`);
