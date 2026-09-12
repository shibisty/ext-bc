import { t } from "../shared/i18n";
import { request } from "./actions";
import { dom } from "./dom";
import { applyState } from "./ui-state";

/**
 * Renaming goes through the browser's own bookmark, so the new title shows up
 * in the bookmarks bar and manager too — this dialog only collects the text.
 */
let editingId: string | null = null;

function close(): void {
  editingId = null;
  dom.renameDialog?.close();
}

async function save(): Promise<void> {
  const id = editingId;
  const title = dom.renameInput?.value ?? "";
  close();
  if (!id || !title.trim()) return;

  const res = await request({ type: "RENAME", id, title });
  if (res?.ok) applyState(res.state);
}

export function openRenameDialog(id: string, currentTitle: string): void {
  const dialog = dom.renameDialog;
  const input = dom.renameInput;
  if (!dialog || !input) return;

  editingId = id;
  input.value = currentTitle;

  // showModal keeps focus trapped in the dialog and handles Escape for us.
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");

  input.focus();
  input.select();
}

export function registerRenameHandlers(): void {
  const dialog = dom.renameDialog;
  if (!dialog) return;

  dom.renameSaveBtn?.addEventListener("click", () => void save());
  dom.renameCancelBtn?.addEventListener("click", close);

  dom.renameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  });

  // A cancelled dialog (Escape, backdrop) must not leave an id armed.
  dialog.addEventListener("close", () => {
    editingId = null;
  });

  if (dom.renameTitleLabel) dom.renameTitleLabel.textContent = t("renameTitle");
}
