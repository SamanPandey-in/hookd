# Webhook Debugger — Competitive Analysis

**Date compiled:** 2026-11-03

Scope: dev-time webhook **capture / inspect / verify / replay** tools (our category), plus adjacent tunnels and production-delivery platforms that developers reach for instead. Prices cross-checked against official pages where reachable; vendor-authored comparison claims are flagged. Figures change often — re-verify before setting our price.

## Feature + pricing matrix

| Tool | What it does | Free tier | Paid pricing | Capture/inspect | Verify signatures (+explain) | Replay | Forward to localhost | Praised for | Complaints / gaps |
|---|---|---|---|---|---|---|---|---|---|
| **webhook.site** | Hosted unique-URL inspector + custom actions | 1 URL, **50 req max**, **expires 1 week**, no signup | Basic **$9/mo**, Pro **$19/mo**, Enterprise **$69/mo** ([pricing](https://webhook.site/pricing)) | Excellent (raw req, pretty JSON) | **No** signature verification | Yes (paid; resend/forward) | Via "Custom Actions"/forwarding (paid) | Zero-friction, instant, no signup; the category default | Brutal free caps (50 req, 1-wk expiry); **no signature verify/explain**; occasional privacy concern (hosted) |
| **RequestBin (requestbin.net / Pipedream)** | Hosted request bins | 3 bins, 500 req/bin/day, **100 stored** | Pro **$12/mo** (20 bins, unlimited) ([pricing](https://requestbin.net/pricing)); Pipedream free = 25 credits/day | Good | No | No | No | Simple, well-known name | Low storage; tied to Pipedream's workflow product; no verify/replay |
| **Beeceptor** | Mock API + request inspector | 50 req/day, 1,500/mo; endpoint deleted after 90d idle | **$10 / $25 / $99**/mo ([pricing](https://beeceptor.com/pricing)) | Good; strong on **mocking** responses | No | Limited | No | Mock + inspect in one; good free daily allowance | Daily caps; built for API mocking, not webhook verify/replay |
| **Hookdeck** | Production inbound **event gateway** (queue, retry, routing) + Inspect | Event Gateway Developer **$0** (10k events, **3-day** retention); Inspect free when signed in | Event Gateway up to **$499/mo**; Outpost (send) **$10/M events**, Growth **$499/mo** min; discarded req $2.50/M ([cost cmp](https://www.hook0.com/webhook-cost-comparison)) | Good (dashboard) | Partial (gateway verifies) | Yes | Via CLI | 4.8/71 on G2; "ease of use," reliable delivery | **Pricing "steep"/"on the higher side"** at volume; dashboard "hard to read" at thousands of events; overkill for dev-time debugging ([G2](https://www.g2.com/products/hookdeck/reviews)) |
| **Svix** | Webhook **sending** infrastructure (API) | 50,000 msgs/mo, 1 connector, 200 msg/s | Professional **from $490/mo**, then $0.0001/msg | Play (public inspect) | Yes (as a sender) | Play replay | Svix Play + tunnel | Robust sending SDK/infra | **10× pricier than rivals per msg**; Play endpoints public (not for sensitive data); it's a *sender*, not a debugger |
| **Convoy** | Open-source webhook gateway (send+receive) | Self-host Community **free**; Cloud trial 14d | Cloud Pro **$99/mo** (flat, 25 ev/s, 7-day); Premium $499; self-host Premium $999 | Good | Yes | Yes | Via gateway | Flat pricing, OSS, no per-event metering | Infra to run; aimed at production, not quick dev debugging |
| **Hook0** | OSS webhook-sending platform (EU) | 100 events/day (429 over limit) | Startup **€59**, Pro **€190**/mo ([pricing](https://www.hook0.com/webhook-cost-comparison)) | Basic | HMAC on send | — | — | EU hosting, HMAC, OSS | A *sender*, not an inbound inspector |
| **ngrok** | Localhost tunnel + Traffic Inspector | 1 static domain(?), 2-hr sessions, 1GB/mo, interstitial | from ~$8/mo | Traffic Inspector (replayable) | **verify-webhook** policy action (checks sig) | Yes (inspector) | **Yes** (its whole point) | Universal, the default tunnel | **Random URLs / churn**, session cap, interstitial can break delivery; not webhook-specific ([complaints](https://hookdeck.com/webhooks/platforms/ngrok-alternatives-for-local-tunnel-webhook-development)) |
| **Stripe CLI `listen`** | Forward Stripe events to localhost | Free | Free | Via dashboard | Issues its own signing secret | `stripe trigger`/resend | **Yes** | Official, frictionless **for Stripe** | **Stripe-only**; terminal must stay open; bound to one dev; its secret ≠ dashboard secret (a known footgun) |
| **smee.io** | GitHub's webhook relay to localhost | Free | Free | None stored | No | No | Yes | Dead-simple for GitHub | **No history/search/replay**; public channels; JSON-only ([cmp](https://webhooks.cc/compare/smee)) |
| **WebhookRelay** | Hosted relay + inspect + HMAC | Free tester / free account | Paid tiers | Yes | HMAC verify | Yes | **Yes** (to local/private) | Combines forward + verify | Smaller/older; UX dated |
| **Typedwebhook.tools** | Online webhook tester | Free | — | Yes | — | — | — | — | *Insufficient data found — could not confirm status/features* |
| **Mockbin (mockbin.io, Zuplo)** | Request/endpoint mocking + record | Free, no signup | Free | Yes (records) | No | No | No | Free, no signup | Original mockbin.org gone; "inspects, does not deliver"; hosted version "flaky" ([what happened](https://www.slashbin.io/vs/mockbin)) |

> Also note: a **crowd of 2025–2026 Show HN / GitHub entrants** — HookBox, webhook.build, HookWatch, HookTrace, HookVerify, Basehook, AuditHook, hookbench, multiple "webhook-inspector" repos. The category is actively being re-built by indie devs right now (both validation and a crowding risk).

---

## Where the gaps are / our wedge

**The pattern:** the *free* tools (webhook.site, RequestBin, smee, Mockbin) nail **capture + pretty-print** but do **not verify signatures or explain failures**, and die on retention. The *heavy* tools (Hookdeck, Svix, Convoy) verify and deliver at scale but are production-grade, priced for volume, and overkill for a dev debugging at their desk. Nobody owns the **dev-time "why did my signature fail, and let me replay the exact event" workflow** at an indie price.

**The single sharpest wedge: "The webhook tool that explains *why* your signature failed — and lets you replay the exact event (re-signed) to localhost."**

Concretely, win on the three things free tools skip and heavy tools bury:

1. **Signature verification with a plain-English pass/fail explanation** across Stripe, GitHub, Shopify, Razorpay, Svix, Slack — detecting the *actual* cause: raw-body mutated, wrong secret (API vs signing vs CLI vs dashboard; test vs live), wrong encoding (base64 vs hex), timestamp out of tolerance. This maps 1:1 to the #1 pain in the research and **no free competitor does it.**
2. **Replay to localhost without a tunnel or a re-trigger, with re-signing.** The unsolved sub-problem everyone still builds themselves: replay a captured event with a *fresh timestamp / valid signature* so it doesn't trip replay protection, with a toggle to keep the original signature. (hookbench/ngrok do pieces; no polished paid product owns it.)
3. **Durable, private, stable endpoint.** A URL you paste once and reuse (vs ngrok churn and webhook.site's 1-week/50-req death), with searchable history and the ability to share a captured event with a teammate — plus settable response status/headers to test retry logic.

**Secondary moats:** privacy framing (ephemeral/private endpoints; optional self-host) answers the "I won't send PII to a hosted box" objection; multi-provider breadth answers Stripe-CLI's single-provider limit.

**What NOT to chase:** at-scale production delivery/queuing (Hookdeck/Svix/Convoy's turf, millions of events, "needs real infra") — out of our ICP and a pricing/engineering trap for a weekly ship.

---

## Willingness-to-pay / pricing-anchor summary

**Dev-time inspection category (our true comp set) — this is the band that matters:**
- webhook.site: Basic **$9/mo**, Pro **$19/mo**, Enterprise $69/mo
- RequestBin Pro: **$12/mo**
- Beeceptor: **$10 / $25 / $99/mo**
- ngrok: from **~$8/mo**

**Production-delivery platforms (anchor the ceiling, not our price):**
- Hookdeck Event Gateway: $0 → **$499/mo**; Outpost $10/M events
- Svix Professional: **from $490/mo**
- Convoy Cloud Pro: **$99/mo** flat; self-host Premium $999/mo
- Hook0: Startup **€59**, Pro **€190/mo**

**Read:** The dev-tool inspection market clusters tightly at **$9–$19/mo**, with webhook.site — the incumbent we'd position against — at exactly $9 (Basic) and $19 (Pro). The $0 free floor (webhook.site free, ngrok, Stripe CLI, smee) is the real competitor: our paid value must be obvious enough to clear it.

**Pricing recommendation: one plan at ~$12/mo** (annual ~$8–9/mo), optionally a $19 "Pro/Team" tier.
- Sits mid-band, undercuts webhook.site Pro ($19) while matching RequestBin ($12) and beating Beeceptor's $25 second tier.
- $12 > webhook.site Basic ($9) is justified *only if* we lead with the verify-explain + re-signed-replay features that Basic lacks entirely — i.e. we're not a cheaper inspector, we're a *different, higher-value* job.
- Keep a genuinely useful free tier (stable URL + capture + basic verify, capped history) to beat the $0 anchor on day one and drive virality; gate verify-explain depth, replay/forward, retention, and team sharing behind paid.

*WTP caveat:* this is anchored on competitor prices, not direct VOC (no "I'd pay $X" quote found; Reddit inaccessible). Validate with a landing-page + Stripe payment-link pre-order before committing (**Confidence: Medium**).
