"use client";

import * as React from "react";
import { Plus, Send } from "lucide-react";
import {
  endpoints as endpointsApi,
  ingestURL,
  ApiError,
  isUpgradeRequired,
} from "@/lib/api";
import type { Endpoint, EventSummary, Provider } from "@/lib/types";
import { useClientNow } from "@/lib/use-client-now";
import { useMe } from "../layout";
import { Panel, FieldLabel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { ProviderSelect } from "@/components/ui/provider-select";
import { ProLock, UpgradePrompt, UpgradeLink } from "@/components/ui/upgrade";
import { SkeletonRows, ErrorBanner, EmptyState } from "@/components/ui/states";
import { EndpointCard, type EndpointStats } from "@/components/dashboard/endpoint-card";
import { OnboardingPanel } from "@/components/dashboard/onboarding";

function computeStats(events: EventSummary[]): EndpointStats {
  const count = events.length;
  const lastMS = events.length ? events[0].received_at_ms : null;
  let pass = 0;
  let verified = 0;
  for (const e of events) {
    if (e.verify_status === "pass") {
      pass++;
      verified++;
    } else if (e.verify_status === "fail") {
      verified++;
    }
  }
  return {
    count,
    capped: count >= 100,
    lastMS,
    passRate: verified ? pass / verified : null,
  };
}

export default function DashboardPage() {
  const [list, setList] = React.useState<Endpoint[] | null>(null);
  const [stats, setStats] = React.useState<Record<string, EndpointStats>>({});
  const [error, setError] = React.useState<string | null>(null);
  const now = useClientNow();
  const me = useMe();
  const isPro = me?.plan === "pro";
  // Caps come from the server (plan.go) via /me — never hardcoded here, so the
  // wall the UI draws always matches the limit the API actually enforces.
  const cap = me?.limits?.max_endpoints ?? 2;
  const proCap = me?.limits?.pro_max_endpoints ?? 25;
  const atCap = !isPro && list !== null && list.length >= cap;

  // setState happens only after the first await, so this is safe to call from
  // an effect (no synchronous state write in the effect body).
  const load = React.useCallback(async () => {
    try {
      const eps = await endpointsApi.list();
      // Fetch a recent window per endpoint for the summary stats.
      const entries = await Promise.all(
        eps.map(async (ep) => {
          try {
            const evs = await endpointsApi.listEvents(ep.id, { limit: 100 });
            return [ep.id, computeStats(evs)] as const;
          } catch {
            return [ep.id, computeStats([])] as const;
          }
        }),
      );
      setList(eps);
      setStats(Object.fromEntries(entries));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  React.useEffect(() => {
    // Fetch on mount. load() only writes state after awaiting the API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-sans text-xl font-semibold tracking-tight text-text">
          Endpoints
        </h1>
        <p className="text-sm text-muted">
          each endpoint has a stable ingest url. point a webhook at it and
          requests land in the inspector live.
        </p>
      </div>

      <OnboardingPanel
        endpoints={list}
        isPro={isPro}
        cap={cap}
        onChanged={load}
      />

      <CreateEndpoint onCreated={load} atCap={atCap} cap={cap} proCap={proCap} />

      {error && (
        <ErrorBanner
          message={`could not load endpoints — ${error}`}
          onRetry={load}
        />
      )}

      {!error && list === null && (
        <Panel>
          <SkeletonRows rows={4} />
        </Panel>
      )}

      {!error && list !== null && list.length === 0 && (
        <Panel>
          <EmptyState
            title="no endpoints yet"
            hint="create your first endpoint above to get an ingest url."
          />
        </Panel>
      )}

      {!error && list !== null && list.length > 0 && (
        <EndpointsTable
          endpoints={list}
          stats={stats}
          now={now}
          onChanged={load}
        />
      )}
    </div>
  );
}

function CreateEndpoint({
  onCreated,
  atCap,
  cap,
  proCap,
}: {
  onCreated: () => void;
  /** Free plan at its endpoint limit — annotate + disable rather than letting
   *  the create silently fail. */
  atCap: boolean;
  /** The caller's own endpoint cap (free: 2) from /me. */
  cap: number;
  /** The Pro-tier cap (25) from /me — used only in upgrade copy. */
  proCap: number;
}) {
  const [name, setName] = React.useState("");
  const [provider, setProvider] = React.useState<Provider | "">("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [upgrade, setUpgrade] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || atCap) return;
    setBusy(true);
    setErr(null);
    setUpgrade(false);
    try {
      await endpointsApi.create({ name: name.trim() || "untitled", provider });
      setName("");
      setProvider("");
      onCreated();
    } catch (e2) {
      // A 402 means the free endpoint cap was hit server-side.
      if (isUpgradeRequired(e2)) {
        setUpgrade(true);
      } else {
        setErr(
          e2 instanceof ApiError ? e2.message : (e2 as Error).message ?? "failed",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-4">
      <form
        onSubmit={submit}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="ep-name" className="block">
            <FieldLabel>Name</FieldLabel>
          </label>
          <input
            id="ep-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="stripe billing (prod)"
            disabled={atCap}
            className="h-9 w-full rounded-sm border border-border bg-surface-hi px-3 font-mono text-sm text-text placeholder:text-muted focus-visible:outline-2 disabled:opacity-50"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ep-provider" className="block">
            <FieldLabel>Provider</FieldLabel>
          </label>
          <ProviderSelect id="ep-provider" value={provider} onChange={setProvider} />
        </div>
        <Button type="submit" variant="primary" disabled={busy || atCap}>
          <Plus className="h-4 w-4" />
          {busy ? "creating" : "create endpoint"}
        </Button>
      </form>
      {atCap && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ProLock />
          <p className="font-mono text-xs text-muted">
            free includes {cap} endpoint{cap === 1 ? "" : "s"} — pro lifts the
            cap to {proCap}.
          </p>
          <UpgradeLink />
        </div>
      )}
      {upgrade && (
        <UpgradePrompt
          className="mt-3"
          message={`you've reached the free limit of ${cap} endpoint${cap === 1 ? "" : "s"} — pro lifts it to ${proCap}.`}
        />
      )}
      {err && (
        <p className="mt-3 font-mono text-xs" style={{ color: "var(--fail)" }}>
          {err}
        </p>
      )}
    </Panel>
  );
}

function EndpointsTable({
  endpoints,
  stats,
  now,
  onChanged,
}: {
  endpoints: Endpoint[];
  stats: Record<string, EndpointStats>;
  now: number | null;
  onChanged: () => void;
}) {
  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-border">
        {endpoints.map((ep) => (
          <EndpointCard
            key={ep.id}
            endpoint={ep}
            stats={stats[ep.id]}
            now={now}
            ingestUrl={ingestURL(ep.id)}
            action={<SampleButton endpoint={ep} onSent={onChanged} />}
          />
        ))}
      </ul>
    </Panel>
  );
}

function SampleButton({
  endpoint,
  onSent,
}: {
  endpoint: Endpoint;
  onSent: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const errTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (errTimer.current) clearTimeout(errTimer.current);
    },
    [],
  );

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      // No provider → the backend sends a generic sample, so an auto-detect
      // endpoint can be sampled too (P1-13), not just one with a provider set.
      await endpointsApi.sendSample(endpoint.id);
      onSent();
    } catch (e) {
      // Surface the failure instead of swallowing it (P1-14). It is transient
      // (a brief inline note), auto-dismissed so it doesn't linger as stale.
      setErr(e instanceof ApiError ? e.message : (e as Error).message || "failed");
      if (errTimer.current) clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setErr(null), 6000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        disabled={busy}
        title="send a sample event"
        aria-label="send a sample event"
        onClick={send}
      >
        <Send className="h-4 w-4" />
      </Button>
      {err && (
        <span
          role="status"
          className="max-w-[12rem] text-right font-mono text-[10px] leading-tight"
          style={{ color: "var(--fail)" }}
        >
          sample failed — {err}
        </span>
      )}
    </div>
  );
}
