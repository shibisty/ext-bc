import { dom } from "./dom";

/**
 * Remembers how far down the list the user was.
 *
 * The popup is destroyed every time it closes, so the position is kept in
 * localStorage and put back once on the next open. A search resets it: the
 * results are a different list, and landing halfway down it is disorienting.
 */
const SCROLL_KEY = "bscScroll";

let restored = false;

function read(): number {
  try {
    const value = Number(localStorage.getItem(SCROLL_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function store(position: number): void {
  try {
    if (position > 0) localStorage.setItem(SCROLL_KEY, String(Math.round(position)));
    else localStorage.removeItem(SCROLL_KEY);
  } catch {
    // Forgetting the position is survivable.
  }
}

export function forgetScroll(): void {
  store(0);
}

/** Puts the list back where it was — once, on the first render after opening. */
export function restoreScrollOnce(): void {
  if (restored) return;
  restored = true;

  const saved = read();
  if (saved <= 0) return;

  // Lazy rendering means the list may still be growing, so clamp rather than
  // assume the old position still exists.
  requestAnimationFrame(() => {
    dom.list.scrollTop = Math.min(saved, dom.list.scrollHeight - dom.list.clientHeight);
  });
}

export function resetScroll(): void {
  dom.list.scrollTop = 0;
}

export function registerScrollMemory(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  dom.list.addEventListener(
    "scroll",
    () => {
      clearTimeout(timer);
      timer = setTimeout(() => store(dom.list.scrollTop), 150);
    },
    { passive: true },
  );

  // A popup can be closed faster than the debounce; catch the last position.
  window.addEventListener("pagehide", () => store(dom.list.scrollTop));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") store(dom.list.scrollTop);
  });
}
