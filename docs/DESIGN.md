# DESIGN.md — Webhook Debugger (Weekly Ship #2)

> The UI/UX source of truth. Distilled from `research/ui-inspiration.md` into buildable tokens +
> screen specs. Where this file is specific, it **wins** over any skill's default. Dark‑mode‑first,
> data‑dense, keyboard‑friendly, demo‑GIF‑worthy. Enforce the anti‑slop checklist (§8) — it is not optional.

---

## 1. Direction — "Graphite & Signal"

**The ONE bold move:** the product is an **instrument**, and the brand color *means* "verified." A single accent — **signal‑lime `#B8FF2E`** — is reserved almost entirely for (1) the **signature‑verify PASS** state and (2) the **new‑webhook arrival pulse**. These are the two moments the customer pays for. Everything else is near‑monochrome graphite ink on near‑black, separated by **hairlines, not shadows**. This reads as a precise instrument panel, not a generic indigo/purple SaaS.

Spend boldness in exactly two places: the **signature‑verify panel** and the **arrival pulse**. Keep all else quiet.

**Canvas depth (art direction, added 2026‑11‑04).** The near‑black page is not a flat void — it carries a faint **signal‑grid** (graph‑paper, `--border` at low alpha, `.bg-signal-grid`, ~44px, masked to fade toward the footer) that reads as an instrument panel. The landing hero spends the one glow: a single **lime aura** (`.aura-accent`) behind the live inspector, owned by the hero (not fixed — it does not follow the scroll). Marketing section headings carry a mono **flow kicker** (`01 / verify`, `02 / replay`, `03 / retain`) with a small lime square — honest numbering because the product genuinely is a sequence (capture → verify → replay → retain). The hero headline marks the word **signature** with a thin lime underline — the single typographic accent. These are depth and rhythm, not decoration; the color budget (1 hue + status trio), hairline‑not‑shadow rule, and two‑duration motion still hold.

## 2. Color tokens

### Dark (default — app + landing)
```css
:root {
  --bg:         #0B0D0F;  /* page base — cool near-black, NOT #000 (avoids OLED smear) */
  --surface:    #14171A;  /* panels, stream list, detail pane */
  --surface-hi: #1C2024;  /* row hover / selected / input fields */
  --border:     #262B30;  /* hairline separators — do the work shadows usually do */
  --text:       #E6E9ED;  /* primary text */
  --muted:      #8B949E;  /* timestamps, metadata, secondary labels */
  --accent:     #B8FF2E;  /* THE one hue: verified + primary action + live pulse */
  --accent-ink: #0B0D0F;  /* text on accent fills (dark) */
  /* semantic status trio — the ONLY other color allowed */
  --pass:       #B8FF2E;  /* signature valid, 2xx (accent doubles as pass) */
  --fail:       #FF5C5C;  /* signature invalid, 4xx/5xx, delivery failed */
  --warn:       #FFB224;  /* awaiting delivery, retrying, 3xx, replayed */
}
```

### Light (landing + optional app light mode)
```css
:root:not([data-theme="dark"]) { /* applied under prefers-color-scheme: light + [data-theme=light] */
  --bg:          #F7F8F8;  /* cool off-white — explicitly NOT cream #F4F1EA */
  --surface:     #FFFFFF;
  --border:      #E4E7EA;
  --text:        #11161A;
  --muted:       #5B646C;
  --accent-ink:  #3F6212;  /* lime darkened for AA contrast as text/links on white */
  --accent-fill: #B8FF2E;  /* bright fill, ALWAYS paired with #11161A dark text */
}
```
Provide tokens for both themes; follow the Artifact/standard theming pattern (`:root` dark default, overrides under `prefers-color-scheme: light` guarded by `[data-theme]`). Give `body` an explicit background.

**Color budget:** 1 accent + 3 status colors. Nothing else carries color. **HTTP methods are NOT color‑coded** (would blow the budget) — mono labels, with at most a 2px colored left‑tick where it genuinely aids scanning.

## 3. Typography

- **Mono is the dominant texture** (not relegated to code blocks). Primary **Berkeley Mono** (licensed, aspirational); **free fallback Commit Mono** (metric‑compatible, open). Used for **all request data**: JSON, headers, timestamps, IDs, event types, method labels, HTTP codes, cURL, every number.
- **UI/display sans: Hanken Grotesk** (free, Google Fonts) — headings, nav, buttons, filter chips, landing copy. Chosen deliberately over Inter/Geist (now default dev‑tool picks).
- **Roles:** Hanken 600 → H1/H2 + buttons; Hanken 500 → labels; Mono 400–500 → all data/numbers.
- Base body 16px on landing; dense chrome may go to 12–13px (Hanken holds up). Line length < 80ch for prose.

## 4. Shape, elevation, spacing

- **Radius scale: 3px** (controls, badges, chips) and **6px** (panels, cards). **No 16–24px pill cards.** No "identical rounded SaaS card" kit.
- **Separation by hairline border (`--border`), not shadow.** Exactly **one** elevation may use a shadow: the ⌘K palette / overlays.
- Density is high (dashboard): spacing scale ~`4 / 8 / 12 / 16 / 24 / 32`. Tight but breathable rows.

## 5. Screen specs

### 5.1 Inspector (the app — this is the demo GIF)
Two‑pane; top command bar.
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ◆ hook   endpoint: evt_7fa2… ▸ live ●   [ ⌘K ]        source ▾   ⟳ replay     │  top bar 56px
├───────────────────────────────┬────────────────────────────────────────────────┤
│  STREAM (fixed ~380px)        │  DETAIL PANE (fluid)                            │
│  filters: all ▾  method ▾     │  POST /webhooks/stripe      200   •  142ms      │
│  ● POST checkout.session… 200 │  evt_1P9…   2026-11-03 14:22:07.413Z           │
│  ● POST payment_intent…   200 │  ┌ SIGNATURE                    ✓ VERIFIED ──┐ │ ← bold spend
│  ✕ POST invoice.paid      400 │  │ scheme v1 · HMAC-SHA256 · t within 300s   │ │   (lime rule)
│  (new rows slide in at top)   │  └───────────────────────────────────────────┘ │
│                               │  [ Headers ] [ Body ] [ Attempts ] [ cURL ]    │  tabs (instant)
│  ▸ empty: "waiting for events │  Body — pretty JSON, mono, line numbers, S/N   │
│    — point your webhook at …" │  type markers, collapse carets, copy-path      │
└───────────────────────────────┴────────────────────────────────────────────────┘
```
- Top command bar: logo mark, current endpoint, **live `●`** indicator, **⌘K**, source filter, replay.
- **Signature panel sits ABOVE the tabs** — first thing the eye lands on; the only place (plus the pulse) that gets lime.
- JSON viewer: mono, line numbers, Axiom‑style `S`/`N`/`B` field‑type markers, collapse carets, copy‑path on hover, search within body. **No syntax rainbow** — keys `--text`, strings `--muted`, numbers accent‑tinted.
- Keyboard: ⌘K palette, `j/k` to move in stream, `r` replay, single‑key tab switch. Sub‑100ms view switches, no fade.

### 5.2 Landing page
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ◆ hook                         docs   pricing   changelog        [ start ]     │
├──────────────────────────────────────────────────────────────────────────────┤
│   see every webhook.                          ┌ LIVE INSPECTOR (real UI) ─────┐ │
│   verify every signature.                     │ ● POST checkout.session   200 │ │ ← product
│                                               │ ● POST payment_intent     200 │ │   above the
│   capture, inspect, replay & verify webhooks  │ ✕ POST invoice.paid       400 │ │   fold,
│   from stripe, razorpay, github & more.       │   SIGNATURE   ✓ VERIFIED      │ │   actually
│   [ start free ]   [ live demo ]              │   { "amount": 2000, … }       │ │   animating
│   no card. point a webhook and watch.         └───────────────────────────────┘ │
│   ──  94ms p50 ingest · replay in 1 click · 6 providers verified  ──            │  proof row
└──────────────────────────────────────────────────────────────────────────────┘
```
- Hero = the **actual inspector animating** a looping capture → verify → replay (beats Hookdeck, which hides its UI). Proof row = real numbers, not logos.
- Sections after hero: the verify‑explain moment (before/after a misleading provider error), replay/re‑sign, retention vs free tiers, pricing, FAQ. No fade‑up choreography.
- Run `landing-page-conversion-audit` once real copy exists.

### 5.3 Other screens
- **Dashboard / endpoints list:** table of endpoints (name, ingest URL copy button, provider, event count, last received, verify pass‑rate). Create‑endpoint inline.
- **Endpoint settings:** provider + signing secret (masked), response rules (status/headers/body), retention, purge.
- **Auth:** minimal — GitHub OAuth primary + email. One screen, no marketing fluff.
- **Pricing:** free vs Pro, one toggle (monthly/annual), honest feature list, Dodo checkout.
- **Shared event (read‑only):** logged‑out view of one captured event, redaction‑aware.

## 6. Component inventory
- **Stream row:** status glyph (`●` ok / `✕` fail / `◦` pending, in semantic color) · mono method · mono event‑type (truncate + tooltip) · mono HTTP code · relative time · size. Selected = `--surface-hi` + 2px accent left‑edge. Hairline between rows, no shadow.
- **Signature‑verify panel (hero component):** PASS = lime left‑rule + `✓ VERIFIED` + one‑line *why*. FAIL = coral + `✕ FAILED` + the specific cause. Always explains *why*.
- **JSON viewer, Headers table (signature headers pinned + highlighted), Attempts timeline** (code + latency + timestamp + retry badge).
- **Status badges:** 3px radius, mono, tinted‑on‑tint. Delivery states vocabulary: `delivered / retrying / failed`.
- **Buttons:** Hanken 600. Primary = lime fill + dark text. Secondary = hairline border, no fill. **No `→` glyph.** Verb labels: `replay`, `forward`, `copy as cURL`.

## 7. States & motion
- **Every surface implements real states:** loading (skeleton rows in `--surface-hi`, no spinner; stream shows `● listening`), empty (a **working** empty state: copy‑able ingest URL + "point your webhook here" + `● waiting` pulse), error (inline coral banner with the actual error + a retry verb; never a vanishing toast), success.
- **Motion earns its place. Two durations only: 80ms (UI feedback) / 160–180ms (arrival + verify).**
  - New webhook arrives (GIF money shot): row inserts at top, slides down 1 row‑height (160ms ease‑out) + a single accent left‑edge pulse fading over ~400ms; header live‑count ticks. The only ambient motion.
  - Signature verify: on select, the `✓` draws in once (~180ms), not looping.
  - Tab switch: instant swap, ≤80ms crossfade max, no slide.
  - **Banned:** fade‑up on landing sections, gradient‑wash hero, one‑duration‑everywhere. Respect `prefers-reduced-motion`.

## 8. Anti‑slop checklist (enforce before any UI is "done")
- [ ] Exactly **1 accent hue** (`#B8FF2E`) + 3‑color status trio. No indigo, no purple, no gradient.
- [ ] Base graphite `#0B0D0F`; off‑white `#F7F8F8`, never cream `#F4F1EA`.
- [ ] One radius scale: **3px / 6px**. No pill cards, no identical‑rounded‑card kit.
- [ ] Separation by **hairline border**, not shadow (one shadow allowed: ⌘K/overlay).
- [ ] **0 emoji in chrome** — glyphs `●`/`✕`/`◦` + semantic color, never 🟢❌.
- [ ] No tracked‑out ALL‑CAPS eyebrow above every heading (sentence case; all‑caps only for short field headers `SIGNATURE`/`HEADERS`).
- [ ] **No `→` on buttons.** Verb‑only labels.
- [ ] No gradient washes.
- [ ] Two motion durations only; no fade‑up on sections.
- [ ] Mono carries the data (Berkeley/Commit Mono) + Hanken Grotesk chrome. No Inter, no default Geist uniform.
- [ ] Boldness spent in exactly 2 places: signature‑verify panel + arrival pulse.

## 9. Written voice
Terse, lowercase‑comfortable, technical, specific. Numbers over adjectives. Say what it does, not how great it is. Hero: *"see every webhook. verify every signature."* Buttons are verbs. Error messages state the mechanism (`timestamp skew 612s > 300s tolerance`) — the audience debugs for a living and trusts precision over reassurance. Write from the user's view (name things by what they mean, not how we built them).

## 10. Accessibility & quality floor (Definition of Done for UI)
- Contrast ≥ 4.5:1 for body text (verify the lime‑on‑dark and all muted text; use `--accent-ink`/`--accent-fill` pairing on light).
- Visible keyboard focus everywhere; full keyboard operability (don't rely on hover).
- Touch targets ≥ 44×44 where touch applies; `cursor-pointer` on clickables.
- Rendered and checked at **390px phone + desktop**, no horizontal scroll, 16px side gutter.
- `prefers-reduced-motion` respected. Run `web-design-guidelines` + the `anti-ui-slop` finish count before marking done.
