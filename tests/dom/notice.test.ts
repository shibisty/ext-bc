import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS } from "../../src/shared/storage";
import type { Item, State, TreeNode } from "../../src/shared/types";
import { mockBrowser } from "../setup";

const POPUP_HTML = readFileSync(path.resolve(process.cwd(), "src/ui/popup.html"), "utf8");

const item = (title: string, url: string): Item => ({
  title,
  url,
  host: new URL(url).hostname,
  status: 200,
  statusText: "",
  reason: null,
  challenge: null,
  checkedAt: null,
});

const leaf = (id: string, title: string): TreeNode => ({
  id,
  title,
  url: `https://${id}.example/`,
  type: "bookmark",
});

const oneBookmark = (): State => ({
  ...structuredClone(DEFAULTS),
  tree: [leaf("a", "Alpha")],
  order: ["a"],
  items: { a: item("Alpha", "https://a.example/") },
});

async function mount() {
  document.body.innerHTML = POPUP_HTML.replace(/[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*/, "");
  vi.resetModules();
  const { render } = await import("../../src/popup/render/list");
  const actions = await import("../../src/popup/actions");
  render(oneBookmark());
  return actions;
}

const footer = () => document.getElementById("progressLabel")!;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

/**
 * Every popup action is a round trip to the background worker. When the worker
 * does not answer — a stale service worker after an update is the usual cause —
 * the promise rejects and nothing renders, so the button looks inert. These
 * cover the failure being said out loud instead.
 */
describe("a failed round trip", () => {
  it("reports a worker that never answers", async () => {
    mockBrowser().runtime.sendMessage.mockRejectedValue(
      new Error("Could not establish connection. Receiving end does not exist."),
    );

    const { toggleArchive } = await mount();
    await toggleArchive("a");

    expect(footer().textContent).toBe("actionFailed");
    expect(footer().className).toContain("notice");
  });

  it("reports a worker that refuses the message", async () => {
    mockBrowser().runtime.sendMessage.mockResolvedValue({ ok: false, error: "unknown message" });

    const { togglePin } = await mount();
    await togglePin("a");

    expect(footer().textContent).toBe("actionFailed");
  });

  it("says nothing when the round trip succeeds", async () => {
    mockBrowser().runtime.sendMessage.mockResolvedValue({ ok: true, state: oneBookmark() });

    const { toggleArchive } = await mount();
    await toggleArchive("a");

    expect(footer().className).not.toContain("notice");
  });

  it("clears the message after a while", async () => {
    vi.useFakeTimers();
    mockBrowser().runtime.sendMessage.mockRejectedValue(new Error("no receiver"));

    const { toggleArchive } = await mount();
    await toggleArchive("a");
    expect(footer().className).toContain("notice");

    await vi.advanceTimersByTimeAsync(6000);
    expect(footer().className).not.toContain("notice");

    vi.useRealTimers();
  });
});
