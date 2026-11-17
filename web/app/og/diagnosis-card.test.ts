import { describe, it, expect } from "vitest";
import {
  buildDiagnosisParams,
  parseDiagnosisParams,
  buildDiagnosisPath,
  buildTweetText,
  buildShareIntentHref,
  DIAGNOSIS_DETAIL_KEYS,
  FORBIDDEN_PARAM_KEYS,
  type DiagnosisResult,
} from "./diagnosis-card";

// The diagnosis card and the share-on-X path must NEVER carry a secret, body or
// headers. These assertions are the guardrail: whatever extra fields are smuggled
// onto a result, only the non-secret whitelist can ever reach the URL or tweet.

// A result carrying secret/body/header fields it must never leak. Cast through
// unknown so the test can prove the builder ignores non-whitelisted keys.
const dirty = {
  status: "fail",
  provider: "stripe",
  cause: "timestamp_out_of_tolerance",
  summary: "timestamp skew 612s > 300s tolerance",
  details: {
    skew_seconds: "612",
    tolerance_seconds: "300",
    encoding: "hex",
    // Non-whitelisted detail keys that must be dropped:
    computed_other_encoding: "deadbeef",
    received_body_len: "512",
  },
  // Fields that must NEVER be emitted:
  secret: "whsec_SUPER_SECRET_value",
  body: '{"card":"4242424242424242"}',
  headers: { "Stripe-Signature": "t=1,v1=deadbeef" },
  url: "https://host/i/ep_private",
} as unknown as DiagnosisResult;

const SECRET_SUBSTRINGS = [
  "whsec_SUPER_SECRET_value",
  "4242424242424242",
  "deadbeef",
  "ep_private",
];

describe("buildDiagnosisParams", () => {
  it("emits only whitelisted, non-secret keys", () => {
    const p = buildDiagnosisParams(dirty);
    const allowed = new Set([
      "status",
      "provider",
      "cause",
      "summary",
      "ts",
      ...DIAGNOSIS_DETAIL_KEYS,
    ]);
    for (const key of Object.keys(p)) {
      expect(allowed.has(key), `unexpected param key: ${key}`).toBe(true);
    }
    for (const forbidden of FORBIDDEN_PARAM_KEYS) {
      expect(forbidden in p).toBe(false);
    }
  });

  it("carries the whitelisted details but drops non-whitelisted ones", () => {
    const p = buildDiagnosisParams(dirty);
    expect(p.skew_seconds).toBe("612");
    expect(p.tolerance_seconds).toBe("300");
    expect(p.encoding).toBe("hex");
    expect(p.computed_other_encoding).toBeUndefined();
    expect(p.received_body_len).toBeUndefined();
  });

  it("never leaks any secret/body/header/url value", () => {
    const serialized = JSON.stringify(buildDiagnosisParams(dirty));
    for (const s of SECRET_SUBSTRINGS) {
      expect(serialized.includes(s), `leaked ${s}`).toBe(false);
    }
  });
});

describe("buildDiagnosisPath / buildShareIntentHref / buildTweetText", () => {
  it("path points at /og/diagnosis and carries no secret", () => {
    const path = buildDiagnosisPath(dirty, "https://hookd.dev");
    expect(path.startsWith("https://hookd.dev/og/diagnosis?")).toBe(true);
    for (const s of SECRET_SUBSTRINGS) {
      expect(path.includes(s), `leaked ${s} in path`).toBe(false);
    }
  });

  it("share intent hits x.com and leaks no secret/body", () => {
    const href = buildShareIntentHref(dirty, "https://hookd.dev");
    expect(href.startsWith("https://x.com/intent/post?")).toBe(true);
    for (const s of SECRET_SUBSTRINGS) {
      expect(href.includes(s), `leaked ${s} in intent`).toBe(false);
      expect(decodeURIComponent(href).includes(s), `leaked ${s} decoded`).toBe(false);
    }
  });

  it("tweet text is lowercase house voice naming the provider + why", () => {
    const text = buildTweetText(dirty);
    expect(text).toContain("stripe");
    expect(text).toContain("hookd said:");
    expect(text).toContain("timestamp skew 612s > 300s tolerance");
  });
});

describe("parseDiagnosisParams", () => {
  it("round-trips the non-secret fields and ignores smuggled secret params", () => {
    const sp = new URLSearchParams({
      status: "fail",
      provider: "stripe",
      cause: "timestamp_out_of_tolerance",
      summary: "skew too large",
      skew_seconds: "612",
      tolerance_seconds: "300",
      // smuggled — must be ignored:
      secret: "whsec_leak",
      body: "{}",
      url: "https://host",
    });
    const props = parseDiagnosisParams(sp);
    expect(props.status).toBe("fail");
    expect(props.provider).toBe("stripe");
    expect(props.cause).toBe("timestamp_out_of_tolerance");
    expect(props.details?.skew_seconds).toBe("612");
    // No secret/body/url surface on the parsed props.
    const serialized = JSON.stringify(props);
    expect(serialized.includes("whsec_leak")).toBe(false);
    expect(serialized.includes("https://host")).toBe(false);
  });

  it("defaults an unknown status to fail", () => {
    expect(parseDiagnosisParams(new URLSearchParams()).status).toBe("fail");
    expect(parseDiagnosisParams(new URLSearchParams({ status: "bogus" })).status).toBe("fail");
  });
});
