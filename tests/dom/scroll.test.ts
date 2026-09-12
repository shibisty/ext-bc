import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS } from "../../src/shared/storage";
import type { Item, State, TreeNode } from "../../src/shared/types";

const POPUP_HTML = readFileSync(path.resolve(process.cwd(), "src/ui/popup.html"), "utf8");

const item = (title: string, url: string): Item => ({
  title,
  url,
  host: new URL(url).hostname,
  status: 200,
  statusText: "",
  reason: null,
  challenge: null,
  checkedAt: null,
});

/** Enough rows that a scroll position is meaningful. */
function manyBookmarks(): State {
  const tree: TreeNode[] = [];
  const items: Record<string, Item> = {};
  const order: string[] = [];

  for (let i = 0; i < 40; i++) {
    const id = `b${i}`;
    order.push(id);
    tree.push({ id, title: `Bookmark ${i}`, url: `https://b${i}.example/`, type: "bookmark" });
    items[id] = item(`Bookmark ${i}`, `https://b${i}.example/`);
  }

  return { ...structuredClone(DEFAULTS), tree, order, items };
}

async function mount() {
  document.body.innerHTML = POPUP_HTML.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
  vi.resetModules();

  const { render } = await import("../../src/popup/render/list");
  const scroll = await import("../../src/popup/scroll");
  const search = await import("../../src/popup/search");
  const list = document.getElementById("list") as HTMLElement;

  // jsdom has no layout, so give the list something to scroll within.
  Object.defineProperty(list, "scrollHeight", { value: 2000, configurable: true });
  Object.defineProperty(list, "clientHeight", { value: 400, configurable: true });

  scroll.registerScrollMemory();
  search.registerSearchHandlers();
  return { render, list, ...scroll };
}

const stored = () => localStorage.getItem("bscScroll");

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("remembering the scroll position", () => {
  it("saves where the user scrolled to", async () => {
    vi.useFakeTimers();
    const { render, list } = await mount();
    render(manyBookmarks());

    list.scrollTop = 320;
    list.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(300);

    expect(stored()).toBe("320");
  });

  it("catches the position when the popup is closed mid-debounce", async () => {
    const { render, list } = await mount();
    render(manyBookmarks());

    list.scrollTop = 512;
    window.dispatchEvent(new Event("pagehide"));

    expect(stored()).toBe("512");
  });

  it("puts the list back on the next open", async () => {
    localStorage.setItem("bscScroll", "260");

    const { render, list } = await mount();
    render(manyBookmarks());
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(list.scrollTop).toBe(260);
  });

  it("restores only once, so a later re-render does not yank the list back", async () => {
    localStorage.setItem("bscScroll", "260");

    const { render, list } = await mount();
    render(manyBookmarks());
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    list.scrollTop = 40; // the user scrolls back up
    render(manyBookmarks()); // a background check lands
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(list.scrollTop).toBe(40);
  });

  it("never scrolls past the end of a shorter list", async () => {
    localStorage.setItem("bscScroll", "9999");

    const { render, list } = await mount();
    render(manyBookmarks());
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(list.scrollTop).toBe(2000 - 400);
  });

  it("starts at the top when nothing was saved", async () => {
    const { render, list } = await mount();
    render(manyBookmarks());
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(list.scrollTop).toBe(0);
  });
});

describe("searching", () => {
  it("goes back to the top of the results", async () => {
    localStorage.setItem("bscScroll", "260");

    const { render, list } = await mount();
    const input = document.getElementById("searchInput") as HTMLInputElement;

    input.value = "bookmark 1";
    render(manyBookmarks());
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(list.scrollTop).toBe(0);
  });

  it("forgets the old position rather than jumping back to it afterwards", async () => {
    localStorage.setItem("bscScroll", "260");

    const { render } = await mount();
    const input = document.getElementById("searchInput") as HTMLInputElement;

    input.value = "bookmark";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    render(manyBookmarks());

    expect(stored()).toBeNull();
  });
});
