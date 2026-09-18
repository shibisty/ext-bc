import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS } from "../../src/shared/storage";
import type { Item, State, TreeNode } from "../../src/shared/types";
import { mockBrowser } from "../setup";

const POPUP_HTML = readFileSync(path.resolve(process.cwd(), "src/ui/popup.html"), "utf8");

const item = (title: string, url: string): Item => ({
  title,
  url,
  host: new URL(url).hostname,
  status: 200,
  statusText: "",
  reason: null,
  challenge: null,
  checkedAt: Date.now() - 60_000,
});

const leaf = (id: string, title: string): TreeNode => ({
  id,
  title,
  url: `https://${id}.example/`,
  type: "bookmark",
});

function twoBookmarks(): State {
  return {
    ...structuredClone(DEFAULTS),
    tree: [leaf("a", "Alpha"), leaf("b", "Beta")],
    order: ["a", "b"],
    items: { a: item("Alpha", "https://a.example/"), b: item("Beta", "https://b.example/") },
  };
}

async function mount() {
  document.body.innerHTML = POPUP_HTML.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
  vi.resetModules();

  const { render } = await import("../../src/popup/render/list");
  const settings = await import("../../src/popup/settings");
  const prefs = await import("../../src/popup/preferences");
  const actions = await import("../../src/popup/actions");

  settings.applyPreferences();
  render(twoBookmarks());
  return { render, ...settings, ...prefs, openSelected: actions.openSelected };
}

const row = (id: string) => document.querySelector<HTMLElement>(`.row[data-id="${id}"]`)!;
const select = (id: string) => document.getElementById(id) as HTMLSelectElement;

function choose(selectId: string, value: string): void {
  const el = select(selectId);
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

const click = (id: string, init: MouseEventInit = {}) =>
  row(id).dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
const dblclick = (id: string) =>
  row(id).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("open trigger", () => {
  it("opens on double click by default, not on a single one", async () => {
    await mount();

    click("a");
    expect(mockBrowser().tabs.create).not.toHaveBeenCalled();

    dblclick("a");
    expect(mockBrowser().tabs.create).toHaveBeenCalledWith({
      url: "https://a.example/",
      active: true,
    });
  });

  it("selects on a single click while double click is the trigger", async () => {
    await mount();
    click("a");
    expect(row("a").className).toContain("selected");
  });

  it("opens on a single click once switched", async () => {
    await mount();
    choose("openTriggerSelect", "click");

    click("a");
    expect(mockBrowser().tabs.create).toHaveBeenCalledOnce();
  });

  it("does not open on double click when single click is the trigger", async () => {
    await mount();
    choose("openTriggerSelect", "click");

    dblclick("a");
    expect(mockBrowser().tabs.create).not.toHaveBeenCalled();
  });

  // Otherwise building a selection would be impossible in single-click mode.
  it("still selects with ctrl and shift in single-click mode", async () => {
    await mount();
    choose("openTriggerSelect", "click");

    click("a", { ctrlKey: true });
    expect(mockBrowser().tabs.create).not.toHaveBeenCalled();
    expect(row("a").className).toContain("selected");

    click("b", { shiftKey: true });
    expect(mockBrowser().tabs.create).not.toHaveBeenCalled();
  });

  // The row buttons sit inside the row: clicking one must not also open it.
  it("a row button never opens the bookmark, in either mode", async () => {
    await mount();
    choose("openTriggerSelect", "click");

    row("a").querySelector<HTMLButtonElement>(".pin-btn")?.click();
    row("a").querySelector<HTMLButtonElement>(".archive-btn")?.click();

    expect(mockBrowser().tabs.create).not.toHaveBeenCalled();
  });

  it("remembers the trigger", async () => {
    await mount();
    choose("openTriggerSelect", "click");

    await mount();
    expect(select("openTriggerSelect").value).toBe("click");
    click("a");
    expect(mockBrowser().tabs.create).toHaveBeenCalledOnce();
  });
});

describe("open target", () => {
  it("opens in a new tab by default", async () => {
    await mount();
    dblclick("a");
    expect(mockBrowser().tabs.create).toHaveBeenCalled();
    expect(mockBrowser().tabs.update).not.toHaveBeenCalled();
  });

  /**
   * tabs.update navigates the current tab the ordinary way, so the visit is
   * recorded in history and Back returns to the previous page.
   */
  it("navigates the current tab once switched", async () => {
    await mount();
    choose("openTargetSelect", "current");

    dblclick("a");
    expect(mockBrowser().tabs.update).toHaveBeenCalledWith({ url: "https://a.example/" });
    expect(mockBrowser().tabs.create).not.toHaveBeenCalled();
  });

  it("still uses new tabs when opening a whole selection", async () => {
    const mounted = await mount();
    choose("openTargetSelect", "current");

    click("a");
    click("b", { ctrlKey: true });
    mounted.openSelected();

    expect(mockBrowser().tabs.update).not.toHaveBeenCalled();
    expect(mockBrowser().tabs.create).toHaveBeenCalledTimes(2);
  });
});

describe("after opening", () => {
  it("keeps the popup open by default", async () => {
    const close = vi.fn();
    vi.stubGlobal("close", close);

    await mount();
    dblclick("a");

    expect(close).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("closes the popup once switched", async () => {
    const close = vi.fn();
    vi.stubGlobal("close", close);

    await mount();
    choose("afterOpenSelect", "close");
    dblclick("a");

    expect(close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does not close for a background tab from a multi-open", async () => {
    const close = vi.fn();
    vi.stubGlobal("close", close);

    const mounted = await mount();
    choose("afterOpenSelect", "close");
    click("a");
    mounted.openSelected();

    expect(close).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("row detail", () => {
  it("shows everything by default", async () => {
    await mount();
    expect(document.body.className).not.toContain("rows-title-only");
  });

  it("switches the whole list to title-only", async () => {
    await mount();
    choose("rowDetailSelect", "title");
    expect(document.body.className).toContain("rows-title-only");
  });

  it("remembers the choice", async () => {
    await mount();
    choose("rowDetailSelect", "title");

    await mount();
    expect(document.body.className).toContain("rows-title-only");
    expect(select("rowDetailSelect").value).toBe("title");
  });
});

describe("row actions", () => {
  it("shows the row buttons by default", async () => {
    await mount();
    expect(document.body.className).not.toContain("actions-menu-only");
    expect(row("a").querySelector(".row-actions")).not.toBeNull();
  });

  it("hides them in context-menu-only mode", async () => {
    await mount();
    choose("rowActionsSelect", "menu");
    expect(document.body.className).toContain("actions-menu-only");
  });

  it("remembers the choice", async () => {
    await mount();
    choose("rowActionsSelect", "menu");

    await mount();
    expect(document.body.className).toContain("actions-menu-only");
  });
});

describe("the settings screen", () => {
  const open = () => (document.getElementById("settingsBtn") as HTMLButtonElement).click();
  const close = () => (document.getElementById("closeSettingsBtn") as HTMLButtonElement).click();

  async function mountWithHandlers() {
    const mounted = await mount();
    mounted.registerSettingsHandlers();
    return mounted;
  }

  it("takes over the view, hiding the list and its navigation", async () => {
    await mountWithHandlers();
    open();

    expect(document.body.className).toContain("settings-open");
    expect(document.getElementById("settingsView")?.hidden).toBe(false);
  });

  /**
   * The tab bar used to stay on screen above the settings, where clicking a tab
   * did nothing visible.
   */
  it("hides the tab bar rather than leaving it there doing nothing", async () => {
    await mountWithHandlers();
    open();

    const tabs = document.getElementById("tabs");
    expect(tabs).not.toBeNull();
    // Hidden through the body class, so the rule covers search and list too.
    expect(document.body.classList.contains("settings-open")).toBe(true);
  });

  it("puts everything back on the way out", async () => {
    await mountWithHandlers();
    open();
    close();

    expect(document.body.className).not.toContain("settings-open");
    expect(document.getElementById("settingsView")?.hidden).toBe(true);
  });

  /**
   * The gear is a toggle: pressing it from inside settings used to do nothing
   * visible, leaving the × as the only way back to the list.
   */
  it("closes again when the gear is pressed a second time", async () => {
    await mountWithHandlers();
    open();
    open();

    expect(document.body.className).not.toContain("settings-open");
    expect(document.getElementById("settingsView")?.hidden).toBe(true);
  });

  it("reopens on the press after that", async () => {
    await mountWithHandlers();
    open();
    open();
    open();

    expect(document.getElementById("settingsView")?.hidden).toBe(false);
  });
});

describe("stored values", () => {
  it("falls back to the default when storage holds nonsense", async () => {
    localStorage.setItem("bscOpenTrigger", "sideways");
    const { preferences } = await mount();
    expect(preferences().openTrigger).toBe("dblclick");
  });

  it("survives localStorage throwing", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { preferences } = await mount();
    expect(preferences().openTarget).toBe("new");

    spy.mockRestore();
  });
});
