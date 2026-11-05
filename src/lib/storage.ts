import 'expo-sqlite/localStorage/install';

/**
 * Settings kept on this phone. expo-sqlite's localStorage reads are synchronous SQLite queries,
 * so values are cached in memory after the first read and written through. Never throws.
 */
const cache = new Map<string, string | null>();

export const kv = {
  get(key: string): string | null {
    if (!cache.has(key)) {
      try {
        cache.set(key, localStorage.getItem(key));
      } catch {
        cache.set(key, null);
      }
    }
    return cache.get(key)!;
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
    try {
      const parsed = JSON.parse(kv.get(key) ?? 'null') as T;
      if (parsed === null) return fallback;
      return fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? { ...fallback, ...parsed } : parsed;
    } catch {
      return fallback;
    }
  },
  setJSON: (key: string, value: unknown) => kv.set(key, JSON.stringify(value)),
};
