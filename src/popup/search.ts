import { dom } from "./dom";
import { preferences } from "./preferences";
import { forgetScroll } from "./scroll";
import { rerender } from "./ui-state";

/**
 * The query is kept in localStorage rather than extension storage: it is a
 * per-view convenience, and the popup and the side panel share an origin, so
 * they already share it without any storage traffic or change notifications.
 */
export const SEARCH_KEY = "bscSearch";

/** Whether the query outlives this view, per the user's setting. */
function remembering(): boolean {
  return preferences().rememberSearch === "remember";
}

function readStoredQuery(): string {
  try {
    return localStorage.getItem(SEARCH_KEY) ?? "";
  } catch {
    return ""; // private window, or site data blocked
  }
}

function storeQuery(query: string): void {
  try {
    // "Reset each time" means nothing is kept at all, not merely that it is
    // ignored on the way back in: a query left in storage would resurface the
    // moment the setting was switched back.
    if (query && remembering()) localStorage.setItem(SEARCH_KEY, query);
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

/**
 * Restores the previous query, when the user asked for that. Call before the
 * first render, and after the preferences have been loaded.
 */
export function restoreSearch(): void {
  dom.searchInput.value = remembering() ? readStoredQuery() : "";
  syncClearButton();
}

/** Drops whatever query was being kept. For when the setting is turned off. */
export function forgetSearch(): void {
  try {
    localStorage.removeItem(SEARCH_KEY);
  } catch {
    // Nothing to forget, then.
  }
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
