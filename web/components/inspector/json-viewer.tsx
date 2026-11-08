"use client";

import * as React from "react";
import { ChevronRight, Check, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { writeClipboard } from "@/components/ui/copy-field";

// Pretty JSON viewer (DESIGN §5.1): mono, line numbers, S/N/B field-type
// markers, collapse carets, copy-path on hover. NO syntax rainbow — keys render
// in --text, strings in --muted, numbers accent-tinted, nothing else carries
// color. Captured bodies are inert data: rendered as escaped text, never HTML.
//
// Perf (P1-22): a large webhook body can flatten to thousands of nodes. We cap
// how many rows/lines mount and reveal the rest in chunks on demand, so a huge
// body never blocks the main thread on first paint. Small bodies are unaffected.

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

interface Row {
  path: string;
  depth: number;
  keyLabel: string | null;
  kind: "object" | "array" | "string" | "number" | "boolean" | "null";
  marker: string | null;
  collapsible: boolean;
  summary: string; // shown when a container is collapsed, e.g. "{ 4 }"
  value: Json;
}

// How many rows/lines mount initially, and how many each "show more" reveals.
const INITIAL_CAP = 400;
const CHUNK = 1000;

function typeOf(v: Json): Row["kind"] {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v as "object" | "string" | "number" | "boolean";
}

const MARKER: Partial<Record<Row["kind"], string>> = {
  string: "S",
  number: "N",
  boolean: "B",
};

function flatten(
  value: Json,
  collapsed: Set<string>,
  keyLabel: string | null,
  path: string,
  depth: number,
  out: Row[],
) {
  const kind = typeOf(value);
  const collapsible = kind === "object" || kind === "array";
  let summary = "";
  if (kind === "object") {
    const n = Object.keys(value as object).length;
    summary = `{ ${n} }`;
  } else if (kind === "array") {
    summary = `[ ${(value as Json[]).length} ]`;
  }

  out.push({
    path,
    depth,
    keyLabel,
    kind,
    marker: MARKER[kind] ?? null,
    collapsible,
    summary,
    value,
  });

  if (!collapsible || collapsed.has(path)) return;

  if (kind === "object") {
    for (const [k, v] of Object.entries(value as { [k: string]: Json })) {
      flatten(v, collapsed, k, path ? `${path}.${k}` : k, depth + 1, out);
    }
  } else if (kind === "array") {
    (value as Json[]).forEach((v, i) => {
      flatten(v, collapsed, `[${i}]`, `${path}[${i}]`, depth + 1, out);
    });
  }
}

function ValueText({ row }: { row: Row }) {
  switch (row.kind) {
    case "string":
      return (
        <span className="text-muted break-all">
          &quot;{String(row.value)}&quot;
        </span>
      );
    case "number":
      return (
        <span style={{ color: "color-mix(in oklab, var(--accent) 70%, var(--text))" }}>
          {String(row.value)}
        </span>
      );
    case "boolean":
      return <span className="text-text">{String(row.value)}</span>;
    case "null":
      return <span className="text-muted">null</span>;
    default:
      return null;
  }
}

/** The "showing N of M — show more" footer for capped bodies. */
function ShowMore({
  shown,
  total,
  onMore,
  onAll,
  unit,
}: {
  shown: number;
  total: number;
  onMore: () => void;
  onAll: () => void;
  unit: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-2">
      <span className="font-mono text-[11px] text-muted tabular-nums">
        showing {shown.toLocaleString()} of {total.toLocaleString()} {unit}
      </span>
      <button
        type="button"
        onClick={onMore}
        className="font-mono text-[11px] text-text underline-offset-2 hover:underline focus-visible:outline-2 cursor-pointer"
      >
        show {Math.min(CHUNK, total - shown).toLocaleString()} more
      </button>
      <button
        type="button"
        onClick={onAll}
        className="font-mono text-[11px] text-muted underline-offset-2 hover:underline hover:text-text focus-visible:outline-2 cursor-pointer"
      >
        show all
      </button>
    </div>
  );
}

function RowCopyPath({ path }: { path: string }) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      aria-label={
        state === "failed" ? `copy path failed ${path}` : `copy path ${path}`
      }
      title={
        state === "failed"
          ? "copy failed — select manually"
          : `copy path: ${path || "root"}`
      }
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await writeClipboard(path);
        setState(ok ? "copied" : "failed");
        setTimeout(() => setState("idle"), ok ? 1200 : 2400);
      }}
      className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted opacity-0 transition-opacity duration-[80ms] hover:bg-surface-hi hover:text-text focus-visible:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100 cursor-pointer"
    >
      {state === "copied" ? (
        <Check className="h-3 w-3" style={{ color: "var(--pass)" }} />
      ) : (
        <Link2
          className="h-3 w-3"
          style={state === "failed" ? { color: "var(--fail)" } : undefined}
        />
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? "copied" : state === "failed" ? "copy failed" : ""}
      </span>
    </button>
  );
}

export function JSONViewer({
  data,
  className,
}: {
  /** The raw body string. If it is not valid JSON, it renders as inert text. */
  data: string;
  className?: string;
}) {
  const parsed = React.useMemo<{ ok: boolean; value: Json }>(() => {
    try {
      return { ok: true, value: JSON.parse(data) as Json };
    } catch {
      return { ok: false, value: null };
    }
  }, [data]);

  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [cap, setCap] = React.useState(INITIAL_CAP);

  // A new body resets the reveal cap so a previously-expanded huge body doesn't
  // mount thousands of nodes for the next event.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCap(INITIAL_CAP);
  }, [data]);

  const rows = React.useMemo(() => {
    if (!parsed.ok) return [];
    const out: Row[] = [];
    flatten(parsed.value, collapsed, null, "", 0, out);
    return out;
  }, [parsed, collapsed]);

  if (!parsed.ok) {
    // Non-JSON body: show the exact bytes as escaped text with line numbers,
    // capped the same way so a multi-MB payload can't mount all at once.
    const lines = data.split("\n");
    const shown = lines.slice(0, cap);
    return (
      <div className={cn("overflow-auto font-mono text-xs", className)}>
        {shown.map((ln, i) => (
          <div key={i} className="flex">
            <span className="w-10 shrink-0 select-none pr-3 text-right text-muted tabular-nums">
              {i + 1}
            </span>
            <span className="whitespace-pre-wrap break-all text-text">{ln}</span>
          </div>
        ))}
        {lines.length > cap && (
          <ShowMore
            shown={shown.length}
            total={lines.length}
            unit="lines"
            onMore={() => setCap((c) => c + CHUNK)}
            onAll={() => setCap(lines.length)}
          />
        )}
      </div>
    );
  }

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const visibleRows = rows.slice(0, cap);

  return (
    <div className={cn("overflow-auto font-mono text-xs leading-6", className)}>
      {visibleRows.map((row, i) => (
        <div
          key={row.path || "$root"}
          className="group/row flex items-start hover:bg-surface-hi"
        >
          {/* line number */}
          <span className="w-10 shrink-0 select-none pr-3 pt-px text-right text-muted tabular-nums">
            {i + 1}
          </span>

          {/* type marker */}
          <span className="w-4 shrink-0 select-none pt-px text-center text-[10px] text-muted">
            {row.marker ?? ""}
          </span>

          {/* indent + content */}
          <span
            className="flex min-w-0 flex-1 items-start"
            style={{ paddingLeft: row.depth * 14 }}
          >
            {row.collapsible ? (
              <button
                type="button"
                onClick={() => toggle(row.path)}
                aria-expanded={!collapsed.has(row.path)}
                aria-label={collapsed.has(row.path) ? "expand" : "collapse"}
                className="mr-0.5 inline-flex h-5 w-4 shrink-0 items-center justify-center text-muted hover:text-text cursor-pointer"
              >
                <ChevronRight
                  className={cn(
                    "h-3 w-3 transition-transform duration-[80ms]",
                    !collapsed.has(row.path) && "rotate-90",
                  )}
                />
              </button>
            ) : (
              <span className="mr-0.5 inline-block h-5 w-4 shrink-0" />
            )}

            <span className="min-w-0 flex-1">
              {row.keyLabel !== null && (
                <span className="text-text">{row.keyLabel}</span>
              )}
              {row.keyLabel !== null && !row.collapsible && (
                <span className="text-muted">: </span>
              )}
              {row.collapsible ? (
                collapsed.has(row.path) ? (
                  <span className="text-muted">
                    {row.keyLabel !== null ? ": " : ""}
                    {row.summary}
                  </span>
                ) : (
                  <span className="text-muted">
                    {row.keyLabel !== null ? ": " : ""}
                    {row.kind === "array" ? "[" : "{"}
                  </span>
                )
              ) : (
                <ValueText row={row} />
              )}
            </span>

            <RowCopyPath path={row.path} />
          </span>
        </div>
      ))}
      {rows.length > cap && (
        <ShowMore
          shown={visibleRows.length}
          total={rows.length}
          unit="rows"
          onMore={() => setCap((c) => c + CHUNK)}
          onAll={() => setCap(rows.length)}
        />
      )}
    </div>
  );
}
