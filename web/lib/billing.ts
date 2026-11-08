// Billing lifecycle helpers: turn the raw subscription-status strings the Go
// backend (Dodo) emits into friendly, house-voice labels + a tone, and classify
// the lifecycle so every billing surface (the global dunning banner, the account
// page, resume/downgrade copy) reads the same way. The raw strings live in
// server/internal/api/billing.go (statusFromEvent); keep this in sync with them.
//
// Design note: the lime accent (--accent) is RESERVED for verify pass/arrival.
// Nothing here borrows it — healthy billing reads NEUTRAL (text ink), trouble
// reads coral (--warn). Pro/upgrade is never lime.

import type { Subscription } from "./types";
import { formatDate } from "./utils";

// The subscription-status union is defined ONCE in ./types (the wire-shape
// source of truth) and re-exported here so billing code can import it locally.
export type { SubscriptionStatus } from "./types";

// Plan constants mirrored from server/internal/plan/plan.go so downgrade copy
// can state exact numbers without a round-trip. If those change, change these.
export const FREE_RETENTION_DAYS = 7;
export const PRO_RETENTION_DAYS = 90;
export const DOWNGRADE_GRACE_DAYS = 5;

/** Billing copy tone → CSS var. Never lime. */
export type BillingTone = "neutral" | "warn" | "muted";

export const BILLING_TONE_VAR: Record<BillingTone, string> = {
  neutral: "var(--text)",
  warn: "var(--warn)",
  muted: "var(--muted)",
};

/** Payment-trouble states: Pro is still live (or just lost) but a charge is
 *  failing and the user must fix their card. Drives the global dunning banner.
 *  Matches the backend's dunning/retry window (on_hold keeps Pro). */
export function isDunning(status: string): boolean {
  return status === "past_due" || status === "on_hold" || status === "failed";
}

/** Terminal states: the subscription has ended and the account is back on free,
 *  but a prior subscription record exists — so the user can resume and still
 *  reach their invoices/receipts. */
export function isLapsed(status: string): boolean {
  return status === "cancelled" || status === "expired";
}

export interface StatusLabel {
  label: string;
  tone: BillingTone;
}

/** Friendly label + tone for a subscription, resolved against the
 *  cancel-at-period-end flag and the period-end date. Use this EVERYWHERE
 *  instead of rendering the raw `subscription.status`. */
export function subscriptionStatus(sub: Subscription): StatusLabel {
  const end = formatDate(sub.current_period_end);
  switch (sub.status) {
    case "active":
      if (sub.cancel_at_period_end)
        return { label: `cancels on ${end}`, tone: "warn" };
      return { label: "active", tone: "neutral" };
    case "trialing":
      return { label: "trial", tone: "neutral" };
    case "on_hold":
    case "past_due":
      return { label: "payment failing — retrying", tone: "warn" };
    case "failed":
      return { label: "payment failed", tone: "warn" };
    case "cancelled":
      return { label: `ended ${end}`, tone: "muted" };
    case "expired":
      return { label: "expired", tone: "muted" };
    default:
      return { label: sub.status || "unknown", tone: "muted" };
  }
}

/** The honest label for the `current_period_end` date given the status. Fixes
 *  the misleading "renews on <date>" shown during on_hold / past_due (the charge
 *  is being retried, not renewing) and for a cancel-at-period-end subscription. */
export function periodEndLabel(sub: Subscription): string {
  if (isDunning(sub.status)) return "retrying payment — due";
  if (sub.cancel_at_period_end) return "ends";
  if (isLapsed(sub.status)) return "ended";
  return "renews";
}
