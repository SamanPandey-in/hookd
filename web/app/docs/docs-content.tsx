"use client";

import * as React from "react";
import { API_URL } from "@/lib/api";
import { Panel, FieldLabel } from "@/components/ui/panel";
import { CopyField } from "@/components/ui/copy-field";
import { Button } from "@/components/ui/button";

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

export function DocsContent() {
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

      <AgentBrief />

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
          toggle <Mono>edit payload</Mono> to tweak the body first (re-sign is
          then required) and craft an edge-case event you can&rsquo;t easily
          trigger upstream.
        </p>
        <p className={hint}>
          the response status, latency and body are recorded under{" "}
          <Mono>attempts</Mono>. prefer your own machine?{" "}
          <Mono>npx hookd listen &lt;id&gt; --forward localhost:3000</Mono>{" "}
          streams live events straight to a local server.
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

// ---- Copy for agents -------------------------------------------------------
// A single, paste-ready brief that gives an AI agent everything it needs to
// drive hookd over the REST API: base url, auth, every route, the verify +
// replay semantics, limits, and worked examples. One click copies the whole
// thing. (A hosted MCP server is planned, which will expose the same surface as
// tools — noted in the brief so an agent knows to check for it.)

/** Build the agent brief against the live API base so copied urls are real. */
function buildAgentBrief(apiBase: string): string {
  return `# hookd — agent brief

hookd captures, inspects, verifies and replays webhooks. This brief is
everything an AI agent needs to use hookd programmatically over its REST API.

## base url
- API base: ${apiBase}
- REST routes live under ${apiBase}/api
- Public ingest (no auth): ${apiBase}/i/{endpoint_id}

## authentication
Authenticate API calls with an API key, either way:
- Authorization: Bearer whk_live_xxxxxxxx...
- X-API-Key: whk_live_xxxxxxxx...
Create a key in the app under settings -> api keys. The full key has the form
"whk_live_" + 64 hex chars and is shown exactly once at creation — store it
then; it is unrecoverable afterward. (Browser sessions authenticate with a
GitHub-OAuth cookie instead; agents should use an API key.)

## core concepts
- endpoint: a stable destination with its own ingest url. Optional provider
  (stripe | github | razorpay | shopify | standard_webhooks | slack | twilio | vercel | lemon_squeezy | twitch | "" = auto-detect;
  standard_webhooks is the Svix/Dodo spec; twilio's signature is bound to the
  request URL, not just the body) and
  an optional signing secret.
- ingest url: ${apiBase}/i/{endpoint_id} — point a provider (or your own POST)
  at it; every request is captured verbatim as an event.
- event: one captured request — method, headers (order + duplicates preserved),
  raw body bytes, and a verification verdict.
- verification: when a provider + secret is set, hookd recomputes the signature
  and returns pass/fail WITH the reason (e.g. signature_mismatch,
  timestamp_out_of_tolerance, body_possibly_altered, encoding_mismatch) — not
  just a boolean.
- replay: re-send a captured event to any target url. Opt into re-sign to mint
  a fresh signature + current timestamp from the endpoint's secret, so a
  receiver verifies it as genuine instead of rejecting a stale skew. You may
  also edit the body before replaying (re-sign is then required so the signature
  matches the edited bytes) — useful for crafting an edge-case event you can't
  easily trigger upstream.

## public signature debugger (no auth, nothing stored)
POST ${apiBase}/debug/verify
Paste a secret + the raw request and get the same pass/fail + reason the product
gives — no account, no storage. Request JSON:
  { "provider": "stripe",        // optional; omit to auto-detect from headers
    "secret":   "whsec_...",
    "headers":  { "Stripe-Signature": "t=...,v1=..." },
    "body":     "<raw request body as a string>",
    "url":      "<full request url>" }   // optional; only Twilio (url-bound) uses it
Response: { provider, status (pass|fail|unknown), cause, summary, details }.
Rate-limited per IP; stores nothing; logs no secret or body. Great as a quick
one-shot check or to share "here's why your webhook won't verify".

## capture a webhook (no auth)
POST ${apiBase}/i/{endpoint_id}
  curl ${apiBase}/i/{endpoint_id} \\
    -H "Content-Type: application/json" \\
    -d '{"hello":"webhook"}'
The request is stored exactly as received and verified against the endpoint's
provider + secret if set.

## REST API (API key required unless noted)
- GET    /api/me                        current user {id,login,email,plan,subscription,...}
- GET    /api/endpoints                 list endpoints
- POST   /api/endpoints                 create {name, provider?, retention_days?}
- GET    /api/endpoints/{id}            one endpoint
- PATCH  /api/endpoints/{id}            update {name?, provider?, retention_days?}
- DELETE /api/endpoints/{id}            delete endpoint
- PUT    /api/endpoints/{id}/secret     set signing secret {secret}
- DELETE /api/endpoints/{id}/secret     clear signing secret
- POST   /api/endpoints/{id}/sample     inject a sample event {provider?}
- GET    /api/endpoints/{id}/events     list events; filters: method, verify, q, limit, before
- GET    /api/endpoints/{id}/stream     SSE live stream of new events (API key OR session) — the CLI subscribes here
- POST   /api/endpoints/{id}/response   set a canned response rule {status, headers?, body?}
- GET    /api/events/{id}               event detail (API key OR session)
- GET    /api/events/{id}/body          raw body bytes (API key OR session)
- POST   /api/events/{id}/replay        replay {target_url, resign, body?} (body edits require resign:true)
- GET    /api/events/{id}/replays       replay attempts
- POST   /debug/verify                  PUBLIC, no auth — verify a pasted secret+request, stores nothing
- POST   /api/events/{id}/share         create a public share link
- GET    /api/keys                      list API keys (prefix only, never the secret)
- POST   /api/keys                      create {name} -> returns the full key ONCE
- DELETE /api/keys/{id}                 revoke a key

## responses & errors
JSON throughout. Errors use {"error":"message"} with the HTTP status:
- 401  not authenticated (missing/invalid key or session)
- 402  {"upgrade":true} Pro-only action on a free plan
- 404  not found
- 409  conflict (e.g. no subscription for the billing portal)

## plans & limits
- free: 2 API keys, capped retention/history, basic pass/fail verify.
- pro:  20 API keys, long retention, verify-explain depth, replay + re-sign,
  search/filter, response control, event sharing.
Pro-only calls return HTTP 402 with {"upgrade":true}.

## worked example: create an endpoint, read its events
# 1) create
curl -X POST ${apiBase}/api/endpoints \\
  -H "Authorization: Bearer whk_live_xxxxxxxx..." \\
  -H "Content-Type: application/json" \\
  -d '{"name":"stripe prod","provider":"stripe"}'
# -> {"id":"evt_...", "ingest_url":"${apiBase}/i/<id>", ...}

# 2) (optional) set the signing secret so events get verified
curl -X PUT ${apiBase}/api/endpoints/<id>/secret \\
  -H "Authorization: Bearer whk_live_xxxxxxxx..." \\
  -H "Content-Type: application/json" \\
  -d '{"secret":"whsec_..."}'

# 3) read captured events
curl ${apiBase}/api/endpoints/<id>/events \\
  -H "Authorization: Bearer whk_live_xxxxxxxx..."

## forward to localhost (CLI)
Pipe live captured events straight to a local server while you develop:
  HOOKD_API_KEY=whk_live_... \\
  npx hookd listen <endpoint_id> --forward http://localhost:3000/webhooks [--resign]
It subscribes to the endpoint's SSE stream and POSTs each event to your local
url, preserving method + body. With --resign (and a provider secret via --secret
or HOOKD_SIGNING_SECRET) it re-signs with a fresh timestamp so your handler's
verification passes. Defaults: --api ${apiBase}.

## roadmap
A hosted hookd MCP server is planned: it will expose this same surface as tools
(create endpoints, read events, verify, replay) so an agent can drive hookd
natively. Until it ships, use the REST API above.`;
}

function AgentBrief() {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const brief = React.useMemo(() => buildAgentBrief(API_URL), []);
  const lineCount = React.useMemo(() => brief.split("\n").length, [brief]);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context) — fall back to selecting the
      // textarea so the user can copy manually.
      const el = document.getElementById("agent-brief-text");
      if (el instanceof HTMLTextAreaElement) {
        el.focus();
        el.select();
      }
    }
  };

  return (
    <Panel className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-[1px]"
          style={{ background: "var(--accent)" }}
        />
        <span className="font-mono text-[11px] text-muted">for agents / llms</span>
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="font-sans text-base font-semibold text-text">
          copy for agents
        </h2>
        <p className={prose}>
          hand an AI agent everything it needs to drive hookd — the base url,
          auth, every route, the verify &amp; replay semantics, limits and
          worked examples. one click, paste into your agent&rsquo;s context.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="md" onClick={copy}>
          {copied ? "copied ✓" : "copy agent brief"}
        </Button>
        <span className="font-mono text-[11px] text-muted">
          plain text · {lineCount} lines · resolves to{" "}
          <Mono>{API_URL}</Mono>
        </span>
      </div>

      <p className={hint}>
        an <Mono>mcp</Mono> server that exposes these as tools is planned — the
        brief notes it so an agent knows to check.
      </p>

      {/* Hidden source for the manual-copy fallback when the clipboard API is
          unavailable (insecure context). Off-screen, not display:none, so it
          can still be focused + selected. */}
      <textarea
        id="agent-brief-text"
        readOnly
        value={brief}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute h-px w-px -translate-x-[9999px] opacity-0"
      />
    </Panel>
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
