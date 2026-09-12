import { describe, expect, it } from "vitest";
import { highlightFragment, highlightRuns, setHighlightedText } from "../../src/shared/highlight";

const runs = (text: string, query: string) =>
  highlightRuns(text, query).map((r) => (r.match ? `[${r.text}]` : r.text));

describe("highlightRuns", () => {
  it("marks a single occurrence", () => {
    expect(runs("Roman Empire", "man")).toEqual(["Ro", "[man]", " Empire"]);
  });

  it("marks every occurrence", () => {
    expect(runs("aXaXa", "x")).toEqual(["a", "[X]", "a", "[X]", "a"]);
  });

  it("matches regardless of case but keeps the original text", () => {
    expect(runs("GitHub", "hub")).toEqual(["Git", "[Hub]"]);
  });

  it("marks a match at the very start and at the very end", () => {
    expect(runs("abc", "ab")).toEqual(["[ab]", "c"]);
    expect(runs("abc", "bc")).toEqual(["a", "[bc]"]);
    expect(runs("abc", "abc")).toEqual(["[abc]"]);
  });

  it("leaves text alone when there is no query", () => {
    expect(runs("anything", "")).toEqual(["anything"]);
    expect(runs("anything", "   ")).toEqual(["anything"]);
  });

  it("leaves text alone when the query does not occur", () => {
    expect(runs("anything", "zzz")).toEqual(["anything"]);
  });

  it("treats the query literally rather than as a pattern", () => {
    expect(runs("a.c", ".")).toEqual(["a", "[.]", "c"]);
    expect(runs("abc", ".")).toEqual(["abc"]);
  });

  it("handles an empty string", () => {
    expect(highlightRuns("", "x")).toEqual([]);
  });
});

describe("highlightFragment", () => {
  it("wraps matches in <mark> and leaves the rest as text", () => {
    const host = document.createElement("div");
    host.appendChild(highlightFragment("Roman Empire", "man"));

    expect(host.textContent).toBe("Roman Empire");
    expect(host.querySelectorAll("mark.match")).toHaveLength(1);
    expect(host.querySelector("mark")?.textContent).toBe("man");
  });

  it("produces no markup at all without a query", () => {
    const host = document.createElement("div");
    host.appendChild(highlightFragment("Roman Empire", ""));
    expect(host.querySelector("mark")).toBeNull();
  });

  /**
   * Bookmark titles are user data. Building nodes rather than assigning
   * innerHTML means markup in a title can never become live DOM.
   */
  it("never interprets the text as markup", () => {
    const host = document.createElement("div");
    host.appendChild(highlightFragment("<img src=x onerror=alert(1)> hi", "img"));

    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toBe("<img src=x onerror=alert(1)> hi");
  });
});

describe("setHighlightedText", () => {
  it("replaces whatever the element held before", () => {
    const el = document.createElement("div");
    el.textContent = "old";
    setHighlightedText(el, "new text", "text");

    expect(el.textContent).toBe("new text");
    expect(el.querySelectorAll("mark")).toHaveLength(1);
  });
});
