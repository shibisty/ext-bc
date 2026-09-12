import { detectChallengeInResponse } from "../shared/challenge";
import { hiddenBookmarkIds } from "../shared/archive";
import { buildQueue } from "../shared/queue";
import { readState, writeState } from "../shared/storage";
import type { CheckResult, Item } from "../shared/types";
import { syncBookmarks } from "./bookmarks";
import { propagateDomainStatus } from "./domain";

const FETCH_TIMEOUT_MS = 8000;

/** If "checking" has been held this long, treat it as dead and proceed anyway. */
export const CHECKING_STALE_MS = 60000;

/**
 * Asks a URL for its status. HEAD first because it is cheap; a fair number of
 * servers reject it, so fall back to GET before giving up.
 *
 * Cookies are omitted unless the user asks for them. With `<all_urls>` host
 * permissions, sending them means an authenticated request to every bookmarked
 * site on a timer — worth it when the answer for a logged-in user is the point,
 * but not something to do by default.
 */
export async function checkUrl(url: string, sendCredentials = false): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const init: RequestInit = {
    redirect: "follow",
    signal: controller.signal,
    cache: "no-store",
    credentials: sendCredentials ? "include" : "omit",
    referrerPolicy: "no-referrer",
  };

  try {
    let res: Response;
    try {
      res = await fetch(url, { ...init, method: "HEAD" });
    } catch {
      res = await fetch(url, { ...init, method: "GET" });
    }
    return {
      status: res.status,
      statusText: res.statusText || "",
      reason: null,
      challenge: detectChallengeInResponse(res),
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "TIMEOUT", statusText: "", reason: "timeout", challenge: null };
    }
    return { status: "ERR", statusText: "", reason: "network", challenge: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Writes a measured result onto an item. */
function applyResult(item: Item, result: CheckResult, now: number): void {
  item.status = result.status;
  item.statusText = result.statusText;
  item.reason = result.reason;
  item.challenge = result.challenge;
  item.checkedAt = now;
  delete item.inferredFrom;
}

/** Checks one specific bookmark, on demand from the popup. */
export async function checkOne(id: string): Promise<void> {
  const state = await readState();
  const items = { ...state.items };
  const item = items[id];
  if (!item) return;

  const result = await checkUrl(item.url, state.sendCredentials);
  const now = Date.now();
  applyResult(item, result, now);
  propagateDomainStatus(items, id, result);

  await writeState({ items, lastCheck: now });
}

/** Advances the queue by one: checks the bookmark it points at, then moves on. */
export async function checkNext(): Promise<void> {
  const current = await readState();
  const stuckTooLong =
    current.checking &&
    current.checkingSince !== null &&
    Date.now() - current.checkingSince > CHECKING_STALE_MS;
  if (current.checking && !stuckTooLong) return;

  await writeState({ checking: true, checkingSince: Date.now() });

  try {
    const { tree, order, items, pinned, disabledChecks, archived } = await syncBookmarks();
    const queue = buildQueue(order, pinned, disabledChecks, hiddenBookmarkIds(tree, archived));
    if (queue.length === 0) {
      await writeState({ checking: false, checkingSince: null, lastCheck: Date.now() });
      return;
    }

    const state = await readState();
    const index = state.currentIndex % queue.length;
    const id = queue[index];
    const item = id ? items[id] : undefined;

    if (id && item) {
      const result = await checkUrl(item.url, state.sendCredentials);
      const now = Date.now();
      applyResult(item, result, now);
      propagateDomainStatus(items, id, result);
    }

    await writeState({
      items,
      currentIndex: index + 1,
      lastCheck: Date.now(),
      checking: false,
      checkingSince: null,
    });
  } catch {
    await writeState({ checking: false, checkingSince: null });
  }
}
