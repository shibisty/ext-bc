import { dom } from "../dom";

const LAZY_BATCH_SIZE = 60;
const SENTINEL_MARGIN = "300px";

export type RowFactory = (id: string) => HTMLElement;

/**
 * Observers still waiting for their sentinel. A re-render throws away the rows
 * they were going to extend, so they must be dropped with them — otherwise
 * every render leaves another observer watching a detached sentinel.
 */
const pending = new Set<IntersectionObserver>();

export function cancelPendingLazyRenders(): void {
  for (const observer of pending) observer.disconnect();
  pending.clear();
}

/**
 * Appends rows in batches, adding the next batch when a sentinel scrolls into
 * view. Long bookmark lists would otherwise build thousands of nodes up front.
 */
export function appendItemsLazily(
  container: ParentNode,
  ids: readonly string[],
  rowFactory: RowFactory,
): void {
  if (ids.length <= LAZY_BATCH_SIZE) {
    const frag = document.createDocumentFragment();
    for (const id of ids) frag.appendChild(rowFactory(id));
    container.appendChild(frag);
    return;
  }

  let index = 0;

  function renderBatch(): void {
    const frag = document.createDocumentFragment();
    const end = Math.min(index + LAZY_BATCH_SIZE, ids.length);
    for (; index < end; index++) {
      const id = ids[index];
      if (id) frag.appendChild(rowFactory(id));
    }
    container.appendChild(frag);

    if (index >= ids.length) return;

    const sentinel = document.createElement("div");
    sentinel.className = "lazy-sentinel";
    container.appendChild(sentinel);

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        pending.delete(observer);
        sentinel.remove();
        renderBatch();
      },
      { root: dom.list, rootMargin: SENTINEL_MARGIN },
    );
    pending.add(observer);
    observer.observe(sentinel);
  }

  renderBatch();
}
