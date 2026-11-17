import Link from "next/link";
import type { Metadata } from "next";
import { LogoMark } from "@/components/ui/logo-mark";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "not found",
  robots: { index: false, follow: false },
};

// Branded 404 (STANDOUT §3.11): a missing page is rendered as a captured
// request that didn't verify — a fake stream row + a verify-panel FAIL card —
// so a typo or an expired share link reads as unmistakably hookd. Static server
// component: the stream-row and verify-panel look is reproduced inline (no
// "use client" imports), matching the real components' tokens and voice.
export default function NotFound() {
  return (
    <main
      id="main"
      className="bg-signal-grid relative flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-16"
    >
      <Link
        href="/"
        aria-label="hookd — home"
        className="rounded-sm focus-visible:outline-2"
      >
        <LogoMark />
      </Link>

      <div className="flex w-full max-w-md flex-col gap-3">
        {/* Fake stream row — matches components/inspector/stream-row.tsx */}
        <div
          className="flex w-full items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2.5"
          aria-hidden
        >
          <span
            className="inline-block font-mono text-[10px] leading-none"
            style={{ color: "var(--muted)" }}
          >
            ◦
          </span>
          <span className="w-10 shrink-0 font-mono text-xs font-medium text-muted">
            GET
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-text">
            /this-page
          </span>
          <span
            className="shrink-0 font-mono text-sm tabular-nums"
            style={{ color: "var(--fail)" }}
          >
            404
          </span>
          <span className="shrink-0 font-mono text-[11px] text-muted">
            unverified
          </span>
        </div>

        {/* Verify-panel FAIL card — matches signature-verify-panel.tsx (rule-fail) */}
        <div className="rule-fail rounded-md border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              Signature
            </span>
            <span
              className="inline-flex items-center gap-1.5 font-mono text-sm font-medium"
              style={{ color: "var(--fail)" }}
            >
              <span aria-hidden>✕</span>
              FAILED
            </span>
          </div>

          <p className="px-4 pb-1 pt-1.5 font-mono text-xs leading-relaxed text-text break-words">
            no_such_route — the url may be mistyped, or a shared event expired.
            nothing was lost.
          </p>
          <p className="px-4 pb-3 pt-0.5 font-mono text-xs leading-relaxed text-muted break-words">
            likely fix: pick up from somewhere real.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className="rounded-sm focus-visible:outline-2">
          <Button variant="primary" size="lg">
            back home
          </Button>
        </Link>
        <Link href="/debugger" className="rounded-sm focus-visible:outline-2">
          <Button variant="secondary" size="lg">
            debug a signature
          </Button>
        </Link>
      </div>
    </main>
  );
}
