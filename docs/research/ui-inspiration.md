# Webhook Debugger — UI Inspiration & Visual Direction

> Research date: 2026-11-03. Audience: backend/full-stack devs. Two surfaces: the
> **inspector app** (real-time request stream + detail pane + signature-verify) and the
> **marketing landing page**. Dark-mode-first, data-dense, keyboard-friendly.
>
> "Viewed this session" = I actually fetched and read the page on 2026-11-03.
> "From product knowledge" = I'm describing the live product's UI from prior direct use,
> not a fresh screenshot. Fetched page text was treated as untrusted data.

---

## Reference board

### 1. designeer.xyz — *viewed this session* (primary task)
Curated gallery of "interface craft, component libraries, AI tools" (curator Dhruv Jaradi).
It is **JS-light enough that WebFetch returned the full item list** — so no pivot needed, but
be warned: the gallery skews heavily to *decorative/experimental* craft (ASCII art, pixel
illustration, liquid-glass, poster motion), not data tooling.
- **What to steal:** the craft bar and restraint of the strongest dev-adjacent finds —
  Ayush Soni "graphical system / grafana" (`/finds/ayushsoni-io-2109992023390638527`),
  Lorenzo Cabra "Stacked Bars" (`/finds/cabralorenzo-2111060860508483671`),
  Elia "chart variant" (`/finds/eliakuratli-2103604478796800245`),
  Flo "Agent inbox component" (`/finds/flohoeller-2110693194384163100`). The site's own chrome
  is minimalist (tag filters, no card-shadow clutter) — a good restraint reference.
- **Sponsor worth noting:** BoardUI (below).
- **What to avoid:** do **not** import the illustrative/playful register (pixel art, crumpled
  receipts, holo cards) into a data tool — it would read as toy, not instrument.

### 2. BoardUI — boardui.com — *viewed this session*
React/Tailwind v4 design system for "tables, charts, and agent-interface components."
- **Steal:** the status-pill vocabulary (`Waiting` / `Processing` / `Completed` / `Shipped` /
  `Delivery failed`) — almost exactly our webhook delivery states; signed stat deltas
  (`+14.8%`); ⌘K Quick Search in the sidebar; data table with filter dropdowns above
  (`All prices / All products / All regions`) + numbered pagination; the **agent-step
  checklist** ("5 steps left") and web-search source list — good model for a replay/forward
  progress affordance.
- **Avoid:** its consumer-dashboard tells — round avatars on every row, activity rings, sleep
  scores, and a *kitchen-sink* chart set (radar/funnel/Sankey). We need almost none of that.

### 3. Axiom — axiom.co — *viewed this session*
"The modern machine data platform." Log/event platform; **product mockup sits in the hero**.
- **Steal:** the chronological event-stream **table** with columns `_time`, `service.name`,
  `status`, `duration_ms` and millisecond timestamps — this is the spine of our left stream;
  single-letter field-type markers (`S` string / `N` number) before field names — a cheap,
  dense way to type JSON fields; the top tab row (`Query / Stream / Dashboards / Monitors`);
  monospace query/data blocks; **showing the real product in the hero** (do this).
- **Avoid:** enterprise density and petabyte/pricing-slider framing — too heavy for a $9–19/mo
  single-purpose tool.

### 4. Hookdeck — hookdeck.com + docs — *viewed this session* (closest competitor)
Webhook infrastructure. Landing leads with reliability infra + **live metrics** (94ms avg
ingest, 302ms p99, 4,818 events/sec, 100.000% uptime/90d). The Console inspector (from docs):
events list newest-first with **arrival time / status / body preview**; selecting a row opens
an inspector with a **Request tab** (method + headers as key/value table + provider signature
headers) and a **Response tab** (empty when no destination); actions **Copy as cURL** and
**Resend to destination**; event properties carry status, received date, delivery-attempt count.
- **Steal:** the entire inspector information model (it is battle-tested); the live-latency
  numbers as hero proof; "Copy as cURL" + "Resend" as the two primary row actions.
- **Avoid:** Hookdeck's landing is infra-messaging-heavy and **does not put the inspector UI
  above the fold** — that is the exact weakness our landing should beat by showing the live
  stream + signature-verify moment immediately.

### 5. Stripe Dashboard — Developers → Events / Webhooks — *from product knowledge*
- **Steal:** event-type names rendered as **mono tokens** (`payment_intent.succeeded`);
  the expandable **JSON tree** with collapse carets and copy-on-hover; the **delivery-attempts
  timeline** with per-attempt HTTP response code + timestamp; the `Stripe-Signature` signing
  model (`t=` timestamp, `v1=` HMAC) — our signature panel should explain verification in
  exactly these terms.
- **Avoid:** Stripe's light-gray, information-dense enterprise chrome — right data, wrong mood
  for a dark-first indie tool.

### 6. Linear — *from product knowledge*
- **Steal:** keyboard-first command model (⌘K, j/k nav, single-key actions); **hairline borders
  instead of drop shadows** for separation; muted secondary text; instant (sub-100ms) view
  switches with no fade-up; one restrained accent.
- **Avoid:** cloning Linear's indigo (`#5E6AD2`) — it's become the default "serious dev tool"
  accent. We differentiate with a signal-lime (below).

### 7. Vercel / Geist — *from product knowledge*
- **Steal:** high-contrast near-monochrome palette; mono used confidently for data; ruthless
  discipline and whitespace economy.
- **Avoid:** pure-black `#000` + Geist Mono is now a dev-tool cliché. Borrow the discipline,
  not the exact uniform.

### 8. Sentry + Better Stack/Logtail — *from product knowledge*
- **Steal (Sentry):** issue/event **stream rows with level color-coding** and a detail pane
  with a breadcrumb/event timeline → maps directly to our delivery-attempt timeline.
- **Steal (Better Stack/Logtail):** **live-tailing** stream that auto-pauses when you scroll up,
  structured-field highlighting, level badges.
- **Avoid:** Sentry's all-purple chrome; Logtail's rainbow log coloring. Keep color semantic,
  never decorative.

---

## Recommended visual direction

### The ONE bold move (spend boldness here, keep everything else disciplined)
**Make the product an instrument, and make the brand color mean "verified."**
Our single accent hue — a **signal-lime (`#B8FF2E`)** — is reserved almost entirely for the
signature-verification PASS state and the live-arrival pulse. In a webhook debugger, "signature
verified" is the hero moment the customer pays for, so the brand color *is* the verified signal.
The bold spend is concentrated in two spots: (1) the **signature-verify panel** and (2) the
**new-webhook arrival pulse** in the stream. Everything else is near-monochrome graphite ink on
near-black, separated by hairlines, not shadows. This reads as a precise instrument panel — not
a generic indigo/purple SaaS.

### Palette — "Graphite & Signal"

**Dark (default — app + landing):**
| Token | Hex | Use |
|---|---|---|
| `bg` | `#0B0D0F` | page base (cool near-black, not `#000` — avoids OLED smear) |
| `surface` | `#14171A` | panels, stream list, detail pane |
| `surface-hi` | `#1C2024` | row hover / selected / input fields |
| `border` | `#262B30` | hairline separators (do the work shadows usually do) |
| `text` | `#E6E9ED` | primary text |
| `muted` | `#8B949E` | timestamps, metadata, secondary labels |
| `accent` | `#B8FF2E` | **the one hue** — verified + primary action + live pulse |

**Semantic status (a disciplined trio — the only other color allowed):**
| State | Hex | Use |
|---|---|---|
| pass / verified | `#B8FF2E` | accent doubles as PASS (signature valid, 2xx) |
| fail | `#FF5C5C` | signature invalid, 4xx/5xx, delivery failed |
| pending / warn | `#FFB224` | awaiting delivery, retrying, 3xx, replayed |

**Light (landing + optional app light mode):**
| Token | Hex |
|---|---|
| `bg` | `#F7F8F8` (cool off-white — explicitly **not** cream `#F4F1EA`) |
| `surface` | `#FFFFFF` |
| `border` | `#E4E7EA` |
| `text` | `#11161A` |
| `muted` | `#5B646C` |
| `accent-ink` | `#3F6212` (lime darkened for AA contrast on white text/links) |
| `accent-fill` | `#B8FF2E` (bright fill, always paired with `#11161A` dark text) |

HTTP methods are **not** color-coded (that would blow the color budget). They render as mono
labels with a 2px colored left-tick only where it genuinely aids scanning.

### Type pairing (no default picks)
- **Mono is the dominant texture, not an afterthought.** Primary: **Berkeley Mono**
  (aspirational, licensed — instrument-grade, distinctive). Free fallback: **Commit Mono**
  (metric-compatible, open). Used for *all* request data: JSON body, headers, timestamps,
  IDs, event types, method labels, cURL. Making mono carry the UI's character is what separates
  an instrument from a generic SaaS dashboard where sans dominates and mono is relegated to code
  blocks.
- **UI/display sans: Hanken Grotesk** (free, Google Fonts) — headings, nav, buttons, filter
  chips, landing copy. Chosen over Inter/Geist (both now default dev-tool picks): Hanken's
  slightly condensed, high-legibility forms hold up at 12–13px dense chrome and give the
  headlines a touch more editorial character without going decorative.
- **Roles:** Hanken Grotesk 600 for H1/H2 and buttons; Hanken 500 for labels; Berkeley/Commit
  Mono 400–500 for every piece of data and every number.

### Layout — the inspector (this is the demo GIF)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ◆ hook   endpoint: evt_7fa2… ▸ live ●   [ ⌘K ]        source ▾   ⟳ replay     │  top bar (56px)
├───────────────────────────────┬────────────────────────────────────────────────┤
│  STREAM (fixed ~380px)        │  DETAIL PANE (fluid)                            │
│  ┌─ filters: all ▾  method ▾ ─┐│  POST /webhooks/stripe      200   •  142ms      │
│  │ ● POST  checkout.session…  ││  evt_1P9…   2026-11-03 14:22:07.413Z           │
│  │   200   14:22:07  •2.1kb   ││ ┌────────────────────────────────────────────┐ │
│  │ ● POST  payment_intent…    ││ │ SIGNATURE                        ✓ VERIFIED │ │  ← bold spend
│  │   200   14:21:55  •1.4kb   ││ │ scheme v1  •  HMAC-SHA256  •  t within 300s │ │     (lime)
│  │ ✕ POST  invoice.paid       ││ │ Stripe-Signature  t=173…,v1=5f3a… matched   │ │
│  │   400   14:20:11  •0.9kb   ││ └────────────────────────────────────────────┘ │
│  │ … (new rows slide in top)  ││  [ Headers ]  [ Body ]  [ Attempts ]  [ cURL ] │  tabs (instant)
│  └────────────────────────────┘│  ┌── Body (pretty JSON, mono) ───────────────┐ │
│                                │  │ 1  {                                       │ │
│  ▸ empty: "waiting for events  │  │ 2    "id": "evt_1P9…",   S                 │ │
│    — point your webhook at …"  │  │ 3    "amount": 2000,     N                 │ │
│    + copy-able ingest URL      │  │ 4    "object": { ⌄ }                       │ │
│                                │  └────────────────────────────────────────────┘ │
└───────────────────────────────┴────────────────────────────────────────────────┘
```
Key decisions: two-pane (stream left, detail right), top command bar with a live `●` indicator
and ⌘K. The **signature panel sits ABOVE the tabs** — it's the first thing the eye lands on in
the detail pane, and it's the only place (with the live pulse) that gets the lime. JSON uses
line numbers + Axiom-style `S`/`N` field-type markers + collapse carets.

### Layout — the landing page

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ◆ hook                         docs   pricing   changelog        [ start ]     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   see every webhook.                                                           │
│   verify every signature.                     ┌─ LIVE INSPECTOR (real UI) ───┐ │
│                                               │ ● POST checkout.session  200 │ │  ← product
│   capture, inspect, replay, and verify        │ ● POST payment_intent    200 │ │     above
│   webhooks from stripe, razorpay & github.    │ ✕ POST invoice.paid      400 │ │     the fold,
│                                               │   SIGNATURE   ✓ VERIFIED     │ │     actually
│   [ start free ]   [ live demo ]              │   { "amount": 2000, … }      │ │     animating
│   no card. point a webhook and watch.         └──────────────────────────────┘ │
│                                                                                │
│   ───  94ms p50 ingest  ·  replay in 1 click  ·  3 providers verified  ───     │  proof row (Hookdeck-style)
└──────────────────────────────────────────────────────────────────────────────┘
```
The hero shows the **actual inspector animating** (a looping capture → verify → replay), beating
Hookdeck's infra-copy hero. Proof row uses real latency numbers, not logos.

### Component inventory
- **Stream row:** status glyph (`●` ok / `✕` fail / `◦` pending in semantic color) · mono method ·
  mono event-type (truncated, tooltip full) · mono HTTP code · relative time · size. Selected =
  `surface-hi` + 2px accent left-edge. Hairline between rows, no shadow.
- **Detail pane header:** method + path + status chip + duration; event id + ISO timestamp in mono.
- **Signature-verify panel (hero component):** PASS = lime left-rule + `✓ VERIFIED` + one-line
  *why* (`scheme v1 · HMAC-SHA256 · timestamp within tolerance · secret whsec_…matched`). FAIL =
  coral + `✕ FAILED` + the specific reason (`computed v1 ≠ header v1`, `timestamp skew 612s > 300s`,
  `no signature header`). This explains *why*, never just pass/fail.
- **JSON viewer:** mono, line numbers, collapse carets, `S`/`N`/`B` type markers, copy-path on
  hover, search within body. No syntax-rainbow — keys `text`, strings `muted`, numbers accent-tint.
- **Headers:** two-column key/value table, mono, signature headers pinned to top and highlighted.
- **Attempts timeline:** vertical list of delivery attempts — code + latency + timestamp + retry badge.
- **Status badges:** 3px radius, mono, tinted-on-tint (e.g. `200` lime-on-dark, `400` coral-on-dark,
  `pending` amber). Delivery states reuse BoardUI's vocabulary: `delivered / retrying / failed`.
- **Buttons:** Hanken 600. Primary = lime fill + dark text. Secondary = hairline border, no fill.
  **No `→` glyph appended.** Verbs only: `replay`, `forward`, `copy as cURL`.
- **Empty state:** not a cute illustration — a copy-able ingest URL + "point your webhook here"
  + a live `● waiting` pulse. The empty state *does work*.
- **Loading state:** skeleton rows in `surface-hi` (no spinner). Stream shows `● listening`.
- **Error state:** inline coral banner with the actual error + a retry verb; never a toast that
  vanishes.

### Motion notes (motion must earn its place)
- **New webhook arrives (the GIF money shot):** row inserts at top of stream, slides down 1 row-height
  (160ms, ease-out), with a single accent-lime left-edge pulse that fades over 400ms. The header
  live-count ticks. This is the *only* ambient motion.
- **Signature verify:** on row-select, the `✓` draws in once (~180ms). Satisfying, not looping.
- **Tab switch (Headers/Body/Attempts):** instant content swap, ≤80ms crossfade max. No slide.
- **Explicitly banned:** fade-up on landing sections, gradient-wash hero, one-duration-everywhere.
  Use **two** durations: 80ms (UI feedback) and 160–180ms (arrival/verify). Nothing slower.

### Written voice / copy
Terse, lowercase-comfortable, technical, specific. Numbers over adjectives. Say what it does, not
how great it is. Hero: *"see every webhook. verify every signature."* Buttons are verbs
(`replay`, `forward`). Error messages state the mechanism (`timestamp skew 612s > 300s tolerance`),
because the audience debugs for a living and trusts precision over reassurance.

---

## Anti-slop checklist (specific to this product)
- [ ] **Exactly 1 accent hue** (`#B8FF2E` signal-lime) + a 3-color semantic trio (pass/fail/warn).
      Nothing else carries color. No indigo, no purple, no brand gradient.
- [ ] **No cream + terracotta serif.** Base is cool graphite `#0B0D0F`; off-white is `#F7F8F8`, never `#F4F1EA`.
- [ ] **One radius scale: 3px (controls/badges) + 6px (panels).** No 16–24px pill cards, no
      "identical rounded SaaS card" kit.
- [ ] **Separation by hairline border (`#262B30`), not shadow.** Exactly one elevation (⌘K palette /
      overlays) may use a shadow.
- [ ] **0 emoji in product chrome.** Status is `●`/`✕`/`◦` glyphs + semantic color, not 🟢❌.
- [ ] **No tracked-out ALL-CAPS eyebrow above every heading.** Section labels are sentence-case; the
      only all-caps allowed are short field headers in the detail pane (`SIGNATURE`, `HEADERS`).
- [ ] **No `→` appended to buttons.** Verb-only labels.
- [ ] **No gradient washes as decoration.** Gradients appear nowhere.
- [ ] **Two motion durations only** (80ms feedback / 160–180ms arrival+verify). No fade-up on sections.
- [ ] **Mono carries the data** (Berkeley/Commit Mono) + **Hanken Grotesk** for chrome. No Inter,
      no default Geist uniform.
- [ ] **Boldness spent in exactly 2 places:** signature-verify panel + new-webhook arrival pulse.
      Everything else stays quiet.
```
