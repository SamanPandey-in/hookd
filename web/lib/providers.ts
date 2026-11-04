import type { Provider, VerifyCause } from "./types";

/** Display metadata per provider. Labels are what a developer actually calls
 *  these, and the signature header is pinned/highlighted in the headers table. */
export const PROVIDER_META: Record<
  Provider,
  { label: string; signatureHeader: string }
> = {
  stripe: { label: "Stripe", signatureHeader: "Stripe-Signature" },
  github: { label: "GitHub", signatureHeader: "X-Hub-Signature-256" },
  razorpay: { label: "Razorpay", signatureHeader: "X-Razorpay-Signature" },
  shopify: { label: "Shopify", signatureHeader: "X-Shopify-Hmac-Sha256" },
  standard_webhooks: {
    label: "Standard Webhooks",
    signatureHeader: "Webhook-Signature",
  },
  slack: { label: "Slack", signatureHeader: "X-Slack-Signature" },
};

export function providerLabel(p: Provider | "" | undefined): string {
  if (!p) return "auto-detect";
  return PROVIDER_META[p]?.label ?? p;
}

/** The set of header names (lowercased) that carry a signature and should be
 *  pinned to the top of the headers table and highlighted. */
export const SIGNATURE_HEADERS = new Set(
  [
    "stripe-signature",
    "x-hub-signature-256",
    "x-hub-signature",
    "x-razorpay-signature",
    "x-shopify-hmac-sha256",
    "webhook-signature",
    "webhook-id",
    "webhook-timestamp",
    "x-slack-signature",
    "x-slack-request-timestamp",
  ].map((s) => s.toLowerCase()),
);

/** One-line, human explanation of a verify cause for the UI, independent of the
 *  server Summary (which is more specific when present). */
export const CAUSE_HINT: Record<Exclude<VerifyCause, "">, string> = {
  ok: "signature genuinely validated",
  no_signature_header: "no signature header on the request",
  malformed_signature_header: "signature header is malformed",
  missing_secret: "no signing secret configured for this endpoint",
  signature_mismatch: "computed signature does not match the header",
  timestamp_out_of_tolerance: "timestamp is outside the tolerance window",
  encoding_mismatch: "signature encoding does not match (e.g. base64 vs hex)",
  body_possibly_altered:
    "body appears re-serialized — verify against the raw bytes",
  unsupported_provider: "no verifier for this provider",
};
