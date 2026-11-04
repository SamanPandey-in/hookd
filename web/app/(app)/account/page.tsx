"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { billing, ApiError } from "@/lib/api";
import type { Subscription } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
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
  // The shell only renders children once /me resolves; guard so a direct hit
  // never throws while context settles.
  if (!me) return null;
  const isPro = me.plan === "pro";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-sans text-xl font-semibold tracking-tight text-text">
          billing
        </h1>
        <p className="text-sm text-muted">
          your plan and subscription. billed via dodo payments — merchant of
          record, handles global tax &amp; vat.
        </p>
      </div>

      <PlanSummary isPro={isPro} subscription={me.subscription} />

      {isPro ? <ManageSubscription /> : <UpgradeCard />}
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

      {isPro && subscription ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-t border-border pt-3">
          <dt className="font-mono text-[11px] text-muted">status</dt>
          <dd className="font-mono text-xs text-text">{subscription.status}</dd>
          <dt className="font-mono text-[11px] text-muted">
            {subscription.cancel_at_period_end ? "ends" : "renews"}
          </dt>
          <dd className="font-mono text-xs text-text tabular-nums">
            {formatDate(subscription.current_period_end)}
          </dd>
          {subscription.cancel_at_period_end && (
            <>
              <dt className="font-mono text-[11px] text-muted">auto-renew</dt>
              <dd className="font-mono text-xs" style={{ color: "var(--warn)" }}>
                off — cancels at period end
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

function UpgradeCard() {
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
            upgrade to pro
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
        {busy ? "starting checkout" : "upgrade to pro"}
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

function ManageSubscription() {
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
      <Button
        variant="secondary"
        size="sm"
        className="w-fit"
        disabled={busy}
        onClick={openPortal}
      >
        {busy ? "opening portal" : "manage subscription"}
      </Button>
      {note.kind === "disabled" && (
        <p className="font-mono text-[11px] text-muted">
          billing isn&rsquo;t enabled on this deploy yet.
        </p>
      )}
      {note.kind === "nosub" && (
        <p className="font-mono text-[11px] text-muted">
          no active subscription found to manage.
        </p>
      )}
      {note.kind === "error" && (
        <ErrorBanner message={note.message} onRetry={openPortal} />
      )}
    </Panel>
  );
}
