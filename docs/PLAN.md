# PLAN.md — Webhook Debugger (Weekly Ship #2)

**Target:** a **paid**, live, public webhook debugging tool. Capture → inspect → **verify signatures + explain why** → replay/re‑sign to a target URL. First‑revenue product.
**Due:** weekly‑ship slot **2026‑11‑19**. Realistic focused build window ≈ 6 working days (Phase 0 de‑risk can run in parallel with RepoMap *now*; full build starts when RepoMap ships ~Nov 12).
**Builder:** all coding + testing by Claude + subagents. User provides: decisions, accounts/keys, deploy approval, and does the X posting.
**Read first:** `AGENTS.md` (rules), `PRODUCT.md` (what/why), `DESIGN.md` (how it looks).

---

## Locked decisions (2026‑11‑03)
- **Scope: fully hosted, no CLI in v1.** We receive every webhook on our server and show it to the user; replay/forward is **server‑side to a target URL** (SSRF‑guarded). Localhost‑forwarding CLI = fast‑follow only if it gets traction. *(User decision.)*
- **Wedge:** signature **verify + plain‑English why** (the lead), plus **replay/re‑sign**. Not a cheaper inspector — a different, higher‑value job.
- **Stack:** **Go backend** (ingest + store + verify engine + replay + authed API + SSE) · **Next.js + Tailwind + shadcn frontend** on Vercel (matches Week‑1) · **Postgres (Neon, always‑on free)**.
- **Billing: Dodo Payments** (merchant‑of‑record; global tax/VAT; India‑friendly). Dodo's subscription webhooks are **Standard‑Webhooks‑signed → verified by our own engine** (dogfood). *(User decision.)*
- **v1 verifiers:** Stripe, GitHub, Razorpay, Shopify, Standard Webhooks (Svix/Dodo), Slack.
- **Price (provisional, validate first):** Free tier + **Pro ~$12/mo** (annual ~$8–9). Smoke‑test WTP before hard‑committing.
- **Hosting (locked, user decision):** backend on **AWS EC2** (always‑on — never sleeps, so no dropped webhooks) · frontend on **Vercel** · Postgres on **Neon** · login via a **GitHub OAuth app**. The always‑on requirement is why we use EC2, not a sleeping free tier.

## Architecture
```
 provider ──POST──▶  Go ingest  /i/{id}   (always-on, public, rate-limited, size-capped)
 (Stripe/GitHub/…)        │ capture raw bytes + headers + meta
                          ▼
                       Postgres (Neon) ── events, endpoints, users, subscriptions, secrets(enc)
                          ▲        │
     browser ◀─ SSE ──────┘        │  verify engine (pure Go, no net) · replay engine (SSRF-guarded)
        │   (authed live stream)   │
        ▼                          ▼
   Next.js (Vercel): landing + inspector app + auth(GitHub OAuth) + Dodo billing
        └── calls Go authed API (JSON) · opens Go SSE with a short-lived token
```
Auth placement (decide in Phase 1, recommend: session/cookie minted on GitHub OAuth; SSE authorized by a short‑lived token). One shared Postgres. Ownership enforced on every endpoint‑scoped route.

## Reuse vs build
| Reuse from `old-ast-parser` / Week‑1 | Build new (greenfield Go) |
|---|---|
| Deploy patterns (`render.yaml`, CI, Dockerfile shape), Next.js+Tailwind+shadcn setup, dataviz palette discipline | Go ingest + store + SSE, the **verify engine** (per‑provider), replay/re‑sign engine, response‑rules, Dodo billing, the whole inspector UI |

This is mostly greenfield — don't force reuse. The real leverage is the installed **skills** (`.agents/skills/`) and the three research docs.

---

## Phase 0 — De‑risk the make‑or‑break bets (can start NOW, parallel with RepoMap)
Prove the trust‑critical and real‑time pieces before building UI around them.
- **Verify engine spike (TDD):** implement + table‑test signature verification for **Stripe + GitHub + Razorpay** against **real known‑good payloads** AND tampered/stale/wrong‑secret ones. Confirm we can name the *actual* failure cause (raw‑body mutation, wrong secret, base64‑vs‑hex, timestamp skew). *This is the product; if it's wrong, nothing else matters.*
- **Ingest + SSE path:** a minimal Go service that captures a POST to `/i/{id}`, stores it, and pushes it to a browser over SSE in <1s. This is the demo GIF's spine.
- **Always‑on hosting smoke test:** deploy the stub to the chosen host; confirm it does **not** sleep and drop a webhook; confirm Neon reachable.
- **Dodo sanity:** read Dodo's **current** API docs (subscriptions, checkout, webhook signing). Confirm checkout + the Standard‑Webhooks signature scheme (knowledge cutoff Jan 2026 — verify live).
- **Done when:** `go test ./verify/...` is green across 3 providers (pass + each failure cause); a real curl to the deployed stub appears in a browser live; Dodo flow understood.

## Phase 1 — Backend core (Go)
- Ingest: capture raw bytes + full headers (order/dupes) + query + meta; size/header caps; per‑endpoint + per‑IP rate limit.
- Storage + API: endpoints CRUD, events list/detail/search/filter, authed JSON API, SSE live stream (authorized), share‑link read endpoint.
- **Verify engine (full six providers)** + auto‑detect from headers; secrets encrypted at rest.
- **Replay/re‑sign engine:** re‑send to target URL, re‑sign (fresh timestamp) or keep original, record attempts + responses; **SSRF guard** (block private/loopback/link‑local/metadata, scheme allowlist, timeout, no private redirects).
- **Response rules + sample sender** per endpoint.
- Auth (GitHub OAuth + email), ownership checks everywhere.
- **Done when:** full API exercised by curl/tests; `go test ./...` + `go vet` green; verify + replay + SSRF cases covered.

## Phase 2 — Frontend (Next.js + Tailwind + shadcn)
Build to `DESIGN.md` ("Graphite & Signal"). Can start against mocked data in parallel with Phase 1.
- Design system first: tokens (§2 DESIGN), fonts (Hanken + Commit/Berkeley Mono), base components, dark/light.
- **Inspector** (two‑pane, live stream, signature panel above tabs, JSON viewer, headers, attempts, ⌘K, keyboard nav, arrival pulse) — the GIF screen.
- **Landing** (product‑in‑hero animating capture→verify→replay, proof row, sections, pricing, FAQ).
- Dashboard/endpoints, endpoint settings, auth screen, pricing, shared‑event view.
- All real states (loading/empty/error/success). Render + eyeball at 390px + desktop.
- **Done when:** `tsc --noEmit` + `next build` + lint pass; `web-design-guidelines` + `anti-ui-slop` finish count pass; live stream animates on real backend.

## Phase 3 — Accounts + billing (Dodo) + plan gating
- Dodo checkout + customer portal; subscription webhooks → **verified by our own engine** → update plan state in Postgres.
- Gate paid features (replay/re‑sign, retention depth, search, response control, sharing, endpoint count) by plan.
- **Done when:** a test purchase flips the account to Pro and unlocks features; subscription webhook verified + handled; downgrade/cancel handled.

## Phase 4 — Deploy + harden
- Backend → always‑on host; frontend → Vercel; DB → Neon. Env/secrets wired.
- Privacy pass: no body logging, secrets encrypted, retention/purge works, share links redaction‑aware.
- Rate limits, abuse caps, warmup/health. Smoke‑test all six providers end‑to‑end (capture → verify → replay).
- **Done when:** public URL works from a clean browser; a real Stripe test webhook is captured + verified + replayed live; no secret leaks in logs.

## Phase 4.5 — Launch assets
- **Demo GIF** leading with the **signature‑verify moment** + a webhook landing live + a 1‑click replay. (This is the whole reach play.)
- Landing copy final; run `landing-page-conversion-audit`. **WTP smoke test:** a Dodo payment link / pre‑order CTA.
- X post + thread (pain → GIF → link → price), README with GIF, OG image, favicon.
- **Done when:** GIF + post drafted, link live, pre‑order path works. **User posts.**

---

## Agent task breakdown (how we parallelize)
- **Verify‑engine agent** (Go, TDD) — Phase 0→1, isolated pure package. Highest‑rigor; table‑driven tests per provider. Independent of everything.
- **Backend‑core agent** (Go) — ingest/store/SSE/API/replay/auth. Depends on verify package's interface.
- **Design‑system + inspector agent** (Next.js) — Phase 2, starts on mocks; owns `DESIGN.md` fidelity + the GIF screen.
- **Landing agent** (Next.js) — parallel with inspector; owns conversion + hero animation.
- **Billing agent** (Dodo) — Phase 3; reads Dodo's live docs first.
- **Review passes** — `code-review` skill on each backend/frontend diff; `web-design-guidelines` + `anti-ui-slop` on UI; a security pass on verify + replay(SSRF) + auth before deploy.
Each agent reads `AGENTS.md` + `PLAN.md` + the relevant doc, keeps scope tight, writes tests, and hands back honestly (see `AGENTS.md` §5, §7).

## Risks & mitigations
- **Always‑on hosting** (free tiers sleep → dropped webhooks) → deploy backend on an always‑on host; verify in Phase 0; health/warmup.
- **Signature verification correctness is trust‑critical** → TDD against real payloads in Phase 0; constant‑time compare; security review before ship. A false "verified" kills the product.
- **$0 competitors + low DIY barrier + crowded space** → win on verify‑explain + re‑signed replay + a genuinely better UI, shipped fast; keep a useful free tier for virality.
- **WTP unvalidated (no direct evidence; Reddit was blocked)** → landing smoke test + Dodo pre‑order before locking price.
- **Privacy objection (PII/payment payloads)** → private/unguessable endpoints, no body logging, encryption at rest, retention/purge; self‑host on roadmap.
- **SSRF via replay target** → strict guard (see `AGENTS.md` §6).
- **Cadence (Week‑1 + Week‑2 overlap)** → run Phase 0 de‑risk now in parallel; cut scope (CLI already deferred), never the date. Flag slippage early.

## What I need from the user
1. **Hosting (decided):** EC2 (backend) · Vercel (frontend) · Neon (Postgres). For building/testing now I need a **Neon dev connection string** (`DATABASE_URL`) so migrations + integration tests can run; EC2 provisioning is for Phase 4 deploy.
2. **GitHub OAuth app** — client id + secret (callback `…/auth/github/callback`). Needed to test login end‑to‑end; the flow is built env‑driven now and unit‑tested with mocks until the creds arrive.
3. **Dodo Payments** account + API keys + webhook signing secret; a product/price created (Pro ~$12/mo).
4. **Provider test secrets / sample payloads** for end‑to‑end testing (e.g. a Stripe test signing secret) — or confirm I should use public fixtures where available.
5. Optional: a domain/subdomain (else default Vercel/host URLs).
6. You **post to X**; I draft the post + thread and record the GIF.

## Status
- ✅ 2026‑11‑03 — **Setup/planning:** research (customer + competitive + UI) done; 9 skills installed; `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `PLAN.md` written.
- ✅ 2026‑11‑03 — **Phase 0 (de‑risk) DONE.** Go 1.27.3 installed; `server/` module scaffolded; verify engine proven (see Phase 1); ingest→SSE path confirmed **<1s** (636µs); server boots, `/healthz` 200. Always‑on host smoke deferred to Phase 4 (EC2).
- ✅ 2026‑11‑03 — **Phase 1 (backend core) DONE.** Built by two parallel subagents (verify‑engine ∥ backend). Full module **green**: `go build`/`go vet`/`go test ./...` all pass, gofmt clean.
  - **verify engine** (`internal/verify`): 6 providers (Stripe, GitHub, Razorpay, Shopify, Standard Webhooks, Slack) verify+sign; 28 tests incl. official vectors (GitHub, Standard Webhooks) + independent HMAC cross‑checks; precise failure causes incl. `body_possibly_altered` + `encoding_mismatch`; constant‑time.
  - **backend** (`internal/{config,cryptox,store,httpx,ingest,sse,api,replay,auth,samples,app}` + `migrations`): pgx/Postgres store + migrations (+ in‑memory Fake for dev), ingest capture, SSE hub, authed JSON API (endpoints CRUD, events list/filter/detail, share link, sample sender, response rules), replay/re‑sign with a hardened **SSRF guard** (DNS‑rebind re‑check + redirect re‑check), GitHub OAuth + signed‑cookie sessions, AES‑256‑GCM secret encryption. DB‑integration + live‑OAuth tests gated on env.
- ✅ 2026‑11‑03 — **Phase 2 (frontend) DONE.** `web/` = Next.js 16 + React 19 + Tailwind v4 + shadcn(base‑ui), built by 3 subagents (foundation → inspector ∥ marketing). Full app **green**: `tsc --noEmit` + `eslint` + `next build` (11 routes) all pass.
  - **Design system** "Graphite & Signal" exact per DESIGN.md: tokens (dark default + light), Hanken Grotesk + **Commit Mono**, 3px/6px radius, two motion durations + reduced‑motion, focus rings, tabular nums. Typed API client + `useEventStream` SSE hook against the real backend.
  - **Screens:** landing (hero = the real inspector animating capture→verify→replay; honest proof numbers; pricing Free/Pro ~$12 + FAQ; ran conversion audit), auth (GitHub), dashboard/endpoints, **inspector** (`/app/[id]`: live stream + arrival pulse, SignatureVerifyPanel above Headers/Body/Attempts/cURL tabs, replay+re‑sign UI with inline SSRF‑error surfacing, ⌘K palette, j/k/r/1‑4 keyboard), endpoint settings, public shared‑event view, dev component gallery.
  - Fixed one integration bug the agents' `tsc`/`eslint` missed (caught by the authoritative `next build`): `/share/[token]` dynamic‑param prerender → wrapped in `<Suspense>` (Partial Prerender).
  - **Known/pending:** visual QA needs a live human render (Chrome ext can't load localhost here; app flows need GitHub OAuth); minor ⌘K redundancy (global CommandBar vs inspector palette) — polish later; swap in a real measured p50 on the hero when available.
- ✅ 2026‑11‑03 — **Phase 3 (billing Dodo + plan gating) DONE (backend + frontend).** Backend `go build`/`go vet`/`go test ./...` green, gofmt clean; frontend `tsc`+`eslint`+`next build` (12 routes) green. Built by two parallel subagents against a shared billing contract.
  - **Dodo client** (`internal/dodo`): `Client` interface (CreateCustomer / CreateCheckoutSession / CreatePortalSession) + `Live` net/http impl. Hosted checkout `POST /checkouts` → `checkout_url`; portal `POST /customers/{id}/customer-portal/session` → `link`. Base URL test/live from `DODO_ENVIRONMENT`; `Authorization: Bearer`.
  - **API contract** (matches the frontend agent's spec): `POST /api/billing/checkout` {plan,interval}→{checkout_url}; `GET /api/billing/portal`→{portal_url} (409 no subscription); `GET /api/me` extended with `plan`+`subscription`; `POST /webhooks/dodo` (public).
  - **Webhooks verified by our OWN engine** (`verify.StandardWebhooks`, dogfood) using `DODO_WEBHOOK_SECRET`; bad sig → 400; idempotent via `processed_webhooks` (webhook‑id); raw body never logged. Event→plan map: active/renewed/plan_changed/on_hold → Pro (on_hold = dunning grace), cancelled/expired/failed → Free.
  - **Plan gating** (`internal/plan`, enforced server‑side, 402 `{"error","upgrade":true}`): free = 2 endpoints / 7‑day retention / verify status‑only / no replay, response‑rules, shares, text‑search; pro = 25 / 90‑day / full verify‑why / all features. Verify "why" omitted from list+detail+SSE for free.
  - **Schema** `migrations/0002_billing.sql`: plan + dodo_customer_id + subscription cols on users + `processed_webhooks`. Store interface + pgx + Fake all extended. 20 new/updated tests (webhook verify+plan, tamper→400, duplicate→applied‑once, gating 402s, verify‑why omission, /api/me plan, checkout/portal with a fake DodoClient).
  - **Billing UI** (`web/`): `/account` page (plan badge, status + renew/cancel date, monthly/annual upgrade→Dodo checkout, Pro→portal, calm 503 "billing not enabled" state); `ApiError.upgrade` on 402 + `billing` client module; reusable NEUTRAL upgrade affordances (`ProLock`/`UpgradePrompt`/`PlanBadge` — never the lime "verified" hue); plan badge in the shell; gated UX on replay, response‑rule editor, share, and a new events text‑search, plus the **verify‑"why" lock** on the signature panel for free users (`lockedWhy` prop; share view + marketing demo pass full detail so they never lock). Pricing CTAs wired (logged‑out → `/login?next=/account`).
- ⏭ **Next:** (a) provide `DATABASE_URL` (Neon) + `GITHUB_CLIENT_ID/SECRET` (+ prod `SECRET_ENC_KEY`/`SESSION_KEY`) to run live end‑to‑end + visual QA; (b) **Dodo go‑live setup** — create Pro product (monthly+annual) in Dodo, set `DODO_API_KEY`/`DODO_WEBHOOK_SECRET`/`DODO_ENVIRONMENT`/`DODO_PRODUCT_ID_MONTHLY`/`DODO_PRODUCT_ID_ANNUAL`/`DODO_SUCCESS_URL`/`DODO_CANCEL_URL`, register the webhook endpoint `…/webhooks/dodo`; (c) optional `code-review` + security pass; (d) **Phase 4 — deploy (EC2+Vercel+Neon)** + **4.5 launch GIF/X post**.
