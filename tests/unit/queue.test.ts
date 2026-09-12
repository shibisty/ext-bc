import { describe, expect, it } from "vitest";
import { activeQueueId, buildQueue } from "../../src/shared/queue";

describe("buildQueue", () => {
  it("puts pinned bookmarks first, in the order they were pinned", () => {
    expect(buildQueue(["a", "b", "c", "d"], ["c", "a"], [])).toEqual(["c", "a", "b", "d"]);
  });

  it("keeps tree order for everything that is not pinned", () => {
    expect(buildQueue(["a", "b", "c"], [], [])).toEqual(["a", "b", "c"]);
  });

  it("never lists a pinned bookmark twice", () => {
    const queue = buildQueue(["a", "b"], ["a"], []);
    expect(queue).toEqual(["a", "b"]);
    expect(new Set(queue).size).toBe(queue.length);
  });

  it("excludes bookmarks with checking disabled, pinned ones included", () => {
    expect(buildQueue(["a", "b", "c"], ["c"], ["c", "b"])).toEqual(["a"]);
  });

  it("returns an empty queue when everything is disabled", () => {
    expect(buildQueue(["a", "b"], [], ["a", "b"])).toEqual([]);
  });

  // Pruning stale pinned ids is syncBookmarks' job, not the queue's — this
  // documents where that responsibility sits.
  it("does not prune pinned ids that are missing from the order list", () => {
    expect(buildQueue(["a"], ["gone", "a"], [])).toEqual(["gone", "a"]);
  });
});

describe("activeQueueId", () => {
  it("points at the entry the index selects", () => {
    expect(activeQueueId(["a", "b", "c"], 1)).toBe("b");
  });

  it("wraps around past the end of the queue", () => {
    expect(activeQueueId(["a", "b"], 3)).toBe("b");
    expect(activeQueueId(["a", "b"], 4)).toBe("a");
  });

  it("is null for an empty queue", () => {
    expect(activeQueueId([], 0)).toBeNull();
  });
});
