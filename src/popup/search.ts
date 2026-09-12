import { dom } from "./dom";
import { forgetScroll } from "./scroll";
import { rerender } from "./ui-state";

/**
 * The query is kept in localStorage rather than extension storage: it is a
 * per-view convenience, and the popup and the side panel share an origin, so
 * they already share it without any storage traffic or change notifications.
 */
const SEARCH_KEY = "bscSearch";

function readStoredQuery(): string {
  try {
    return localStorage.getItem(SEARCH_KEY) ?? "";
  } catch {
    return ""; // private window, or site data blocked
  }
}

function storeQuery(query: string): void {
  try {
    if (query) localStorage.setItem(SEARCH_KEY, query);
    else localStorage.removeItem(SEARCH_KEY);
  } catch {
    // Not being able to remember the query is not worth failing over.
  }
}

function syncClearButton(): void {
  if (dom.searchClearBtn) dom.searchClearBtn.hidden = dom.searchInput.value === "";
}

export function clearSearch(): void {
  dom.searchInput.value = "";
  storeQuery("");
  syncClearButton();
  rerender();
  dom.searchInput.focus();
}

/** Restores the previous query. Call before the first render. */
export function restoreSearch(): void {
  dom.searchInput.value = readStoredQuery();
  syncClearButton();
}

export function registerSearchHandlers(): void {
  dom.searchInput.addEventListener("input", () => {
    // Searching abandons the remembered position rather than returning to it
    // when the box is cleared again.
    forgetScroll();
    storeQuery(dom.searchInput.value);
    syncClearButton();
    rerender();
  });

  // Escape clears the box; the context menu handles its own Escape separately.
  dom.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dom.searchInput.value !== "") {
      e.preventDefault();
      clearSearch();
    }
  });

  dom.searchClearBtn?.addEventListener("click", clearSearch);
}

/** The search box takes focus on open, so typing filters straight away. */
export function focusSearch(): void {
  dom.searchInput.focus();
  // Put the caret after a restored query rather than selecting it, so typing
  // extends the search instead of replacing it by accident.
  const end = dom.searchInput.value.length;
  dom.searchInput.setSelectionRange(end, end);
}
