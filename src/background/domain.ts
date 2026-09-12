import type { CheckResult, Item } from "../shared/types";

/**
 * When a bookmark fails to connect at all, the whole host is probably down, so
 * mark its siblings as unreachable too instead of waiting for the queue to
 * reach each of them.
 *
 * Two things this deliberately does *not* do:
 *  - it leaves `checkedAt` alone, so the UI never reports a bookmark as
 *    "checked just now" when nothing actually contacted it;
 *  - it records `inferredFrom`, so an inferred failure is distinguishable from
 *    a measured one and gets re-checked normally when its turn comes.
 *
 * Mutates `items` in place.
 */
export function propagateDomainStatus(
  items: Record<string, Item>,
  sourceId: string,
  result: CheckResult,
): void {
  // Only genuine connection failures — a 404 or a timeout says nothing about
  // the other pages on the host.
  if (result.status !== "ERR") return;

  const sourceHost = items[sourceId]?.host;
  if (!sourceHost) return;

  for (const [id, item] of Object.entries(items)) {
    if (id === sourceId) continue;
    if (item.host !== sourceHost) continue;
    // Don't overwrite a measured failure with an inferred one.
    if (item.status === "ERR" && !item.inferredFrom) continue;
    item.status = "ERR";
    item.statusText = "";
    item.reason = "domain";
    item.challenge = null;
    item.inferredFrom = sourceId;
  }
}
