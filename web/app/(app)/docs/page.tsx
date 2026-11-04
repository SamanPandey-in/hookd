"use client";

import * as React from "react";
import { API_URL } from "@/lib/api";
import { Panel, FieldLabel } from "@/components/ui/panel";
import { CopyField } from "@/components/ui/copy-field";

// Getting started (DESIGN §5.2 docs, §9 voice). Terse, specific, mono-heavy —
// not a wall. Five steps that match how the product actually works: point →
// inspect → verify → replay → api. Each step carries a mono flow kicker, the
// honest numbering the product earns because it genuinely is a sequence.

const EXAMPLE_ID = "evt_7fa2c1";
const exampleIngest = `${API_URL}/i/${EXAMPLE_ID}`;
const curlSend = `curl ${API_URL}/i/${EXAMPLE_ID} \\
  -H "Content-Type: application/json" \\
  -d '{"hello":"webhook"}'`;
const curlApi = `curl ${API_URL}/api/endpoints \\
  -H "Authorization: Bearer whk_your_key_here"`;
const curlEvents = `curl ${API_URL}/api/endpoints/${EXAMPLE_ID}/events \\
  -H "Authorization: Bearer whk_your_key_here"`;

export default function DocsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-sans text-xl font-semibold tracking-tight text-text">
          getting started
        </h1>
        <p className="text-sm text-muted">
          capture, inspect, verify and replay webhooks. five steps, start to
          first replay.
        </p>
      </div>

      <DocSection n="01" kicker="point" title="point a webhook here">
        <p className={prose}>
          every endpoint has a stable ingest url. put it in your provider&rsquo;s
          webhook settings — stripe, razorpay, github, anything that POSTs — and
          requests land in the inspector live.
        </p>
        <CopyField value={exampleIngest} display={`/i/${EXAMPLE_ID}`} label="copy ingest url" />
        <p className={hint}>
          test it from your terminal — the request shows up instantly:
        </p>
        <Code>{curlSend}</Code>
      </DocSection>

      <DocSection n="02" kicker="inspect" title="read the inspector">
        <p className={prose}>
          the stream (left) lists requests newest-first; new ones slide in with a
          live pulse. click a row to open the detail pane (right):
        </p>
        <ul className={list}>
          <li>
            <Mono>headers</Mono> — exact order and duplicates preserved, signature
            headers pinned at the top.
          </li>
          <li>
            <Mono>body</Mono> — pretty JSON, line numbers, copy-path on hover, or
            the raw bytes.
          </li>
          <li>
            <Mono>attempts</Mono> — every replay with its status, latency and
            timestamp.
          </li>
        </ul>
        <p className={hint}>
          <Mono>j</Mono> / <Mono>k</Mono> move through the stream, <Mono>r</Mono>{" "}
          replays, <Mono>⌘K</Mono> opens the command palette.
        </p>
      </DocSection>

      <DocSection n="03" kicker="verify" title="verify a signature">
        <p className={prose}>
          set the provider and signing secret on the endpoint&rsquo;s settings.
          we recompute the signature on every captured request and tell you{" "}
          <Mono>pass</Mono> or <Mono>fail</Mono> — with the reason, not just a
          red dot.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Example label="pass">
            scheme v1 · HMAC-SHA256 · timestamp within 300s tolerance.
          </Example>
          <Example label="fail">
            signature_mismatch — body bytes differ from what was signed.
          </Example>
        </div>
      </DocSection>

      <DocSection n="04" kicker="replay" title="replay, re-signed">
        <p className={prose}>
          replay any captured request to a target url — your local tunnel, a
          staging host, wherever. opt into <Mono>re-sign</Mono> and we mint a
          fresh signature with a current timestamp from your signing secret, so
          the receiver verifies it as genuine instead of rejecting a stale skew.
        </p>
        <p className={hint}>
          the response status, latency and body are recorded under{" "}
          <Mono>attempts</Mono>.
        </p>
      </DocSection>

      <DocSection n="05" kicker="api" title="use the api">
        <p className={prose}>
          create a key under{" "}
          <Mono>settings → api keys</Mono>. the full key is shown once — send it
          as a bearer token (or <Mono>X-API-Key</Mono>) on any route.
        </p>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>list your endpoints</FieldLabel>
          <Code>{curlApi}</Code>
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>read an endpoint&rsquo;s events</FieldLabel>
          <Code>{curlEvents}</Code>
        </div>
      </DocSection>
    </div>
  );
}

const prose = "font-sans text-sm leading-relaxed text-muted";
const hint = "font-mono text-[11px] leading-relaxed text-muted";
const list = "flex flex-col gap-1.5 font-sans text-sm leading-relaxed text-muted";

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[0.95em] text-text">{children}</span>;
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-sm border border-border bg-surface-hi p-3 font-mono text-xs leading-relaxed text-text">
      <code>{children}</code>
    </pre>
  );
}

/** A tiny pass/fail illustration. Carries the status-trio color as a left rule
 *  only — the one sanctioned place (verify) the accent is allowed to appear. */
function Example({
  label,
  children,
}: {
  label: "pass" | "fail";
  children: React.ReactNode;
}) {
  const color = label === "pass" ? "var(--pass)" : "var(--fail)";
  return (
    <div
      className="flex flex-col gap-1 rounded-sm border border-border bg-surface-hi p-3"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      <span
        className="font-mono text-[11px] font-medium uppercase tracking-[0.08em]"
        style={{ color }}
      >
        {label === "pass" ? "✓ verified" : "✕ failed"}
      </span>
      <span className="font-mono text-[11px] leading-relaxed text-muted">
        {children}
      </span>
    </div>
  );
}

function DocSection({
  n,
  kicker,
  title,
  children,
}: {
  n: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Panel className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-[1px]"
          style={{ background: "var(--accent)" }}
        />
        <span className="font-mono text-[11px] text-muted">
          {n} / {kicker}
        </span>
      </div>
      <h2 className="font-sans text-base font-semibold text-text">{title}</h2>
      {children}
    </Panel>
  );
}
