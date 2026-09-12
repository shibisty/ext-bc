// ===== Bookmark Status Checker — popup / side panel =====

import { api, hasSidePanel, onEvent } from "../shared/api";
import { t } from "../shared/i18n";
import { loadLocale, setLocalePref } from "../shared/i18n";
import { sendMessage } from "../shared/messages";
import { DEFAULT_INTERVAL_MINUTES, readState } from "../shared/storage";
import { dom, isSidePanelContext, isTabContext } from "./dom";
import { render } from "./render/list";
import { renderSkeleton } from "./render/skeleton";
import { collectFolderIds } from "./render/tree";
import { showNotice } from "./notice";
import { registerRenameHandlers } from "./rename";
import { applyStoredHeight, registerResizeHandle } from "./resize";
import { registerScrollMemory } from "./scroll";
import { registerPermissionBanner } from "./permissions";
import { registerKeyboardShortcuts } from "./shortcuts";
import { openSidePanelFromPopup } from "./side-panel";
import { focusSearch, registerSearchHandlers, restoreSearch } from "./search";
import { initTabs } from "./tabs";
import {
  applyCredentials,
  applyPreferences,
  applyTheme,
  localizeStaticMarkup,
  readStoredLanguage,
  readStoredTheme,
  registerSettingsHandlers,
} from "./settings";
import {
  applyState,
  loadCollapsedFolders,
  loadCurrentTabInfo,
  loadWindowId,
  rerender,
  saveCollapsedFolders,
  ui,
} from "./ui-state";

const SKELETON_ROWS = 8;

/** Below this a viewport measurement is treated as "not settled yet". */
const MIN_FIT_HEIGHT = 200;
const VIEWPORT_SETTLE_MS = 250;

/**
 * Keeps the document from overflowing the window the popup actually got.
 *
 * The CSS caps the body at Chrome's 600px popup ceiling, but on a short screen
 * Chrome hands the popup a smaller viewport than that, and the body then
 * scrolls behind the list's own scrollbar — two scrollbars, with the footer
 * pushed out of reach. This measures the viewport it really got instead of
 * guessing from `screen.availHeight`, and only ever shrinks: if the document
 * fits, nothing is touched.
 */
function fitToViewport(): void {
  if (isSidePanelContext || isTabContext) return; // those have real viewports of their own

  const viewport = document.documentElement.clientHeight;

  // A measurement taken before Chrome has finished sizing the popup window can
  // come back near zero. Clamping to that would lock the popup open at a few
  // pixels tall, so anything implausible is ignored: the worst case is then the
  // extra scrollbar this is meant to remove, not an unusable popup.
  if (viewport < MIN_FIT_HEIGHT) return;

  if (document.body.scrollHeight > viewport) {
    document.body.style.maxHeight = `${viewport}px`;
  }
}

function watchViewport(): void {
  requestAnimationFrame(fitToViewport);
  // Re-measured once the window has certainly settled, and again if it changes.
  setTimeout(fitToViewport, VIEWPORT_SETTLE_MS);
  window.addEventListener("resize", fitToViewport);
}

function registerToolbarHandlers(): void {
  dom.collapseAllBtn.addEventListener("click", () => {
    if (!ui.lastState) return;
    const folderIds = collectFolderIds(ui.lastState.tree);
    const anyExpanded = folderIds.some((id) => !ui.collapsedFolderIds.has(id));
    if (anyExpanded) folderIds.forEach((id) => ui.collapsedFolderIds.add(id));
    else ui.collapsedFolderIds.clear();
    saveCollapsedFolders();
    rerender();
  });

  if (dom.sidePanelBtn) {
    const btn = dom.sidePanelBtn;
    if (!hasSidePanel()) {
      btn.style.display = "none"; // Firefox / older Chrome — no side panel support
    }
    btn.addEventListener("click", () => void openSidePanelFromPopup());
  }
}

/**
 * Auto-refresh whenever the background syncs or checks: read straight from
 * storage, which is fast and works even while the worker is asleep.
 */
function registerStorageSync(): void {
  onEvent(api.storage.onChanged, (changes, area) => {
    if (area !== "local") return;
    // Our own collapse-state write — nothing to re-render for.
    if (changes["uiCollapsedFolders"] && Object.keys(changes).length === 1) return;
    void readState().then(render);
  });
}

function applyInterval(minutes: number | null | undefined): void {
  dom.intervalSelect.value = String(minutes ?? DEFAULT_INTERVAL_MINUTES);
}

function applySettingsFromState(state: { intervalMinutes: number; sendCredentials: boolean }): void {
  applyInterval(state.intervalMinutes);
  applyCredentials(state.sendCredentials);
}

async function refresh(): Promise<void> {
  const cached = await readState();
  render(cached);
  applySettingsFromState(cached);
  requestAnimationFrame(fitToViewport);

  // First run: nothing in storage yet, so ask the worker to do the initial walk.
  if (cached.order.length === 0) {
    const res = await sendMessage({ type: "SYNC" });
    if (res?.ok && res.state) {
      applyState(res.state);
      applySettingsFromState(res.state);
    }
  }
}

const HANDSHAKE_TIMEOUT_MS = 4000;

/**
 * Confirms the background worker is the one that shipped with this popup.
 *
 * A browser can keep an older worker registered across an update, in which case
 * anything the old version never knew about goes unanswered and looks broken
 * for no visible reason. Better to say it out loud than to leave buttons inert.
 */
async function verifyWorker(): Promise<void> {
  const expected = api.runtime.getManifest().version;

  const answer = await Promise.race([
    sendMessage({ type: "PING" }).catch(() => undefined),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), HANDSHAKE_TIMEOUT_MS)),
  ]);

  if (!answer?.ok || (answer.version !== undefined && answer.version !== expected)) {
    showNotice(t("workerOutdated"));
  }
}

async function init(): Promise<void> {
  const theme = readStoredTheme();
  applyTheme(theme);
  dom.themeSelect.value = theme;

  const language = readStoredLanguage();
  setLocalePref(language);
  dom.languageSelect.value = language;
  if (language !== "auto") await loadLocale(language);

  if (dom.versionLabel) {
    dom.versionLabel.textContent = `v${api.runtime.getManifest().version}`;
  }

  localizeStaticMarkup(language);
  applyStoredHeight();
  applyPreferences();
  initTabs();
  restoreSearch();
  registerSearchHandlers();
  registerRenameHandlers();
  registerResizeHandle();
  registerScrollMemory();
  registerSettingsHandlers();
  registerToolbarHandlers();
  registerKeyboardShortcuts();
  registerStorageSync();

  renderSkeleton(SKELETON_ROWS);
  focusSearch();
  void verifyWorker();
  void registerPermissionBanner();
  watchViewport();
  await Promise.all([loadCollapsedFolders(), loadCurrentTabInfo(), loadWindowId()]);
  await refresh();
}

void init();
