<div align="center">

# hookd

**Capture, inspect, verify and replay webhooks — and find out *why* a signature failed.**

Point any provider at a stable ingest URL, watch requests land live, and when verification fails hookd tells you the exact cause — then replays the event, re-signed, to any target.

</div>

---

## Why

Every webhook integration hits the same wall: *"why is my signature verification failing?"* Free tools (webhook.site, RequestBin, smee) capture requests but never verify them. Production platforms (Hookdeck, Svix) verify but are priced for scale, not a dev at 2am. **hookd owns the gap: dev-time verify-*explain* + re-signed replay, at an indie price.**

- **Verify with a reason, not a red dot** — `signature_mismatch` because the body bytes differ from what was signed; timestamp outside tolerance (stale/replayed); encoding mismatch. Across **Stripe, GitHub, Razorpay, Shopify, Standard Webhooks (Svix/Dodo) and Slack**.
- **Replay, re-signed** — re-send any captured event to your local tunnel or staging, optionally minting a fresh signature + timestamp from your secret so the receiver accepts it as genuine.
- **Live inspector** — requests stream in over SSE with an arrival pulse; headers (order preserved), pretty/raw body, and every replay attempt with status + latency.
- **REST API + agent-ready** — drive everything over HTTP with an API key; the in-app docs include a one-click **"copy for agents"** brief (MCP server planned).

## Stack

| Layer | Tech |
|---|---|
| **Backend** | Go 1.27 — ingest · AES-256-GCM secret encryption · verify engine · SSRF-guarded replay · GitHub OAuth + signed-cookie sessions · SSE · authed JSON API |
| **Frontend** | Next.js 16 · React 19 · Tailwind v4 · shadcn (base-ui) — the *Graphite & Signal* design system |
| **Database** | Postgres (Neon) — pgx, with an in-memory store for zero-setup local dev |
| **Billing** | Dodo Payments (merchant of record; its own webhooks are Standard-Webhooks-signed and verified by hookd's own engine — dogfooding) |
| **Hosting** | Frontend on Vercel · always-on Go API on EC2 behind Caddy (auto-HTTPS) |

## Repo layout

```
webhook-debugger/
├─ server/                 Go API (module "whook")
│  ├─ cmd/server           entrypoint — runs migrations on boot, serves /healthz
│  ├─ cmd/migrate          standalone migration runner
│  ├─ internal/            verify · ingest · replay · auth · api · sse · store · dodo · …
│  ├─ migrations/          embedded SQL migrations
│  ├─ Dockerfile · docker-compose.yml · deploy/   (see DEPLOY.md)
│  └─ .env.example
├─ web/                    Next.js app
│  ├─ app/                 routes: landing, /login, /app, /app/[id] (inspector),
│  │                       /settings/*, /docs, /pricing, /share/[token]
│  ├─ components/ · lib/
│  └─ .env.example
├─ docs/                   PLAN · PRODUCT · DESIGN · research
├─ DEPLOY.md               production runbook (EC2 + Vercel + Neon) + security posture
└─ AGENTS.md               contributor / agent operating manual
```

## Quick start (local dev)

**Prerequisites:** Go 1.27+, Node 20+. No database required for a first spin — the backend falls back to an in-memory store.

**1. Backend** (`server/`):

```bash
cd server
cp .env.example .env            # optional for a first run; defaults work
PORT=8099 ALLOWED_ORIGIN=http://localhost:3000 go run ./cmd/server
# → listening on :8099, /healthz returns {"status":"ok"}
# (no DATABASE_URL → in-memory store, data not persisted; warns on boot)
```

For the full experience (persistence + login), set `DATABASE_URL` (Neon), generate
`SECRET_ENC_KEY` / `SESSION_KEY`, and add a GitHub OAuth app — see `server/.env.example`.

**2. Frontend** (`web/`):

```bash
cd web
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8099" > .env.local
npm run dev
# → http://localhost:3000
```

**3. Try it:** create an endpoint, then POST to its ingest URL and watch it land live:

```bash
curl http://localhost:8099/i/<endpoint_id> \
  -H "Content-Type: application/json" \
  -d '{"hello":"webhook"}'
```

## API

Authenticate with an API key (created in the app under **settings → api keys**):

```bash
curl http://localhost:8099/api/endpoints \
  -H "Authorization: Bearer whk_live_…"      # or: X-API-Key: whk_live_…
```

The full surface — every route, verify/replay semantics, limits and examples — is in
the in-app docs at `/docs`, which also has a **copy-for-agents** button that exports the
whole thing as a paste-ready brief.

## Tests & build

```bash
# backend
cd server && go build ./... && go vet ./... && go test ./...

# frontend
cd web && npx tsc --noEmit && npx eslint . && npx next build
```

## Deploy

Production topology (Vercel frontend ↔ EC2 API ↔ Neon), a step-by-step runbook — including
the one cross-site cookie setting that otherwise silently breaks login — and the reviewed
security posture are in **[DEPLOY.md](./DEPLOY.md)**.

## Design

*Graphite & Signal*: near-monochrome graphite on near-black `#0B0D0F`, with a single
accent — signal-lime `#B8FF2E` — reserved for the verify **PASS** state and the
new-webhook arrival pulse. Mono-dominant (Commit Mono) + Hanken Grotesk, hairlines over
shadows. Full checklist in `docs/DESIGN.md`. Six built-in themes (hookd, hookd-light,
Dracula, Nord, Tokyo Night, Catppuccin), switchable in-app.

---

<div align="center">
<sub>Part of a <b>weekly ship</b> — one product shipped every week through 2026. Product #2: the first paid one.</sub>
</div>
