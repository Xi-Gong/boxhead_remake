/**
 * Persistent storage for the remake.                                   OWNER: lane D (platform)
 *
 * - Game saves: AS2 `SharedObject.getLocal('BXHD_2PLAY_6')` (engine/flash/SharedObject.ts) -> localStorage `SO:<name>`.
 * - Remake settings (not part of the original save): `renderScale` (1 | 2, default 2), localStorage `boxhead.settings`.
 *   Changing renderScale only stores it and emits a change event; it is applied on the next level load / restart
 *   (the coordinator/lane E decide when to re-rasterise).
 * Electron: localStorage of the app:// origin lives in `userData/Local Storage`, and the portable exe redirects
 * userData to `<exe dir>/Boxhead2PlayRooms-data` (electron/main.ts), so saves travel with the exe.
 */
import { SharedObject } from '../flash/SharedObject.ts';
import type { KeyValueStorage } from '../flash/SharedObject.ts';

export type RenderScale = 1 | 2;

export interface Settings {
  renderScale: RenderScale;
}

const SETTINGS_KEY = 'boxhead.settings';
export const DEFAULT_SETTINGS: Readonly<Settings> = { renderScale: 2 };

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
  } catch { /* blocked */ }
  return memoryStorage;
}

/** Pure: sanitize a stored settings object. */
export function parseSettings(raw: string | null): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (!raw) return s;
  try {
    const o = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    if (o.renderScale === 1 || o.renderScale === 2) s.renderScale = o.renderScale;
  } catch { /* corrupt -> defaults */ }
  return s;
}

type Listener = (s: Settings, changed: keyof Settings) => void;
const listeners = new Set<Listener>();
let cached: Settings | undefined;

export const SaveStore = {
  get settings(): Readonly<Settings> {
    cached ??= parseSettings(safeGet(SETTINGS_KEY));
    return cached;
  },

  get renderScale(): RenderScale { return SaveStore.settings.renderScale; },
  set renderScale(v: RenderScale) { SaveStore.set('renderScale', v === 1 ? 1 : 2); },

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    const next: Settings = { ...SaveStore.settings, [key]: value };
    const changed = next[key] !== SaveStore.settings[key];
    cached = next;
    safeSet(SETTINGS_KEY, JSON.stringify(next));
    if (changed) for (const l of [...listeners]) l(next, key);
  },

  /** Subscribe to settings changes (e.g. "Render: 1x/2x" from the context menu). Returns unsubscribe. */
  onChange(fn: Listener): () => void { listeners.add(fn); return () => listeners.delete(fn); },

  /** Whether localStorage is usable (false in opaque origins / blocked storage -> saves last only this session). */
  get persistent(): boolean {
    if (injected) return true;
    try {
      const k = '__boxhead_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch { return false; }
  },

  /** Raw JSON of an AS2 SharedObject (debug / export). */
  exportSharedObject(name: string): string { return JSON.stringify(SharedObject.getLocal(name).data); },

  /** Flush every open SharedObject now (also happens automatically on pagehide). */
  flushAll(): void { SharedObject._flushAll(); },

  /** Tests: use this storage for settings AND SharedObjects. */
  _setStorage(s: KeyValueStorage | undefined): void { injected = s; cached = undefined; SharedObject._setStorage(s); },
  /** Tests: forget cached settings (simulate restart). */
  _forget(): void { cached = undefined; },
};

function safeGet(k: string): string | null {
  try { return storage().getItem(k); } catch { return null; }
}

function safeSet(k: string, v: string): void {
  try { storage().setItem(k, v); } catch { /* full / blocked */ }
}
