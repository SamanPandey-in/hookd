# hookd CLI — localhost forwarder (F4)

> Status: built · Package `cli/`, published name **`hookd`** · Node 20+ · zero runtime deps

The `hookd` CLI subscribes to an endpoint's live event stream and forwards each
captured webhook to a URL on your machine — closing the one gap competitors
(ngrok, Hookdeck) own, while keeping hookd's wedge: the forwarded request can be
**re-signed** so your handler's signature verification still passes.

```bash
npx hookd listen <endpointId> --forward <localURL> [--resign] [--key whk_live_...] [--api <url>]
```

## CLI surface

| Flag / arg | Env fallback | Default | Required | Meaning |
|------------|--------------|---------|----------|---------|
| `<endpointId>` | — | — | yes | Endpoint to subscribe to (positional) |
| `--forward <url>` (`-f`) | — | — | yes | Local URL each captured event is delivered to |
| `--resign` | — | `false` | no | Re-sign the forwarded request with a fresh signature |
| `--key <whk_...>` | `HOOKD_API_KEY` | — | yes | hookd API key |
| `--secret <s>` | `HOOKD_SIGNING_SECRET` | — | with `--resign` | Signing secret. Never stored or logged |
| `--provider <name>` | — | auto-detect | no | Force provider for re-signing: `stripe`, `github`, `shopify`, `razorpay`, `standard_webhooks` |
| `--api <url>` | `HOOKD_API_URL` | `http://localhost:8099` | no | hookd API base URL |
| `-h`, `--help` | — | — | — | Usage, exit 0 |
| `-v`, `--version` | — | — | — | Version, exit 0 |

`--flag=value` is accepted as well as `--flag value`. `NO_COLOR` disables colors
(also auto-disabled when stdout is not a TTY).

Per forward, one line is printed:

```
→ 200  42ms  stripe  charge.succeeded
→ 500  18ms  stripe  invoice.paid          # non-2xx from the local target, printed in a warning color; the listener keeps running
```

`re-signed` and any fallback note are appended to the line when relevant.

## API contracts used

Every request authenticates with the key via `Authorization: Bearer <key>`.
Base URL defaults to `http://localhost:8099` (`--api` / `HOOKD_API_URL`).

| Purpose | Request |
|---------|---------|
| Live stream (SSE) | `GET {api}/api/endpoints/{endpointId}/stream` |
| Event metadata | `GET {api}/api/events/{eventId}` |
| Raw captured body | `GET {api}/api/events/{eventId}/body` |

**Backend dependency:** the stream route must accept API-key auth (not
session-only). That one-line change in `server/internal/api/api.go`
(`r.With(sess)` → also accept `key`, mirroring `ListEvents`/`GetEvent`) is owned
by the F4 backend lane per IMPR_PLAN §3 and is **not** part of this CLI package.
Until it lands, `hookd listen` returns HTTP 401/403 on stream open and exits 1
with a clear message.

### SSE event shape (and why the body is a separate GET)

The stream emits compact summaries, **not** the body:

```
event: event
data: {"id":"ev_…","endpoint_id":"ep_…","method":"POST","path":"/","size":320,
       "content_type":"application/json","event_type":"charge.succeeded",
       "source_ip":"…","received_at_ms":…,"verify_status":"passed"}
```

So the CLI reads `id` from the SSE message, then `GET`s `/api/events/{id}/body`
for the payload. If the stream is ever changed to inline the body, the CLI uses
it automatically — the shape adapters in `cli/src/listen.js`
(`extractEventId`, `hasInlineBody`, `inlineBody`) are the single place to adjust
(a one-line change each).

## Forwarded request

- **Method** is preserved from the captured event (`GET`/`HEAD` sent without a body).
- **Body** is the exact raw captured bytes.
- **Headers** are copied verbatim, except hop-by-hop headers (`Connection`,
  `Keep-Alive`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`,
  `Proxy-Authenticate`, `Proxy-Authorization`), plus `Host`, `Content-Length`
  and `Accept-Encoding`, which belong to the new connection / are recomputed.
- The `Authorization: Bearer <key>` used against the hookd API is **never** sent
  to the local target — only the captured request's own headers are.

## Re-signing

A captured webhook's signature embeds the **original** timestamp. When you
replay it later, providers' replay-protection (e.g. Stripe's 300 s tolerance)
rejects it as stale. `--resign` fixes that by recomputing the signature with a
fresh timestamp so your local handler verifies the forwarded request.

**What `--resign` does in this implementation:**

- With `--resign` **and** a signing secret (`--secret` / `HOOKD_SIGNING_SECRET`)
  for a supported provider, the CLI computes a fresh signature **locally** and
  replaces the captured signature header(s) before forwarding. The algorithms
  are the exact inverse of the server's `verify` package
  (`server/internal/verify/*.go`), so a re-signed request passes the same
  provider's verification. Supported providers and the header(s) replaced:

  | Provider (`--provider`) | Header(s) rewritten | Scheme (matches `verify.Sign`) |
  |-------------------------|---------------------|--------------------------------|
  | `stripe` | `Stripe-Signature` | `t=<now>,v1=hex(HMAC-SHA256(secret, "t.body"))` |
  | `github` | `X-Hub-Signature-256` | `sha256=hex(HMAC-SHA256(secret, body))` |
  | `razorpay` | `X-Razorpay-Signature` | `hex(HMAC-SHA256(secret, body))` |
  | `shopify` | `X-Shopify-Hmac-Sha256` | `base64(HMAC-SHA256(secret, body))` |
  | `standard_webhooks` | `Webhook-Signature`, `Webhook-Id`, `Webhook-Timestamp` | `v1,base64(HMAC-SHA256(key, "id.ts.body"))`, key = base64-decode(secret without `whsec_`) |

  Provider is auto-detected from the captured signature headers (same precedence
  as `verify.Detect`) unless `--provider` is given.

- **Limitation / fallback.** The CLI deliberately does **not** embed or require
  a signing secret; the secret is only used when you supply it at runtime. If
  `--resign` is set but **no secret is available**, or the provider is unknown /
  not in the table above, the CLI **forwards the original captured signature
  headers unchanged** and prints a one-line note explaining why. In that case
  verification on your local handler will fail if it enforces a timestamp
  tolerance (the original timestamp is stale). Broadening automatic provider
  coverage and a secret-free server-assisted re-sign are fast-follows.

- **Why not server-side re-sign?** hookd's replay route re-signs server-side but
  sends through its SSRF-guarded sender, which blocks localhost/private targets
  by design — so it can't deliver to your machine. Local re-signing is the
  pragmatic correct path for a localhost forwarder, and it keeps the signing
  secret on your machine, never in the CLI.

Secrets are never logged and never persisted.

## Reliability

- **Reconnect:** if the stream drops, the CLI reconnects with exponential
  backoff + jitter (0.5 s base, 30 s cap), resetting on a successful connect.
- **Auth failures** (401/403 on stream open) are fatal — the CLI exits 1 rather
  than retrying a bad key.
- **Clean shutdown:** Ctrl-C (SIGINT/SIGTERM) aborts in-flight requests and
  exits 0; a second Ctrl-C forces exit (130).

## Testing

```bash
cd cli
npm test        # node --test
```

Tests stand up a stub SSE+API server and a local sink on ephemeral ports and
assert: (1) an emitted event is forwarded with the right method/body/headers and
bearer auth; (2) `--resign` rewrites the Stripe signature to a fresh valid one;
(3) the CLI reconnects after the stream drops and keeps forwarding.

## Publishing

The package is publishable (`npm publish` from `cli/`) but **not yet published** —
that is a later, explicitly user-approved step (IMPR_PLAN §7).
