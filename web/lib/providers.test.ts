import { describe, it, expect } from "vitest";
import { CAUSE_FIX, fixForCause } from "./providers";
import type { VerifyCause } from "./types";

// Every non-"ok" cause must yield an actionable fix (F1, IMPR_PLAN §6.F1), and
// the three detail-driven causes must interpolate the backend `details` values.

const NON_OK_CAUSES: Exclude<VerifyCause, "" | "ok">[] = [
  "no_signature_header",
  "malformed_signature_header",
  "missing_secret",
  "signature_mismatch",
  "timestamp_out_of_tolerance",
  "encoding_mismatch",
  "body_possibly_altered",
  "unsupported_provider",
];

describe("CAUSE_FIX", () => {
  it("has an entry for every non-ok cause and each yields a non-empty fix", () => {
    for (const cause of NON_OK_CAUSES) {
      const fn = CAUSE_FIX[cause];
      expect(fn, `missing fix for ${cause}`).toBeTypeOf("function");
      const text = fn(undefined, "stripe");
      expect(text.trim().length, `empty fix for ${cause}`).toBeGreaterThan(0);
    }
  });
});

describe("fixForCause", () => {
  it("returns empty for ok / unknown / missing causes", () => {
    expect(fixForCause("ok")).toBe("");
    expect(fixForCause("")).toBe("");
    expect(fixForCause(undefined)).toBe("");
  });

  it("returns a non-empty fix for every non-ok cause", () => {
    for (const cause of NON_OK_CAUSES) {
      expect(fixForCause(cause, undefined, "stripe").length).toBeGreaterThan(0);
    }
  });

  it("interpolates timestamp skew + tolerance from details", () => {
    const text = fixForCause(
      "timestamp_out_of_tolerance",
      { skew_seconds: "340", tolerance_seconds: "300" },
      "stripe",
    );
    expect(text).toContain("340s");
    expect(text).toContain("300s");
    expect(text).toContain("Stripe");
  });

  it("names the wrong encoding vs the provider's expected encoding", () => {
    // Shopify expects base64; details.encoding carries the canonical encoding.
    const text = fixForCause(
      "encoding_mismatch",
      { encoding: "base64", computed_other_encoding: "ab12cd" },
      "shopify",
    );
    expect(text).toContain("hex"); // the wrong encoding the user actually used
    expect(text).toContain("base64"); // what Shopify expects
    expect(text).toContain("Shopify");
  });

  it("interpolates the received→reencoded body lengths for body_possibly_altered", () => {
    const text = fixForCause("body_possibly_altered", {
      received_body_len: "512",
      reencoded_body_len: "518",
    });
    expect(text).toContain("512");
    expect(text).toContain("518");
    expect(text.toLowerCase()).toContain("raw");
  });

  it("degrades gracefully when details are absent", () => {
    const text = fixForCause("timestamp_out_of_tolerance", undefined, "stripe");
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("300s"); // default tolerance
  });
});
