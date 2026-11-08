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

// F3 — the public, no-signup signature debugger. Paste a secret + the raw
// headers/body of a webhook and get back the exact verdict + WHY + Likely fix
// the paid inspector shows (SignatureVerifyPanel with lockedWhy=false). Samples
// are signed client-side so they PASS on load; edit the body to watch it FAIL.
// Nothing is stored — the backend endpoint is pure.

export function DebuggerClient() {
  const [provider, setProvider] = React.useState<Provider | "">("");
  const [secret, setSecret] = React.useState("");
  const [headersText, setHeadersText] = React.useState("");
  const [bodyText, setBodyText] = React.useState("");
  const [urlText, setUrlText] = React.useState("");
  const [result, setResult] = React.useState<DebugVerifyResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const loadSample = async (p: Provider) => {
    setError(null);
    setResult(null);
    try {
      const s = await signSample(p);
      setProvider(s.provider);
      setSecret(s.secret);
      setHeadersText(headersToLines(s.headers));
      setBodyText(s.body);
      setUrlText(s.url ?? "");
    } catch (e) {
      setError(`could not build sample (${String(e)})`);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await debugVerify({
        provider,
        secret,
        headers: parseHeaderLines(headersText),
        body: bodyText,
        url: urlText,
      });
      setResult(res);
    } catch (e2) {
      setError(
        e2 instanceof DebugError ? e2.message : (e2 as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(320px,420px)]">
      {/* Input column */}
      <form onSubmit={submit} className="flex flex-col gap-4">
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
      <div className="flex flex-col gap-4">
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
