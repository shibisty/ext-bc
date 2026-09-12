import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS } from "../../src/shared/storage";
import type { Item, State, TreeNode } from "../../src/shared/types";
import { mockBrowser } from "../setup";

const POPUP_HTML = readFileSync(path.resolve(process.cwd(), "src/ui/popup.html"), "utf8");

function item(title: string, url: string): Item {
  return {
    title,
    url,
    host: new URL(url).hostname,
    status: 200,
    statusText: "",
    reason: null,
    challenge: null,
    checkedAt: null,
  };
}

const leaf = (id: string, title: string): TreeNode => ({
  id,
  title,
  url: `https://${id}.example/`,
  type: "bookmark",
});

const folder = (id: string, title: string, children: TreeNode[]): TreeNode => ({
  id,
  title,
  type: "folder",
  children,
});

/**
 *  Work        (folder)
 *   ├ alpha
 *   └ Deep     (folder)
 *      └ beta
 *  gamma
 */
function baseState(overrides: Partial<State> = {}): State {
  return {
    ...structuredClone(DEFAULTS),
    tree: [
      folder("work", "Work", [leaf("alpha", "Alpha"), folder("deep", "Deep", [leaf("beta", "Beta")])]),
      leaf("gamma", "Gamma"),
    ],
    order: ["alpha", "beta", "gamma"],
    items: {
      alpha: item("Alpha", "https://alpha.example/"),
      beta: item("Beta", "https://beta.example/"),
      gamma: item("Gamma", "https://gamma.example/"),
    },
    ...overrides,
  };
}

async function mount(state: State = baseState()) {
  document.body.innerHTML = POPUP_HTML.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
  vi.resetModules();

  const { render } = await import("../../src/popup/render/list");
  const tabs = await import("../../src/popup/tabs");
  tabs.initTabs();
  render(state);
  return { render, ...tabs };
}

const rowIds = () =>
  [...document.querySelectorAll<HTMLElement>(".row[data-id]")].map((r) => r.dataset["id"]);
const folderTitles = () =>
  [...document.querySelectorAll("details.folder > summary")].map((s) => s.textContent);

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("the two tabs", () => {
  it("starts on the bookmarks tab", async () => {
    await mount();
    expect(rowIds()).toEqual(["alpha", "beta", "gamma"]);
    expect(document.getElementById("tabBookmarksBtn")?.className).toContain("active");
  });

  it("remembers which tab was open", async () => {
    const first = await mount();
    first.setTab("archive");

    await mount();
    expect(document.getElementById("tabArchiveBtn")?.className).toContain("active");
  });

  it("says so when the archive is empty", async () => {
    const { setTab } = await mount();
    setTab("archive");
    expect(document.querySelector(".empty")?.textContent).toBe("emptyArchive");
    expect(rowIds()).toEqual([]);
  });

  it("counts the archived branches on the tab", async () => {
    await mount(baseState({ archived: ["alpha"] }));
    expect(document.getElementById("archiveCount")?.textContent).toBe("1");
  });

  it("shows no count while the archive is empty", async () => {
    await mount();
    expect(document.getElementById("archiveCount")?.hidden).toBe(true);
  });
});

describe("archiving a bookmark", () => {
  it("takes it out of the main list", async () => {
    await mount(baseState({ archived: ["alpha"] }));
    expect(rowIds()).toEqual(["beta", "gamma"]);
  });

  it("shows it in the archive, under the folders it lives in", async () => {
    const { setTab } = await mount(baseState({ archived: ["beta"] }));
    setTab("archive");

    expect(rowIds()).toEqual(["beta"]);
    // The hierarchy is duplicated rather than flattened.
    expect(folderTitles()).toEqual(["Work", "Deep"]);
  });

  it("leaves the rest of the tree out of the archive view", async () => {
    const { setTab } = await mount(baseState({ archived: ["gamma"] }));
    setTab("archive");
    expect(rowIds()).toEqual(["gamma"]);
  });
});

describe("archiving a folder", () => {
  it("takes the folder and everything in it out of the main list", async () => {
    await mount(baseState({ archived: ["work"] }));
    expect(rowIds()).toEqual(["gamma"]);
    expect(folderTitles()).toEqual([]);
  });

  it("carries the whole folder into the archive", async () => {
    const { setTab } = await mount(baseState({ archived: ["work"] }));
    setTab("archive");

    expect(rowIds()).toEqual(["alpha", "beta"]);
    expect(folderTitles()).toEqual(["Work", "Deep"]);
  });
});

describe("folder menu", () => {
  const openFolderMenu = (index: number) =>
    document
      .querySelectorAll("details.folder > summary")
      [index]?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

  /** A real tree has the browser's roots on top and user folders inside them. */
  function withRoot(): State {
    const state = baseState();
    state.tree = [folder("root", "Bookmarks bar", state.tree)];
    return state;
  }

  it("offers archiving on an ordinary folder", async () => {
    await mount(withRoot());
    openFolderMenu(1); // "Work", inside the root

    const labels = [...document.querySelectorAll(".context-menu button")].map((b) => b.textContent);
    expect(labels).toContain("🗄contextArchiveFolder");
  });

  /**
   * Archiving the browser's own top-level folder would move every bookmark out
   * of the main list at once, which reads as the extension being broken.
   */
  it("does not offer archiving on a root folder", async () => {
    await mount(withRoot());

    openFolderMenu(0); // "Bookmarks bar" itself

    const labels = [...document.querySelectorAll(".context-menu button")].map((b) => b.textContent);
    expect(labels).toEqual(["✏contextRename"]);
  });
});

describe("search inside the archive", () => {
  it("searches only what the archive holds", async () => {
    const { render, setTab } = await mount(baseState({ archived: ["alpha"] }));
    setTab("archive");

    const input = document.getElementById("searchInput") as HTMLInputElement;
    input.value = "a";
    render(baseState({ archived: ["alpha"] }));

    // "Gamma" also matches "a", but it is not in the archive.
    expect(rowIds()).toEqual(["alpha"]);
  });

  it("searches only the main list on the bookmarks tab", async () => {
    const { render } = await mount(baseState({ archived: ["alpha"] }));

    const input = document.getElementById("searchInput") as HTMLInputElement;
    input.value = "a";
    render(baseState({ archived: ["alpha"] }));

    expect(rowIds()).toEqual(["beta", "gamma"]);
  });
});

describe("restoring", () => {
  it("offers restore instead of archive on an archived row", async () => {
    const { setTab } = await mount(baseState({ archived: ["alpha"] }));
    setTab("archive");

    const btn = document.querySelector<HTMLButtonElement>('.row[data-id="alpha"] .archive-btn');
    expect(btn?.title).toBe("unarchiveTooltip");
  });

  it("sends a toggle for the row that was archived", async () => {
    const { setTab } = await mount(baseState({ archived: ["alpha"] }));
    setTab("archive");

    document.querySelector<HTMLButtonElement>('.row[data-id="alpha"] .archive-btn')?.click();

    expect(mockBrowser().runtime.sendMessage).toHaveBeenCalledWith({
      type: "TOGGLE_ARCHIVE",
      id: "alpha",
    });
  });

  it("offers archive on a row in the main list", async () => {
    await mount();
    const btn = document.querySelector<HTMLButtonElement>('.row[data-id="alpha"] .archive-btn');
    expect(btn?.title).toBe("archiveTooltip");
  });
});
