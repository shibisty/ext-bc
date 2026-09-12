import type { Item, TreeNode } from "../../shared/types";
import { matchesCurrentPage } from "../../shared/url";
import { setHighlightedText } from "../../shared/highlight";
import { showFolderContextMenu } from "../context-menu";
import { attachFolderDropHandlers } from "../dnd";
import { saveCollapsedFolders, ui } from "../ui-state";
import { appendItemsLazily } from "./lazy";
import { makeRow, type RowOptions } from "./row";

export interface TreeRenderContext {
  items: Record<string, Item>;
  pinnedSet: Set<string>;
  disabledSet: Set<string>;
  archivedSet: Set<string>;
  activeId: string | null;
  /** True when the auto-check interval is set to "off". */
  autoCheckOff: boolean;
  /** True while the Archive tab is showing. */
  archiveView: boolean;
  /** Current search text, marked up in every row. */
  query: string;
  /**
   * The browser's own top-level folders ("Bookmarks bar", "Other bookmarks").
   * Archiving one would empty the whole list, so they are not offered the
   * option at all.
   */
  rootFolderIds: Set<string>;
}

/** Builds a row for an id known to exist in `ctx.items`. */
export function makeRowFor(
  id: string,
  ctx: TreeRenderContext,
  isPinned: boolean,
  extra: Partial<RowOptions> = {},
): HTMLElement {
  const item = ctx.items[id];
  if (!item) return document.createElement("div");
  return makeRow(id, item, {
    active: id === ctx.activeId,
    isPinned,
    pinnedRow: isPinned,
    isCurrentPage: matchesCurrentPage(item.url, ui.currentTabInfo),
    isDisabled: ctx.disabledSet.has(id),
    statusStale: ctx.autoCheckOff,
    isArchived: ctx.archiveView,
    query: ctx.query,
    ...extra,
  });
}

function renderFolder(node: TreeNode & { type: "folder" }, ctx: TreeRenderContext, container: ParentNode): void {
  if (node.children.length === 0) return;

  const details = document.createElement("details");
  details.className = "folder";
  details.open = !ui.collapsedFolderIds.has(node.id);

  const summary = document.createElement("summary");
  setHighlightedText(summary, node.title, ctx.query);
  if (ctx.archivedSet.has(node.id)) summary.classList.add("archived-folder");
  attachFolderDropHandlers(summary, node.id);
  summary.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showFolderContextMenu(e.clientX, e.clientY, {
      id: node.id,
      title: node.title,
      isArchived: ctx.archivedSet.has(node.id),
      canArchive: !ctx.rootFolderIds.has(node.id),
    });
  });
  details.appendChild(summary);

  const childWrap = document.createElement("div");
  childWrap.className = "folder-children";

  let hasVisibleChild = false;
  let i = 0;

  while (i < node.children.length) {
    const child = node.children[i];
    if (!child) break;

    if (child.type === "folder") {
      const before = childWrap.childElementCount;
      renderTreeNode(child, ctx, childWrap);
      if (childWrap.childElementCount > before) hasVisibleChild = true;
      i++;
      continue;
    }

    // Collect the whole run of consecutive bookmarks so they can be appended
    // lazily as one batch rather than one IntersectionObserver per bookmark.
    const runIds: string[] = [];
    while (i < node.children.length) {
      const next = node.children[i];
      if (!next || next.type !== "bookmark") break;
      if (!ctx.pinnedSet.has(next.id) && ctx.items[next.id]) runIds.push(next.id);
      i++;
    }

    if (runIds.length > 0) {
      hasVisibleChild = true;
      appendItemsLazily(childWrap, runIds, (id) => makeRowFor(id, ctx, false));
    }
  }

  if (!hasVisibleChild) return;

  details.addEventListener("toggle", () => {
    if (details.open) ui.collapsedFolderIds.delete(node.id);
    else ui.collapsedFolderIds.add(node.id);
    saveCollapsedFolders();
  });

  details.appendChild(childWrap);
  container.appendChild(details);
}

export function renderTreeNode(node: TreeNode, ctx: TreeRenderContext, container: ParentNode): void {
  if (node.type === "folder") {
    renderFolder(node, ctx, container);
    return;
  }

  if (ctx.items[node.id]) container.appendChild(makeRowFor(node.id, ctx, false));
}

/** Flattens the tree to `{ id, path }` pairs so search results can show a breadcrumb. */
export function flattenTreeWithPath(
  nodes: readonly TreeNode[],
  path: readonly string[] = [],
  out: { id: string; path: string }[] = [],
): { id: string; path: string }[] {
  for (const node of nodes) {
    if (node.type === "folder") {
      flattenTreeWithPath(node.children, [...path, node.title], out);
    } else {
      out.push({ id: node.id, path: path.join(" / ") });
    }
  }
  return out;
}

export function collectFolderIds(nodes: readonly TreeNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === "folder") {
      out.push(node.id);
      collectFolderIds(node.children, out);
    }
  }
  return out;
}
