import { canOpenSidePanel, hasSidePanel, openSidePanel } from "../shared/api";
import { closePopupWindow } from "./dom";
import { loadWindowId, ui } from "./ui-state";

/**
 * Moves the list into the browser's side panel.
 *
 * The popup closes behind it: two copies of the same list side by side is
 * clutter, and the popup is the transient one. `closePopupWindow` is a no-op
 * when this document *is* the panel or the tab view.
 */
export async function openSidePanelFromPopup(): Promise<void> {
  if (!hasSidePanel()) return;

  // Normally known since init; only looked up here if that lookup failed, since
  // Chrome wants the panel opened straight out of the click.
  if (ui.currentWindowId === null) await loadWindowId();

  // Asked before the call, not after it: whether there is a panel to open is
  // knowable right now, and the answer is what decides the popup's fate.
  if (!canOpenSidePanel(ui.currentWindowId)) return;

  const opening = openSidePanel(ui.currentWindowId).catch(() => false);

  // Closing does not wait for that promise. Chrome does not settle it until the
  // panel has finished loading, which is long after the popup should have gone
  // — awaiting it left the popup sitting on screen beside the open panel.
  closePopupWindow();

  await opening;
}
