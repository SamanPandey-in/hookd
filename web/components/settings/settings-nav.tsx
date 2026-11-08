"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";

// The settings section sub-nav. Items point at the sibling /settings/* routes
// plus billing (/account) — owned by another surface, so this LINKS to it,
// never renders it. Docs is a top-level destination, not a settings tab, so it
// is NOT listed here (see the command bar). Active treatment matches the app's
// command-bar: a lime left-rule + full-strength ink (DESIGN §5.1 / §8 — the
// lime accent is spent sparingly, here only to mark the current section). A
// quiet support link sits in the rail footer (P1-5 hand-off).

export interface SettingsNavItem {
  href: string;
  label: string;
  /** True when a pathname should mark this item active. */
  match: (pathname: string) => boolean;
}

export const SETTINGS_NAV: SettingsNavItem[] = [
  {
    href: "/settings/profile",
    label: "profile",
    match: (p) => p === "/settings" || p.startsWith("/settings/profile"),
  },
  {
    href: "/settings/appearance",
    label: "appearance",
    match: (p) => p.startsWith("/settings/appearance"),
  },
  {
    href: "/settings/notifications",
    label: "notifications",
    match: (p) => p.startsWith("/settings/notifications"),
  },
  {
    href: "/settings/api-keys",
    label: "api keys",
    match: (p) => p.startsWith("/settings/api-keys"),
  },
  {
    href: "/settings/activity",
    label: "activity",
    match: (p) => p.startsWith("/settings/activity"),
  },
  {
    href: "/settings/billing",
    label: "billing",
    match: (p) => p.startsWith("/settings/billing") || p.startsWith("/account"),
  },
];

/** Desktop: a vertical rail. Each item is a Link with a 2px active left-rule;
 *  a muted support link sits beneath, separated by a hairline. */
export function SettingsNav({ className }: { className?: string }) {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="settings" className={cn("flex flex-col gap-0.5", className)}>
      {SETTINGS_NAV.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center rounded-sm border-l-2 px-3 py-1.5 font-sans text-sm transition-colors duration-[80ms] focus-visible:outline-2",
              active
                ? "border-accent bg-surface-hi text-text"
                : "border-transparent text-muted hover:text-text hover:bg-surface-hi",
            )}
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/support"
        className="mt-2 flex items-center gap-1.5 border-t border-border px-3 pt-3 font-sans text-sm text-muted transition-colors duration-[80ms] hover:text-text focus-visible:outline-2"
      >
        <LifeBuoy className="h-3.5 w-3.5" aria-hidden />
        support
      </Link>
    </nav>
  );
}

/** Mobile: a horizontally-scrolling tab strip of the same items, plus support.
 *  The strip scrolls, so it already covers very narrow widths — no separate
 *  <select> fallback is needed (the former SettingsNavSelect was dead code). */
export function SettingsNavMobile({ className }: { className?: string }) {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="settings"
      className={cn(
        "-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-px",
        className,
      )}
    >
      {SETTINGS_NAV.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex h-10 shrink-0 items-center whitespace-nowrap border-b-2 px-2.5 font-sans text-sm transition-colors duration-[80ms] focus-visible:outline-2",
              active
                ? "border-accent text-text"
                : "border-transparent text-muted hover:text-text",
            )}
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/support"
        className="-mb-px flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-2.5 font-sans text-sm text-muted transition-colors duration-[80ms] hover:text-text focus-visible:outline-2"
      >
        <LifeBuoy className="h-3.5 w-3.5" aria-hidden />
        support
      </Link>
    </nav>
  );
}
