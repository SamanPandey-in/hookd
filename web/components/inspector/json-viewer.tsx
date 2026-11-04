"use client";

import * as React from "react";
import { ChevronRight, Check, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Pretty JSON viewer (DESIGN §5.1): mono, line numbers, S/N/B field-type
// markers, collapse carets, copy-path on hover. NO syntax rainbow — keys render
// in --text, strings in --muted, numbers accent-tinted, nothing else carries
// color. Captured bodies are inert data: rendered as escaped text, never HTML.

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

function RowCopyPath({ path }: { path: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      aria-label={`copy path ${path}`}
      title={`copy path: ${path || "root"}`}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(path);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted opacity-0 transition-opacity duration-[80ms] hover:bg-surface-hi hover:text-text focus-visible:opacity-100 group-hover/row:opacity-100 cursor-pointer"
    >
      {copied ? (
        <Check className="h-3 w-3" style={{ color: "var(--pass)" }} />
      ) : (
        <Link2 className="h-3 w-3" />
      )}
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

  const rows = React.useMemo(() => {
    if (!parsed.ok) return [];
    const out: Row[] = [];
    flatten(parsed.value, collapsed, null, "", 0, out);
    return out;
  }, [parsed, collapsed]);

  if (!parsed.ok) {
    // Non-JSON body: show the exact bytes as escaped text with line numbers.
    const lines = data.split("\n");
    return (
      <div className={cn("overflow-auto font-mono text-xs", className)}>
        {lines.map((ln, i) => (
          <div key={i} className="flex">
            <span className="w-10 shrink-0 select-none pr-3 text-right text-muted tabular-nums">
              {i + 1}
            </span>
            <span className="whitespace-pre-wrap break-all text-text">{ln}</span>
          </div>
        ))}
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

  return (
    <div className={cn("overflow-auto font-mono text-xs leading-6", className)}>
      {rows.map((row, i) => (
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
    </div>
  );
}
