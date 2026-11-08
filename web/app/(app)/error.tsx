"use client";

import * as React from "react";
import Link from "next/link";
import { LogoMark } from "@/components/ui/logo-mark";
import { Button } from "@/components/ui/button";

// Route-level error boundary for the authed app (P1-21). An uncaught throw in
// any (mostly client) app page lands here instead of Next's default screen.
// Branded, calm, reassuring — data is safe, this is just the view. `reset()`
// re-renders the segment; the home link is the escape hatch.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // No external logger is wired yet; keep a console trail for debugging.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <LogoMark />
      <div className="flex flex-col gap-2">
        <h1 className="font-sans text-lg font-semibold text-text">
          something broke on this screen
        </h1>
        <p className="max-w-md font-mono text-xs leading-relaxed text-muted">
          an unexpected error interrupted this view. your captured events are
          safe — this is just the page. try again, or head back to your
          endpoints.
        </p>
        {error?.digest && (
          <p className="font-mono text-[11px] text-muted">ref: {error.digest}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="md" onClick={reset}>
          try again
        </Button>
        <Link
          href="/app"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-border bg-transparent px-3.5 font-sans text-sm font-semibold text-text transition-colors duration-[80ms] hover:bg-surface-hi focus-visible:outline-2"
        >
          back to endpoints
        </Link>
      </div>
    </div>
  );
}
