// Shared diagnosis-card renderer + the pure helpers that feed it (STANDOUT
// §3.1, §3.2). ONE component, two uses: the /og/diagnosis image route and the
// per-share-link OG card both render DiagnosisCard at 1200×630.
//
// This module is deliberately free of `next/og` and `node:fs` so it is safe to
// import from BOTH server routes AND the client verify panel (which only pulls
// the pure URL/text builders). DiagnosisCard returns a plain React element tree
// that a caller wraps in `new ImageResponse(...)` — it never imports Satori.
//
// SECURITY: the card is built ONLY from non-secret verdict fields. The query it
// emits and reads carries provider/status/cause/summary + a 2–3 key whitelist of
// non-secret details + a timestamp. It NEVER accepts or renders body, secret,
// headers or url — see buildDiagnosisParams / parseDiagnosisParams.

import * as React from "react";
import { fixForCause, providerLabel, CAUSE_HINT } from "@/lib/providers";
import type { Provider, VerifyCause, VerifyStatus } from "@/lib/types";

// DESIGN.md "Graphite & Signal" tokens (dark), matched exactly.
export const OG_COLORS = {
  bg: "#0B0D0F",
  surface: "#14171A",
  border: "#262B30",
  text: "#E6E9ED",
  muted: "#8B949E",
  lime: "#B8FF2E", // reserved: verify-PASS / arrival only
  fail: "#FF5C5C",
  warn: "#FFB224",
} as const;

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** The ONLY `details` keys the card will carry — all non-secret. Anything else
 *  (and body/secret/headers/url) is never read or emitted. */
export const DIAGNOSIS_DETAIL_KEYS = [
  "skew_seconds",
  "tolerance_seconds",
  "encoding",
] as const;

/** The non-secret verdict shape both the URL builder and the card consume. */
export interface DiagnosisResult {
  status: VerifyStatus;
  provider?: Provider | "";
  cause: VerifyCause;
  summary: string;
  details?: Record<string, string> | null;
}

/** Keys that must NEVER appear in a diagnosis URL/tweet. Exported so the test can
 *  assert against the exact list. */
export const FORBIDDEN_PARAM_KEYS = [
  "secret",
  "body",
  "headers",
  "header",
  "url",
] as const;

/**
 * Build the query params for a diagnosis card from a verify result. Reads ONLY
 * the non-secret verdict fields + the whitelisted detail keys; there is no code
 * path by which a secret, body, header or url can enter the output.
 */
export function buildDiagnosisParams(result: DiagnosisResult): Record<string, string> {
  const p: Record<string, string> = {};
  if (result.status) p.status = result.status;
  if (result.provider) p.provider = result.provider;
  if (result.cause) p.cause = result.cause;
  if (result.summary) p.summary = result.summary;
  for (const k of DIAGNOSIS_DETAIL_KEYS) {
    const v = result.details?.[k];
    if (v) p[k] = v;
  }
  p.ts = String(Date.now());
  return p;
}

/** Parse diagnosis-card query params back into card props. Reads ONLY the known
 *  non-secret keys — any body/secret/header/url param is ignored by omission. */
export function parseDiagnosisParams(sp: URLSearchParams): DiagnosisCardProps {
  const details: Record<string, string> = {};
  for (const k of DIAGNOSIS_DETAIL_KEYS) {
    const v = sp.get(k);
    if (v) details[k] = v;
  }
  const status = (sp.get("status") || "fail") as VerifyStatus;
  return {
    status: status === "pass" || status === "fail" || status === "unknown" ? status : "fail",
    provider: (sp.get("provider") || "") as Provider | "",
    cause: (sp.get("cause") || "") as VerifyCause,
    summary: sp.get("summary") || "",
    details,
    ts: sp.get("ts") || "",
  };
}

/** Absolute (or origin-relative) URL of the diagnosis card image. */
export function buildDiagnosisPath(result: DiagnosisResult, origin = ""): string {
  const qs = new URLSearchParams(buildDiagnosisParams(result)).toString();
  return `${origin}/og/diagnosis?${qs}`;
}

/** The prefilled tweet text — lowercase house voice, no secrets. Mirrors the
 *  STANDOUT example: `stripe said "…". hookd said: timestamp skew 612s > 300s.` */
export function buildTweetText(result: DiagnosisResult): string {
  const name = result.provider ? providerLabel(result.provider).toLowerCase() : "the provider";
  const why =
    result.summary ||
    (result.cause && result.cause !== "ok"
      ? CAUSE_HINT[result.cause as Exclude<VerifyCause, "">]
      : "") ||
    "the signature didn't verify";
  return `${name} said the webhook signature failed, nothing more. hookd said: ${why}`;
}

/** Open an X intent prefilled with the tweet text + the diagnosis card link.
 *  Uses the current x.com/intent/post endpoint. Never carries a secret/body. */
export function buildShareIntentHref(result: DiagnosisResult, origin = ""): string {
  const text = buildTweetText(result);
  const url = buildDiagnosisPath(result, origin);
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export interface DiagnosisCardProps {
  status: VerifyStatus;
  provider?: Provider | "";
  cause: VerifyCause;
  summary: string;
  details?: Record<string, string> | null;
  /** Optional capture/diagnosis timestamp (epoch ms string) for the footer. */
  ts?: string;
}

/** Small inline marks — drawn as SVG paths (not the ✓/✕ glyphs) so the image
 *  never triggers a dynamic font fetch for a glyph Commit Mono may not ship. */
function Check({ color }: { color: string }) {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12.5l5 5L20 6" />
    </svg>
  );
}
function Cross({ color }: { color: string }) {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function fmtTs(ts?: string): string {
  if (!ts) return "";
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "";
  // Compact UTC stamp, mono-friendly.
  return new Date(n).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

/**
 * The signature-verify look at 1200×630, matching SignatureVerifyPanel: a
 * colored left rule (lime PASS / coral FAIL), the `✓ VERIFIED` / `✕ FAILED`
 * headline, the one-line why, the likely-fix line (fail only) and
 * `hookd.dev/debugger` bottom-right. Pure JSX; the caller supplies fonts.
 */
export function DiagnosisCard(props: DiagnosisCardProps) {
  const { status, provider = "", cause, summary, details, ts } = props;
  const pass = status === "pass";
  const fail = status === "fail";
  const tone = pass ? OG_COLORS.lime : fail ? OG_COLORS.fail : OG_COLORS.muted;
  const headline = pass ? "VERIFIED" : fail ? "FAILED" : "UNVERIFIED";

  const why =
    summary ||
    (cause && cause !== "ok" ? CAUSE_HINT[cause as Exclude<VerifyCause, "">] : "") ||
    "";
  const fix = !pass ? fixForCause(cause, details, provider) : "";

  const detailEntries = DIAGNOSIS_DETAIL_KEYS.map((k) => [k, details?.[k]] as const).filter(
    ([, v]) => v,
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: OG_COLORS.bg,
        padding: "64px 72px",
        fontFamily: "Commit Mono",
        color: OG_COLORS.text,
        backgroundImage: `linear-gradient(to right, ${OG_COLORS.border}44 1px, transparent 1px), linear-gradient(to bottom, ${OG_COLORS.border}44 1px, transparent 1px)`,
        backgroundSize: "48px 48px",
      }}
    >
      {/* wordmark + provider */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 30,
              height: 30,
              background: OG_COLORS.lime,
              borderRadius: 5,
              transform: "rotate(45deg)",
            }}
          />
          <div style={{ fontSize: 38, fontWeight: 600, color: OG_COLORS.text, letterSpacing: -1 }}>
            hookd
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 24, color: OG_COLORS.muted }}>
          provider: {providerLabel(provider)}
        </div>
      </div>

      {/* the verify card */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          background: OG_COLORS.surface,
          border: `1px solid ${OG_COLORS.border}`,
          borderLeft: `6px solid ${tone}`,
          borderRadius: 8,
          padding: "36px 40px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 2, color: OG_COLORS.muted }}>
            SIGNATURE
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, color: tone }}>
            {pass ? <Check color={tone} /> : <Cross color={tone} />}
            <div style={{ display: "flex", fontSize: 46, fontWeight: 600 }}>{headline}</div>
          </div>
        </div>

        {why ? (
          <div style={{ display: "flex", fontSize: 34, lineHeight: 1.3, color: OG_COLORS.text }}>
            {why}
          </div>
        ) : null}

        {fix ? (
          <div style={{ display: "flex", fontSize: 24, lineHeight: 1.35, color: OG_COLORS.muted }}>
            likely fix: {fix}
          </div>
        ) : null}

        {detailEntries.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 28px" }}>
            {detailEntries.map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 10, fontSize: 22, color: OG_COLORS.muted }}>
                <span style={{ color: OG_COLORS.muted }}>{k}</span>
                <span style={{ color: OG_COLORS.text }}>{v}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 22, color: OG_COLORS.muted }}>{fmtTs(ts)}</div>
        <div style={{ display: "flex", fontSize: 26, color: OG_COLORS.text }}>hookd.dev/debugger</div>
      </div>
    </div>
  );
}
