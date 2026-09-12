import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockBrowser } from "../setup";

/**
 * The background script runs top to bottom the moment the browser starts it. A
 * single throw up there leaves no message router registered at all, so every
 * button in the popup does nothing and the only visible sign is the "reload the
 * extension" notice.
 *
 * Firefox has no `bookmarks.onChildrenReordered`, and reading `.addListener`
 * off it threw exactly there — reported as "Uncaught TypeError: can't access
 * property addListener, api.bookmarks.onChildrenReordered is undefined".
 */
async function loadBackground(): Promise<void> {
  vi.resetModules();
  await import("../../src/background/index");
}

beforeEach(() => {
  mockBrowser().__setTree([]);
});

describe("background start-up", () => {
  it("survives a browser that is missing some bookmark events", async () => {
    const bookmarks = mockBrowser().bookmarks as unknown as Record<string, unknown>;
    const saved = bookmarks["onChildrenReordered"];
    bookmarks["onChildrenReordered"] = undefined;

    await expect(loadBackground()).resolves.toBeUndefined();

    // The part that matters still got wired up.
    expect(mockBrowser().runtime.onMessage.listeners.length).toBe(1);

    bookmarks["onChildrenReordered"] = saved;
  });

  it("registers the message router on a browser that has everything", async () => {
    await loadBackground();

    expect(mockBrowser().runtime.onMessage.listeners.length).toBe(1);
    expect(mockBrowser().bookmarks.onCreated.listeners.length).toBe(1);
  });
});

/**
 * Firefox for Android may not expose the bookmarks namespace to an extension at
 * all — reported as `can't access property "getTree", s.bookmarks is
 * undefined`. Nothing here can work without it, but the extension must still
 * come up and say why rather than dying at load.
 */
describe("a browser with no bookmarks API", () => {
  it("still registers the message router", async () => {
    const api = mockBrowser() as unknown as Record<string, unknown>;
    const saved = api["bookmarks"];
    api["bookmarks"] = undefined;

    await expect(loadBackground()).resolves.toBeUndefined();
    expect(mockBrowser().runtime.onMessage.listeners.length).toBe(1);

    api["bookmarks"] = saved;
  });

  it("explains itself instead of reporting an empty list", async () => {
    const api = mockBrowser() as unknown as Record<string, unknown>;
    const saved = api["bookmarks"];
    api["bookmarks"] = undefined;

    const { syncBookmarks } = await import("../../src/background/bookmarks");
    const result = await syncBookmarks();

    expect(result.order).toEqual([]);
    expect(result.lastSyncError).toBe("NO_BOOKMARKS_API");

    api["bookmarks"] = saved;
  });
});
