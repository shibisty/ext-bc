/**
 * Bot-protection and CAPTCHA interstitials.
 *
 * A status code alone can be a lie: Cloudflare's managed challenge answers 200
 * with a "Just a moment…" page, Google serves its CAPTCHA from /sorry/, and
 * several WAFs return a perfectly ordinary-looking response that no human
 * visitor would ever see. Those need flagging separately from a real 200.
 *
 * Detection is deliberately limited to what a HEAD request already tells us —
 * response headers, status and the final URL after redirects — so nothing here
 * costs an extra request or downloads a page body.
 */

/** Recognised vendor, shown verbatim in the UI (no translation needed). */
export type ChallengeVendor =
  | "Cloudflare"
  | "reCAPTCHA"
  | "hCaptcha"
  | "DataDome"
  | "PerimeterX"
  | "Imperva"
  | "Akamai"
  | "AWS WAF"
  | "Sucuri"
  | "DDoS-Guard"
  | "Captcha";

/**
 * Four-letter code shown on the badge in place of the HTTP status, because the
 * status itself would be misleading. Fixed width so the badges stay aligned.
 */
const VENDOR_CODES: Record<ChallengeVendor, string> = {
  Cloudflare: "CLDF",
  reCAPTCHA: "CPHC",
  hCaptcha: "CPHC",
  Captcha: "CPHC",
  DataDome: "DDOM",
  PerimeterX: "PRMX",
  Imperva: "IMPV",
  Akamai: "AKAM",
  "AWS WAF": "AWAF",
  Sucuri: "SCRI",
  "DDoS-Guard": "DDGD",
};

/**
 * The badge code for a stored vendor name. Unknown values (an older record, a
 * vendor added in a newer version) fall back to a generic marker rather than
 * showing a status code that cannot be trusted.
 */
export function challengeCode(vendor: string): string {
  return VENDOR_CODES[vendor as ChallengeVendor] ?? "BLOK";
}

/** Statuses a challenge typically hides behind. */
const CHALLENGE_STATUSES = new Set([401, 403, 405, 429, 503]);

/** Path fragments that only appear on interstitials, not on real content. */
const CHALLENGE_URL_PATTERNS: [RegExp, ChallengeVendor][] = [
  [/\/cdn-cgi\/(challenge-platform|l\/chk_jschl)/i, "Cloudflare"],
  [/[?&]__cf_chl/i, "Cloudflare"],
  [/\/sorry\/index/i, "reCAPTCHA"],
  [/\/recaptcha\//i, "reCAPTCHA"],
  [/\bhcaptcha\.com\//i, "hCaptcha"],
  [/\/(captcha|challenge)(\/|\?|$)/i, "Captcha"],
];

export interface ChallengeInput {
  status: number;
  /** Final URL after redirects, when the platform reports one. */
  url?: string | undefined;
  header: (name: string) => string | null;
}

/**
 * Returns the vendor blocking the request, or null when the response looks
 * like it really came from the site.
 */
export function detectChallenge(input: ChallengeInput): ChallengeVendor | null {
  const { status, header } = input;
  const suspiciousStatus = CHALLENGE_STATUSES.has(status);

  // Cloudflare states the mitigation outright — trustworthy at any status.
  if (header("cf-mitigated")) return "Cloudflare";

  // Vendor-specific headers that only appear when their WAF answers for the site.
  if (header("x-datadome") || header("x-datadome-cid")) return "DataDome";
  if (header("x-px-block") || header("x-px-action")) return "PerimeterX";
  if (header("x-amzn-waf-action")) return "AWS WAF";

  if (suspiciousStatus) {
    const server = (header("server") ?? "").toLowerCase();
    if (server.includes("cloudflare") || header("cf-ray")) return "Cloudflare";
    if (server.includes("ddos-guard")) return "DDoS-Guard";
    if (server.includes("sucuri") || header("x-sucuri-id")) return "Sucuri";
    if (server.includes("akamai") || header("x-akamai-request-id")) return "Akamai";
    if (header("x-iinfo") || header("x-cdn") === "Incapsula") return "Imperva";
  }

  // Landed on an interstitial rather than the page that was asked for.
  if (input.url) {
    for (const [pattern, vendor] of CHALLENGE_URL_PATTERNS) {
      if (pattern.test(input.url)) return vendor;
    }
  }

  return null;
}

/** Adapter for a real `Response`. */
export function detectChallengeInResponse(res: Response): ChallengeVendor | null {
  return detectChallenge({
    status: res.status,
    url: res.url || undefined,
    header: (name) => res.headers.get(name),
  });
}
