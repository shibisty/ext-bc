import { describe, expect, it } from "vitest";
import { challengeCode, detectChallenge, detectChallengeInResponse } from "../../src/shared/challenge";

/** Builds the header lookup `detectChallenge` expects. */
function headers(map: Record<string, string> = {}) {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return (name: string) => lower[name.toLowerCase()] ?? null;
}

const check = (status: number, hdrs: Record<string, string> = {}, url?: string) =>
  detectChallenge({ status, url, header: headers(hdrs) });

describe("detectChallenge", () => {
  it("leaves an ordinary response alone", () => {
    expect(check(200, { server: "nginx" }, "https://example.com/")).toBeNull();
  });

  it("does not cry wolf over a plain 404", () => {
    expect(check(404, { server: "nginx" })).toBeNull();
  });

  // The case that motivates all of this: a 200 that no human visitor sees.
  it("flags a Cloudflare managed challenge even when it answers 200", () => {
    expect(check(200, { "cf-mitigated": "challenge" })).toBe("Cloudflare");
  });

  it("flags a Cloudflare interstitial behind a 403", () => {
    expect(check(403, { server: "cloudflare", "cf-ray": "8a1b2c3d4e5f" })).toBe("Cloudflare");
  });

  it("does not flag a site merely because Cloudflare fronts it", () => {
    expect(check(200, { server: "cloudflare", "cf-ray": "8a1b2c3d4e5f" })).toBeNull();
  });

  it("does not flag an ordinary 403 from a site with no WAF fingerprint", () => {
    expect(check(403, { server: "nginx" })).toBeNull();
  });

  it.each([
    ["DataDome", { "x-datadome": "protected" }],
    ["PerimeterX", { "x-px-block": "1" }],
    ["AWS WAF", { "x-amzn-waf-action": "captcha" }],
  ])("flags %s from its own header at any status", (vendor, hdrs) => {
    expect(check(200, hdrs)).toBe(vendor);
  });

  it.each([
    ["DDoS-Guard", { server: "ddos-guard" }],
    ["Sucuri", { "x-sucuri-id": "12345" }],
    ["Akamai", { server: "AkamaiGHost" }],
    ["Imperva", { "x-iinfo": "9-12345" }],
  ])("flags %s when the status also looks like a block", (vendor, hdrs) => {
    expect(check(403, hdrs)).toBe(vendor);
  });

  it("recognises a Google CAPTCHA interstitial by its URL", () => {
    expect(check(200, {}, "https://www.google.com/sorry/index?continue=https://x")).toBe(
      "reCAPTCHA",
    );
  });

  it("recognises a Cloudflare challenge platform URL", () => {
    expect(check(200, {}, "https://example.com/cdn-cgi/challenge-platform/h/b/orch")).toBe(
      "Cloudflare",
    );
  });

  it("recognises an hCaptcha interstitial", () => {
    expect(check(200, {}, "https://hcaptcha.com/challenge?site=x")).toBe("hCaptcha");
  });

  it("recognises a generic captcha path", () => {
    expect(check(200, {}, "https://example.com/captcha?next=/")).toBe("Captcha");
  });

  it("does not mistake an ordinary path that merely contains the word", () => {
    expect(check(200, {}, "https://example.com/blog/how-captchas-work")).toBeNull();
  });

  it("works without a final URL at all", () => {
    expect(check(200, {})).toBeNull();
  });
});

describe("detectChallengeInResponse", () => {
  it("reads status, headers and final URL off a real Response", () => {
    const res = new Response(null, {
      status: 403,
      headers: { server: "cloudflare", "cf-ray": "abc" },
    });
    Object.defineProperty(res, "url", { value: "https://example.com/" });

    expect(detectChallengeInResponse(res)).toBe("Cloudflare");
  });

  it("returns null for a clean response", () => {
    expect(detectChallengeInResponse(new Response(null, { status: 200 }))).toBeNull();
  });
});

describe("challengeCode", () => {
  it("gives Cloudflare its own marker", () => {
    expect(challengeCode("Cloudflare")).toBe("CLDF");
  });

  it("collapses every CAPTCHA flavour onto one marker", () => {
    expect(challengeCode("reCAPTCHA")).toBe("CPHC");
    expect(challengeCode("hCaptcha")).toBe("CPHC");
    expect(challengeCode("Captcha")).toBe("CPHC");
  });

  it("has a marker for every vendor the detector can return", () => {
    const vendors = [
      "Cloudflare", "reCAPTCHA", "hCaptcha", "DataDome", "PerimeterX",
      "Imperva", "Akamai", "AWS WAF", "Sucuri", "DDoS-Guard", "Captcha",
    ];
    for (const vendor of vendors) {
      expect(challengeCode(vendor)).not.toBe("BLOK");
    }
  });

  it("keeps every marker four characters wide so badges stay aligned", () => {
    expect(challengeCode("Cloudflare")).toHaveLength(4);
    expect(challengeCode("DDoS-Guard")).toHaveLength(4);
    expect(challengeCode("anything else")).toHaveLength(4);
  });

  it("falls back to a generic marker for a name it does not know", () => {
    // e.g. a record written by a newer version than the popup.
    expect(challengeCode("SomeNewWAF")).toBe("BLOK");
  });
});
