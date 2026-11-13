# hookd — docs index

> Start here. One line per document, newest planning round first. Agents picking up work
> should read the row for their lane, then the doc, then `../commands.md` for the gate.

## Pre-launch planning round (2026-11-16, 3 days to launch)

Four documents produced in parallel — one from a live browser walk-through, three from
code + web research. They deliberately overlap in a few places (the Svix header hole, the
public-debugger first paint, the share link); where they do, the finding is real.

| Doc | Question it answers | Read it if you are… |
|-----|---------------------|---------------------|
| [UX_AUDIT.md](./UX_AUDIT.md) | *What did a human-style click-through of the running app actually expose?* 4 P0 bugs (share link copies the API JSON URL; "send sample" fails on auto-detect endpoints; debugger verdict renders off-screen; verify panel says `provider: auto-detect` on a detected event), 13 P1 frictions, 10 polish items, 10 UX-level improvements. | fixing bugs on the first-session path; recording the demo GIF |
| [FEATURE_GAPS.md](./FEATURE_GAPS.md) | *What features are missing vs Hookdeck / webhook.site / ngrok / Svix Play / Beeceptor / Stripe CLI, and which fit before Nov 19?* Competitor matrix, 20 ranked candidates, a 4-item pre-launch set (`svix-*` header aliases — a correctness bug; handler-scaffold tab; trigger library; secret-finder guidance), a week-1 set (MCP server, body-mutation detector v2, provider wave 2, CLI filters), rejects, and post-launch signals. | adding features; deciding the next provider |
| [STANDOUT.md](./STANDOUT.md) | *Does it look generic or sloppy? What would make it spread on X?* Verdict 7/10 "crafted with sloppy seams"; per-surface scores; copy contradictions (FAQ says no CLI, "six providers" in meta/README/CLI, scheme-less `localhost:3000` examples, CLI defaults to localhost, legal DRAFT banner); voice/design-system drift; ranked stand-out moves (shareable diagnosis card, debugger opens on a PASS, per-share OG, signed-bytes visualizer, CLI polish); replacement copy; top-10 for the 3 days. | touching marketing, copy, themes, OG, CLI output |
| [SELF_HOST.md](./SELF_HOST.md) | *How do we ship a self-hostable hookd without cannibalising Pro?* Licensing decision, hosted-coupling audit (auth, plan gating, SSRF guard, cookies, email…), target architecture (single Go binary embedding the static Next export + Postgres via `docker compose`), `HOOKD_MODE=selfhost`, phased work breakdown in disjoint agent lanes, repo/scrub strategy, self-hoster docs outline, effort + timing, risks. | building the self-host version; preparing the public repo |

**Suggested order of execution:** UX_AUDIT P0s → FEATURE_GAPS pre-launch set → STANDOUT top-10
→ (after launch) FEATURE_GAPS week-1 set and SELF_HOST phases. Dodo/billing work is tracked
separately and intentionally excluded from these four.

## Earlier planning (executed)

| Doc | What it is |
|-----|-----------|
| [PRODUCT.md](./PRODUCT.md) | Positioning, personas, problems, v1 scope (F1–F7), pricing, privacy stance, metrics. The "what & why". |
| [DESIGN.md](./DESIGN.md) | The UI source of truth — "Graphite & Signal" tokens, screen specs, voice, anti-slop checklist §8. |
| [PLAN.md](./PLAN.md) | Original build plan / architecture. |
| [IMPR_PLAN.md](./IMPR_PLAN.md) | The four moat features (fix-it guidance, edit-then-replay, public debugger, CLI) — shipped 2026-11-07. |
| [UX_PLAN.md](./UX_PLAN.md) | Whole-product UX teardown + 5-lane execution — executed 2026-11-07; §8 lists remaining fast-follows and required user actions (git init, deploy, legal review, support inbox, `NEXT_PUBLIC_SITE_URL`). |
| [CLI.md](./CLI.md) | `npx hookd listen` design + usage. |
| [DEPLOY.md](./DEPLOY.md) | Hosted deployment (Vercel + EC2/Caddy + Neon), pre-launch checklist, cookie footgun. |
| `research/` | Competitive analysis, customer research, UI inspiration that PRODUCT/DESIGN distil. |

## Operational

- [`../commands.md`](../commands.md) — build / test / run / full gate / E2E / add-a-provider / deploy / troubleshooting.
- [`../server/.env.example`](../server/.env.example) — every backend env var with docs.
