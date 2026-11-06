import { useSyncExternalStore } from 'react';

/** A tiny shared value that components can watch. */
function signal<T>(value: T) {
  const listeners = new Set<() => void>();
  return {
    set(next: T) {
      if (next === value) return;
      value = next;
      listeners.forEach((l) => l());
    },
    useValue: () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => value),
  };
}

/** Whether the Face ID / fingerprint cover is showing, so pop-ups can wait until you're in. */
const locked = signal(false);
export const setAppLocked = locked.set;
export const useAppLocked = locked.useValue;

/** "Roam sent!": the send screen fires it, the home screen plays it. */
export type Sent = { id: number; what: string; count: number; title?: string; line?: string };
let nextId = 1;
const sent = signal<Sent | null>(null);
export const celebrateSent = (s: Omit<Sent, 'id'>) => sent.set({ ...s, id: nextId++ });
export const clearCelebration = () => sent.set(null);
export const useCelebration = sent.useValue;
