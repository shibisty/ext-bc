import { t } from "./i18n";

/**
 * Human-readable "checked N minutes ago".
 * `now` is injectable so the formatting is testable without faking the clock.
 */
export function timeAgo(ts: number | null | undefined, now: number = Date.now()): string {
  if (!ts) return t("timeNever") || "—";
  const minutes = Math.floor((now - ts) / 60000);
  if (minutes < 1) return t("timeJustNow");
  if (minutes < 60) return t("timeMinAgo", [String(minutes)]);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("timeHoursAgo", [String(hours)]);
  return t("timeDaysAgo", [String(Math.floor(hours / 24))]);
}
