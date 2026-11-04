# AGENTS.md — Webhook Debugger (Weekly Ship #2)

> Operating manual for every agent (and human) working in this repo.
> Read this **first**, then `docs/PLAN.md`, `docs/PRODUCT.md`, `docs/DESIGN.md`.
> Working name only — **don't spend effort on branding/naming. Functionality and UI quality are what matter.**

---

## 0. Mission & constraints (non-negotiable)

- This is **Weekly Ship product #2**: a **paid** ($9–19/mo) webhook debugging tool. Goal = **first revenue** + a demo GIF that spreads on X.
- **Ship date: 2026-11-19.** Cadence beats polish. **Cut scope, never the date.** If something threatens the date, flag it in `docs/PLAN.md` and the handoff *immediately*.
- Every shippable surface must be **demo-GIF-worthy**: the live inspector must look sharp and feel *alive* (webhooks landing in real time is the money shot).
- The product takes **untrusted input from the public internet** (that's literally the feature). Security is a feature, not an afterthought — see §6.

## 1. Repo layout

```
webhook-debugger/
├── AGENTS.md            ← you are here (process + rules)
├── docs/
│   ├── PLAN.md          ← phased build plan + task breakdown (source of truth for "what next")
│   ├── PRODUCT.md       ← product requirements (what we build & why) — grounded in research
│   ├── DESIGN.md        ← UI/UX requirements + design system (source of truth for every pixel)
│   └── research/        ← customer-research.md, competitive-analysis.md, ui-inspiration.md
├── server/              ← Go backend: ingest, store, verify, replay, SSE, API
├── web/                 ← Next.js frontend: landing + app (inspector/dashboard)
├── cli/                 ← Go CLI: forward captured webhooks to localhost (the paid hook)
└── .agents/skills/      ← installed skills (see §3). Do NOT edit these.
```

Create `server/`, `web/`, `cli/` as the plan reaches them — don't scaffold empty shells early.

## 2. Golden rules for agents

1. **Orient before you act.** Read `docs/PLAN.md` + the relevant doc (`PRODUCT.md`/`DESIGN.md`) before writing code. They are the source of truth; this file is the process.
2. **Small, verifiable scope.** Do the task you were given; don't expand it. If you discover the scope is wrong, say so — don't silently redesign.
3. **Verify before you claim done.** Run it. Show the output. "It should work" is not done. See §5 Definition of Done.
4. **Write findings to files, report conclusions.** Long outputs (research, audits) go in `docs/`; your handoff message is the *conclusion*, not the dump.
5. **Honest handoffs.** If tests fail, say so with output. If you skipped a step, say that. Never report green on red.
6. **No secrets in the repo.** Keys/tokens live in `.env` (gitignored) and deploy env. Never commit them, never paste them into docs.

## 3. Skills — what to use when (routing table)

Skills are installed in `.agents/skills/`. Invoke the relevant one **before** doing that class of work; don't rely on default instincts.

| When you are… | Use skill | Notes |
|---|---|---|
| Choosing visual direction / building any new UI | `frontend-design` + `design-taste-frontend` | Distinctive, intentional, anti-template. `DESIGN.md` wins where it's specific. |
| Designing/implementing app screens (inspector, dashboard) | `ui-ux-pro-max` | Has a local search tool: `python .agents/skills/ui-ux-pro-max/.../scripts/search.py "<query>" --domain ux`. Query one concern at a time. |
| Grounding UI in real screens / final visual pass | `anti-ui-slop` + `ui-taste` | Design contract → build real states → count-based finish gate. |
| Reviewing UI for a11y / WCAG / UX compliance | `web-design-guidelines` | Fetches fresh Web Interface Guidelines, reports `file:line`. Run before marking UI done. |
| Reviewing code before merge/ship | `code-review` | Run on each phase's diff. Correctness first, then simplification. |
| Auditing the landing page for conversion | `landing-page-conversion-audit` | Ranked, specific fix list. Run once landing has real copy. |
| Doing customer / competitor / VOC research | `customer-research` | Watering-hole + proxy personas; confidence-label every claim. |

**UI quality is held to a high bar.** Dark-mode-first. Anti-slop guardrails in `DESIGN.md` are enforced, not optional. Spend boldness in one place; keep the rest disciplined.

## 4. Coding standards

**Go toolchain note (important):** Go 1.27.3 is installed at `C:\Users\Admin\go-sdk\go` but is **not** on a fresh shell's PATH. In **every** Bash command that runs `go`, prefix with:
`export PATH="$PATH:/c/Users/Admin/go-sdk/go/bin:/c/Users/Admin/go/bin"` (shell state does not persist between calls, so include it each time).

**Go (server + cli)**
- Go 1.27. Standard library first; add a router (chi) only if it earns its place. Keep deps minimal.
- Signature verification lives in its own package, pure functions, **no network** — table-driven tests against real captured provider payloads are mandatory (see §6).
- `context.Context` on anything I/O. Never log raw secrets or full bodies at info level.
- `gofmt`/`go vet` clean. Errors wrapped with context, handled not swallowed.

**TypeScript (web)**
- Next.js (App Router) + Tailwind + shadcn/ui, matching the Week-1 setup. React Server Components by default; client components only where interactivity needs them.
- Strict TS, no `any` that you can avoid. Typecheck + prod build must pass before "done".
- Data/stream contracts with the Go API live in one typed module; don't scatter `fetch` shapes.

**General**
- Match existing style in the file you're editing. Comments explain *why*, not *what*.
- Reuse from `D:\weekly-ship\old-ast-parser` only what genuinely fits (deploy configs/CI patterns) — this is mostly a greenfield Go product; don't force reuse.

## 5. Testing & Definition of Done

A task is **done** only when:
- [ ] It runs. You executed it and pasted the real result (curl output, test run, screenshot).
- [ ] Automated checks pass: Go `go test ./...` + `go vet`; web `tsc --noEmit` + `next build` + lint.
- [ ] Security-sensitive code (signature verify, replay target, auth) has tests covering the failure cases, not just the happy path.
- [ ] UI work: rendered at **desktop + 390px phone** width, all real states present (loading/empty/error/success), keyboard focus visible, reduced-motion respected, dark+light checked, and it passed the `anti-ui-slop` finish count.
- [ ] You updated `docs/PLAN.md` status and left an honest handoff (what changed, what was tested, what's still open).

## 6. Security rules (this product eats hostile input)

1. **Ingest is public and untrusted.** Cap body size, cap header count/size, never execute or interpolate captured content. Store and display it as inert data. The inspector renders bodies as text/escaped — never as live HTML.
2. **Signature verification must be exact.** Constant-time comparison (`hmac.Equal`), correct per-provider scheme (Stripe = `t=` + `v1=` HMAC-SHA256 over `timestamp.payload`, tolerance window; GitHub = `X-Hub-Signature-256`; Razorpay = HMAC-SHA256; etc.). Test against real known-good **and** tampered payloads. A false "verified" is a product-destroying bug.
3. **Replay/forward is an SSRF surface.** When re-sending to a user-supplied **target URL**, block private/loopback/link-local ranges and cloud metadata IPs (169.254.169.254), enforce scheme allowlist (https/http), timeouts, and no redirects to private space. Localhost forwarding is done **client-side by the user's own CLI** — that's safe; server-side forwarding to arbitrary URLs is not.
4. **Auth & tenancy.** A user can only see their own endpoints/requests. Check ownership on every endpoint-scoped route. Ingest URLs are unguessable (≥128 bits).
5. **Rate limit** ingest and API per endpoint/IP. Abuse of a public ingest URL must not take the service down.

## 7. How subagents should operate

- You were spawned with a specific task. Read `AGENTS.md` + `docs/PLAN.md` + the doc named in your brief before touching code.
- Keep your blast radius to the files in your task. If you need to change a shared contract, note it loudly in your handoff.
- Prefer writing a long artifact to a file over returning it inline. Return the conclusion + where you wrote it.
- When building UI, actually render and look at it (browser/screenshot) before claiming it's good — per `anti-ui-slop`/`ui-taste`.
- Don't deploy, publish, install new paid services, or run destructive commands without explicit approval.

## 8. Git & handoff

- Branch off before committing; don't commit to the default branch directly. Commit/push only when the user asks.
- End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- End PR descriptions with:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- `.env`, build output, `node_modules`, Go binaries are gitignored. Research docs and plans ARE committed.
