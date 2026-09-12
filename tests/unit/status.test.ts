import { describe, expect, it } from "vitest";
import { badgeClass, badgeText } from "../../src/shared/status";
import type { Status } from "../../src/shared/types";

describe("badgeClass", () => {
  it.each<[Status, string]>([
    [200, "ok"],
    [204, "ok"],
    [299, "ok"],
    [301, "redirect"],
    [304, "redirect"],
    [400, "clienterr"],
    [404, "clienterr"],
    [429, "clienterr"],
    [500, "servererr"],
    [503, "servererr"],
    ["ERR", "neterr"],
    ["TIMEOUT", "neterr"],
    [null, "pending"],
  ])("maps %s to %s", (status, expected) => {
    expect(badgeClass(status)).toBe(expected);
  });

  it("treats a status below 200 as pending rather than guessing", () => {
    expect(badgeClass(100)).toBe("pending");
  });
});

describe("badgeText", () => {
  it.each<[Status, string]>([
    [200, "200"],
    [404, "404"],
    ["ERR", "ERR"],
    ["TIMEOUT", "TIME"],
    [null, "—"],
  ])("renders %s as %s", (status, expected) => {
    expect(badgeText(status)).toBe(expected);
  });
});
