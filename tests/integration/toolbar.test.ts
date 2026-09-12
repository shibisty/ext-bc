import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMessageRouter } from "../../src/background/router";
import type { Message, MessageResponse } from "../../src/shared/messages";
import { readState } from "../../src/shared/storage";
import { mockBrowser } from "../setup";

function send(msg: Message): Promise<MessageResponse> {
  return new Promise((resolve) => {
    mockBrowser().runtime.onMessage.emit(
      msg,
      {} as chrome.runtime.MessageSender,
      resolve as (response: unknown) => void,
    );
  });
}

/** The toolbar is the browser's own root folder, id "1" in Chrome. */
const toolbarTitles = () =>
  mockBrowser()
    .__tree()[0]!
    .children!.map((child) => child.title);

beforeEach(() => {
  registerMessageRouter();
  mockBrowser().__setTree([
    {
      id: "1",
      title: "Bookmarks bar",
      children: [{ id: "2", title: "OnToolbar", url: "https://on-toolbar.example/" }],
    },
    {
      id: "3",
      title: "Other bookmarks",
      children: [
        { id: "4", title: "Elsewhere", url: "https://elsewhere.example/" },
        { id: "5", title: "Twin", url: "https://on-toolbar.example/" },
      ],
    },
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 200 })),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("pinning without the toolbar preference", () => {
  it("leaves the toolbar completely alone", async () => {
    await send({ type: "SYNC" });
    await send({ type: "TOGGLE_PIN", id: "4" });

    expect(toolbarTitles()).toEqual(["OnToolbar"]);
    expect((await readState()).toolbarPins).toEqual({});
  });
});

describe("pinning with the toolbar preference on", () => {
  /** The bookmark stays where it is — the toolbar gets a copy, not the original. */
  it("copies the bookmark to the front of the toolbar", async () => {
    await send({ type: "SYNC" });
    await send({ type: "TOGGLE_PIN", id: "4", mirrorToToolbar: true });

    expect(toolbarTitles()).toEqual(["Elsewhere", "OnToolbar"]);

    const other = mockBrowser().__tree()[1]!.children!.map((c) => c.title);
    expect(other).toContain("Elsewhere");
  });

  it("records the copy so it can be taken back later", async () => {
    await send({ type: "SYNC" });
    await send({ type: "TOGGLE_PIN", id: "4", mirrorToToolbar: true });

    expect(Object.keys((await readState()).toolbarPins)).toEqual(["4"]);
  });

  it("removes its own copy when the bookmark is unpinned", async () => {
    await send({ type: "SYNC" });
    await send({ type: "TOGGLE_PIN", id: "4", mirrorToToolbar: true });
    await send({ type: "TOGGLE_PIN", id: "4", mirrorToToolbar: true });

    expect(toolbarTitles()).toEqual(["OnToolbar"]);
    expect((await readState()).toolbarPins).toEqual({});
  });

  /**
   * The rule that matters: the toolbar never loses something the user put there
   * themselves, so a bookmark already on the toolbar is neither copied nor
   * removed.
   */
  it("does not touch a bookmark that was on the toolbar already", async () => {
    await send({ type: "SYNC" });
    await send({ type: "TOGGLE_PIN", id: "2", mirrorToToolbar: true });

    expect(toolbarTitles()).toEqual(["OnToolbar"]);
    expect((await readState()).toolbarPins).toEqual({});

    await send({ type: "TOGGLE_PIN", id: "2", mirrorToToolbar: true });
    expect(toolbarTitles()).toEqual(["OnToolbar"]);
  });

  it("recognises an existing toolbar entry by its address, not its id", async () => {
    await send({ type: "SYNC" });
    // "Twin" lives elsewhere but points at a URL the toolbar already has.
    await send({ type: "TOGGLE_PIN", id: "5", mirrorToToolbar: true });

    expect(toolbarTitles()).toEqual(["OnToolbar"]);
    expect((await readState()).toolbarPins).toEqual({});
  });

  it("does not copy twice when pinning is repeated", async () => {
    await send({ type: "SYNC" });
    await send({ type: "TOGGLE_PIN", id: "4", mirrorToToolbar: true });
    await send({ type: "SYNC" });

    expect(toolbarTitles()).toEqual(["Elsewhere", "OnToolbar"]);
  });

  it("forgets a copy the user deleted by hand", async () => {
    await send({ type: "SYNC" });
    await send({ type: "TOGGLE_PIN", id: "4", mirrorToToolbar: true });

    const copyId = (await readState()).toolbarPins["4"]!;
    await mockBrowser().bookmarks.remove(copyId);
    await send({ type: "SYNC" });

    expect((await readState()).toolbarPins).toEqual({});
  });

  it("still unpins cleanly when the preference is switched off first", async () => {
    await send({ type: "SYNC" });
    await send({ type: "TOGGLE_PIN", id: "4", mirrorToToolbar: true });

    // Preference off: the popup stops asking, so the copy simply stays.
    await send({ type: "TOGGLE_PIN", id: "4" });

    expect((await readState()).pinned).toEqual([]);
    expect(toolbarTitles()).toEqual(["Elsewhere", "OnToolbar"]);
  });
});
