import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(path.resolve(process.cwd(), "src/ui/popup.css"), "utf8");

interface Rule {
  selector: string;
  body: string;
}

function parseRules(css: string): Rule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    rules.push({ selector: (match[1] ?? "").trim(), body: match[2] ?? "" });
  }
  return rules;
}

const RULES = parseRules(CSS);
const HEX = /#[0-9a-fA-F]{3,8}\b/;

const lightSelectors = RULES.filter((r) => r.selector.includes("theme-light")).map(
  (r) => r.selector,
);

describe("light theme coverage", () => {
  /**
   * The dark theme is the default, so any rule that hard-codes a colour instead
   * of using a variable needs a `body.theme-light` counterpart — otherwise that
   * element stays dark on a light background. This is how the active row, the
   * toggled row buttons and the "open now" chip ended up as black blocks.
   */
  it("gives every hard-coded colour a light-theme counterpart", () => {
    const uncovered = RULES.filter((rule) => {
      if (rule.selector.includes("theme-light")) return false;
      if (rule.selector.startsWith("@") || rule.selector.includes(":root")) return false;
      if (!HEX.test(rule.body)) return false;

      const core = rule.selector.split(",")[0]?.trim() ?? "";
      return !lightSelectors.some((light) => light.includes(core));
    }).map((rule) => rule.selector.split(",")[0]?.trim());

    expect(uncovered).toEqual([]);
  });

  it("defines the full palette for both themes", () => {
    const root = RULES.find((r) => r.selector === ":root")?.body ?? "";
    const light = RULES.find((r) => r.selector === "body.theme-light")?.body ?? "";

    const names = (body: string) => [...body.matchAll(/(--[\w-]+):/g)].map((m) => m[1]).sort();

    expect(names(root)).not.toHaveLength(0);
    expect(names(light)).toEqual(names(root));
  });
});

describe("the settings screen", () => {
  it("hides the list, the search bar and the tabs while it is open", () => {
    const hidden = RULES.filter(
      (r) => r.selector.includes("settings-open") && /display:\s*none/.test(r.body),
    );
    const selectors = hidden.map((r) => r.selector).join(" ");

    for (const part of [".tabs", ".searchbar", ".list"]) {
      expect(selectors, `${part} stays visible behind the settings screen`).toContain(part);
    }
  });
});

describe("hidden elements", () => {
  /**
   * A class that sets `display` outranks the browser's own
   * `[hidden] { display: none }`, so anything toggled through the `hidden`
   * property needs an explicit rule. The search clear button was visible at all
   * times because of exactly this.
   */
  it("keeps display-setting classes hideable", () => {
    const displayRules = RULES.filter(
      (r) => /(^|\s)display:\s*(flex|grid|block|inline-flex)/m.test(r.body) && !r.selector.includes("[hidden]"),
    );

    const togglesWithHidden = [".search-clear", ".settings-view"];
    for (const selector of togglesWithHidden) {
      const setsDisplay = displayRules.some((r) => r.selector.includes(selector));
      if (!setsDisplay) continue;
      const hasGuard = RULES.some((r) => r.selector.includes(`${selector}[hidden]`));
      expect(hasGuard, `${selector} sets display but has no [hidden] rule`).toBe(true);
    }
  });
});
