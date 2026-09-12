import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS } from "../../src/shared/storage";
import type { Item, State, TreeNode } from "../../src/shared/types";

const POPUP_HTML = readFileSync(path.resolve(process.cwd(), "src/ui/popup.html"), "utf8");

function item(title: string, url: string): Item {
  return {
    title,
    url,
    host: new URL(url).hostname,
    status: 200,
    statusText: "",
    reason: null,
    challenge: null,
    checkedAt: null,
  };
}

const leaf = (id: string, title: string, url: string): TreeNode => ({
  id,
  title,
  url,
  type: "bookmark",
});

function twoBookmarks(): State {
  return {
    ...structuredClone(DEFAULTS),
    tree: [leaf("a", "Alpha", "https://alpha.example/"), leaf("b", "Beta", "https://beta.example/")],
    order: ["a", "b"],
    items: { a: item("Alpha", "https://alpha.example/"), b: item("Beta", "https://beta.example/") },
  };
}

/** Mounts the popup the way index.ts does: restore the query, then render. */
async function mount() {
  document.body.innerHTML = POPUP_HTML.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
  vi.resetModules();

  const { render } = await import("../../src/popup/render/list");
  const search = await import("../../src/popup/search");

  search.restoreSearch();
  search.registerSearchHandlers();
  render(twoBookmarks());
  return { render, ...search };
}

const input = () => document.getElementById("searchInput") as HTMLInputElement;
const clearBtn = () => document.getElementById("searchClearBtn") as HTMLButtonElement;
const rowIds = () =>
  [...document.querySelectorAll<HTMLElement>(".row[data-id]")].map((r) => r.dataset["id"]);

function type(value: string): void {
  input().value = value;
  input().dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("search persistence", () => {
  it("remembers the query for the next time the popup opens", async () => {
    await mount();
    type("alpha");

    // Re-mounting is what reopening the popup amounts to.
    await mount();
    expect(input().value).toBe("alpha");
    expect(rowIds()).toEqual(["a"]);
  });

  it("forgets the query once the box is emptied", async () => {
    await mount();
    type("alpha");
    type("");

    await mount();
    expect(input().value).toBe("");
    expect(rowIds()).toEqual(["a", "b"]);
  });

  it("starts empty when nothing was ever searched", async () => {
    await mount();
    expect(input().value).toBe("");
  });

  it("survives localStorage being unavailable", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    await mount();
    expect(input().value).toBe("");
    expect(() => type("alpha")).not.toThrow();
    expect(rowIds()).toEqual(["a"]);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe("clear button", () => {
  it("is hidden while the box is empty", async () => {
    await mount();
    expect(clearBtn().hidden).toBe(true);
  });

  it("appears as soon as something is typed", async () => {
    await mount();
    type("alpha");
    expect(clearBtn().hidden).toBe(false);
  });

  it("is already visible when a remembered query is restored", async () => {
    await mount();
    type("alpha");

    await mount();
    expect(clearBtn().hidden).toBe(false);
  });

  it("empties the box, restores the full list and hides itself", async () => {
    await mount();
    type("alpha");
    expect(rowIds()).toEqual(["a"]);

    clearBtn().click();

    expect(input().value).toBe("");
    expect(rowIds()).toEqual(["a", "b"]);
    expect(clearBtn().hidden).toBe(true);
  });

  it("puts the cursor back in the search box", async () => {
    await mount();
    type("alpha");
    clearBtn().click();
    expect(document.activeElement).toBe(input());
  });

  it("also forgets the remembered query", async () => {
    await mount();
    type("alpha");
    clearBtn().click();

    await mount();
    expect(input().value).toBe("");
  });

  it("clears on Escape as well", async () => {
    await mount();
    type("alpha");

    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(input().value).toBe("");
    expect(rowIds()).toEqual(["a", "b"]);
  });
});

describe("focus", () => {
  it("puts the caret in the search box on open", async () => {
    const { focusSearch } = await mount();
    focusSearch();
    expect(document.activeElement).toBe(input());
  });

  it("places the caret after a restored query rather than selecting it", async () => {
    await mount();
    type("alpha");

    const { focusSearch } = await mount();
    focusSearch();

    expect(input().selectionStart).toBe(5);
    expect(input().selectionEnd).toBe(5);
  });
});
