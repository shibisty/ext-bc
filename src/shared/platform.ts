import { api } from "./api";

/**
 * Firefox for Android runs the same extension, but not in a popup window: the
 * action opens `popup.html` as a full page in the browser itself. A document
 * fixed at 360px wide with a 600px ceiling then sits letterboxed in the middle
 * of a phone screen, and the desktop-only chrome around it (the drag grip, the
 * height field, the sidebar button — Android has no sidebars) is dead weight.
 *
 * The check is synchronous on purpose: the layout has to be right on the first
 * paint, and `runtime.getPlatformInfo()` only resolves a frame or two later.
 * It is confirmed asynchronously afterwards, so a wrong guess corrects itself.
 */
export function looksLikeAndroid(): boolean {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return /Android/i.test(ua);
}

/** The authoritative answer, once the browser gets round to it. */
export async function isAndroid(): Promise<boolean> {
  try {
    const info = await api.runtime.getPlatformInfo();
    return info.os === "android";
  } catch {
    return looksLikeAndroid();
  }
}

/**
 * Marks the document as the Android layout. Returns what it settled on, so a
 * caller can skip the desktop-only wiring.
 */
export function applyPlatformClass(android: boolean): void {
  document.body.classList.toggle("android-mode", android);
}
