# hookd CLI

Forward webhooks captured by [hookd](https://hookd.dev) to a URL on your
machine — optionally **re-signed** so your handler's signature verification
still passes. One command, zero install, no new runtime dependencies.

```bash
npx hookd listen <endpointId> --forward <localURL> [--resign] [--json] [--key whk_live_…] [--api <url>]
```

## Quick start

```bash
# 1. Point a provider (Stripe, GitHub, …) at your hookd ingest URL.
# 2. Forward everything it captures to your local server:
HOOKD_API_KEY=whk_live_… npx hookd listen ep_123 --forward http://localhost:3000/webhooks
```

On start it prints a boxed summary, then one aligned line per forwarded event —
lime `✓` for a 2xx from your handler, red `✕` otherwise:

```
╭─ hookd listen ───────────────────────────╮
│ endpoint  ep_123                          │
│ forward   http://localhost:3000/webhooks  │
│ re-sign   on · stripe                     │
│ api       api.hookd.dev                   │
╰───────────────────────────────────────────╯
✓ 200    42ms  stripe             checkout.session.completed  re-signed
✓ 200     7ms  github             push
✕ 500    18ms  standard_webhooks  invoice.paid
```

Colors are disabled when stdout isn't a TTY or `NO_COLOR` is set; the box is
plain Unicode and stays.

### `--json` (for piping)

With `--json`, the banner and status chatter go to stderr and each forwarded
event is written to stdout as one JSON object, no ANSI:

```bash
npx hookd listen ep_123 --forward http://localhost:3000 --json | jq .
{"ok":true,"status":200,"ms":42,"provider":"stripe","event_type":"checkout.session.completed","resigned":true,"note":null}
```

## Options

| Flag | Env | Default | Meaning |
|------|-----|---------|---------|
| `<endpointId>` | — | — | The hookd endpoint to subscribe to (positional, required) |
| `--forward <url>` | — | — | Local URL that receives each captured event (required) |
| `--resign` | — | off | Re-sign the forwarded request with a fresh signature (needs `--secret`). Re-signable: `stripe`, `github`, `razorpay`, `shopify`, `standard_webhooks`. Any other provider forwards its original signature headers unchanged (with a note) |
| `--json` | — | off | Emit one JSON object per forwarded event to stdout (no ANSI, no banner on stdout); for piping |
| `--key <whk_…>` | `HOOKD_API_KEY` | — | hookd API key (required) |
| `--secret <s>` | `HOOKD_SIGNING_SECRET` | — | Signing secret, used only with `--resign`. Never stored or logged |
| `--provider <name>` | — | auto-detect | Force the provider (used for re-signing and event labels). One of: `stripe`, `github`, `razorpay`, `shopify`, `standard_webhooks`, `slack`, `twilio`, `vercel`, `lemon_squeezy`, `twitch` |
| `--api <url>` | `HOOKD_API_URL` | `https://api.hookd.dev` | hookd API base URL |
| `-h, --help` | — | — | Show help |
| `-v, --version` | — | — | Show version |

## How it works

For each event on the endpoint's live stream, the CLI:

1. Reads the event id from the Server-Sent Events (SSE) message.
2. `GET`s the event's metadata (`/api/events/{id}`) — method, headers, type.
3. `GET`s the raw captured body (`/api/events/{id}/body`).
4. Optionally re-signs (see below).
5. `POST`s it to your `--forward` URL, preserving the original method and the
   relevant headers.

It reconnects with exponential backoff if the stream drops, and exits cleanly on
Ctrl-C. Native `fetch` + a tiny SSE line-parser — no dependencies.

## Re-signing

See [`../docs/CLI.md`](../docs/CLI.md#re-signing) for the full, precise
description and its limitation. In short: with `--resign` **and** a signing
secret (`--secret` / `HOOKD_SIGNING_SECRET`), the CLI replaces the captured
signature header with a fresh, valid one (fresh timestamp) so replay-protection
on your local handler passes. Without a secret it forwards the original
signature headers unchanged and prints a note.

## Development

```bash
npm test        # node --test (stub SSE + local sink on ephemeral ports)
```

Requires Node 20+.
