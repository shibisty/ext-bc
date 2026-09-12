import { api } from "../shared/api";
import { readState, writeState } from "../shared/storage";

/**
 * Mirroring a pin onto the browser's bookmarks toolbar.
 *
 * The rule is deliberately one-way: the toolbar never affects what is pinned in
 * the popup, but pinning may add to the toolbar. A pinned bookmark is *copied*
 * there rather than moved, so it stays exactly where the user filed it.
 *
 * Unpinning only removes what this extension put there. A bookmark that was
 * already on the toolbar before it was ever pinned is left alone — which is why
 * every copy we create is recorded in `toolbarPins`.
 */

/** The browser's toolbar folder: "1" in Chrome, "toolbar_____" in Firefox. */
const TOOLBAR_IDS = ["toolbar_____", "1"];

export async function findToolbarFolder(): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
  const roots = (await api.bookmarks.getTree())[0]?.children ?? [];

  for (const id of TOOLBAR_IDS) {
    const hit = roots.find((node) => node.id === id);
    if (hit) return hit;
  }

  return roots.find((node) => !node.url) ?? null;
}

function sameUrl(a: string | undefined, b: string | undefined): boolean {
  return a !== undefined && b !== undefined && a === b;
}

/**
 * Brings the toolbar in line with a bookmark's pinned state.
 * Does nothing at all unless the user asked for the mirroring.
 */
export async function mirrorPinToToolbar(id: string, pinned: boolean): Promise<void> {
  const state = await readState();
  const copies = { ...state.toolbarPins };

  if (!pinned) {
    const copyId = copies[id];
    if (!copyId) return; // it was on the toolbar before us — not ours to remove

    try {
      await api.bookmarks.remove(copyId);
    } catch {
      // Already gone by other means.
    }
    delete copies[id];
    await writeState({ toolbarPins: copies });
    return;
  }

  if (copies[id]) return; // already mirrored

  const item = state.items[id];
  const toolbar = await findToolbarFolder();
  if (!item || !toolbar) return;

  const children = await api.bookmarks.getChildren(toolbar.id);
  // Already on the toolbar by the user's own hand: leave it, and record nothing,
  // so unpinning later will not take away something we did not add.
  if (children.some((child) => sameUrl(child.url, item.url))) return;

  try {
    const created = await api.bookmarks.create({
      parentId: toolbar.id,
      index: 0,
      title: item.title,
      url: item.url,
    });
    copies[id] = created.id;
    await writeState({ toolbarPins: copies });
  } catch {
    // The browser refused the copy — nothing recorded, nothing to undo.
  }
}

/** Forgets copies whose bookmark (or whose copy) no longer exists. */
export function pruneToolbarPins(
  copies: Record<string, string>,
  liveIds: ReadonlySet<string>,
): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [source, copy] of Object.entries(copies)) {
    if (liveIds.has(source) && liveIds.has(copy)) kept[source] = copy;
  }
  return kept;
}
