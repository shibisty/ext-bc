import { api, hasSidePanel, openSidePanel } from "../shared/api";
import { t } from "../shared/i18n";
import { sendMessage, type Message, type MessageResponse } from "../shared/messages";
import { showNotice } from "./notice";
import { preferences } from "./preferences";
import { applyState, ui } from "./ui-state";
import { isSidePanelContext } from "./dom";

export interface OpenOptions {
  /** Force a background tab (opening a whole selection at once). */
  active?: boolean;
  /** Ignore the "open in current tab" preference — several at once need tabs. */
  forceNewTab?: boolean;
}

export function openInNewTab(url: string, opts: OpenOptions = {}): void {
  const active = opts.active ?? true;
  const prefs = preferences();

  // Only carry the side panel along automatically when the click happened
  // *inside* the side panel itself — not when opening from the regular popup.
  if (isSidePanelContext && hasSidePanel()) {
    // Keep the panel alive across the navigation it just triggered.
    void openSidePanel(ui.currentWindowId).catch(() => undefined);
  }

  const inCurrentTab = prefs.openTarget === "current" && !opts.forceNewTab && active;

  if (inCurrentTab) {
    // tabs.update navigates the tab the ordinary way, so the visit lands in
    // history and Back returns to whatever was open before.
    void api.tabs.update({ url });
  } else {
    void api.tabs.create({ url, active });
  }

  // The side panel is not a transient window — closing it here would be rude.
  if (!isSidePanelContext && prefs.afterOpen === "close" && active) {
    window.close();
  }
}

/**
 * One round trip to the background worker, with the failure made visible.
 * A rejected promise here means the worker never answered — most often a stale
 * service worker left behind by an update, which needs an extension reload.
 */
export async function request(msg: Message): Promise<MessageResponse | undefined> {
  try {
    const res = await sendMessage(msg);
    if (!res?.ok) showNotice(t("actionFailed"));
    return res;
  } catch {
    showNotice(t("actionFailed"));
    return undefined;
  }
}

export async function togglePin(id: string): Promise<void> {
  const res = await request({
    type: "TOGGLE_PIN",
    id,
    mirrorToToolbar: preferences().pinToToolbar === "on",
  });
  if (res?.ok) applyState(res.state);
}

export async function toggleDisableCheck(id: string): Promise<void> {
  const res = await request({ type: "TOGGLE_DISABLE_CHECK", id });
  if (res?.ok) applyState(res.state);
}

export async function toggleArchive(id: string): Promise<void> {
  const res = await request({ type: "TOGGLE_ARCHIVE", id });
  if (res?.ok) applyState(res.state);
}

export async function checkOne(id: string): Promise<void> {
  const res = await request({ type: "CHECK_ONE", id });
  if (res?.ok) applyState(res.state);
}

export async function bulkDelete(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;

  const firstId = ids[0];
  const title = (firstId && ui.lastState?.items[firstId]?.title) || "";
  const message =
    ids.length === 1
      ? t("deleteConfirm", [title])
      : t("deleteManyConfirm", [String(ids.length)]);

  if (!confirm(message)) return;

  const res =
    ids.length === 1 && firstId
      ? await request({ type: "DELETE", id: firstId })
      : await request({ type: "DELETE_MANY", ids: [...ids] });

  if (res?.ok) {
    ui.selectedIds.clear();
    applyState(res.state);
  }
}

export function openSelected(): void {
  const state = ui.lastState;
  if (!state) return;
  for (const id of ui.selectedIds) {
    const item = state.items[id];
    if (item?.url) openInNewTab(item.url, { active: false, forceNewTab: true });
  }
}
