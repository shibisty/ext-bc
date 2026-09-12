import { archiveTree, hiddenBookmarkIds, mainTree } from "../../shared/archive";
import { t } from "../../shared/i18n";
import { activeQueueId, buildQueue } from "../../shared/queue";
import { badgeText } from "../../shared/status";
import type { Item, State, TreeNode } from "../../shared/types";
import { dom } from "../dom";
import { pruneSelection, updateFooterText } from "../selection";
import { resetScroll, restoreScrollOnce } from "../scroll";
import { setArchiveCount, activeTab } from "../tabs";
import { setRenderer, ui } from "../ui-state";
import { appendItemsLazily, cancelPendingLazyRenders } from "./lazy";
import { flattenTreeWithPath, makeRowFor, renderTreeNode, type TreeRenderContext } from "./tree";

/**
 * Searchable representation of a status: the badge text as shown, plus a
 * spelled-out form so that typing "timeout" finds what the badge abbreviates
 * to "TIME".
 */
function statusTokens(item: Item): string {
  const tokens = [badgeText(item.status)];
  if (item.status === "TIMEOUT") tokens.push("timeout");
  if (item.status === "ERR") tokens.push("error");
  if (item.reason) tokens.push(item.reason);
  if (item.challenge) tokens.push(item.challenge, "challenge", "captcha");
  return tokens.join(" ").toLowerCase();
}

/** Matches a bookmark against the search box: title, address or status. */
export function matchesQuery(item: Item, query: string): boolean {
  return (
    item.title.toLowerCase().includes(query) ||
    item.url.toLowerCase().includes(query) ||
    statusTokens(item).includes(query)
  );
}

export function filterBySearch(
  order: readonly string[],
  items: Record<string, Item>,
  query: string,
): string[] {
  return order.filter((id) => {
    const item = items[id];
    return item ? matchesQuery(item, query) : false;
  });
}

function renderEmpty(messageKey: string): void {
  dom.emptyState.style.display = "block";
  dom.emptyState.textContent = t(messageKey);
  const frag = document.createDocumentFragment();
  frag.appendChild(dom.emptyState);
  dom.list.replaceChildren(frag);
  updateFooterText();
}

function renderSearchResults(
  matches: string[],
  ctx: TreeRenderContext,
  tree: readonly TreeNode[],
  frag: DocumentFragment,
): void {
  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("emptyNoResults");
    frag.appendChild(empty);
    return;
  }

  const pathById = new Map(flattenTreeWithPath(tree).map((entry) => [entry.id, entry.path]));

  appendItemsLazily(frag, matches, (id) =>
    makeRowFor(id, ctx, ctx.pinnedSet.has(id), { breadcrumb: pathById.get(id) ?? "" }),
  );
}

export function render(state: State): void {
  cancelPendingLazyRenders();
  ui.lastState = state;
  ui.visibleRowOrder = [];

  const { order, items, pinned } = state;

  pruneSelection(items);

  const archived = state.archived;
  const archiveView = activeTab() === "archive";
  const archiveBranches = archiveTree(state.tree, archived);
  setArchiveCount(archiveBranches.length);

  // Each tab renders its own slice of the same tree: archived branches move
  // across wholesale, and the folders around them are kept for context.
  const tree = archiveView ? archiveBranches : mainTree(state.tree, archived);
  const hidden = new Set(hiddenBookmarkIds(state.tree, archived));

  // What the queue and the pinned strip may show depends on the tab.
  const visibleOrder = archiveView
    ? order.filter((id) => hidden.has(id))
    : order.filter((id) => !hidden.has(id));

  if (order.length === 0) {
    renderEmpty("emptyNoBookmarks");
    return;
  }

  if (archiveView && archiveBranches.length === 0) {
    renderEmpty("emptyArchive");
    return;
  }

  const pinnedSet = new Set(pinned);
  const disabledSet = new Set(state.disabledChecks);
  const queue = buildQueue(order, pinned, state.disabledChecks, [...hidden]);
  const ctx: TreeRenderContext = {
    items,
    pinnedSet,
    disabledSet,
    archivedSet: new Set(archived),
    activeId: activeQueueId(queue, state.currentIndex),
    autoCheckOff: !state.intervalMinutes || state.intervalMinutes <= 0,
    archiveView,
    query: dom.searchInput.value.trim().toLowerCase(),
    rootFolderIds: new Set(state.tree.map((node) => node.id)),
  };

  const query = ctx.query;

  // Build everything off-DOM first, then attach in a single swap so the tree
  // never appears to "assemble" piece by piece in front of the user.
  const frag = document.createDocumentFragment();

  if (query) {
    renderSearchResults(filterBySearch(visibleOrder, items, query), ctx, tree, frag);
  } else {
    if (!archiveView && pinned.length > 0) {
      const label = document.createElement("div");
      label.className = "section-label";
      label.textContent = t("pinnedSectionLabel");
      frag.appendChild(label);

      appendItemsLazily(
        frag,
        pinned.filter((id) => items[id] && !hidden.has(id)),
        (id) => makeRowFor(id, ctx, true),
      );
    }

    for (const node of tree) renderTreeNode(node, ctx, frag);
  }

  dom.list.replaceChildren(frag);
  updateFooterText();

  // A search is a different list; anything else should pick up where the user
  // left off the last time the popup was open.
  if (query) resetScroll();
  else restoreScrollOnce();
}

setRenderer(render);
