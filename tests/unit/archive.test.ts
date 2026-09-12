import { describe, expect, it } from "vitest";
import {
  archiveTree,
  collectBookmarkIds,
  collectSubtreeIds,
  hiddenBookmarkIds,
  isArchiveEmpty,
  mainTree,
} from "../../src/shared/archive";
import { buildQueue } from "../../src/shared/queue";
import type { TreeNode } from "../../src/shared/types";

const leaf = (id: string): TreeNode => ({ id, title: id, url: `https://${id}.example/`, type: "bookmark" });
const folder = (id: string, children: TreeNode[]): TreeNode => ({
  id,
  title: id,
  type: "folder",
  children,
});

/**
 *  bar
 *   ├ work            (folder)
 *   │  ├ a
 *   │  └ deep         (folder)
 *   │     └ b
 *   └ c
 *  other
 *   └ d
 */
const TREE: TreeNode[] = [
  folder("bar", [folder("work", [leaf("a"), folder("deep", [leaf("b")])]), leaf("c")]),
  folder("other", [leaf("d")]),
];

const ids = (nodes: TreeNode[]): string[] => collectSubtreeIds(nodes);

describe("collectSubtreeIds / collectBookmarkIds", () => {
  it("walks folders and leaves alike", () => {
    expect(collectSubtreeIds(TREE)).toEqual(["bar", "work", "a", "deep", "b", "c", "other", "d"]);
  });

  it("collects only bookmarks when asked for bookmarks", () => {
    expect(collectBookmarkIds(TREE)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("mainTree", () => {
  it("is the whole tree when nothing is archived", () => {
    expect(ids(mainTree(TREE, []))).toEqual(ids(TREE));
  });

  it("drops an archived bookmark", () => {
    expect(collectBookmarkIds(mainTree(TREE, ["a"]))).toEqual(["b", "c", "d"]);
  });

  it("drops an archived folder together with everything under it", () => {
    expect(ids(mainTree(TREE, ["work"]))).toEqual(["bar", "c", "other", "d"]);
  });

  it("does not mutate the tree it was given", () => {
    const before = JSON.stringify(TREE);
    mainTree(TREE, ["work"]);
    expect(JSON.stringify(TREE)).toBe(before);
  });
});

describe("archiveTree", () => {
  it("is empty when nothing is archived", () => {
    expect(archiveTree(TREE, [])).toEqual([]);
    expect(isArchiveEmpty(TREE, [])).toBe(true);
  });

  // "Иерархия папок в архиве дублируется" — an archived bookmark is still shown
  // under the folders it lives in, not dumped into a flat list.
  it("keeps the folders that lead to an archived bookmark", () => {
    expect(ids(archiveTree(TREE, ["b"]))).toEqual(["bar", "work", "deep", "b"]);
  });

  it("carries an archived folder across whole", () => {
    expect(ids(archiveTree(TREE, ["work"]))).toEqual(["bar", "work", "a", "deep", "b"]);
  });

  it("leaves out branches with nothing archived in them", () => {
    expect(ids(archiveTree(TREE, ["d"]))).toEqual(["other", "d"]);
  });

  it("handles several archived branches at once", () => {
    expect(collectBookmarkIds(archiveTree(TREE, ["a", "d"]))).toEqual(["a", "d"]);
  });
});

describe("main and archive are complementary", () => {
  it.each([["a"], ["work"], ["b"], ["bar"], ["a", "d"]])(
    "every bookmark is in exactly one of the two views (archived: %s)",
    (...archived) => {
      const inMain = collectBookmarkIds(mainTree(TREE, archived));
      const inArchive = collectBookmarkIds(archiveTree(TREE, archived));

      expect([...inMain, ...inArchive].sort()).toEqual(collectBookmarkIds(TREE).sort());
      expect(inMain.filter((id) => inArchive.includes(id))).toEqual([]);
    },
  );
});

describe("hiddenBookmarkIds", () => {
  it("lists the bookmarks the archive is hiding", () => {
    expect(hiddenBookmarkIds(TREE, ["work"])).toEqual(["a", "b"]);
  });

  it("is empty when nothing is archived", () => {
    expect(hiddenBookmarkIds(TREE, [])).toEqual([]);
  });
});

describe("the check queue", () => {
  it("skips archived bookmarks", () => {
    const hidden = hiddenBookmarkIds(TREE, ["work"]);
    expect(buildQueue(["a", "b", "c", "d"], [], [], hidden)).toEqual(["c", "d"]);
  });

  it("skips an archived bookmark even when it is pinned", () => {
    expect(buildQueue(["a", "b"], ["a"], [], ["a"])).toEqual(["b"]);
  });

  it("is unchanged when the archive is empty", () => {
    expect(buildQueue(["a", "b"], [], [], [])).toEqual(["a", "b"]);
  });
});
