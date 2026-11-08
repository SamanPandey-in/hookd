"use client";

import * as React from "react";
import { RotateCw, Share2, Download, Check } from "lucide-react";
import { cn, absoluteTime, formatBytes } from "@/lib/utils";
import { events as eventsApi, ingestURL, API_URL, isUpgradeRequired } from "@/lib/api";
import type { Endpoint, EventDetail, ReplayAttempt } from "@/lib/types";
import { FieldLabel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-field";
import { StatusCode } from "@/components/ui/status";
import { ProLock, UpgradePrompt } from "@/components/ui/upgrade";
import { SkeletonRows, ErrorBanner, EmptyState } from "@/components/ui/states";
import { SignatureVerifyPanel } from "@/components/inspector/signature-verify-panel";
import { JSONViewer } from "@/components/inspector/json-viewer";
import { HeadersTable } from "@/components/inspector/headers-table";
import { AttemptsTimeline } from "@/components/inspector/attempts-timeline";
import { ReplayPanel, type ReplayPanelHandle } from "@/components/inspector/replay-panel";
import { deriveEventType, buildCurl } from "@/components/inspector/derive";

export type DetailTab = "headers" | "body" | "attempts" | "curl";
export const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "headers", label: "Headers" },
  { id: "body", label: "Body" },
  { id: "attempts", label: "Attempts" },
  { id: "curl", label: "cURL" },
];

export function DetailPane({
  detail,
  attempts,
  endpoint,
  loading,
  error,
  onRetry,
  tab,
  onTabChange,
  replayOpen,
  onToggleReplay,
  replayRef,
  onReplayed,
  isPro,
}: {
  detail: EventDetail | null;
  attempts: ReplayAttempt[];
  endpoint: Endpoint | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  tab: DetailTab;
  onTabChange: (t: DetailTab) => void;
  replayOpen: boolean;
  onToggleReplay: () => void;
  replayRef: React.Ref<ReplayPanelHandle>;
  onReplayed: () => void;
  /** Pro unlocks verify-explain depth, replay/re-sign and sharing; free sees
   *  the controls present but locked with an upgrade link. */
  isPro: boolean;
}) {
  if (error) {
    return (
      <div className="p-4">
        <ErrorBanner message={error} onRetry={onRetry} />
      </div>
    );
  }
  if (loading && !detail) {
    return <SkeletonRows rows={5} />;
  }
  if (!detail) {
    return (
      <EmptyState
        title="select an event"
        hint="pick a request from the stream to inspect its signature, headers, body and replays."
      />
    );
  }

  const eventType = deriveEventType(detail.body, detail.headers);
  const returned = endpoint?.response.status;

  return (
    <div className="flex h-full flex-col">
      <DetailHeader
        detail={detail}
        eventType={eventType}
        returned={returned}
        replayOpen={replayOpen}
        onToggleReplay={onToggleReplay}
        isPro={isPro}
      />

      <div className="flex-1 overflow-auto">
        {/* The hero sits ABOVE the tabs — the first thing the eye lands on. */}
        <div className="px-4 pt-4">
          <SignatureVerifyPanel
            key={detail.id /* re-draws the check once per selected event */}
            status={detail.verify_status}
            cause={detail.verify_cause}
            summary={detail.verify_summary}
            details={detail.verify_details}
            provider={endpoint?.provider ?? ""}
            lockedWhy={!isPro}
          />
        </div>

        {replayOpen && (
          <div className="px-4 pt-3">
            <div className="overflow-hidden rounded-md border border-border">
              <ReplayPanel
                ref={replayRef}
                eventId={detail.id}
                endpoint={endpoint}
                onReplayed={onReplayed}
                locked={!isPro}
              />
            </div>
          </div>
        )}

        <div className="px-4 pt-4">
          <TabBar tab={tab} onTabChange={onTabChange} attemptCount={attempts.length} />
        </div>

        <div
          role="tabpanel"
          id={`detail-panel-${tab}`}
          aria-labelledby={`detail-tab-${tab}`}
          tabIndex={0}
          className="px-2 pb-6 pt-1 sm:px-4 focus-visible:outline-2"
        >
          {tab === "headers" && (
            <div className="overflow-hidden rounded-md border border-border">
              <HeadersTable headers={detail.headers} />
            </div>
          )}
          {tab === "body" && <BodyTab detail={detail} />}
          {tab === "attempts" && (
            <div className="overflow-hidden rounded-md border border-border">
              <AttemptsTimeline attempts={attempts} />
            </div>
          )}
          {tab === "curl" && <CurlTab detail={detail} endpoint={endpoint} />}
        </div>
      </div>
    </div>
  );
}

function DetailHeader({
  detail,
  eventType,
  returned,
  replayOpen,
  onToggleReplay,
  isPro,
}: {
  detail: EventDetail;
  eventType: string | null;
  returned: number | undefined;
  replayOpen: boolean;
  onToggleReplay: () => void;
  isPro: boolean;
}) {
  const [shared, setShared] = React.useState<string | null>(null);
  const [shareErr, setShareErr] = React.useState(false);
  const [shareUpgrade, setShareUpgrade] = React.useState(false);

  const share = async () => {
    // Sharing is Pro-only: free sees an inline upgrade prompt, not a failed call.
    if (!isPro) {
      setShareUpgrade(true);
      return;
    }
    setShareErr(false);
    setShareUpgrade(false);
    try {
      const res = await eventsApi.share(detail.id);
      const url = `${API_URL}${res.path}`;
      setShared(url);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* clipboard blocked — the link is still shown below */
      }
    } catch (e) {
      // A plan change since load can still 402 — surface the upgrade prompt.
      if (isUpgradeRequired(e)) setShareUpgrade(true);
      else setShareErr(true);
    }
  };

  return (
    <div className="border-b border-border bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-mono text-sm font-medium text-text">
              {detail.method}
            </span>
            <span
              className="truncate font-mono text-sm text-text"
              title={detail.path}
            >
              {detail.path}
              {detail.query ? `?${detail.query}` : ""}
            </span>
            {returned !== undefined && (
              <span className="inline-flex items-center gap-1.5">
                <StatusCode code={returned} className="text-sm" />
                <span className="font-mono text-[11px] text-muted">returned</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted">
            {eventType && <span className="text-text">{eventType}</span>}
            <span className="tabular-nums">{absoluteTime(detail.received_at_ms)}</span>
            <span>{detail.content_type || "no content-type"}</span>
            <span className="tabular-nums">{formatBytes(detail.size)}</span>
            {detail.source_ip && <span>from {detail.source_ip}</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            aria-label={shared ? "share link copied" : "create a read-only share link"}
            title={shared ? "share link copied" : "share (read-only)"}
            onClick={share}
          >
            {shared ? (
              <Check className="h-4 w-4" style={{ color: "var(--pass)" }} />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">share</span>
            {!isPro && <ProLock className="ml-0.5" />}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={replayOpen}
            className={replayOpen ? "bg-surface-hi" : undefined}
            onClick={onToggleReplay}
          >
            <RotateCw className="h-4 w-4" />
            replay
          </Button>
        </div>
      </div>

      {shared && (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 break-all font-mono text-[11px] text-muted"
        >
          read-only link copied: <span className="text-text">{shared}</span>
        </p>
      )}
      {shareUpgrade && (
        <UpgradePrompt
          className="mt-2"
          message="read-only share links are a pro feature."
        />
      )}
      {shareErr && (
        <p
          role="alert"
          className="mt-2 font-mono text-[11px]"
          style={{ color: "var(--fail)" }}
        >
          could not create a share link — try again
        </p>
      )}
    </div>
  );
}

function TabBar({
  tab,
  onTabChange,
  attemptCount,
}: {
  tab: DetailTab;
  onTabChange: (t: DetailTab) => void;
  attemptCount: number;
}) {
  // Roving tabindex: only the active tab is in the tab order; arrows move
  // focus+selection across the strip (WAI-ARIA tabs pattern).
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const onTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % DETAIL_TABS.length;
    else if (e.key === "ArrowLeft")
      next = (idx - 1 + DETAIL_TABS.length) % DETAIL_TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = DETAIL_TABS.length - 1;
    else return;
    e.preventDefault();
    const t = DETAIL_TABS[next];
    onTabChange(t.id);
    tabRefs.current[t.id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="event detail"
      className="flex items-center gap-1 border-b border-border"
    >
      {DETAIL_TABS.map((t, i) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            id={`detail-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`detail-panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onTabKeyDown(e, i)}
            onClick={() => onTabChange(t.id)}
            // Instant swap, no slide (DESIGN §7): plain conditional content.
            className={cn(
              "relative -mb-px cursor-pointer border-b-2 px-3 py-2 font-sans text-sm transition-colors duration-[80ms] focus-visible:outline-2",
              active
                ? "border-b-text text-text"
                : "border-b-transparent text-muted hover:text-text",
            )}
          >
            <span className="mr-1 font-mono text-[10px] text-muted">{i + 1}</span>
            {t.label}
            {t.id === "attempts" && attemptCount > 0 && (
              <span className="ml-1.5 font-mono text-[11px] text-muted tabular-nums">
                {attemptCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function BodyTab({ detail }: { detail: EventDetail }) {
  const empty = !detail.body;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-2 sm:px-0">
        <FieldLabel>Body</FieldLabel>
        <div className="flex items-center gap-1">
          <a
            href={eventsApi.bodyURL(detail.id)}
            className="inline-flex h-7 items-center gap-1.5 rounded-sm px-2 font-mono text-[11px] text-muted hover:bg-surface-hi hover:text-text focus-visible:outline-2"
            title="download the exact raw bytes"
          >
            <Download className="h-3.5 w-3.5" />
            raw
          </a>
          {!empty && <CopyButton value={detail.body} label="copy body" />}
        </div>
      </div>
      {empty ? (
        <p className="px-2 py-6 font-mono text-xs text-muted sm:px-4">
          empty body
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border p-2">
          <JSONViewer data={detail.body} className="max-h-[60vh]" />
        </div>
      )}
    </div>
  );
}

function CurlTab({
  detail,
  endpoint,
}: {
  detail: EventDetail;
  endpoint: Endpoint | null;
}) {
  // Reproduce the capture against this endpoint's own ingest URL by default.
  const target = endpoint ? ingestURL(endpoint.id) : `${API_URL}${detail.path}`;
  const curl = React.useMemo(() => buildCurl(detail, target), [detail, target]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-2 sm:px-0">
        <FieldLabel>Copy as cURL</FieldLabel>
        <CopyButton value={curl} label="copy cURL command" />
      </div>
      <pre className="overflow-auto rounded-md border border-border bg-surface p-3 font-mono text-xs leading-relaxed text-text">
        {curl}
      </pre>
      <p className="px-2 font-mono text-[11px] text-muted sm:px-0">
        reproduces the captured request against this endpoint&rsquo;s ingest url.
      </p>
    </div>
  );
}
