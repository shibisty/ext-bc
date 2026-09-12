import { api } from "./api";
import type { State } from "./types";

export const DEFAULT_INTERVAL_MINUTES = 60;

/**
 * Recorded in `lastSyncError` when the browser exposes no bookmarks API at all.
 * A code, not a sentence: the background records it and the popup renders it in
 * the user's language. Lives here because both sides need it and neither should
 * have to import the other's bundle.
 */
export const NO_BOOKMARKS_API = "NO_BOOKMARKS_API";

/**
 * Default value for every persisted key. The key list used by `readState()` is
 * derived from this object, so adding a field to `State` + a default here is
 * all it takes to make it available on both sides of the extension.
 */
export const DEFAULTS: State = {
  tree: [],
  order: [],
  items: {},
  pinned: [],
  disabledChecks: [],
  archived: [],
  toolbarPins: {},
  currentIndex: 0,
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  sendCredentials: false,
  lastCheck: null,
  checking: false,
  checkingSince: null,
  lastSyncError: null,
};

export const STATE_KEYS = Object.keys(DEFAULTS) as (keyof State)[];

/**
 * Reads the whole state straight from storage, falling back to `DEFAULTS` for
 * anything missing or nulled out. Fast enough to call on every storage change,
 * and it works even while the background worker is asleep.
 */
export async function readState(): Promise<State> {
  const raw = (await api.storage.local.get(STATE_KEYS)) as Partial<State>;
  // A deep copy, not a spread: a spread would hand every caller the very same
  // `DEFAULTS.order` array, and one caller mutating its state would corrupt the
  // defaults for the rest of the session.
  const state: State = structuredClone(DEFAULTS);

  for (const key of STATE_KEYS) {
    const value = raw[key];
    if (value !== undefined && value !== null) {
      // The key/value pairing is guaranteed by the `Partial<State>` read above,
      // but TypeScript can't correlate a `keyof State` key with its own value.
      (state as unknown as Record<string, unknown>)[key] = value;
    }
  }

  return state;
}

export function writeState(patch: Partial<State>): Promise<void> {
  return api.storage.local.set(patch);
}
