/**
 * The order in which bookmarks get checked: pinned ones first (in the order
 * they were pinned), then the rest in bookmark-tree order. Bookmarks with
 * checking switched off are left out entirely.
 *
 * Single source of truth — the background worker walks this queue and the
 * popup uses it to show progress and highlight the bookmark that is next.
 */
export function buildQueue(
  order: readonly string[],
  pinned: readonly string[],
  disabledChecks: readonly string[],
  hiddenByArchive: readonly string[] = [],
): string[] {
  const pinnedSet = new Set(pinned);
  const skip = new Set([...disabledChecks, ...hiddenByArchive]);
  const activePinned = pinned.filter((id) => !skip.has(id));
  const activeRest = order.filter((id) => !pinnedSet.has(id) && !skip.has(id));
  return [...activePinned, ...activeRest];
}

/** The id the queue points at right now, or null when there is nothing to check. */
export function activeQueueId(queue: readonly string[], currentIndex: number): string | null {
  if (queue.length === 0) return null;
  return queue[currentIndex % queue.length] ?? null;
}
