"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { auth, billing } from "@/lib/api";
import { Button } from "@/components/ui/button";

// Free vs Pro (PRODUCT §6). Pro ~$12/mo, annual ~$9/mo billed yearly. Honest
// split: free is genuinely useful (stable url + capture + basic verify + capped
// history); paid gates verify-explain depth, replay/re-sign, retention, search,
// response control and sharing. The Pro CTA starts a real Dodo checkout for a
// logged-in free user, or sends a logged-out visitor to login first.

const FREE_FEATURES = [
  "a stable ingest url that never expires",
  "live capture + full raw-request inspect",
  "basic signature verify (pass / fail)",
  "free signature debugger — see why any webhook fails, no signup",
  "7-day history, capped events",
  "sample payloads to build against",
];

/** Exported so the in-app account page shows the same split — no drift. */
export const PRO_FEATURES = [
  "verify-explain: the exact cause + the likely fix, every provider",
  "replay, edit + re-sign to any target url",
  "forward live events to localhost — npx hookd listen",
  "long / unlimited retention",
  "search + filter your whole history",
  "response control: set status, headers, body",
  "share a captured event by link",
  "more endpoints",
];

export type Cycle = "monthly" | "annual";

/** The single source of truth for Pro pricing (PRODUCT §6: ~$12/mo, ~$9 yearly). */
export const PRO_PRICE: Record<Cycle, string> = { monthly: "12", annual: "9" };

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((f) => (
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
  );
}

export function PricingPlans({ className }: { className?: string }) {
  const router = useRouter();
  const [cycle, setCycle] = React.useState<Cycle>("annual");
  const [checkoutBusy, setCheckoutBusy] = React.useState(false);
  const annual = cycle === "annual";
  const proPrice = PRO_PRICE[cycle];

  // The Pro CTA is the money path: a logged-in free user goes straight to Dodo
  // checkout; a logged-out visitor logs in first (returning to /account); a Pro
  // user manages their plan. Any failure (incl. billing not configured) falls
  // back to /account, which explains the state calmly rather than crashing.
  const startPro = async () => {
    if (checkoutBusy) return;
    setCheckoutBusy(true);
    try {
      const me = await auth.me().catch(() => null);
      if (!me) {
        router.push("/login?next=/settings/billing");
        return;
      }
      if (me.plan === "pro") {
        router.push("/settings/billing");
        return;
      }
      const { checkout_url } = await billing.checkout({
        plan: "pro",
        interval: cycle,
      });
      // External, hosted Dodo page — a full-document navigation, not SPA.
      window.location.href = checkout_url;
    } catch {
      router.push("/settings/billing");
    }
  };

  return (
    <div className={cn("flex flex-col gap-8", className)}>
      {/* monthly / annual toggle */}
      <div className="flex justify-center">
        <div
          role="radiogroup"
          aria-label="billing cycle"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface p-1"
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
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Free */}
        <div className="flex flex-col gap-6 rounded-md border border-border bg-surface p-6">
          <div className="flex flex-col gap-1">
            <h3 className="font-sans text-lg font-semibold text-text">free</h3>
            <p className="text-sm text-muted">
              point a webhook and watch. no card.
            </p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-4xl font-medium tabular-nums text-text">
              $0
            </span>
          </div>
          <Link href="/login" className="rounded-sm focus-visible:outline-2">
            <Button variant="secondary" size="lg" className="w-full">
              start free
            </Button>
          </Link>
          <FeatureList items={FREE_FEATURES} />
        </div>

        {/* Pro — distinguished only by its accent-fill CTA (the sanctioned
            "primary action" use of the hue) and a faint accent border. The lime
            PASS rule is reserved for verify, so it is NOT borrowed here. */}
        <div
          className="flex flex-col gap-6 rounded-md border bg-surface p-6"
          style={{
            borderColor: "color-mix(in oklab, var(--accent) 28%, var(--border))",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <h3 className="font-sans text-lg font-semibold text-text">pro</h3>
              <p className="text-sm text-muted">
                the full debug + replay loop.
              </p>
            </div>
            <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted">
              recommended
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-4xl font-medium tabular-nums text-text">
              ${proPrice}
            </span>
            <span className="font-mono text-sm text-muted">/mo</span>
            {annual && (
              <span className="ml-1 font-mono text-[11px] text-muted">
                billed yearly
              </span>
            )}
          </div>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={checkoutBusy}
            onClick={startPro}
          >
            {checkoutBusy ? "starting checkout" : "upgrade to pro"}
          </Button>
          <div className="flex flex-col gap-3">
            <p className="font-mono text-[11px] text-muted">
              everything in free, plus
            </p>
            <FeatureList items={PRO_FEATURES} />
          </div>
        </div>
      </div>

      <p className="text-center font-mono text-[11px] text-muted">
        billed via dodo payments — merchant of record, handles global tax &amp;
        vat. cancel anytime.
      </p>
    </div>
  );
}
