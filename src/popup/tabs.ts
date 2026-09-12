import { dom } from "./dom";
import { rerender } from "./ui-state";

export type Tab = "bookmarks" | "archive";

const TAB_KEY = "bscTab";

let current: Tab = "bookmarks";

export function activeTab(): Tab {
  return current;
}

function store(tab: Tab): void {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // Remembering the tab is a convenience, not a requirement.
  }
}

function restore(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === "archive" ? "archive" : "bookmarks";
  } catch {
    return "bookmarks";
  }
}

function syncButtons(): void {
  dom.tabBookmarksBtn?.classList.toggle("active", current === "bookmarks");
  dom.tabArchiveBtn?.classList.toggle("active", current === "archive");
  dom.tabBookmarksBtn?.setAttribute("aria-selected", String(current === "bookmarks"));
  dom.tabArchiveBtn?.setAttribute("aria-selected", String(current === "archive"));
}

export function setTab(tab: Tab): void {
  if (current === tab) return;
  current = tab;
  store(tab);
  syncButtons();
  rerender();
}

/** Shows how many branches sit in the archive, so the tab is not a mystery. */
export function setArchiveCount(count: number): void {
  if (!dom.archiveCount) return;
  dom.archiveCount.textContent = count > 0 ? String(count) : "";
  dom.archiveCount.hidden = count === 0;
}

export function initTabs(): void {
  current = restore();
  syncButtons();
  dom.tabBookmarksBtn?.addEventListener("click", () => setTab("bookmarks"));
  dom.tabArchiveBtn?.addEventListener("click", () => setTab("archive"));
}
