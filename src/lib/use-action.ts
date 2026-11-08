import { useCallback, useState } from 'react';

/**
 * Tracks which async action is running, so buttons can show a spinner and
 * ignore double taps. `run(key, fn)` marks `key` busy until `fn` finishes,
 * even if it throws.
 */
export function useAction<K extends string = string>() {
  const [busy, setBusy] = useState<K | null>(null);
  const run = useCallback(async <T>(key: K, fn: () => PromiseLike<T>): Promise<T> => {
    setBusy(key);
    try {
      return await fn();
    } finally {
      setBusy(null);
    }
  }, []);
  return [busy, run] as const;
}

/** A copy of `set` with `value` added, or removed if it was already there. */
export function toggleIn<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
