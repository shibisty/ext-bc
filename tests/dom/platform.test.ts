import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockBrowser } from "../setup";

const POPUP_HTML = readFileSync(path.resolve(process.cwd(), "src/ui/popup.html"), "utf8");
const POPUP_CSS = readFileSync(path.resolve(process.cwd(), "src/ui/popup.css"), "utf8");

function mountMarkup(): void {
  document.body.innerHTML = POPUP_HTML.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
  document.body.className = "";
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.body.className = "";
  vi.resetModules();
});

/**
 * Firefox for Android opens the action's page full-screen instead of in a popup
 * window, so the desktop sizing (360px wide, a 600px ceiling, a drag grip) is
 * both wrong and pointless there.
 */
describe("Android layout", () => {
  it("reads Android off the user agent without waiting for the browser", async () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Android 14; Mobile; rv:130.0)" });
    const { looksLikeAndroid } = await import("../../src/shared/platform");

    expect(looksLikeAndroid()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("does not mistake a desktop user agent for Android", async () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    const { looksLikeAndroid } = await import("../../src/shared/platform");

    expect(looksLikeAndroid()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("confirms the guess against the browser's own answer", async () => {
    mockBrowser().runtime.getPlatformInfo.mockResolvedValue({
      os: "android" as chrome.runtime.PlatformOs,
    });
    const { isAndroid } = await import("../../src/shared/platform");

    await expect(isAndroid()).resolves.toBe(true);
  });

  it("marks the document, which is what the stylesheet keys off", async () => {
    mountMarkup();
    const { applyPlatformClass } = await import("../../src/shared/platform");

    applyPlatformClass(true);
    expect(document.body.classList.contains("android-mode")).toBe(true);

    applyPlatformClass(false);
    expect(document.body.classList.contains("android-mode")).toBe(false);
  });

  it("hides the height setting, which the browser controls there", () => {
    mountMarkup();
    const row = document.getElementById("popupHeightInput")?.closest(".settings-row");

    expect(row?.classList.contains("desktop-only")).toBe(true);
    expect(POPUP_CSS).toMatch(/body\.android-mode \.settings-row\.desktop-only/);
  });

  /**
   * Without it Android lays the document out in a virtual 980px viewport and
   * scales the result down — the list rendered as unreadable desktop UI.
   */
  it("declares a viewport, or Android renders the desktop layout shrunk", () => {
    expect(POPUP_HTML).toMatch(
      /<meta\s+name="viewport"\s+content="[^"]*width=device-width[^"]*"/,
    );
  });

  it("stacks each setting over its control so the column is not ragged", () => {
    const rule = POPUP_CSS.match(/body\.android-mode \.settings-row \{[^}]*\}/)?.[0] ?? "";

    expect(rule).toContain("flex-direction: column");
    expect(rule).toContain("align-items: stretch");
  });

  it("sizes touch targets for a finger", () => {
    expect(POPUP_CSS).toMatch(/body\.android-mode \.row-btn \{[^}]*width: 34px/);
    expect(POPUP_CSS).toMatch(/body\.android-mode \{[^}]*font-size: 15px/);
  });

  it("lets the page fill the screen instead of sitting at 360px", () => {
    const rule = POPUP_CSS.match(/body\.android-mode \{[^}]*\}/)?.[0] ?? "";

    expect(rule).toContain("width: 100%");
    expect(rule).toContain("max-height: none");
  });

  it("drops the drag grip and the sidebar button", () => {
    expect(POPUP_CSS).toMatch(/body\.android-mode \.resize-grip[\s\S]{0,60}display: none/);
  });
});

describe("the resize machinery on Android", () => {
  it("leaves the height alone and hides the grip", async () => {
    mountMarkup();
    document.body.classList.add("android-mode");
    localStorage.setItem("bscPopupHeight", "540");

    const { applyStoredHeight, registerResizeHandle } = await import("../../src/popup/resize");
    applyStoredHeight();
    registerResizeHandle();

    expect(document.body.style.height).toBe("");
    expect((document.getElementById("resizeGrip") as HTMLElement).hidden).toBe(true);
    localStorage.clear();
  });
});
