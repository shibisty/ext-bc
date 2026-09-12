import { request } from "./actions";
import type { DropPosition } from "../shared/types";
import { applyState, ui } from "./ui-state";

const DROP_CLASSES = ["drag-over-before", "drag-over-after"] as const;

function clearDropMarkers(): void {
  document
    .querySelectorAll<HTMLElement>(".drag-over-before,.drag-over-after")
    .forEach((el) => el.classList.remove(...DROP_CLASSES));
}

/** Above the midpoint drops before the row, below it drops after. */
function dropsBefore(row: HTMLElement, e: DragEvent): boolean {
  const rect = row.getBoundingClientRect();
  return e.clientY - rect.top < rect.height / 2;
}

async function move(ids: string[], targetId: string, position: DropPosition): Promise<void> {
  const res = await request({ type: "MOVE_BOOKMARKS", ids, targetId, position });
  if (res?.ok) applyState(res.state);
}

export function attachDragHandlers(row: HTMLElement, id: string): void {
  row.draggable = true;

  row.addEventListener("dragstart", (e) => {
    ui.draggingIds =
      ui.selectedIds.has(id) && ui.selectedIds.size > 1
        ? ui.visibleRowOrder.filter((rid) => ui.selectedIds.has(rid))
        : [id];
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", id);
      } catch {
        // ignore
      }
    }
  });

  row.addEventListener("dragend", () => {
    ui.draggingIds = null;
    clearDropMarkers();
  });

  row.addEventListener("dragover", (e) => {
    if (!ui.draggingIds || ui.draggingIds.includes(id)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const before = dropsBefore(row, e);
    row.classList.toggle("drag-over-before", before);
    row.classList.toggle("drag-over-after", !before);
  });

  row.addEventListener("dragleave", () => row.classList.remove(...DROP_CLASSES));

  row.addEventListener("drop", (e) => {
    e.preventDefault();
    row.classList.remove(...DROP_CLASSES);
    const ids = ui.draggingIds;
    if (!ids || ids.includes(id)) return;
    ui.draggingIds = null;
    void move(ids, id, dropsBefore(row, e) ? "before" : "after");
  });
}

export function attachFolderDropHandlers(summary: HTMLElement, folderId: string): void {
  summary.addEventListener("dragover", (e) => {
    if (!ui.draggingIds) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    summary.classList.add("drag-over");
  });

  summary.addEventListener("dragleave", () => summary.classList.remove("drag-over"));

  summary.addEventListener("drop", (e) => {
    e.preventDefault();
    summary.classList.remove("drag-over");
    const ids = ui.draggingIds;
    if (!ids) return;
    ui.draggingIds = null;
    void move(ids, folderId, "inside");
  });
}
