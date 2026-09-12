import type { TreeNode } from "./types";

/**
 * Archiving is a view of the same bookmarks, not a move: the real browser
 * bookmark stays exactly where it is, and an archived id simply routes the node
 * (with everything under it) to the Archive tab instead of the main list.
 *
 * Only the topmost node of a branch is ever recorded — archiving a folder does
 * not enumerate its children — so restoring is a single id removal and the
 * archive survives bookmarks being added to an archived folder afterwards.
 */

/** Every leaf id under `nodes`, including the nodes themselves. */
export function collectSubtreeIds(nodes: readonly TreeNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    out.push(node.id);
    if (node.type === "folder") collectSubtreeIds(node.children, out);
  }
  return out;
}

/** Bookmark ids under `nodes` (folders excluded) — what the check queue cares about. */
export function collectBookmarkIds(nodes: readonly TreeNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === "folder") collectBookmarkIds(node.children, out);
    else out.push(node.id);
  }
  return out;
}

/** The subtrees rooted at the archived ids, in tree order. */
function archivedRoots(nodes: readonly TreeNode[], archived: ReadonlySet<string>): TreeNode[] {
  const roots: TreeNode[] = [];
  const walk = (list: readonly TreeNode[]): void => {
    for (const node of list) {
      if (archived.has(node.id)) {
        roots.push(node);
        continue; // everything below travels with it
      }
      if (node.type === "folder") walk(node.children);
    }
  };
  walk(nodes);
  return roots;
}

/** Every bookmark the archive is currently hiding from the main list. */
export function hiddenBookmarkIds(
  tree: readonly TreeNode[],
  archived: readonly string[],
): string[] {
  return collectBookmarkIds(archivedRoots(tree, new Set(archived)));
}

/** The main list: the tree with archived branches removed. */
export function mainTree(tree: readonly TreeNode[], archived: readonly string[]): TreeNode[] {
  const archivedSet = new Set(archived);

  const prune = (nodes: readonly TreeNode[]): TreeNode[] => {
    const kept: TreeNode[] = [];
    for (const node of nodes) {
      if (archivedSet.has(node.id)) continue;
      if (node.type === "folder") kept.push({ ...node, children: prune(node.children) });
      else kept.push(node);
    }
    return kept;
  };

  return prune(tree);
}

/**
 * The archive list: the same folder hierarchy, kept only where it leads to
 * something archived, so an archived bookmark still shows up under the folders
 * it actually lives in. An archived folder is carried over whole.
 */
export function archiveTree(tree: readonly TreeNode[], archived: readonly string[]): TreeNode[] {
  const archivedSet = new Set(archived);

  const prune = (nodes: readonly TreeNode[]): TreeNode[] => {
    const kept: TreeNode[] = [];
    for (const node of nodes) {
      if (archivedSet.has(node.id)) {
        kept.push(node);
        continue;
      }
      if (node.type !== "folder") continue;
      const children = prune(node.children);
      // A folder is only worth showing if something archived is inside it.
      if (children.length > 0) kept.push({ ...node, children });
    }
    return kept;
  };

  return prune(tree);
}

/** Whether the archive holds anything at all (drives the tab's empty state). */
export function isArchiveEmpty(tree: readonly TreeNode[], archived: readonly string[]): boolean {
  return archiveTree(tree, archived).length === 0;
}
