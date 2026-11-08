import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyField } from "./copy-field";
import { Button } from "./button";

// ---- Loading: skeleton rows, never a spinner (DESIGN §7) -------------------

export function SkeletonRows({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border px-4 py-3"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-surface-hi" />
          <span className="h-3 w-12 rounded-sm bg-surface-hi" />
          <span
            className="h-3 rounded-sm bg-surface-hi"
            style={{ width: `${40 + ((i * 13) % 40)}%` }}
          />
          <span className="ml-auto h-3 w-10 rounded-sm bg-surface-hi" />
        </div>
      ))}
    </div>
  );
}

// ---- Error: inline coral banner stating the mechanism + a retry verb -------
// Never a vanishing toast (DESIGN §7).

export function ErrorBanner({
  message,
  onRetry,
  retryLabel = "retry",
  className,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-md border px-4 py-3",
        className,
      )}
      style={{
        borderColor: "color-mix(in oklab, var(--fail) 40%, var(--border))",
        background: "color-mix(in oklab, var(--fail) 8%, transparent)",
      }}
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0"
        style={{ color: "var(--fail)" }}
      />
      <p className="min-w-0 flex-1 font-mono text-xs leading-relaxed text-text break-words">
        {message}
      </p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

// ---- Empty: a WORKING empty state (DESIGN §7) ------------------------------
// Copy-able ingest URL + "point your webhook here" + a `● waiting` pulse.
// A dev with no provider or curl handy was stranded here (P1-15), so it also
// offers a one-click sample and a ready-to-run curl.

/** A ready-to-run curl that POSTs a JSON sample at the ingest URL. Single line
 *  so it copies and pastes cleanly. */
export function sampleCurl(ingestURL: string): string {
  return `curl -X POST ${ingestURL} -H 'content-type: application/json' -d '{"event":"sample","hello":"world"}'`;
}

export function WaitingEmptyState({
  ingestURL,
  className,
  curl,
  onSendSample,
  sending,
  sampleError,
}: {
  ingestURL: string;
  className?: string;
  /** Override the default curl snippet (defaults to sampleCurl(ingestURL)). */
  curl?: string;
  /** When provided, renders a one-click "send a sample event" button. */
  onSendSample?: () => void;
  /** The sample send is in flight. */
  sending?: boolean;
  /** A failed sample send, surfaced inline (never a toast). */
  sampleError?: string | null;
}) {
  const curlCmd = curl ?? sampleCurl(ingestURL);
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full animate-live" style={{ background: "var(--accent)" }} />
        <span className="font-mono text-sm text-muted">waiting for events</span>
      </div>
      <p className="max-w-sm text-sm leading-relaxed text-muted">
        point your webhook at this url and the request lands here live.
      </p>
      <CopyField
        value={ingestURL}
        className="w-full max-w-md"
        label="copy ingest url"
      />

      {onSendSample && (
        <Button
          variant="secondary"
          size="sm"
          disabled={sending}
          onClick={onSendSample}
        >
          {sending ? "sending…" : "send a sample event"}
        </Button>
      )}
      {sampleError && (
        <p className="font-mono text-xs" style={{ color: "var(--fail)" }}>
          could not send a sample — {sampleError}
        </p>
      )}

      <div className="flex w-full max-w-md flex-col items-stretch gap-1.5">
        <span className="text-left font-mono text-[11px] text-muted">
          or fire one from your terminal:
        </span>
        <CopyField value={curlCmd} label="copy curl" />
      </div>
    </div>
  );
}

/** A generic empty state: a short line + an optional action. */
export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      <p className="text-sm text-text">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action}
    </div>
  );
}
