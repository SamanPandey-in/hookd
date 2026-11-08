import Link from "next/link";
import type { Metadata } from "next";
import { LogoMark } from "@/components/ui/logo-mark";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "not found",
  robots: { index: false, follow: false },
};

// Branded 404 — shared or expired links (and typos) land here instead of bare
// Next chrome. Lowercase house voice; offers the two real next steps.
export default function NotFound() {
  return (
    <main
      id="main"
      className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-4 text-center"
    >
      <Link
        href="/"
        aria-label="hookd — home"
        className="rounded-sm focus-visible:outline-2"
      >
        <LogoMark />
      </Link>

      <div className="flex flex-col items-center gap-3">
        <p className="font-mono text-sm text-muted">404</p>
        <h1 className="max-w-md font-sans text-2xl font-semibold leading-tight tracking-tight text-text sm:text-3xl">
          this page isn&rsquo;t here.
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted">
          the link may be mistyped, or a shared event may have expired. nothing
          was lost — pick up from somewhere real.
        </p>
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
