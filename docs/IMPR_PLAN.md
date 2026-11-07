# hookd — Pre-Launch Improvement Plan (IMPR_PLAN)

> Status: PLAN · Authored 2026-11-07 · Ship target **2026-11-19** (12 days) · Owner: @saman-rez
> Scope: four features that deepen the moat (signature verify + explain + re-signed replay) without
> chasing commodity capture/inspect. Built by parallel agents with disjoint file ownership.

Every feature here reuses the existing `verify` engine (`verify.Verify` / `verify.Sign`) or the live
SSE stream — that's deliberate: low new surface area, high demo value, nothing that risks the ship date
except F4 (flagged). Filter for every decision: **does it (a) show something no competitor can in the GIF,
(b) move a dev to pay, (c) fit before Nov 19.**

---

## 1. The four features

| # | Feature | One-liner | Primary lane | GIF beat | Pay trigger |
|---|---------|-----------|--------------|----------|-------------|
| **F1** | Fix-it guidance | Verify panel doesn't just say *what* failed — it says *how to fix it* | Frontend | "timestamp skew 340s → event is stale/replayed; Stripe tolerance is 300s" appears under FAILED | deepens the only reason to use hookd |
| **F2** | Replay-with-edit | Edit a captured payload, re-sign it, replay to your handler | Backend + frontend | change `amount` → replay → your handler verifies the forged-but-valid event | the clearest "take my $12" power feature |
| **F3** | Public signature debugger | Free, no-signup page: paste secret + raw request → *why it won't verify* | Backend + marketing | the viral on-ramp / SEO magnet, funnels to signup | top-of-funnel reach play |
| **F4** | CLI localhost forwarder | `npx hookd listen <endpoint> --forward localhost:3000` | New CLI + 1 backend route change | real Stripe event → your localhost handler, re-signed so verification passes | closes the #1 competitive gap (ngrok/Hookdeck own this) |

**F4 is the scope risk.** It reopens the locked "no CLI in v1" decision and is the only feature with
non-trivial new surface. See §7 for the fallback: F1–F3 are the committed launch; F4 ships if it's green by
the Nov 17 gate, otherwise it becomes the week-after fast-follow and its GIF headlines the *next* post.

---

## 2. Architecture grounding (where each hooks in)

All paths relative to `D:\weekly-ship\hookd-main\`.

**F1 — Fix-it guidance (frontend-primary).**
The backend already classifies failures precisely. `server/internal/verify/verify.go` defines the `Cause`
enum: `no_signature_header`, `malformed_signature_header`, `missing_secret`, `signature_mismatch`,
`timestamp_out_of_tolerance`, `encoding_mismatch`, `body_possibly_altered`, `unsupported_provider`. The
`Result.Details` map already carries `skew_seconds`, `encoding`, `computed_other_encoding`,
`received_body_len`/`reencoded_body_len`. The web panel `web/components/inspector/signature-verify-panel.tsx`
renders `summary` + a generic details grid and already consults `CAUSE_HINT` in `web/lib/providers.ts`.
F1 = turn `CAUSE_HINT` into an actionable, provider-aware **`CAUSE_FIX`** map and render a "Likely fix →"
block, specialized by the `details` values. No backend change required (keeps the lane clean).

**F2 — Replay-with-edit (backend + frontend).**
Replay exists: `POST /api/events/{id}/replay` (`a.ReplayEvent` in `server/internal/api/events.go`),
`internal/replay` does the SSRF-guarded send, and the `resign` path already calls `verify.Sign` with a fresh
timestamp. The panel `web/components/inspector/replay-panel.tsx` has target-URL + re-sign toggle but **no body
editor**. F2 = accept an optional edited body in the replay request, sign the *edited* bytes, and add a
Pro-gated JSON editor to the panel.

**F3 — Public signature debugger (backend + marketing).**
`verify.Verify(Input)` is pure and needs no auth/storage. F3 = a new **public, rate-limited** route
(`POST /debug/verify`) wrapping it, registered in `server/internal/app/app.go` (the only lane that touches
app.go), plus a standalone marketing page under `web/app/` and a nav link. Reuses `verify.Detect` so a user
can paste a raw request and let hookd guess the provider.

**F4 — CLI localhost forwarder (new CLI + one backend route change).**
The SSE stream `GET /api/endpoints/{id}/stream` (`a.Stream`) is **currently session-only**
(`r.With(sess)` in `server/internal/api/api.go`). F4 needs it to also accept an API key (`r.With(key)`), like
the other programmatic routes. The CLI subscribes to that stream, fetches each event body
(`GET /api/events/{id}/body`), optionally re-signs, and POSTs to the local URL. Ship as a tiny Node package
(`cli/`, published as `hookd` for `npx hookd`) — zero install friction, matches the audience.

---

## 3. Ownership map (disjoint — this is what makes parallel agents safe)

No two Wave-1 agents write the same file. Cross-lane reads are fine; writes are exclusive.

| Lane | Writes (exclusive) | Reads (shared, no write) |
|------|--------------------|--------------------------|
| **F1** | `web/lib/providers.ts`, `web/components/inspector/signature-verify-panel.tsx`, `web/lib/providers.test.ts` (new) | `web/lib/types.ts`, verify `Cause` enum |
| **F2** | `server/internal/replay/*`, `server/internal/api/events.go`, `server/internal/api/events_test.go`, `web/components/inspector/replay-panel.tsx`, `web/lib/api.ts`, `web/lib/types.ts` | `verify.Sign`, `plan` gating |
| **F3** | `server/internal/api/publicverify.go` (new), `server/internal/api/publicverify_test.go` (new), `server/internal/app/app.go`, `web/app/debugger/**` (new), `web/lib/debug.ts` (new), `web/components/marketing/marketing-nav.tsx` | `verify.Verify`, `verify.Detect`, `httpx` rate-limit helpers |
| **F4** | `cli/**` (new package), `server/internal/api/api.go` (stream route auth only), `server/internal/api/stream.go` (if key-auth needs a guard), `docs/CLI.md` (new) | SSE stream, `events` routes, `keys` auth middleware |

**Two shared-file notes to coordinate (call out in each agent's prompt):**
- `web/lib/types.ts` — F1 only *reads* it; **F2 owns writes** (add `EditReplay`/body types there). F1 must not edit it.
- `web/lib/api.ts` — **F2 owns it** (edit the `replay` fn). F3 must use its own `web/lib/debug.ts`, never `lib/api.ts`.

Everything else is physically separate. `app.go` is touched by F3 only; `api.go` by F4 only.

---

## 4. Execution via agents — orchestration

### 4.1 Principles

1. **Disjoint ownership = parallel.** Dispatch all Wave-1 build agents **in a single message** (multiple
   `Agent` tool calls in one turn) so they run concurrently. Use `subagent_type: "general-purpose"` (full tool
   access — they build, test, and run). Default model/effort; do not override unless a lane stalls.
2. **Brief like a peer.** Each prompt states the goal, the exact files it owns, what to read first, the
   acceptance criteria, the test it must add, and the env preamble (Appendix A). The brief is the agent's only
   context — if a lane's spec in §6 isn't enough to write a clean prompt, tighten §6 first.
3. **Each agent self-verifies before handback.** An agent is not "done" until its own lane is green
   (`go test ./...` for backend lanes, `npm test` + `tsc` for frontend lanes). It reports: files changed,
   commands run with results, and anything it could not finish.
4. **Integration is a separate, serial step.** Do not let build agents run `next build` or the full E2E — that
   races on `.next`/ports. A single Wave-2 integrator does the authoritative build + E2E after all Wave-1
   agents hand back.
5. **Don't re-run an agent's work yourself.** Wait for handback; relay what matters (the summaries aren't shown
   to the user).

### 4.2 Wave 1 — four parallel build agents (one message, four `Agent` calls)

Each prompt = Appendix A (env) + the feature's §6 block + this contract:

> You own ONLY the files listed for your lane in IMPR_PLAN §3. Do not edit any other file. Read the "reads"
> list and the referenced source before writing. When done, your lane must be green by its own test command.
> Report: (1) files changed, (2) exact commands run + their output tail, (3) the new test you added and that it
> passes, (4) anything incomplete or any shared-file coordination you had to skip.

- **Agent A → F1** (`general-purpose`, desc "fix-it guidance"): §6.F1.
- **Agent B → F2** (`general-purpose`, desc "replay with edit"): §6.F2.
- **Agent C → F3** (`general-purpose`, desc "public signature debugger"): §6.F3.
- **Agent D → F4** (`general-purpose`, desc "hookd CLI forwarder"): §6.F4. — launch only if §7 gate says go.

### 4.3 Wave 2 — integration + verification (serial, after all handbacks)

- **Integrator** (`general-purpose`): pull the four lanes together; resolve any `lib/types.ts` / route-table
  overlaps; run the authoritative gate from §5; fix only integration seams (not feature logic — bounce logic
  defects back to the owning lane). Then update launch wiring (§8): `docs/PRODUCT.md`, the `/docs` page's
  feature list + "copy for agents" brief, the supported-providers/feature grid, pricing copy if F2/F4 change
  the Pro value story.
- **Verifier** (`Explore` or `general-purpose`, read-mostly): independent pass — confirm acceptance criteria in
  §6 are actually met in the code (not just claimed), no secret logging, F3 route is rate-limited + unauth +
  stores nothing, F4 stream key-auth didn't widen any other route. Report discrepancies; do not fix.

### 4.4 Optional: deterministic Workflow / ultra path

If you'd rather run this as one deterministic, resumable orchestration than hand-dispatch agents, the
`Workflow` tool fits the shape (fan out F1–F4 in a `parallel`, then a verify phase) — but it requires explicit
opt-in ("use a workflow" / "ultracode"), spawns more agents, and costs more. For a 4-lane build the
single-message `Agent` fan-out above is cheaper and enough. Reserve Workflow/`/code-review ultra` for the
final pre-launch review pass across the merged diff.

---

## 5. Authoritative gate (Wave 2 runs this; all must pass)

```
# backend  (Appendix A env first)
cd server && go build ./... && go vet ./... && gofmt -l . && go test ./...
# backend integration (Neon) — same as existing green run
DATABASE_URL=... DNS_RESOLVER=8.8.8.8:53 go test ./internal/store -run TestPG
# frontend
cd web && npm run test && npx tsc --noEmit && npm run build   # next build must stay green (routes count grows by F3 debugger page)
# CLI (if F4 in)
cd cli && npm test   # subscribe→forward against a local sink + a stubbed stream
```

Then **live E2E in Windows Chrome** (deviceId `28dc94fe-e5ad-47df-b700-f67d5f67eb40`; the macOS Chrome refuses
localhost). Backend `:8099`, frontend `:3000`, user @saman-rez (plan=pro). Flow:
F1: ingest an event signed with a wrong/stale secret → inspector shows FAILED + the "Likely fix" line.
F2: edit the payload JSON, replay re-signed to a local sink → sink receives it and our own verify passes.
F3: open `/debugger` logged-out → paste a sample + secret → correct PASS/FAIL + why; a tampered body → FAILED.
F4: `npx hookd listen <endpoint> --forward http://localhost:4000` → curl the ingest URL → event appears at :4000.
Backend log must show 0 panics / 0 5xx (same bar as the last E2E).

---

## 6. Per-feature specs

### F1 — Fix-it guidance (frontend-primary, ~0.5–1 day)

**Do:** In `web/lib/providers.ts` add `CAUSE_FIX: Record<VerifyCause, (d?) => string>` (or a map + a small
formatter) giving an actionable, provider-aware remediation for each `Cause`, using `details` to specialize:
- `timestamp_out_of_tolerance` → "event is {skew_seconds}s old; {provider} tolerates {tolerance||300}s — you're
  verifying a stale/replayed event, or this machine's clock is off. Re-send, or widen tolerance only if you
  understand the replay risk."
- `body_possibly_altered` → "a middleware re-serialized the JSON before your verifier saw it
  ({received_body_len}→{reencoded_body_len} bytes). Verify the **raw** request body, before any body parser."
- `encoding_mismatch` → "digest is correct but encoded as {computed_other_encoding's encoding}; {provider}
  expects {expected}. Decode/encode accordingly (Shopify=base64, Stripe/GitHub/Razorpay=hex)."
- `missing_secret` → "no signing secret set for this endpoint — add it in Settings so hookd can verify."
- `signature_mismatch` → "computed ≠ provided with the current secret — wrong/rotated secret, or signing a
  different body than what was sent."
- plus `no_signature_header`, `malformed_signature_header`, `unsupported_provider`.
Render it in `signature-verify-panel.tsx` as a distinct "Likely fix →" line below `why`, muted-but-readable,
**only on FAIL/UNVERIFIED** (never on PASS), and **suppressed when `lockedWhy`** (the WHY is already gated for
free; the fix is part of the WHY). Keep the hero's boldness budget — this is one quiet line, not a callout box.
**Test:** `web/lib/providers.test.ts` (Vitest) — every non-`ok` `Cause` yields a non-empty fix; the three
detail-driven causes interpolate their detail values.
**Acceptance:** failing samples in the gallery/inspector show a correct, specific fix; free accounts still see
only the locked upgrade row; `npm test` + `tsc` green.

### F2 — Replay-with-edit (backend + frontend, ~1.5 days)

**Backend:** Extend `a.ReplayEvent` (`server/internal/api/events.go`) + `internal/replay` to accept an optional
`body` (edited raw bytes) in the request JSON. When present and `resign=true`, sign the **edited** bytes with
`verify.Sign` (fresh timestamp) and send those; when present and `resign=false`, reject with a clear 400
("editing the body invalidates the original signature — enable re-sign") since forwarding an edited body under
the original signature can never verify. Enforce a sane max body size. Keep the SSRF guard and Pro gating
exactly as today (replay is already Pro-only). Preserve the stored original event — edits are per-replay, never
mutate the capture.
**Frontend:** In `replay-panel.tsx` add a collapsible JSON editor (textarea is fine; pretty-print the captured
body as the starting value) shown when the user chooses "edit payload". Wire the edited body through
`web/lib/api.ts` `events.replay(...)` (add the optional body arg) and any `ReplayResult`/types in
`web/lib/types.ts`. Gate behind the same Pro lock; when edited, force the re-sign toggle on and explain why.
**Test:** `events_test.go` — edited + re-sign path produces headers that `verify.Verify` passes for the edited
bytes; edited + no-resign returns 400; oversize body rejected. Frontend: panel renders editor only when Pro +
"edit" chosen (lightweight Vitest or rely on E2E).
**Acceptance:** E2E edit→replay→local sink receives edited body and hookd verify passes; original capture
unchanged in the list.

### F3 — Public signature debugger (backend + marketing, ~1.5 days)

**Backend:** New `server/internal/api/publicverify.go` → `POST /debug/verify`, registered in `app.go` **outside**
the `/api` auth group (public), but **rate-limited** (reuse the per-IP limiter pattern from ingest; add a
dedicated bucket). Request: `{ provider?, secret, headers{} , body (string) }`. If `provider` omitted, call
`verify.Detect(headers)`. Run `verify.Verify` and return the full `Result` (status/cause/summary/details).
**Stores nothing. Logs no secret or body.** Cap body + header sizes. CORS: allow the marketing origin.
**Frontend:** New standalone page (e.g. `web/app/debugger/page.tsx`) — not behind the app shell/auth. Inputs:
provider select (+ "auto-detect"), secret, a raw-request / headers+body paste area, and a prominent result that
**reuses `SignatureVerifyPanel`** (full detail, `lockedWhy=false`) + the F1 fix line, so the free tool shows off
exactly what the paid product does. Pre-fill with a one-click sample per provider. Add a `web/lib/debug.ts`
(own fetch helper; do NOT import `lib/api.ts`). Add a nav entry in `marketing-nav.tsx` ("signature debugger")
and a CTA from the result to sign up.
**Test:** `publicverify_test.go` — valid sample→PASS; tampered body→FAILED with `body_possibly_altered`; no
secret→`missing_secret`; auto-detect picks the right provider from headers; rate-limit returns 429; never
writes to store (use the fake and assert no events created).
**Acceptance:** works logged-out; shareable URL; `next build` green with the new route; no secret in logs.
**Security:** this is an unauth, secret-accepting endpoint — the Verifier agent must confirm no persistence, no
logging of secret/body, strict size caps, and that it can't be used as an SSRF/amplification vector (it does no
outbound I/O — verify is pure; keep it that way).

### F4 — CLI localhost forwarder (new CLI + 1 backend route change, ~2–3 days) — GATED

**Backend (minimal, one lane, serialize vs nobody — api.go is F4-only):** add API-key auth to the stream route
in `server/internal/api/api.go`: `r.With(sess).Get("/stream", a.Stream)` → also accept a key, i.e. a combined
`sess-or-key` guard (mirror how `ListEvents`/`GetEvent` accept `key`). Confirm `a.Stream` reads the user from
context the same way under key auth; adjust in `stream.go` only if needed. Change nothing else.
**CLI (`cli/`, Node, published as `hookd`):** `npx hookd listen <endpointId> --forward <localURL> [--resign]
[--key whk_live_...]`. Reads the key from `--key` or `HOOKD_API_KEY`. Opens the SSE stream, and for each event:
GET its body, optionally re-sign (server-side re-sign is simplest — or forward original headers), POST to
`<localURL>`, and print a one-line log (`→ 200 42ms stripe charge.succeeded`). Handle reconnect/backoff, Ctrl-C
clean exit. Keep deps minimal (native `fetch`/`EventSource` polyfill). `README` + `docs/CLI.md`.
**Test:** `cli/` unit test — against a stubbed SSE server + a local sink, an emitted event is forwarded with the
right method/body; reconnect on drop. Backend: a test that the stream route authorizes a valid key and rejects a
bad one.
**Acceptance:** `npx hookd listen` forwards a live ingested event to a local port; re-signed forward verifies
locally. **Demo GIF: real provider event → your localhost handler, green verify.** This is the headline.
**Risk:** largest new surface; publishing to npm is outward-facing (do that only on the user's explicit go).
See §7.

---

## 7. Sequencing, gates & the F4 fallback

```
Day 0 (Nov 7)   Plan approved. Dispatch Wave 1 (A,B,C in parallel now; D only if committing to F4).
Day 1–2         A (F1) lands first (smallest). B/C mid. D building.
Nov 15          Wave-1 handbacks for F1–F3. Integrator runs §5 gate (minus CLI). 
Nov 16          E2E for F1–F3 green → F1–F3 are LAUNCH-LOCKED.
Nov 17  GATE    F4 decision point: is D green end-to-end (CLI forwards live + backend route test passes)?
                 YES → include F4 in the Nov 19 ship; its GIF headlines.
                 NO  → cut F4 to a Nov-26 fast-follow (own launch post). Do NOT let it slip F1–F3.
Nov 18          Final merged review (/code-review ultra on the whole diff), demo GIFs, launch post draft.
Nov 19          SHIP. Deploy per docs/DEPLOY.md. npm-publish the CLI only if F4 is in + user says go.
```

**Hard rule:** F1–F3 are the committed launch. F4 is upside, never a blocker. If any lane (esp. F2 backend)
isn't green by Nov 16, the integrator flags it the same day — a missed week is owned, but we don't ship red.

---

## 8. Launch wiring (Wave-2 integrator, after gate green)

- `docs/PRODUCT.md` — add F1–F4 to the feature list + the wedge framing ("the only tool that tells you *why*
  and lets you *fix+replay*").
- `/docs` page + its **"copy for agents"** llms.txt brief — list the public `/debug/verify` endpoint and the
  CLI; keep it honest about what's live.
- Supported-providers / feature grid on the landing page — if F4 ships, add "forward to localhost"; add
  "edit & replay" (F2) and "free signature debugger" (F3, link it) as differentiators vs webhook.site/ngrok.
- Pricing copy — F2 (edit+replay) and F4 (localhost forward) strengthen the Pro story; the public debugger (F3)
  is the free top-of-funnel. Make the free→pro ladder legible.
- Demo GIFs (one per shippable feature; CLAUDE.md requires GIF-worthiness): F1 the fix line, F2 edit→replay,
  F3 the public tool, F4 (if in) the localhost loop. The X post leads with F4 if present, else F2/F3.

---

## Appendix A — environment preamble (put in every build/integration agent prompt)

```bash
# Go (not on fresh PATH in this sandbox)
export PATH="$PATH:/c/Users/Admin/go-sdk/go/bin:/c/Users/Admin/go/bin"
export GOFLAGS=-mod=mod
export DNS_RESOLVER=8.8.8.8:53        # sandbox-only; Neon host DNS workaround. Prod/user machine: omit.
# Backend run:  cd server && PORT=8099 ALLOWED_ORIGIN=http://localhost:3000 go run ./cmd/server
# Frontend:     cd web && npm ci (if node_modules missing) && npm run dev   # :3000, NEXT_PUBLIC_API_URL=http://localhost:8099
```
- Repo is LF-normalized; keep it. `.env`/`.env.local`/`node_modules` are not in the export (copy from the old
  `webhook-debugger` tree if missing). hookd-main is **not a git repo yet** (`git init` before the final commit).
- Never print/echo secret values (`DATABASE_URL`, signing secrets, API keys). Scoped SQL only.
- Kill a lingering dev server with PowerShell `Stop-Process -Id <pid>` (find via `netstat -ano | findstr :3000`);
  Git Bash mangles `taskkill /PID`. No mass `node` kills.
- Browser E2E: Windows Chrome deviceId `28dc94fe-e5ad-47df-b700-f67d5f67eb40` (macOS Chrome refuses localhost).

## Appendix B — why these four (competitive rationale)

None of webhook.site / RequestBin / Beeceptor / ngrok verify provider signatures or explain failures; the free
tools have no replay at all; Hookdeck replays only into its own gateway and is priced for production. hookd's
defensible wedge is **verify + explain + re-signed replay at an indie price.** F1 sharpens the explain, F2
sharpens the replay, F3 turns the engine into a free reach surface, F4 closes the one gap competitors own
(localhost delivery). We are not adding commodity capture/inspect features — that race is lost and free.
