# hookd — web

The Next.js frontend for **hookd**, a webhook signature debugger. It is the live
inspector, the public signature debugger, the dashboard, and the marketing site.

hookd captures webhooks at a stable ingest URL, verifies their signatures, and —
when verification fails — names the exact cause (body bytes differ from what was
signed, timestamp outside tolerance, encoding mismatch, wrong secret) across
Stripe, GitHub, Razorpay, Shopify, Slack, Standard Webhooks (Svix/Dodo), Twilio,
Vercel, Lemon Squeezy and Twitch. Any captured event can be replayed, re-signed
with a fresh signature and timestamp, to your endpoint or your localhost.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript
- Tailwind CSS v4, base-ui components — the *Graphite & Signal* design system
- Commit Mono + Hanken Grotesk
- Vitest for unit tests

## Run it locally

Requires Node >= 20. Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

### Backend

The frontend talks to the Go API over HTTP (with `credentials: "include"`). Point
it at a running backend with `NEXT_PUBLIC_API_URL`; it defaults to
`http://localhost:8099`.

```bash
# in ../server
go run ./cmd/server
```

See `../server` for backend setup (database, OAuth, and environment variables).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server at `:3000` |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Run the Vitest suite |

## Docs

- `../docs/DESIGN.md` — the UI/UX source of truth (tokens, component specs, voice)
- `../docs/CLI.md` — the `hookd` CLI (`npx hookd listen`)
- `../docs/PRODUCT.md` — product scope and roadmap
- In-app docs live at `/docs`, including a "copy for agents" brief

## License

AGPL-3.0-only for the server and web app; MIT for the `hookd` CLI. See the
`LICENSE` file at the repository root.
