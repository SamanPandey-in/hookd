# commands.md — ship hookd (EC2 + Neon + Vercel)

A concrete, copy-paste walkthrough. Fill the `<PLACEHOLDERS>` as you go.

**Your layout**
- **API:** Go backend on **EC2**, public domain **`hookd-api.samanp.xyz`**, behind Caddy (automatic HTTPS). Docker Compose path.
- **DB:** **Neon** Postgres.
- **Frontend:** **Vercel** (its `*.vercel.app` URL unless you add your own).
- **Cross-site** (Vercel ↔ EC2 are different domains) → session cookie must be `SameSite=None; Secure`. Already handled in config; you just set two env vars.

Values you'll collect along the way:

| Placeholder | Where it comes from |
|---|---|
| `<NEON_URL>` | Neon dashboard (pooled connection string) |
| `<EC2_IP>` | EC2 Elastic IP |
| `<VERCEL_URL>` | Vercel after first deploy, e.g. `https://hookd.vercel.app` |
| `<GH_CLIENT_ID>` / `<GH_CLIENT_SECRET>` | GitHub OAuth app |
| `<SECRET_ENC_KEY>` / `<SESSION_KEY>` | generated with `openssl` (step 5) |
| `<REPO_URL>` | your GitHub repo (step 0) |

---

## 0. Put the code on GitHub (needed for both EC2 and Vercel)

Vercel deploys from Git, and EC2 will `git clone`, so push the repo first. Run locally (Windows, in the repo root `D:\weekly-ship\webhook-debugger`):

```bash
git init
git add -A
git commit -m "hookd: initial"
# create the repo on GitHub (needs the gh CLI + `gh auth login`), private:
gh repo create hookd --private --source=. --remote=origin --push
# …or if you made the repo in the GitHub UI instead:
#   git remote add origin https://github.com/saman-rez/hookd.git
#   git branch -M main && git push -u origin main
```

Confirm `server/.env` and `web/.env.local` are **NOT** in the push (they're
gitignored — only `.env.example` files should appear). `<REPO_URL>` is now
`https://github.com/saman-rez/hookd.git`.

---

## 1. Neon database

1. Create a project at <https://neon.tech>.
2. Copy the **pooled** connection string (the host contains `-pooler`; it ends in
   `?sslmode=require`). That's your `<NEON_URL>`.

No migrations to run by hand — the server runs them automatically on boot.

---

## 2. Deploy the frontend on Vercel (do this early — the API URL is known)

Your API domain is fixed in advance (`hookd-api.samanp.xyz`), so the frontend can
deploy before the server exists.

1. <https://vercel.com/new> → import `<REPO_URL>`.
2. **Root Directory → `web`** (important — the Next app lives there).
3. **Environment Variables** (Production + Preview):
   ```
   NEXT_PUBLIC_API_URL = https://hookd-api.samanp.xyz
   ```
4. Deploy. Copy the resulting URL → `<VERCEL_URL>` (e.g. `https://hookd.vercel.app`).

The app will show API errors until the backend is live — expected. (If you change
`NEXT_PUBLIC_API_URL` later, redeploy — it's baked in at build time.)

---

## 3. GitHub OAuth app (production)

Create a **new** app at <https://github.com/settings/developers> → *New OAuth App*
(keep your localhost one for dev):

- **Application name:** hookd
- **Homepage URL:** `<VERCEL_URL>`
- **Authorization callback URL:** `https://hookd-api.samanp.xyz/auth/github/callback`

Generate a client secret. Note `<GH_CLIENT_ID>` and `<GH_CLIENT_SECRET>`.

---

## 4. Launch the EC2 instance

In the AWS console (EC2 → Launch instance):

- **AMI:** Ubuntu Server 24.04 LTS (x86_64).
- **Type:** `t3.small` (2 GB RAM, comfortable). `t3.micro` works for low traffic.
- **Key pair:** create/select one so you can SSH.
- **Storage:** 20 GB gp3 is plenty.
- **Security group — inbound rules:**
  | Type | Port | Source |
  |---|---|---|
  | SSH | 22 | **My IP** (not 0.0.0.0/0) |
  | HTTP | 80 | 0.0.0.0/0 (Caddy needs it for the TLS cert challenge) |
  | HTTPS | 443 | 0.0.0.0/0 |

  **Do not open 8099** — the API stays internal, reachable only through Caddy.

Then give it a **stable IP** so DNS doesn't break on reboot:
EC2 → **Elastic IPs** → *Allocate* → *Associate* with the instance. That address is `<EC2_IP>`.

---

## 5. Point the domain at EC2

At whatever manages DNS for **`samanp.xyz`**, add an **A record**:

```
Type: A    Name: hookd-api    Value: <EC2_IP>    TTL: 300 (or lowest)
```

> **Cloudflare users:** set the record to **DNS only (grey cloud)**, not proxied —
> otherwise Caddy's automatic HTTPS (HTTP-01 challenge) can't complete.

Verify it resolves before the next step (give it a minute or two):

```bash
nslookup hookd-api.samanp.xyz     # should return <EC2_IP>
```

---

## 6. Set up the server on EC2

SSH in:

```bash
ssh -i /path/to/your-key.pem ubuntu@<EC2_IP>
```

### 6a. Install Docker (includes Compose)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker            # apply the group now without re-login
docker --version && docker compose version
```

### 6b. Clone the repo

```bash
git clone <REPO_URL> hookd
cd hookd/server
```

### 6c. Generate secrets

```bash
openssl rand -base64 32    # → copy as SECRET_ENC_KEY (exactly 32 bytes)
openssl rand -base64 48    # → copy as SESSION_KEY
```

### 6d. Create the production `.env`

```bash
cp .env.example .env
nano .env     # (or vim)
```

Set these — everything is known now. **Note `BIND_ADDR` must be empty for the
Compose path** (Caddy reaches the API over the internal Docker network):

```ini
PORT=8099
BIND_ADDR=
DATABASE_URL=<NEON_URL>
SECRET_ENC_KEY=<SECRET_ENC_KEY>
SESSION_KEY=<SESSION_KEY>

ALLOWED_ORIGIN=<VERCEL_URL>
COOKIE_SECURE=true
COOKIE_SAMESITE=none
COOKIE_DOMAIN=

GITHUB_CLIENT_ID=<GH_CLIENT_ID>
GITHUB_CLIENT_SECRET=<GH_CLIENT_SECRET>
GITHUB_CALLBACK_URL=https://hookd-api.samanp.xyz/auth/github/callback

# Dodo billing — leave empty to ship free-only (checkout returns 503 cleanly).
DODO_API_KEY=
DODO_SUCCESS_URL=<VERCEL_URL>/app?billing=success
DODO_CANCEL_URL=<VERCEL_URL>/app?billing=cancelled
```

### 6e. Tell Caddy your domain, then launch

Point the Compose Caddy service at `hookd-api.samanp.xyz`:

```bash
sed -i 's/api\.your-domain\.com/hookd-api.samanp.xyz/' docker-compose.yml
```

Bring it all up (builds the Go image, starts the API + Caddy, Caddy fetches the
TLS cert automatically):

```bash
docker compose up -d --build
docker compose logs -f           # watch; Ctrl-C to stop watching (keeps running)
```

Look for `whook: connected to Postgres, migrations applied` and
`whook: listening on :8099`, plus Caddy obtaining a certificate for
`hookd-api.samanp.xyz`.

### 6f. Verify the API is live over HTTPS

```bash
curl https://hookd-api.samanp.xyz/healthz      # → {"status":"ok"}
```

---

## 7. Final wiring + smoke test

`ALLOWED_ORIGIN` is already your `<VERCEL_URL>`, so nothing to back-fill unless you
later add a custom frontend domain. Then test end to end:

1. `curl https://hookd-api.samanp.xyz/healthz` → `ok`.
2. Open `<VERCEL_URL>` → **Sign in with GitHub** → you land back **logged in**
   (this proves the cross-site cookie is working — if you get bounced to login,
   re-check `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, and `ALLOWED_ORIGIN`).
3. Create an endpoint → `curl` its ingest URL → it appears live in the inspector.
4. Set a signing secret → send a signed sample → verify shows pass/fail + reason.
5. Settings → API keys → create one → `curl https://hookd-api.samanp.xyz/api/endpoints -H "Authorization: Bearer whk_live_…"`.

---

## 8. Billing (optional — only when you want paid Pro)

In `server/.env` on EC2, add your Dodo values, then `docker compose up -d` to
restart:

```ini
DODO_API_KEY=<...>
DODO_ENVIRONMENT=test            # then "live" when ready
DODO_PRODUCT_ID_MONTHLY=<...>
DODO_PRODUCT_ID_ANNUAL=<...>
DODO_WEBHOOK_SECRET=<whsec_...>  # from a Dodo webhook → https://hookd-api.samanp.xyz/webhooks/dodo
```

---

## 9. Day-2 operations

```bash
# View logs
docker compose logs -f api        # app logs
docker compose logs -f caddy      # TLS / proxy

# Restart after an .env change
docker compose up -d

# Deploy new code (after you push to GitHub)
cd ~/hookd && git pull && cd server && docker compose up -d --build

# Stop / start everything
docker compose down
docker compose up -d

# Status
docker compose ps
curl https://hookd-api.samanp.xyz/healthz
```

**Reset the test data before launch** (the dev DB has your user forced to `pro`
plus a demo endpoint/key). Against Neon (SQL editor or `psql "<NEON_URL>"`):

```sql
UPDATE users SET plan='free' WHERE login='saman-rez';
-- then delete the demo endpoint + its events and any test API keys by id.
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `curl …/healthz` hangs or refuses | Security group missing 80/443, or `docker compose ps` shows a crash → `docker compose logs api`. |
| TLS cert never issues | DNS not pointing at `<EC2_IP>` yet, port 80 closed, or Cloudflare proxy is ON (set DNS-only). Caddy retries automatically once fixed. |
| Logged out right after GitHub sign-in | Cross-site cookie dropped → confirm `COOKIE_SAMESITE=none` **and** `COOKIE_SECURE=true`, and `ALLOWED_ORIGIN` exactly equals `<VERCEL_URL>` (scheme, no trailing slash). |
| CORS error in browser console | `ALLOWED_ORIGIN` doesn't match the frontend origin exactly. |
| `could not reach the API` in the app | `NEXT_PUBLIC_API_URL` wrong on Vercel, or the API is down. Redeploy Vercel after changing it (build-time value). |
| Caddy can't reach the API | On the Compose path, `BIND_ADDR` must be **empty** (not `127.0.0.1`). |

> Prefer a non-Docker install (systemd + a system Caddy)? See **DEPLOY.md → Path B**;
> there you *do* set `BIND_ADDR=127.0.0.1`.
