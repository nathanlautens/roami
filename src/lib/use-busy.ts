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

/** Your events on a night (from 5pm, 2h before the 7pm start, until midnight). */
export function busyOnNight(events: BusyEvent[] | null, nightIso: string) {
  const start = new Date(nightIso).getTime() - 2 * 3600_000;
  const end = start + 7 * 3600_000;
  return (events ?? []).filter((e) => e.start.getTime() < end && e.end.getTime() > start);
}
