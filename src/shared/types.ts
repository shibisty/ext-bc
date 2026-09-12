/** Status as stored: an HTTP code, a machine-readable failure, or "not checked yet". */
export type Status = number | "ERR" | "TIMEOUT" | null;

/**
 * Why a check failed, as a machine code. The user-facing wording is chosen in
 * the popup, so nothing language-specific ever reaches storage.
 */
export type FailureReason = "timeout" | "network" | "domain";

export interface Item {
  title: string;
  url: string;
  /** Cached hostname, so domain grouping doesn't re-parse every URL. */
  host: string | null;
  status: Status;
  /** The server's own reason phrase ("Not Found"); empty for failures. */
  statusText: string | null;
  reason: FailureReason | null;
  /**
   * Name of the bot-protection or CAPTCHA service that answered instead of the
   * site. A 200 from one of these is not evidence that the page is alive.
   */
  challenge: string | null;
  checkedAt: number | null;
  /**
   * Set when the status was inferred from another bookmark on the same host
   * rather than measured directly. Such items keep their old `checkedAt`, so
   * the UI never claims they were just checked.
   */
  inferredFrom?: string;
}

export interface FolderNode {
  id: string;
  title: string;
  type: "folder";
  children: TreeNode[];
}

export interface BookmarkNode {
  id: string;
  title: string;
  url: string;
  type: "bookmark";
}

export type TreeNode = FolderNode | BookmarkNode;

/** A bookmark leaf as collected by the depth-first walk of the browser tree. */
export interface FlatBookmark {
  id: string;
  title: string;
  url: string;
}

/**
 * Everything persisted in `storage.local` under the extension's own keys.
 * This interface is the single source of truth for the storage schema:
 * `DEFAULTS` in ./storage.ts derives the key list from it, so both the
 * background worker and the popup always read and write the same shape.
 */
export interface State {
  tree: TreeNode[];
  order: string[];
  items: Record<string, Item>;
  pinned: string[];
  disabledChecks: string[];
  /**
   * Ids of bookmarks and folders moved to the Archive tab. Archiving hides a
   * node (and everything under it) from the main list and takes it out of the
   * check queue, but never touches the real browser bookmark — restoring is
   * just removing the id again.
   */
  archived: string[];
  /**
   * Bookmark id -> id of the copy this extension put on the toolbar for it.
   * Only copies recorded here are ever removed again, so a bookmark the user
   * had on the toolbar already is never taken away.
   */
  toolbarPins: Record<string, string>;
  currentIndex: number;
  intervalMinutes: number;
  /**
   * Whether checks carry the user's cookies.
   *
   * Off by default, and deliberately so: with `<all_urls>` host permissions an
   * authenticated request goes to every bookmarked site on a timer. Turning it
   * on answers a different question — "what does this page return *for me*" —
   * which is the right one for anything behind a login.
   *
   * This lives in extension state rather than with the popup's own preferences
   * because the background worker is what performs the request, and a service
   * worker has no localStorage.
   */
  sendCredentials: boolean;
  lastCheck: number | null;
  checking: boolean;
  checkingSince: number | null;
  /**
   * Why the last walk of the bookmarks produced nothing, when it produced
   * nothing. An empty list is ambiguous — no bookmarks, or a browser that would
   * not hand them over — and on Firefox for Android it was the second. Shown
   * under the empty state so the difference is visible without a debugger.
   */
  lastSyncError: string | null;
}

export type DropPosition = "before" | "after" | "inside";

export interface CheckResult {
  status: Status;
  statusText: string;
  reason: FailureReason | null;
  challenge: string | null;
}
