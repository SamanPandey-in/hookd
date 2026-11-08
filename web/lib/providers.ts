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
  twilio: { label: "Twilio", signatureHeader: "X-Twilio-Signature" },
  vercel: { label: "Vercel", signatureHeader: "x-vercel-signature" },
  lemon_squeezy: { label: "Lemon Squeezy", signatureHeader: "X-Signature" },
  twitch: {
    label: "Twitch",
    signatureHeader: "Twitch-Eventsub-Message-Signature",
  },
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
    "x-twilio-signature",
    "x-vercel-signature",
    "x-signature",
    "twitch-eventsub-message-signature",
    "twitch-eventsub-message-id",
    "twitch-eventsub-message-timestamp",
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

// F1 — Fix-it guidance (IMPR_PLAN §6.F1). CAUSE_HINT says *what* failed; this
// says *how to fix it*, specialized by the backend's `details` map
// (skew_seconds, tolerance_seconds, encoding, computed_other_encoding,
// received_body_len, reencoded_body_len) and the provider. Rendered as ONE
// quiet "Likely fix →" line under the WHY, only on FAIL/UNVERIFIED and only when
// the WHY is unlocked. Each entry returns a non-empty, actionable string.

type Details = Record<string, string> | null | undefined;

/** The canonical signature encoding each provider expects, for the
 *  encoding_mismatch fix (Shopify=base64, the rest=hex). */
const PROVIDER_ENCODING: Partial<Record<Provider, "hex" | "base64">> = {
  stripe: "hex",
  github: "hex",
  razorpay: "hex",
  shopify: "base64",
  slack: "hex",
  standard_webhooks: "base64",
  twilio: "base64", // base64 HMAC-SHA1 over the URL
  vercel: "hex", // hex HMAC-SHA1 over the raw body
  lemon_squeezy: "hex", // hex HMAC-SHA256 over the raw body
  twitch: "hex", // hex HMAC-SHA256 over id+timestamp+body, "sha256=" prefix
};

const d = (det: Details, k: string): string | undefined => {
  const v = det?.[k];
  return v && v.length > 0 ? v : undefined;
};

/** Who to name in a fix line — the provider label, or a neutral fallback. */
function fixWho(provider?: Provider | ""): string {
  return provider ? providerLabel(provider) : "this provider";
}

export const CAUSE_FIX: Record<
  Exclude<VerifyCause, "" | "ok">,
  (details?: Details, provider?: Provider | "") => string
> = {
  no_signature_header: (_det, provider) =>
    `no signature header on the request — confirm the sender is ${fixWho(
      provider,
    )} and that your proxy or framework isn't stripping the signature header before hookd sees it.`,

  malformed_signature_header: (_det, provider) =>
    `the signature header is present but malformed — check you're forwarding the ${fixWho(
      provider,
    )} signature header verbatim (no truncation, re-casing or re-joining of its parts).`,

  missing_secret: () =>
    "no signing secret set for this endpoint — add it in Settings so hookd can verify.",

  signature_mismatch: (_det, provider) =>
    provider === "twilio"
      ? "twilio binds the signature to the exact url it was configured to call (scheme + host + path + query), so it only verifies when the url hookd received on matches what twilio sent to — a proxy that rewrites the host or path breaks it. confirm that url matches your twilio webhook config, and that the auth token is current."
      : "computed ≠ provided with the current secret — the secret is wrong or rotated, or you're signing a different body than what was actually sent.",

  timestamp_out_of_tolerance: (det, provider) => {
    const skew = d(det, "skew_seconds");
    const tol = d(det, "tolerance_seconds") ?? "300";
    const age = skew ? `${skew}s old` : "outside the tolerance window";
    return `event is ${age}; ${fixWho(
      provider,
    )} tolerates ${tol}s — you're verifying a stale or replayed event, or this machine's clock is off. Re-send the event, or widen the tolerance only if you understand the replay risk.`;
  },

  encoding_mismatch: (det, provider) => {
    // `encoding` is the canonical encoding the provider expects (backend always
    // sets it for this cause); fall back to the per-provider default.
    const expected = d(det, "encoding") ?? PROVIDER_ENCODING[provider as Provider];
    const wrong = expected === "base64" ? "hex" : "base64";
    const expectedTxt = expected ?? "its canonical encoding";
    return `the digest is correct but encoded as ${wrong}; ${fixWho(
      provider,
    )} expects ${expectedTxt}. Decode/encode accordingly (Shopify, Standard Webhooks & Twilio = base64; Stripe, GitHub, Razorpay, Slack, Vercel, Lemon Squeezy & Twitch = hex).`;
  },

  body_possibly_altered: (det) => {
    const from = d(det, "received_body_len");
    const to = d(det, "reencoded_body_len");
    const delta = from && to ? ` (${from}→${to} bytes)` : "";
    return `a middleware re-serialized the JSON before your verifier saw it${delta}. Verify the raw request body, before any body parser touches it.`;
  },

  unsupported_provider: () =>
    "no verifier for this provider — pick a supported provider in Settings, or verify this signature scheme yourself.",
};

/** Resolve the "Likely fix →" line for a failed/unverified result. Returns ""
 *  for ok / unknown causes so the caller can omit the line entirely. */
export function fixForCause(
  cause: VerifyCause | undefined,
  details?: Details,
  provider?: Provider | "",
): string {
  if (!cause || cause === "ok") return "";
  const fn = CAUSE_FIX[cause as Exclude<VerifyCause, "" | "ok">];
  return fn ? fn(details, provider) : "";
}
