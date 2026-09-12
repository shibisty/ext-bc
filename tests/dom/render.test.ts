import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item, State, TreeNode } from "../../src/shared/types";
import { DEFAULTS } from "../../src/shared/storage";

/** The tests run against the real popup markup, not a hand-written fixture. */
const POPUP_HTML = readFileSync(path.resolve(process.cwd(), "src/ui/popup.html"), "utf8");

/**
 * The popup's modules resolve their elements when they are first imported, so
 * the real markup has to be in place before the import — hence the reset and
 * dynamic import in every test.
 */
async function mountPopup() {
  document.body.innerHTML = POPUP_HTML.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
  vi.resetModules();
  const list = await import("../../src/popup/render/list");
  const selection = await import("../../src/popup/selection");
  const uiState = await import("../../src/popup/ui-state");
  return { ...list, ...selection, ui: uiState.ui };
}

function item(overrides: Partial<Item> = {}): Item {
  return {
    title: "Example",
    url: "https://example.com/",
    host: "example.com",
    status: 200,
    statusText: "",
    reason: null,
    challenge: null,
    checkedAt: null,
    ...overrides,
  };
}

function folder(id: string, title: string, children: TreeNode[]): TreeNode {
  return { id, title, type: "folder", children };
}

function leaf(id: string, title: string, url: string): TreeNode {
  return { id, title, url, type: "bookmark" };
}

function state(overrides: Partial<State> = {}): State {
  return { ...structuredClone(DEFAULTS), ...overrides };
}

const rows = () => [...document.querySelectorAll<HTMLElement>(".row[data-id]")];
const rowIds = () => rows().map((row) => row.dataset["id"]);

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("render", () => {
  it("shows an empty message when there are no bookmarks", async () => {
    const { render } = await mountPopup();
    render(state());
    expect(document.getElementById("emptyState")?.textContent).toBe("emptyNoBookmarks");
    expect(rows()).toHaveLength(0);
  });

  it("renders folders as collapsible sections containing their bookmarks", async () => {
    const { render } = await mountPopup();
    render(
      state({
        tree: [folder("f1", "Work", [leaf("a", "A", "https://a.example/")])],
        order: ["a"],
        items: { a: item() },
      }),
    );

    const details = document.querySelector("details.folder");
    expect(details?.querySelector("summary")?.textContent).toBe("Work");
    expect(details?.querySelectorAll(".row")).toHaveLength(1);
  });

  it("hides a folder with nothing visible in it", async () => {
    const { render } = await mountPopup();
    render(
      state({
        tree: [folder("f1", "Empty", []), folder("f2", "Work", [leaf("a", "A", "https://a.example/")])],
        order: ["a"],
        items: { a: item() },
      }),
    );
    expect(document.querySelectorAll("details.folder")).toHaveLength(1);
  });

  it("lists pinned bookmarks in their own section, above the tree", async () => {
    const { render } = await mountPopup();
    render(
      state({
        tree: [folder("f1", "Work", [leaf("a", "A", "https://a.example/"), leaf("b", "B", "https://b.example/")])],
        order: ["a", "b"],
        items: { a: item({ title: "A" }), b: item({ title: "B" }) },
        pinned: ["b"],
      }),
    );

    expect(document.querySelector(".section-label")?.textContent).toBe("pinnedSectionLabel");
    // Pinned first, and not repeated inside the folder.
    expect(rowIds()).toEqual(["b", "a"]);
  });

  it("shows the status code on the badge", async () => {
    const { render } = await mountPopup();
    render(
      state({
        tree: [leaf("a", "A", "https://a.example/")],
        order: ["a"],
        items: { a: item({ status: 404 }) },
      }),
    );

    const badge = document.querySelector(".badge");
    expect(badge?.textContent).toBe("404");
    expect(badge?.className).toContain("clienterr");
  });

  it("marks a bookmark whose checking is switched off", async () => {
    const { render } = await mountPopup();
    render(
      state({
        tree: [leaf("a", "A", "https://a.example/")],
        order: ["a"],
        items: { a: item() },
        disabledChecks: ["a"],
      }),
    );

    expect(document.querySelector(".row")?.className).toContain("check-disabled");
    expect(document.querySelector(".badge")?.textContent).toBe("checkDisabledBadge");
  });

  // Requested behaviour: with the interval set to "off", a code on record was
  // measured at some unknown point in the past, so the badge column goes away
  // entirely rather than showing a placeholder in its place.
  it("drops the status badge entirely while auto-checking is switched off", async () => {
    const { render } = await mountPopup();
    render(
      state({
        tree: [leaf("a", "A", "https://a.example/")],
        order: ["a"],
        items: { a: item({ status: 404 }) },
        intervalMinutes: 0,
      }),
    );

    expect(rows()).toHaveLength(1);
    expect(document.querySelector(".badge")).toBeNull();
  });

  it("drops the badge for a flagged bookmark too when checking is off", async () => {
    const { render } = await mountPopup();
    render(
      state({
        tree: [leaf("a", "A", "https://a.example/")],
        order: ["a"],
        items: { a: item({ status: 200, challenge: "Cloudflare" }) },
        intervalMinutes: 0,
      }),
    );

    expect(document.querySelector(".badge")).toBeNull();
  });

  // A bookmark muted with the bell keeps its badge: that OFF is about the
  // bookmark, not about the extension having stopped checking altogether.
  it("still badges an individually muted bookmark as OFF", async () => {
    const { render } = await mountPopup();
    render(
      state({
        tree: [leaf("a", "A", "https://a.example/")],
        order: ["a"],
        items: { a: item({ status: 404 }) },
        disabledChecks: ["a"],
        intervalMinutes: 60,
      }),
    );

    expect(document.querySelector(".badge")?.textContent).toBe("checkDisabledBadge");
  });

  it("shows codes again once an interval is set", async () => {
    const { render } = await mountPopup();
    render(
      state({
        tree: [leaf("a", "A", "https://a.example/")],
        order: ["a"],
        items: { a: item({ status: 404 }) },
        intervalMinutes: 60,
      }),
    );

    expect(document.querySelector(".badge")?.textContent).toBe("404");
  });

  it("does not dim every row just because auto-checking is off", async () => {
    const { render } = await mountPopup();
    render(
      state({
        tree: [leaf("a", "A", "https://a.example/")],
        order: ["a"],
        items: { a: item() },
        intervalMinutes: 0,
      }),
    );

    expect(document.querySelector(".row")?.className).not.toContain("check-disabled");
  });

  it("replaces a bot-protection code with the vendor marker", async () => {
    const { render } = await mountPopup();
    render(
      state({
        tree: [leaf("a", "A", "https://a.example/")],
        order: ["a"],
        items: { a: item({ status: 200, challenge: "Cloudflare" }) },
      }),
    );

    const badge = document.querySelector(".badge");
    expect(badge?.textContent).toBe("CLDF");
    expect(badge?.className).toContain("challenge");
    // The real code is still available on hover, just not presented as fact.
    expect(badge?.getAttribute("title")).toBe("Cloudflare · 200");
  });

  it("shows one marker for every flavour of CAPTCHA", async () => {
    const { render } = await mountPopup();
    render(
      state({
        tree: [leaf("a", "A", "https://a.example/"), leaf("b", "B", "https://b.example/")],
        order: ["a", "b"],
        items: {
          a: item({ status: 200, challenge: "reCAPTCHA" }),
          b: item({ status: 403, challenge: "hCaptcha" }),
        },
      }),
    );

    expect([...document.querySelectorAll(".badge")].map((b) => b.textContent)).toEqual([
      "CPHC",
      "CPHC",
    ]);
  });

  it("leaves an ordinary 200 unmarked", async () => {
    const { render } = await mountPopup();
    render(
      state({
        tree: [leaf("a", "A", "https://a.example/")],
        order: ["a"],
        items: { a: item({ status: 200 }) },
      }),
    );

    expect(document.querySelector(".badge")?.className).not.toContain("challenge");
    expect(document.querySelector(".badge")?.textContent).toBe("200");
  });

  it("highlights the bookmark the queue is pointing at", async () => {
    const { render } = await mountPopup();
    render(
      state({
        tree: [leaf("a", "A", "https://a.example/"), leaf("b", "B", "https://b.example/")],
        order: ["a", "b"],
        items: { a: item(), b: item() },
        currentIndex: 1,
      }),
    );

    expect(document.querySelector(".row.active")?.getAttribute("data-id")).toBe("b");
  });
});

describe("search", () => {
  const searchState = () =>
    state({
      tree: [folder("f1", "Work", [leaf("a", "Alpha", "https://alpha.example/"), leaf("b", "Beta", "https://beta.example/")])],
      order: ["a", "b"],
      items: {
        a: item({ title: "Alpha", url: "https://alpha.example/", status: "TIMEOUT", reason: "timeout" }),
        b: item({ title: "Beta", url: "https://beta.example/", status: 200 }),
      },
    });

  async function search(query: string) {
    const mounted = await mountPopup();
    const input = document.getElementById("searchInput") as HTMLInputElement;
    input.value = query;
    mounted.render(searchState());
    return mounted;
  }

  it("filters by title", async () => {
    await search("alph");
    expect(rowIds()).toEqual(["a"]);
  });

  it("filters by address", async () => {
    await search("beta.example");
    expect(rowIds()).toEqual(["b"]);
  });

  it("filters by status code", async () => {
    await search("200");
    expect(rowIds()).toEqual(["b"]);
  });

  // Regression: the badge reads "TIME", so a search for the full word used to
  // find nothing.
  it("finds a timeout by its full name, not just the abbreviated badge", async () => {
    await search("timeout");
    expect(rowIds()).toEqual(["a"]);
  });

  it("finds bookmarks stuck behind a bot-protection service", async () => {
    const mounted = await mountPopup();
    const input = document.getElementById("searchInput") as HTMLInputElement;
    input.value = "cloudflare";
    mounted.render(
      state({
        tree: [leaf("a", "A", "https://a.example/"), leaf("b", "B", "https://b.example/")],
        order: ["a", "b"],
        items: { a: item({ challenge: "Cloudflare" }), b: item() },
      }),
    );
    expect(rowIds()).toEqual(["a"]);
  });

  it("shows a breadcrumb with the containing folder", async () => {
    await search("alpha");
    expect(document.querySelector(".breadcrumb")?.textContent).toBe("Work");
  });

  it("marks the matched substring in the title", async () => {
    await search("alph");
    const marks = document.querySelectorAll(".row-title mark.match");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("Alph");
    // The surrounding text is untouched.
    expect(document.querySelector(".row-title")?.textContent).toBe("Alpha");
  });

  it("marks it in the address too", async () => {
    await search("alpha.example");
    expect(document.querySelector(".row-url mark.match")?.textContent).toBe("alpha.example");
  });

  it("marks it in the status code", async () => {
    await search("200");
    expect(document.querySelector(".badge mark.match")?.textContent).toBe("200");
  });

  it("leaves the timestamp suffix unmarked", async () => {
    const mounted = await mountPopup();
    const input = document.getElementById("searchInput") as HTMLInputElement;
    input.value = "min";
    mounted.render(
      state({
        tree: [leaf("a", "A", "https://a.example/")],
        order: ["a"],
        items: { a: item({ title: "A", url: "https://a.example/", checkedAt: Date.now() - 300000 }) },
      }),
    );
    // "5 min ago" is generated text, not something the search looked at.
    expect(document.querySelector(".row-url mark.match")).toBeNull();
  });

  it("marks nothing when the box is empty", async () => {
    await search("");
    expect(document.querySelectorAll("mark.match")).toHaveLength(0);
  });

  it("says so when nothing matches", async () => {
    await search("zzz");
    expect(document.querySelector(".empty")?.textContent).toBe("emptyNoResults");
    expect(rows()).toHaveLength(0);
  });
});

describe("selection", () => {
  async function renderThree() {
    const mounted = await mountPopup();
    mounted.render(
      state({
        tree: [
          leaf("a", "A", "https://a.example/"),
          leaf("b", "B", "https://b.example/"),
          leaf("c", "C", "https://c.example/"),
        ],
        order: ["a", "b", "c"],
        items: { a: item(), b: item(), c: item() },
      }),
    );
    return mounted;
  }

  const click = (id: string, init: MouseEventInit = {}) => {
    const row = document.querySelector<HTMLElement>(`.row[data-id="${id}"]`);
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
  };

  it("selects a single row on a plain click", async () => {
    const { ui } = await renderThree();
    click("b");
    expect([...ui.selectedIds]).toEqual(["b"]);
  });

  it("replaces the selection on the next plain click", async () => {
    const { ui } = await renderThree();
    click("a");
    click("c");
    expect([...ui.selectedIds]).toEqual(["c"]);
  });

  it("adds and removes with ctrl-click", async () => {
    const { ui } = await renderThree();
    click("a");
    click("c", { ctrlKey: true });
    expect([...ui.selectedIds].sort()).toEqual(["a", "c"]);

    click("c", { ctrlKey: true });
    expect([...ui.selectedIds]).toEqual(["a"]);
  });

  it("selects a range with shift-click", async () => {
    const { ui } = await renderThree();
    click("a");
    click("c", { shiftKey: true });
    expect([...ui.selectedIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("selects the range backwards too", async () => {
    const { ui } = await renderThree();
    click("c");
    click("a", { shiftKey: true });
    expect([...ui.selectedIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("marks selected rows in the DOM", async () => {
    await renderThree();
    click("b");
    expect(document.querySelector(".row.selected")?.getAttribute("data-id")).toBe("b");
  });

  it("drops ids that no longer exist when state changes under it", async () => {
    const mounted = await renderThree();
    click("b");

    mounted.render(
      state({
        tree: [leaf("a", "A", "https://a.example/")],
        order: ["a"],
        items: { a: item() },
      }),
    );

    expect([...mounted.ui.selectedIds]).toEqual([]);
  });
});

describe("footer", () => {
  async function renderWith(overrides: Partial<State>) {
    const mounted = await mountPopup();
    mounted.render(
      state({
        tree: [leaf("a", "A", "https://a.example/"), leaf("b", "B", "https://b.example/")],
        order: ["a", "b"],
        items: { a: item(), b: item() },
        ...overrides,
      }),
    );
    return document.getElementById("progressLabel")?.textContent;
  }

  it("shows progress through the queue", async () => {
    expect(await renderWith({ currentIndex: 1 })).toBe("progressLabel(2,2)");
  });

  it("says auto-checking is off when the interval is 0", async () => {
    expect(await renderWith({ intervalMinutes: 0 })).toBe("autoCheckOffHint");
  });

  it("says so when every bookmark has checking disabled", async () => {
    expect(await renderWith({ disabledChecks: ["a", "b"] })).toBe("allChecksDisabled");
  });

  it("counts the selection while something is selected", async () => {
    const mounted = await mountPopup();
    mounted.render(
      state({
        tree: [leaf("a", "A", "https://a.example/")],
        order: ["a"],
        items: { a: item() },
      }),
    );

    document
      .querySelector<HTMLElement>('.row[data-id="a"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.getElementById("progressLabel")?.textContent).toBe("selectionHint(1)");
  });
});
