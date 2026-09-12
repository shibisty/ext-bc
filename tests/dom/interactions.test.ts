import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS } from "../../src/shared/storage";
import type { Item, State, TreeNode } from "../../src/shared/types";
import { mockBrowser } from "../setup";

const POPUP_HTML = readFileSync(path.resolve(process.cwd(), "src/ui/popup.html"), "utf8");

function item(overrides: Partial<Item> = {}): Item {
  return {
    title: "Example",
    url: "https://example.com/",
    host: "example.com",
    status: 200,
    statusText: "",
    reason: null,
    challenge: null,
    checkedAt: null,
    ...overrides,
  };
}

const leaf = (id: string, url: string): TreeNode => ({ id, title: id, url, type: "bookmark" });

function threeBookmarks(): State {
  return {
    ...structuredClone(DEFAULTS),
    tree: [leaf("a", "https://a.example/"), leaf("b", "https://b.example/"), leaf("c", "https://c.example/")],
    order: ["a", "b", "c"],
    items: { a: item(), b: item(), c: item() },
  };
}

/** Mounts the real markup and renders three rows into it. */
async function mount() {
  document.body.innerHTML = POPUP_HTML.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
  vi.resetModules();

  const { render } = await import("../../src/popup/render/list");
  const { ui } = await import("../../src/popup/ui-state");
  render(threeBookmarks());
  return { render, ui };
}

const row = (id: string) => document.querySelector<HTMLElement>(`.row[data-id="${id}"]`)!;
/** Row buttons are addressed by role, not position, so adding one is harmless. */
const button = (id: string, kind: "pin" | "mute" | "archive" | "delete") =>
  row(id).querySelector<HTMLButtonElement>(`.row-actions .${kind}-btn`)!;

/** The sent messages, in order. */
function sentMessages(): { type: string; [key: string]: unknown }[] {
  return mockBrowser().runtime.sendMessage.mock.calls.map(
    (call) => call[0] as { type: string },
  );
}

/**
 * jsdom implements neither DragEvent nor layout, so drag events are synthesised
 * with the two properties the handlers actually read.
 */
function dragEvent(type: string, clientY: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clientY", { value: clientY });
  Object.defineProperty(event, "dataTransfer", {
    value: { effectAllowed: "", dropEffect: "", setData: vi.fn(), getData: vi.fn() },
  });
  return event;
}

/** Gives a row a real-looking box so before/after drops can be distinguished. */
function withHeight(el: HTMLElement, top: number, height: number): void {
  el.getBoundingClientRect = () => ({ top, height, bottom: top + height, left: 0, right: 0, width: 100, x: 0, y: top, toJSON: () => ({}) });
}

beforeEach(() => {
  mockBrowser().runtime.sendMessage.mockResolvedValue({ ok: true, state: threeBookmarks() });
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => vi.unstubAllGlobals());

describe("row buttons", () => {
  it("pins through the background worker", async () => {
    await mount();
    button("b", "pin").click();
    expect(sentMessages()).toEqual([
      { type: "TOGGLE_PIN", id: "b", mirrorToToolbar: false },
    ]);
  });

  it("toggles checking through the background worker", async () => {
    await mount();
    button("b", "mute").click();
    expect(sentMessages()).toEqual([{ type: "TOGGLE_DISABLE_CHECK", id: "b" }]);
  });

  it("asks before deleting, then deletes one bookmark", async () => {
    await mount();
    button("b", "delete").click();
    await vi.waitFor(() => expect(sentMessages()).toEqual([{ type: "DELETE", id: "b" }]));
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("deletes nothing when the confirmation is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    await mount();
    button("b", "delete").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sentMessages()).toEqual([]);
  });

  it("deletes the whole selection when the clicked row is part of it", async () => {
    const { ui } = await mount();
    row("a").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    row("c").dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(ui.selectedIds.size).toBe(2);

    button("a", "delete").click();
    await vi.waitFor(() =>
      expect(sentMessages()).toEqual([{ type: "DELETE_MANY", ids: expect.arrayContaining(["a", "c"]) }]),
    );
  });

  it("deletes only the clicked row when it is outside the selection", async () => {
    await mount();
    row("a").dispatchEvent(new MouseEvent("click", { bubbles: true }));

    button("c", "delete").click();
    await vi.waitFor(() => expect(sentMessages()).toEqual([{ type: "DELETE", id: "c" }]));
  });

  it("a row button does not also select the row", async () => {
    const { ui } = await mount();
    button("b", "pin").click();
    expect(ui.selectedIds.size).toBe(0);
  });
});

describe("opening bookmarks", () => {
  it("opens a bookmark in a new tab on double click", async () => {
    await mount();
    row("b").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(mockBrowser().tabs.create).toHaveBeenCalledWith({
      url: "https://example.com/",
      active: true,
    });
  });
});

describe("context menu", () => {
  const openMenu = (id: string) =>
    row(id).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

  it("opens on right click", async () => {
    await mount();
    openMenu("b");
    expect(document.querySelector(".context-menu")).not.toBeNull();
  });

  it("offers check, open, rename, pin, mute, archive and delete", async () => {
    await mount();
    openMenu("b");
    const labels = [...document.querySelectorAll(".context-menu button")].map(
      (btn) => btn.textContent,
    );
    expect(labels).toEqual([
      "🔎contextCheckNow",
      "↗contextOpenNewTab",
      "✏contextRename",
      "📌contextPin",
      "🔕contextDisableCheck",
      "🗄contextArchive",
      "🗑contextDelete",
    ]);
  });

  it("checks a single bookmark on demand", async () => {
    await mount();
    openMenu("b");
    document.querySelectorAll<HTMLButtonElement>(".context-menu button")[0]?.click();
    await vi.waitFor(() => expect(sentMessages()).toEqual([{ type: "CHECK_ONE", id: "b" }]));
  });

  it("switches to bulk wording once several rows are selected", async () => {
    await mount();
    row("a").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    row("b").dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    openMenu("a");

    const labels = [...document.querySelectorAll(".context-menu button")].map(
      (btn) => btn.textContent,
    );
    expect(labels).toContain("↗contextOpenSelected(2)");
    expect(labels).toContain("🗑contextDeleteSelected(2)");
  });

  it("closes on Escape", async () => {
    await mount();
    openMenu("b");
    await new Promise((resolve) => setTimeout(resolve, 0));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".context-menu")).toBeNull();
  });

  it("replaces an already open menu rather than stacking a second one", async () => {
    await mount();
    openMenu("a");
    openMenu("b");
    expect(document.querySelectorAll(".context-menu")).toHaveLength(1);
  });
});

describe("drag and drop", () => {
  it("drops above the midpoint as 'before'", async () => {
    await mount();
    withHeight(row("c"), 100, 40);

    row("a").dispatchEvent(dragEvent("dragstart", 0));
    row("c").dispatchEvent(dragEvent("drop", 105));

    await vi.waitFor(() =>
      expect(sentMessages()).toEqual([
        { type: "MOVE_BOOKMARKS", ids: ["a"], targetId: "c", position: "before" },
      ]),
    );
  });

  it("drops below the midpoint as 'after'", async () => {
    await mount();
    withHeight(row("c"), 100, 40);

    row("a").dispatchEvent(dragEvent("dragstart", 0));
    row("c").dispatchEvent(dragEvent("drop", 135));

    await vi.waitFor(() =>
      expect(sentMessages()).toEqual([
        { type: "MOVE_BOOKMARKS", ids: ["a"], targetId: "c", position: "after" },
      ]),
    );
  });

  it("carries the whole selection when dragging one of its rows", async () => {
    await mount();
    row("a").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    row("b").dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));

    row("a").dispatchEvent(dragEvent("dragstart", 0));
    row("c").dispatchEvent(dragEvent("drop", 0));

    await vi.waitFor(() =>
      expect(sentMessages()).toEqual([
        { type: "MOVE_BOOKMARKS", ids: ["a", "b"], targetId: "c", position: "after" },
      ]),
    );
  });

  it("ignores a drop onto one of the dragged rows", async () => {
    await mount();
    row("a").dispatchEvent(dragEvent("dragstart", 0));
    row("a").dispatchEvent(dragEvent("drop", 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sentMessages()).toEqual([]);
  });

  it("clears the drop markers when the drag ends", async () => {
    await mount();
    row("a").dispatchEvent(dragEvent("dragstart", 0));
    row("c").dispatchEvent(dragEvent("dragover", 0));
    expect(document.querySelectorAll(".drag-over-before,.drag-over-after")).not.toHaveLength(0);

    row("a").dispatchEvent(dragEvent("dragend", 0));
    expect(document.querySelectorAll(".drag-over-before,.drag-over-after")).toHaveLength(0);
  });

  it("drops into a folder as 'inside'", async () => {
    document.body.innerHTML = POPUP_HTML.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
    vi.resetModules();
    const { render } = await import("../../src/popup/render/list");

    render({
      ...structuredClone(DEFAULTS),
      tree: [
        { id: "f1", title: "Work", type: "folder", children: [leaf("a", "https://a.example/")] },
        leaf("b", "https://b.example/"),
      ],
      order: ["a", "b"],
      items: { a: item(), b: item() },
    });

    row("b").dispatchEvent(dragEvent("dragstart", 0));
    document.querySelector("summary")?.dispatchEvent(dragEvent("drop", 0));

    await vi.waitFor(() =>
      expect(sentMessages()).toEqual([
        { type: "MOVE_BOOKMARKS", ids: ["b"], targetId: "f1", position: "inside" },
      ]),
    );
  });
});
