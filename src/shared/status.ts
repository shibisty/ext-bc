import type { Status } from "./types";

export type BadgeClass =
  | "pending"
  | "ok"
  | "redirect"
  | "clienterr"
  | "servererr"
  | "neterr";

export function badgeClass(status: Status): BadgeClass {
  if (status === null || status === undefined) return "pending";
  if (status === "ERR" || status === "TIMEOUT") return "neterr";
  if (typeof status === "number") {
    if (status >= 200 && status < 300) return "ok";
    if (status >= 300 && status < 400) return "redirect";
    if (status >= 400 && status < 500) return "clienterr";
    if (status >= 500) return "servererr";
  }
  return "pending";
}

export function badgeText(status: Status): string {
  if (status === null || status === undefined) return "—";
  if (status === "ERR") return "ERR";
  if (status === "TIMEOUT") return "TIME";
  return String(status);
}
