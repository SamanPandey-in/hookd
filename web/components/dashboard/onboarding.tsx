"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Zap, ArrowRight, X, Check } from "lucide-react";
import { endpoints as endpointsApi, ApiError, API_URL } from "@/lib/api";
import type { Endpoint, Provider } from "@/lib/types";
import { PROVIDERS } from "@/lib/types";
import { PROVIDER_META } from "@/lib/providers";
import { cn } from "@/lib/utils";
import { Panel, FieldLabel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { sampleCurl } from "@/components/ui/states";

// First-run onboarding (DESIGN §8). A brand-new account lands on an empty
// dashboard; staring at a "create endpoint" form teaches nothing. This panel
// gives the whole loop in one click — the "guided demo" spins up a signed
// endpoint for the provider the user picks (any of the six supported schemes),
// fires a realistic sample at it, and drops the user into the inspector on a
// live VERIFIED event (the aha). Everything is a real product action, nothing
// is faked — and letting them pick the provider both matches their real stack
// and shows that verify + re-sign covers every scheme, not just Stripe.
//
// It shows ONLY for a fresh account (zero endpoints) that hasn't dismissed it,
// and never nags: "skip walkthrough" and completing the demo both persist a
// dismissal. Persistence is a per-browser convenience (localStorage), so it is
// wrapped in try/catch and the panel renders correctly if storage is blocked.

const DISMISS_KEY = "hookd.onboarded.v1";
// The demo endpoint's own signing secret. The sample is signed with it at send
// time, so the captured event verifies as PASS — the user's first event is a
// clean green check. It is this demo endpoint's secret, nothing sensitive.
const DEMO_SECRET = "whsec_demo_hookd_walkthrough";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* storage blocked (private window, etc.) — the in-memory state still hides it */
  }
}

export function OnboardingPanel({
  endpoints,
  isPro,
  cap,
  onChanged,
}: {
  /** Current endpoints, or null while loading. */
  endpoints: Endpoint[] | null;
  isPro: boolean;
  /** The account's endpoint cap, so the demo never tries to exceed it. */
  cap: number;
  /** Refresh the dashboard list after the demo creates an endpoint. */
  onChanged: () => void;
}) {
  const router = useRouter();
  const [dismissed, setDismissed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // Set when the endpoint was created but the sample never fired — we then
  // avoid routing into the inspector promising a verified event that isn't
  // there (P2 degraded-outcome handling).
  const [degraded, setDegraded] = React.useState<{ id: string } | null>(null);
  // Which provider the demo endpoint is created for. Defaults to Stripe (the
  // most common), but any of the six supported schemes produces a verified
  // sample — signing + verifying use the same demo secret regardless.
  const [provider, setProvider] = React.useState<Provider>("stripe");

  // Read the persisted flag on mount (client-only; avoids an SSR/client flash).
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(readDismissed());
  }, []);

  const skip = () => {
    persistDismissed();
    setDismissed(true);
  };

  const runDemo = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setDegraded(null);
    try {
      // 1. a real endpoint, provider set so the signature scheme is known.
      const ep = await endpointsApi.create({
        name: `demo (${PROVIDER_META[provider].label})`,
        provider,
      });
      // 2. a secret, so the signed sample verifies as PASS. Best-effort: even if
      //    this slips, the endpoint exists and the sample still lands (it just
      //    shows UNVERIFIED instead of PASS — the inspector shows its true
      //    status, so routing in stays honest).
      try {
        await endpointsApi.setSecret(ep.id, DEMO_SECRET);
      } catch {
        /* non-fatal — captured-but-unverified is still a successful first event */
      }
      // 3. fire a realistic sample at it (signed with the secret above → PASS).
      let sampleOk = true;
      try {
        await endpointsApi.sendSample(ep.id);
      } catch {
        sampleOk = false; // nothing will be waiting in the inspector
      }

      if (!sampleOk) {
        // The sample never landed, so dropping the user into the inspector
        // would promise a verified event that isn't there. Keep them here with
        // an honest, actionable note pointing at the new endpoint instead.
        // (Leave the walkthrough undismissed and the list unrefreshed so this
        // notice stays visible.)
        setDegraded({ id: ep.id });
        setBusy(false);
        return;
      }

      // The event is waiting — dismiss, refresh, and route into the inspector.
      persistDismissed();
      setDismissed(true);
      onChanged();
      router.push(`/app/${ep.id}`);
    } catch (e) {
      setErr(
        e instanceof ApiError ? e.message : (e as Error).message || "could not start the demo",
      );
      setBusy(false);
    }
  };

  // Only for a fresh account that hasn't dismissed it. While the list is loading
  // (null) render nothing to avoid a flash; once endpoints exist, step aside.
  if (dismissed || endpoints === null || endpoints.length > 0) return null;

  return (
    <Panel className="relative flex flex-col gap-5 overflow-hidden p-5">
      {/* skip — a quiet corner control, not a competing button */}
      <button
        type="button"
        onClick={skip}
        aria-label="skip walkthrough"
        className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-sm px-1.5 py-1 font-mono text-[11px] text-muted hover:text-text focus-visible:outline-2"
      >
        skip walkthrough
        <X className="h-3 w-3" aria-hidden />
      </button>

      <div className="flex flex-col gap-1.5 pr-28">
        <FieldLabel>get started</FieldLabel>
        <h2 className="font-sans text-lg font-semibold tracking-tight text-text">
          see a webhook captured &amp; verified — in one click
        </h2>
        <p className="max-w-xl text-sm leading-relaxed text-muted">
          hookd will spin up a demo endpoint for the provider you pick, sign a
          realistic event with that provider&rsquo;s exact scheme, and send it
          through — so you land on a live, verified request and see precisely
          what the inspector does before wiring a real webhook.
        </p>
      </div>

      {/* provider picker — shows verify + re-sign covers every scheme (not just
          Stripe) and makes the demo match the user's actual stack. Neutral
          selection; the reserved lime is never borrowed here. */}
      <div className="flex flex-col gap-2">
        <FieldLabel>demo provider</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {PROVIDERS.map((p) => {
            const active = p === provider;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                disabled={busy}
                onClick={() => setProvider(p)}
                className={cn(
                  "rounded-sm border px-2.5 py-1 font-mono text-[11px] transition-colors duration-[80ms] cursor-pointer focus-visible:outline-2 disabled:opacity-50",
                  active
                    ? "border-border bg-surface-hi text-text"
                    : "border-border text-muted hover:text-text",
                )}
              >
                {PROVIDER_META[p].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          disabled={busy || cap < 1}
          onClick={runDemo}
        >
          <Zap className="h-4 w-4" />
          {busy
            ? "setting up your demo…"
            : `run the guided demo — ${PROVIDER_META[provider].label}`}
        </Button>
        <span className="font-mono text-[11px] text-muted">
          creates one endpoint you can rename, reuse, or delete.
        </span>
      </div>

      {err && (
        <p className="font-mono text-xs" style={{ color: "var(--fail)" }}>
          {err}
        </p>
      )}

      {degraded && (
        <div
          className="flex flex-col gap-2 rounded-md border px-4 py-3"
          style={{
            borderColor: "color-mix(in oklab, var(--warn) 40%, var(--border))",
            background: "color-mix(in oklab, var(--warn) 8%, transparent)",
          }}
        >
          <p className="font-mono text-xs leading-relaxed text-text">
            your demo endpoint is ready, but the sample event couldn&rsquo;t be
            sent — so there&rsquo;s nothing waiting yet. open it and send a
            sample from the inspector, or point a webhook at its url.
          </p>
          <Link href={`/app/${degraded.id}`} className="w-fit">
            <Button variant="secondary" size="sm">
              open the endpoint
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}

      {/* or set it up yourself — the same loop, by hand */}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <FieldLabel>or set it up yourself</FieldLabel>
        <ol className="flex flex-col gap-1.5">
          {[
            "create an endpoint below — you get a stable ingest url that never expires.",
            "point your provider's webhook (or a curl) at that url.",
            "watch requests land live and get a pass / fail verdict on every signature.",
          ].map((step, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 font-mono text-xs leading-relaxed text-muted"
            >
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border text-[10px] text-muted tabular-nums">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-1 flex flex-col gap-1.5">
          <span className="font-mono text-[11px] text-muted">
            no provider handy? fire a request with curl (swap in your endpoint&rsquo;s url):
          </span>
          <CopyField
            value={sampleCurl(`${API_URL}/i/<your-endpoint-id>`)}
            label="copy curl"
          />
        </div>
        {!isPro && (
          <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-muted">
            <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
            on free you&rsquo;ll see <span className="text-text">pass / fail</span>;
            pro reveals <span className="text-text">why</span> a signature failed
            and the likely fix.
          </p>
        )}
      </div>

      {/* a faint check motif, echoing the verify hero — accent reserved, so this
          stays a muted border glyph, not a lime flourish. */}
      <Check
        aria-hidden
        className="pointer-events-none absolute -bottom-6 -right-4 h-28 w-28 text-border opacity-40"
        strokeWidth={1.25}
      />
    </Panel>
  );
}
