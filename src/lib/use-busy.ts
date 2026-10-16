import { useEffect, useState } from 'react';

import { busyBetween, type BusyEvent } from './calendar';

/** Your calendar events in a time range (empty if calendar checks are off). */
export function useBusy(start: Date | null, end: Date | null) {
  const [events, setEvents] = useState<BusyEvent[] | null>(null);
  const s = start?.getTime() ?? null;
  const e = end?.getTime() ?? null;

  useEffect(() => {
    if (s === null || e === null) return;
    let cancelled = false;
    busyBetween(new Date(s), new Date(e)).then((ev) => {
      if (!cancelled) setEvents(ev);
    });
    return () => {
      cancelled = true;
    };
  }, [s, e]);

  return events;
}

/** Groups busy events by local day key "YYYY-MM-DD". */
export function byDay(events: BusyEvent[] | null) {
  const out = new Map<string, BusyEvent[]>();
  for (const ev of events ?? []) {
    const d = ev.start;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.set(key, [...(out.get(key) ?? []), ev]);
  }
  return out;
}

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
