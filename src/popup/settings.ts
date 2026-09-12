import {
  documentDirection,
  isLocale,
  loadLocale,
  setLocalePref,
  t,
  type LocalePref,
} from "../shared/i18n";
import { sendMessage } from "../shared/messages";
import { api } from "../shared/api";
import { closePopupWindow, dom, isSidePanelContext, isTabContext } from "./dom";
import {
  applyDisplayPreferences,
  coerce,
  loadPreferences,
  setPreference,
  type Preferences,
} from "./preferences";
import { currentHeight, setHeight } from "./resize";
import { applyState, rerender } from "./ui-state";

const THEME_KEY = "bscTheme";
const LANGUAGE_KEY = "bscLanguage";

export type Theme = "dark" | "light";

export function readStoredTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

export function readStoredLanguage(): LocalePref {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  return stored && isLocale(stored) ? stored : "auto";
}

export function applyTheme(theme: Theme): void {
  document.body.classList.toggle("theme-light", theme === "light");
}

/** Applies `data-i18n*` attributes across the static markup. */
export function localizeStaticMarkup(pref: LocalePref): void {
  document.documentElement.lang =
    pref !== "auto" ? pref : (api.i18n.getUILanguage().split("-")[0] ?? "en");
  // Arabic, Persian, Hebrew and friends: the whole layout mirrors, which the
  // stylesheet handles through logical properties plus a few [dir="rtl"] rules.
  document.documentElement.dir = documentDirection();

  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset["i18n"];
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const key = el.dataset["i18nTitle"];
    if (key) el.title = t(key);
  });
  document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset["i18nPlaceholder"];
    if (key) el.placeholder = t(key);
  });
}

/**
 * Settings take over the whole view. One body class hides everything that
 * belongs to the list — including the tab bar, which was still on screen and
 * inert, so switching tabs from here appeared to do nothing.
 */
function openSettings(): void {
  dom.settingsView.hidden = false;
  document.body.classList.add("settings-open");
}

function closeSettings(): void {
  dom.settingsView.hidden = true;
  document.body.classList.remove("settings-open");
}

/** Wires one preference select: reflect the stored value, save on change. */
function bindPreference<K extends keyof Preferences>(
  select: HTMLSelectElement | null,
  key: K,
  onChange?: () => void,
): void {
  if (!select) return;
  select.value = String(loadPreferences()[key]);
  select.addEventListener("change", () => {
    setPreference(key, coerce(key, select.value));
    onChange?.();
  });
}

/** Shows the stored choice; this one comes from extension state. */
export function applyCredentials(sendCredentials: boolean): void {
  if (dom.credentialsSelect) {
    dom.credentialsSelect.value = sendCredentials ? "include" : "omit";
  }
}

/** Reflects the saved preferences in the settings selects and in the layout. */
export function applyPreferences(): void {
  const prefs = loadPreferences();
  applyDisplayPreferences(prefs);

  bindPreference(dom.openTriggerSelect, "openTrigger");
  bindPreference(dom.openTargetSelect, "openTarget");
  bindPreference(dom.afterOpenSelect, "afterOpen");
  bindPreference(dom.rowDetailSelect, "rowDetail", () => applyDisplayPreferences());
  bindPreference(dom.rowActionsSelect, "rowActions", () => applyDisplayPreferences());
  bindPreference(dom.titleLinesSelect, "titleLines", () => applyDisplayPreferences());
  bindPreference(dom.pinToToolbarSelect, "pinToToolbar");

  bindHeightField();
}

/**
 * A number for the popup height, for when dragging the grip is awkward — the
 * grip is a 14px strip at the very bottom edge of a window that moves while it
 * is being dragged.
 */
function bindHeightField(): void {
  const field = dom.popupHeightInput;
  if (!field) return;

  if (isSidePanelContext || isTabContext) {
    // The browser sizes the side panel and the tab; there is nothing here to set.
    field.closest(".settings-row")?.setAttribute("hidden", "");
    return;
  }

  // After a frame: at init the body has not settled at its final height yet.
  requestAnimationFrame(() => {
    field.value = String(currentHeight());
  });

  field.addEventListener("change", () => {
    const asked = Number(field.value);
    if (!Number.isFinite(asked)) {
      field.value = String(currentHeight());
      return;
    }
    setHeight(asked);
    // Report back what the window ended up being, once it has settled: the
    // browser may simply refuse a taller popup, and a field still showing the
    // request would be claiming something untrue.
    requestAnimationFrame(() => {
      field.value = String(currentHeight());
    });
  });
}

export function registerSettingsHandlers(): void {
  dom.settingsBtn.addEventListener("click", openSettings);
  dom.closeSettingsBtn.addEventListener("click", closeSettings);

  dom.languageSelect.addEventListener("change", () => {
    void (async () => {
      const value = dom.languageSelect.value;
      const pref: LocalePref = isLocale(value) ? value : "auto";
      setLocalePref(pref);
      localStorage.setItem(LANGUAGE_KEY, pref);
      if (pref !== "auto") await loadLocale(pref);
      localizeStaticMarkup(pref);
      rerender();
    })();
  });

  dom.themeSelect.addEventListener("change", () => {
    const theme: Theme = dom.themeSelect.value === "light" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  });

  dom.openInTabBtn?.addEventListener("click", () => {
    // The one way to a list taller than the popup allows.
    void api.tabs.create({ url: api.runtime.getURL("popup.html?view=tab") });
    closePopupWindow();
  });

  dom.refreshNowBtn.addEventListener("click", () => {
    void (async () => {
      dom.refreshNowBtn.disabled = true;
      const res = await sendMessage({ type: "SYNC" });
      dom.refreshNowBtn.disabled = false;
      if (res?.ok) applyState(res.state);
    })();
  });

  dom.intervalSelect.addEventListener("change", () => {
    void sendMessage({ type: "SET_INTERVAL", minutes: Number(dom.intervalSelect.value) });
  });

  dom.credentialsSelect?.addEventListener("change", () => {
    // Lives in extension state, not localStorage: the background worker is what
    // makes the request, and a service worker has no localStorage.
    void sendMessage({
      type: "SET_CREDENTIALS",
      send: dom.credentialsSelect?.value === "include",
    });
  });
}
