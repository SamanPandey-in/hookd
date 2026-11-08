"use client";

import * as React from "react";
import "./globals.css";
import { LogoMark } from "@/components/ui/logo-mark";
import { Button } from "@/components/ui/button";

// Top-level error boundary (P1-21). This replaces the ROOT layout when an
// uncaught error escapes everything else, so it must render its own <html> and
// <body>. No ThemeProvider here, so we fall back to the :root dark tokens
// (globals.css) and set the background explicitly — the page still reads as
// hookd, not bare Next chrome.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        className="min-h-screen font-sans"
        style={{ background: "var(--bg)", color: "var(--text)" }}
      >
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
          <LogoMark />
          <div className="flex flex-col gap-2">
            <h1 className="font-sans text-lg font-semibold text-text">
              something went wrong
            </h1>
            <p className="max-w-md font-mono text-xs leading-relaxed text-muted">
              hookd hit an unexpected error and couldn&rsquo;t finish loading.
              try again — if it keeps happening, head back to the home page.
            </p>
            {error?.digest && (
              <p className="font-mono text-[11px] text-muted">
                ref: {error.digest}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" size="md" onClick={reset}>
              try again
            </Button>
            {/* A hard document navigation is deliberate here: after a
                root-level crash we want a full reset, not client routing. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-border bg-transparent px-3.5 font-sans text-sm font-semibold text-text transition-colors duration-[80ms] hover:bg-surface-hi focus-visible:outline-2"
            >
              go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
