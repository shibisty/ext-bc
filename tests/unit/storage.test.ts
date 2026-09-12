import { describe, expect, it } from "vitest";
import { DEFAULTS, DEFAULT_INTERVAL_MINUTES, STATE_KEYS, readState, writeState } from "../../src/shared/storage";
import { mockBrowser } from "../setup";

describe("readState", () => {
  it("returns defaults for a completely empty storage", async () => {
    await expect(readState()).resolves.toEqual(DEFAULTS);
  });

  it("reads every key declared in the schema", async () => {
    await readState();
    expect(mockBrowser().storage.local.get).toHaveBeenCalledWith(STATE_KEYS);
  });

  it("includes checkingSince, which the stale-lock check depends on", async () => {
    expect(STATE_KEYS).toContain("checkingSince");
    mockBrowser().__seed({ checking: true, checkingSince: 123 });
    await expect(readState()).resolves.toMatchObject({ checking: true, checkingSince: 123 });
  });

  it("keeps stored values and fills in only what is missing", async () => {
    mockBrowser().__seed({ order: ["a"], currentIndex: 4 });
    const state = await readState();
    expect(state.order).toEqual(["a"]);
    expect(state.currentIndex).toBe(4);
    expect(state.intervalMinutes).toBe(DEFAULT_INTERVAL_MINUTES);
    expect(state.items).toEqual({});
  });

  it("preserves an interval of 0, which means auto-check off", async () => {
    mockBrowser().__seed({ intervalMinutes: 0 });
    await expect(readState()).resolves.toMatchObject({ intervalMinutes: 0 });
  });

  it("falls back to the default when a value was nulled out", async () => {
    mockBrowser().__seed({ intervalMinutes: null });
    await expect(readState()).resolves.toMatchObject({
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    });
  });

  it("never hands out a shared reference to the defaults", async () => {
    const first = await readState();
    first.order.push("mutated");
    await expect(readState()).resolves.toMatchObject({ order: [] });
    expect(DEFAULTS.order).toEqual([]);
  });
});

describe("writeState", () => {
  it("merges a partial patch into storage", async () => {
    await writeState({ currentIndex: 7 });
    await writeState({ lastCheck: 99 });
    await expect(readState()).resolves.toMatchObject({ currentIndex: 7, lastCheck: 99 });
  });
});
