# PRODUCT.md — Webhook Debugger (Weekly Ship #2)

> Product requirements, grounded in `docs/research/`. Working name only — functionality and UI
> quality are what matter, not branding. **Target ship: 2026-11-19.**
> Sources of truth: this file (what & why), `DESIGN.md` (how it looks), `PLAN.md` (how we build it).

---

## 1. Positioning / the wedge

**The webhook tool that explains *why* your signature failed — and replays the exact event, re‑signed, to your endpoint.**

Free tools (webhook.site, RequestBin, smee) capture and pretty‑print but **never verify signatures or explain failures**, and they die on retention. Heavy platforms (Hookdeck, Svix, Convoy) verify and deliver at scale but are production‑priced ($99–499+/mo) and overkill for a developer debugging at their desk. **Nobody owns the dev‑time "why did verification fail + replay the exact event" job at an indie price.** That is our lane. (Full reasoning: `research/competitive-analysis.md`.)

We are **not** a cheaper inspector. We do a **different, higher‑value job**: diagnose + fix the signature/replay loop.

## 2. Who it's for (ICP + personas)

Primary ICP: **indie/full‑stack developers and small backend teams integrating third‑party webhooks** (payments, e‑commerce, CI, auth). They debug webhooks in intense bursts per integration, not daily. (Full personas: `research/customer-research.md`.)

- **Persona A — Priya, solo SaaS builder (primary).** Integrates Stripe billing + maybe GitHub/Clerk. JTBD: *"When my Stripe webhook fails, tell me why and let me replay the exact event until my fix works."* Reaches us via dev.to / HN / X / error‑string Google searches.
- **Persona B — Marco, backend engineer at a scale‑up (secondary).** Maintains several inbound integrations. JTBD: *"Capture a failing webhook, share it with a teammate, replay it with a chosen response code to test retry handling."* Cares about multi‑provider verify, response control, durable/shareable history, self‑host/privacy.
- **Persona C — Dana, integrations engineer (tertiary, lower confidence).** Proves sent‑vs‑received‑vs‑processed to close support tickets.

## 3. The problems we solve (ranked by research frequency × intensity)

1. **"Why is my signature verification failing?"** — dominant, highest intensity (Confidence: High). Root causes recur: raw body mutated by a JSON parser; wrong secret (API vs signing vs CLI vs dashboard; test vs live); wrong encoding (Shopify base64 vs Stripe/Razorpay hex); timestamp out of tolerance. Provider error messages mislead.
2. **Tunnel/public‑URL friction** — ngrok random‑URL churn, 2‑hr caps, interstitial; Stripe CLI is Stripe‑only; smee has no history (High).
3. **Replay the exact failed event without re‑triggering** — re‑triggering gives a *different* event; replay protection (old timestamp, edited body, event‑ID dedupe) blocks naive replay. Re‑signing is the unsolved bit (High).
4. **Free inspectors die on retention** — webhook.site free = 50 req + 1‑week expiry; RequestBin stores 100; smee stores nothing (High).
5. **Black box: sent vs received vs processed** — silent failures, logs on both ends inconclusive (Medium).
6. **Can't set the response the endpoint returns** — needed to exercise provider retry logic (Low/Medium).

## 4. v1 scope — **fully hosted** (no CLI in v1)

v1 receives every webhook **on our server** and shows it to the user. Replay/forward is **server‑side to a target URL** (SSRF‑guarded). The localhost‑forwarding CLI is **deferred** (see Non‑goals). Features, ranked:

### F1 — Capture + inspect (table stakes, must be excellent)
- Each user gets **stable, reusable, unguessable ingest URLs** (`/i/{id}`, ≥128‑bit id) that **do not expire** and are **always‑on** (we never sleep and drop a webhook — see `PLAN.md` hosting constraint).
- Capture the **exact raw request**: method, path, full headers (order + duplicates preserved), raw body bytes, query, source IP, received timestamp (ms), size, content‑type.
- Inspect: pretty‑printed JSON (also raw/text/form views), full headers table, timing, size.
- **Acceptance:** a webhook POSTed to an ingest URL appears in the inspector **live (<1s)** with byte‑exact body and all headers; pretty JSON renders; raw bytes downloadable.

### F2 — Signature verification + plain‑English explanation (THE differentiator; leads the demo GIF)
- User pastes a signing secret (stored encrypted) per endpoint and picks a provider (or we auto‑detect from headers).
- Verify for **v1 providers: Stripe, GitHub, Razorpay, Shopify, Standard Webhooks (Svix/Dodo), Slack.** Each: correct scheme, encoding, signed‑content construction, and timestamp tolerance.
- On **PASS**: show scheme + algorithm + which secret matched + timestamp status (one line, in lime).
- On **FAIL**: show the **specific cause**, not just "failed" — e.g. `computed v1 ≠ header v1`, `timestamp skew 612s > 300s tolerance`, `no signature header`, `looks base64 but secret produced hex`, `body appears re‑serialized (whitespace differs) — verify against raw bytes`.
- **Acceptance:** against a table of real known‑good payloads per provider → PASS with correct reason; against tampered/stale/wrong‑secret payloads → FAIL naming the *actual* cause. Constant‑time comparison. 0 false "verified".

### F3 — Replay / re‑sign to a target URL
- Re‑send any captured request to a **user‑supplied target URL** (their deployed endpoint, or a staging URL). Edit before send (headers/body) optional.
- **Re‑sign toggle:** (a) re‑sign with a fresh timestamp + the endpoint's secret so replay protection doesn't trip, or (b) keep the original signature verbatim.
- Show the **delivery result**: response status, headers, body, latency; store each attempt.
- **SSRF guard:** block private/loopback/link‑local/metadata ranges, scheme allowlist, timeout, no redirect to private space (see `AGENTS.md` §6).
- **Acceptance:** replay a captured Stripe event re‑signed → target verifies it as valid; replay with "keep original" → target sees the original signature; attempt + response recorded.

### F4 — Durable, searchable, shareable history
- Retain captured events per plan (free: capped; paid: long/unlimited). Search/filter by provider, method, status, verify result, text in body.
- **Share a captured event** via a read‑only link (redaction‑aware).
- **Acceptance:** events persist across sessions; filter by "verify: failed" works; a share link opens a read‑only event for a logged‑out viewer.

### F5 — Response control + sample sender
- Per endpoint, set the **HTTP response** we return to the provider: status code, headers, body (to exercise retry/backoff — providers retry only on non‑2xx).
- **Send a sample payload** (per provider templates) to an endpoint to build against before the real integration exists.
- **Acceptance:** set endpoint to return 500 → provider/replayer sees 500; send a sample `checkout.session.completed` → it appears captured.

## 5. Non‑goals (v1) — protect the date, avoid traps

- **No localhost‑forwarding CLI in v1.** Deferred; build only if the product gets traction ("fast‑follow"). v1 replays to a *target URL*, server‑side.
- **No at‑scale production delivery / queuing / fan‑out** (Hookdeck/Svix/Convoy turf, millions of events). Out of ICP; a pricing + engineering trap.
- **No outbound webhook *sending* infrastructure** (we're an inbound debugger, not a sender).
- **No multi‑seat team management** beyond simple share links in v1 (team tier can come later).
- Keep provider list to the v1 six; add more by request after launch.

## 6. Pricing & packaging

Market clusters tight at **$9–19/mo** (webhook.site $9/$19, RequestBin $12, Beeceptor $10, ngrok ~$8). Production platforms ($99–499+) anchor the ceiling, not us.

- **Free:** a genuinely useful tier to beat the $0 anchor + drive virality — stable ingest URL(s), live capture + inspect, **basic** signature verify, capped history (e.g. 7 days / N events), no replay/forward, no sharing.
- **Pro — ~$12/mo (annual ~$8–9/mo):** full verify‑explain depth, replay + re‑sign, long/unlimited retention, search, response control, sample sender, share links, more endpoints.
- Optional later **Team/$19**: seats, shared endpoints.
- **Billing rail: Dodo Payments** (merchant‑of‑record — handles global tax/VAT + subscriptions; India‑friendly for a global audience). Dodo's own subscription webhooks are **Standard Webhooks**‑signed → we verify them with our own engine (dogfood + a credibility story).
- **WTP caveat (Confidence: Medium):** no direct "I'd pay $X" evidence (Reddit was inaccessible to research). **Validate with a landing‑page smoke test + a Dodo payment link pre‑order before hard‑committing the price.**

## 7. Privacy stance (answers the #1 paying objection)

Webhooks carry PII/payment data; devs resist sending payloads to a hosted box. So:
- Ingest URLs are **private and unguessable**; events are scoped to the owner.
- **Do not log raw bodies** in server logs; store encrypted at rest; render as inert escaped text (never live HTML).
- Offer **ephemeral/auto‑purge** endpoints and clear retention controls.
- Signing **secrets encrypted at rest**, never shown back in full, never logged.
- Roadmap (not v1): optional self‑host for the privacy‑max segment.

## 8. Success metrics

- **Primary (the challenge's goal):** at least **one paying customer** by/around launch.
- **Reach:** a demo GIF that leads with the **signature verify moment** + a webhook landing live, good enough to spread on X.
- **Activation proxy:** visitor points a real webhook at an ingest URL and sees it captured + verified (the "aha").
- **Validation:** pre‑order/smoke‑test conversion on the landing page before/at launch.

## 9. Open questions to validate (from research gaps)

1. Direct WTP unconfirmed → smoke test before locking price.
2. Provider mix for the ICP (how many need Razorpay/Shopify/Svix vs just Stripe/GitHub) → ship the six, watch which verifiers get used.
3. Hosted‑convenience vs self‑host preference for the paying segment → park self‑host as roadmap.
