"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Settings, ChevronLeft, Command, Search } from "lucide-react";
import {
  endpoints as endpointsApi,
  events as eventsApi,
  ingestURL,
} from "@/lib/api";
import { useMe } from "../../layout";
import { ProLock, UpgradeLink } from "@/components/ui/upgrade";
import type {
  Endpoint,
  EventDetail,
  EventSummary,
  ReplayAttempt,
  StreamEvent,
  VerifyStatus,
} from "@/lib/types";
import { useEventStream } from "@/lib/use-event-stream";
import { useClientNow } from "@/lib/use-client-now";
import { cn } from "@/lib/utils";
import { LiveDot } from "@/components/ui/status";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import {
  SkeletonRows,
  ErrorBanner,
  WaitingEmptyState,
  EmptyState,
} from "@/components/ui/states";
import { StreamRow } from "@/components/inspector/stream-row";
import {
  DetailPane,
  type DetailTab,
  DETAIL_TABS,
} from "@/components/inspector/detail-pane";
import type { ReplayPanelHandle } from "@/components/inspector/replay-panel";
import {
  CommandPalette,
  type VerifyFilter,
} from "@/components/inspector/command-palette";
import { deriveEventType } from "@/components/inspector/derive";

// The common shape shared by the live SSE payload and a stored summary, so one
// row renderer covers both the historical backlog and freshly-arrived events.
type Row = Pick<
  EventSummary,
  "id" | "method" | "path" | "size" | "received_at_ms" | "verify_status" | "event_type"
>;

export default function InspectorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const now = useClientNow();
  const me = useMe();
  // Anything other than "pro" is treated as free (safe default if /me lags).
  const isPro = me?.plan === "pro";

  const [endpoint, setEndpoint] = React.useState<Endpoint | null>(null);
  const [endpointErr, setEndpointErr] = React.useState<string | null>(null);
  const [initial, setInitial] = React.useState<EventSummary[] | null>(null);
  const [initialErr, setInitialErr] = React.useState<string | null>(null);

  const [verify, setVerify] = React.useState<VerifyFilter>("");
  const [method, setMethod] = React.useState<string>("");
  const [search, setSearch] = React.useState<string>("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<DetailTab>("headers");
  const [replayOpen, setReplayOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [mobileDetail, setMobileDetail] = React.useState(false);

  const [details, setDetails] = React.useState<Record<string, EventDetail>>({});
  const [attempts, setAttempts] = React.useState<Record<string, ReplayAttempt[]>>({});
  const [detailErr, setDetailErr] = React.useState<string | null>(null);
  const [typeLabels, setTypeLabels] = React.useState<Record<string, string>>({});

  const replayRef = React.useRef<ReplayPanelHandle>(null);
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>());

  // Live stream of newly-captured events (newest first), cookie-authenticated.
  const stream = useEventStream(id);

  // --- initial load ---------------------------------------------------------
  const loadEndpoint = React.useCallback(async () => {
    try {
      const ep = await endpointsApi.get(id);
      setEndpoint(ep);
      setEndpointErr(null);
    } catch (e) {
      setEndpointErr((e as Error).message);
    }
  }, [id]);

  const loadEvents = React.useCallback(async () => {
    try {
      const evs = await endpointsApi.listEvents(id, { limit: 100 });
      setInitial(evs);
      setInitialErr(null);
    } catch (e) {
      setInitialErr((e as Error).message);
    }
  }, [id]);

  React.useEffect(() => {
    // Fetch on mount; both callbacks only write state after awaiting the API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEndpoint();
    loadEvents();
  }, [loadEndpoint, loadEvents]);

  // --- merge live + historical, dedupe, sort newest-first -------------------
  const liveIds = React.useMemo(
    () => new Set(stream.events.map((e: StreamEvent) => e.id)),
    [stream.events],
  );

  const rows = React.useMemo<Row[]>(() => {
    const merged: Row[] = [
      ...stream.events,
      ...(initial ?? []).filter((e) => !liveIds.has(e.id)),
    ];
    merged.sort((a, b) => b.received_at_ms - a.received_at_ms);
    // Text search is a Pro feature; a free session keeps it empty, so it never
    // filters here even if some value slipped through.
    const q = isPro ? search.trim().toLowerCase() : "";
    return merged.filter(
      (r) =>
        (!verify || r.verify_status === verify) &&
        (!method || r.method === method) &&
        (!q ||
          (r.event_type || typeLabels[r.id] || r.path).toLowerCase().includes(q) ||
          r.method.toLowerCase().includes(q)),
    );
  }, [stream.events, initial, liveIds, verify, method, search, isPro, typeLabels]);

  const selectedIndex = rows.findIndex((r) => r.id === selectedId);

  // Auto-select the newest row once the list first has content.
  React.useEffect(() => {
    if (selectedId === null && rows.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(rows[0].id);
    }
  }, [rows, selectedId]);

  // --- detail load on selection (cached) ------------------------------------
  const loadDetail = React.useCallback(async (evId: string) => {
    try {
      const [d, at] = await Promise.all([
        eventsApi.get(evId),
        eventsApi.listReplays(evId),
      ]);
      setDetails((p) => ({ ...p, [evId]: d }));
      setAttempts((p) => ({ ...p, [evId]: at }));
      const t = deriveEventType(d.body, d.headers);
      if (t) setTypeLabels((p) => (p[evId] === t ? p : { ...p, [evId]: t }));
      setDetailErr(null);
    } catch (e) {
      setDetailErr((e as Error).message);
    }
  }, []);

  React.useEffect(() => {
    if (!selectedId) return;
    // Clearing the stale error and kicking off a fetch when the selection
    // changes is this effect syncing to an external system (the API).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetailErr(null);
    if (!details[selectedId]) loadDetail(selectedId);
  }, [selectedId, details, loadDetail]);

  const refreshAttempts = React.useCallback(
    async (evId: string) => {
      try {
        const at = await eventsApi.listReplays(evId);
        setAttempts((p) => ({ ...p, [evId]: at }));
      } catch {
        /* the replay result banner already reported any failure */
      }
    },
    [],
  );

  // Keep the selected row scrolled into view as j/k moves the selection.
  React.useEffect(() => {
    if (selectedId) rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  // --- keyboard (DESIGN §5.1): ⌘K, j/k, r, 1–4 ------------------------------
  const move = React.useCallback(
    (delta: number) => {
      if (rows.length === 0) return;
      const base = selectedIndex < 0 ? 0 : selectedIndex;
      const next = Math.max(0, Math.min(rows.length - 1, base + delta));
      setSelectedId(rows[next].id);
    },
    [rows, selectedIndex],
  );

  const openReplay = React.useCallback(() => {
    setReplayOpen(true);
    // Focus after the panel renders.
    requestAnimationFrame(() => replayRef.current?.focus());
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (paletteOpen) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const k = e.key.toLowerCase();
      if (k === "j") {
        e.preventDefault();
        move(1);
      } else if (k === "k") {
        e.preventDefault();
        move(-1);
      } else if (k === "r") {
        e.preventDefault();
        openReplay();
      } else if (e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        setTab(DETAIL_TABS[Number(e.key) - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, move, openReplay]);

  const select = (rowId: string) => {
    setSelectedId(rowId);
    setMobileDetail(true);
  };

  const selectedDetail = selectedId ? details[selectedId] ?? null : null;
  const selectedAttempts = selectedId ? attempts[selectedId] ?? [] : [];
  const detailLoading = !!selectedId && !selectedDetail && !detailErr;

  // --- render ---------------------------------------------------------------
  if (endpointErr) {
    return (
      <ErrorBanner
        message={`could not load this endpoint — ${endpointErr}`}
        onRetry={loadEndpoint}
      />
    );
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[30rem] flex-col gap-3">
      {/* contextual command bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <nav className="flex items-center gap-1.5 font-mono text-xs text-muted" aria-label="breadcrumb">
          <Link
            href="/app"
            className="rounded-sm hover:text-text focus-visible:outline-2"
          >
            endpoints
          </Link>
          <span className="text-border">/</span>
          <span className="max-w-[16rem] truncate text-text" title={endpoint?.name}>
            {endpoint?.name ?? "…"}
          </span>
        </nav>
        <LiveDot on={stream.status === "open"} />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 text-muted hover:text-text cursor-pointer focus-visible:outline-2"
          aria-label="open command palette"
        >
          <Command className="h-3.5 w-3.5" />
          <kbd className="font-mono text-[10px]">⌘K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-2">
          {endpoint && (
            <CopyField
              value={ingestURL(endpoint.id)}
              display={`/i/${endpoint.id}`}
              label="copy ingest url"
              className="hidden max-w-[20rem] sm:flex"
            />
          )}
          <Link href={`/app/${id}/settings`} aria-label="endpoint settings">
            <Button variant="secondary" size="sm">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">settings</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* two-pane */}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-border">
        {/* left: stream */}
        <section
          className={cn(
            "min-h-0 w-full flex-col border-border md:flex md:w-[360px] md:shrink-0 md:border-r",
            mobileDetail ? "hidden md:flex" : "flex",
          )}
          aria-label="event stream"
        >
          <StreamFilters
            verify={verify}
            method={method}
            search={search}
            onVerify={setVerify}
            onMethod={setMethod}
            onSearch={setSearch}
            count={rows.length}
            isPro={isPro}
          />
          <div className="min-h-0 flex-1 overflow-auto">
            {initialErr && (
              <div className="p-3">
                <ErrorBanner
                  message={`could not load events — ${initialErr}`}
                  onRetry={loadEvents}
                />
              </div>
            )}
            {!initialErr && initial === null && <SkeletonRows rows={8} />}
            {!initialErr &&
              initial !== null &&
              rows.length === 0 &&
              (verify || method || (isPro && search) ? (
                <EmptyState
                  title="no matching events"
                  hint="clear the filter to see every captured request."
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setVerify("");
                        setMethod("");
                        setSearch("");
                      }}
                    >
                      clear filter
                    </Button>
                  }
                />
              ) : endpoint ? (
                <WaitingEmptyState ingestURL={ingestURL(endpoint.id)} />
              ) : null)}
            {rows.map((r) => (
              <StreamRow
                key={r.id}
                ref={(node) => {
                  if (node) rowRefs.current.set(r.id, node);
                  else rowRefs.current.delete(r.id);
                }}
                method={r.method}
                label={r.event_type || typeLabels[r.id] || r.method}
                verifyStatus={r.verify_status as VerifyStatus}
                receivedAtMS={r.received_at_ms}
                size={r.size}
                code={endpoint?.response.status}
                now={now}
                selected={r.id === selectedId}
                isNew={liveIds.has(r.id)}
                onSelect={() => select(r.id)}
              />
            ))}
          </div>
        </section>

        {/* right: detail */}
        <section
          className={cn(
            "min-h-0 w-full flex-col md:flex md:flex-1",
            mobileDetail ? "flex" : "hidden md:flex",
          )}
          aria-label="event detail"
        >
          {/* mobile back affordance */}
          <button
            type="button"
            onClick={() => setMobileDetail(false)}
            className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-left font-mono text-xs text-muted hover:text-text cursor-pointer md:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
            back to stream
          </button>
          <div className="min-h-0 flex-1 overflow-hidden">
            <DetailPane
              detail={selectedDetail}
              attempts={selectedAttempts}
              endpoint={endpoint}
              loading={detailLoading}
              error={detailErr}
              onRetry={() => selectedId && loadDetail(selectedId)}
              tab={tab}
              onTabChange={setTab}
              replayOpen={replayOpen}
              onToggleReplay={() => setReplayOpen((o) => !o)}
              replayRef={replayRef}
              onReplayed={() => {
                if (selectedId) refreshAttempts(selectedId);
                setTab("attempts");
              }}
              isPro={isPro}
            />
          </div>
        </section>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        currentEndpointId={id}
        onSetVerify={setVerify}
        onSetMethod={setMethod}
        onReplay={openReplay}
        hasSelection={!!selectedDetail}
      />
    </div>
  );
}

function StreamFilters({
  verify,
  method,
  search,
  onVerify,
  onMethod,
  onSearch,
  count,
  isPro,
}: {
  verify: VerifyFilter;
  method: string;
  search: string;
  onVerify: (v: VerifyFilter) => void;
  onMethod: (m: string) => void;
  onSearch: (q: string) => void;
  count: number;
  isPro: boolean;
}) {
  const seg: { id: VerifyFilter; label: string }[] = [
    { id: "", label: "all" },
    { id: "pass", label: "verified" },
    { id: "fail", label: "failed" },
  ];
  return (
    <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <div
          role="tablist"
          aria-label="verify filter"
          className="inline-flex overflow-hidden rounded-sm border border-border"
        >
          {seg.map((s) => (
            <button
              key={s.id || "all"}
              role="tab"
              type="button"
              aria-selected={verify === s.id}
              onClick={() => onVerify(s.id)}
              className={cn(
                "cursor-pointer px-2.5 py-1 font-sans text-xs transition-colors duration-[80ms] focus-visible:outline-2",
                verify === s.id
                  ? "bg-surface-hi text-text"
                  : "text-muted hover:text-text",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          aria-label="method filter"
          value={method}
          onChange={(e) => onMethod(e.target.value)}
          className="h-7 appearance-none rounded-sm border border-border bg-surface px-2 font-mono text-xs text-text cursor-pointer focus-visible:outline-2"
        >
          <option value="">method</option>
          <option value="POST">POST</option>
          <option value="GET">GET</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
        </select>
        <span className="ml-auto font-mono text-[11px] text-muted tabular-nums">
          {count}
        </span>
      </div>

      {/* text search — a Pro feature; free sees the control present-but-locked */}
      <div className="flex flex-col gap-1">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted" />
          <input
            aria-label="search events by path or event type"
            value={isPro ? search : ""}
            onChange={(e) => onSearch(e.target.value)}
            disabled={!isPro}
            placeholder="search path & event type"
            className="h-7 w-full rounded-sm border border-border bg-surface pl-7 pr-9 font-mono text-xs text-text placeholder:text-muted focus-visible:outline-2 disabled:opacity-60"
          />
          {!isPro && <ProLock className="absolute right-1.5" />}
        </div>
        {!isPro && (
          <p className="font-mono text-[10px] leading-relaxed text-muted">
            searching your history is a pro feature — <UpgradeLink />
          </p>
        )}
      </div>
    </div>
  );
}
