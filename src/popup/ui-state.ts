import { api } from "../shared/api";
import type { State } from "../shared/types";
import { parseTabInfo, type TabInfo } from "../shared/url";

/**
 * Popup-local state: everything that is *not* persisted extension state —
 * what is selected, what is collapsed, what is being dragged.
 */
export const ui = {
  /** Last rendered extension state, kept for re-renders that need no round trip. */
  lastState: null as State | null,
  selectedIds: new Set<string>(),
  lastClickedId: null as string | null,
  /** Ids in the order rows were rendered, for shift-select ranges. */
  visibleRowOrder: [] as string[],
  collapsedFolderIds: new Set<string>(),
  currentTabInfo: null as TabInfo | null,
  currentWindowId: null as number | null,
  draggingIds: null as string[] | null,
};

/**
 * The renderer registers itself here so row/menu/drag modules can ask for a
 * redraw without importing the render module (and creating an import cycle).
 */
let renderer: ((state: State) => void) | null = null;

export function setRenderer(fn: (state: State) => void): void {
  renderer = fn;
}

export function applyState(state: State | undefined): void {
  if (state) renderer?.(state);
}

export function rerender(): void {
  if (ui.lastState) renderer?.(ui.lastState);
}

// ---------- folder collapse state (persisted locally) ----------

export async function loadCollapsedFolders(): Promise<void> {
  const data = await api.storage.local.get(["uiCollapsedFolders"]);
  ui.collapsedFolderIds = new Set((data["uiCollapsedFolders"] as string[] | undefined) ?? []);
}

export function saveCollapsedFolders(): void {
  void api.storage.local.set({ uiCollapsedFolders: [...ui.collapsedFolderIds] });
}

// ---------- window id / current tab (for side panel + "open now") ----------

export async function loadWindowId(): Promise<void> {
  try {
    const win = await api.windows.getCurrent();
    ui.currentWindowId = win.id ?? null;
  } catch {
    ui.currentWindowId = null;
  }
}

export async function loadCurrentTabInfo(): Promise<void> {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    ui.currentTabInfo = parseTabInfo(tab?.url);
  } catch {
    ui.currentTabInfo = null;
  }
}
