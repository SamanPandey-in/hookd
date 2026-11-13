# hookd — self-host plan

> Status: **plan** (written 2026-11-16, hosted launch 2026-11-19). Executable by agents without re-deriving.
> Scope: one Go binary that serves the API + the statically-exported Next app, `docker compose up` with
> Postgres, `HOOKD_MODE=selfhost` (everyone is Pro, no billing), AGPL-3.0 public repo.
> Companion docs: `docs/DEPLOY.md` (hosted runbook), `docs/CLI.md`, `commands.md` (gate commands).

## 0. TL;DR

| Decision | Choice | Why (short) |
|---|---|---|
| License | **AGPL-3.0-only** for `server/` + `web/`; **MIT** for `cli/` (already MIT) | OSI-approved ⇒ "open source" holds on HN/X; the only practical restriction is re-hosting as a service without sharing source — exactly the cannibalisation vector. Plausible / Cal.com / Formbricks / Documenso precedent. |
| Packaging | **Single Go binary** embedding `web/out` (static export) + **Postgres** via `docker compose` (+ optional Caddy profile) | Same-origin kills the cross-site-cookie footgun (`docs/DEPLOY.md:21-26`); pure-Go stays `CGO_ENABLED=0` + distroless (`server/Dockerfile:14-22`). |
| Mode | `HOOKD_MODE=selfhost` | Plan gating off (every user resolves to Pro), Dodo routes unmounted, pricing/upgrade UI hidden, fake store refused. |
| Auth v1 | GitHub OAuth (works today) **or** `HOOKD_ADMIN_PASSWORD` single-admin local login | Zero external setup for the 2-minute path; OAuth stays for teams. v2 = generic OIDC. |
| SQLite | **No** for v1 | Second `store.Store` impl (30 methods, 664 LoC pg + 11 migrations to dialect-port) ≈ 15–20 agent-h + permanent dual maintenance. Postgres container is one line of compose. |
| Timing | Announce at launch (Nov 19) → ship **Wed Nov 26** (week-3 ship) | ~48 agent-hours across 4 parallel lanes; critical path ≈ 4 working days. |

---

## 1. Goals & non-goals

**Goals**
- Serve the **privacy-max segment** named in `docs/PRODUCT.md:107` ("Roadmap (not v1): optional self-host") — devs who will not send PII/payment payloads to a hosted box.
- A growth play: "open source, AGPL, `docker compose up`" is a credible HN/X headline that the hosted launch alone is not.
- One codebase, one image, one `HOOKD_MODE` switch. Hosted (`hookd.dev`, Vercel + EC2 + Neon) keeps working unchanged with `HOOKD_MODE=hosted` (the default).
- Self-host is **fully unlocked** (all Pro features) — a crippled self-host build earns resentment, not revenue.

**Non-goals**
- Not a revenue path. The hosted product stays the money path (`CLAUDE.md` roadmap: "at least one must make money"). No paid self-host license key, no `ee/` folder in v1.
- No support SLA. Community-supported via GitHub Discussions; issue template demands version + logs.
- No SQLite, no Helm chart, no multi-tenant admin UI, no OIDC in v1 (v2 candidates, §4.5).
- No telemetry. The self-host binary makes **zero** outbound calls that are not user-initiated (replay, OAuth, SMTP). An update check is opt-in only (§4.6).

**Cannibalisation guard-rails:** self-host has no managed TLS, no stable public ingest URL unless the user runs a box with a domain, no CLI relay convenience beyond what the CLI already does, and no upgrades without `docker compose pull`. That is the hosted product's value; it needs no artificial feature gap.

---

## 2. Licensing decision

**Recommendation: AGPL-3.0-only** for the repository root (covers `server/`, `web/`, `deploy/`, docs). **MIT** for `cli/` (unchanged; `cli/package.json` already declares `"license": "MIT"`). Contributions under a **DCO** (sign-off), not a CLA — lightest possible for a solo indie; revisit a CLA only if an `ee/` folder is ever added (you need copyright on contributions to relicense them).

| Option | Traction (X/HN) | Protects hosted revenue | Cost | Verdict |
|---|---|---|---|---|
| **AGPL-3.0** | High — OSI-approved, "open source" label survives scrutiny | Yes: anyone re-hosting must publish their modifications; a clone-SaaS is legally unattractive. Internal self-hosters are unaffected (no distribution). | Some corporate "no AGPL" policies — irrelevant for a standalone debugging tool run by devs | **Pick** |
| MIT (whole repo) | Highest | None — a competitor can host `hookd` verbatim, paid, tomorrow | Zero | No: the hosted product is the only revenue plan |
| FSL (Sentry-style, converts to Apache-2.0 after 2 y) | Medium — "source-available", HN reliably flags it; non-OSI | Strongest (explicit non-compete) | Brand-size dependent; a solo indie gets the stigma without Sentry's gravity | No for v1; keep as a fallback if AGPL re-hosting actually happens |
| Open-core (`MIT` + `ee/` proprietary, PostHog/Cal.com) | High | Only what lives in `ee/` | Two licenses, folder discipline, nothing to put in `ee/` today | Later, only with a Team tier |

**What goes in `LICENSE`:** the verbatim GNU AGPL-3.0 text. Add an SPDX header line to `server/cmd/server/main.go` and `web/app/layout.tsx` only (not every file). `cli/LICENSE` = MIT text. README "License" section: *"AGPL-3.0 for the server and web app; MIT for the `hookd` CLI."*

**Trademark note (put in README + `TRADEMARK.md`):** "hookd" and the logo mark are not covered by the AGPL. Forks must not use the name/logo to imply affiliation; "built on hookd" / "a fork of hookd" is fine. Keep `web/lib/brand.ts` names as-is (renaming is a fork's job).

**Dependencies check:** `go.mod` deps are MIT/BSD (chi, pgx, x/oauth2, x/time); `web/package.json` deps are MIT; Commit Mono font is OFL. No license conflicts with AGPL.

---

## 3. Coupling audit — everything that currently assumes "hosted"

Each row: where it lives, what changes, and the flag. New env vars take the `HOOKD_` prefix; existing ones keep their names.

| # | Coupling | file:line | What must change | Flag / mechanism |
|---|---|---|---|---|
| 1 | **GitHub-OAuth-only auth** | `server/internal/auth/github.go:32-37` (provider iface), `:117-190` (login/callback); `server/internal/app/app.go:98-103`; `web/app/login/page.tsx:6,20`; `migrations/0001_init.sql` (`github_id BIGINT NOT NULL UNIQUE`) | Add local single-admin login (§4.5): migration `0012_local_auth.sql` (drop NOT NULL on `github_id`, add `provider TEXT NOT NULL DEFAULT 'github'`), `POST /auth/local/login`, `GET /auth/providers`. OAuth stays optional. | `HOOKD_ADMIN_PASSWORD` (or `HOOKD_ADMIN_PASSWORD_HASH`, bcrypt) |
| 2 | **Plan gating** | `server/internal/plan/plan.go:13-24,66-73`; `server/internal/api/gating.go:13-19` (`userPlan`); call sites `api/endpoints.go:42,51,111,184`, `api/events.go:20,58,98,210,292`, `api/keys.go:34-39` | Introduce `plan.Policy{SelfHost bool, MaxEndpoints, MaxRetentionDays int}` injected into `api.API`; `userPlan()` returns `plan.Pro` when `Policy.SelfHost`. Every gate already routes through `a.userPlan(r)` except `keys.go:34` (`maxAPIKeys`) — route it too. | `HOOKD_MODE=selfhost` |
| 3 | **`/me.limits` + plan in UI** | `server/internal/auth/github.go:208-234`; `web/lib/types.ts:156-178`; `web/app/(app)/app/page.tsx:49-54`; `web/app/(app)/app/[id]/settings/page.tsx:26-31` | `Me` gets `"mode":"hosted"\|"selfhost"`; limits come from the Policy (`HOOKD_MAX_ENDPOINTS` default 100, `HOOKD_MAX_RETENTION_DAYS` default 365, `0` = unlimited). Since plan resolves to `pro`, all `isPro` walls vanish without touching 20 call sites. | `me.mode` |
| 4 | **Dodo billing** | `server/cmd/server/main.go:71-80`; `app.go:73-83,115,124-128`; `api/billing.go:48,112`; `web/app/(app)/layout.tsx:11,89,143-217` (PlanBadge, DunningBanner); `web/app/(app)/account/page.tsx:266,388`; `web/components/marketing/pricing-plans.tsx:82-86` | Selfhost: do **not** mount `/api/billing/*` and `/webhooks/dodo` (404, not 503); log "billing disabled (selfhost)". UI: hide PlanBadge/DunningBanner/billing nav when `me.mode==='selfhost'`; `/settings/billing` renders a "self-hosted — nothing to bill" panel. | `HOOKD_MODE` + `me.mode` |
| 5 | **Vercel / EC2 / Caddy / Neon topology** | `docs/DEPLOY.md:15-19`; `server/docker-compose.yml:11-35`; `server/deploy/Caddyfile:14-24`; `server/.env.example:21` (Neon URL) | New `deploy/selfhost/docker-compose.yml` (postgres + hookd, Caddy under `--profile tls`). Hosted compose untouched. | — |
| 6 | **Cross-origin cookies / CORS / CSRF** | `server/internal/config/config.go:104,161-163,210-212`; `server/internal/httpx/httpx.go:179-224` (`CORS`, `EnforceOrigin`); `web/lib/api.ts:22-23,59,68-70` | Same origin ⇒ `ALLOWED_ORIGIN` **derived** from `HOOKD_PUBLIC_URL`, `COOKIE_SAMESITE=lax`, `COOKIE_SECURE` derived from the URL scheme. Frontend: `NEXT_PUBLIC_API_URL=""` must mean *relative* (today empty falls back to `localhost:8099`, `api.ts:22-23`). Replace `new URL(API_URL + path)` with `new URL(API_URL + path, window.location.origin)`. | `HOOKD_PUBLIC_URL` |
| 7 | **SSRF guard blocks LAN/localhost** — wrong for self-host where the replay target *is* the LAN | `server/internal/replay/ssrf.go:41-45` (`allowPrivate` test-only), `:78-84`, `:116-122`; `replay.go:75` (`NewGuard()`) | `replay.NewGuardWithOptions(GuardOptions{AllowPrivate bool})`. Even when allowed, **always** block cloud-metadata (`169.254.169.254`, `fd00:ec2::254`, `:168-181`) and `isBlockedHostname` `metadata*`. Loud boot warning when enabled. Default **false** in both modes. | `HOOKD_ALLOW_PRIVATE_TARGETS=true` |
| 8 | **External base URL + XFF trust** (unconditional trust of `X-Forwarded-*`) | `httpx.go:226-260` (`ClientIP`, `ExternalBaseURL`); consumers `ingest/ingest.go:51,90`, `api/endpoints.go:260` (sample URL), `auth/github.go:182` (activity IP) | Add `httpx.ProxyPolicy{TrustProxy bool, PublicURL string}`: if `!TrustProxy` ignore forwarded headers; `ExternalBaseURL` prefers `PublicURL` when set (fixes Twilio/sample URLs when the binary is exposed directly). Without this, a direct-exposed self-host lets senders spoof XFF ⇒ per-IP rate-limit bypass. | `HOOKD_TRUST_PROXY` (default `true` in compose-with-Caddy, `false` otherwise), `HOOKD_PUBLIC_URL` |
| 9 | **Transactional email** | `server/internal/email/email.go:43-69`; `app.go:65-71` | No change — inert by default; only used for dunning, which is off in selfhost. Document SMTP vars as optional. | existing `SMTP_*` |
| 10 | **Retention purger** (caps by owner plan) | `server/internal/retention/retention.go:53-70`; `config.go:152-159` | `Cutoff` takes the Policy: selfhost cap = `HOOKD_MAX_RETENTION_DAYS` (0 ⇒ skip plan clamp, honour the endpoint's own `retention_days`). Purger keeps running (`PURGE_INTERVAL_MINUTES`). | `HOOKD_MAX_RETENTION_DAYS` |
| 11 | **Rate limits** | `config.go:122-133`; `app.go:40-44`; `ingest.go:50-56` | Keep; document `INGEST_*` / `IP_*`. Depends on #8 being correct. | existing |
| 12 | **Samples** | `api/endpoints.go:258-260` | Fixed by #8 (`ExternalBaseURL`). | — |
| 13 | **Public debugger** `/debug/verify` | `app.go:108-112`; `web/lib/debug.ts:9-10` (own `DEBUG_API_URL`) | Keep (store-free, no I/O). Apply the same relative-URL fix as #6. | — |
| 14 | **SSE stream** | `api/stream.go:26-30`; `deploy/Caddyfile:19` (`flush_interval -1`); `web/lib/use-event-stream.ts` | Same-origin `EventSource` works unproxied. Embedded file server must not wrap the API with a buffering writer. Caddy profile keeps `flush_interval -1`. | — |
| 15 | **Fake store fallback + dev keys** | `main.go:43-56`; `config.go:166` (`Dev = DatabaseURL == ""`), `:168-190` | Selfhost: `DATABASE_URL` **required** (fail fast); dev-insecure keys **forbidden**. If `SECRET_ENC_KEY`/`SESSION_KEY` unset, generate once and persist to `$HOOKD_DATA_DIR/keys.env` (0600, compose volume) — this is what makes the 2-minute path real. | `HOOKD_DATA_DIR` (default `/data`) |
| 16 | **OAuth callback default** | `config.go:107` (`localhost:8080` default) | Default to `${HOOKD_PUBLIC_URL}/auth/github/callback`. | derived |
| 17 | **Marketing/pricing surfaces** | `web/app/pricing/page.tsx`; `web/app/page.tsx:31` (`#pricing` section); `web/components/marketing/marketing-nav.tsx:34`; `footer.tsx:13`; `web/components/settings/settings-nav.tsx` (billing item); `web/components/ui/upgrade.tsx:15` (`UPGRADE_HREF`) | Build-time `NEXT_PUBLIC_HOOKD_MODE=selfhost`: `/pricing` renders the "hosted vs self-host" block (§7.4) instead of checkout; nav/footer drop "pricing"; landing drops the pricing section. Runtime `me.mode` hides in-app billing nav. | `NEXT_PUBLIC_HOOKD_MODE` |
| 18 | **Dynamic routes under static export** | `web/app/(app)/app/[id]/page.tsx:5,55`, `[id]/settings/page.tsx:5,24` (`useParams`), `web/app/share/[token]/page.tsx:7-22` | See §4.3 — no `generateStaticParams` ⇒ `next build` fails with `output:'export'`. | `NEXT_OUTPUT=export` |
| 19 | **Baked `NEXT_PUBLIC_SITE_URL`** | `web/app/layout.tsx:22-24`; `robots.ts:3-5`; `sitemap.ts:3-5` | Irrelevant for private installs; Go serves `/robots.txt` = `Disallow: /` in selfhost, overriding the exported file. | — |
| 20 | **Dockerfile builds server only** | `server/Dockerfile:1-31`; `.dockerignore` | New root `Dockerfile`: `node:20-alpine` stage (`next build` with `NEXT_OUTPUT=export`) → `golang:1.27-alpine` stage (embed `web/out`) → distroless. | — |
| 21 | **CLI default API URL** | `docs/CLI.md:24` (`http://localhost:8099`) | No code change; docs: `--api https://hookd.example.com` / `HOOKD_API_URL`. | — |
| 22 | **API key prefix** `whk_live_` | `api/keys.go:23` | Cosmetic; leave. | — |

---

## 4. Target architecture

### 4.1 Topology

```
docker compose up -d
┌────────────────────────────────────────────────────────┐
│ hookd (one Go binary, :8099)                            │
│   /api/*  /auth/*  /i/*  /share/*  /debug/verify  SSE  │
│   /*  → embedded web/out (static Next export, SPA)     │
│   migrations on boot · retention purger · key autogen  │
└──────────────┬─────────────────────────────────────────┘
               │ DATABASE_URL (pgx)
        postgres:16 (volume)           [optional --profile tls] caddy:2 → :443
```

Same origin for app + API ⇒ `SameSite=Lax` cookies, no CORS, no `NEXT_PUBLIC_API_URL` to get wrong.

### 4.2 Go: `HOOKD_MODE=selfhost`

| Area | Behaviour in selfhost |
|---|---|
| Config (`config.go`) | `Mode string` (`hosted` default). `SelfHost()` helper. Requires `DATABASE_URL`, `HOOKD_PUBLIC_URL`. Derives `AllowedOrigin`, `CookieSecure` (scheme), `CookieSameSite=Lax`, `GitHubCallbackURL`. Refuses dev-insecure keys; autogen to `HOOKD_DATA_DIR` if unset. |
| Plan (`plan.go` + new `Policy`) | `Policy.Effective(userPlan) = Pro`; caps from env. `/me` emits `mode`, limits from policy. |
| Billing | `app.go`: skip mounting `/api/billing` + `/webhooks/dodo`; `dodo.Client` nil; no Dodo warnings logged. |
| Auth | GitHub OAuth if configured; local admin if `HOOKD_ADMIN_PASSWORD*` set; boot fails if neither. `GET /auth/providers` → `{"github":bool,"local":bool}`. |
| Replay | `HOOKD_ALLOW_PRIVATE_TARGETS` (§3 #7). |
| Proxy | `HOOKD_TRUST_PROXY` (§3 #8). |
| Static | `//go:embed all:web/out` in a new package `server/internal/webui` (needs the `all:` prefix: Next emits `_next/`). Handler: exact file → `path + ".html"` → dynamic-route rewrites (§4.3) → `404.html`. Registered **after** all API routes as `r.NotFound(...)`. `Cache-Control: immutable` for `/_next/static/*`. `/robots.txt` → `Disallow: /`. |
| Build tag | `webui` package compiles with an empty FS when `web/out` is absent (`//go:build !embedweb`) so `go test ./...` keeps working without a Node build. Image build uses `-tags embedweb`. |

### 4.3 Next: static export feasibility (audit of `web/app`)

| Route / file | Server feature | Under `output:'export'` | Fix |
|---|---|---|---|
| `app/(app)/app/[id]/page.tsx`, `[id]/settings/page.tsx` | dynamic segment, `useParams` (`page.tsx:55`, `settings/page.tsx:24`) | **Build error** (no `generateStaticParams`) | Add a thin server `page.tsx` wrapper per route: `export const dynamicParams = !IS_EXPORT; export function generateStaticParams(){ return IS_EXPORT ? [{id:'_'}] : [] }` (`IS_EXPORT = process.env.NEXT_OUTPUT==='export'`). Hosted keeps normal SSR. Client component resolves the id as `useParams().id === '_' ? window.location.pathname.split('/')[2] : id`. Go rewrites `/app/<x>` → `app/_.html`, `/app/<x>/settings` → `app/_/settings.html` (+ `.txt` RSC payloads for client nav). |
| `app/share/[token]/page.tsx` | async `params` in a Server Component (`:19-22`) | **Build error** | Same wrapper trick with `token:'_'`; `ShareView` reads the token from `window.location` when `_`. Go rewrites `/share/<t>` → `share/_.html`. (Old hosted share URLs unchanged.) |
| `app/opengraph-image.tsx`, `app/apple-icon.tsx` | `ImageResponse` route handlers, no params | Prerendered at build (static route handlers are allowed; only `Request`-dependent ones are not) | None expected. Fallback if the build complains: `export const dynamic = 'force-static'`; last resort: static PNGs in `public/`. |
| `app/sitemap.ts`, `robots.ts`, `manifest.ts` | static metadata routes | Supported | Go overrides `/robots.txt` in selfhost. |
| `app/layout.tsx` `next/font/google` | fetched at build | Supported (CI needs network) | — |
| `next/image` | — | not used (grep: none) | set `images.unoptimized: true` anyway |
| `(app)/layout.tsx`, `login`, `settings/*`, `debugger`, `docs` | client-only, `/me` at runtime | Supported | — |
| `next.config.ts:13-14` (`cacheComponents:false`) | — | compatible | add `output: IS_EXPORT ? 'export' : undefined`, `trailingSlash: false` |

**Spike first (N1, 2 h time-box):** verify the `_` placeholder + Go rewrite pattern on Next 16.4 (client nav to `/app/abc` must load `app/_.txt` and render the right id). If it fails, **fallback B**: convert the three routes to query-string routes (`/app/e?id=…`, `/share?t=…`) read via `useSearchParams` in a Suspense boundary, and keep `/share/{token}` working on hosted via a Go redirect. Decide on day 1 of the Next lane.

### 4.4 Database: Postgres required; SQLite evaluated and declined (v1)

- `store.Store` has 30 methods (`store/store.go:266-339`); `postgres.go` is 664 lines; 11 migrations use `BYTEA`, `JSONB`, `BIGSERIAL`, `TIMESTAMPTZ`, partial indexes, `ILIKE`/text search. A SQLite port (modernc.org/sqlite to stay cgo-free) is a second dialect for every future migration plus `postgres_integration_test.go` duplicated. Estimate **15–20 agent-hours** + ongoing tax. Not worth it until self-host demand is proven.
- `store.NewFake()` stays **dev/test only**; selfhost refuses to boot without `DATABASE_URL` (§3 #15).
- Migrations keep running on boot (`main.go:48`); `cmd/migrate` ships in the image for manual runs.

### 4.5 Auth for self-host

| Option | Works today? | Friction | Verdict |
|---|---|---|---|
| (a) GitHub OAuth app per install | Yes (`GITHUB_*`) | Register an OAuth app, exact callback URL (the #1 self-host support ticket for Hoppscotch) | Keep as the **team** option |
| (b) Single-admin local login (`HOOKD_ADMIN_PASSWORD`) | No — ~4 h | One env var | **v1 default**. One `users` row (`provider='local'`, `login='admin'`), bcrypt compare (or constant-time compare for plaintext env), same signed cookie (`auth/session.go`). Rate-limit the login route with the existing `httpx.RateLimiter`. |
| (c) Generic OIDC (`OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET`) | No — ~6 h | Works with Google/Okta/Authentik/Keycloak | **v2** — multi-user self-host without GitHub. |
| Magic link via SMTP | No | Needs working SMTP first | No (SMTP is the thing self-hosters never have on day one) |

### 4.6 Telemetry & updates

None by default. Opt-in `HOOKD_CHECK_UPDATES=true` fetches `https://hookd.dev/version.json` once a day and logs a line; honours `DO_NOT_TRACK=1`. `/healthz` gains `"version"` (ldflags `-X main.version`).

---

## 5. Work breakdown (parallel lanes, disjoint file ownership)

Gate for every task: the `commands.md` full gate — `cd server && go build ./... && go vet ./... && go test ./... -count=1` · `cd web && node_modules/.bin/tsc --noEmit && node_modules/.bin/eslint . && node_modules/.bin/vitest run && node_modules/.bin/next build`. Plus the new export build: `NEXT_OUTPUT=export node_modules/.bin/next build` (added to the gate by N1).

### Phase 0 — decide & scrub (human + docs lane, ~4 h, can land before Nov 19)

| ID | Task | Files | Acceptance |
|---|---|---|---|
| S1 | Add `LICENSE` (AGPL-3.0), `cli/LICENSE` (MIT), `TRADEMARK.md`, README license section | root, `cli/` | Files present; `cli/package.json` license unchanged |
| S2 | Repo scrub (§6.2) | see list | `git grep -iE "neon.tech|saman|whsec_|dodo_[a-z]*_key|ghp_"` is empty; no `.env`, zips, `.next`, `tsbuildinfo` |
| S3 | Rotate every secret present in `server/.env` (GitHub client secret, Dodo key + webhook secret, DB password) | external | New values in the hosted deploy only |

### Phase 1 — Go lane (owner: `server/**`, ~18 h)

| ID | Task | Files | Acceptance |
|---|---|---|---|
| G1 | `HOOKD_MODE`, `HOOKD_PUBLIC_URL`, derivations, selfhost fail-fast, key autogen to `HOOKD_DATA_DIR` | `config/config.go`, `config/config_test.go`, `cmd/server/main.go` | Tests: selfhost w/o DB errors; w/o auth errors; derived origin/callback/secure correct; keys persisted 0600 and reloaded |
| G2 | `plan.Policy`; thread through `api.API`, `auth.Handlers.Me`, `retention.Purger` | `plan/plan.go`, `api/gating.go`, `api/keys.go:34`, `auth/github.go:201-236`, `retention/retention.go` + tests | `gating_test.go`: selfhost user with `plan='free'` passes every gate; `/me` has `mode`, limits from policy; retention honours `0 = unlimited` |
| G3 | SSRF opt-out | `replay/ssrf.go`, `replay/replay.go:75`, `ssrf_test.go` | Allow-private permits `10.0.0.5`/`localhost`; **still** blocks `169.254.169.254`, `fd00:ec2::254`, `metadata.google.internal` |
| G4 | Proxy policy | `httpx/httpx.go:226-260`, `httpx_test.go`, wire in `app.go` | `TrustProxy=false` ignores XFF/XFH; `PublicURL` wins in `ExternalBaseURL` |
| G5 | Local admin auth + `/auth/providers` + migration 0012 | `auth/local.go` (new), `auth/auth_test.go`, `app/app.go:98-103`, `store/store.go` (`UpsertLocalUser`), `store/postgres.go`, `store/fake.go`, `migrations/0012_local_auth.sql` | Login sets the same cookie; wrong password 401 + rate-limited; `/auth/providers` reflects config; `postgres_integration_test.go` passes with the new migration |
| G6 | Embedded web UI server + `/robots.txt` override | `internal/webui/{webui.go,embed_on.go,embed_off.go}`, `app/app.go` (NotFound handler), `deploy/selfhost/robots.txt` | With `-tags embedweb` and a `web/out` present: `/` 200 html, `/app/anything` serves `app/_.html`, `/_next/static/*` immutable; without the tag: `/` 404 JSON as today |
| G7 | Unmount billing in selfhost; `/healthz` version | `app/app.go:73-83,115,124-128`, `cmd/server/main.go` | `/api/billing/checkout` → 404 in selfhost, 503 in hosted-without-Dodo (unchanged) |

### Phase 1 — Next lane (owner: `web/**`, ~13 h)

| ID | Task | Files | Acceptance |
|---|---|---|---|
| N1 | Export config + dynamic-route wrappers (spike per §4.3) | `next.config.ts`, `app/(app)/app/[id]/{page,settings/page}.tsx` (split into server wrapper + client component), `app/share/[token]/page.tsx` | `NEXT_OUTPUT=export next build` succeeds; `out/app/_.html`, `out/app/_/settings.html`, `out/share/_.html` exist; hosted `next build` unchanged |
| N2 | Same-origin API base | `lib/api.ts:22-23,59`, `lib/debug.ts:9-10`, `lib/profile.ts:41`, `ingestURL`/`streamURL`/`bodyURL`/`exportURL` (`api.ts:164,283,292,323`) | `NEXT_PUBLIC_API_URL=""` ⇒ relative fetches; copyable ingest URL is absolute via `window.location.origin`; `api.test.ts` covers both |
| N3 | Mode-aware UI | `lib/types.ts` (`Me.mode`), `app/(app)/layout.tsx:89,100-102`, `components/settings/settings-nav.tsx`, `app/(app)/account/page.tsx`, `app/(app)/settings/billing/page.tsx`, `components/ui/upgrade.tsx` | With `mode:'selfhost'`: no PlanBadge, no dunning banner, no billing nav, account page shows "self-hosted" panel; vitest snapshot for `useMe` consumers |
| N4 | Login page local-password form | `app/login/page.tsx`, `lib/api.ts` (`auth.providers`, `auth.localLogin`) | Form shown only when `/auth/providers.local`; GitHub button only when `.github` |
| N5 | Marketing in selfhost build | `app/pricing/page.tsx`, `app/page.tsx:31`, `components/marketing/{marketing-nav,footer}.tsx` | `NEXT_PUBLIC_HOOKD_MODE=selfhost`: `/pricing` renders §7.4 comparison, no checkout; nav/footer/landing drop pricing |

### Phase 2 — Packaging lane (owner: root `Dockerfile`, `deploy/selfhost/**`, `.goreleaser.yaml`, `.github/**`, ~11 h; depends on G6 + N1)

| ID | Task | Files | Acceptance |
|---|---|---|---|
| P1 | Root multi-stage `Dockerfile` (node → go `-tags embedweb` → distroless), `.dockerignore` | root | `docker build .` < 5 min; image < 60 MB; runs as nonroot |
| P2 | `deploy/selfhost/docker-compose.yml` (postgres:16 + hookd + `tls` profile Caddy), `deploy/selfhost/.env.example`, `deploy/selfhost/Caddyfile` | `deploy/selfhost/` | `docker compose up -d` with only `HOOKD_ADMIN_PASSWORD` + `HOOKD_PUBLIC_URL` set reaches `/healthz` ok |
| P3 | GoReleaser + GH Actions release: binaries (linux/darwin/windows, amd64/arm64) + `ghcr.io/<owner>/hookd:{tag,latest}` multi-arch (`dockers_v2`/buildx + QEMU), cosign optional | `.goreleaser.yaml`, `.github/workflows/release.yml` | Tag `v0.1.0` produces assets + manifest list with both arches |
| P4 | CI smoke (§5.1) | `.github/workflows/ci.yml`, `deploy/selfhost/smoke.sh` | Green on PRs; fails if verify ≠ `pass` |

### Phase 3 — Docs lane (owner: `README.md`, `docs/SELF_HOST_GUIDE.md`, `SECURITY.md`, `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/**`, ~6 h)

| ID | Task | Acceptance |
|---|---|---|
| D1 | README "Self-host in 2 minutes" (§7.1) + hosted-vs-self-host block | Copy-paste works on a fresh VM |
| D2 | `docs/SELF_HOST_GUIDE.md` (public): env reference (§7.2), upgrade (§7.3), backup, TLS, reverse-proxy notes, FAQ | Every env var in `config.go` appears once |
| D3 | `SECURITY.md`, `CONTRIBUTING.md` (DCO), issue templates (bug needs `hookd --version` + `docker compose logs`), Discussions enabled | Files present |
| D4 | `docs/DEPLOY.md` → split: public hosted-topology notes vs private runbook (move the checklist with the personal login to the private repo) | No personal data in public docs |

### 5.1 Test strategy: compose smoke in CI

```bash
# deploy/selfhost/smoke.sh — run against `docker compose -f deploy/selfhost/docker-compose.yml up -d --build`
B=http://localhost:8099; J=$(mktemp)
curl -fs $B/healthz | grep -q '"ok"'
curl -fs -c $J -X POST $B/auth/local/login -H 'content-type: application/json' -d '{"password":"'"$HOOKD_ADMIN_PASSWORD"'"}'
curl -fs -b $J $B/api/me | grep -q '"mode":"selfhost"' && curl -fs -b $J $B/api/me | grep -q '"plan":"pro"'
EP=$(curl -fs -b $J -X POST $B/api/endpoints -H 'content-type: application/json' -d '{"name":"smoke","provider":"stripe"}' | jq -r .id)
curl -fs -b $J -X PUT $B/api/endpoints/$EP/secret -H 'content-type: application/json' -d '{"secret":"whsec_smoke"}'
BODY='{"id":"evt_1","type":"charge.succeeded"}'; T=$(date +%s)
SIG=$(printf '%s.%s' "$T" "$BODY" | openssl dgst -sha256 -hmac whsec_smoke | awk '{print $NF}')
curl -fs -X POST $B/i/$EP -H "Stripe-Signature: t=$T,v1=$SIG" -H 'content-type: application/json' -d "$BODY"
curl -fs -b $J "$B/api/endpoints/$EP/events" | jq -e '.events[0].verify_status=="pass" and .events[0].verify_cause!=null'
curl -fs $B/ | grep -q '<html'            # embedded UI served
curl -fs $B/app/$EP | grep -q '<html'     # dynamic-route rewrite
```

Also: `go test ./... -count=1` with `-tags embedweb` after a `web/out` build, and a hosted-mode regression (`HOOKD_MODE` unset ⇒ `app_test.go` unchanged). Stripe scheme reference: `server/internal/verify/stripe.go` (`t=<ts>,v1=hex(HMAC-SHA256(secret,"t.body"))`, `docs/CLI.md:104`).

---

## 6. Repo strategy

### 6.1 Monorepo, new public repo

Keep the monorepo (`server/`, `web/`, `cli/`, `deploy/`, `docs/`): one image, one version, the CLI lives beside the API it targets. Publish as a **new** public repo (`<owner>/hookd`) created from a scrubbed working tree with fresh history (this checkout is not a git repo — `git init` from clean state avoids history rewriting). The private repo keeps the strategy docs and the hosted runbook.

### 6.2 Scrub list (before the first public push)

| Remove / move private | Why |
|---|---|
| `server/.env` (live `DATABASE_URL`, `GITHUB_CLIENT_SECRET`, `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`…) and `web/.env.local` | secrets (gitignored, but do not copy into the new tree; rotate anyway — S3) |
| `v2-nofr.zip`, `web/v2-fr.zip`, `web/tsconfig.tsbuildinfo`, `web/.next/`, `skills-lock.json`, `.agents/` | build junk / tooling state |
| `docs/PLAN.md`, `docs/IMPR_PLAN.md`, `docs/UX_PLAN.md`, `docs/research/*` (customer research, competitive analysis, UI inspiration), `docs/PRODUCT.md` (WTP, pricing strategy, ICP) | strategy — keep private |
| `docs/DEPLOY.md:172-178` (`UPDATE users … WHERE login='saman-rez'`), Neon references in `.env.example:21` | personal data / hosted-specific |
| `AGENTS.md` §0 mission framing, `web/README.md` (create-next-app boilerplate) | rewrite for contributors |
| Keep public: `docs/DESIGN.md` (contributor value), `docs/CLI.md`, `commands.md`, `docs/SELF_HOST_GUIDE.md` (new) | — |

Add: root `.gitignore` already covers `.env*`, `node_modules`, `.next`, `out/`; add `web/out/` explicitly and `/dist/` for GoReleaser. `.gitattributes` fine.

### 6.3 Community files

`CONTRIBUTING.md` (DCO sign-off, run the gate, small PRs, no new providers without a pinned vector — see `commands.md:128-135`), `SECURITY.md` (private disclosure email, 90-day window, what's in scope: ingest, replay/SSRF, auth), `.github/ISSUE_TEMPLATE/{bug,self-host-help}.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, Discussions on, Issues on.

### 6.4 Versioning & release

SemVer tags `vX.Y.Z` on the monorepo (the CLI keeps its own npm version). GoReleaser builds binaries + `ghcr.io/<owner>/hookd:<tag>`, `:latest`, multi-arch (`linux/amd64`, `linux/arm64`). Image contains `server` + `migrate` + embedded UI. Changelog from conventional commits. The hosted deploy pulls the same image (one artifact for both modes).

---

## 7. Docs for self-hosters

### 7.1 README "Self-host in 2 minutes" (outline)

```bash
mkdir hookd && cd hookd
curl -fsSLO https://raw.githubusercontent.com/<owner>/hookd/main/deploy/selfhost/docker-compose.yml
curl -fsSL  https://raw.githubusercontent.com/<owner>/hookd/main/deploy/selfhost/.env.example -o .env
# edit .env: HOOKD_PUBLIC_URL=https://hooks.example.com  HOOKD_ADMIN_PASSWORD=<strong>
docker compose up -d            # add: --profile tls  for automatic HTTPS via Caddy (ports 80/443, DNS A record)
open $HOOKD_PUBLIC_URL          # sign in with the admin password → create an endpoint → point Stripe at it
```
Then: "Replay to your LAN? set `HOOKD_ALLOW_PRIVATE_TARGETS=true` (read the warning)". "Team login? configure a GitHub OAuth app (callback `$HOOKD_PUBLIC_URL/auth/github/callback`)". "Forward to localhost: `npx hookd listen <id> --forward http://localhost:3000 --api $HOOKD_PUBLIC_URL`". Add a **Deploy on Railway** template button (Railway templates = lowest-friction one-click; Render Blueprint `render.yaml` second; Fly has no button) once the image is on GHCR.

### 7.2 Env var reference (self-host)

| Var | Required | Default | Notes |
|---|---|---|---|
| `HOOKD_MODE` | yes | `hosted` | set `selfhost` |
| `HOOKD_PUBLIC_URL` | yes | — | scheme+host users reach; derives origin, cookie Secure, OAuth callback, ingest URLs |
| `DATABASE_URL` | yes | — | compose sets `postgres://hookd:…@db:5432/hookd` |
| `HOOKD_ADMIN_PASSWORD` / `_HASH` | one of auth | — | local admin login; or configure `GITHUB_CLIENT_ID/SECRET` |
| `SECRET_ENC_KEY`, `SESSION_KEY` | no | autogen → `$HOOKD_DATA_DIR/keys.env` | **back this file up**: losing `SECRET_ENC_KEY` orphans every stored signing secret |
| `HOOKD_DATA_DIR` | no | `/data` | compose volume |
| `HOOKD_TRUST_PROXY` | no | `false` (`true` in the tls profile) | trust `X-Forwarded-*` |
| `HOOKD_ALLOW_PRIVATE_TARGETS` | no | `false` | replay to LAN/localhost; metadata IPs always blocked |
| `HOOKD_MAX_ENDPOINTS`, `HOOKD_MAX_RETENTION_DAYS` | no | `100`, `365` | `0` = unlimited |
| `PURGE_INTERVAL_MINUTES`, `MAX_BODY_BYTES`, `INGEST_*`, `IP_*`, `REPLAY_TIMEOUT_SECONDS`, `MAX_REPLAY_RESP_BODY` | no | as `config.go:119-141,152` | tuning |
| `SMTP_*`, `EMAIL_FROM` | no | inert | unused in selfhost today |
| `HOOKD_CHECK_UPDATES`, `DO_NOT_TRACK` | no | off / honoured | §4.6 |
| `PORT`, `BIND_ADDR` | no | `8099`, all | — |

### 7.3 Upgrade & backup

Upgrade: `docker compose pull && docker compose up -d` — migrations run on boot (`main.go:48`), idempotent (`store/migrate.go:16-69`), each file in a transaction. Pin a tag in compose (`image: ghcr.io/<owner>/hookd:v0.2.0`) and read the release notes; breaking migrations are flagged `[migration]` in the changelog. Rollback = previous tag + DB restore (migrations are forward-only).
Backup: `docker compose exec db pg_dump -U hookd hookd > hookd-$(date +%F).sql` + the `hookd_data` volume (`keys.env`). Restore order: volume, then DB, then start.

### 7.4 "Hosted vs self-host" block (pricing page + README)

| | hookd.dev (hosted) | Self-host |
|---|---|---|
| Price | Free / Pro $12 mo | Free (AGPL) — your server, your bill |
| Features | Free tier gated; Pro unlocks all | **All Pro features**, no gating |
| Ingest URL + TLS | stable, managed, instant | you provide a domain + TLS (Caddy profile included) |
| Updates | automatic | `docker compose pull` |
| Data | encrypted at rest on our DB | never leaves your network |
| Auth | GitHub | admin password, GitHub OAuth app, (OIDC v2) |
| Support | email | community (Discussions) |
| Best for | solo devs who want zero ops | teams with PII/payment payloads, air-gapped staging |

---

## 8. Effort & timing

| Lane | Agent-hours | Depends on |
|---|---|---|
| Phase 0 scrub + license | 4 | — |
| Go | 18 | — |
| Next | 13 | G2's `/me.mode` shape (agree the JSON on day 1; mock meanwhile) |
| Packaging | 11 | G6 + N1 |
| Docs | 6 | P2 (final compose) |
| **Total** | **~52** | critical path: G1→G2→G6 ‖ N1→N2→N3 → P1→P2→P4 → D1/D2 ≈ **4 working days** with lanes in parallel |

**Calendar (recommended):**
- **Nov 17–18:** Phase 0 only if the Nov 19 launch checklist (`docs/DEPLOY.md:163-180`) is already green; otherwise Nov 20. Do not let scrub work touch launch day.
- **Nov 19 (launch post):** one line — *"AGPL self-host (`docker compose up`) ships next week — repo goes public then."* Do not publish the repo on launch day unless Phase 0 landed; a half-scrubbed public repo is worse than none.
- **Nov 20–25:** Phases 1–3 in parallel; N1 spike first thing Nov 20.
- **Wed Nov 26:** ship self-host as the week-3 ship (repo public, `v0.1.0` tag, GHCR image, launch post with a GIF of `docker compose up` → first webhook captured → verify PASS). Slip plan: Dec 3 if launch-week fires eat >1 day.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Support burden** (self-host tickets drown a solo founder) | "Community-supported" banner in README; issue template requires version + `docker compose logs`; FAQ for the top 5 (callback URL, cookies/HTTPS, SSRF flag, lost keys, proxy headers); no DMs/email support for self-host; Discussions not Issues for questions |
| **Ingest exposed without TLS** (self-hosters put the binary on `:8099` on a public IP; secrets and payloads in clear; cookie `Secure` off) | Caddy `tls` profile is the documented default for public installs; boot warning when `HOOKD_PUBLIC_URL` is `http://` and not localhost/private; `COOKIE_SECURE` derived from scheme; README states "never expose 8099 directly" |
| **SSRF flag footgun** (`HOOKD_ALLOW_PRIVATE_TARGETS=true` on a cloud VM ⇒ replay reaches metadata/internal services) | Metadata IPs + `*.internal` blocked even when enabled (G3 test); loud boot warning; default false; docs explain the blast radius; replay stays session-only + owner-scoped |
| **XFF spoofing** when `HOOKD_TRUST_PROXY=true` but the binary is reachable directly | Default false; compose tls profile keeps the API on the internal network only (as `server/docker-compose.yml:14-17`) |
| **Lost `SECRET_ENC_KEY`** after autogen (volume deleted) | Key file in the data volume, backup docs; boot logs its path once; `/healthz` reports `"keys":"file"` vs `"env"` |
| **Static-export regressions** on every Next upgrade | `NEXT_OUTPUT=export next build` in the CI gate + the compose smoke (P4) |
| **License confusion** ("is the CLI AGPL?", "can my company use it?") | README FAQ; SPDX headers; CLI explicitly MIT; `TRADEMARK.md` |
| **Cannibalisation** of Pro | Self-host targets users who would not pay hosted anyway (privacy-max); hosted keeps managed TLS/URL/updates; watch the metric: self-host stars vs Pro signups over 30 days; if a SaaS clone appears, AGPL §13 applies and FSL remains a fallback for future versions |
| **Hosted regression** from mode plumbing | Every Phase 1 task keeps `HOOKD_MODE` unset ⇒ byte-identical behaviour; `app_test.go` + `gating_test.go` run in both modes |
| **Scope creep** (SQLite, Helm, OIDC requests on day 1) | Pin a public ROADMAP.md: v1 = compose + Postgres + admin/GitHub; v2 = OIDC; "SQLite: not planned" |
