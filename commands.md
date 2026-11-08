# hookd — commands

Operational reference for building, testing, running, and shipping hookd.
Keep this updated as the build evolves.

- **Backend:** Go module `whook` in `server/` (Go 1.27).
- **Frontend:** Next.js 16 app in `web/` (React 19, Tailwind v4).
- **Windows note:** use the project-local binaries `web/node_modules/.bin/<tool>` — `npx` here mis-resolves to a global cache.

---

## Prerequisites

```bash
go version      # 1.27+
node -v         # 20+
# Postgres is OPTIONAL for local dev — the server falls back to an in-memory
# store when DATABASE_URL is unset (data not persisted; dev only).
```

---

## Backend (`cd server`)

```bash
go build ./...                      # compile everything
go vet ./...                        # vet
go test ./...                       # run all tests (cached)
go test ./... -count=1              # force a fresh run (bust the cache)
go test ./internal/verify/... -v    # just the verify engine (all providers)
go test -run TestSignedSamplesVerifyAsPass ./internal/samples/...
gofmt -l .                          # list files needing formatting (should be empty)

# Run the server locally with the in-memory store (no DB, dev keys):
#   loads an adjacent .env if present; set env vars to override.
PORT=8099 go run ./cmd/server       # -> http://localhost:8099 ; GET /healthz
# Migrations run automatically on boot when DATABASE_URL is set.
# Standalone migrate binary:
go run ./cmd/migrate                # applies server/migrations/*.sql to DATABASE_URL
```

Required env for production (full list + docs in `server/.env.example`): `DATABASE_URL`,
`SECRET_ENC_KEY` (base64 of 32 bytes), `SESSION_KEY` (≥16 bytes), `ALLOWED_ORIGIN`,
`COOKIE_SECURE`/`COOKIE_SAMESITE`, `GITHUB_CLIENT_ID/SECRET/CALLBACK_URL`. Optional:
`DODO_*` (billing; inert when unset), `SMTP_*`+`EMAIL_FROM` (transactional email; inert when unset).

---

## Frontend (`cd web`)

```bash
npm ci                              # install from the lockfile (node_modules may be absent)
node_modules/.bin/next dev          # dev server -> http://localhost:3000
node_modules/.bin/tsc --noEmit      # typecheck
node_modules/.bin/eslint .          # lint
node_modules/.bin/vitest run        # unit tests
node_modules/.bin/next build        # production build (delete .next first if routes changed)
```

One env var: `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8099`).
At deploy, also set `NEXT_PUBLIC_SITE_URL` (used by OG/sitemap/robots).

---

## Full gate (run before calling anything done)

```bash
# backend
cd server && go build ./... && go vet ./... && go test ./... -count=1
# frontend
cd web && node_modules/.bin/tsc --noEmit && node_modules/.bin/eslint . \
  && node_modules/.bin/vitest run && (rm -rf .next && node_modules/.bin/next build)
```

---

## Run the whole app locally

```bash
# terminal 1 — backend (in-memory store)
cd server && PORT=8099 go run ./cmd/server
# terminal 2 — frontend
cd web && node_modules/.bin/next dev
# open http://localhost:3000  (public pages work; the authed app needs GitHub OAuth configured)
```

Public, no-auth surfaces you can exercise without a login:
`/` `/pricing` `/debugger` `/docs` `/privacy` `/terms` `/support`, the ingest endpoint
`POST /i/{id}` (once an endpoint exists), and `POST /debug/verify`.

---

## End-to-end testing

- **Verify engine, every provider:** `go test ./internal/verify/... -count=1` — each provider
  has sign→verify round-trip, an independently-pinned HMAC vector, tamper/wrong-secret FAIL,
  encoding and (where applicable) timestamp-tolerance tests.
- **Samples verify as PASS, every provider:** `TestSignedSamplesVerifyAsPass` iterates all
  registered providers (and `TestEveryVerifiedProviderHasASample` guards that none lack a sample).
- **Every provider over HTTP `/debug/verify`:**
  `go test ./internal/api/ -run TestDebugVerifyEveryProviderPasses -v -count=1` — signs each
  provider's real sample and asserts PASS (plus tamper→not-PASS) through the public HTTP handler;
  loops `verify.Default.Providers()` so a new provider can't silently skip HTTP coverage.
- **HTTP app flow (capture → verify → replay, authed):** `go test ./internal/app/... -count=1`
  (httptest server + in-memory store + seeded session).
- **Public verify over HTTP, every provider:** `go test ./internal/api/... -run PublicVerify -count=1`.
- **Live binary smoke:**
  ```bash
  curl -s localhost:8099/healthz                        # {"status":"ok"}
  curl -s localhost:8099/debug/verify -H 'Content-Type: application/json' \
    -d '{"provider":"stripe","secret":"whsec_…","headers":{"Stripe-Signature":"t=…,v1=…"},"body":"{…}"}'
  ```
- **Frontend:** `tsc` + `eslint` + `vitest` + `next build`, then a browser pass over the public
  pages above (the `/debugger` page live-exercises `POST /debug/verify`).

---

## Providers

Signature-verification + re-signed replay is supported for these providers
(source of truth: `web/lib/types.ts` `PROVIDERS` and the `server/internal/verify` package):

Stripe · GitHub · Razorpay · Shopify · Slack · Standard Webhooks (Svix/Dodo) · Twilio · Vercel · Lemon Squeezy · Twitch (EventSub)

(10 providers. Twilio is URL-bound — its signature only verifies when the captured
request URL matches what Twilio was configured to call; the debugger exposes a URL field.)

**To add a provider:** create `server/internal/verify/<name>.go` (a `Verifier` + `Signer`
registered via `init()`, mirroring an existing analog), add a `<name>_test.go` with an
independently-pinned vector, add the `Provider` const + `Detect()` case in `verify.go`, a sample
in `server/internal/samples/samples.go`, `validProvider()` in `server/internal/api/endpoints.go`,
then frontend: `web/lib/types.ts` (`Provider` + `PROVIDERS`), `web/lib/providers.ts`
(`PROVIDER_META`, `SIGNATURE_HEADERS`, `PROVIDER_ENCODING`, fix copy), `web/app/debugger/samples.ts`,
and the provider-count copy in `web/components/marketing/hero.tsx` + `faq.tsx` + the agent brief
in `web/app/docs/docs-content.tsx`.

---

## Deployment

See `docs/DEPLOY.md` (Vercel frontend + EC2/Caddy backend + Neon Postgres). Pre-launch checklist
and the cross-site-cookie footgun are documented there.

```bash
# Linux deploy binary (what the EC2/systemd path builds; verified to compile):
cd server && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o server ./cmd/server
```

Docker path:

```bash
cd server && docker compose up -d --build     # API + Caddy (automatic HTTPS)
```

---

## Troubleshooting

- **`web/node_modules` missing** → `cd web && npm ci`.
- **`npx` runs the wrong tool** → use `node_modules/.bin/<tool>` directly.
- **`next dev` says "port in use" / EADDRINUSE after a restart** → the old `next dev` node
  process is still alive; find it (`netstat -ano | findstr :3000`) and `Stop-Process -Id <pid>`.
- **Stale `.next/types` tsc errors after moving/renaming a route** → `rm -rf web/.next` and rebuild.
- **Server exits with a config error** → see `server/internal/config/config.go`; prod requires
  `SECRET_ENC_KEY`/`SESSION_KEY`, and `COOKIE_SAMESITE=none` requires `COOKIE_SECURE=true`.
