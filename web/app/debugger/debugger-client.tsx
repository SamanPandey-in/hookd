"use client";

import * as React from "react";
import Link from "next/link";
import { PROVIDERS } from "@/lib/types";
import type { Provider } from "@/lib/types";
import { providerLabel } from "@/lib/providers";
import { debugVerify, DebugError, type DebugVerifyResult } from "@/lib/debug";
import { FieldLabel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/states";
import { ProviderSelect } from "@/components/ui/provider-select";
import { SignatureVerifyPanel } from "@/components/inspector/signature-verify-panel";
import {
  signSample,
  headersToLines,
  parseHeaderLines,
} from "@/app/debugger/samples";

// F3 — the public, no-signup signature debugger. It OPENS ON A VERDICT
// (STANDOUT §3.3): on mount it auto-loads + verifies the Stripe sample so the
// result column shows a lime PASS immediately — no empty dashed form on first
// paint. Four "break it" chips then mutate the current input and re-verify,
// flipping the panel to a SPECIFIC cause (that is the demo GIF). Samples are
// signed client-side so they PASS; nothing you paste is stored.

// ---- Pure crypto / encoding / header helpers for the "break it" chips -------
// Mirror the Stripe scheme (the auto-loaded sample) exactly: HMAC-SHA256 over
// `t.body`, hex-encoded, in the `Stripe-Signature: t=…,v1=…` header.

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

function hexToBase64(hex: string): string {
  const clean = hex.length % 2 === 0 ? hex : hex.slice(0, -1);
  let s = "";
  for (let i = 0; i < clean.length; i += 2) {
    s += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  }
  return btoa(s);
}

function getHeaderValue(text: string, name: string): string | null {
  const lower = name.toLowerCase();
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    if (line.slice(0, idx).trim().toLowerCase() === lower) {
      return line.slice(idx + 1).trim();
    }
  }
  return null;
}

function setHeaderValue(text: string, name: string, value: string): string {
  const lower = name.toLowerCase();
  let found = false;
  const out = text.split(/\r?\n/).map((line) => {
    const idx = line.indexOf(":");
    if (idx > 0 && line.slice(0, idx).trim().toLowerCase() === lower) {
      found = true;
      return `${name}: ${value}`;
    }
    return line;
  });
  if (!found) out.push(`${name}: ${value}`);
  return out.join("\n");
}

interface VerifyFields {
  provider: Provider | "";
  secret: string;
  headersText: string;
  bodyText: string;
  urlText: string;
}

export function DebuggerClient() {
  const [provider, setProvider] = React.useState<Provider | "">("");
  const [secret, setSecret] = React.useState("");
  const [headersText, setHeadersText] = React.useState("");
  const [bodyText, setBodyText] = React.useState("");
  const [urlText, setUrlText] = React.useState("");
  const [result, setResult] = React.useState<DebugVerifyResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Start busy: the mount effect immediately auto-verifies the Stripe sample, so
  // the result column shows a "verifying" card (not the empty dashed box) on the
  // very first paint, then flips to the lime PASS (STANDOUT §3.3).
  const [busy, setBusy] = React.useState(true);

  // Twilio is the only scheme whose signature is URL-bound, so only it (and
  // auto-detect, which might resolve to it) needs the Request URL field.
  const showUrlField = provider === "twilio" || provider === "";

  // The result card renders far from the verify button on a tall form, so a
  // verdict could land off-screen (U-3). After a result arrives, scroll it into
  // view and move focus to it so the change is obvious — and announced (the
  // container is an aria-live region).
  const resultRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!result) return;
    const el = resultRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }, [result]);

  // Core verify path — takes EXPLICIT fields (never state) so the auto-run and
  // the "break it" chips can verify freshly mutated input without a state-timing
  // race. The one place the paste reaches the public verify engine.
  const verifyFields = React.useCallback(async (f: VerifyFields) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await debugVerify({
        provider: f.provider,
        secret: f.secret,
        headers: parseHeaderLines(f.headersText),
        body: f.bodyText,
        url: f.urlText,
      });
      setResult(res);
    } catch (e2) {
      setError(e2 instanceof DebugError ? e2.message : (e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const loadSample = React.useCallback(
    async (p: Provider, autoVerify = false) => {
      setError(null);
      if (!autoVerify) setResult(null);
      try {
        const s = await signSample(p);
        const nextHeaders = headersToLines(s.headers);
        setProvider(s.provider);
        setSecret(s.secret);
        setHeadersText(nextHeaders);
        setBodyText(s.body);
        setUrlText(s.url ?? "");
        if (autoVerify) {
          await verifyFields({
            provider: s.provider,
            secret: s.secret,
            headersText: nextHeaders,
            bodyText: s.body,
            urlText: s.url ?? "",
          });
        }
      } catch (e) {
        setError(`could not build sample (${String(e)})`);
        setBusy(false);
      }
    },
    [verifyFields],
  );

  // Open on a verdict: auto-load + verify the Stripe sample exactly once.
  const didInit = React.useRef(false);
  React.useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void loadSample("stripe", true);
  }, [loadSample]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    await verifyFields({ provider, secret, headersText, bodyText, urlText });
  };

  // ---- "break it" chips: mutate the CURRENT input + re-verify -------------
  // Each flips the panel to a specific cause. Tuned for the auto-loaded Stripe
  // sample (the demo); "wrong secret" and "re-serialize the body" are scheme-
  // agnostic, "make it stale" and "hex ↔ base64" act on the Stripe-Signature.

  const breakStale = async () => {
    // Re-sign with a timestamp ~400s in the past: the signature is valid for
    // that t, but t is outside tolerance → timestamp_out_of_tolerance.
    const t = Math.floor(Date.now() / 1000) - 400;
    const sig = await hmacSha256Hex(secret, `${t}.${bodyText}`);
    const nextHeaders = setHeaderValue(headersText, "Stripe-Signature", `t=${t},v1=${sig}`);
    setHeadersText(nextHeaders);
    await verifyFields({ provider, secret, headersText: nextHeaders, bodyText, urlText });
  };

  const breakSecret = async () => {
    // A secret the signature was not computed with → signature_mismatch.
    const nextSecret = secret ? `${secret}_rotated` : "whsec_wrong_secret";
    setSecret(nextSecret);
    await verifyFields({ provider, secret: nextSecret, headersText, bodyText, urlText });
  };

  const breakBody = async () => {
    // Re-serialize (pretty-print) the JSON: the raw bytes now differ from what
    // was signed → body_possibly_altered (whitespace differs). Falls back to a
    // trailing-space tweak for non-JSON bodies.
    let nextBody = bodyText;
    try {
      nextBody = JSON.stringify(JSON.parse(bodyText), null, 2);
    } catch {
      nextBody = `${bodyText} `;
    }
    if (nextBody === bodyText) nextBody = `${bodyText} `;
    setBodyText(nextBody);
    await verifyFields({ provider, secret, headersText, bodyText: nextBody, urlText });
  };

  const breakEncoding = async () => {
    // Re-encode the correct digest as base64 where hex is expected →
    // encoding_mismatch (the bytes are right, the encoding is wrong).
    const sig = getHeaderValue(headersText, "Stripe-Signature");
    let nextHeaders = headersText;
    const m = sig?.match(/v1=([0-9a-fA-F]+)/);
    if (sig && m) {
      const b64 = hexToBase64(m[1]);
      nextHeaders = setHeaderValue(
        headersText,
        "Stripe-Signature",
        sig.replace(/v1=[0-9a-fA-F]+/, `v1=${b64}`),
      );
    }
    setHeadersText(nextHeaders);
    await verifyFields({ provider, secret, headersText: nextHeaders, bodyText, urlText });
  };

  const CHIPS: { key: string; label: string; run: () => Promise<void> }[] = [
    { key: "stale", label: "make it stale", run: breakStale },
    { key: "secret", label: "wrong secret", run: breakSecret },
    { key: "body", label: "re-serialize the body", run: breakBody },
    { key: "encoding", label: "hex ↔ base64", run: breakEncoding },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(320px,420px)]">
      {/* Input column */}
      <form onSubmit={submit} className="flex flex-col gap-4">
        {/* Break-it chips — above the input (STANDOUT §3.3). Mutate what's
            loaded and re-verify to flip the verdict to a specific cause. */}
        <div className="flex flex-col gap-2">
          <FieldLabel>Break it</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map((c) => (
              <Button
                key={c.key}
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void c.run()}
              >
                {c.label}
              </Button>
            ))}
          </div>
          <p className="font-mono text-[11px] text-muted">
            tweak the signed request and watch the verdict flip to the exact
            reason — no guessing which part broke.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel>Load a sample</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {PROVIDERS.map((p) => (
              <Button
                key={p}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => loadSample(p)}
              >
                {providerLabel(p)}
              </Button>
            ))}
          </div>
          <p className="font-mono text-[11px] text-muted">
            samples are signed in your browser with a fresh timestamp, so they
            verify as PASS — then edit the body to watch it fail.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="debug-provider">
              <FieldLabel>Provider</FieldLabel>
            </label>
            <ProviderSelect id="debug-provider" value={provider} onChange={setProvider} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="debug-secret">
              <FieldLabel>Signing secret</FieldLabel>
            </label>
            <input
              id="debug-secret"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="whsec_… / app signing secret"
              className="h-9 min-w-0 rounded-sm border border-border bg-surface-hi px-3 font-mono text-xs text-text placeholder:text-muted focus-visible:outline-2"
            />
          </div>
        </div>

        {showUrlField && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="debug-url">
              <FieldLabel>Request URL (Twilio)</FieldLabel>
            </label>
            <input
              id="debug-url"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              placeholder="https://your-host/i/ep_… — the exact url the webhook was sent to"
              className="h-9 w-full rounded-sm border border-border bg-surface-hi px-3 font-mono text-xs text-text placeholder:text-muted focus-visible:outline-2"
            />
            <p className="font-mono text-[11px] text-muted">
              only twilio needs this — its signature is bound to the exact url it
              called. other providers ignore it.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="debug-headers">
            <FieldLabel>Headers (one key: value per line)</FieldLabel>
          </label>
          <textarea
            id="debug-headers"
            value={headersText}
            onChange={(e) => setHeadersText(e.target.value)}
            spellCheck={false}
            rows={6}
            placeholder={"Stripe-Signature: t=...,v1=...\nContent-Type: application/json"}
            className="w-full resize-y rounded-sm border border-border bg-surface-hi p-3 font-mono text-xs leading-relaxed text-text placeholder:text-muted focus-visible:outline-2"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="debug-body">
            <FieldLabel>Raw request body</FieldLabel>
          </label>
          <textarea
            id="debug-body"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            spellCheck={false}
            rows={10}
            placeholder='{"id":"evt_123","type":"checkout.session.completed"}'
            className="w-full resize-y rounded-sm border border-border bg-surface-hi p-3 font-mono text-xs leading-relaxed text-text placeholder:text-muted focus-visible:outline-2"
          />
        </div>

        <div>
          <Button type="submit" variant="primary" size="md" disabled={busy}>
            {busy ? "verifying" : "verify signature"}
          </Button>
        </div>

        {error && <ErrorBanner message={error} />}
      </form>

      {/* Result column */}
      <div
        ref={resultRef}
        tabIndex={-1}
        role="region"
        aria-label="verification result"
        aria-live="polite"
        className="flex flex-col gap-4 scroll-mt-20 focus-visible:outline-2 lg:sticky lg:top-20 lg:self-start"
      >
        {result ? (
          <>
            <SignatureVerifyPanel
              status={result.status}
              cause={result.cause}
              summary={result.summary}
              details={result.details}
              provider={result.provider}
              lockedWhy={false}
            />
            <div className="rounded-md border border-border bg-surface px-4 py-3">
              <p className="font-mono text-xs leading-relaxed text-muted">
                this is the exact verify engine behind hookd — nothing you paste
                is stored. get it on your live webhooks: capture, inspect,
                re-sign and replay.
              </p>
              <Link href="/login" className="mt-2 inline-block rounded-sm focus-visible:outline-2">
                <Button variant="primary" size="sm">
                  start free
                </Button>
              </Link>
            </div>
          </>
        ) : busy ? (
          <div className="rounded-md border border-border bg-surface px-4 py-10 text-center">
            <p className="font-mono text-xs leading-relaxed text-muted">
              verifying the signature…
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-surface px-4 py-10 text-center">
            <p className="font-mono text-xs leading-relaxed text-muted">
              load a sample or paste your own, then verify — the result shows
              here with the precise reason and a likely fix.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
