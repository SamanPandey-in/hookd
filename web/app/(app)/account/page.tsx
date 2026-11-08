"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { billing, endpoints as endpointsApi, ApiError } from "@/lib/api";
import type { Me, Subscription } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  subscriptionStatus,
  periodEndLabel,
  isDunning,
  BILLING_TONE_VAR,
  FREE_RETENTION_DAYS,
  PRO_RETENTION_DAYS,
  DOWNGRADE_GRACE_DAYS,
} from "@/lib/billing";
import { useMe } from "../layout";
import {
  PRO_FEATURES,
  PRO_PRICE,
  type Cycle,
} from "@/components/marketing/pricing-plans";
import { Panel, FieldLabel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { PlanBadge } from "@/components/ui/upgrade";
import { ErrorBanner } from "@/components/ui/states";

// Account / billing (DESIGN §5.3). Lives inside the authed shell, so the plan
// and subscription come from the shell's /me via context — no second fetch.
// Real states throughout: a free account sees the upgrade card (monthly/annual
// + a real Dodo checkout); a Pro account sees status + renewal/cancel and the
// customer portal; a 503 from either action shows a calm "not enabled yet".

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : (e as Error).message || "failed";
}

export default function AccountPage() {
  const me = useMe();
  const pathname = usePathname();
  // The shell only renders children once /me resolves; guard so a direct hit
  // never throws while context settles.
  if (!me) return null;
  const isPro = me.plan === "pro";
  const sub = me.subscription;
  // A user with a prior subscription that is no longer Pro (cancelled/expired/
  // failed) can still resume and still reach invoices — distinct from someone
  // who never subscribed (P1-19/P1-20).
  const hadSub = !!sub;

  // This component is the canonical billing page; /settings/billing re-exports
  // it under the settings layout, which already renders an <h1>settings</h1>
  // and constrains width with a rail. Rendered there, drop our own max-w-2xl
  // and demote the heading to an <h2> so there is a single heading and a single
  // width constraint (P2). Standalone at /account we own both.
  const underSettings = pathname?.startsWith("/settings") ?? false;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-6",
        !underSettings && "mx-auto max-w-2xl",
      )}
    >
      <div className="flex flex-col gap-1">
        {underSettings ? (
          <h2 className="font-sans text-lg font-semibold tracking-tight text-text">
            billing
          </h2>
        ) : (
          <h1 className="font-sans text-xl font-semibold tracking-tight text-text">
            billing
          </h1>
        )}
        <p className="text-sm text-muted">
          your plan and subscription. billed via dodo payments — merchant of
          record, handles global tax &amp; vat.
        </p>
      </div>

      <PlanSummary isPro={isPro} subscription={sub} />

      <UsagePanel me={me} isPro={isPro} />

      {isPro ? (
        <ManageSubscription me={me} subscription={sub} />
      ) : hadSub && isDunning((sub as Subscription).status) ? (
        // A `failed`-status account has dropped to free but a charge is still
        // being retried — the global banner already frames it as recoverable, so
        // route to the portal (update card), NOT ResumeSection's "pro ended".
        <ManageSubscription me={me} subscription={sub} />
      ) : hadSub ? (
        <ResumeSection me={me} subscription={sub as Subscription} />
      ) : (
        <UpgradeCard />
      )}
    </div>
  );
}

function PlanSummary({
  isPro,
  subscription,
}: {
  isPro: boolean;
  subscription: Subscription | null;
}) {
  return (
    <Panel className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <FieldLabel>current plan</FieldLabel>
          <span className="font-sans text-lg font-semibold text-text">
            {isPro ? "pro" : "free"}
          </span>
        </div>
        <PlanBadge plan={isPro ? "pro" : "free"} />
      </div>

      {subscription ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-t border-border pt-3">
          <dt className="font-mono text-[11px] text-muted">status</dt>
          {(() => {
            const s = subscriptionStatus(subscription);
            return (
              <dd
                className="font-mono text-xs"
                style={{ color: BILLING_TONE_VAR[s.tone] }}
              >
                {s.label}
              </dd>
            );
          })()}
          <dt className="font-mono text-[11px] text-muted">
            {periodEndLabel(subscription)}
          </dt>
          <dd className="font-mono text-xs text-text tabular-nums">
            {formatDate(subscription.current_period_end)}
          </dd>
          {subscription.cancel_at_period_end &&
            subscription.status === "active" && (
              <>
                <dt className="font-mono text-[11px] text-muted">auto-renew</dt>
                <dd
                  className="font-mono text-xs"
                  style={{ color: "var(--warn)" }}
                >
                  off — re-enable in the portal
                </dd>
              </>
            )}
        </dl>
      ) : isPro ? (
        <p className="border-t border-border pt-3 font-mono text-xs leading-relaxed text-muted">
          you&rsquo;re on pro — full verify-explain, replay + re-sign, long
          retention, searchable history and shareable events.
        </p>
      ) : (
        <p className="border-t border-border pt-3 font-mono text-xs leading-relaxed text-muted">
          you&rsquo;re on free — a stable ingest url, live capture and basic
          pass/fail verify, with capped history.
        </p>
      )}
    </Panel>
  );
}

// A live readout of what this plan gives vs. uses, so the billing page itself
// is a felt wall: a free user sees "endpoints 1 / 2" and "retention 7 days"
// next to what Pro would make them. Endpoint count is the one value not already
// in /me, so it is fetched here (best-effort; the row degrades to just the cap).
function UsagePanel({ me, isPro }: { me: Me; isPro: boolean }) {
  const [count, setCount] = React.useState<number | null>(null);
  // Defensive fallback (plan.go defaults) so an older /me without `limits`
  // degrades gracefully instead of crashing the billing page.
  const L = me.limits ?? {
    max_endpoints: 2,
    max_retention_days: 7,
    pro_max_endpoints: 25,
    pro_retention_days: 90,
  };

  React.useEffect(() => {
    let live = true;
    endpointsApi
      .list()
      .then((eps) => live && setCount(eps.length))
      .catch(() => {
        /* leave count null — the cap still renders */
      });
    return () => {
      live = false;
    };
  }, []);

  const rows: { label: string; used: string; pro: string | null }[] = [
    {
      label: "endpoints",
      used: `${count ?? "—"} / ${L.max_endpoints}`,
      pro: isPro ? null : `${L.pro_max_endpoints}`,
    },
    {
      label: "retention",
      used: `${L.max_retention_days} days`,
      pro: isPro ? null : `${L.pro_retention_days} days`,
    },
  ];

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <FieldLabel>your usage</FieldLabel>
      <dl className="flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
          >
            <dt className="font-mono text-xs text-muted">{r.label}</dt>
            <dd className="flex items-center gap-2 font-mono text-xs text-text tabular-nums">
              <span>{r.used}</span>
              {r.pro && (
                <span className="text-muted">
                  → <span className="text-text">{r.pro}</span> on pro
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {!isPro && (
        <p className="font-mono text-[11px] leading-relaxed text-muted">
          pro also unlocks the verify &ldquo;why&rdquo; + likely fix, replay &amp;
          re-sign, searchable history, response control and shareable events.
        </p>
      )}
    </Panel>
  );
}

function BillingDisabled({ className }: { className?: string }) {
  return (
    <Panel className={cn("flex flex-col gap-2 p-4", className)}>
      <FieldLabel>upgrade</FieldLabel>
      <p className="font-mono text-xs leading-relaxed text-muted">
        billing isn&rsquo;t enabled on this deploy yet. pro checkout opens once
        dodo payments is wired up — nothing is wrong with your account.
      </p>
    </Panel>
  );
}

function UpgradeCard({ resume = false }: { resume?: boolean }) {
  const [cycle, setCycle] = React.useState<Cycle>("annual");
  const [busy, setBusy] = React.useState(false);
  const [disabled, setDisabled] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const annual = cycle === "annual";

  const upgrade = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { checkout_url } = await billing.checkout({
        plan: "pro",
        interval: cycle,
      });
      // Leaves the SPA for Dodo's hosted page; keep busy=true through the hop.
      window.location.href = checkout_url;
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        setDisabled(true);
      } else {
        setError(errMsg(e));
      }
      setBusy(false);
    }
  };

  if (disabled) return <BillingDisabled />;

  return (
    <Panel className="flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-sans text-lg font-semibold text-text">
            {resume ? "resume pro" : "upgrade to pro"}
          </h2>
          <p className="text-sm text-muted">the full debug + replay loop.</p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-3xl font-medium tabular-nums text-text">
            ${PRO_PRICE[cycle]}
          </span>
          <span className="font-mono text-sm text-muted">/mo</span>
        </div>
      </div>

      {/* monthly / annual toggle — same control as the pricing page */}
      <div
        role="radiogroup"
        aria-label="billing cycle"
        className="inline-flex w-fit items-center gap-1 rounded-md border border-border bg-surface p-1"
      >
        {(["monthly", "annual"] as Cycle[]).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={cycle === c}
            onClick={() => setCycle(c)}
            className={cn(
              "rounded-sm px-3.5 py-1.5 font-sans text-sm transition-colors duration-[80ms] cursor-pointer focus-visible:outline-2",
              cycle === c
                ? "bg-surface-hi text-text"
                : "text-muted hover:text-text",
            )}
          >
            {c}
            {c === "annual" && (
              <span className="ml-1.5 font-mono text-[11px] text-accent">
                −25%
              </span>
            )}
          </button>
        ))}
      </div>

      <Button
        variant="primary"
        size="lg"
        className="w-full sm:w-fit"
        disabled={busy}
        onClick={upgrade}
      >
        {busy ? "starting checkout" : resume ? "resume pro" : "upgrade to pro"}
      </Button>

      {annual && (
        <p className="-mt-2 font-mono text-[11px] text-muted">
          billed yearly · cancel anytime
        </p>
      )}

      {error && <ErrorBanner message={error} onRetry={upgrade} />}

      <ul className="flex flex-col gap-2.5 border-t border-border pt-4">
        {PRO_FEATURES.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: "var(--accent)" }}
              aria-hidden
            />
            <span className="text-sm leading-snug text-text">{f}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// The Dodo customer portal button + its inline states. Reused by the Pro
// "manage subscription" surface and the lapsed-user "billing history" surface
// (P1-19: invoices/receipts stay reachable after a subscription ends).
function PortalButton({
  label = "manage subscription",
  busyLabel = "opening portal",
}: {
  label?: string;
  busyLabel?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<
    | { kind: "none" }
    | { kind: "disabled" }
    | { kind: "nosub" }
    | { kind: "error"; message: string }
  >({ kind: "none" });

  const openPortal = async () => {
    if (busy) return;
    setBusy(true);
    setNote({ kind: "none" });
    try {
      const { portal_url } = await billing.portal();
      window.location.href = portal_url;
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) setNote({ kind: "disabled" });
      else if (e instanceof ApiError && e.status === 409)
        setNote({ kind: "nosub" });
      else setNote({ kind: "error", message: errMsg(e) });
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="w-fit"
        disabled={busy}
        onClick={openPortal}
      >
        {busy ? busyLabel : label}
      </Button>
      {note.kind === "disabled" && (
        <p className="font-mono text-[11px] text-muted">
          billing isn&rsquo;t enabled on this deploy yet.
        </p>
      )}
      {note.kind === "nosub" && (
        <p className="font-mono text-[11px] text-muted">
          no subscription found to manage.
        </p>
      )}
      {note.kind === "error" && (
        <ErrorBanner message={note.message} onRetry={openPortal} />
      )}
    </>
  );
}

// Plain-language "what happens to my data when Pro ends" (P1-18). Retention
// drops to the free window and older history is purged after a grace period.
// Numbers come from me.limits + plan.go constants mirrored in lib/billing.
function DowngradeNote({ me }: { me: Me }) {
  const proDays = me.limits.pro_retention_days || PRO_RETENTION_DAYS;
  return (
    <p className="border-t border-border pt-3 font-mono text-[11px] leading-relaxed text-muted">
      data retention: free keeps {FREE_RETENTION_DAYS} days of event history
      (pro keeps {proDays}). when a pro subscription ends, history beyond the
      free {FREE_RETENTION_DAYS}-day window is kept for a {DOWNGRADE_GRACE_DAYS}
      -day grace period and then purged — replay or export anything you need
      before then.
    </p>
  );
}

function ManageSubscription({
  me,
  subscription,
}: {
  me: Me;
  subscription: Subscription | null;
}) {
  const willCancel = subscription?.cancel_at_period_end ?? false;
  return (
    <Panel className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-sans text-sm font-semibold text-text">
          manage subscription
        </h2>
        <p className="text-xs text-muted">
          update your card, change plan, download invoices or cancel in the dodo
          customer portal.
        </p>
      </div>
      <PortalButton />
      {willCancel && subscription && (
        <p
          className="font-mono text-[11px] leading-relaxed"
          style={{ color: "var(--warn)" }}
        >
          auto-renew is off — your pro access ends on{" "}
          {formatDate(subscription.current_period_end)}. you can re-enable
          auto-renew anytime in the portal.
        </p>
      )}
      <DowngradeNote me={me} />
    </Panel>
  );
}

// A user whose subscription exists but is no longer active (cancelled/expired/
// failed): recognise it, offer a resume path, and keep invoices reachable
// (P1-19/P1-20). Re-subscribing is a fresh Dodo checkout, so the resume CTA
// reuses the UpgradeCard.
function ResumeSection({
  me,
  subscription,
}: {
  me: Me;
  subscription: Subscription;
}) {
  const ended = formatDate(subscription.current_period_end);
  return (
    <div className="flex flex-col gap-6">
      <Panel className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-sans text-sm font-semibold text-text">
            your pro ended
          </h2>
          <p className="text-xs leading-relaxed text-muted">
            {ended !== "—"
              ? `your pro access ended on ${ended}. you're back on free — resume anytime to restore verify-explain, replay + re-sign and long retention.`
              : "your pro access has ended. you're back on free — resume anytime to restore verify-explain, replay + re-sign and long retention."}
          </p>
        </div>
        <PortalButton label="billing history & invoices" busyLabel="opening portal" />
        <DowngradeNote me={me} />
      </Panel>
      <UpgradeCard resume />
    </div>
  );
}
