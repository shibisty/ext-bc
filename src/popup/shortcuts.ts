import { bulkDelete, openSelected } from "./actions";
import { dom } from "./dom";
import { ui } from "./ui-state";

/**
 * Whether the keystroke belongs to something the user is typing into.
 *
 * Delete and Backspace are bookmark shortcuts, but inside a text field they are
 * ordinary editing keys — pressing Backspace in the rename dialog was deleting
 * the selected bookmark instead of a character.
 */
function isTypingTarget(node: unknown): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName);
}

/** Whether list shortcuts should be ignored for this keystroke. */
export function shortcutsBlocked(target: unknown): boolean {
  if (isTypingTarget(target) || isTypingTarget(document.activeElement)) return true;
  // A modal is its own world: nothing outside it may react to a key pressed in it.
  if (dom.renameDialog?.open) return true;
  return !dom.settingsView.hidden;
}

export function registerKeyboardShortcuts(): void {
  document.addEventListener("keydown", (e) => {
    if (shortcutsBlocked(e.target)) return;
    if (ui.selectedIds.size === 0) return;

    if (e.key === "Enter") {
      e.preventDefault();
      openSelected();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      void bulkDelete([...ui.selectedIds]);
    }
  });
}
