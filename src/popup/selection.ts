import { t } from "../shared/i18n";
import { buildQueue } from "../shared/queue";
import { dom } from "./dom";
import { ui } from "./ui-state";

export function updateRowSelectionClass(row: HTMLElement, id: string): void {
  row.classList.toggle("selected", ui.selectedIds.has(id));
}

function refreshAllRowClasses(): void {
  document.querySelectorAll<HTMLElement>(".row[data-id]").forEach((row) => {
    const id = row.dataset["id"];
    if (id) updateRowSelectionClass(row, id);
  });
}

/** The footer doubles as a selection counter and a queue-progress readout. */
export function updateFooterText(): void {
  const state = ui.lastState;
  if (!state) return;

  if (ui.selectedIds.size > 0) {
    dom.progressLabel.textContent = t("selectionHint", [String(ui.selectedIds.size)]);
    return;
  }

  const { pinned, order, currentIndex, disabledChecks, intervalMinutes } = state;

  if (order.length === 0) {
    dom.progressLabel.textContent = "—";
    return;
  }

  if (!intervalMinutes || intervalMinutes <= 0) {
    dom.progressLabel.textContent = t("autoCheckOffHint");
    return;
  }

  const queue = buildQueue(order, pinned, disabledChecks);
  if (queue.length === 0) {
    dom.progressLabel.textContent = t("allChecksDisabled");
    return;
  }

  dom.progressLabel.textContent = t("progressLabel", [
    String((currentIndex % queue.length) + 1),
    String(queue.length),
  ]);
}

/** Plain click selects; ctrl/cmd toggles; shift extends from the last click. */
export function handleRowClick(e: MouseEvent, id: string): void {
  if (e.ctrlKey || e.metaKey) {
    if (ui.selectedIds.has(id)) ui.selectedIds.delete(id);
    else ui.selectedIds.add(id);
    ui.lastClickedId = id;
  } else if (e.shiftKey && ui.lastClickedId) {
    const from = ui.visibleRowOrder.indexOf(ui.lastClickedId);
    const to = ui.visibleRowOrder.indexOf(id);
    if (from !== -1 && to !== -1) {
      const [start, end] = from < to ? [from, to] : [to, from];
      ui.selectedIds = new Set(ui.visibleRowOrder.slice(start, end + 1));
    } else {
      ui.selectedIds = new Set([id]);
    }
  } else {
    ui.selectedIds = new Set([id]);
    ui.lastClickedId = id;
  }

  refreshAllRowClasses();
  updateFooterText();
}

/** Ids to act on when a row button is used: the whole selection, or just that row. */
export function actionTargets(id: string): string[] {
  return ui.selectedIds.has(id) && ui.selectedIds.size > 1 ? [...ui.selectedIds] : [id];
}

export function pruneSelection(items: Record<string, unknown>): void {
  for (const id of [...ui.selectedIds]) {
    if (!items[id]) ui.selectedIds.delete(id);
  }
}
