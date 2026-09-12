import { t } from "../../shared/i18n";
import { challengeCode } from "../../shared/challenge";
import { setHighlightedText } from "../../shared/highlight";
import { badgeClass, badgeText } from "../../shared/status";
import { timeAgo } from "../../shared/time";
import type { Item } from "../../shared/types";
import { faviconUrl } from "../../shared/url";
import { bulkDelete, openInNewTab, toggleArchive, toggleDisableCheck, togglePin } from "../actions";
import { showContextMenu } from "../context-menu";
import { attachDragHandlers } from "../dnd";
import { preferences } from "../preferences";
import { actionTargets, handleRowClick, updateRowSelectionClass } from "../selection";
import { ui } from "../ui-state";

export interface RowOptions {
  active?: boolean;
  isPinned?: boolean;
  pinnedRow?: boolean;
  isCurrentPage?: boolean;
  isDisabled?: boolean;
  /**
   * Auto-checking is switched off globally, so whatever code is on record was
   * measured at some unknown point in the past — showing it would be a claim
   * the extension can no longer stand behind.
   */
  statusStale?: boolean;
  breadcrumb?: string;
  /** Shown in the Archive tab: the row's actions restore instead of archive. */
  isArchived?: boolean;
  /** Current search text, marked up wherever it occurs in the row. */
  query?: string;
}

function rowClassName(opts: RowOptions): string {
  return [
    "row",
    opts.active ? "active" : "",
    opts.pinnedRow ? "pinned-row" : "",
    opts.isCurrentPage ? "current-page" : "",
    opts.isDisabled ? "check-disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function iconButton(
  label: string,
  title: string,
  extraClass: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = `row-btn${extraClass ? ` ${extraClass}` : ""}`;
  btn.textContent = label;
  btn.title = title;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

/**
 * The status badge, or null when there is no status worth claiming: with
 * auto-checking switched off globally the whole badge column disappears rather
 * than showing a placeholder.
 */
function makeBadge(item: Item, opts: RowOptions): HTMLElement | null {
  if (opts.statusStale) return null;

  const badge = document.createElement("div");

  if (opts.isDisabled) {
    badge.className = "badge disabled";
    badge.textContent = t("checkDisabledBadge");
    return badge;
  }

  if (item.challenge) {
    // A bot-protection service answered instead of the site, so its status code
    // says nothing about the page. The vendor code replaces it outright.
    badge.className = "badge challenge";
    badge.textContent = challengeCode(item.challenge);
    badge.title = `${item.challenge} · ${badgeText(item.status)}`;
    return badge;
  }

  badge.className = `badge ${badgeClass(item.status)}`;
  setHighlightedText(badge, badgeText(item.status), opts.query ?? "");
  return badge;
}

function makeMain(item: Item, opts: RowOptions): HTMLElement {
  const main = document.createElement("div");
  main.className = "row-main";

  const query = opts.query ?? "";

  const title = document.createElement("div");
  title.className = "row-title";
  setHighlightedText(title, item.title || item.url, query);

  const urlLine = document.createElement("div");
  urlLine.className = "row-url";
  // Only the address is searchable, so the "· 5 min ago" suffix is appended
  // plainly rather than being offered up for highlighting.
  setHighlightedText(urlLine, item.url, query);
  if (item.checkedAt) {
    urlLine.appendChild(document.createTextNode(` · ${timeAgo(item.checkedAt)}`));
  }

  main.append(title, urlLine);

  if (opts.breadcrumb) {
    const breadcrumb = document.createElement("div");
    breadcrumb.className = "breadcrumb";
    breadcrumb.textContent = opts.breadcrumb;
    main.appendChild(breadcrumb);
  }

  if (opts.isCurrentPage) {
    const tag = document.createElement("span");
    tag.className = "current-tag";
    tag.textContent = t("currentPageBadge");
    main.appendChild(tag);
  }

  return main;
}

export function makeRow(id: string, item: Item, opts: RowOptions = {}): HTMLElement {
  const row = document.createElement("div");
  row.dataset["id"] = id;
  row.className = rowClassName(opts);
  row.title = item.title || item.url;

  ui.visibleRowOrder.push(id);
  updateRowSelectionClass(row, id);

  const favicon = document.createElement("img");
  favicon.className = "favicon";
  favicon.draggable = false;
  favicon.src = faviconUrl(item.url);
  favicon.addEventListener("error", () => {
    favicon.style.visibility = "hidden";
  });

  const actions = document.createElement("div");
  actions.className = "row-actions";
  actions.append(
    iconButton(
      "📌",
      opts.isPinned ? t("unpinTooltip") : t("pinTooltip"),
      `pin-btn${opts.isPinned ? " pin-active" : ""}`,
      () => void togglePin(id),
    ),
    iconButton(
      opts.isDisabled ? "🔕" : "🔔",
      opts.isDisabled ? t("enableCheckTooltip") : t("disableCheckTooltip"),
      `mute-btn${opts.isDisabled ? " disable-active" : ""}`,
      () => void toggleDisableCheck(id),
    ),
    iconButton(
      opts.isArchived ? "↩" : "🗄",
      opts.isArchived ? t("unarchiveTooltip") : t("archiveTooltip"),
      "archive-btn",
      () => void toggleArchive(id),
    ),
    iconButton("🗑", t("deleteTooltip"), "delete-btn", () => void bulkDelete(actionTargets(id))),
  );

  const badge = makeBadge(item, opts);
  row.append(favicon, makeMain(item, opts));
  if (badge) row.appendChild(badge);
  row.appendChild(actions);

  row.addEventListener("click", (e) => {
    // Modifier clicks always mean "select", whatever the open trigger is, so
    // building a selection stays possible in single-click mode.
    const wantsSelection = e.ctrlKey || e.metaKey || e.shiftKey;
    if (preferences().openTrigger === "click" && !wantsSelection) {
      openInNewTab(item.url);
      return;
    }
    handleRowClick(e, id);
  });

  row.addEventListener("dblclick", () => {
    if (preferences().openTrigger === "dblclick") openInNewTab(item.url);
  });
  row.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, {
      id,
      item,
      isPinned: opts.isPinned ?? false,
      isDisabled: opts.isDisabled ?? false,
      isArchived: opts.isArchived ?? false,
    });
  });

  attachDragHandlers(row, id);

  return row;
}
