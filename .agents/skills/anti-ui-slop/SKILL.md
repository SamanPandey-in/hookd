---
name: anti-ui-slop
description: Stop coding agents from shipping generic UI. Use UIZZE's 800,000+ real web and iOS screens to build product-specific interfaces, define a design contract, cover required states, and run a hard finish gate. Use when designing, implementing, redesigning, critiquing, or pre-ship reviewing a web or iOS interface in Codex, Claude Code, Cursor, Copilot, or another coding agent. Trigger with "anti-ui-slop", "stop UI slop", "ground this UI in real screens", or "run the UI finish gate".
license: Apache-2.0; see LICENSE and NOTICE for attribution
allowed-tools: Read, Glob, Grep, WebFetch
metadata:
  version: "1.4.0"
  author: "UIZZE <business@uizze.com>"
  compatibility: "Designed for Claude Code, Codex, Cursor, and GitHub Copilot; works in any agent that can read project files and fetch a URL."
  tags: "ui-design, design-system, design-review, frontend, web-ui, ios-ui"
---

> **Stop AI coding agents from shipping generic UI.**

# Stop Making UI Slop

Build product-specific UI with 800,000+ real web and iOS screens via [UIZZE](https://uizze.com).

![Stop Making UI Slop with UIZZE](https://uizze.com/landing/anti-ui-slop-skill-banner.png)

## Overview

Use the product brief, existing UI, components, and local design system to make intentional interfaces. Uizze supplies focused design guidance and, when useful, a small number of relevant visual references.

## Quick path

For one web page or screen, this is enough. Read the playbooks below only when the task needs them.

1. **Contract:** write down the audience, the primary task, this category's default page and its predictable opposite. Choosing the opposite is still a rut, so name what this product does that neither one shows.
2. **Show the product in the default view:** the first screen should prove the product's own idea without a click. Never invent customers, testimonials, statistics or capabilities.
3. **Build the real states:** loading, empty, error and success where they exist. Keep destructive actions quiet until they are needed. Long values such as email addresses must stay readable on a phone.
4. **Count before you finish:** 1 accent hue, every corner radius from one stated scale, 0 emoji in UI chrome, 0 gradients without a brand reason, 0 duplicate labels for one intent. A failed count is a fix, not a judgment call.
5. **Look at it once, fix, stop:** render desktop and phone width. Headless Chrome will not lay out below about 500px with `--window-size` and crops instead, so load the page in a 390px-wide iframe.

Skip what you cannot use: no image tool means no image target, no Uizze tools means no references, and a task that allows no extra files means no receipt. Say what you skipped in the handoff.

## Prerequisites

- A screen or component to build, redesign, or review — a file path or a short description.
- The product's existing components, design tokens, and visual language, so the build extends them instead of inventing a new system.
- Optional access to the paid Uizze MCP for focused references and hosted materials.

## Authentication

- The free skill and public catalogue work without an account, token, MCP connection, dependency, script, or executable.
- The optional full UIZZE MCP may use the host's normal connection and authentication flow. Never claim it is connected without an actual host result.

## Work from the product

Read the brief, existing UI, components, tokens, assets, and any PRODUCT.md or DESIGN.md before designing. The user's request and project constraints outrank this skill. Preserve an established visual system for extensions and polish; replace it only for an approved redesign. A new project does not require those files.

Identify the audience, primary task, important states, and intended result. Ask only about missing choices that would materially change the work. A precise request is enough to proceed; do not turn a small fix into a discovery workshop.

## Research before choosing the target

For a new design, an approved redesign or a substantive improvement, use [the research playbook](reference/research.md): the agent discovers and inspects relevant screens and flow steps, selects useful examples, and turns their lessons into a checkable specification. Do this automatically before generating a new target; do not require manual browsing, a saved collection or shortlist approval. Supplied references and existing product constraints retain authority when present; small technical fixes need no research ceremony.

Apply [anti-slop craft](reference/anti-slop-craft.md) for visual consistency and, when relevant, navigation and motion. Preserve deliberate brand exceptions and native platform behavior.

Load these supporting playbooks only when the task needs them:

- Native inputs, sheets and menus: [mobile controls](reference/mobile-controls.md).
- Data-backed flows, recovery, typing or measured latency: [state and performance](reference/mobile-state-performance.md).
- New or revised illustrations and imagery: [image assets](reference/image-assets.md).
- Native screen, gesture and full-flow checks: [native verification](reference/native-verification.md).

## Image first, then implement

Follow [Uizze's image-to-UI workflow](references/uizze-image-to-ui.md) before visual implementation. For new visual work or an approved redesign, use an available authorized image-generation tool to create and inspect the actual UI target before writing UI code. A supplied approved image is already the target; do not regenerate it. Save its actual dimensions and implement it 1:1 with real text, components and working controls.

Render at the target viewport after fonts and images load, compare side by side or with an overlay, and correct visible differences before claiming a match. Keep the target stable rather than redesigning it to fit the code. Small technical fixes, read-only audits and unavailable image tools do not require a new image; disclose limitations and preserve the existing system.

## Select the workflow

Load the playbook for the requested action, plus the platform and craft guidance needed to execute it:

- New interface or major redesign: [new-work](reference/new-work.md)
- Product or dashboard work: [operate](reference/operate.md)
- Refinement and polish: [polish](reference/polish.md)
- Simplification: [distill](reference/distill.md)
- Explicit web audit: [audit](reference/audit.md), read-only unless fixes were requested
- Native iOS: [iOS](reference/ios.md), alongside the action's playbook; for an audit, use [native audit](reference/audit.native.md) instead of a DOM scan
- Explicit `/overdrive`, “Uizze Overdrive”, or a request for exceptional interaction work: [Overdrive](reference/overdrive.md)

For implementation, use [craft](reference/craft.md) after the direction is settled. Load only relevant files; multiple complementary playbooks are allowed. Overdrive is opt-in, not the default for ordinary UI work. It requires a chosen direction before implementation.

“Use Uizze Overdrive on this screen” works through this router; a native slash command depends on the host. These are self-contained Markdown playbooks, not an installer, background service, or executable engine.

## Optional Uizze evidence

Read [the reference policy](references/uizze-reference-policy.md) before using `find_ui_references` or `find_ui_materials`. Inspect relevant visual evidence when it can inform the layout, state, interaction, or assets. Use the host's available tools, not invented calls or connections. Paid retrieval is optional; missing access does not block local design work.

Distinguish an exact reference, a related example, no match, and a service error. Briefly disclose a limitation that affected the result. Never claim an image was inspected or a state was found without evidence.

## Finish

Build the requested scope and exercise its important states. Render and inspect the real result at representative desktop/mobile sizes or native device classes, including the user's reported failing size. Compare it with the chosen direction or supplied reference, not just with the absence of runtime errors.

Fix material problems in a batch, then render and inspect again. Stop once the requested result is verified; do not keep inventing work. If a bounded pass cannot resolve an issue, report it instead of claiming a pass. When rendering is unavailable, distinguish code checks from visual verification.

Save the actual captures, tested states and source hashes using [visual verification](references/uizze-visual-verification.md). Its optional local integrity check rejects missing or stale evidence; it does not judge aesthetics or replace inspection. Link the receipt in the handoff and keep blocked checks explicit.

Keep the handoff concise: what changed, what was actually tested, and any remaining limitation. A skill does not authorize publishing, purchases, new dependencies, account changes, or destructive actions.
