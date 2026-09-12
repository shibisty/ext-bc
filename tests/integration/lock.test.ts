import { describe, expect, it, vi } from "vitest";
import { withLock } from "../../src/background/lock";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("withLock", () => {
  it("runs queued work one at a time, in order", async () => {
    const log: string[] = [];

    const slow = withLock(async () => {
      log.push("a:start");
      await tick(20);
      log.push("a:end");
    });
    const fast = withLock(async () => {
      log.push("b:start");
      log.push("b:end");
    });

    await Promise.all([slow, fast]);

    expect(log).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });

  it("passes the result back to the caller", async () => {
    await expect(withLock(async () => 42)).resolves.toBe(42);
  });

  it("rejects the caller that failed", async () => {
    await expect(withLock(async () => Promise.reject(new Error("nope")))).rejects.toThrow("nope");
  });

  it("keeps serving later callers after one of them throws", async () => {
    const failed = withLock(async () => {
      throw new Error("boom");
    });
    const after = withLock(async () => "still works");

    await expect(failed).rejects.toThrow("boom");
    await expect(after).resolves.toBe("still works");
  });

  /**
   * The race this exists to prevent: two read-modify-write passes over the same
   * `items` map, where the second read happens before the first write lands.
   */
  it("prevents a lost update between two read-modify-write passes", async () => {
    let shared = { a: 0, b: 0 };

    const readModifyWrite = async (key: "a" | "b") => {
      const copy = { ...shared };
      await tick(10);
      copy[key] = 1;
      shared = copy;
    };

    await Promise.all([withLock(() => readModifyWrite("a")), withLock(() => readModifyWrite("b"))]);

    expect(shared).toEqual({ a: 1, b: 1 });
  });

  it("would lose that update without the lock", async () => {
    let shared = { a: 0, b: 0 };

    const readModifyWrite = async (key: "a" | "b") => {
      const copy = { ...shared };
      await tick(10);
      copy[key] = 1;
      shared = copy;
    };

    await Promise.all([readModifyWrite("a"), readModifyWrite("b")]);

    // Demonstrates that the guard above is actually doing something.
    expect(shared).toEqual({ a: 0, b: 1 });
  });

  it("does not deadlock when locked work awaits unrelated async calls", async () => {
    const inner = vi.fn(async () => "inner");
    await expect(withLock(async () => `${await inner()}/outer`)).resolves.toBe("inner/outer");
  });
});
