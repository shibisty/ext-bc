import { t } from "../shared/i18n";
import type { Item } from "../shared/types";
import {
  bulkDelete,
  checkOne,
  openInNewTab,
  openSelected,
  toggleArchive,
  toggleDisableCheck,
  togglePin,
} from "./actions";
import { openRenameDialog } from "./rename";
import { ui } from "./ui-state";

const EDGE_PADDING = 6;

let menuEl: HTMLElement | null = null;

function onMenuKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") closeContextMenu();
}

export function closeContextMenu(): void {
  menuEl?.remove();
  menuEl = null;
  document.removeEventListener("click", closeContextMenu, true);
  document.removeEventListener("keydown", onMenuKeydown, true);
}

function menuItem(
  label: string,
  iconChar: string,
  handler: () => void | Promise<void>,
  opts: { danger?: boolean } = {},
): HTMLButtonElement {
  const btn = document.createElement("button");
  if (opts.danger) btn.className = "danger";

  const icon = document.createElement("span");
  icon.className = "cm-icon";
  icon.textContent = iconChar;

  const text = document.createElement("span");
  text.textContent = label;

  btn.append(icon, text);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeContextMenu();
    void handler();
  });

  return btn;
}

function separator(): HTMLElement {
  const el = document.createElement("div");
  el.className = "cm-sep";
  return el;
}

export interface ContextMenuOptions {
  id: string;
  item: Item;
  isPinned: boolean;
  isDisabled: boolean;
  isArchived: boolean;
}

export function showContextMenu(x: number, y: number, opts: ContextMenuOptions): void {
  closeContextMenu();

  const { id, item, isPinned, isDisabled, isArchived } = opts;
  const multi = ui.selectedIds.size > 1 && ui.selectedIds.has(id);
  const selectedCount = String(ui.selectedIds.size);

  const menu = document.createElement("div");
  menu.className = "context-menu";

  const title = document.createElement("div");
  title.className = "cm-title";
  title.textContent = item.title || item.url;

  menu.append(
    title,
    separator(),
    menuItem(t("contextCheckNow"), "🔎", () => checkOne(id)),
    menuItem(t("contextOpenNewTab"), "↗", () => openInNewTab(item.url)),
  );

  if (multi) {
    menu.append(menuItem(t("contextOpenSelected", [selectedCount]), "↗", openSelected));
  }

  menu.append(
    menuItem(t("contextRename"), "✏", () => openRenameDialog(id, item.title || item.url)),
    menuItem(isPinned ? t("contextUnpin") : t("contextPin"), "📌", () => togglePin(id)),
    menuItem(
      isDisabled ? t("contextEnableCheck") : t("contextDisableCheck"),
      isDisabled ? "🔔" : "🔕",
      () => toggleDisableCheck(id),
    ),
    menuItem(
      isArchived ? t("contextUnarchive") : t("contextArchive"),
      isArchived ? "↩" : "🗄",
      () => toggleArchive(id),
    ),
    separator(),
    menuItem(
      multi ? t("contextDeleteSelected", [selectedCount]) : t("contextDelete"),
      "🗑",
      () => bulkDelete(multi ? [...ui.selectedIds] : [id]),
      { danger: true },
    ),
  );

  placeMenu(menu, x, y);
}

/** Attaches a built menu and keeps it inside the popup. */
function placeMenu(menu: HTMLElement, x: number, y: number): void {
  document.body.appendChild(menu);
  menuEl = menu;

  const rect = menu.getBoundingClientRect();
  const maxX = document.documentElement.clientWidth - rect.width - EDGE_PADDING;
  const maxY = document.documentElement.clientHeight - rect.height - EDGE_PADDING;
  menu.style.left = `${Math.max(EDGE_PADDING, Math.min(x, maxX))}px`;
  menu.style.top = `${Math.max(EDGE_PADDING, Math.min(y, maxY))}px`;

  // Deferred so the click that opened the menu doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener("click", closeContextMenu, true);
    document.addEventListener("keydown", onMenuKeydown, true);
  }, 0);
}

/** Folders get their own, much shorter menu: rename and archive. */
export function showFolderContextMenu(
  x: number,
  y: number,
  folder: { id: string; title: string; isArchived: boolean; canArchive: boolean },
): void {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";

  const title = document.createElement("div");
  title.className = "cm-title";
  title.textContent = folder.title;

  menu.append(
    title,
    separator(),
    menuItem(t("contextRename"), "✏", () => openRenameDialog(folder.id, folder.title)),
  );

  if (folder.canArchive) {
    menu.append(
      menuItem(
        folder.isArchived ? t("contextUnarchiveFolder") : t("contextArchiveFolder"),
        folder.isArchived ? "↩" : "🗄",
        () => toggleArchive(folder.id),
      ),
    );
  }

  placeMenu(menu, x, y);
}
