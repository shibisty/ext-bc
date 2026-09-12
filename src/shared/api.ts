/**
 * Cross-browser shim.
 *
 * Firefox exposes a native, promise-based `browser` namespace; Chrome's MV3
 * `chrome` namespace also returns promises for the APIs this extension uses
 * when the callback argument is omitted. Using `api` everywhere lets the same
 * bundle run unmodified on both.
 */
declare const browser: typeof chrome | undefined;

export const api: typeof chrome = typeof browser !== "undefined" ? browser : chrome;

/**
 * Subscribes to an event that a given browser may simply not have.
 *
 * Not every event in @types/chrome exists everywhere: Firefox has no
 * `bookmarks.onChildrenReordered`, and reading `.addListener` off that
 * `undefined` threw at the top of the background script — which killed the
 * whole script, so messages went unanswered and nothing in the extension
 * worked. A missing event means one less notification, never a dead worker.
 */
export function onEvent<T extends unknown[]>(
  event: chrome.events.Event<(...args: T) => void> | undefined,
  listener: (...args: T) => void,
): void {
  if (!event || typeof event.addListener !== "function") return;
  try {
    event.addListener(listener);
  } catch {
    // An event the browser declares but refuses to wire up: same story.
  }
}

/**
 * Whether `runtime.onMessage` answers by resolving a returned promise instead
 * of by `sendResponse` + `return true`.
 *
 * This is the Firefox/Chrome split, and getting it wrong is invisible until
 * runtime: Chrome keeps the channel open only for a literal `true`, while
 * Firefox has historically ignored that and expects the listener to return a
 * promise — every message then went unanswered, which is what made the popup
 * report the worker as broken on Firefox. `getBrowserInfo` is Firefox-only, so
 * it identifies the engine without sniffing the user agent.
 */
export function usesPromiseMessaging(): boolean {
  const runtime = api.runtime as typeof chrome.runtime & {
    getBrowserInfo?: () => Promise<unknown>;
  };
  return typeof runtime.getBrowserInfo === "function";
}

/**
 * Firefox's own sidebar API. It is not in @types/chrome, so the small part of
 * it this extension uses is declared here.
 */
interface SidebarAction {
  open: () => Promise<void>;
  close?: () => Promise<void>;
}

type WithSidebar = typeof chrome & { sidebarAction?: SidebarAction };

/** Firefox's sidebarAction, when running there. */
export function sidebarAction(): SidebarAction | undefined {
  return (api as WithSidebar).sidebarAction;
}

/**
 * Whether this browser can show the list in a side panel at all: Chrome through
 * sidePanel, Firefox through its own sidebar. Only older builds of either have
 * neither.
 */
export function hasSidePanel(): boolean {
  return typeof api.sidePanel !== "undefined" || sidebarAction() !== undefined;
}

/**
 * Whether a call to `openSidePanel` would actually open something — decided
 * without awaiting anything, so a caller can act on the answer while still
 * inside the click that produced it.
 */
export function canOpenSidePanel(windowId: number | null): boolean {
  if (sidebarAction() !== undefined) return true;
  return typeof api.sidePanel !== "undefined" && windowId !== null;
}

/**
 * Opens the side panel / sidebar, whichever this browser provides.
 *
 * Returns whether a panel was actually opened. "Nothing to open" is not the
 * same as success: callers that close the popup behind it would otherwise
 * leave the user with neither window.
 */
export async function openSidePanel(windowId: number | null): Promise<boolean> {
  const sidebar = sidebarAction();
  if (sidebar) {
    // Firefox requires a user gesture, which every caller here has.
    await sidebar.open();
    return true;
  }
  if (typeof api.sidePanel === "undefined" || windowId === null) return false;
  await api.sidePanel.open({ windowId });
  return true;
}
