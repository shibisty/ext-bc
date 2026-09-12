import { afterEach, describe, expect, it, vi } from "vitest";
import { loadLocale, setLocalePref, substitutePlaceholders, t } from "../../src/shared/i18n";
import { timeAgo } from "../../src/shared/time";

afterEach(() => setLocalePref("auto"));

describe("substitutePlaceholders", () => {
  it("fills $1, $2… from an array", () => {
    expect(substitutePlaceholders("$1 of $2", ["3", "10"])).toBe("3 of 10");
  });

  it("accepts a bare string as a single substitution", () => {
    expect(substitutePlaceholders("hi $1", "there")).toBe("hi there");
  });

  it("leaves placeholders with no matching value untouched", () => {
    expect(substitutePlaceholders("$1 and $2", ["only"])).toBe("only and $2");
  });

  it("returns the string unchanged when there is nothing to substitute", () => {
    expect(substitutePlaceholders("plain $1", undefined)).toBe("plain $1");
  });
});

describe("t", () => {
  it("falls back to the browser i18n API when set to auto", () => {
    setLocalePref("auto");
    expect(t("popupTitle")).toBe("popupTitle");
    expect(t("progressLabel", ["1", "5"])).toBe("progressLabel(1,5)");
  });

  it("prefers an explicitly loaded locale over the browser language", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ popupTitle: { message: "Закладки" } }))),
    );

    await loadLocale("ru");
    setLocalePref("ru");
    expect(t("popupTitle")).toBe("Закладки");

    vi.unstubAllGlobals();
  });

  it("falls back per key when the loaded locale lacks it", async () => {
    setLocalePref("ru");
    // "ru" was loaded above with only popupTitle in it.
    expect(t("settingsTitle")).toBe("settingsTitle");
  });

  it("survives a locale file that cannot be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    await expect(loadLocale("de")).resolves.toBeUndefined();
    setLocalePref("de");
    expect(t("popupTitle")).toBe("popupTitle");

    vi.unstubAllGlobals();
  });
});

describe("timeAgo", () => {
  const now = 1_000_000_000_000;

  it.each([
    [30_000, "timeJustNow"],
    [5 * 60_000, "timeMinAgo(5)"],
    [3 * 3_600_000, "timeHoursAgo(3)"],
    [2 * 86_400_000, "timeDaysAgo(2)"],
  ])("renders an age of %sms as %s", (age, expected) => {
    expect(timeAgo(now - age, now)).toBe(expected);
  });

  it("says never when there is no timestamp", () => {
    expect(timeAgo(null, now)).toBe("timeNever");
  });

  it("uses the real clock when no reference time is given", () => {
    expect(timeAgo(Date.now())).toBe("timeJustNow");
  });
});
