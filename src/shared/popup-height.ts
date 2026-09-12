/**
 * Height arithmetic for the resizable popup, kept free of the DOM so it can be
 * reasoned about (and tested) on its own.
 */

export const HEIGHT_KEY = "bscPopupHeight";

/** Below this the list has no room to be a list. */
export const MIN_POPUP_HEIGHT = 200;

/**
 * Starting height when nothing has been chosen yet — a default, not a ceiling.
 *
 * Chrome 141 still refuses to render an action popup taller than this: measured
 * on a bare extension whose popup had no height limit in CSS and 3000px of
 * content, which reported innerHeight = outerHeight = 600 however tall the
 * document grew. That is the browser's rule, not ours, so nothing here enforces
 * it — a drag may ask for more, the browser grants what it will, and
 * `fitToViewport` settles on the height actually given. A browser with a
 * different rule (or the side panel, which has none) gets the taller window.
 */
export const DEFAULT_POPUP_HEIGHT = 600;

/** Nothing sensible is ever this tall; it only stops a runaway drag. */
const ABSOLUTE_MAX = 4000;

/**
 * How tall the popup may be asked to become. Bounded by the screen rather than
 * by a constant, so a big monitor is allowed to try for more than the default.
 */
export function availableHeight(screenHeight?: number | undefined): number {
  const screen = screenHeight && screenHeight > 0 ? screenHeight : ABSOLUTE_MAX;
  return Math.max(MIN_POPUP_HEIGHT, Math.min(screen, ABSOLUTE_MAX));
}

/**
 * A remembered height is a request, not a promise: the browser may hand over a
 * smaller window, and `fitToViewport` then shrinks the body to what it actually
 * got — a measurement rather than arithmetic.
 */
export function clampHeight(height: number, screenHeight?: number | undefined): number {
  return Math.max(MIN_POPUP_HEIGHT, Math.min(height, availableHeight(screenHeight)));
}

/** Parses a stored height, rejecting anything that is not a usable number. */
export function parseStoredHeight(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
