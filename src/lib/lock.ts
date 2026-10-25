import { useSyncExternalStore } from 'react';

/** Whether the Face ID / fingerprint cover is showing, so pop-ups can wait until you're in. */
let locked = false;
const listeners = new Set<() => void>();

export function setAppLocked(value: boolean) {
  if (locked === value) return;
  locked = value;
  listeners.forEach((l) => l());
}

export function useAppLocked() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => locked,
  );
}
