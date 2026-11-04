# Deploying hookd

Production topology:

```
  ┌────────────────────┐   HTTPS (fetch, credentials)   ┌──────────────────────┐
  │  Vercel (frontend) │ ─────────────────────────────▶ │  EC2 (Go API, always │
  │  Next.js 16        │ ◀───────── Set-Cookie ──────── │  on) behind Caddy TLS │
  └────────────────────┘                                └───────────┬──────────┘
            ▲                                                        │ TLS
            │ OAuth redirect                                         ▼
       github.com/login/oauth                               Neon Postgres (pooled)
```

- **Frontend:** Next.js on **Vercel**. One env var: `NEXT_PUBLIC_API_URL`.
- **Backend:** Go API on **EC2**, always-on, behind **Caddy** (automatic HTTPS).
  Runs DB migrations on boot.
- **Database:** **Neon** Postgres.
- **Auth:** GitHub OAuth (cookie session).
- **Billing (optional):** Dodo Payments. Unset → everyone is free, no 500s.

> **The one thing that silently breaks:** the frontend and API are on different
> domains, so the session cookie is **cross-site**. It must be
> `SameSite=None; Secure` or the browser drops it on every API call and the app
> looks logged-out even though OAuth succeeded. Set `COOKIE_SAMESITE=none` +
> `COOKIE_SECURE=true` (both required together). See [§6](#6-cross-site-cookies).

---

## 1. Neon Postgres

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the **pooled** connection string (host contains `-pooler`). It already
   includes `?sslmode=require` — keep it.
3. That's the backend's `DATABASE_URL`. Migrations run automatically when the
   server boots (no manual step), or run them standalone with the `migrate`
   binary / `go run ./cmd/migrate`.

## 2. GitHub OAuth app (production)

Create a **new** OAuth app for prod at
<https://github.com/settings/developers> (keep the localhost one for dev):

- **Homepage URL:** `https://your-frontend.vercel.app`
- **Authorization callback URL:** `https://api.your-domain.com/auth/github/callback`

Copy the **Client ID** and a generated **Client secret** → backend
`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`, and set `GITHUB_CALLBACK_URL` to
the exact callback URL above.

## 3. Backend on EC2

Open security-group ports **80, 443** (and 22 for SSH). **Do not expose 8099.**
Point a DNS **A record** (`api.your-domain.com`) at the instance's public IP.
Generate secrets:

```bash
openssl rand -base64 32   # → SECRET_ENC_KEY (exactly 32 bytes, base64)
openssl rand -base64 48   # → SESSION_KEY
```

Fill `server/.env` from `server/.env.example`. The production-critical values:

```ini
DATABASE_URL=postgres://…-pooler….neon.tech/db?sslmode=require
SECRET_ENC_KEY=<openssl rand -base64 32>
SESSION_KEY=<openssl rand -base64 48>
ALLOWED_ORIGIN=https://your-frontend.vercel.app
COOKIE_SECURE=true
COOKIE_SAMESITE=none
BIND_ADDR=127.0.0.1
GITHUB_CLIENT_ID=…
GITHUB_CLIENT_SECRET=…
GITHUB_CALLBACK_URL=https://api.your-domain.com/auth/github/callback
```

### Path A — Docker Compose (recommended, turnkey)

```bash
cd server
# set API_DOMAIN in docker-compose.yml to api.your-domain.com; leave BIND_ADDR
# empty in .env for this path (the API lives on the internal compose network).
docker compose up -d --build
docker compose logs -f
```

Caddy gets a TLS cert automatically. The API is only reachable through Caddy.

### Path B — native binary + systemd + Caddy

```bash
# build (on the instance or in CI, linux/amd64):
cd server && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o server ./cmd/server

sudo useradd --system --no-create-home --shell /usr/sbin/nologin whook
sudo mkdir -p /opt/whook
sudo cp server /opt/whook/server
sudo cp .env   /opt/whook/.env && sudo chmod 600 /opt/whook/.env
sudo chown -R whook:whook /opt/whook

sudo cp deploy/whook.service /etc/systemd/system/whook.service
sudo systemctl daemon-reload && sudo systemctl enable --now whook
journalctl -u whook -f

# Caddy for TLS:
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # set your domain first
sudo systemctl reload caddy
```

`Restart=always` + `WantedBy=multi-user.target` = the "no sleeping, starts on
boot" guarantee. The server traps `SIGTERM` and drains in ≤10s. With
`BIND_ADDR=127.0.0.1` the API is reachable only via Caddy.

### Verify the backend

```bash
curl https://api.your-domain.com/healthz        # → {"status":"ok"}
```

## 4. Frontend on Vercel

1. Import the repo; set **Root Directory = `web`** (Next.js auto-detected).
2. Env var (Production + Preview): `NEXT_PUBLIC_API_URL=https://api.your-domain.com`.
3. Deploy. Note the domain, e.g. `your-frontend.vercel.app` (or your custom one).
4. **Back-fill** that exact domain into the backend's `ALLOWED_ORIGIN`,
   `DODO_SUCCESS_URL`, `DODO_CANCEL_URL`, and the OAuth app's Homepage URL, then
   redeploy the backend. (`NEXT_PUBLIC_*` is baked at build time — changing the
   API URL later needs a Vercel rebuild.)

## 5. Dodo Payments (optional — skip to ship free-only)

Leaving `DODO_API_KEY` unset is fully supported: `/api/billing/*` and
`/webhooks/dodo` return 503 and the UI shows a calm "not enabled yet" state;
everyone stays on free. To enable Pro:

- Set `DODO_API_KEY`, `DODO_ENVIRONMENT` (`test`/`live`), `DODO_PRODUCT_ID_MONTHLY`,
  `DODO_PRODUCT_ID_ANNUAL`.
- Add a Dodo webhook → `https://api.your-domain.com/webhooks/dodo`; put its
  signing secret in `DODO_WEBHOOK_SECRET` (verified by hookd's own
  Standard-Webhooks engine — dogfooding the product).

## 6. Cross-site cookies

| Frontend ↔ API domains | `COOKIE_SAMESITE` | `COOKIE_SECURE` | `COOKIE_DOMAIN` |
|---|---|---|---|
| Different sites — `*.vercel.app` + `api.your-domain.com` | `none` | `true` | *(empty)* |
| Same parent — `app.hookd.dev` + `api.hookd.dev` | `lax` | `true` | `.hookd.dev` |

`SameSite=None` **requires** `Secure=true`; the server refuses to start if you
set `none` without secure (fail-fast, not a silent prod break). CORS is already
locked to exactly `ALLOWED_ORIGIN` with credentials — no wildcard.

## 7. Smoke test (end to end)

1. `GET https://api.your-domain.com/healthz` → ok.
2. Open the Vercel URL → **sign in with GitHub** → lands back logged-in
   (confirms the cross-site cookie is being sent).
3. Create an endpoint → `curl` its ingest URL → the request appears live (SSE).
4. Set a signing secret → send a signed sample → verify shows pass/fail +
   reason.
5. Create an API key → `curl .../api/endpoints -H "Authorization: Bearer whk_…"`.

## 8. Pre-launch checklist

- [ ] `SECRET_ENC_KEY` / `SESSION_KEY` are fresh random values (not the dev defaults).
- [ ] `COOKIE_SECURE=true` and SameSite matches your domain layout (§6).
- [ ] `ALLOWED_ORIGIN` is the exact Vercel origin (scheme + host, no trailing slash).
- [ ] Port 8099 is **not** in the security group; `BIND_ADDR=127.0.0.1` (native path).
- [ ] OAuth callback URL matches `GITHUB_CALLBACK_URL` exactly.
- [ ] `NEXT_PUBLIC_API_URL` points at the HTTPS API; Vercel rebuilt after any change.
- [ ] `/healthz` is green; `journalctl`/`docker compose logs` show migrations applied.
- [ ] **Reset test data** before launch — the dev DB has a test user forced to
      `plan='pro'`, a sample endpoint, and a test API key. Scoped reset:
      ```sql
      UPDATE users SET plan='free' WHERE login='saman-rez';
      -- then delete the demo endpoint + its events, and any test API keys, by id
      ```
      (Ask before running against the real DB; this is destructive and scoped.)
- [ ] (If billing) a real Pro checkout in Dodo **test** mode completes and the
      webhook flips the user to `plan='pro'`.

## 9. Security posture (reviewed pre-deploy)

Audited and in place:

- **SSRF (replay):** scheme allowlist, hostname + IP blocklists (loopback,
  RFC1918, link-local, ULA, cloud-metadata `169.254.169.254` / `fd00:ec2::254`,
  CGNAT), IPv4-mapped normalization, and a re-resolving dialer + redirect
  re-check (caps 5 hops) that defeats DNS-rebinding and redirect-into-private.
- **CSRF:** the cross-site session cookie (`SameSite=None`) is paired with an
  `Origin`-check on every unsafe-method `/api/*` and `/auth/logout` request —
  foreign/`null` Origin is rejected; API-key (no-Origin) clients are unaffected.
- **CORS:** exact single-origin allowlist with credentials; no wildcard.
- **IP spoofing / rate limits:** per-endpoint **and** per-IP token buckets on
  ingest (idle keys GC'd — no unbounded memory). Trust of `X-Forwarded-For`
  assumes the proxy sets it: keep port **8099 out of the security group** and set
  `BIND_ADDR=127.0.0.1` so only Caddy (which rewrites XFF to the real peer) can
  reach the API — then XFF is unspoofable.
- **Secrets:** signing secrets encrypted at rest (AES-256-GCM); API keys stored
  as SHA-256 hashes (never plaintext, shown once); no secret values are logged.
- **Injection:** all SQL is parameterized (pgx `$1/$2`); captured webhook content
  is treated as inert (control-chars stripped, length-capped) and never trusted
  in redirects or logs. OAuth redirect targets come from config, not the `Host`
  header (no open redirect). Request bodies are size-capped.
- **Session:** HMAC-signed, `HttpOnly` + `Secure`, constant-time verification.

Operational follow-ups (not blockers for a first ship):

- **Replay abuse:** replay makes authenticated outbound requests to public URLs.
  The SSRF guard blocks internal targets, but a logged-in abuser could still fan
  out to third-party public hosts. Watch the activity log; a per-user replay
  rate limit is a good fast-follow.
- **Custom response rules** let an endpoint owner return arbitrary body/headers
  from their own `/i/{id}` URL (a mock-response feature). It's their own URL, but
  if you later host the API on a cookie-bearing parent domain, add
  `X-Content-Type-Options: nosniff` / sandbox those responses.

---

### Files in this repo for deployment

```
server/.env.example        backend env template (secrets documented, none committed)
server/Dockerfile          static multi-stage build → distroless (server + migrate)
server/.dockerignore
server/docker-compose.yml  API + Caddy (automatic HTTPS) — path A
server/deploy/whook.service  systemd unit (always-on) — path B
server/deploy/Caddyfile      reverse proxy + TLS + SSE streaming (both paths)
web/.env.example           frontend env template (NEXT_PUBLIC_API_URL)
```
