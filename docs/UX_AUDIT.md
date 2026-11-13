# hookd — Live UX Audit (browser walk-through)

> Status: **FINDINGS · 2026-11-16** · Launch target 2026-11-19 · Companion docs:
> [FEATURE_GAPS.md](./FEATURE_GAPS.md) (what to add), [STANDOUT.md](./STANDOUT.md)
> (does it look generic / what makes it stand out), [SELF_HOST.md](./SELF_HOST.md)
> (self-hostable version plan). Index of all planning docs: [README.md](./README.md).
>
> This file is the result of **actually running the whole app in Chrome** against the
> real stack (`go run ./cmd/server` with the project `.env` → dev Postgres + GitHub OAuth,
> `next dev`) and clicking through every surface as (a) a first-time visitor and (b) the
> signed-in Pro user `@saman-rez`. Everything below was *observed*, not inferred from code;
> each finding then has the owning file so an agent can go straight to it.

---

## 0. How to reproduce this pass

```bash
cd server && go run ./cmd/server        # loads .env → :8099
cd web && node_modules/.bin/next dev    # :3000  (kill any stale `next dev` on :3000 first —
                                        #  a different project's dev server was squatting it)
```
Walk: `/` → `/pricing` → `/debugger` (load Stripe sample → verify) → `/docs` → `/login`
(already authed → `/app`) → endpoint card actions → inspector (`/app/{id}`) → Ctrl K →
`?` → endpoint settings → `curl` an unsigned GitHub-shaped POST at the ingest URL → detail
pane tabs → replay panel → share → open the copied link → `/share/{token}` → `/share/bad`
→ `/settings/*` (profile, appearance, notifications, api keys, activity, billing) →
`/support` → `/privacy` → `/404` → theme picker.

**Not covered in this pass** (and why): the **free-tier** view (only a Pro account exists
on the dev DB — gated walls were audited in `UX_PLAN.md` §4); the **zero-endpoint
onboarding** (account already has an endpoint; deleting it is destructive); **phone width**
(Chrome refused to resize the window below ~1366 px via the extension — needs a DevTools
device-emulation pass); **light theme** (picker visited, not switched — it's a persisted
account setting).

---

## 1. Verdict in one paragraph

The core loop works and the verify panel is genuinely the best thing on screen: a
tampered GitHub-style POST produced `✗ FAILED · computed HMAC-SHA256 (4b18…) ≠ header —
wrong secret or altered body` plus a correct likely-fix line, inline, in under a second.
The empty states, inline errors, keyboard legend, share page and settings rail all behave.
What drags it down is a handful of **real bugs on the paths a new user hits first**
(share link copies the raw API JSON URL; the dashboard "send sample" button fails on the
default endpoint type; the public debugger renders its verdict off-screen), plus
**consistency debt** (Title-Case headings and tabs in a lowercase product, a Mac ⌘ glyph on
Windows, duplicate "POST POST" rows, wrong page titles). None of it is big; all of it is
the kind of thing that makes a demo GIF look unfinished.

---

## 2. Findings, prioritised

Severity: **P0** = a first-session user will hit it and it breaks the job · **P1** =
visible friction/inconsistency on a core path · **P2** = polish.

### P0 — fix before the launch GIF is recorded

| ID | What I saw | Where | Fix |
|----|-----------|-------|-----|
| **U-1** | **Share link copies the API URL.** Clicking *share* copied `http://localhost:8099/share/<token>` — opening it shows raw JSON (`{"body":"{\"action\"…`). The nice read-only page lives at the *web* origin `/share/<token>`. In prod a teammate gets `api.hookd.dev/share/…` = JSON. | `web/components/inspector/detail-pane.tsx:179` builds `${API_URL}${res.path}`; backend returns `path: "/share/"+token` in `server/internal/api/events.go:219` | Build `${SITE_URL}/share/${res.token}` (use `NEXT_PUBLIC_SITE_URL`, fall back to `window.location.origin`). Add a test. |
| **U-2** | **Dashboard "send sample" icon fails on the default endpoint.** The only endpoint is `auto-detect`; the paper-plane icon returned the red inline error `sample failed — no provider set on endpoint; specify one`. Same in the inspector empty state (`could not send a sample — no provider set…`). Auto-detect is the default when creating an endpoint, so every new user's first "try it" click fails. | icon: `web/app/(app)/app/page.tsx:314`; inspector CTA: `web/app/(app)/app/[id]/page.tsx` empty state; backend `server/internal/api/endpoints.go:225` | When provider is `auto-detect`, open a tiny provider chip picker (the onboarding component already has one — reuse `onboarding.tsx`'s chips) and POST with the chosen provider; or default the sample to Stripe and say so. Never render a dead error for the default state. |
| **U-3** | **Public debugger verdict renders off-screen.** The form is ~2 screens tall; *verify signature* sits at the bottom; the result card appears at the top-right. After clicking I saw nothing change until I scrolled up. On the reach page this is the whole product moment. | `web/app/debugger/debugger-client.tsx:65` (`setResult`) — no scroll/focus | After `setResult`, `scrollIntoView({block:"start"})` + move focus to the result card (`tabIndex=-1`, `aria-live="polite"`); and/or make the result column `sticky top-20` so it's always visible beside the form. STANDOUT.md also proposes opening the page on a pre-verified PASS. |
| **U-4** | **Verify panel says `provider: auto-detect` on a detected event.** The engine clearly detected GitHub (header `X-Hub-Signature-256`, HMAC-SHA256 hex) but the label shows the *endpoint's* setting, not the detected provider. The explanation contradicts itself. | `web/components/inspector/signature-verify-panel.tsx:131` prints the endpoint provider; the event JSON carries no detected-provider field (only `verify_details.header`) | Persist `verify.Result.Provider` on the event (`events` table / `EventDetail`), expose `verify_provider`, and render `provider: github (auto-detected)`. Same fix benefits the share page. |

### P1 — core-path friction and consistency

| ID | What I saw | Where | Fix |
|----|-----------|-------|-----|
| **U-5** | Stream row reads **`POST  POST  200 11s 73 B`** for an event with no event type — the method is repeated as the label. Looks like a rendering bug. | `web/app/(app)/app/[id]/page.tsx:483` → `label={r.event_type \|\| typeLabels[r.id] \|\| r.method}` | Fall back to the request **path** (or `—`), never the method. For JSON bodies with `type`/`event`/`action` keys, derive a label (`typeLabels` already exists — extend the key list: `action`, `event`, `event_type`, `topic`). |
| **U-6** | **Browser tab title is the marketing title on every app page** ("hookd — verify every webhook signature, replay every event" on `/app`, the inspector, settings, api keys…). Only `/settings/appearance` sets one. Tabs are indistinguishable; history is useless. | `web/app/layout.tsx:28` template; only `app/(app)/settings/appearance/page.tsx:4` exports metadata | Add `metadata` (or `generateMetadata` for `[id]`) to every `(app)` route: `endpoints`, `<endpoint name> · inspector`, `settings · profile`, etc. |
| **U-7** | **Mixed case in a lowercase product.** `Endpoints` h1 on the dashboard; detail tabs `1 Headers · 2 Body · 3 Attempts · 4 cURL`; `Privacy Policy` (legal is allowed sentence case per DESIGN) — but the app surfaces aren't. The landing demo shows lowercase tabs, the real app Title Case. | `web/app/(app)/app/page.tsx:90`; `web/components/inspector/detail-pane.tsx` tab labels | Lowercase both. (STANDOUT.md has the full voice sweep list.) |
| **U-8** | **Mac ⌘ glyph on Windows.** The inspector command-bar button renders a ⌘ icon next to the correctly-detected text `Ctrl K`. | `web/app/(app)/app/[id]/page.tsx:380` uses lucide `Command` icon unconditionally | Render the icon only when `isMac`; otherwise just the kbd text. |
| **U-9** | **`?` key didn't open the shortcuts legend** from the keyboard (button click works). Could be focus — the page had no focused element after load. | `[id]/page.tsx` key handler (~line 264) | Verify the handler listens on `window` and matches `e.key === "?"` regardless of `shiftKey`; make sure it isn't swallowed when focus is on `body`. |
| **U-10** | **No `docs` link in the marketing nav** (`live demo · signature debugger · pricing · start free`); docs is only in the footer. Devs look for Docs top-right. | `web/components/marketing/marketing-nav.tsx:22-39` | Add `docs` between `signature debugger` and `pricing`. |
| **U-11** | **Docs page ends abruptly** after "05 / api" with a large empty area and no next step; no table of contents / in-page nav; no per-provider reference (which header, where the secret lives, encoding). The agent brief resolves to `http://localhost:8099` in dev (fine) — ensure it reads `NEXT_PUBLIC_API_URL` in prod. | `web/app/docs/docs-content.tsx` | Add a sticky left TOC (6 anchors), a closing CTA card ("point a webhook at it"), and a **providers** section generated from `PROVIDER_META` + `SIGNATURE_HEADERS` (one row per provider: header · algo · encoding · where to find the secret). |
| **U-12** | **Share has no management.** After sharing, the link is shown once; there is no list of existing share links per event/endpoint and no revoke. Sharing payment payloads without a revoke path is a trust gap. | backend has create only (`events.go:~210`); no list/delete route | Add `GET /api/events/{id}/shares` + `DELETE /api/shares/{token}`; show "shared · revoke" in the detail header. (Also lets the share page show an OG card later.) |
| **U-13** | **"Likely fix" copy can be internally repetitive** — the wrong-secret fix says "computed ≠ provided with the current secret — the secret is wrong or rotated, or you're signing a different body than what was actually sent", which restates the summary line above it. | `web/lib/providers.ts` `CAUSE_FIX[signature_mismatch]` | Make the fix line *actionable* and provider-aware: "compare the secret in `Settings → Webhooks → Signing secret` with the one on this endpoint (ends `…5fe`); if you use the Stripe CLI, its `whsec_` differs from the dashboard's." |
| **U-14** | **Settings → notifications is a visible stub**: "email delivery is coming soon … nothing is sent yet", login email `—`. Honest, but it's a whole settings tab that does nothing at launch. | `web/app/(app)/settings/notifications/page.tsx` | Either wire SMTP (`server/internal/email` exists; needs `SMTP_*` set in prod) and remove the banner, or hide the tab behind a flag until it works. Also fetch the GitHub primary email at OAuth so the field isn't `—`. |
| **U-15** | **API keys "using a key" block shows the same curl twice** (multi-line pretty block + a single-line copy field). | `web/app/(app)/settings/api-keys/page.tsx` bottom panel | Keep one block with a copy button. |
| **U-16** | **Replay panel defaults** — "re-sign with a fresh timestamp" is unchecked by default, so the headline feature (re-signed replay) is opt-in and the helper reads "forwards the original captured signature headers unchanged". For a FAILED event, replaying unchanged is almost never what the user wants. | `web/components/inspector/replay-panel.tsx` | Default re-sign **on** when the endpoint has a secret and the event's verify status isn't `pass`; keep the explicit toggle. |
| **U-17** | **Endpoint settings → retention** shows `7` for a Pro user with a 90-day plan ("your plan keeps up to 90 days") — the field defaults to the free value rather than the plan max, so Pro users silently keep 7 days unless they notice. | `web/app/(app)/app/[id]/settings/page.tsx:527` retention section; backend default on create | Default new endpoints' retention to `plan.MaxRetentionDays`; show "using plan default (90 days)" when unset instead of a hard `7`. |

### P2 — polish

| ID | What I saw | Where | Fix |
|----|-----------|-------|-----|
| **U-18** | Dashboard endpoint card actions are **icon-only** (send-sample paper-plane, copy) with no visible label; the paper-plane meaning is not obvious. | `web/app/(app)/app/page.tsx:~300-320` | Add `title`/tooltip + a text label at `sm:` and up (`send sample`). |
| **U-19** | Dashboard stat row `EVENTS 0 · LAST RECEIVED — · PASS-RATE —` — three dashes for a fresh endpoint; no hint of what to do. | endpoint card | For `events === 0`, replace the stat row with one line: "no events yet — `curl …` or send a sample". |
| **U-20** | Inspector detail header shows `from ::1` for the source IP — fine in dev, but the label is bare. | `detail-pane.tsx` header | `from ::1 (localhost)` / `from 54.187.x.x (stripe)` — map well-known provider egress ranges later; at least label localhost. |
| **U-21** | Breadcrumb `endpoints / stripe billing ● live` — the live dot + "live" text sit inside the breadcrumb and look like a third crumb. | `[id]/page.tsx:355` | Move the live/reconnecting indicator to the right of the command bar, next to the ingest URL. |
| **U-22** | `/pricing` is the landing-page pricing + FAQ with the same hero CTA block; nothing pricing-specific (no comparison table, no numbers for caps — "more endpoints", "long / unlimited retention"). | `web/app/pricing/*`, `pricing-plans.tsx` | Use the numbers from `plan.go` (2 → 25 endpoints, 7 → 90 days) and add a 6-row free/pro table. (STANDOUT.md agrees.) |
| **U-23** | Share page has no way back / no CTA for the viewer ("open in hookd" / "debug your own signature"); it's a dead end for the exact person most likely to sign up (the teammate). | `web/app/share/[token]/page.tsx` | Footer CTA: "this is a hookd share link — debug your own signature free →". |
| **U-24** | Share page theme toggle links to the auth-gated appearance page (STANDOUT.md §4) — a logged-out teammate bounces to login. | `web/components/ui/theme-toggle.tsx` | Make it a local light/dark toggle on public pages. |
| **U-25** | Activity log shows the raw user-agent string in full (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit…`). | `settings/activity/page.tsx:241` | Parse to `Chrome 157 · Windows` with the raw string in `title`. |
| **U-26** | Legal pages render a bold **DRAFT — pending legal review, not yet in effect** banner. Correct today; must be removed (and the copy reviewed) before the launch post. | `web/components/marketing/legal-page.tsx` | Tracked as a required user action in `UX_PLAN.md` §8. |
| **U-27** | Dev-only artifacts visible: Next.js "N" dev badge, `Compiling…/Rendering…` toasts, `/docs` curl examples resolve to `localhost:8099`. Not bugs — listed so nobody screenshots a dev build for the launch. | — | Record the GIF against the production build (`next build && next start`). |

---

## 3. What already works well (protect it)

- **The verify panel** — one-line verdict, the cause, a likely fix, then the detail grid
  (algo/computed/encoding/header/provided). Red hairline rule on FAIL, lime on PASS. This
  is the product; don't let anyone "redesign" it.
- **Empty states carry the next action** — the inspector's "waiting for events" shows the
  ingest URL, a sample button and a copy-able curl. The 404 offers "debug a signature".
- **Inline, persistent errors** with a retry verb (share page error, sample-send error) —
  no toasts. Keep.
- **Command palette + keyboard legend** — real, discoverable (`Ctrl K` button, `?` button).
- **Share page** — clean, redaction note at the bottom, same verify card as the app.
- **Settings rail** — profile / appearance / notifications / api keys / activity / billing /
  support is the right set; export-my-data and the delete-account guard ("cancel billing
  first") are above the bar for a week-2 product.
- **Billing page** — plan, usage meter with real numbers, portal button, retention policy
  sentence. Honest.

---

## 4. What more can be improved (UX-level, beyond bug fixes)

Ordered by expected impact on activation and on the demo GIF.

1. **First-run path to a green check in < 60 s.** Today: create endpoint → copy URL →
   leave to configure a provider → wait. Make the *sample* path first-class: on a brand-new
   endpoint show three chips — `send a signed stripe sample` · `curl it` · `paste a real
   payload` — and auto-select the arriving event so the user lands on ✓ VERIFIED without
   clicking. (Fixes U-2/U-19 as a side effect.)
2. **Make the verdict shareable as an image.** A "copy as image / share this failure" on the
   verify card (PNG via a server route or `html-to-image`) — the thing people paste into
   Slack and X. STANDOUT.md §3 ranks this #1.
3. **Explain the signed bytes.** Under the verify card, a collapsible "what was signed"
   line: `t.payload` for Stripe, `id.ts.body` for Standard Webhooks, URL+sorted-params for
   Twilio, `msgId+ts+body` for Twitch — with the first 24 bytes shown. This is the single
   most educational thing the product can do and nobody else shows it.
4. **Event-type labelling everywhere.** Derive the label from the body for all providers
   (U-5) so the stream reads `charge.succeeded · 200 · 2s` instead of `POST POST`.
5. **Inspector density controls.** Row height is fine, but a stream of 50 events needs a
   `compact` toggle and sticky filters; the search box should also match body text for Pro
   (the pricing page promises "search + filter your whole history").
6. **Replay results inline.** After replay, auto-switch to the Attempts tab and pulse the new
   row; show the target's response body (first 200 chars) in the row.
7. **Endpoint card = health card.** Add a 24-h sparkline of events and last verify status so
   the dashboard answers "is Stripe still sending?" at a glance.
8. **Docs → reference.** Provider table (U-11), a "common failures" page generated from
   `CAUSE_FIX`, and a CLI page (CLI.md exists but is not on the site).
9. **Mobile pass** (not done here): inspector is `md:` split; verify on a 390 px device that
   the stream → detail → back flow works and the verify card doesn't overflow.
10. **Light theme parity check**: the picker exposes six themes; STANDOUT.md argues for two.
    Whatever is kept must be screenshot-tested on the verify card and the stream.

---

## 5. Suggested execution order (fits in one agent-day)

1. U-1, U-2, U-3, U-4 (P0) — one Go + one Next lane, disjoint files.
2. U-5, U-6, U-7, U-8, U-10, U-16, U-17 — small, all frontend except U-17's default.
3. U-11, U-12, U-14 — half-day each; U-12 needs a migration + two routes.
4. Then §4 items 1–3 if time remains before the GIF is recorded.

Gate as in `commands.md` (go test / tsc / eslint / vitest / next build), then re-run §0.
