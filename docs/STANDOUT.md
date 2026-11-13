# STANDOUT.md — does hookd look generic, sloppy, or crafted?

> Written 2026-11-16, three days before launch. Read-only audit of `web/`, `cli/`, `server/internal/email`
> against `docs/DESIGN.md` §8 and against what the X/dev-tool crowd reads as "template". Citations are `file:line`.
> Companion to `PRODUCT.md` (what) and `DESIGN.md` (how it looks). This file says *where it slips and what would make it spread*.

---

## 1. Verdict

**Crafted, with sloppy seams. Roughly 7/10 on the generic → crafted spectrum.** The bones are right and rare for a solo
week-2 ship: one real accent hue with a *meaning*, hairlines not shadows, mono as texture, a hero that is the actual
product animating (`components/marketing/live-inspector-demo.tsx:207`), no fake logos, no testimonials, no purple
gradient, no 3-column icon grid, real empty/error/loading states. It passes almost every
anti-slop tell the dev community posts about (Inter + purple gradient + "supercharge your workflow" + uniform cards).
What stops it reading as *finished* is drift: copy that contradicts itself (the FAQ says the CLI is "on the roadmap"
while two sections above sell it), a meta description that still says six providers, capitalised strings in a lowercase
house, a hero demo whose tab labels don't match the real inspector, a CLI that defaults to `localhost:8099`, six
"market themes" (two of them purple) sitting under a design doc that bans purple, and a social card set to Satori's
default sans. None of it is hard. All of it is the difference between "a dev made this carefully" and "a dev made this
in a hurry", and the X audience you want notices the second kind in one scroll.

| Surface | Score | One-line why |
|---|---|---|
| Landing | **4** | real product in hero, mono kickers, honest proof row; "live demo" CTA is a dead click, duplicate built-in-public line |
| Pricing | **4** | honest split, real Dodo path, inline errors; vague bullets ("more endpoints"), "recommended" chip is a template tell |
| Public debugger | **3** | correct engine, no-signup; first paint is an empty form + dashed placeholder, Twilio URL field always visible, sentence-case labels |
| Login | **3** | minimal and on-voice; theme button bounces logged-out users into the auth wall; GitHub-only with no note why |
| Dashboard | **3** | onboarding demo is genuinely good; `Endpoints` capital-E h1, arrow icons on buttons, decorative watermark check |
| Inspector | **4** | two-pane, keyboard, live dot states, filters; tab labels capitalised unlike the marketing demo |
| Verify panel | **4** | THE component and it earns it; `Likely fix →` breaks voice + arrow rule; details `dl` truncates long values |
| Settings / billing | **4** | real states (dunning, resume, portal 503), usage readout with numbers; `→` in UI text |
| Docs | **3** | terse, mono, agent brief is a real differentiator; one page, no per-provider docs, no changelog, CLI example likely fails as written |
| CLI | **2** | works, zero deps; defaults to localhost, lists 5 of 10 providers, plain log lines — not GIF-worthy |
| OG / social card | **3** | on-brand colours; default `sans-serif`, headline differs from hero, no per-share-link card |
| 404 / error / empty | **3** | all branded and calm; none memorable; share-view error is a paragraph |

---

## 2. Sloppiness audit

Ordered by how many visitors will hit it. Each: what, where, fix.

### 2.1 Copy contradictions and stale counts (highest priority — these read as "not finished")

1. **FAQ says the CLI doesn't exist.** `components/marketing/faq.tsx:28` — *"a localhost-forwarding cli is on the roadmap"*, while `replay-resign.tsx:27-30` and `pricing-plans.tsx:30` sell `npx hookd listen`. Fix: *"yes — `npx hookd listen <endpoint> --forward http://localhost:3000` streams live events to your machine, re-signed so your handler's verify passes. server-side replay to a staging url also works."*
2. **Six vs ten providers.** `app/debugger/page.tsx:10` meta description lists six; `hero.tsx:13,30` says 10; `README.md:17` lists six; `DESIGN.md:102` still says "6 providers verified"; `cli/src/cli.js:32-34,106-107` and `cli/README.md:35` accept only five for `--provider`. Fix: one `PROVIDERS` source of truth already exists (`lib/types.ts:18-29`) — derive the meta string and CLI list from it; update README/DESIGN.
3. **CLI example on the site probably fails.** `replay-resign.tsx:29` and `docs/docs-content.tsx:107` show `--forward localhost:3000` (no scheme). `listen.js:80` passes that straight to `fetch()`, which rejects scheme-less URLs. The CLI README (`cli/README.md:16`) correctly uses `http://localhost:3000`. Fix the two marketing strings (or make `forward.js` prepend `http://`).
4. **CLI defaults to localhost.** `cli/src/cli.js:8` `DEFAULT_API = 'http://localhost:8099'`. A published `npx hookd` that targets a dev box by default is the single most "unfinished" thing a tester will hit. `docs-content.tsx:262` tells agents the default is the live API — currently untrue. Fix: default `https://api.hookd.dev`, keep env override.
5. **Legal draft banner.** `components/marketing/legal-page.tsx:10-33` renders *"DRAFT — pending legal review, not yet in effect"* by default (`draft = true`, `:44`). The login page links to terms/privacy (`login/page.tsx:105-119`). If this is still on at launch, every careful visitor sees it. Fix: finalize copy, flip `draft` to false.

### 2.2 Voice violations (lowercase house, DESIGN §9)

6. `app/(app)/app/page.tsx:90` h1 **`Endpoints`** — the only capitalised h1 in the app (`settings` `:18`, `billing`, `appearance` are lowercase).
7. `components/inspector/signature-verify-panel.tsx:125` **`Likely fix → {fix}`** — capital L and a `→` in the hero component. DESIGN §6/§8 ban the arrow on buttons; here it's inline text but it's the one component on every screenshot. Fix: `likely fix: …` in muted mono, or a `FieldLabel`-style `FIX` micro-label.
8. `lib/providers.ts:132,143,150` fix strings start a second sentence with a capital (*"Re-send the event"*, *"Decode/encode accordingly"*, *"Verify the raw request body"*) inside otherwise-lowercase lines. Pick one: all lowercase.
9. `app/(app)/layout.tsx:183` dunning banner **`Your last payment…`**; `account/page.tsx:225` `→ 25 on pro` (arrow in UI).
10. **Hero demo ≠ product.** Demo tabs are lowercase `headers body attempts curl` (`live-inspector-demo.tsx:185`); real inspector tabs are `Headers / Body / Attempts / cURL` (`detail-pane.tsx:23-26`). The GIF will show one, the signup shows the other. Lowercase the real ones.
11. Page `<title>`s mix cases: `Pricing` (`pricing/page.tsx:9`), `Sign in` (`login/layout.tsx:7`), `Signature debugger`, `Docs — getting started`, `Support`, `Terms of Service` vs `not found` (`not-found.tsx:7`) and `appearance`. Pick lowercase everywhere (the root title already is: `layout.tsx:15`).
12. `FieldLabel` children are sometimes sentence case (`debugger-client.tsx:80,103,109,126,146,161`, `detail-pane.tsx:356,395`, `replay-panel.tsx:155,224`, `app/page.tsx:195,207`) and sometimes lowercase (`onboarding.tsx:161,177`, `account/page.tsx:114,213`). CSS uppercases them so it's invisible — until someone copies the string into a tooltip or aria-label. Normalise to lowercase.
13. **(app) routes have no titles.** `(app)/layout.tsx` is a client component, so `/app` and `/app/[id]` inherit the 60-char marketing title into the browser tab. Add a server `app/(app)/app/layout.tsx` with `title: "endpoints"` and a per-endpoint `generateMetadata` later.

### 2.3 Design-system drift (DESIGN §8 checklist)

14. **Theme sprawl.** `globals.css:86-186` + `lib/theme.ts:126-184` ship Dracula, Nord, Tokyo Night, Catppuccin, Singularity (×2). Dracula/Catppuccin accents are purple (`#bd93f9`, `#cba6f7`) — the exact hue §8 line 132 bans. More important for launch: a user screenshot in Nord is not recognisably hookd. Fix for Nov 19: expose only `hookd` + `hookd light` in the picker (keep the CSS behind a flag; ship the rest as a post-launch "themes" changelog entry — that's a free X post).
15. **Theme toggle is an orphan on public pages.** `login/page.tsx:59` and `share/[token]/share-view.tsx:52` render `ThemeToggle`, which is now a link to `/settings/appearance` (`ui/theme-toggle.tsx:13`) — auth-gated → logged-out visitor is bounced to `/login`. Fix: on public surfaces render a real dark/light toggle (next-themes `setTheme`) or drop it.
16. **Shadows.** §4 allows one (⌘K). `hero.tsx:24` live dot glow, `hero.tsx:92` 120px drop shadow under the demo. They look fine — but DESIGN.md says otherwise; either amend §1/§4 to sanction "hero aura + dot glow" or remove.
17. **Icons vs glyphs.** §6 specifies `●/✕/◦`; the marketing uses lucide `Check`/`X` (`retention.tsx:2`, `pricing-plans.tsx:6`), `AlertTriangle` (`states.tsx:67`), `Zap` on the primary onboarding button (`onboarding.tsx:209`), `ArrowRight` inside a button (`onboarding.tsx:241`) and as a bullet (`:278`) — the arrow rule by another name. The 112px decorative `Check` watermark (`onboarding.tsx:288-292`) is exactly the "decoration" §1 forbids. Fix: swap to text glyphs + `StatusGlyph`, drop the watermark.
18. **Footer line.** The footer's bottom line should be a plain, professional one (e.g. a copyright); link to a `/changelog` if one exists (§3.9). No indie-challenge or "built in public" framing.
19. `components/marketing/share-on-x.tsx:10` tweet text ends in `→`; `:13` uses `twitter.com/intent/tweet` (works; `x.com/intent/post` is current). Cosmetic.

### 2.4 Weak first impressions on key surfaces

20. **Hero secondary CTA is a non-action.** `hero.tsx:59-63` "live demo" scrolls to `#demo`, which on desktop is already on screen beside the headline. The real no-signup action is `/debugger` — the nav already names it (`marketing-nav.tsx:31`). Swap.
21. **Debugger first paint is a form.** `debugger-client.tsx:209-214` shows a dashed "load a sample or paste your own" box. The reach page should *open on a verdict*: auto-run the Stripe sample (PASS, lime) and offer "break it" chips (see §3.1). Also `Request URL (Twilio)` (`:124-142`) is always visible — show only when provider is twilio or auto.
22. **Pricing bullets are adjectives.** `pricing-plans.tsx:22` "7-day history, capped events", `:35` "more endpoints", `:31` "long / unlimited retention". The numbers exist: `server/internal/plan/plan.go:15-18` (2 → 25 endpoints, 7 → 90 days). `:21` lists the public debugger as a *plan* feature; `:173` `recommended` chip is the one template tell on the page. See §4 for replacement copy.
23. **OG image.** `opengraph-image.tsx:29` `fontFamily: "sans-serif"` — Satori renders its fallback, not Hanken; headline `verify every webhook.` (`:85`) ≠ hero `see every webhook. verify every signature.`; it's static — `share/[token]/page.tsx` has no `generateMetadata`/`opengraph-image`, so every shared event posts the same generic card. See §3.2.
24. **Open-source / provenance signals: none.** No GitHub link, no LICENSE, no CHANGELOG at repo root; `web/README.md:30` is the untouched `create-next-app` README. No human name or X handle anywhere on the site. For an audience of SWEs/founders on X this is the trust gap, not testimonials.
25. **Docs.** One page (`docs/docs-content.tsx`), fine as a quickstart. Missing: per-provider pages (`/docs/stripe` etc. — the SEO intent PRODUCT F6 was built for), a changelog (DESIGN §5.2 nav spec lists `changelog`; `marketing-nav.tsx` has none), CLI page (only `cli/README.md` + `docs/CLI.md` in the repo).
26. **CLI output.** `listen.js:45-56` — `hookd` prefix + one line per forward. No startup card, no lime check, no alignment, no provider column header. `cli.js:20` usage header is plain. Terminal GIFs of `stripe listen` / `ngrok` are a known X format; this won't compete yet (§3.10).
27. Minor: `onboarding.tsx:20,76` comments still say "six supported schemes"; `email.go` is plain-text and inert by default (fine for launch; nothing to review yet); `web/public` doesn't exist (icons are route-generated — good).

**Things that are NOT sloppy and should be protected:** the color budget + status trio, the arrival pulse and check-draw, `WaitingEmptyState` with a copyable curl (`states.tsx:94`), inline error banners with retry everywhere, dunning banner, keyboard legend (`[id]/page.tsx:558`), redaction note on share view, the agent brief, the signed-in-browser samples, the honest "we aim to reply within 1–2 business days".

---

## 3. What would make it stand out (ranked)

Effort S/M/L · X-impact 1–5 · fits before Nov 19.

| # | Move | Effort | X-impact | By 11/19 |
|---|---|---|---|---|
| 1 | **Diagnosis card** — shareable image of the verdict | M | 5 | yes |
| 2 | **Debugger opens on a verdict + "break it" chips** | S | 5 | yes |
| 3 | **Per-share-link OG card** with the verdict | M | 4 | yes |
| 4 | **Signed-bytes visualizer** in the verify panel | M | 4 | partial (3 providers) |
| 5 | **CLI polish**: prod default, 10 providers, boxed banner, lime ✓ | S–M | 4 | yes |
| 6 | **Provider fingerprint table** (/providers) + honest mono wordmark strip | S/M | 3 | strip yes, page maybe |
| 7 | **Hero CTA → /debugger**; kill dead "live demo" click | S | 3 | yes |
| 8 | **Two themes only at launch**; the rest become a changelog post | S | 3 | yes |
| 9 | **/changelog page** (dated list of shipped features) | S | 3 | yes |
| 10 | **Open-source the CLI + verify engine** (or at least link the repo) | S (link) / M (split) | 4 | link yes |
| 11 | **404 as a captured event** | S | 2 | yes |
| 12 | **/vs comparison page** (webhook.site · ngrok · Hookdeck · hookcap) | M | 3 | after |
| 13 | **Dark/light parity check** on `/`, `/debugger`, `/pricing` | S | 2 | yes |
| 14 | **A human in the footer** (name + X handle) | S | 3 | yes |
| 15 | Status page, email templates, MCP server | M–L | 1–2 | after |

### 3.1 The diagnosis card is the signature visual (and the only thing worth a new component)
Devs already screenshot error messages into X/Slack. Give them a branded one. From a FAIL (public debugger, inspector,
share view) a `share this diagnosis` button hits a route (`app/og/diagnosis/route.tsx`, `ImageResponse`, same tokens as
`opengraph-image.tsx`) with only non-secret fields in the query: provider, cause, summary, 2–3 `details` keys
(`skew_seconds`, `tolerance_seconds`, `encoding`), timestamp. Render exactly the `SignatureVerifyPanel` look at
1200×630: coral left rule, `✕ FAILED`, the one-line why, the likely fix, `hookd.dev/debugger` bottom-right. Copy the
URL + open an X intent prefilled with *"stripe said 'no signatures found'. hookd said: timestamp skew 612s > 300s."*
Never include body, secret or headers. This turns every failed verify into an ad with the product's actual voice.

### 3.2 Per-share-link OG
`share/[token]/opengraph-image.tsx` + `generateMetadata` calling the existing public share endpoint (`lib/api` `share.get`):
title `✓ verified · checkout.session.completed · stripe` or `✕ failed · timestamp_out_of_tolerance`. Redaction already
happens server-side. Same renderer as 3.1 — one component, two uses.

### 3.3 Debugger opens on a verdict
On mount, `loadSample("stripe")` then `submit()`. Result column shows lime PASS within ~300ms of arrival. Above the
textarea, four chips: `make it stale` (t − 400s), `wrong secret`, `re-serialize the body` (`JSON.stringify(JSON.parse(body))`),
`hex ↔ base64`. Each mutates the input and re-verifies, so the panel flips to the *specific* cause. That is the 8-second
GIF: PASS → click → `timestamp skew 400s > 300s` → click → `body re-serialized (whitespace differs)`. Hide the Twilio URL
field unless provider ∈ {twilio, auto}.

### 3.4 Signed-bytes visualizer
Under the why-line, one mono row per provider that shows what the HMAC actually covered, with the parts tinted:
`stripe  signed = t "." body  →  1762180315.{"id":"evt_…`; `standard webhooks  signed = id "." ts "." body`;
`twilio  signed = url + sorted(params)`; `github  sha256= hex(hmac(body))`; `shopify  base64(hmac(body))`. Nobody else
shows this; it is the "I finally get it" moment, and it is the second screenshot people will post. Start with
stripe/standard_webhooks/twilio (the three where the construction is the usual bug).

### 3.5 CLI
`cli.js:8` default `https://api.hookd.dev`; derive `--provider` list from the server's provider set (10). On start print a
boxed card (`╭─ hookd listen ─╮`): endpoint, forward url, re-sign on/off + provider, api. Per event: `✓ 200  42ms  stripe
checkout.session.completed  re-signed` with the check in green/lime, `✕` in red, columns aligned, `--json` for piping.
Respect `NO_COLOR` (already does). Record a 10-second terminal GIF: `stripe trigger` → line appears → handler logs verified.

### 3.6 Provider fingerprints
A mono strip under the hero proof row: the ten names, hairline-separated, no logos (no trademark risk, matches §5.2 "proof
row = real numbers, not logos"). Then `/providers`: one row per provider — signature header, algorithm, encoding,
signed-content construction, timestamp tolerance, the misleading error the provider returns, link to the debugger with
that sample preloaded. It is the table every dev googles for and no vendor publishes; cheap SEO and a linkable asset.

### 3.7 – 3.9 Small, high-trust
- Hero: primary `start free`, secondary `debug a signature` (→ `/debugger`). Proof row stays.
- Theme picker: launch with `hookd` / `hookd light` / `system`. Post-launch changelog: "5 new dashboard themes".
- `/changelog`: a dated list, lowercase, one line per ship (`2026-11-07 — edit-then-replay, public debugger, npx hookd listen`).
  The footer links to `changelog`.
- Footer: `made by <name> (@handle)`. The X audience follows people, not products.

### 3.10 Open-source signals
Cheapest: a GitHub link in the footer + a LICENSE. Better: publish `cli/` as `hookd` on npm with a public repo (it is
already zero-dep and tested) and the Go `internal/verify` package as a standalone module with the test vectors. "Open
verify engine, hosted debugger" is a credible privacy answer (PRODUCT §7) and a reason for SWEs to star/repost.

### 3.11 404
Render a fake stream row + verify panel: `GET /this-page  404  ◦ unverified` / `✕ FAILED · no_such_route — the url may be
mistyped, or a shared event expired.` + the two existing buttons. Ten minutes, on-brand, memorable.

---

## 4. Copy pass (lowercase house voice; numbers over adjectives)

**Hero** (`hero.tsx:33-51`) — headline is good, keep it. Subhead is 38 words; tighten:
> capture, inspect and replay webhooks from stripe, github, razorpay and 7 more. when a signature fails, hookd names the actual cause — and replays the exact event, re-signed, to your endpoint or your localhost.

CTAs: `start free` · `debug a signature` · caption `no card. no signup for the debugger.`

**Pricing** (`pricing-plans.tsx:17-36`)
free — *point a webhook and watch. no card.*
- 2 endpoints with stable ingest urls that never expire
- live capture + the exact raw request (headers in order, raw bytes)
- signature verify on all 10 providers — pass / fail
- 7 days of history
- sample payloads per provider

pro — *the full debug + replay loop. $12/mo, $9/mo yearly.*
- the why: exact cause + likely fix on every failed signature
- replay, edit + re-sign to any url · `npx hookd listen` to localhost
- 25 endpoints · 90-day history · search + filter
- set the response (status, headers, body) to exercise retries
- read-only share links

Drop the `recommended` chip; the accent CTA already marks it. Footer line: *billed via dodo payments (merchant of record, handles vat). cancel anytime.*

**FAQ** `faq.tsx:28` → see §2.1 item 1. `faq.tsx:20` already lists ten — good.

**Verify panel** (`signature-verify-panel.tsx:110-126`)
- locked PASS: *verified — pro shows the scheme, algorithm and which secret matched*
- locked FAIL: *failed — pro shows why: timestamp, secret, encoding or body mutation*
- fix line: `likely fix: …` (no capital, no arrow)

**Empty states**
- stream (`states.tsx:123-126`): `● waiting for the first request` / *point your provider at this url. or send a sample, or curl it.*
- detail (`detail-pane.tsx:73-74`): *pick a request on the left — signature verdict first, then headers, body and replays.*
- dashboard (`app/page.tsx:123-124`): *no endpoints yet — create one above, or run the guided demo.*
- debugger (`debugger-client.tsx:211-212`): replace with the auto-run verdict (§3.3).

**Microcopy**
- `app/page.tsx:90` `Endpoints` → `endpoints`
- `detail-pane.tsx:23-26` → `headers` `body` `attempts` `curl`
- `(app)/layout.tsx:183` → `● your last payment didn't go through — update your card to keep pro.`
- `account/page.tsx:225` → `25 on pro` (no arrow)
- `not-found.tsx:30-35` → `✕ no_such_route` / *the url may be mistyped, or a shared event expired. nothing was lost.*
- `share-on-x.tsx:10` → *stripe said "no signatures found". hookd said: timestamp skew 612s > 300s. verify every webhook signature, replay re-signed —*

---

## 5. Research notes (what the crafted ones do, and what reads as slop)

- **Crafted dev-tool sites share four habits:** near-black canvas with one restrained accent, type as the signature (mono for data), a marketing site that *is* the product's visual language, and opinionated copy that states what the thing does. Linear's CEO: "the best design is opinionated… design for someone in particular." hookd already does all four — the gap is consistency, not direction. Sources: [Linear design notes](https://skills.sh/blink-new/claude/linear-design), [Raycast](https://www.webdesignhot.com/design.md/raycast/), [Resend](https://www.webdesignhot.com/design.md/resend/), [Dive Club on craft](https://dive-club.beehiiv.com/p/crafty-craft-craft).
- **Slop tells devs name:** Inter + system sans, purple→blue gradient hero/CTA, uniform radius cards, identical fade-ins, stock/AI illustration, "Supercharge your workflow"/"Build the future of work" headlines, hedges and superlatives, visuals fixed but copy left generic. hookd scores clean on every one except the fade-in rule (fine) and *copy consistency*. Sources: [925 Studios slop guide](https://www.925studios.co/blog/ai-slop-web-design-guide), [superdesign](https://superdesign.dev/blog/fix-generic-ai-landing-page), [dev.to on template sameness](https://dev.to/binbreeze/why-every-ai-generated-template-looks-the-same-and-how-im-fighting-it-3lo2), [landingdoctors](https://landingdoctors.com/guides/why-ai-landing-pages-convert-worse).
- **Launch mechanics:** solo-founder retros say the people who engaged with pre-launch build-in-public posts became launch-day upvoters, and traffic falls ~15× the day after — so the shareable artifact (diagnosis card, terminal GIF) matters more than the launch post. Sources: [menubar SaaS retro](https://abderrahimghazali.github.io/blog/shipping-a-menubar-saas-alone/), [IH retro](https://www.indiehackers.com/post/i-built-a-saas-to-compete-with-tools-charging-49-99-month-heres-what-i-d-do-differently-0cab0d2392).
- **Competitors:** webhook.site/RequestBin/ngrok don't verify signatures; Hookdeck verifies but is production-priced; [hookcap.dev](https://hookcap.dev/blog/webhook-testing-tools-compared-2026/) (new, cheap, permanent URLs, replay) is the closest indie neighbour and *does not mention signature verification at all* — the verify-explain lane is still open. A `/vs` page that admits "ngrok wins for raw tunnelling, Hookdeck for production delivery" will be believed. Sources: [Hookdeck tools](https://hookdeck.com/webhooks/tools), [dev.to 2026 comparison](https://dev.to/eventdock/best-webhook-monitoring-tools-in-2026-complete-comparison-2cm2), [pinggy](https://pinggy.io/blog/best_webhook_testing_tools_for_local_development/).
- **Dynamic OG per link** is standard Next.js practice (`opengraph-image.tsx` per route) and vendor data claims 1.3–2.3× CTR vs generic previews (weakly sourced, directionally right). Sources: [dev.to patterns](https://dev.to/snapshotflow/dynamic-og-images-for-nextjs-vercel-3-production-patterns-1h3i), [cardsmith](https://dev.to/cardsmith/dynamic-open-graph-images-explained-and-every-way-to-actually-ship-them-3c95).

---

## 6. Top 10 for launch (do in this order, 3 days)

1. **Fix the five contradictions** (§2.1): FAQ CLI line, six→ten everywhere (meta, README, DESIGN, CLI `--provider`), scheme-less `localhost:3000` examples, CLI default API → prod, legal `draft` off. — 1 h
2. **Debugger opens on a PASS + four "break it" chips** (§3.3). This is the demo GIF. — 3 h
3. **Diagnosis card route + "share this diagnosis" button** on debugger/inspector FAIL (§3.1). — 4 h
4. **Voice sweep** (§2.2): `Endpoints`, tab labels, `Likely fix →`, fix-string capitals, dunning banner, page titles, `→` in account. — 1 h
5. **Hero CTA → `/debugger`**; remove duplicate built-in-public line; add mono provider strip under the proof row (§3.6 strip only). — 1 h
6. **Themes: launch with hookd dark/light only**; fix the public-page theme toggle orphan (§2.3 items 14–15). — 1 h
7. **OG image**: load Hanken into `ImageResponse`, match the hero headline; add `share/[token]/opengraph-image.tsx` reusing the diagnosis renderer (§3.2). — 2 h
8. **CLI**: prod default, 10 providers, boxed start banner, lime `✓`/red `✕` columns; record a terminal GIF (§3.5). — 3 h
9. **Pricing bullets with numbers** + drop `recommended` (§4). **Footer**: name + @handle, GitHub link, `/changelog` with the dated ship list. — 1.5 h
10. **404 as a captured event** + replace `web/README.md`, add LICENSE (§3.11, §2.4 item 24). — 45 min

Defer to week 3: signed-bytes visualizer (§3.4), `/providers` fingerprint table, `/vs` page, open-sourcing the verify engine, per-provider docs, status page.
