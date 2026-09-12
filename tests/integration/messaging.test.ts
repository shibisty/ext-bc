import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerMessageRouter } from "../../src/background/router";
import type { MessageResponse } from "../../src/shared/messages";
import { mockBrowser } from "../setup";

/**
 * The two browsers answer a message in incompatible ways, and picking the wrong
 * one is silent: nothing throws, the popup's promise simply never settles.
 *
 * Chrome keeps the channel open only for a listener that returns literal `true`
 * and then calls `sendResponse`. Firefox ignores that and reads the listener's
 * returned promise. On Firefox the Chrome-only convention meant every message
 * went unanswered — the popup showed "reload the extension" and no button did
 * anything.
 */
function fire(): { returned: unknown; responded: Promise<MessageResponse> } {
  const listener = mockBrowser().runtime.onMessage.listeners[0];
  if (!listener) throw new Error("the router registered no listener");

  let resolve!: (value: MessageResponse) => void;
  const responded = new Promise<MessageResponse>((r) => {
    resolve = r;
  });

  const returned = (listener as unknown as (...args: unknown[]) => unknown)(
    { type: "PING" },
    {},
    resolve,
  );
  return { returned, responded };
}

beforeEach(() => {
  mockBrowser().__setTree([]);
});

describe("answering the popup", () => {
  it("uses sendResponse and keeps the channel open on Chrome", async () => {
    registerMessageRouter();

    const { returned, responded } = fire();

    expect(returned).toBe(true);
    await expect(responded).resolves.toMatchObject({ ok: true, version: "9.9.9" });
  });

  it("resolves a returned promise on Firefox", async () => {
    mockBrowser().__setFirefox(true);
    registerMessageRouter();

    const { returned } = fire();

    expect(returned).toBeInstanceOf(Promise);
    await expect(returned as Promise<MessageResponse>).resolves.toMatchObject({
      ok: true,
      version: "9.9.9",
    });
  });

  it("answers an unknown message instead of leaving the caller hanging", async () => {
    mockBrowser().__setFirefox(true);
    registerMessageRouter();

    const listener = mockBrowser().runtime.onMessage.listeners[0] as unknown as (
      ...args: unknown[]
    ) => Promise<MessageResponse>;
    const answer = await listener({ type: "NOPE" }, {}, vi.fn());

    expect(answer.ok).toBe(false);
    expect(answer.error).toContain("unknown message");
  });
});
