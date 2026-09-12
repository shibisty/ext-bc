import { describe, expect, it } from "vitest";
import { propagateDomainStatus } from "../../src/background/domain";
import type { CheckResult, Item } from "../../src/shared/types";

const NETWORK_FAILURE: CheckResult = {
  status: "ERR",
  statusText: "",
  reason: "network",
  challenge: null,
};

function item(host: string, overrides: Partial<Item> = {}): Item {
  return {
    title: "t",
    url: `https://${host}/x`,
    host,
    status: 200,
    statusText: "",
    reason: null,
    challenge: null,
    checkedAt: 50,
    ...overrides,
  };
}

describe("propagateDomainStatus", () => {
  it("marks other bookmarks on the same host as unreachable", () => {
    const items = {
      src: item("a.example", { status: "ERR", reason: "network", checkedAt: 100 }),
      sibling: item("a.example"),
    };

    propagateDomainStatus(items, "src", NETWORK_FAILURE);

    expect(items["sibling"]).toMatchObject({
      status: "ERR",
      reason: "domain",
      inferredFrom: "src",
    });
  });

  it("leaves checkedAt alone, so nothing looks freshly checked when it wasn't", () => {
    const items = {
      src: item("a.example", { status: "ERR", checkedAt: 100 }),
      sibling: item("a.example", { checkedAt: 50 }),
    };

    propagateDomainStatus(items, "src", NETWORK_FAILURE);

    expect(items["sibling"]?.checkedAt).toBe(50);
  });

  it("never touches another host", () => {
    const items = {
      src: item("a.example", { status: "ERR" }),
      other: item("b.example"),
    };

    propagateDomainStatus(items, "src", NETWORK_FAILURE);

    expect(items["other"]?.status).toBe(200);
    expect(items["other"]?.inferredFrom).toBeUndefined();
  });

  it("does not propagate an HTTP error — a 404 says nothing about the host", () => {
    const items = { src: item("a.example", { status: 404 }), sibling: item("a.example") };

    propagateDomainStatus(items, "src", { status: 404, statusText: "Not Found", reason: null, challenge: null });

    expect(items["sibling"]?.status).toBe(200);
  });

  it("does not propagate a timeout", () => {
    const items = { src: item("a.example", { status: "TIMEOUT" }), sibling: item("a.example") };

    propagateDomainStatus(items, "src", { status: "TIMEOUT", statusText: "", reason: "timeout", challenge: null });

    expect(items["sibling"]?.status).toBe(200);
  });

  it("does not overwrite a directly measured failure with an inferred one", () => {
    const items = {
      src: item("a.example", { status: "ERR" }),
      measured: item("a.example", { status: "ERR", reason: "network", checkedAt: 70 }),
    };

    propagateDomainStatus(items, "src", NETWORK_FAILURE);

    expect(items["measured"]?.reason).toBe("network");
    expect(items["measured"]?.inferredFrom).toBeUndefined();
  });

  it("does nothing when the source has no resolvable host", () => {
    const items = {
      src: item("a.example", { status: "ERR", host: null }),
      sibling: item("a.example"),
    };

    propagateDomainStatus(items, "src", NETWORK_FAILURE);

    expect(items["sibling"]?.status).toBe(200);
  });
});
