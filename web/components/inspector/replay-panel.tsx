"use client";

import * as React from "react";
import { events as eventsApi, ApiError, isUpgradeRequired } from "@/lib/api";
import type { Endpoint, ReplayResult } from "@/lib/types";
import { FieldLabel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/states";
import { ProLock, UpgradePrompt } from "@/components/ui/upgrade";
import { StatusCode } from "@/components/ui/status";

// Replay UI (DESIGN §5.1): a target-URL input + a re-sign toggle (fresh
// timestamp vs keep the original signature) -> POST /api/events/{id}/replay.
// The delivery result shows inline; a blocked/transport error surfaces in coral
// stating the actual mechanism (the SSRF guard's message). Every attempt is
// recorded, so the parent refreshes the Attempts timeline after each send.

export interface ReplayPanelHandle {
  focus: () => void;
}

export const ReplayPanel = React.forwardRef<
  ReplayPanelHandle,
  {
    eventId: string;
    endpoint: Endpoint | null;
    /** Called after any attempt (delivered, blocked, or failed) is recorded. */
    onReplayed: () => void;
    /** Free accounts: replay + re-sign is Pro-only, so render the control
     *  present-but-locked with an upgrade link rather than a working form. */
    locked?: boolean;
  }
>(function ReplayPanel({ eventId, endpoint, onReplayed, locked = false }, ref) {
  const [targetURL, setTargetURL] = React.useState("");
  const [resign, setResign] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ReplayResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Set when an attempt is refused with HTTP 402 (e.g. the plan changed since
  // load) — surfaced as a persistent inline prompt, never a vanishing toast.
  const [upgrade, setUpgrade] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  // Reset transient output when the selected event changes.
  React.useEffect(() => {
    setResult(null);
    setError(null);
    setUpgrade(false);
  }, [eventId]);

  const canResign = !!endpoint && endpoint.has_secret && !!endpoint.provider;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked || busy || !targetURL.trim()) return;
    setBusy(true);
    setResult(null);
    setError(null);
    setUpgrade(false);
    try {
      const res = await eventsApi.replay(eventId, targetURL.trim(), resign);
      setResult(res);
      if (!res.delivered) {
        setError(
          res.error || res.attempt.error || "delivery failed with no detail",
        );
      }
    } catch (e2) {
      // A 402 means the plan doesn't allow replay; everything else (400 re-sign
      // preconditions, transport, SSRF block) is a normal inline error.
      if (isUpgradeRequired(e2)) {
        setUpgrade(true);
      } else {
        setError(e2 instanceof ApiError ? e2.message : (e2 as Error).message);
      }
    } finally {
      setBusy(false);
      onReplayed();
    }
  };

  const delivered = result?.delivered ? result.attempt : null;

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 border-b border-border bg-surface px-4 py-3"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="replay-url" className="flex items-center gap-2">
          <FieldLabel>Replay to target url</FieldLabel>
          {locked && <ProLock />}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            ref={inputRef}
            id="replay-url"
            type="url"
            inputMode="url"
            value={targetURL}
            onChange={(e) => setTargetURL(e.target.value)}
            placeholder="https://api.myapp.com/webhooks/stripe"
            disabled={locked}
            className="h-9 min-w-0 flex-1 rounded-sm border border-border bg-surface-hi px-3 font-mono text-xs text-text placeholder:text-muted focus-visible:outline-2 disabled:opacity-50"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={locked || busy || !targetURL.trim()}
          >
            {busy ? "replaying" : "replay"}
          </Button>
        </div>
      </div>

      {locked ? (
        <UpgradePrompt message="replay + re-sign to any target url is a pro feature." />
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-text">
            <input
              type="checkbox"
              checked={resign}
              onChange={(e) => setResign(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[var(--accent-fill)]"
            />
            <span className="font-sans">re-sign with a fresh timestamp</span>
          </label>
          <span className="font-mono text-[11px] text-muted">
            {resign
              ? "signs the body with this endpoint's secret at the current time"
              : "forwards the original captured signature headers unchanged"}
          </span>
          {resign && !canResign && (
            <span
              className="font-mono text-[11px]"
              style={{ color: "var(--warn)" }}
            >
              needs a provider + signing secret — set them in settings
            </span>
          )}
        </div>
      )}

      {delivered && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-sm border px-3 py-2"
          style={{
            borderColor: "color-mix(in oklab, var(--pass) 40%, var(--border))",
            background: "color-mix(in oklab, var(--pass) 8%, transparent)",
          }}
        >
          <span className="font-mono text-xs text-text">delivered</span>
          <StatusCode code={delivered.response_status} className="text-xs" />
          <span className="font-mono text-[11px] text-muted tabular-nums">
            {delivered.latency_ms}ms
          </span>
          {delivered.resigned && (
            <span className="font-mono text-[11px]" style={{ color: "var(--warn)" }}>
              re-signed
            </span>
          )}
        </div>
      )}

      {upgrade && (
        <UpgradePrompt message="replay is a pro feature — this event wasn't sent." />
      )}

      {error && <ErrorBanner message={error} />}
    </form>
  );
});
