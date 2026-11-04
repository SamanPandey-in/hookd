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

// The free plan caps how many endpoints you can create. This is the UI nudge
// only — the server's 402 is the authoritative gate, so a stale value here can
// never let a free account exceed the real limit (the create call still 402s).
const FREE_ENDPOINT_CAP = 3;

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
  const atCap = !isPro && list !== null && list.length >= FREE_ENDPOINT_CAP;

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

      <CreateEndpoint onCreated={load} atCap={atCap} />

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
}: {
  onCreated: () => void;
  /** Free plan at its endpoint limit — annotate + disable rather than letting
   *  the create silently fail. */
  atCap: boolean;
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
            free includes {FREE_ENDPOINT_CAP} endpoints — pro lifts the cap.
          </p>
          <UpgradeLink />
        </div>
      )}
      {upgrade && (
        <UpgradePrompt
          className="mt-3"
          message={`you've hit the free limit of ${FREE_ENDPOINT_CAP} endpoints.`}
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
  const disabled = !endpoint.provider || busy;
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={disabled}
      title={
        endpoint.provider
          ? "send a sample event"
          : "set a provider to send a sample"
      }
      aria-label="send a sample event"
      onClick={async () => {
        if (disabled) return;
        setBusy(true);
        try {
          await endpointsApi.sendSample(endpoint.id);
          onSent();
        } catch {
          /* surfaced on the inspector; keep the dashboard quiet */
        } finally {
          setBusy(false);
        }
      }}
    >
      <Send className="h-4 w-4" />
    </Button>
  );
}
