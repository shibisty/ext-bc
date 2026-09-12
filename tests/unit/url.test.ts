import { describe, expect, it } from "vitest";
import { extractHostname, faviconUrl, matchesCurrentPage, parseTabInfo } from "../../src/shared/url";

describe("extractHostname", () => {
  it("pulls the host out of a normal URL", () => {
    expect(extractHostname("https://example.com/a/b?c=1")).toBe("example.com");
  });

  it("returns null instead of throwing on junk", () => {
    expect(extractHostname("not a url")).toBeNull();
    expect(extractHostname("")).toBeNull();
    expect(extractHostname(undefined)).toBeNull();
    expect(extractHostname(null)).toBeNull();
  });

  it("handles non-http schemes a bookmark can legitimately hold", () => {
    expect(extractHostname("file:///c:/notes.txt")).toBe("");
  });
});

describe("faviconUrl", () => {
  it("builds a favicon service URL for the host", () => {
    expect(faviconUrl("https://example.com/page")).toContain("domain=example.com");
  });

  it("is empty when the URL cannot be parsed", () => {
    expect(faviconUrl("nope")).toBe("");
  });
});

describe("parseTabInfo", () => {
  it("splits a tab URL into host and path", () => {
    expect(parseTabInfo("https://example.com/docs/intro")).toEqual({
      hostname: "example.com",
      pathname: "/docs/intro",
    });
  });

  it("is null for a tab with no usable URL", () => {
    expect(parseTabInfo(undefined)).toBeNull();
    expect(parseTabInfo("about:blank")).toEqual({ hostname: "", pathname: "blank" });
  });
});

describe("matchesCurrentPage", () => {
  const tab = { hostname: "example.com", pathname: "/docs/intro" };

  /**
   * Reported case: standing on github.com/shibisty/ext-bc, the bookmark of
   * github.com/shibisty was still marked as the page being viewed. A parent
   * section is not the current page.
   */
  it("does not match a bookmark of a section the current page sits inside", () => {
    expect(matchesCurrentPage("https://example.com/docs", tab)).toBe(false);
    expect(
      matchesCurrentPage("https://github.com/shibisty", {
        hostname: "github.com",
        pathname: "/shibisty/ext-bc",
      }),
    ).toBe(false);
  });

  it("matches the exact page", () => {
    expect(matchesCurrentPage("https://example.com/docs/intro", tab)).toBe(true);
  });

  it("matches a bare host bookmark while standing on the host root", () => {
    const onRoot = { hostname: "example.com", pathname: "/" };
    expect(matchesCurrentPage("https://example.com/", onRoot)).toBe(true);
    expect(matchesCurrentPage("https://example.com", onRoot)).toBe(true);
  });

  it("ignores a trailing slash on either side", () => {
    expect(matchesCurrentPage("https://example.com/docs/intro/", tab)).toBe(true);
    expect(
      matchesCurrentPage("https://example.com/docs", {
        hostname: "example.com",
        pathname: "/docs/",
      }),
    ).toBe(true);
  });

  /**
   * Reported case: standing on github.com/shibisty, a bookmark of a page deep
   * inside it also lit up, because substring matching worked in both
   * directions.
   */
  it("does not match a bookmark that lives deeper than the current page", () => {
    const onProfile = { hostname: "github.com", pathname: "/shibisty" };

    expect(matchesCurrentPage("https://github.com/shibisty", onProfile)).toBe(true);
    expect(
      matchesCurrentPage("https://github.com/shibisty/fearonline/issues/1", onProfile),
    ).toBe(false);
  });

  it("does not match a path that merely starts with the same text", () => {
    const onInternal = { hostname: "example.com", pathname: "/docs-internal" };
    expect(matchesCurrentPage("https://example.com/docs", onInternal)).toBe(false);
  });

  /**
   * A bookmark of the site root is not "the page you are on" once you are deep
   * inside the site — it would otherwise sit lit up permanently for every busy
   * host in the list.
   */
  it("does not let a host-root bookmark claim every page on the host", () => {
    expect(matchesCurrentPage("https://example.com/", tab)).toBe(false);
    expect(matchesCurrentPage("https://example.com", tab)).toBe(false);
  });

  it("rejects a different host", () => {
    expect(matchesCurrentPage("https://other.com/docs", tab)).toBe(false);
  });

  it("rejects an unrelated path on the same host", () => {
    expect(matchesCurrentPage("https://example.com/pricing", tab)).toBe(false);
  });

  it("is false when there is no current tab or no URL", () => {
    expect(matchesCurrentPage("https://example.com/", null)).toBe(false);
    expect(matchesCurrentPage(undefined, tab)).toBe(false);
  });

  it("is false for an unparseable bookmark URL", () => {
    expect(matchesCurrentPage("javascript:void 0", tab)).toBe(false);
  });
});
