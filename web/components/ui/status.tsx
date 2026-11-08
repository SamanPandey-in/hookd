import * as React from "react";
import { cn } from "@/lib/utils";
import type { VerifyStatus } from "@/lib/types";

// Status is carried by a glyph + semantic color, NEVER an emoji (DESIGN §8).
// ● ok/pass · ✕ fail · ◦ pending/unknown.
export type StatusKind = "pass" | "fail" | "warn" | "pending";

const GLYPH: Record<StatusKind, string> = {
  pass: "●", // ●
  fail: "✕", // ✕
  warn: "●", // ● (amber)
  pending: "◦", // ◦
};

const COLOR_VAR: Record<StatusKind, string> = {
  pass: "var(--pass)",
  fail: "var(--fail)",
  warn: "var(--warn)",
  pending: "var(--muted)",
};

export function verifyKind(status: VerifyStatus): StatusKind {
  if (status === "pass") return "pass";
  if (status === "fail") return "fail";
  return "pending";
}

/** Map an HTTP status code to a semantic kind (2xx pass, 3xx warn, else fail). */
export function httpKind(code: number): StatusKind {
  if (code >= 200 && code < 300) return "pass";
  if (code >= 300 && code < 400) return "warn";
  if (code >= 400) return "fail";
  return "pending";
}

export function StatusGlyph({
  kind,
  className,
  title,
}: {
  kind: StatusKind;
  className?: string;
  title?: string;
}) {
  return (
    <span
      role="img"
      aria-label={title ?? kind}
      title={title ?? kind}
      className={cn("inline-block font-mono leading-none", className)}
      style={{ color: COLOR_VAR[kind] }}
    >
      {GLYPH[kind]}
    </span>
  );
}

/** The connection states a live feed can be in (mirrors use-event-stream's
 *  StreamStatus). A dead feed must look distinct from a live one — greying the
 *  dot while it still reads "live" hides stream loss (P1-10). */
type LiveStatus = "idle" | "connecting" | "open" | "error";

const LIVE_VIEW: Record<
  LiveStatus,
  { label: string; color: string; pulse: boolean }
> = {
  // accent doubles as the live hue (DESIGN §8 / --accent comment).
  open: { label: "live", color: "var(--accent)", pulse: true },
  connecting: { label: "connecting…", color: "var(--warn)", pulse: true },
  error: { label: "reconnecting…", color: "var(--warn)", pulse: true },
  idle: { label: "offline", color: "var(--muted)", pulse: false },
};

/**
 * The live indicator in the command bar. Two forms:
 *  - `status` (preferred): drives distinct live / connecting… / reconnecting… /
 *    offline states straight off the SSE connection, so a dropped feed is
 *    visible rather than silently idle.
 *  - `on` (legacy boolean): a simple accent-pulse-or-muted dot for the static
 *    marketing / gallery surfaces that don't track a real connection.
 */
export function LiveDot({
  on,
  status,
  className,
  label,
}: {
  on?: boolean;
  status?: LiveStatus;
  className?: string;
  label?: string;
}) {
  const view = status
    ? LIVE_VIEW[status]
    : {
        label: label ?? (on ? "live" : "idle"),
        color: on ? "var(--accent)" : "var(--muted)",
        pulse: !!on,
      };
  const text = status ? (label ?? view.label) : view.label;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={view.label}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          view.pulse && "animate-live",
        )}
        style={{ background: view.color }}
      />
      <span className="font-mono text-xs text-muted">{text}</span>
    </span>
  );
}

// Delivery-state badges: 3px radius, mono, tinted-on-tint (DESIGN §6).
const BADGE_TINT: Record<StatusKind, string> = {
  pass: "var(--pass)",
  fail: "var(--fail)",
  warn: "var(--warn)",
  pending: "var(--muted)",
};

export function StatusBadge({
  kind,
  children,
  className,
}: {
  kind: StatusKind;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "status-tint inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none",
        className,
      )}
      style={{ ["--tint" as string]: BADGE_TINT[kind] }}
    >
      {children}
    </span>
  );
}

/** A mono HTTP status code, tinted by class (2xx/3xx/4xx-5xx). */
export function StatusCode({
  code,
  className,
}: {
  code: number;
  className?: string;
}) {
  return (
    <span
      className={cn("font-mono text-sm tabular-nums", className)}
      style={{ color: COLOR_VAR[httpKind(code)] }}
    >
      {code}
    </span>
  );
}
