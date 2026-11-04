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

/** The live indicator in the command bar: a slowly-pulsing accent dot. */
export function LiveDot({
  on,
  className,
  label = "live",
}: {
  on: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden
        className={cn("inline-block h-2 w-2 rounded-full", on && "animate-live")}
        style={{ background: on ? "var(--accent)" : "var(--muted)" }}
      />
      <span className="font-mono text-xs text-muted">{label}</span>
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
