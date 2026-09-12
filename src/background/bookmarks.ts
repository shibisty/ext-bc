import { api } from "../shared/api";
import { t } from "../shared/i18n";
import { readState, writeState } from "../shared/storage";
import type { DropPosition, FlatBookmark, Item, State, TreeNode } from "../shared/types";
import { collectSubtreeIds } from "../shared/archive";
import { pruneToolbarPins } from "./toolbar";
import { extractHostname } from "../shared/url";

/**
 * Walks the real browser bookmarks tree, producing:
 *  - a simplified tree (folders + bookmarks) for display, preserving structure
 *  - a flat depth-first list of bookmark leaves for the check queue
 */
export function processNode(
  node: chrome.bookmarks.BookmarkTreeNode,
  flatOut: FlatBookmark[],
): TreeNode | null {
  if (node.children) {
    const children = node.children
      .map((child) => processNode(child, flatOut))
      .filter((child): child is TreeNode => child !== null);
    return {
      id: node.id,
      title: node.title || t("unnamedFolder"),
      type: "folder",
      children,
    };
  }

  if (node.url) {
    const title = node.title || node.url;
    flatOut.push({ id: node.id, title, url: node.url });
    return { id: node.id, title, url: node.url, type: "bookmark" };
  }

  return null;
}

/**
 * Merges freshly walked bookmarks into the stored items, keeping the recorded
 * status of bookmarks that still exist and dropping the ones that don't.
 */
export function reconcileItems(
  previous: Record<string, Item>,
  flat: readonly FlatBookmark[],
): { items: Record<string, Item>; order: string[]; seen: Set<string> } {
  const items: Record<string, Item> = { ...previous };
  const seen = new Set<string>();
  const order: string[] = [];

  for (const bookmark of flat) {
    seen.add(bookmark.id);
    order.push(bookmark.id);

    const existing = items[bookmark.id];
    if (existing) {
      existing.title = bookmark.title;
      if (existing.url !== bookmark.url) {
        existing.url = bookmark.url;
        existing.host = extractHostname(bookmark.url);
      }
      // Items written by an older version have no cached host or reason, and
      // may still carry a localised statusText that no longer belongs in
      // storage — normalise them on the way through.
      existing.host ??= extractHostname(bookmark.url);
      existing.reason ??= null;
      existing.challenge ??= null;
      if (existing.status === "ERR" || existing.status === "TIMEOUT") existing.statusText = "";
    } else {
      items[bookmark.id] = {
        title: bookmark.title,
        url: bookmark.url,
        host: extractHostname(bookmark.url),
        status: null,
        statusText: null,
        reason: null,
        challenge: null,
        checkedAt: null,
      };
    }
  }

  for (const id of Object.keys(items)) {
    if (!seen.has(id)) delete items[id];
  }

  return { items, order, seen };
}

export type SyncResult = Pick<
  State,
  | "tree"
  | "order"
  | "items"
  | "pinned"
  | "disabledChecks"
  | "archived"
  | "toolbarPins"
  | "currentIndex"
>;

export async function syncBookmarks(): Promise<SyncResult> {
  const treeRoot = await api.bookmarks.getTree();
  const topNodes = treeRoot[0]?.children ?? [];
  const flat: FlatBookmark[] = [];
  const tree = topNodes
    .map((node) => processNode(node, flat))
    .filter((node): node is TreeNode => node !== null);

  const state = await readState();
  const { items, order, seen } = reconcileItems(state.items, flat);

  const pinned = state.pinned.filter((id) => seen.has(id));
  const disabledChecks = state.disabledChecks.filter((id) => seen.has(id));
  // Folders are archivable too, and they never appear in `seen` (which only
  // holds bookmark leaves), so archived ids are checked against the tree.
  const liveNodeIds = new Set(collectSubtreeIds(tree));
  const archived = state.archived.filter((id) => liveNodeIds.has(id));
  const toolbarPins = pruneToolbarPins(state.toolbarPins, liveNodeIds);

  let currentIndex = state.currentIndex;
  if (order.length > 0 && currentIndex >= order.length) currentIndex = 0;

  const result: SyncResult = {
    tree,
    order,
    items,
    pinned,
    disabledChecks,
    archived,
    toolbarPins,
    currentIndex,
  };
  await writeState(result);
  return result;
}

/**
 * Renames a bookmark or folder in the browser itself, so the new title shows up
 * everywhere the user keeps bookmarks, not just in this extension.
 */
export async function renameNode(id: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  try {
    await api.bookmarks.update(id, { title: trimmed });
  } catch {
    // Gone, or a root folder the browser refuses to rename — ignore.
  }
  await syncBookmarks();
}

export async function removeBookmarks(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    try {
      await api.bookmarks.remove(id);
    } catch {
      // Already gone, or a non-empty folder — ignore.
    }
  }
  await syncBookmarks();
}

/**
 * Puts a node at a known final position and checks that it landed there.
 *
 * `bookmarks.move` takes an index whose meaning differs between browsers when
 * the node stays in the same folder: Chrome resolves it against the children as
 * they are *before* the node is lifted out, so asking for index 3 on [A,B,C,D]
 * with A moving lands it at 2 — which is why dragging a bookmark downwards
 * always stopped one place short. Rather than encoding either browser's rule,
 * this asks for the position it wants, measures where the node actually ended
 * up, and corrects once by the difference.
 */
async function placeAt(id: string, parentId: string, finalIndex: number): Promise<void> {
  await api.bookmarks.move(id, { parentId, index: finalIndex });

  const children = await api.bookmarks.getChildren(parentId);
  const actual = children.findIndex((child) => child.id === id);
  const wanted = Math.min(finalIndex, children.length - 1);
  if (actual === -1 || actual === wanted) return;

  await api.bookmarks.move(id, {
    parentId,
    index: Math.max(0, Math.min(finalIndex + (wanted - actual), children.length)),
  });
}

/**
 * Where the node should end up, counted in the folder's children *after* the
 * move — the one description both browsers agree on.
 */
function finalIndexFor(
  siblings: readonly chrome.bookmarks.BookmarkTreeNode[],
  movedId: string,
  targetId: string,
  position: Exclude<DropPosition, "inside">,
): number {
  const from = siblings.findIndex((child) => child.id === movedId);
  const target = siblings.findIndex((child) => child.id === targetId);
  if (target === -1) return siblings.length;

  // Once the node is lifted out, everything after it shifts up by one.
  const targetAfterRemoval = from !== -1 && from < target ? target - 1 : target;
  return position === "after" ? targetAfterRemoval + 1 : targetAfterRemoval;
}

/**
 * Moves one or more bookmarks next to (or into) a target node, persisting the
 * new order to the real browser bookmarks, then re-syncs.
 */
export async function moveBookmarksTo(
  ids: readonly string[],
  targetId: string,
  position: DropPosition,
): Promise<void> {
  for (const id of ids) {
    if (id === targetId) continue;

    try {
      if (position === "inside") {
        const children = await api.bookmarks.getChildren(targetId);
        const alreadyThere = children.some((child) => child.id === id);
        await placeAt(id, targetId, alreadyThere ? children.length - 1 : children.length);
        continue;
      }

      const targetNode = (await api.bookmarks.get(targetId))[0];
      const parentId = targetNode?.parentId;
      if (!parentId) continue;

      const siblings = await api.bookmarks.getChildren(parentId);
      await placeAt(id, parentId, finalIndexFor(siblings, id, targetId, position));
    } catch {
      // e.g. dropping a folder into its own descendant — skip that one.
    }
  }

  await syncBookmarks();
}
