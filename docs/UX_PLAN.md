# hookd — UX & Launch-Readiness Plan

> Status: **EXECUTED 2026-11-07** via 6 parallel agents (5 build lanes + backend/contract) + an integration pass. All P0 + P1 and most P2 shipped; full gate green (go build/vet/test, tsc, vitest 28/28, eslint 0, next build 27 routes). Remaining fast-follows + required user actions listed in §8 below. Created 2026-11-07. Launch target: **2026-11-19**.
> Companion to [IMPR_PLAN.md](./IMPR_PLAN.md) (the 4-feature build, now shipped).
> This plan covers everything *around* the features: the flows, states, trust,
> billing lifecycle, accessibility and polish that a **paid** product is judged on.

---

## 1. How this was produced

- **Four read-only analysis agents** swept the codebase in parallel, each scoped to
  a disjoint slice to avoid overlap and file contention:
  1. Acquisition / marketing / entry surfaces
  2. The authed core loop (capture → inspect → verify → replay)
  3. Account / settings / billing & lifecycle
  4. Cross-cutting a11y / mobile / resilience / perf
- **Web research** established the external bar: SaaS onboarding/activation, developer-tool
  DX, pricing-page conversion, and the webhook-tool competitive landscape (Hookdeck, ngrok,
  webhook.site, Svix).

Every finding below carries a `file:line` (or `MISSING`) and a concrete fix, deduped across
the four reports.

## 2. The external bar (distilled checklist)

- **Onboarding:** define the *aha*, reach it hands-on with minimal friction, prefer a
  filled-in example over an empty box; short (3–7) **dismissible** checklist with visible
  progress; measure activation by outcome, not signups. *(hookd now has the one-click guided
  demo — good; the gaps are around it.)*
- **DX:** discoverability, fast onboarding, accurate docs, an *uncluttered* dashboard that
  surfaces usage + billing + key management (Stripe = gold standard); optimize time-to-first-outcome.
- **Pricing/conversion:** transparent tiers (3–4), a pricing **FAQ**, social proof, benefit-led
  copy, mobile-first, explicit security/cancellation reassurance — without clutter.
- **Competitive wedge to protect:** verify **+ explain *why* +** re-signed replay at an indie
  price. No competitor explains *why* a signature failed. Do **not** chase enterprise parity
  (durable retries, team RBAC, SLAs) for this launch.

## 3. What's already strong (do NOT regress)

- Honest, clear value prop + CTA hierarchy; public no-signup debugger as a top-of-funnel hook.
- Verify hero that always explains *why*, with the Pro "likely fix" line.
- Inline, persistent error banners with retry verbs everywhere (no vanishing toasts — deliberate).
- Near-perfect design-token discipline; reduced-motion handled in CSS **and** JS; consistent
  double-submit guards; `SkeletonRows` everywhere.
- Plan caps now read from `/me` (not hardcoded), with honest over-cap warnings; one-click
  guided demo; usage meter on billing. *(Shipped earlier this session.)*

---

## 4. Consolidated findings

### P0 — ship-blockers (legal + money-safety)

| ID | Finding | Where | Fix |
|----|---------|-------|-----|
| **P0-1** | No **privacy policy** — yet the product stores payment-webhook bodies and the site makes explicit "encrypted, never logged / auto-purge" claims | `MISSING`; claims at `app/page.tsx:70`, `faq.tsx:23` | Add `/privacy`; link in footer + login + checkout |
| **P0-2** | No **terms of service** — real money via Dodo MoR | `MISSING`; checkout `pricing-plans.tsx:84` | Add `/terms`; link footer + login |
| **P0-3** | Login has **no consent line** (Terms/Privacy) on account creation | `login/page.tsx:82` | Add "by continuing you agree to…" once P0-1/2 exist |
| **P0-4** | **Dunning is invisible**: `past_due`/`on_hold`/`failed` users keep seeing a healthy "pro" with no warning until Pro is revoked | `account/page.tsx:77`, no banner in `(app)/layout.tsx`; backend `billing.go:261-300` | Global banner driven by `me.subscription.status` → "update payment → portal" + retry/expiry date |
| **P0-5** | **Raw status strings** shown to users (`on_hold`, `cancelled`); type doc says `canceled` but backend emits `cancelled` (guaranteed mismatch); "renews on" is misleading during `on_hold` | `account/page.tsx:79-86`; `types.ts:130` vs `billing.go:276` | Status→friendly-label+tone map keyed on the real backend strings |

### P1 — fix before paid launch

**Acquisition / trust / SEO**
| ID | Finding | Where | Fix |
|----|---------|-------|-----|
| P1-1 | No OpenGraph / Twitter-card metadata & no `metadataBase` — self-defeating given the Share-on-X button | `layout.tsx:19` | Add `openGraph` + `twitter: summary_large_image` + `metadataBase` |
| P1-2 | No social/OG image | `MISSING` (only `favicon.ico`) | Add `opengraph-image` (render of the inspector panel) |
| P1-3 | No `robots.ts` / `sitemap.ts` | `MISSING` | Add both; keep gallery `noindex` |
| P1-4 | No branded **404** — shared/expired links hit bare Next chrome | `MISSING: not-found.tsx` | Add `app/not-found.tsx` (logo + home + debugger links) |
| P1-5 | **No support/contact path anywhere** (marketing + in-app) | `footer.tsx:19`; grep `mailto` = 0 in `(app)` | Add support email / `/support`; link footer, settings, and the P0-4 banner |
| P1-6 | Checkout **fails silently** to `/settings/billing` — a user whose payment errors can't reach help | `pricing-plans.tsx:90` | Surface the error inline + support link |
| P1-7 | **Zero social proof** on landing (the "PROOF" row is product stats) | `hero.tsx:10`, `app/page.tsx` | Add one real signal: GitHub stars / build-in-public / a quote |
| P1-8 | Docs are **auth-gated** — logged-out prospects can't read them | `app/(app)/docs/page.tsx` behind `(app)/layout.tsx` | Expose a public docs entry; link from nav/footer |
| P1-9 | No **skip-to-content** link; nav precedes content on every page | `MISSING` | Visually-hidden skip link + `id="main"` on each `<main>` |

**Core loop — live capture & activation**
| ID | Finding | Where | Fix |
|----|---------|-------|-----|
| P1-10 | **Silent stream loss**: SSE drops but the dot just greys and still reads "live" — a dead feed looks idle | `app/[id]/page.tsx:283`, `use-event-stream.ts:67`, `status.tsx:60` | Distinct "reconnecting…/offline" state (LiveDot label + banner) from `status` |
| P1-11 | **Events during a disconnect are lost** until a full reload | `use-event-stream.ts:51-93` | Re-run `loadEvents()` on the `error→open` transition (merge already dedupes) |
| P1-12 | Stream list has **no `aria-live`/`role="log"`** — arrivals are silent to SR users | `app/[id]/page.tsx:314-385` | `role="log" aria-live="polite" aria-relevant="additions"` (throttled) |
| P1-13 | **Can't sample an auto-detect endpoint** — the sample button is disabled without a provider, blocking the fastest path to a first event | `app/page.tsx:278-306` | Allow a generic sample, or auto-send one on creation |
| P1-14 | Dashboard "send sample" **fails silently** (empty catch) | `app/page.tsx:296` | Surface an inline/transient failure |
| P1-15 | The **waiting empty state** offers only "copy URL" — a dev with no curl/provider handy is stranded at the key screen | `states.tsx:86-114` | Add "send a sample" + a copy-able pre-filled `curl` |
| P1-16 | **Command palette modal**: no focus trap, Tab escapes behind it, focus not restored on close | `command-palette.tsx:161-235` | Focus trap + `inert`/`aria-hidden` on shell + restore focus to opener |

**Billing lifecycle & account**
| ID | Finding | Where | Fix |
|----|---------|-------|-----|
| P1-17 | Account deletion **doesn't warn about an active subscription** (may keep billing) | `profile/page.tsx:174-234`, `lib/profile.ts:38` | Warn + confirm cancellation (or block until cancelled) when Pro/active |
| P1-18 | No "what happens to my data on downgrade/cancel" (90→7d drop, 5-day grace) is ever told | `account/page.tsx:87-174`; `plan.go:19-23` | State the retention drop + grace window on the cancel/downgrade surface |
| P1-19 | **Lapsed users lose invoice/receipt access** — the portal button only renders for `isPro` | `account/page.tsx:53` | Expose portal/"billing history" whenever a `DodoCustomerID` exists |
| P1-20 | No **re-subscribe/resume** for cancelled/`cancel_at_period_end` users (generic UpgradeCard, no recognition) | `account/page.tsx` | Detect prior subscription → "your Pro ended on… resume" affordance |

**Resilience & perf**
| ID | Finding | Where | Fix |
|----|---------|-------|-----|
| P1-21 | **No global error boundary** — an uncaught throw in any (mostly client) page hits Next's default error screen | `MISSING: error.tsx/global-error.tsx` | `app/global-error.tsx` + `app/(app)/error.tsx` with branded retry |
| P1-22 | **JSON viewer renders every node** — a large webhook body mounts thousands of DOM nodes (biggest perf risk) | `json-viewer.tsx:148-182` | Virtualize rows, or cap + "show more" for large bodies |
| P1-23 | **API-key cap only discovered via a 402**; no post-revoke confirmation | `api-keys/page.tsx:131,255` | Show "used/limit" proactively; brief post-revoke confirmation |

### P2 — polish & fast-follow (grouped)

- **A11y:** aria-live on save/copy confirmations (`role="status"`); complete tab/tabpanel
  semantics + roving arrow keys (`detail-pane.tsx:267`, verify-filter); palette
  `aria-activedescendant` + option ids + scroll-active-into-view; share page needs an `<h1>`
  (`share-view.tsx:45`); theme-picker radiogroup arrow-key roving; hover-only copy buttons
  invisible on touch (`headers-table.tsx:59`, `json-viewer.tsx:119`); re-check `--muted`-on-
  surface contrast at 10–11px across all 8 themes.
- **Core-loop polish:** platform-aware `⌘K`/`Ctrl K` hint; a `?` keyboard-shortcuts legend
  (j/k/r are undiscoverable); confirm step for **clear/rotate secret** (breaks verify+replay);
  focus-to-"yes, delete" + optional type-to-confirm on endpoint delete; auto-dismiss stale
  "saved"; guided-demo degraded-outcome handling (don't promise a green check if sign/sample
  silently failed); clipboard select-on-fail fallback; copy-able curl in onboarding; ingest-URL
  copyable from the mobile inspector header; app-shell loading uses `SkeletonRows`; batched
  stat endpoint to avoid the dashboard "—"→value flash / N+1.
- **Billing/settings polish:** pick one canonical billing URL (`/account` vs `/settings/billing`)
  + reconcile the double heading/narrow width; activity log pagination + action filter +
  IP/device on login rows; appearance page casing → lowercase house voice + a "system" option.
- **Entry/SEO polish:** `icon.svg`/`apple-icon`/`manifest`; light/dark `themeColor` pair;
  `login` → `noindex` + logo links home; remove unused Next boilerplate SVGs in `public/`;
  refund/guarantee line + status-page link in footer; a `(marketing)` route group so nav/footer
  can't drift; mobile nav/hamburger check at 360px (command-bar + marketing nav); wire or drop
  the dead `SettingsNavSelect`.
- **Perf polish:** migrate Commit Mono to `next/font/local` (currently a render-path `@import`).

### Larger items that need BACKEND work (candidate fast-follows, not launch-gating)

- Email / notification preferences + a billing email distinct from the GitHub login email
  *(CAN-SPAM relevance)*; dunning email.
- GDPR **data export** (download my events/account).
- API-key **scopes + expiry + rotation** + last-used IP.
- Activity-log IP/device capture; account-synced theme.

> **Recommendation:** ship these as **post-launch** unless the user wants them in scope. The
> P0s + the cheap high-impact P1s are the launch bar.

---

## 5. Decisions needed from the user (before execution)

1. **Auth breadth** — GitHub is the *only* sign-in. Add Google/email to widen the top of
   funnel, or ship GitHub-only for v1? *(Developer audience makes GitHub-only defensible.)*
2. **Backend scope before Nov 19** — take on notifications/data-export/key-scopes now, or
   fast-follow? (Recommend fast-follow.)
3. **Voice on legal/pricing** — keep the all-lowercase brand voice on payment-adjacent/legal
   surfaces, or Title-case those for trust?
4. **Legal copy source** — generate standard Privacy/ToS from a reputable template (then you
   review), or will you provide text? *(I can draft from a template; you must review before publish.)*

---

## 6. Execution — agent orchestration

Mirrors IMPR_PLAN: **Wave 1** = parallel builds on **file-disjoint lanes**; **Wave 2** =
integrate + verify. Lanes are cut by **file ownership** so no two agents edit the same file.

### Wave 1 — parallel build (5 lanes)

**Lane 1 — Acquisition, Trust & SEO**
Owns: `app/layout.tsx` (OG/twitter/metadataBase, skip-link, themeColor, fonts), `app/not-found.tsx`,
`robots.ts`, `sitemap.ts`, `opengraph-image.tsx`, `app/login/page.tsx`, `components/marketing/*`
(footer trust/support/status links, landing social proof, public-docs link), new `/privacy`,
`/terms`, `/support` routes, `public/` cleanup, optional `(marketing)` route group.
Items: P0-1, P0-2, P0-3, P1-1..P1-9, related P2 entry/SEO.

**Lane 2 — Billing Lifecycle & Account**
Owns: `app/(app)/layout.tsx` (global dunning banner + app skip-link + app-shell skeleton),
`app/(app)/account/page.tsx`, `lib/types.ts` (subscription status types), a new
`lib/billing.ts` status→label map, backend `billing.go`/`plan.go` only if a status string
needs normalizing.
Items: P0-4, P0-5, P1-18, P1-19, P1-20, billing-URL/heading P2.

**Lane 3 — Settings & Security**
Owns: `app/(app)/settings/{api-keys,activity,appearance,profile}/page.tsx`,
`components/settings/settings-nav.tsx`, `components/theme/theme-picker.tsx`, `lib/{keys,activity,profile}.ts`.
Items: P1-17 (deletion-vs-subscription warning), P1-23, settings/activity/appearance P2,
+ (if in scope) the backend-touching key-scopes/export/notifications.

**Lane 4 — Core Loop: live stream & activation**
Owns: `lib/use-event-stream.ts`, `components/ui/status.tsx` (LiveDot), `app/(app)/app/[id]/page.tsx`
(stream `role="log"`, reconnect banner, verify-filter a11y, ⌘/Ctrl, shortcut legend),
`app/(app)/app/page.tsx` (sample for auto-detect + failure surfacing), `components/ui/states.tsx`
(WaitingEmptyState send+curl), `components/dashboard/onboarding.tsx` (curl + degraded-outcome).
Items: P1-10..P1-15, core-loop P2.

**Lane 5 — Inspector a11y, perf & resilience**
Owns: `components/inspector/{command-palette,detail-pane,json-viewer,headers-table,replay-panel}.tsx`,
`components/ui/copy-field.tsx`, `app/global-error.tsx`, `app/(app)/error.tsx`,
`app/share/[token]/share-view.tsx` (h1).
Items: P1-16 (palette focus trap), P1-21 (error boundaries), P1-22 (JSON virtualization),
inspector/share/clipboard P2.

> **Shared-file coordination (the only contention points):**
> - `app/layout.tsx` → Lane 1 only (folds in the global skip-link).
> - `app/(app)/layout.tsx` → Lane 2 only (folds in the app skip-link + shell skeleton; Lane 5's
>   error boundary is a *separate* `error.tsx`, no conflict).
> - `lib/types.ts` → Lane 2 only (billing types); other lanes read, don't edit.
> - `status.tsx`/`states.tsx` → Lane 4 only.
> Everything else is naturally disjoint by directory.

### Wave 2 — integrate & verify (1–2 agents, sequential)

1. **Gate (authoritative):** `go build ./... && go vet ./... && go test ./...` (backend);
   `tsc --noEmit`, `vitest run`, `eslint .`, `next build` (frontend) — all green, using the
   project-local binaries (`node_modules/.bin`, not `npx`).
2. **Cross-lane consistency pass:** reconcile any `lib/types.ts` / shared-component drift,
   verify design-token discipline held, check the 8 themes once.
3. **Live smoke (browser):** dunning banner on a `past_due` user; stream-loss → reconnect;
   sample→verify on an auto-detect endpoint; palette keyboard trap; 404 + error boundary;
   legal/consent links. *(GitHub login step handed to the user.)*
4. **Optional:** `/code-review` over the merged diff before launch.

## 7. Sequencing vs Nov 19 (12 days)

- **Must-ship before launch (the bar):** all **P0** (legal + dunning) + P1-5/P1-6 (support path
  + checkout failure), P1-1..P1-4 (SEO/OG/404), P1-10/P1-11 (stream loss — core value),
  P1-13..P1-15 (first-event friction), P1-21 (error boundary), P1-17/P1-19 (money-safety).
- **Strongly recommended:** P1-7..P1-9, P1-12/P1-16 (a11y), P1-18/P1-20, P1-22/P1-23.
- **Fast-follow (post-launch):** the P2 long tail + all backend-heavy items.
- **Cadence guard:** if time compresses, cut P2 and the backend items — **never** cut the P0s
  or the money-safety P1s. Legal + dunning + a working support path are non-negotiable for
  charging money.

---

## 8. Post-execution — fast-follows & required user actions

**Decisions taken (§5):** GitHub-only auth (no auth work). Took on all backend items. Voice: lowercase brand voice kept everywhere except legal/dense-billing copy (sentence case). Privacy/ToS generated as drafts.

**Required user actions before launch:**
- **Review the legal drafts** — `/privacy` and `/terms` are template-generated, clearly marked "DRAFT — pending legal review, not yet in effect". Review (ideally with counsel) and remove the draft banner when ready.
- **Real support inbox** — all surfaces use `support@hookd.dev` as a placeholder; set up that mailbox (or change the address).
- **Set `NEXT_PUBLIC_SITE_URL`** to the production origin at deploy so OG/sitemap/robots URLs are correct (fallback is `https://hookd.dev`).
- **Run DB migrations** `0007–0010` (automatic on server boot per DEPLOY.md).

**Shipped (summary):** all P0 (privacy/terms/consent, dunning banner, friendly status labels); P1 SEO/OG/404/robots/sitemap/manifest, support path, checkout-failure fix, social proof, public `/docs`, skip-links; SSE reconnect+backfill+aria-live, first-event friction (sample on auto-detect, no silent failures, curl snippets), command-palette focus trap, error boundaries, JSON-viewer cap, lapsed-user billing access/resume, retention-on-downgrade copy; backend: account theme sync, notification prefs + billing email, GDPR export, API-key expiry/rotation/last-used-IP, activity IP + pagination; settings UIs for all of it. Most P2 polish.

**Deferred fast-follows (non-blocking):**
- **Theme "system/follow-OS" option** — needs `enableSystem` on the shared theme provider + a `system` token set; `setTheme("system")` would break until then.
- **Transactional email delivery** — notification prefs + billing email are STORED, but no mail provider is wired, so nothing is sent yet (dunning is in-app banner only; receipts remain Dodo's).
- **API-key scopes** — expiry + rotation + last-used-IP shipped; per-scope permissions deferred.
- **Live browser smoke** — recommended: dunning banner on a `past_due` user, stream-loss→reconnect, sample→verify on an auto-detect endpoint, palette focus trap, 404 + error boundary, OG image render. (Authed parts need a GitHub login.)
- Minor: billing `failed`-status shows both dunning banner + "ended" resume section (internally consistent; smooth if desired).

*End of plan.*
