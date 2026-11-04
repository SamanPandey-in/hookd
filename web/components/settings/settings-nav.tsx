"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// The settings section sub-nav. Items point at the sibling /settings/* routes
// plus billing (/account) and docs (/docs) — those are owned by other surfaces,
// so this LINKS to them, never renders them. Active treatment matches the app's
// command-bar: a lime left-rule + full-strength ink (DESIGN §5.1 / §8 — the
// lime accent is spent sparingly, here only to mark the current section).

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
    href: "/settings/api-keys",
    label: "api keys",
    match: (p) => p.startsWith("/settings/api-keys"),
  },
  {
    href: "/settings/activity",
    label: "activity",
    match: (p) => p.startsWith("/settings/activity"),
  },
  { href: "/settings/billing", label: "billing", match: (p) => p.startsWith("/settings/billing") || p.startsWith("/account") },
  { href: "/docs", label: "docs", match: (p) => p.startsWith("/docs") },
];

/** Desktop: a vertical rail. Each item is a Link with a 2px active left-rule. */
export function SettingsNav({ className }: { className?: string }) {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="settings"
      className={cn("flex flex-col gap-0.5", className)}
    >
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
    </nav>
  );
}

/** Mobile: a horizontally-scrolling tab strip of the same items. */
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
    </nav>
  );
}

/** Mobile fallback for very narrow widths handled by CSS; this <select> jumps
 *  between sections without relying on hover/scroll. Used alongside the strip. */
export function SettingsNavSelect({ className }: { className?: string }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const current =
    SETTINGS_NAV.find((i) => i.match(pathname))?.href ?? "/settings/profile";
  return (
    <label className={cn("block", className)}>
      <span className="sr-only">settings section</span>
      <select
        value={current}
        onChange={(e) => router.push(e.target.value)}
        className="h-9 w-full rounded-sm border border-border bg-surface-hi px-3 font-sans text-sm text-text focus-visible:outline-2"
      >
        {SETTINGS_NAV.map((item) => (
          <option key={item.href} value={item.href}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
