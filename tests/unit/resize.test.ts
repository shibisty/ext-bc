import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_POPUP_HEIGHT,
  MIN_POPUP_HEIGHT,
  availableHeight,
  clampHeight,
  parseStoredHeight,
} from "../../src/shared/popup-height";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("availableHeight", () => {
  /**
   * 600 is where the popup starts, not where it must stop: a big screen is
   * allowed to ask for more, and the browser decides what it actually grants.
   */
  it("follows the screen rather than a constant", () => {
    expect(availableHeight(1440)).toBe(1440);
    expect(availableHeight(2160)).toBe(2160);
    expect(availableHeight(1440)).toBeGreaterThan(DEFAULT_POPUP_HEIGHT);
  });

  it("stays usable when the screen size is unknown", () => {
    expect(availableHeight(undefined)).toBeGreaterThan(DEFAULT_POPUP_HEIGHT);
    expect(availableHeight(0)).toBeGreaterThan(DEFAULT_POPUP_HEIGHT);
  });
});

describe("clampHeight", () => {
  it("allows more than the default when the screen has room", () => {
    expect(clampHeight(900, 1440)).toBe(900);
    expect(clampHeight(1200, 1440)).toBe(1200);
  });

  it("does not exceed the screen", () => {
    expect(clampHeight(2000, 1000)).toBe(1000);
  });

  it("refuses to go below the minimum", () => {
    expect(clampHeight(10, 1440)).toBe(MIN_POPUP_HEIGHT);
    expect(clampHeight(-500, 1440)).toBe(MIN_POPUP_HEIGHT);
  });

  it("leaves a height in range alone, in both directions", () => {
    expect(clampHeight(420, 1440)).toBe(420);
    expect(clampHeight(300, 1440)).toBe(300);
  });
});

describe("parseStoredHeight", () => {
  it("is null when nothing was ever saved", () => {
    expect(parseStoredHeight(null)).toBeNull();
    expect(parseStoredHeight("")).toBeNull();
  });

  it("reads back a saved height", () => {
    expect(parseStoredHeight("430")).toBe(430);
  });

  it("ignores junk rather than sizing the popup to NaN", () => {
    expect(parseStoredHeight("not a number")).toBeNull();
    expect(parseStoredHeight("-40")).toBeNull();
    expect(parseStoredHeight("0")).toBeNull();
  });
});
