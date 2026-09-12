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

/** `sidePanelMode` mounts the same document the way the side panel serves it. */
async function mount({ sidePanelMode = false } = {}) {
  const body = POPUP_HTML.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
  document.body.innerHTML = body;
  document.body.className = sidePanelMode ? "side-panel-mode" : "";
  vi.resetModules();

  const { render } = await import("../../src/popup/render/list");
  const { closePopupWindow } = await import("../../src/popup/dom");
  const settings = await import("../../src/popup/settings");
  settings.registerSettingsHandlers();
  render(oneBookmark());
  return { closePopupWindow, ...settings };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  document.body.className = "";
});

describe("closePopupWindow", () => {
  it("closes the popup", async () => {
    const close = vi.fn();
    vi.stubGlobal("close", close);

    const { closePopupWindow } = await mount();
    closePopupWindow();

    expect(close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  /**
   * The side panel and the tab view are windows the user opened on purpose;
   * closing either would take away exactly what they asked for.
   */
  it("does nothing when the document is the side panel", async () => {
    const close = vi.fn();
    vi.stubGlobal("close", close);

    const { closePopupWindow } = await mount({ sidePanelMode: true });
    closePopupWindow();

    expect(close).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("opening the side panel from the popup", () => {
  it("opens the panel and closes the popup behind it", async () => {
    const close = vi.fn();
    vi.stubGlobal("close", close);

    await mount();
    const { loadWindowId } = await import("../../src/popup/ui-state");
    const { openSidePanelFromPopup } = await import("../../src/popup/side-panel");
    await loadWindowId();

    await openSidePanelFromPopup();

    expect(mockBrowser().sidePanel.open).toHaveBeenCalledWith({ windowId: 42 });
    expect(close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("keeps the panel open and closes nothing when it is already the panel", async () => {
    const close = vi.fn();
    vi.stubGlobal("close", close);

    await mount({ sidePanelMode: true });
    const { openSidePanelFromPopup } = await import("../../src/popup/side-panel");

    await openSidePanelFromPopup();

    expect(close).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  /** Nothing to open must not leave the user with nothing at all. */
  it("leaves the popup open when there is no window to open the panel in", async () => {
    const close = vi.fn();
    vi.stubGlobal("close", close);
    // No id means Chrome cannot be told where to put the panel.
    mockBrowser().windows.getCurrent.mockResolvedValueOnce({} as { id: number });

    await mount();
    const { openSidePanelFromPopup } = await import("../../src/popup/side-panel");
    await openSidePanelFromPopup();

    expect(mockBrowser().sidePanel.open).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  /**
   * Chrome does not settle `sidePanel.open()` until the panel has loaded. The
   * popup must be gone before then, not after.
   */
  it("closes the popup without waiting for the open to finish", async () => {
    const close = vi.fn();
    vi.stubGlobal("close", close);
    let settle = (): void => {};
    mockBrowser().sidePanel.open.mockReturnValueOnce(
      new Promise<undefined>((resolve) => {
        settle = () => resolve(undefined);
      }),
    );

    await mount();
    const { loadWindowId } = await import("../../src/popup/ui-state");
    const { openSidePanelFromPopup } = await import("../../src/popup/side-panel");
    await loadWindowId();

    const done = openSidePanelFromPopup();
    await Promise.resolve();

    expect(close).toHaveBeenCalled();
    settle();
    await done;
    vi.unstubAllGlobals();
  });
});

describe("opening the tab view from settings", () => {
  it("opens the tab and closes the popup", async () => {
    const close = vi.fn();
    vi.stubGlobal("close", close);

    await mount();
    document.getElementById("openInTabBtn")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(mockBrowser().tabs.create).toHaveBeenCalledWith({
      url: expect.stringContaining("popup.html?view=tab"),
    });
    expect(close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("leaves the side panel open when the tab is opened from there", async () => {
    const close = vi.fn();
    vi.stubGlobal("close", close);

    await mount({ sidePanelMode: true });
    document.getElementById("openInTabBtn")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(mockBrowser().tabs.create).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
