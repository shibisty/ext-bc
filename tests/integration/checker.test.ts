import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKING_STALE_MS, checkNext, checkOne, checkUrl } from "../../src/background/checker";
import { readState } from "../../src/shared/storage";
import { mockBrowser } from "../setup";

/** A fetch stub that resolves with the given response for every call. */
function respondWith(status: number, statusText = "") {
  const spy = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status, statusText }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** A fetch stub that never settles until its signal is aborted. */
function hangUntilAborted() {
  const spy = vi.fn((_url: string, init?: RequestInit) => {
    const signal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      const abort = () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort);
    });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function seedOneBookmark(url = "https://a.example/1") {
  mockBrowser().__setTree([{ id: "1", title: "Bar", children: [{ id: "2", title: "A", url }] }]);
}

afterEach(() => vi.unstubAllGlobals());

describe("checkUrl", () => {
  it("reports the HTTP status and the server's reason phrase", async () => {
    respondWith(404, "Not Found");
    await expect(checkUrl("https://a.example/")).resolves.toEqual({
      status: 404,
      statusText: "Not Found",
      reason: null,
      challenge: null,
    });
  });

  it("never sends the user's cookies to a bookmarked site by default", async () => {
    const fetchSpy = respondWith(200);
    await checkUrl("https://a.example/");
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  });

  /**
   * Opt-in only: an authenticated request to every bookmarked site on a timer
   * is a real cost, worth paying when the logged-in answer is the point.
   */
  it("sends them when the user asks to check as a signed-in visitor", async () => {
    const fetchSpy = respondWith(200);
    await checkUrl("https://a.example/", true);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("carries the choice through a queued check", async () => {
    seedOneBookmark();
    const fetchSpy = respondWith(200);
    mockBrowser().__seed({ sendCredentials: true });

    await checkNext();

    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("carries it through a single on-demand check too", async () => {
    seedOneBookmark();
    const fetchSpy = respondWith(200);
    await checkNext(); // brings the bookmark into `items`
    fetchSpy.mockClear();

    mockBrowser().__seed({ sendCredentials: true });
    await checkOne("2");

    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("tries HEAD first because it is cheap", async () => {
    const fetchSpy = respondWith(200);
    await checkUrl("https://a.example/");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD" });
  });

  it("falls back to GET when the server rejects HEAD", async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error("method not allowed"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(checkUrl("https://a.example/")).resolves.toMatchObject({ status: 200 });
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({ method: "GET" });
  });

  it("reports a timeout distinctly from a connection failure", async () => {
    vi.useFakeTimers();
    hangUntilAborted();

    const pending = checkUrl("https://slow.example/");
    await vi.advanceTimersByTimeAsync(9000);

    await expect(pending).resolves.toEqual({
      status: "TIMEOUT",
      statusText: "",
      reason: "timeout",
      challenge: null,
    });
    vi.useRealTimers();
  });

  it("reports a connection failure when the request cannot be made at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(checkUrl("https://nowhere.example/")).resolves.toEqual({
      status: "ERR",
      statusText: "",
      reason: "network",
      challenge: null,
    });
  });

  it("puts no language-specific text into the result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const result = await checkUrl("https://nowhere.example/");
    expect(result.statusText).toBe("");
    expect(result.reason).toBe("network");
  });
});

describe("checkUrl and bot protection", () => {
  it("flags a 200 that actually came from a Cloudflare challenge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200, headers: { "cf-mitigated": "challenge" } })),
    );

    await expect(checkUrl("https://a.example/")).resolves.toMatchObject({
      status: 200,
      challenge: "Cloudflare",
    });
  });

  it("leaves an ordinary 200 unflagged", async () => {
    respondWith(200);
    await expect(checkUrl("https://a.example/")).resolves.toMatchObject({ challenge: null });
  });

  it("records the flag against the bookmark", async () => {
    seedOneBookmark();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403, headers: { server: "cloudflare", "cf-ray": "x" } })),
    );

    await checkNext();

    expect((await readState()).items["2"]?.challenge).toBe("Cloudflare");
  });

  it("clears the flag once the site answers for itself again", async () => {
    seedOneBookmark();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200, headers: { "cf-mitigated": "challenge" } })),
    );
    // checkNext syncs first, so the bookmark exists in `items` by the time it
    // is measured; with a single bookmark the queue wraps back onto it.
    await checkNext();
    expect((await readState()).items["2"]?.challenge).toBe("Cloudflare");

    respondWith(200);
    await checkNext();
    expect((await readState()).items["2"]?.challenge).toBeNull();
  });
});

describe("checkOne", () => {
  beforeEach(() => seedOneBookmark());

  it("records the status against the bookmark", async () => {
    respondWith(200, "OK");
    mockBrowser().__seed({
      items: {
        "2": {
          title: "A",
          url: "https://a.example/1",
          host: "a.example",
          status: null,
          statusText: null,
          reason: null,
          challenge: null,
          checkedAt: null,
        },
      },
    });

    await checkOne("2");

    const state = await readState();
    expect(state.items["2"]).toMatchObject({ status: 200, statusText: "OK", reason: null });
    expect(state.items["2"]?.checkedAt).toBeGreaterThan(0);
  });

  it("does nothing for an unknown id", async () => {
    const fetchSpy = respondWith(200);
    await checkOne("nope");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clears an inferred marker once the bookmark is measured directly", async () => {
    respondWith(200);
    mockBrowser().__seed({
      items: {
        "2": {
          title: "A",
          url: "https://a.example/1",
          host: "a.example",
          status: "ERR",
          statusText: "",
          reason: "domain",
          challenge: null,
          checkedAt: 1,
          inferredFrom: "other",
        },
      },
    });

    await checkOne("2");

    const state = await readState();
    expect(state.items["2"]?.inferredFrom).toBeUndefined();
    expect(state.items["2"]?.reason).toBeNull();
  });
});

describe("checkNext", () => {
  beforeEach(() => seedOneBookmark());

  it("checks the bookmark the queue points at and advances the index", async () => {
    respondWith(200);

    await checkNext();

    const state = await readState();
    expect(state.items["2"]?.status).toBe(200);
    expect(state.currentIndex).toBe(1);
    expect(state.checking).toBe(false);
  });

  it("refuses to start while another pass holds the flag", async () => {
    const fetchSpy = respondWith(200);
    mockBrowser().__seed({ checking: true, checkingSince: Date.now() });

    await checkNext();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Regression: getState() used to omit checkingSince, so this branch could
  // never be reached and a crashed pass would block checking forever.
  it("breaks a lock that has been held longer than the stale timeout", async () => {
    const fetchSpy = respondWith(200);
    mockBrowser().__seed({
      checking: true,
      checkingSince: Date.now() - CHECKING_STALE_MS - 1000,
    });

    await checkNext();

    expect(fetchSpy).toHaveBeenCalled();
    await expect(readState()).resolves.toMatchObject({ checking: false });
  });

  it("releases the lock even when the check throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("boom");
      }),
    );
    mockBrowser().bookmarks.getTree.mockRejectedValueOnce(new Error("tree unavailable"));

    await checkNext();

    await expect(readState()).resolves.toMatchObject({ checking: false, checkingSince: null });
  });

  it("stops cleanly when every bookmark has checking disabled", async () => {
    const fetchSpy = respondWith(200);
    mockBrowser().__seed({ disabledChecks: ["2"] });

    await checkNext();

    expect(fetchSpy).not.toHaveBeenCalled();
    const state = await readState();
    expect(state.checking).toBe(false);
    expect(state.lastCheck).toBeGreaterThan(0);
  });

  it("marks the whole host unreachable after a connection failure", async () => {
    mockBrowser().__setTree([
      {
        id: "1",
        title: "Bar",
        children: [
          { id: "2", title: "A", url: "https://a.example/1" },
          { id: "3", title: "B", url: "https://a.example/2" },
          { id: "4", title: "C", url: "https://b.example/1" },
        ],
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await checkNext();

    const state = await readState();
    expect(state.items["3"]).toMatchObject({ status: "ERR", reason: "domain", inferredFrom: "2" });
    expect(state.items["3"]?.checkedAt).toBeNull();
    expect(state.items["4"]?.status).toBeNull();
  });
});
