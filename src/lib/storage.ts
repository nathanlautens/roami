import 'expo-sqlite/localStorage/install';

/**
 * Small key-value settings kept on this phone (Face ID on/off, calendar
 * prefs, which buzzers you've seen, the encrypted session blob…).
 *
 * Backed by expo-sqlite's localStorage, whose reads are synchronous SQLite
 * queries on the JS thread. Values are cached in memory after the first read
 * and written through, so reading a setting during render is free.
 * Storage failures never throw: settings are best effort.
 */

const cache = new Map<string, string | null>();

export const kv = {
  get(key: string): string | null {
    if (cache.has(key)) return cache.get(key)!;
    let value: string | null = null;
    try {
      value = localStorage.getItem(key);
    } catch {
      // unreadable: treat as unset
    }
    cache.set(key, value);
    return value;
  },

  set(key: string, value: string | null) {
    cache.set(key, value);
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // best effort
    }
  },

  /** Parsed JSON, or `fallback` if missing or unreadable. Objects are merged over `fallback`. */
  getJSON<T>(key: string, fallback: T): T {
    const raw = kv.get(key);
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw) as T;
      return fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? { ...fallback, ...parsed } : parsed;
    } catch {
      return fallback;
    }
  },

  setJSON(key: string, value: unknown) {
    kv.set(key, JSON.stringify(value));
  },
};
