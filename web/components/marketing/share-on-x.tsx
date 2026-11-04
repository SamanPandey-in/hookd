"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

// Share-on-X button. Opens the X (Twitter) web intent with prefilled copy + the
// current page URL. The origin is only known client-side, so it's filled in an
// effect after mount (SSR renders a text-only intent, so no hydration mismatch).
const TEXT = `verify every webhook signature — and replay the exact event, re-signed. ${BRAND.name} →`;

function intentHref(url?: string) {
  const base = `https://twitter.com/intent/tweet?text=${encodeURIComponent(TEXT)}`;
  return url ? `${base}&url=${encodeURIComponent(url)}` : base;
}

export function ShareOnX({
  className,
  label = "share on x",
}: {
  className?: string;
  label?: string;
}) {
  const [href, setHref] = React.useState(intentHref());

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHref(intentHref(window.location.origin));
  }, []);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 rounded-sm border border-border bg-transparent px-3.5 py-2 font-sans text-sm font-medium text-text transition-colors duration-[80ms] hover:border-muted hover:bg-surface-hi focus-visible:outline-2",
        className
      )}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      {label}
    </a>
  );
}
