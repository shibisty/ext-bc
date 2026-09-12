import { describe, expect, it } from "vitest";
import { processNode, reconcileItems, syncBookmarks } from "../../src/background/bookmarks";
import { readState } from "../../src/shared/storage";
import type { FlatBookmark, Item } from "../../src/shared/types";
import { mockBrowser } from "../setup";

function item(overrides: Partial<Item> = {}): Item {
  return {
    title: "t",
    url: "https://a.example/1",
    host: "a.example",
    status: null,
    statusText: null,
    reason: null,
    challenge: null,
    checkedAt: null,
    ...overrides,
  };
}

describe("processNode", () => {
  it("keeps folder structure and collects leaves depth-first", () => {
    const flat: FlatBookmark[] = [];
    const tree = processNode(
      {
        id: "1",
        title: "Bar",
        children: [
          { id: "2", title: "A", url: "https://a.example/" },
          {
            id: "3",
            title: "Sub",
            children: [{ id: "4", title: "B", url: "https://b.example/" }],
          },
        ],
      } as chrome.bookmarks.BookmarkTreeNode,
      flat,
    );

    expect(flat.map((b) => b.id)).toEqual(["2", "4"]);
    expect(tree).toMatchObject({ type: "folder", title: "Bar" });
  });

  it("names an untitled folder from the locale", () => {
    const node = processNode(
      { id: "1", title: "", children: [] } as unknown as chrome.bookmarks.BookmarkTreeNode,
      [],
    );
    expect(node).toMatchObject({ title: "unnamedFolder" });
  });

  it("falls back to the URL when a bookmark has no title", () => {
    const flat: FlatBookmark[] = [];
    processNode(
      { id: "2", title: "", url: "https://a.example/" } as chrome.bookmarks.BookmarkTreeNode,
      flat,
    );
    expect(flat[0]?.title).toBe("https://a.example/");
  });

  it("drops nodes that are neither folder nor bookmark", () => {
    expect(processNode({ id: "9", title: "x" } as chrome.bookmarks.BookmarkTreeNode, [])).toBeNull();
  });
});

describe("reconcileItems", () => {
  it("creates unchecked entries for new bookmarks", () => {
    const { items, order } = reconcileItems({}, [
      { id: "a", title: "A", url: "https://a.example/" },
    ]);
    expect(order).toEqual(["a"]);
    expect(items["a"]).toMatchObject({ status: null, host: "a.example", reason: null });
  });

  it("keeps the recorded status of a bookmark that still exists", () => {
    const { items } = reconcileItems({ a: item({ status: 404, checkedAt: 5 }) }, [
      { id: "a", title: "renamed", url: "https://a.example/1" },
    ]);
    expect(items["a"]).toMatchObject({ status: 404, checkedAt: 5, title: "renamed" });
  });

  it("recomputes the cached host when the URL changes", () => {
    const { items } = reconcileItems({ a: item() }, [
      { id: "a", title: "A", url: "https://moved.example/x" },
    ]);
    expect(items["a"]?.host).toBe("moved.example");
  });

  it("backfills host and reason for entries written by an older version", () => {
    const legacy = { title: "A", url: "https://a.example/1", status: 200, checkedAt: 1 };
    const { items } = reconcileItems({ a: legacy as unknown as Item }, [
      { id: "a", title: "A", url: "https://a.example/1" },
    ]);
    expect(items["a"]).toMatchObject({ host: "a.example", reason: null });
  });

  it("clears localised failure text left behind by an older version", () => {
    const legacy = item({ status: "ERR", statusText: "Нет соединения" });
    const { items } = reconcileItems({ a: legacy }, [
      { id: "a", title: "A", url: "https://a.example/1" },
    ]);
    expect(items["a"]?.statusText).toBe("");
  });

  it("keeps the server's reason phrase for a real HTTP response", () => {
    const { items } = reconcileItems({ a: item({ status: 404, statusText: "Not Found" }) }, [
      { id: "a", title: "A", url: "https://a.example/1" },
    ]);
    expect(items["a"]?.statusText).toBe("Not Found");
  });

  /**
   * Upgrading from 1.3.1 finds items with none of the newer fields and a
   * localised statusText. Verified end to end against storage written by the
   * real 1.3.1 build: statuses, pins, mutes, the interval and collapsed folders
   * all survive, and the first sync fills in the rest.
   */
  it("brings an item written by version 1.3.1 up to date", () => {
    const legacy = {
      title: "Alpha",
      url: "https://alpha.example/",
      status: "ERR",
      statusText: "Нет соединения",
      checkedAt: 1700000000000,
    };

    const { items } = reconcileItems({ a: legacy as unknown as Item }, [
      { id: "a", title: "Alpha", url: "https://alpha.example/" },
    ]);

    expect(items["a"]).toEqual({
      title: "Alpha",
      url: "https://alpha.example/",
      host: "alpha.example",
      status: "ERR",
      statusText: "",
      reason: null,
      challenge: null,
      checkedAt: 1700000000000,
    });
  });

  it("drops bookmarks that no longer exist", () => {
    const { items, seen } = reconcileItems({ gone: item() }, []);
    expect(items).toEqual({});
    expect(seen.size).toBe(0);
  });
});

describe("syncBookmarks", () => {
  it("stores the tree, the order and the items", async () => {
    mockBrowser().__setTree([
      {
        id: "1",
        title: "Bar",
        children: [{ id: "2", title: "A", url: "https://a.example/" }],
      },
    ]);

    await syncBookmarks();

    const state = await readState();
    expect(state.order).toEqual(["2"]);
    expect(state.items["2"]).toMatchObject({ title: "A", host: "a.example" });
    expect(state.tree[0]).toMatchObject({ type: "folder", title: "Bar" });
  });

  it("prunes pinned and disabled ids for bookmarks that are gone", async () => {
    mockBrowser().__setTree([{ id: "1", title: "Bar", children: [] }]);
    mockBrowser().__seed({ pinned: ["gone"], disabledChecks: ["gone"] });

    await syncBookmarks();

    const state = await readState();
    expect(state.pinned).toEqual([]);
    expect(state.disabledChecks).toEqual([]);
  });

  it("rewinds an index left past the end of a shrunken list", async () => {
    mockBrowser().__setTree([
      { id: "1", title: "Bar", children: [{ id: "2", title: "A", url: "https://a.example/" }] },
    ]);
    mockBrowser().__seed({ currentIndex: 99 });

    await syncBookmarks();

    await expect(readState()).resolves.toMatchObject({ currentIndex: 0 });
  });
});

/**
 * Reported from Firefox for Android: the browser had a bookmark, the extension
 * showed "No bookmarks found". `bookmarks.getTree()` is documented as returning
 * the whole tree, and Chrome and desktop Firefox do — Android hands back
 * folders with no `children` at all, so the walk found nothing to walk.
 */
describe("a browser whose getTree() does not nest", () => {
  it("fetches the children it was not given", async () => {
    mockBrowser().__setTree([
      {
        id: "1",
        title: "Bookmarks bar",
        children: [
          { id: "2", title: "Alpha", url: "https://a.example/" },
          {
            id: "3",
            title: "Work",
            children: [{ id: "4", title: "Beta", url: "https://b.example/" }],
          },
        ],
      },
    ]);
    mockBrowser().__setShallowTree(true);

    const result = await syncBookmarks();

    expect(result.order).toEqual(["2", "4"]);
    const bar = result.tree[0];
    const childIds = bar && bar.type === "folder" ? bar.children.map((child) => child.id) : [];
    expect(childIds).toEqual(["2", "3"]);
    expect(mockBrowser().bookmarks.getChildren).toHaveBeenCalled();
  });

  it("survives a root folder the browser refuses to open", async () => {
    mockBrowser().__setTree([{ id: "1", title: "Bookmarks bar", children: [] }]);
    mockBrowser().__setShallowTree(true);
    mockBrowser().bookmarks.getChildren.mockRejectedValueOnce(new Error("no access"));

    await expect(syncBookmarks()).resolves.toMatchObject({ order: [] });
  });
});
