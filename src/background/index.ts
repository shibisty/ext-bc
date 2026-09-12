// ===== Bookmark Status Checker — background service worker =====
//
// Entry point: wiring only. The work lives in the sibling modules.

import { api, onEvent } from "../shared/api";
import { ALARM_NAME, setupAlarm } from "./alarms";
import { syncBookmarks } from "./bookmarks";
import { checkNext } from "./checker";
import { withLock } from "./lock";
import { registerMessageRouter } from "./router";

const SYNC_DEBOUNCE_MS = 300;

/**
 * Take over from the previous worker at once.
 *
 * Without this, an update can leave the *old* background script serving while
 * the new popup is already loaded: everything the old version knew keeps
 * working and every new message goes unanswered, so new features look silently
 * broken. Reproduced on an update from 1.3.1 — the manifest read 1.5.0 and the
 * popup was new, but TOGGLE_ARCHIVE never came back.
 *
 * Firefox runs this as an event page rather than a service worker, where
 * neither call exists — hence the guards.
 */
interface WorkerScope {
  addEventListener?: (type: string, listener: (event: { waitUntil?: (p: Promise<unknown>) => void }) => void) => void;
  skipWaiting?: () => Promise<void>;
  clients?: { claim: () => Promise<void> };
}

function claimControl(): void {
  const worker = self as unknown as WorkerScope;
  try {
    worker.addEventListener?.("install", () => void worker.skipWaiting?.());
    worker.addEventListener?.("activate", (event) => {
      const claim = worker.clients?.claim();
      if (claim) event.waitUntil?.(claim);
    });
  } catch {
    // Not a service worker (Firefox runs an event page) — nothing to claim.
  }
}

claimControl();

onEvent(api.alarms.onAlarm, (alarm) => {
  if (alarm.name === ALARM_NAME) void withLock(checkNext);
});

onEvent(api.runtime.onInstalled, () => {
  void (async () => {
    await withLock(syncBookmarks);
    await setupAlarm();
    if (typeof api.sidePanel !== "undefined" && api.sidePanel.setPanelBehavior) {
      try {
        await api.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
      } catch {
        // Older Chrome without side panel support — ignore.
      }
    }
  })();
});

onEvent(api.runtime.onStartup, () => {
  void (async () => {
    // Bookmarks can change while the browser is closed, and this is also where
    // state written by an older version gets brought up to date.
    await withLock(syncBookmarks);
    await setupAlarm();
  })();
});

// ---------- live auto-sync on any bookmarks change ----------

let syncDebounce: ReturnType<typeof setTimeout> | undefined;

function scheduleSync(): void {
  clearTimeout(syncDebounce);
  syncDebounce = setTimeout(() => void withLock(syncBookmarks), SYNC_DEBOUNCE_MS);
}

// Firefox implements only some of these — onChildrenReordered is missing there,
// and touching it directly used to throw and take the whole script down.
onEvent(api.bookmarks.onCreated, scheduleSync);
onEvent(api.bookmarks.onRemoved, scheduleSync);
onEvent(api.bookmarks.onChanged, scheduleSync);
onEvent(api.bookmarks.onMoved, scheduleSync);
onEvent(api.bookmarks.onChildrenReordered, scheduleSync);
onEvent(api.bookmarks.onImportEnded, scheduleSync);

registerMessageRouter();
