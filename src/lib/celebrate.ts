import { useSyncExternalStore } from 'react';

/** A tiny signal: the send screen fires it, the home screen plays the celebration. */
export type Sent = { id: number; what: string; count: number; title?: string; line?: string };

let current: Sent | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

export function celebrateSent(sent: Omit<Sent, 'id'>) {
  current = { ...sent, id: nextId++ };
  listeners.forEach((l) => l());
}

export function clearCelebration() {
  current = null;
  listeners.forEach((l) => l());
}

export function useCelebration(): Sent | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
