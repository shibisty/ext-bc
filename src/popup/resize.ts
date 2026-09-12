import {
  HEIGHT_KEY,
  clampHeight as clampAgainst,
  parseStoredHeight,
} from "../shared/popup-height";
import { dom, isSidePanelContext, isTabContext } from "./dom";

/**
 * A Chrome popup has no resize handle of its own: the window is sized from the
 * document, so dragging the grip simply sets the body height and the window
 * follows. The chosen height is remembered for next time.
 */
export function readStoredHeight(): number | null {
  try {
    return parseStoredHeight(localStorage.getItem(HEIGHT_KEY));
  } catch {
    return null;
  }
}

function storeHeight(height: number): void {
  try {
    localStorage.setItem(HEIGHT_KEY, String(Math.round(height)));
  } catch {
    // Not remembering the height is survivable.
  }
}

function forgetHeight(): void {
  try {
    localStorage.removeItem(HEIGHT_KEY);
  } catch {
    // ignore
  }
}

/**
 * Whether the browser, not this document, decides the window size: the side
 * panel, the tab view, and Firefox for Android, where the popup is a page.
 */
function sizedByBrowser(): boolean {
  return isSidePanelContext || isTabContext || document.body.classList.contains("android-mode");
}

function clamp(height: number): number {
  return clampAgainst(height, window.screen?.availHeight);
}

/**
 * Sets both the height and the cap: the stylesheet's 600px is only a default,
 * and an explicit choice has to be able to exceed it where the browser allows.
 */
function applyHeight(height: number): void {
  const px = `${Math.round(height)}px`;
  document.body.style.height = px;
  document.body.style.maxHeight = px;
}

/**
 * The height actually in effect — measured, not requested.
 *
 * Chrome refuses to render an action popup taller than 600px, so a larger value
 * can be asked for and stored but will never appear. Reporting the measurement
 * keeps the settings field from claiming a height the window does not have.
 */
export function currentHeight(): number {
  const measured = Math.round(document.body.getBoundingClientRect().height);
  return measured > 0 ? measured : (readStoredHeight() ?? 0);
}

/** Sets the height from the settings field and remembers it. */
export function setHeight(height: number): number {
  const applied = clamp(height);
  applyHeight(applied);
  storeHeight(applied);
  return applied;
}

/** Re-applies the remembered height, shrunk to what the screen can show. */
export function applyStoredHeight(): void {
  if (sizedByBrowser()) return;
  const stored = readStoredHeight();
  if (stored === null) return;
  applyHeight(clamp(stored));
}

export function registerResizeHandle(): void {
  const grip = dom.resizeGrip;
  if (!grip) return;

  if (sizedByBrowser()) {
    grip.hidden = true;
    return;
  }

  let startY = 0;
  let startHeight = 0;

  const onMove = (e: PointerEvent): void => {
    // screenY, not clientY: the window itself grows as we drag, which moves the
    // client-space origin out from under the pointer. Dragging down grows the
    // popup and dragging up shrinks it, both bounded by clamp().
    applyHeight(clamp(startHeight + (e.screenY - startY)));
  };

  const onUp = (e: PointerEvent): void => {
    grip.releasePointerCapture(e.pointerId);
    grip.removeEventListener("pointermove", onMove);
    grip.removeEventListener("pointerup", onUp);
    document.body.classList.remove("resizing");
    storeHeight(document.body.getBoundingClientRect().height);
  };

  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startY = e.screenY;
    startHeight = document.body.getBoundingClientRect().height;
    // The body may still be sizing itself to its content; pin it to the height
    // it has right now so the first drag pixel grows from there in either
    // direction instead of snapping.
    applyHeight(clamp(startHeight));
    grip.setPointerCapture(e.pointerId);
    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
    document.body.classList.add("resizing");
  });

  // Double-click the grip to go back to sizing by content.
  grip.addEventListener("dblclick", () => {
    document.body.style.height = "";
    forgetHeight();
  });
}
