import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentDirection, isRtlLanguage, setLocalePref } from "../../src/shared/i18n";
import { mockBrowser } from "../setup";

const POPUP_HTML = readFileSync(path.resolve(process.cwd(), "src/ui/popup.html"), "utf8");

beforeEach(() => {
  document.body.innerHTML = POPUP_HTML.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
});

afterEach(() => setLocalePref("auto"));

describe("isRtlLanguage", () => {
  it.each(["ar", "fa", "he", "ur", "ps", "ug"])("treats %s as right-to-left", (lang) => {
    expect(isRtlLanguage(lang)).toBe(true);
  });

  it.each(["en", "ru", "uk", "ja", "zh_CN", "fi"])("treats %s as left-to-right", (lang) => {
    expect(isRtlLanguage(lang)).toBe(false);
  });

  it("matches regional variants on their base language", () => {
    expect(isRtlLanguage("ar-EG")).toBe(true);
    expect(isRtlLanguage("fa_IR")).toBe(true);
    expect(isRtlLanguage("en-GB")).toBe(false);
  });

  it("handles the legacy code Chrome reports for Hebrew", () => {
    expect(isRtlLanguage("iw")).toBe(true);
  });
});

describe("documentDirection", () => {
  it("follows an explicitly chosen language", () => {
    setLocalePref("ar");
    expect(documentDirection()).toBe("rtl");

    setLocalePref("ru");
    expect(documentDirection()).toBe("ltr");
  });

  it("follows the browser UI language when set to auto", () => {
    setLocalePref("auto");
    vi.spyOn(mockBrowser().i18n, "getUILanguage").mockReturnValue("he-IL");
    expect(documentDirection()).toBe("rtl");
  });
});

describe("localizeStaticMarkup", () => {
  async function localize(pref: "auto" | "ar" | "en") {
    vi.resetModules();
    const { setLocalePref: setPref } = await import("../../src/shared/i18n");
    const { localizeStaticMarkup } = await import("../../src/popup/settings");
    setPref(pref === "auto" ? "auto" : pref);
    localizeStaticMarkup(pref);
  }

  it("mirrors the document for an RTL language", async () => {
    await localize("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
  });

  it("leaves the document left-to-right otherwise", async () => {
    await localize("en");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("switches back when the language changes away from RTL", async () => {
    await localize("ar");
    expect(document.documentElement.dir).toBe("rtl");

    await localize("en");
    expect(document.documentElement.dir).toBe("ltr");
  });
});
