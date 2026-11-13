# hookd — Feature Gaps: before launch (Nov 19) and the week after

> Status: RESEARCH · 2026-11-16 · 3 days to launch. Read-only audit of the code + a competitor sweep.
> Scope filter (same as IMPR_PLAN): does it (a) show something in the GIF no one else can, (b) move a dev to pay, (c) fit the date.
> Out of scope by decree: production delivery/queuing (Hookdeck turf) and anything billing/Dodo.

---

## 1. Method + sources

Every "hookd has / lacks" claim below was checked against the code, not the docs: route surface in `server/internal/api/api.go:70-115` + `server/internal/app/app.go:85-132`; verify engine `server/internal/verify/*.go`; replay `server/internal/replay/replay.go`; gating `server/internal/plan/plan.go`; samples `server/internal/samples/samples.go`; inspector `web/app/(app)/app/[id]/page.tsx`, `web/components/inspector/*`; CLI `cli/src/*.js`; docs `web/app/docs/docs-content.tsx`. Competitors were read from their own docs/pages where possible (vendor claims flagged). Sources: [Hookdeck CLI](https://hookdeck.com/docs/cli), [Hookdeck Oct-2025 review (CLI filters, interactive mode)](https://hookdeck.com/blog/hookdeck-review-october-2025), [webhook.site Pro/Custom Actions](https://docs.webhook.site/pro.html), [Svix Play](https://docs.svix.com/play), [Svix manual verification (header naming)](https://docs.svix.com/receiving/verifying-payloads/how-manual), [ngrok Traffic Inspector + verify-webhook](https://ngrok.com/docs/integrations/webhooks/), [Beeceptor mock rules](https://beeceptor.com/docs/mock-rules-priority-order/), [Stripe CLI triggers/fixtures](https://docs.stripe.com/stripe-cli/triggers), [Stripe signature docs → stripe-node #341](https://docs.stripe.com/webhooks/signature), [Hooklistener (MCP, monitors)](https://www.hooklistener.com/), [webhooks.cc (MCP, signed test webhooks, 34 providers)](https://webhooks.cc/), [RequestBin: webhook tools for AI agents 2026](https://blog.requestbin.net/best-webhook-testing-tools-for-ai-coding-agents-2026/), [svix-proxy-action (CI)](https://github.com/cerebruminc/svix-proxy-action), [Paddle signature](https://developer.paddle.com/webhooks/about/signature-verification/), [Paystack webhooks](https://paystack.com/docs/payments/webhooks/), [Cashfree signature](https://www.cashfree.com/docs/payments/online/webhooks/security-checklist), [Hookdeck Clerk guide (svix-* headers)](https://hookdeck.com/webhooks/platforms/guide-to-clerk-webhooks-features-and-best-practices), [OSS newcomers: webhook-toolkit](https://github.com/AleBrito124356/webhook-toolkit), [webhook-inspector (curl/pytest export)](https://github.com/dreadmoreeee/webhook-inspector), plus `docs/research/competitive-analysis.md`.

---

## 2. Competitor feature matrix

✅ = has it · ◐ = partial · ❌ = no. hookd column cites the code that proves it.

| Capability | hookd | Hookdeck | webhook.site | ngrok | Svix Play | Beeceptor | Stripe CLI |
|---|---|---|---|---|---|---|---|
| Capture + raw inspect, headers order-preserved | ✅ `ingest.go:43`, `headers-table.tsx` | ✅ | ✅ | ✅ (full capture opt-in) | ✅ | ✅ | ◐ (dashboard) |
| Live stream (<1s) | ✅ `stream.go`, `use-event-stream.ts` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (terminal) |
| Stable, non-expiring URL on free | ✅ `plan.go:15-18` (7d retention) | ✅ (3-day retention) | ❌ (1 wk / 50 req) | ◐ (1 static domain) | ✅ | ◐ (90d idle delete) | n/a |
| Signature verify — multi-provider | ✅ 10 providers `verify.go:30-39` | ◐ (gateway-side) | ❌ | ◐ `verify-webhook` policy, 500/mo free | ❌ (Svix only) | ❌ | ◐ (Stripe only) |
| **Explain WHY verify failed + likely fix** | ✅ `verify.go:55-65`, `providers.ts:104` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Svix-delivered providers (Clerk/Resend/Supabase/Polar) | ❌ **`svix-*` headers not read** `standardwebhooks.go:22-35`, `verify.go:196` | ✅ | n/a | ✅ | ✅ | n/a | n/a |
| Replay to a URL | ✅ Pro `events.go:93` | ✅ (into gateway) | ✅ paid | ✅ | ◐ | ❌ | ✅ `events resend` |
| Replay **re-signed** (fresh timestamp) | ✅ `replay.go:154-172` | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ (own secret) |
| Edit-then-replay | ✅ `events.go:119-138` | ❌ | ◐ (scripting) | ✅ "modified replay" | ❌ | ❌ | ◐ (fixtures) |
| Forward to localhost (CLI) | ✅ `cli/src/listen.js` (unpublished) | ✅ `hookdeck listen` | ◐ (CLI, paid) | ✅ | ✅ `svix listen` | ✅ tunnel | ✅ `stripe listen` |
| CLI event-type / header filters | ❌ | ✅ `--filter-body/headers/path/query` | ❌ | ❌ | ❌ | ❌ | ✅ `--events` |
| Fire a test event ("trigger") | ◐ 1 sample/provider `samples.go:34` | ❌ | ❌ | ❌ | ✅ (Svix only) | ❌ | ✅ `stripe trigger` + fixtures |
| Custom response (status/headers/body) | ✅ Pro `endpoints.go:179` | ❌ | ✅ | ❌ | ❌ | ✅ rules | n/a |
| Response delay / intermittent failure | ❌ | ❌ | ✅ | ❌ | ◐ "simulate failures" | ✅ | ❌ |
| Mock rules per path/body match | ❌ (one rule/endpoint) | ❌ | ✅ | ❌ | ❌ | ✅ (3 free / 50 paid) | ❌ |
| Scripting on request | ❌ | ✅ transforms | ✅ WebhookScript (Pro) | ✅ traffic policy | ❌ | ❌ | ❌ |
| Search / filter history | ◐ method+verify+body substr `store.go:254-261` | ✅ | ✅ | ✅ | ◐ | ◐ | ◐ |
| Event diff | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| cURL export | ✅ `detail-pane.tsx:21-26` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Handler code scaffold (verify in X lang) | ❌ | ◐ (docs/skills) | ❌ | ❌ | ◐ (SDK snippets) | ❌ | ◐ (VS Code ext) |
| Bulk export (JSON/CSV/HAR) | ◐ account export only `account.go:145` | ✅ | ✅ CSV (Pro) | ❌ | ❌ | ❌ | ❌ |
| Share link (redacted) | ✅ Pro `share.go:24-41` | ✅ | ✅ | ❌ | ✅ (public) | ❌ | ❌ |
| Alerts (email/Slack) | ❌ pref stored, nothing sent `store.go:48`, `app.go:65` | ✅ | ✅ (actions) | ❌ | ❌ | ❌ | ❌ |
| Endpoint health ("provider went quiet") | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Timeline/latency graphs | ◐ count/pass-rate only `endpoint-card.tsx:9-14` | ✅ | ❌ | ✅ | ❌ | ◐ | ❌ |
| API + keys with scopes | ✅ `keys.go`, `api.go:52-65` | ✅ | ✅ (Pro) | ✅ | ✅ Play API | ✅ (Scale) | ✅ |
| MCP server for agents | ❌ promised in brief `docs-content.tsx:264-267` | ◐ (skills) | ❌ | ✅ | ❌ | ❌ | ◐ (skills) |
| Public no-signup debugger | ✅ `/debug/verify` `app.go:111-112` | ❌ | ✅ (inspect only) | ❌ | ✅ | ✅ | ❌ |
| Team / shared endpoints | ❌ (non-goal v1) | ✅ | ✅ (Ent) | ✅ | ❌ | ✅ | ❌ |

**Read:** hookd already owns the verify+explain+re-sign column outright. The real gaps are (1) a silent correctness hole for Svix-delivered providers, (2) "trigger"-style test events, (3) code-out (handler scaffold), (4) agent surface (MCP — Hooklistener and webhooks.cc both shipped one in 2025–26), (5) response-rule depth (delay/flaky), (6) CLI filters.

---

## 3. Ranked feature candidates

Effort in agent-hours (S ≤ 2h, M 3–8h, L > 8h). Slot: **pre** = before Nov 19 · **wk1** = week after · **later**.

| # | Feature | Pitch | Effort | GIF | Pay | Slot |
|---|---|---|---|---|---|---|
| 1 | `svix-*` header aliases (Clerk/Resend/Supabase/Polar) | Every Svix-delivered webhook verifies today instead of "no signature header" | S (2h) | med | **high** | **pre** |
| 2 | Handler scaffold tab ("generate a verifying handler for X in Y") | Fail → likely fix → copy a correct Next.js/Go/Python handler | M (5h) | **high** | high | **pre** |
| 3 | Trigger library (N event types/provider + picker) | `stripe trigger` for every provider, signed so it verifies | M (4h lite) | **high** | med | **pre** (lite) |
| 4 | Secret-finder guidance per provider | "whsec_ vs sk_; CLI secret ≠ dashboard secret; test vs live" under the fix line | S (2h) | med | med | **pre** |
| 5 | MCP server (`npx hookd mcp`) | Claude Code/Cursor drive capture→verify→replay natively; brief already promises it | M (8h) | **high** | med | wk1 |
| 6 | Body-mutation detector v2 | Name the exact mutation: HTML-escaped `&`→`&`, trailing `\n`, CRLF, key re-order, BOM, unicode escapes | M (3h) | **high** | high | wk1 |
| 7 | Provider wave 2: Paddle, Paystack, Linear, Cashfree, Meta/WhatsApp | HMAC-clean, 1–1.5h each via registry pattern | S each | med | med | wk1 |
| 8 | Response rules: delay + flaky mode | "Return 500 every 3rd call, 2s delay" to exercise provider retries | S–M (3h) | med | med | wk1 |
| 9 | `hookd listen` filters + CI flags | `--event-type`, `--header`, `--once`, `--timeout`, GH-Action example | S–M (3h) | med | med | wk1 |
| 10 | Event diff (compare two captures) | Side-by-side header+JSON diff of two events | M (4h) | med | low | wk1/later |
| 11 | Search depth: event_type, provider, date range, header match | Server-side filters; UI is client-side today | M (3h) | low | med | wk1 |
| 12 | Bulk export per endpoint (NDJSON/HAR) | Download history for fixtures / offline diff | S (2h) | low | low | wk1 |
| 13 | Verify-fail alerts (email/Slack) | "3 failed verifications on prod endpoint in 5 min" | M (6h, needs SMTP/webhook sender) | low | med-high | later |
| 14 | Endpoint health ("quiet for N min") | Hooklistener-style monitors; needs scheduler | M (6h) | low | med | later |
| 15 | JSON-path pinning / schema column | Pin `data.object.amount_total` as a stream column | M | med | low | later |
| 16 | Timeline / latency graphs | Events-per-hour, verify pass-rate over time | M | low | low | later |
| 17 | Public-key providers: Discord (Ed25519), SendGrid (ECDSA) | Needs public-key input, not a secret; new UI shape | M each | low | low | later |
| 18 | Team / shared endpoints | Explicit v1 non-goal | L | low | med | later |
| 19 | VS Code extension | Stripe has one; thin wrapper over API | L | med | low | later |
| 20 | Request scripting (WebhookScript-style) | Sandboxing + abuse surface; webhook.site's moat, not ours | L | low | low | **reject for now** |
| — | PayPal verification | Requires cert fetch (network I/O) — violates `verify.go:11` contract | — | — | — | **reject** |

### 3.1 `svix-*` header aliases — the silent correctness hole (S, pre)

- **Why:** Svix sends `svix-id`/`svix-timestamp`/`svix-signature` by default; the `webhook-*` names are a paid white-label option ([Svix docs](https://docs.svix.com/receiving/verifying-payloads/how-manual)). Clerk, Resend, Supabase, Polar, Memberstack, Zoom-via-Svix and Svix itself all ship `svix-*`. Clerk + Resend are in most Next.js indie stacks — Persona A's exact stack.
- **Evidence in code:** `standardwebhooks.go:22-35` reads only `Webhook-Id/-Timestamp/-Signature`; `verify.go:196` `Detect` requires the `Webhook-*` triple; `providers.ts:34-53` `SIGNATURE_HEADERS` has no `svix-*`; `cli/src/sign.js` writes `Webhook-*` only. Today a Clerk event on an auto-detect endpoint → `unknown / no_signature_header`.
- **Build on:** the verifier is fully correct for the scheme; add a header-lookup helper that tries `svix-*` then `webhook-*`, and have the signer emit whichever set was present on the capture (default `svix-*`). Add `PROVIDER_META` display aliases ("Standard Webhooks · Clerk, Resend, Supabase, Polar, Dodo, Svix") and the provider grid on the landing page.
- **Tests:** mirror `standardwebhooks_test.go` with `svix-*` headers; round-trip Sign→Verify on both namings.

### 3.2 Handler scaffold ("generate a verifying handler") (M, pre)

- **Why:** the #1 search intent is "stripe signature verification failed next.js"; every fix guide ends with "use `request.text()` / `bodyParser:false`" ([Stripe docs → stripe-node #341](https://docs.stripe.com/webhooks/signature)). hookd already diagnoses the cause; closing the loop with a correct handler is the obvious next click and the GIF beat ("FAILED → likely fix → copy handler → PASS").
- **Build on:** the cURL tab pattern `detail-pane.tsx:21-26` + `CurlTab`/`buildCurl` (`detail-pane.tsx:391-399`); provider knowledge in `providers.ts:81-92` (`PROVIDER_ENCODING`) and scheme comments in `verify.go:30-39`; the public debugger `web/app/debugger/debugger-client.tsx` can render the same component logged-out (SEO + share value).
- **Scope for pre-launch:** a `handler` tab with a language toggle (Next.js App Router TS, Go net/http, Python/FastAPI) × the 10 providers, generated from a template table keyed by scheme shape (hex-HMAC-body, base64-HMAC-body, stripe t.v1, standard-webhooks, slack v0, twilio url-bound, twitch id+ts+body). Each template bakes in the raw-body rule and the provider's tolerance. Node + Go first; Python wk1 if tight.
- **Pay:** keep the tab free for Stripe/GitHub, Pro for the rest — or free everywhere and let the fix line stay the gate. Recommend free: it is a funnel, not the wedge.

### 3.3 Trigger library (M lite, pre; CLI `trigger` wk1)

- **Why:** `stripe trigger <event>` is the thing devs love about the Stripe CLI ([triggers](https://docs.stripe.com/stripe-cli/triggers)); webhooks.cc now advertises "signed test webhooks for 34 providers". hookd has exactly one sample per provider (`samples.go:34-136`) and the UI sample button has no event-type choice (`app/page.tsx:278-306`, `SendSample` `endpoints.go:211`).
- **Build on:** `samples.For(provider)` → `samples.For(provider, eventType)` with a `Types(provider)` list; `sampleReq` gains `event_type`; the guided demo (`onboarding.tsx:75-99`) keeps defaulting to the first. Because `SendSample` signs with the endpoint secret via `verify.Sign`, every trigger verifies PASS — no competitor's free sample does that.
- **Pre-launch lite:** Stripe (`checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.deleted`, `charge.refunded`), GitHub (`push`, `pull_request.opened`, `issues.opened`), Shopify (`orders/create`, `orders/paid`, `app/uninstalled`), Razorpay (`payment.captured`, `payment.failed`), Standard Webhooks/Clerk (`user.created`), plus a picker in the dashboard + inspector empty state (`states.tsx:86-114`). ~4h.
- **wk1:** `npx hookd trigger <endpointId> stripe:invoice.payment_failed [--forward localhost:3000]` (reuses `client.js` + `forward.js`), and a `GET /api/samples` catalog for the MCP server.

### 3.4 Secret-finder guidance (S, pre)

- **Why:** research says wrong secret (API vs signing vs CLI vs dashboard; test vs live) is the #2 cause after raw-body mutation (`PRODUCT.md §3`). Today `missing_secret` and `signature_mismatch` fixes are generic (`providers.ts:118-124`).
- **Build on:** `CAUSE_FIX` is already `(details, provider) => string`; add a `SECRET_HINT: Record<Provider, {where, prefix, gotcha}>` (Stripe: Developers → Webhooks → endpoint → "Signing secret", `whsec_…`, "the `stripe listen` secret is different from the dashboard one, and test ≠ live"; GitHub: repo → Settings → Webhooks → Secret; Shopify: Notifications → "Webhook signing key" (not the API secret); Razorpay: Webhooks → the secret you typed; Standard Webhooks: `whsec_` base64; Slack: Basic Information → Signing Secret; Twilio: Auth Token; Vercel: Integration "secret"; Lemon Squeezy: Webhooks → Signing secret; Twitch: your own `secret` from the subscription). Render under the fix line and in the secret field on `app/[id]/settings/page.tsx`. Also shows on the public debugger.

### 3.5 MCP server (M, wk1)

- **Why:** the docs page promises it twice (`docs-content.tsx:264-267`, `:332-335`); Hooklistener ships 67 MCP tools, webhooks.cc ships a remote + local MCP and a Claude Code plugin, RequestBin's 2026 roundup ranks tools by MCP coverage. "Claude Code fixes my Stripe handler using hookd" is a top-tier GIF for the X/builder audience.
- **Build on:** every needed route already accepts an API key with scopes (`api.go:79-100`): list/create endpoints, list events, get event/body, stream. Missing for agents: `replay`, `sample`, `set_secret` are session-only (`api.go:83-98`) — flip `sample` + `replay` to `key` with write scope (replay stays Pro-gated). Ship as `npx hookd mcp` (stdio) inside the existing `cli/` package: tools `list_endpoints`, `create_endpoint`, `set_secret`, `send_sample`, `list_events`, `get_event`, `wait_for_event` (SSE, timeout), `verify_debug` (public `/debug/verify`), `replay_event`. Stdio JSON-RPC is small enough to hand-roll and keep the zero-dep promise; otherwise accept `@modelcontextprotocol/sdk`.
- **Risk:** CLI isn't on npm yet (`CLI.md:153`). Publishing is the gate for both #5 and #9 — do it launch day with the user's go.

### 3.6 Body-mutation detector v2 (M, wk1 — pull forward if a pre item slips)

- **Why:** the single most common real cause; today `bodyAltered` (`common.go:196-207`) does one `json.Decode→Encode` cycle and reports lengths. It misses the named mutations devs actually hit: Go's `json.Marshal` HTML-escaping `<>&` to `<`, Express `JSON.stringify` key re-ordering, a stripped trailing newline, CRLF normalisation by a proxy, a BOM, `é` vs `é`. Each is a one-line "likely fix" nobody else prints.
- **Build on:** `classifyHMAC` (`common.go:174-194`) already takes an `altered func([]byte) bool`; add a short ordered list of candidate transforms (trim trailing newline, add trailing newline, CRLF→LF, strip BOM, HTML-escape/unescape, compact, sorted-keys re-encode) and report the FIRST that matches as `details.mutation = "html_escaped"` etc., then specialise `CAUSE_FIX.body_possibly_altered` (`providers.ts:146-151`). Pure, deterministic, cheap (≤ 8 extra HMACs on a fail path).

### 3.7 Provider wave 2 (S each, wk1) — ranked by audience × ease

| Provider | Header / scheme | HMAC-clean? | Effort | Note |
|---|---|---|---|---|
| **Clerk / Resend / Supabase / Polar** | `svix-*` Standard Webhooks | yes | covered by #1 | biggest audience; ship pre-launch |
| **Paddle** | `Paddle-Signature: ts=…;h1=…`, HMAC-SHA256 hex over `ts:body`, 5s tolerance, secret `pdl_ntfset_` ([docs](https://developer.paddle.com/webhooks/about/signature-verification/)) | yes | 1.5h | Stripe-shaped; copy `stripe.go` |
| **Paystack** | `x-paystack-signature`, HMAC-SHA512 hex over raw body ([docs](https://paystack.com/docs/payments/webhooks/)) | yes (needs sha512 helper) | 1h | Africa indie audience; copy `lemonsqueezy.go` |
| **Linear** | `Linear-Signature`, HMAC-SHA256 hex over body | yes | 1h | dev-tool audience; verify against linear docs first |
| **Cashfree** | `x-webhook-signature` base64 HMAC-SHA256 over `timestamp+rawbody` with `x-webhook-timestamp` ([docs](https://www.cashfree.com/docs/payments/online/webhooks/security-checklist)) | yes | 1.5h | India (pairs with Razorpay) |
| **Meta / WhatsApp / Messenger / Instagram** | `X-Hub-Signature-256: sha256=…` — byte-identical to GitHub | yes | 1h | `Detect` must disambiguate via `X-GitHub-Event` presence; mostly labelling |
| Square | base64 HMAC-SHA256 over `notification_url + body` | yes, URL-bound | 2h | reuse `Input.URL` plumbing from Twilio (`verify.go:76-80`) |
| Flutterwave | `verif-hash` = plain secret equality | trivial, weak | 1h | low explain value |
| Telegram | `X-Telegram-Bot-Api-Secret-Token` plain equality | trivial | 1h | low explain value |
| Mailgun | `timestamp`+`token`+`signature` **in the JSON body**, HMAC-SHA256 | yes, odd shape | 3h | needs body-field extraction; later |
| PhonePe | `Authorization` = SHA256(user:pass) | hash, not HMAC | 1h | later |
| Postmark | basic auth / unverified `x-postmark-signature` claim | unclear | — | verify docs before touching |
| Discord | Ed25519 over `ts+body`, public key | **no** | M | needs a "public key" field; later |
| SendGrid | ECDSA, public key | **no** | M | later |
| PayPal | cert download + CRC32 | **no** (I/O) | — | reject (`verify.go:11` contract) |

Pattern to copy: `lemonsqueezy.go` (verifier + signer + `init()` registration, 75 lines) + a table test. Each new provider also needs: `verify.go` const + `Detect` case, `samples.go` entry, `providers.ts` `PROVIDER_META`/`SIGNATURE_HEADERS`/`PROVIDER_ENCODING`, `types.ts` `Provider` union, `cli/src/sign.js`, the landing provider grid and the agent brief list (`docs-content.tsx:161`).

### 3.8 Response rules: delay + flaky (S–M, wk1)

- **Why:** Hooklistener ("fixed delay or intermittent 5xx"), Svix Play ("simulate random failures"), webhook.site and Beeceptor all do this; it is the way to watch a provider's retry/backoff in the inspector — a good GIF ("Stripe retried 3× after our 500s").
- **Build on:** `ResponseRule{status, headers, body}` (`types.ts:48-52`, `store.DefaultResponseRule`, `writeResponseRule` `ingest.go:273`); add `delay_ms` (cap 10s) and `fail_every_n` / `fail_rate` + `fail_status`. Keep Pro-gated (`plan.go:71`). Per-path/body match rules (Beeceptor-style) are **not** worth it — one endpoint = one provider in hookd.

### 3.9 `hookd listen` filters + CI (S–M, wk1)

- **Why:** Hookdeck's CLI filters by body/headers/path/query and Stripe's by `--events`; CI use is a documented pattern (svix-proxy-action, Apidog's "Stripe webhooks in CI" series). hookd's stream already carries `event_type` + `verify_status` (`CLI.md:62-67`).
- **Build on:** `listen.js` — add `--event-type <glob>`, `--header k=v`, `--verified-only`, `--once` (exit after first forward), `--timeout <s>`, `--exit-code-on-fail` (non-2xx from local target → exit 1). Document a GitHub Actions job: start app → `hookd listen --once --timeout 60` → `hookd trigger` (#3.3) → assert. Zero backend work.

### 3.10 Event diff (M, wk1/later)

- Two-event compare (headers added/removed/changed + JSON structural diff). Nobody in the matrix has it; useful for "why did this delivery verify and that one not" and for edit-then-replay review. Build on the `details` cache (`page.tsx:92`) and `json-viewer.tsx`; add a "compare with…" action in the command palette (`command-palette.tsx:142`). GIF-able but not a pay trigger — wk1 only if #5/#6 finish early.

### 3.11 Search/filter depth, bulk export (S–M, wk1)

- Server filter today: `method`, `verify`, `q` body substring, `limit`, `before` (`store.go:254-261`); the UI's path/event-type search is client-side over the loaded page (`page.tsx:198-209`). Add `event_type`, `since`, `source_ip`, `header:k=v` to `EventFilter` + the palette. Bulk export: `GET /api/endpoints/{id}/events.ndjson` (+ HAR) reusing `eventDetail` (`events.go:224`). Both Pro (search is already `CanTextSearch`).

### 3.12 Alerts / endpoint health (M, later)

- Prefs exist but are inert (`NotifyCaptureAlerts` `store.go:48`; mailer no-op without SMTP `app.go:65-71`, `UX_PLAN §8`). A verify-fail alert needs: SMTP or a Slack incoming-webhook URL per user, a debounce, and a worker; endpoint-quiet needs a scheduler. Valuable for Persona B (Marco) and a plausible Team-tier hook, but it is monitoring, a step toward Hookdeck's lane — do it after replay/MCP signals come in.

---

## 4. Recommended sets

### Before launch (Nov 19) — ≤ 4 items, ~13 agent-hours

| # | Item | Hours | Why it makes the cut |
|---|---|---|---|
| 1 | **`svix-*` aliases + Clerk/Resend/Supabase/Polar labels** (§3.1) | 2 | A correctness bug on launch day for the most common Next.js providers; fixes the landing-page provider claim; zero UI risk |
| 2 | **Handler scaffold tab** — Node/Next.js + Go, all 10 providers, in inspector + public debugger (§3.2) | 5 | The GIF beat after the fix line; turns the SEO on-ramp into "copy the fixed handler"; frontend-only |
| 3 | **Trigger library lite** — 3–4 event types for Stripe/GitHub/Shopify/Razorpay + picker (§3.3) | 4 | Kills the empty-state problem; signed samples verify PASS, which `stripe trigger` can't do for non-Stripe |
| 4 | **Secret-finder guidance** (§3.4) | 2 | Pure data + one render; directly deepens the only paid reason to use hookd |

Everything above is additive, test-covered by existing patterns, and touches no billing or delivery code. If any slips, cut #3 first (it has a wk1 home in the CLI), never #1.

Stretch if green by Nov 18 noon: Paddle (1.5h, copy `stripe.go`) — it makes the "payments providers" story Stripe + Razorpay + Lemon Squeezy + Paddle + Dodo/Polar.

### Week 1 post-launch (Nov 20–26)

1. **Publish the CLI to npm** (gate for everything below) and ship `npx hookd mcp` (§3.5) — headline of the Nov 26 post.
2. **Body-mutation detector v2** (§3.6) — the wedge gets sharper; pairs with the handler tab.
3. **Provider wave 2**: Paddle, Paystack, Linear, Cashfree, Meta/WhatsApp (§3.7) — one agent, one day, five launch tweets.
4. **`hookd trigger` + listen filters/CI flags** (§3.3, §3.9).
5. **Response delay + flaky mode** (§3.8).
6. If time: event diff (§3.10), server-side filters + NDJSON export (§3.11).

---

## 5. Signals to watch after launch (what decides the next feature)

Instrument these from data that already exists (`activity` log, `events.verify_cause`, API-key `last_used`, `writeUpgrade` reasons); add a tiny counter where noted.

| Signal | Where it already lives | What it decides |
|---|---|---|
| Verify outcomes per provider, esp. `unsupported_provider` / `no_signature_header` on auto-detect endpoints | `events.verify_cause` by endpoint provider; `Detect` misses | Which providers to add next (wave 2 order) — a spike in unrecognised `*-signature` headers = a missing provider |
| Cause distribution on `/debug/verify` (add a counter per cause, no bodies) | `publicverify.go` | Whether detector v2 (body-altered share) or secret-finder (mismatch share) earns more |
| Replay usage: attempts/user, % re-signed, % edited | `replay.sent` activity, `ReplayAttempt.resigned`, `Body != nil` | Whether edit-then-replay and diff deserve more; if replay is low, the MCP/agent loop is the better bet |
| CLI/API adoption: keys created, `stream` opens with key auth, last_used | `keys.go`, `ApiKey.last_used_at_ms` | Priority of MCP, listen filters, CI docs |
| 402 hits by reason (replay / search / share / response / endpoint cap) | `writeUpgrade` call sites | Which gate actually converts — move the paywall, not the features |
| Sample sends by provider + event type (after §3.3) | `SendSample` | Which trigger catalogues to deepen |
| Handler-tab copies by language/provider (client counter) | new | Which language to add third; whether to keep it free |
| Share links created + share-page views | `CreateShare`, `/share/{token}` | Team/shared endpoints demand |
| Time-to-first-event and first-verified-event per signup | `endpoint.created` → first `events` row | Onboarding vs feature work |
| "Quiet endpoint" complaints / support mail | support inbox | Whether alerts/health (§3.12) is real demand or imagined |

Decision rule: a feature from §3 gets built only when a signal above points at it, with the exception of the MCP server and the CLI publish, which are already-promised surfaces.
