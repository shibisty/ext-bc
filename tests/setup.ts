import { beforeEach, vi } from "vitest";
import { createBrowserMock, type BrowserMock } from "./mocks/browser";

/**
 * `src/shared/api.ts` captures the global `chrome` object when it is first
 * imported, so the mock has to exist before any source module loads and must
 * keep its identity for the whole run — tests reset its contents rather than
 * replacing the object.
 */
const browserMock = createBrowserMock();

/** jsdom has no IntersectionObserver; lazy rendering only needs it to exist. */
class NoopIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

function installGlobals(): void {
  vi.stubGlobal("chrome", browserMock);
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
}

installGlobals();

beforeEach(() => {
  // Re-applied every test: a test that calls vi.unstubAllGlobals() would
  // otherwise leave `chrome` undefined for whatever imports a module next.
  installGlobals();
  browserMock.__reset();
  vi.clearAllMocks();
});

export function mockBrowser(): BrowserMock {
  return browserMock;
}
