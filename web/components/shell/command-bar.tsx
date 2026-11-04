"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/ui/logo-mark";
import { LiveDot } from "@/components/ui/status";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// Top command bar (DESIGN §5.1): logo mark, primary nav with an active
// underline, an optional live `●` indicator, and the account cluster on the
// right. 56px tall, hairline bottom, translucent so content scrolls under it.
const NAV: { href: string; label: string; match: (p: string) => boolean }[] = [
  {
    href: "/app",
    label: "endpoints",
    match: (p) => p === "/app" || p.startsWith("/app/"),
  },
  {
    href: "/docs",
    label: "docs",
    match: (p) => p.startsWith("/docs"),
  },
  {
    href: "/settings",
    label: "settings",
    // The settings hub nests profile, appearance, api keys, activity and
    // billing (/account) — mark it active across all of them. Docs is its own
    // top-level destination, not a settings tab.
    match: (p) => p.startsWith("/settings") || p.startsWith("/account"),
  },
];

export function CommandBar({
  live,
  right,
}: {
  /** Pass to show the live indicator (e.g. when an SSE stream is open). */
  live?: { on: boolean; label?: string };
  right?: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-border bg-bg/80 px-4 backdrop-blur-md">
      <Link
        href="/app"
        className="mr-2 flex items-center gap-2 rounded-sm focus-visible:outline-2"
        aria-label="hookd — endpoints"
      >
        <LogoMark />
      </Link>

      <nav className="flex items-center gap-1" aria-label="primary">
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px flex h-14 items-center border-b-2 px-2.5 font-sans text-sm transition-colors duration-[80ms] focus-visible:outline-2",
                active
                  ? "border-accent text-text"
                  : "border-transparent text-muted hover:text-text",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {live && <LiveDot on={live.on} label={live.label} className="ml-1" />}

      <div className="ml-auto flex items-center gap-1.5">
        {right}
        <ThemeToggle />
      </div>
    </header>
  );
}

/** A compact label for the currently-selected endpoint, mono, truncating. */
export function EndpointTag({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-xs text-muted",
        className,
      )}
    >
      <span className="text-text">endpoint:</span>
      <span className="max-w-[12rem] truncate text-text" title={name}>
        {name}
      </span>
    </span>
  );
}
