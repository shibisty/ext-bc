import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS } from "../../src/shared/storage";
import type { Item, State, TreeNode } from "../../src/shared/types";
import { mockBrowser } from "../setup";

const POPUP_HTML = readFileSync(path.resolve(process.cwd(), "src/ui/popup.html"), "utf8");

const item = (): Item => ({
  title: "Alpha",
  url: "https://a.example/",
  host: "a.example",
  status: 200,
  statusText: "",
  reason: null,
  challenge: null,
  checkedAt: null,
});

const leaf: TreeNode = { id: "a", title: "Alpha", url: "https://a.example/", type: "bookmark" };

const oneBookmark = (): State => ({
  ...structuredClone(DEFAULTS),
  tree: [leaf],
  order: ["a"],
  items: { a: item() },
});

/** Mounts the popup with one bookmark selected and the shortcuts armed. */
async function mount() {
  document.body.innerHTML = POPUP_HTML.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
  document.body.className = "";
  vi.resetModules();

  const { render } = await import("../../src/popup/render/list");
  const { ui } = await import("../../src/popup/ui-state");
  const { registerKeyboardShortcuts } = await import("../../src/popup/shortcuts");
  const { registerRenameHandlers, openRenameDialog } = await import("../../src/popup/rename");

  registerRenameHandlers();
  registerKeyboardShortcuts();
  render(oneBookmark());
  ui.selectedIds = new Set(["a"]);

  return { openRenameDialog };
}

function press(key: string, target: EventTarget = document.body): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("list keyboard shortcuts", () => {
  it("deletes the selection on Delete", async () => {
    vi.stubGlobal("confirm", () => true); // bulkDelete asks first
    await mount();

    press("Delete");
    await Promise.resolve();

    expect(mockBrowser().runtime.sendMessage).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  /**
   * The reported bug: with a bookmark selected, typing in the rename dialog
   * deleted the bookmark instead of a character.
   */
  it("ignores Backspace typed into the rename field", async () => {
    const { openRenameDialog } = await mount();
    const input = document.getElementById("renameInput") as HTMLInputElement;

    openRenameDialog("a", "Alpha");
    press("Backspace", input);
    await Promise.resolve();

    expect(mockBrowser().runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("ignores Delete typed into the search field", async () => {
    await mount();
    const search = document.getElementById("searchInput") as HTMLInputElement;
    search.focus();

    press("Delete", search);
    await Promise.resolve();

    expect(mockBrowser().runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("ignores keys while the settings view is open", async () => {
    await mount();
    (document.getElementById("settingsView") as HTMLElement).hidden = false;

    press("Delete");
    await Promise.resolve();

    expect(mockBrowser().runtime.sendMessage).not.toHaveBeenCalled();
  });
});
