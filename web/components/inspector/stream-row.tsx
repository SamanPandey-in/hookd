"use client";

import * as React from "react";
import { cn, relativeTime, formatBytes } from "@/lib/utils";
import { StatusGlyph, StatusCode, verifyKind } from "@/components/ui/status";
import type { VerifyStatus } from "@/lib/types";

// Stream row (DESIGN §6): status glyph · mono method · mono event-type
// (truncate + tooltip) · optional HTTP code · relative time · size.
// Selected = --surface-hi + a 2px accent left-edge. Hairline between rows, no
// shadow. A freshly-arrived row plays the arrival animation once.
export interface StreamRowProps {
  method: string;
  /** The event-type / path label, e.g. "checkout.session.completed". */
  label: string;
  verifyStatus: VerifyStatus;
  receivedAtMS: number;
  size: number;
  /** The HTTP status we returned to the sender, if shown. */
  code?: number;
  selected?: boolean;
  isNew?: boolean;
  /** Current wall-clock ms for relative time; omit to hide it until known. */
  now?: number | null;
  onSelect?: () => void;
}

export const StreamRow = React.forwardRef<HTMLButtonElement, StreamRowProps>(
  function StreamRow(
    {
      method,
      label,
      verifyStatus,
      receivedAtMS,
      size,
      code,
      selected,
      isNew,
      now,
      onSelect,
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-left cursor-pointer transition-colors duration-[80ms]",
          "border-l-2 border-l-transparent hover:bg-surface-hi",
          selected && "bg-surface-hi border-l-accent",
          isNew && "animate-arrival",
        )}
      >
        <StatusGlyph
          kind={verifyKind(verifyStatus)}
          title={`verify: ${verifyStatus || "unknown"}`}
          className="text-[10px]"
        />
        <span className="w-10 shrink-0 font-mono text-xs font-medium text-muted">
          {method}
        </span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs text-text"
          title={label}
        >
          {label}
        </span>
        {code !== undefined && <StatusCode code={code} className="text-xs" />}
        <span className="shrink-0 font-mono text-[11px] text-muted tabular-nums">
          {now != null ? relativeTime(receivedAtMS, now) : ""}
        </span>
        <span className="hidden shrink-0 font-mono text-[11px] text-muted tabular-nums sm:inline">
          {formatBytes(size)}
        </span>
      </button>
    );
  },
);
