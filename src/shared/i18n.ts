import { api } from "./api";

/** Every locale shipped in `_locales/`. Keep in sync with that folder. */
export const LOCALES = [
  "am", "ar", "bg", "bn", "ca", "cs", "da", "de", "el", "en",
  "en_GB", "en_US", "es", "es_419", "et", "fa", "fi", "fil", "fr", "gu",
  "he", "hi", "hr", "hu", "id", "it", "ja", "kn", "ko", "lt",
  "lv", "ml", "mr", "ms", "nl", "no", "pl", "pt_BR", "pt_PT", "ro",
  "ru", "sk", "sl", "sr", "sv", "sw", "ta", "te", "th", "tr",
  "uk", "vi", "zh_CN", "zh_TW",
] as const;

export type Locale = (typeof LOCALES)[number];

/** "auto" defers to the browser UI language via `api.i18n`. */
export type LocalePref = "auto" | Locale;

/**
 * Languages written right to left. Matched on the base language, so regional
 * variants ("ar-EG", "fa-IR") are covered too.
 */
const RTL_LANGUAGES = new Set(["ar", "fa", "he", "iw", "ur", "ps", "sd", "ug", "yi"]);

export function isRtlLanguage(language: string): boolean {
  return RTL_LANGUAGES.has(language.split(/[-_]/)[0] ?? "");
}

/** The language actually in effect: the override, or the browser's own. */
export function effectiveLanguage(): string {
  return pref !== "auto" ? pref : api.i18n.getUILanguage();
}

/** The `dir` attribute the document should carry for the active language. */
export function documentDirection(): "rtl" | "ltr" {
  return isRtlLanguage(effectiveLanguage()) ? "rtl" : "ltr";
}

export type Substitutions = string | string[] | undefined;

type MessageDict = Record<string, { message: string } | undefined>;

const dicts = new Map<Locale, MessageDict>();

let pref: LocalePref = "auto";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function getLocalePref(): LocalePref {
  return pref;
}

export function setLocalePref(next: LocalePref): void {
  pref = next;
}

/**
 * Loads one locale's messages on demand. `api.i18n` can only give us the
 * browser's own UI language, so an explicit override needs the raw JSON —
 * but only for the language actually selected, not for all of them.
 */
export async function loadLocale(locale: Locale): Promise<void> {
  if (dicts.has(locale)) return;
  try {
    const res = await fetch(api.runtime.getURL(`_locales/${locale}/messages.json`));
    dicts.set(locale, (await res.json()) as MessageDict);
  } catch {
    // Leave it unloaded — `t()` falls back to api.i18n.getMessage().
  }
}

/** Chrome's `$1`, `$2`… placeholder syntax. */
export function substitutePlaceholders(str: string, subs: Substitutions): string {
  if (subs === undefined) return str;
  const arr = Array.isArray(subs) ? subs : [subs];
  return str.replace(/\$(\d+)/g, (match, digits: string) => {
    const value = arr[parseInt(digits, 10) - 1];
    return value !== undefined ? value : match;
  });
}

export function t(key: string, subs?: Substitutions): string {
  if (pref !== "auto") {
    const entry = dicts.get(pref)?.[key];
    if (entry) return substitutePlaceholders(entry.message, subs);
  }
  return api.i18n.getMessage(key, subs) || key;
}
