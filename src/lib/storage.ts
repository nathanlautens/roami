/**
 * Small values kept on this phone. Every call is best effort: storage can be
 * unavailable or full, and nothing here should ever crash the app.
 */

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Saves a value, or removes it when `value` is null. */
export function writeString(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // best effort
  }
}

/** Reads JSON, falling back when it's missing or unreadable. Objects are merged over the fallback. */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return isPlainObject(fallback) && isPlainObject(parsed) ? { ...fallback, ...parsed } : (parsed as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown) {
  writeString(key, JSON.stringify(value));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
