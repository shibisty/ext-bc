import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMessageRouter } from "../../src/background/router";
import type { Message, MessageResponse } from "../../src/shared/messages";
import { readState } from "../../src/shared/storage";
import { mockBrowser } from "../setup";

/** Sends a message through the registered listener and resolves its response. */
function send(msg: Message): Promise<MessageResponse> {
  return new Promise((resolve) => {
    mockBrowser().runtime.onMessage.emit(
      msg,
      {} as chrome.runtime.MessageSender,
      resolve as (response: unknown) => void,
    );
  });
}

beforeEach(() => {
  registerMessageRouter();
  mockBrowser().__setTree([
    {
      id: "1",
      title: "Bar",
      children: [
        { id: "2", title: "A", url: "https://a.example/1" },
        { id: "3", title: "B", url: "https://b.example/1" },
      ],
    },
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 200 })),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("message router", () => {
  it("answers every message with ok and the resulting state", async () => {
    const res = await send({ type: "GET_STATE" });
    expect(res.ok).toBe(true);
    expect(res.state).toMatchObject({ order: [] });
  });

  it("SYNC walks the bookmark tree into state", async () => {
    const res = await send({ type: "SYNC" });
    expect(res.state?.order).toEqual(["2", "3"]);
  });

  it("TOGGLE_PIN pins, and pinning again unpins", async () => {
    await send({ type: "SYNC" });

    let res = await send({ type: "TOGGLE_PIN", id: "3" });
    expect(res.state?.pinned).toEqual(["3"]);

    res = await send({ type: "TOGGLE_PIN", id: "3" });
    expect(res.state?.pinned).toEqual([]);
  });

  it("puts the most recently pinned bookmark first", async () => {
    await send({ type: "SYNC" });
    await send({ type: "TOGGLE_PIN", id: "2" });
    const res = await send({ type: "TOGGLE_PIN", id: "3" });
    expect(res.state?.pinned).toEqual(["3", "2"]);
  });

  it("TOGGLE_DISABLE_CHECK appends rather than prepends", async () => {
    await send({ type: "SYNC" });
    await send({ type: "TOGGLE_DISABLE_CHECK", id: "2" });
    const res = await send({ type: "TOGGLE_DISABLE_CHECK", id: "3" });
    expect(res.state?.disabledChecks).toEqual(["2", "3"]);
  });

  it("SET_INTERVAL stores the interval and re-arms the alarm", async () => {
    const res = await send({ type: "SET_INTERVAL", minutes: 180 });
    expect(res.state?.intervalMinutes).toBe(180);
    expect(mockBrowser().alarms.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ periodInMinutes: 180 }),
    );
  });

  it("SET_INTERVAL of 0 turns auto-checking off instead of scheduling", async () => {
    await send({ type: "SET_INTERVAL", minutes: 0 });
    expect(mockBrowser().alarms.clear).toHaveBeenCalled();
    expect(mockBrowser().alarms.create).not.toHaveBeenCalled();
  });

  /**
   * The handshake exists because a browser can keep an older background worker
   * registered across an update: the popup is new, the worker is not, and every
   * message the old version never knew about goes unanswered. Reproduced on an
   * update from 1.3.1 — the manifest read 1.5.0 while TOGGLE_ARCHIVE returned
   * nothing at all.
   */
  it("PING answers with the version the worker was built from", async () => {
    const res = await send({ type: "PING" });
    expect(res.ok).toBe(true);
    expect(res.version).toBe("9.9.9");
  });

  it("stamps the version on every answer, not just the handshake", async () => {
    const res = await send({ type: "GET_STATE" });
    expect(res.version).toBe("9.9.9");
  });

  it("SET_CREDENTIALS stores the choice in extension state", async () => {
    let res = await send({ type: "SET_CREDENTIALS", send: true });
    expect(res.state?.sendCredentials).toBe(true);

    res = await send({ type: "SET_CREDENTIALS", send: false });
    expect(res.state?.sendCredentials).toBe(false);
  });

  it("starts with cookies switched off", async () => {
    const res = await send({ type: "GET_STATE" });
    expect(res.state?.sendCredentials).toBe(false);
  });

  it("RESET_INDEX rewinds the queue", async () => {
    await send({ type: "SYNC" });
    mockBrowser().__seed({ currentIndex: 1 });

    const res = await send({ type: "RESET_INDEX" });
    expect(res.state?.currentIndex).toBe(0);
  });

  it("CHECK_ONE records a status for just that bookmark", async () => {
    await send({ type: "SYNC" });
    const res = await send({ type: "CHECK_ONE", id: "3" });
    expect(res.state?.items["3"]?.status).toBe(200);
    expect(res.state?.items["2"]?.status).toBeNull();
  });

  it("DELETE removes the bookmark and re-syncs", async () => {
    await send({ type: "SYNC" });
    const res = await send({ type: "DELETE", id: "2" });
    expect(res.state?.order).toEqual(["3"]);
    expect(res.state?.items["2"]).toBeUndefined();
  });

  it("DELETE_MANY removes all of them", async () => {
    await send({ type: "SYNC" });
    const res = await send({ type: "DELETE_MANY", ids: ["2", "3"] });
    expect(res.state?.order).toEqual([]);
  });

  it("DELETE survives an id that is already gone", async () => {
    await send({ type: "SYNC" });
    const res = await send({ type: "DELETE", id: "does-not-exist" });
    expect(res.ok).toBe(true);
    expect(res.state?.order).toEqual(["2", "3"]);
  });

  it("MOVE_BOOKMARKS reorders the real bookmarks", async () => {
    await send({ type: "SYNC" });
    const res = await send({
      type: "MOVE_BOOKMARKS",
      ids: ["3"],
      targetId: "2",
      position: "before",
    });
    expect(res.state?.order).toEqual(["3", "2"]);
  });

  it("TOGGLE_ARCHIVE archives, and archiving again restores", async () => {
    await send({ type: "SYNC" });

    let res = await send({ type: "TOGGLE_ARCHIVE", id: "3" });
    expect(res.state?.archived).toEqual(["3"]);

    res = await send({ type: "TOGGLE_ARCHIVE", id: "3" });
    expect(res.state?.archived).toEqual([]);
  });

  it("archiving leaves the real bookmark exactly where it was", async () => {
    await send({ type: "SYNC" });
    await send({ type: "TOGGLE_ARCHIVE", id: "3" });

    // Still in the browser, still in `order` — only the popup's view changes.
    const res = await send({ type: "SYNC" });
    expect(res.state?.order).toEqual(["2", "3"]);
    expect(mockBrowser().bookmarks.remove).not.toHaveBeenCalled();
    expect(mockBrowser().bookmarks.move).not.toHaveBeenCalled();
  });

  it("forgets an archived id once its bookmark is gone", async () => {
    await send({ type: "SYNC" });
    await send({ type: "TOGGLE_ARCHIVE", id: "3" });

    const res = await send({ type: "DELETE", id: "3" });
    expect(res.state?.archived).toEqual([]);
  });

  it("RENAME updates the bookmark in the browser itself", async () => {
    await send({ type: "SYNC" });

    const res = await send({ type: "RENAME", id: "2", title: "Renamed" });

    expect(mockBrowser().bookmarks.update).toHaveBeenCalledWith("2", { title: "Renamed" });
    expect(res.state?.items["2"]?.title).toBe("Renamed");
  });

  it("RENAME trims the title and ignores an empty one", async () => {
    await send({ type: "SYNC" });

    await send({ type: "RENAME", id: "2", title: "  Spaced  " });
    expect(mockBrowser().bookmarks.update).toHaveBeenCalledWith("2", { title: "Spaced" });

    await send({ type: "RENAME", id: "2", title: "   " });
    expect(mockBrowser().bookmarks.update).toHaveBeenCalledTimes(1);
  });

  it("RENAME survives a node the browser refuses to rename", async () => {
    await send({ type: "SYNC" });
    mockBrowser().bookmarks.update.mockRejectedValueOnce(new Error("read-only"));

    const res = await send({ type: "RENAME", id: "2", title: "Nope" });
    expect(res.ok).toBe(true);
  });

  it("answers with ok:false when a handler throws", async () => {
    mockBrowser().storage.local.set.mockRejectedValueOnce(new Error("quota"));
    const res = await send({ type: "SYNC" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("quota");
  });

  /**
   * A browser that will not hand over its bookmarks is not a crash: the walk
   * reports why, and the popup prints it under the empty state instead of
   * claiming there are no bookmarks.
   */
  it("reports an unreadable bookmark tree without failing", async () => {
    mockBrowser().bookmarks.getTree.mockRejectedValueOnce(new Error("unavailable"));

    const res = await send({ type: "SYNC" });

    expect(res.ok).toBe(true);
    expect(res.state?.order).toEqual([]);
    expect(res.state?.lastSyncError).toContain("unavailable");
  });

  it("says so when the tree is readable but holds nothing", async () => {
    mockBrowser().__setTree([{ id: "1", title: "Bookmarks bar", children: [] }]);

    const res = await send({ type: "SYNC" });

    expect(res.state?.lastSyncError).toContain("top-level folder");
  });

  it("clears the explanation once bookmarks are found", async () => {
    const res = await send({ type: "SYNC" });

    expect(res.state?.order.length).toBeGreaterThan(0);
    expect(res.state?.lastSyncError).toBeNull();
  });

  /**
   * An unanswered message rejects the caller's promise with "Receiving end does
   * not exist", which in the popup looks like a button doing nothing at all —
   * exactly what a stale service worker produces after an update. Saying "no"
   * out loud is what lets the popup report it.
   */
  it("answers a message type it does not know instead of staying silent", async () => {
    const sendResponse = vi.fn();
    mockBrowser().runtime.onMessage.emit(
      { type: "NOT_A_REAL_MESSAGE" } as unknown as Message,
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          error: expect.stringContaining("NOT_A_REAL_MESSAGE"),
        }),
      ),
    );
  });

  it("serialises two checks that both rewrite the items map", async () => {
    await send({ type: "SYNC" });

    // Both passes read-modify-write `items`; without the shared lock the slower
    // one would overwrite the other's result.
    await Promise.all([send({ type: "CHECK_ONE", id: "2" }), send({ type: "CHECK_ONE", id: "3" })]);

    const state = await readState();
    expect(state.items["2"]?.status).toBe(200);
    expect(state.items["3"]?.status).toBe(200);
  });
});

/**
 * `bookmarks.move` interprets its index differently depending on whether the
 * node is lifted out before or after the position is resolved, and the two
 * readings disagree exactly when a bookmark moves *down* within its folder —
 * which is why dragging downwards used to land one place short. The reorder
 * code asks, measures and corrects, so it has to come out right either way.
 */
describe.each(["before-removal", "after-removal"] as const)(
  "reordering with %s move semantics",
  (semantics) => {
    const order = () =>
      mockBrowser()
        .__tree()[0]!
        .children!.map((child) => child.title);

    beforeEach(() => {
      mockBrowser().__setMoveSemantics(semantics);
      mockBrowser().__setTree([
        {
          id: "1",
          title: "Bar",
          children: ["A", "B", "C", "D"].map((t, i) => ({
            id: String(10 + i),
            title: t,
            url: `https://${t}.example/`,
          })),
        },
      ]);
    });

    it("drops a bookmark after one further down the list", async () => {
      await send({ type: "SYNC" });
      await send({ type: "MOVE_BOOKMARKS", ids: ["10"], targetId: "12", position: "after" });
      expect(order()).toEqual(["B", "C", "A", "D"]);
    });

    it("drops a bookmark before one further down the list", async () => {
      await send({ type: "SYNC" });
      await send({ type: "MOVE_BOOKMARKS", ids: ["10"], targetId: "13", position: "before" });
      expect(order()).toEqual(["B", "C", "A", "D"]);
    });

    it("drops a bookmark upwards", async () => {
      await send({ type: "SYNC" });
      await send({ type: "MOVE_BOOKMARKS", ids: ["13"], targetId: "11", position: "before" });
      expect(order()).toEqual(["A", "D", "B", "C"]);
    });

    it("moves one to the very end", async () => {
      await send({ type: "SYNC" });
      await send({ type: "MOVE_BOOKMARKS", ids: ["10"], targetId: "13", position: "after" });
      expect(order()).toEqual(["B", "C", "D", "A"]);
    });

    it("moves one to the very start", async () => {
      await send({ type: "SYNC" });
      await send({ type: "MOVE_BOOKMARKS", ids: ["13"], targetId: "10", position: "before" });
      expect(order()).toEqual(["D", "A", "B", "C"]);
    });
  },
);
