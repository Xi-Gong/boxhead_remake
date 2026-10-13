/**
 * AS2 SharedObject.getLocal(name) -> { data, flush(), clear(), getSize() }.   OWNER: lane D (platform)
 *
 * Persists `data` as JSON in storage key `SO:<name>`:
 *   - browser / Electron: window.localStorage (Electron: the app:// origin's Local Storage lives in userData, which the
 *     portable exe redirects next to itself — see electron/main.ts);
 *   - Node tests / headless: an in-memory store (or one injected with `_setStorage`).
 *
 * Flash semantics kept:
 *   - getLocal returns the same instance for the same name (per session).
 *   - flush() writes immediately and returns true (false if storage is unavailable/full).
 *   - Flash also writes every SharedObject when the movie is unloaded; we flush all instances on `pagehide`.
 *   - clear() empties `data` in place (the reference stays valid) and deletes the stored copy.
 *   - Values round-trip through JSON: number/string/boolean/null/array/object. `undefined` members are dropped and
 *     NaN/Infinity become null — the AS2 code only tests `!= undefined`, for which null and undefined are equal.
 */
export interface SharedObjectInstance {
  data: Record<string, any>;
  flush(minDiskSpace?: number): boolean;
  clear(): void;
  getSize(): number;
}

export interface KeyValueStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const memory = new Map<string, string>();
const memoryStorage: KeyValueStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => { memory.set(k, v); },
  removeItem: (k) => { memory.delete(k); },
};
let injected: KeyValueStorage | undefined;

function storage(): KeyValueStorage {
  if (injected) return injected;
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch { /* storage blocked (opaque origin, privacy mode) */ }
  return memoryStorage;
}

const cache = new Map<string, SharedObjectInstance>();
const KEY_PREFIX = 'SO:';
let unloadHooked = false;

function hookUnload(): void {
  if (unloadHooked || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  unloadHooked = true;
  window.addEventListener('pagehide', () => SharedObject._flushAll());
}

export const SharedObject = {
  getLocal(name: string, _localPath?: string, _secure?: boolean): SharedObjectInstance {
    const existing = cache.get(name);
    if (existing) return existing;
    const key = KEY_PREFIX + name;
    let data: Record<string, any> = {};
    try {
      const raw = storage().getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, any>;
      }
    } catch { data = {}; }
    const so: SharedObjectInstance = {
      data,
      flush(): boolean {
        try { storage().setItem(key, JSON.stringify(so.data ?? {})); return true; } catch { return false; }
      },
      clear(): void {
        for (const k of Object.keys(so.data)) delete so.data[k];
        try { storage().removeItem(key); } catch { /* ignore */ }
      },
      getSize(): number {
        try { return JSON.stringify(so.data ?? {}).length; } catch { return 0; }
      },
    };
    cache.set(name, so);
    hookUnload();
    return so;
  },
  /** Write every open SharedObject (Flash does this when the movie unloads). */
  _flushAll(): void { for (const so of cache.values()) so.flush(); },
  /** Tests/platform: use this storage instead of localStorage (undefined = back to default). Forgets open instances. */
  _setStorage(s: KeyValueStorage | undefined): void { injected = s; cache.clear(); },
  /** Tests: simulate an app restart (forget open instances, keep what was stored). */
  _forgetInstances(): void { cache.clear(); },
  /** Test helper: forget cached instances and in-memory storage. */
  _reset(): void { cache.clear(); memory.clear(); },
};
