/**
 * User preferences that only affect this view: how a bookmark opens, how much
 * of each row is shown, and whether the row buttons are visible at all.
 *
 * They live in localStorage next to the theme and language: the popup and the
 * side panel share an origin, so both pick up a change without any storage
 * traffic, and none of it belongs in the synced extension state.
 */

/** Whether a plain click opens a bookmark, or it takes a double click. */
export type OpenTrigger = "dblclick" | "click";
/** Where an opened bookmark lands. */
export type OpenTarget = "new" | "current";
/** How much of a row is shown. */
export type RowDetail = "full" | "title";
/** Whether the per-row buttons are shown, or only the context menu. */
export type RowActions = "buttons" | "menu";
/** Whether the popup stays open after a bookmark is opened. */
export type AfterOpen = "keep" | "close";
/** Whether a long title wraps onto a second line. */
export type TitleLines = "one" | "two";
/** Whether pinning also puts a copy on the bookmarks toolbar. */
export type PinToToolbar = "off" | "on";
/** Whether the search box still holds the query the next time it is opened. */
export type RememberSearch = "remember" | "reset";

export interface Preferences {
  openTrigger: OpenTrigger;
  openTarget: OpenTarget;
  rowDetail: RowDetail;
  rowActions: RowActions;
  afterOpen: AfterOpen;
  titleLines: TitleLines;
  pinToToolbar: PinToToolbar;
  rememberSearch: RememberSearch;
}

export const DEFAULT_PREFERENCES: Preferences = {
  openTrigger: "dblclick",
  openTarget: "new",
  rowDetail: "full",
  rowActions: "buttons",
  afterOpen: "keep",
  titleLines: "one",
  pinToToolbar: "off",
  rememberSearch: "remember",
};

const STORAGE_KEYS: Record<keyof Preferences, string> = {
  openTrigger: "bscOpenTrigger",
  openTarget: "bscOpenTarget",
  rowDetail: "bscRowDetail",
  rowActions: "bscRowActions",
  afterOpen: "bscAfterOpen",
  titleLines: "bscTitleLines",
  pinToToolbar: "bscPinToToolbar",
  rememberSearch: "bscRememberSearch",
};

const ALLOWED: Record<keyof Preferences, readonly string[]> = {
  openTrigger: ["dblclick", "click"],
  openTarget: ["new", "current"],
  rowDetail: ["full", "title"],
  rowActions: ["buttons", "menu"],
  afterOpen: ["keep", "close"],
  titleLines: ["one", "two"],
  pinToToolbar: ["off", "on"],
  rememberSearch: ["remember", "reset"],
};

/** Narrows a stored string back to its preference type, or the default. */
export function coerce<K extends keyof Preferences>(key: K, value: unknown): Preferences[K] {
  const allowed = ALLOWED[key];
  return (typeof value === "string" && allowed.includes(value)
    ? value
    : DEFAULT_PREFERENCES[key]) as Preferences[K];
}

let current: Preferences = { ...DEFAULT_PREFERENCES };

export function preferences(): Preferences {
  return current;
}

function read(key: keyof Preferences): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS[key]);
  } catch {
    return null; // private window, or site data blocked
  }
}

export function loadPreferences(): Preferences {
  current = {
    openTrigger: coerce("openTrigger", read("openTrigger")),
    openTarget: coerce("openTarget", read("openTarget")),
    rowDetail: coerce("rowDetail", read("rowDetail")),
    rowActions: coerce("rowActions", read("rowActions")),
    afterOpen: coerce("afterOpen", read("afterOpen")),
    titleLines: coerce("titleLines", read("titleLines")),
    pinToToolbar: coerce("pinToToolbar", read("pinToToolbar")),
    rememberSearch: coerce("rememberSearch", read("rememberSearch")),
  };
  return current;
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(STORAGE_KEYS[key], value);
  } catch {
    // Not remembering a preference is survivable.
  }
}

/**
 * The two display preferences are pure CSS, so they ride on body classes rather
 * than being threaded through every render.
 */
export function applyDisplayPreferences(prefs: Preferences = current): void {
  document.body.classList.toggle("rows-title-only", prefs.rowDetail === "title");
  document.body.classList.toggle("actions-menu-only", prefs.rowActions === "menu");
  document.body.classList.toggle("titles-two-lines", prefs.titleLines === "two");
}
