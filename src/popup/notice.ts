import { dom } from "./dom";
import { updateFooterText } from "./selection";

/**
 * A short-lived message in the footer.
 *
 * Everything the popup does goes through the background worker, and a failed
 * round trip used to be invisible: the promise rejected, nothing was rendered,
 * and the button looked inert. Saying so out loud turns "it doesn't work" into
 * something reportable.
 */
const NOTICE_MS = 5000;

let timer: ReturnType<typeof setTimeout> | undefined;

export function showNotice(text: string): void {
  clearTimeout(timer);
  dom.progressLabel.textContent = text;
  dom.progressLabel.classList.add("notice");

  timer = setTimeout(() => {
    dom.progressLabel.classList.remove("notice");
    updateFooterText();
  }, NOTICE_MS);
}
