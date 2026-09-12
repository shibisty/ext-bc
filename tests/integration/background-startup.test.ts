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
