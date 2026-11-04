import * as React from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/types";

// Plan-gating affordances (DESIGN §8). The upgrade path is the money path, so
// these must read clearly — but the lime accent is RESERVED for verify-PASS and
// the arrival pulse, so nothing here borrows it. Pro/upgrade affordances are
// NEUTRAL/muted (hairline border, muted ink); the only sanctioned accent use is
// a primary (accent-fill) <Button>, which the account page and pricing CTA use.

/** Where in-app upgrade links point: the account / billing page owns checkout,
 *  which keeps a single primary verb per surface. */
export const UPGRADE_HREF = "/settings/billing";

/** A small muted "Pro" lock pill — marks a control the free plan can't use. */
export function ProLock({
  label = "Pro",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted leading-none",
        className,
      )}
    >
      <Lock className="h-2.5 w-2.5" aria-hidden />
      {label}
    </span>
  );
}

/** A muted, dotted-underline upgrade link. Verb-first, no accent, no arrow. */
export function UpgradeLink({
  children = "upgrade to pro",
  href = UPGRADE_HREF,
  className,
}: {
  children?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-sm font-mono text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-text focus-visible:outline-2",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** An inline upgrade prompt — the persistent, non-toast surface shown when a
 *  Pro action is attempted or blocked (DESIGN §7: never a vanishing toast).
 *  Neutral treatment on surface-hi; carries a verb link to the account page. */
export function UpgradePrompt({
  message,
  href = UPGRADE_HREF,
  className,
}: {
  message: string;
  href?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-sm border border-border bg-surface-hi px-3 py-2",
        className,
      )}
    >
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      <p className="min-w-0 flex-1 font-mono text-[11px] leading-relaxed text-text break-words">
        {message} <UpgradeLink href={href} />
      </p>
    </div>
  );
}

/** The plan indicator in the app shell. Neutral — a plan is NOT the "verified"
 *  semantic, so it never uses the lime rule (DESIGN §8). Links to billing. */
export function PlanBadge({
  plan,
  className,
}: {
  plan: Plan;
  className?: string;
}) {
  const pro = plan === "pro";
  return (
    <Link
      href={UPGRADE_HREF}
      aria-label={pro ? "pro plan — manage billing" : "free plan — billing"}
      className={cn(
        "inline-flex items-center rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none focus-visible:outline-2",
        pro ? "text-text" : "text-muted hover:text-text",
        className,
      )}
    >
      {pro ? "pro" : "free"}
    </Link>
  );
}
