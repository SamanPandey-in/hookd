"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import { endpoints as endpointsApi } from "@/lib/api";
import type { Endpoint } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusGlyph } from "@/components/ui/status";

// ⌘K command palette (DESIGN §5.1): jump endpoints, filter the stream, replay.
// It is the one surface allowed a shadow (DESIGN §4). Keyboard-first: ↑/↓ move,
// enter runs, esc closes. Opening/closing is owned by the inspector.
//
// A11y (P1-16): the palette is a real modal. It portals to <body>, marks every
// other body child `inert` + `aria-hidden` while open (so Tab can't escape
// behind it and SRs don't read the shell), traps Tab within the dialog as a
// belt-and-suspenders, and restores focus to whatever opened it on close.
// The input is a combobox driving the listbox via aria-activedescendant.

export type VerifyFilter = "" | "pass" | "fail";

const LISTBOX_ID = "command-palette-listbox";
const optionId = (i: number) => `command-palette-option-${i}`;

interface Item {
  id: string;
  label: string;
  hint?: string;
  glyph?: React.ReactNode;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  currentEndpointId,
  onSetVerify,
  onSetMethod,
  onReplay,
  hasSelection,
}: {
  open: boolean;
  onClose: () => void;
  currentEndpointId: string;
  onSetVerify: (v: VerifyFilter) => void;
  onSetMethod: (m: string) => void;
  onReplay: () => void;
  hasSelection: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [eps, setEps] = React.useState<Endpoint[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Load endpoints lazily the first time the palette opens.
  const load = React.useCallback(async () => {
    try {
      const list = await endpointsApi.list();
      setEps(list);
    } catch {
      /* jump stays unavailable; filters/replay still work */
    }
  }, []);

  // The modal lifecycle, in ONE effect so cleanup order is guaranteed: restore
  // the shell (remove inert) BEFORE returning focus to the opener — otherwise
  // the opener would still be inert and .focus() would no-op.
  React.useEffect(() => {
    if (!open) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const root = rootRef.current;
    const managed: Element[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child === root) continue;
      // Don't clobber anything already hidden for its own reasons.
      if (child.getAttribute("aria-hidden") === "true") continue;
      child.setAttribute("inert", "");
      child.setAttribute("aria-hidden", "true");
      managed.push(child);
    }
    // Reset per-open; setState-after-mount here seeds a known initial state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery("");
    setActive(0);
    load();
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      for (const child of managed) {
        child.removeAttribute("inert");
        child.removeAttribute("aria-hidden");
      }
      opener?.focus?.();
    };
  }, [open, load]);

  const close = React.useCallback(() => {
    onClose();
  }, [onClose]);

  const items = React.useMemo<Item[]>(() => {
    const out: Item[] = [];

    out.push(
      {
        id: "f-all",
        label: "show all events",
        hint: "filter",
        glyph: <StatusGlyph kind="pending" className="text-[10px]" />,
        run: () => onSetVerify(""),
      },
      {
        id: "f-pass",
        label: "show verified only",
        hint: "filter",
        glyph: <StatusGlyph kind="pass" className="text-[10px]" />,
        run: () => onSetVerify("pass"),
      },
      {
        id: "f-fail",
        label: "show failed only",
        hint: "filter",
        glyph: <StatusGlyph kind="fail" className="text-[10px]" />,
        run: () => onSetVerify("fail"),
      },
      { id: "m-post", label: "filter method: POST", hint: "filter", run: () => onSetMethod("POST") },
      { id: "m-get", label: "filter method: GET", hint: "filter", run: () => onSetMethod("GET") },
      { id: "m-any", label: "clear method filter", hint: "filter", run: () => onSetMethod("") },
    );

    if (hasSelection) {
      out.push({
        id: "replay",
        label: "replay selected event",
        hint: "action",
        run: onReplay,
      });
    }

    for (const ep of eps) {
      if (ep.id === currentEndpointId) continue;
      out.push({
        id: `ep-${ep.id}`,
        label: `go to ${ep.name || "untitled"}`,
        hint: "endpoint",
        run: () => router.push(`/app/${ep.id}`),
      });
    }
    return out;
  }, [eps, currentEndpointId, hasSelection, onSetVerify, onSetMethod, onReplay, router]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.label.toLowerCase().includes(q));
  }, [items, query]);

  // Keep the active index in range as the filter narrows.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Scroll the active option into view as arrows move through the list.
  React.useEffect(() => {
    if (!open) return;
    const el = document.getElementById(optionId(active));
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open, filtered.length]);

  if (!open) return null;

  const run = (it: Item | undefined) => {
    if (!it) return;
    it.run();
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(filtered[active]);
    } else if (e.key === "Tab") {
      // Focus trap: keep Tab inside the dialog even where `inert` isn't honored.
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'input, button, [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === first || !root.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return createPortal(
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[color-mix(in_oklab,var(--bg)_70%,transparent)]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="command palette"
        onKeyDown={onKeyDown}
        className="relative w-full max-w-lg overflow-hidden rounded-md border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="jump to an endpoint, filter, replay…"
            aria-label="command"
            role="combobox"
            aria-expanded
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              filtered.length > 0 ? optionId(active) : undefined
            }
            className="h-11 w-full bg-transparent font-sans text-sm text-text outline-none placeholder:text-muted"
          />
          <kbd className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted">
            esc
          </kbd>
        </div>

        <div
          ref={listRef}
          id={LISTBOX_ID}
          role="listbox"
          aria-label="commands"
          className="max-h-[50vh] overflow-auto py-1"
        >
          {filtered.length === 0 && (
            <p className="px-3 py-4 font-mono text-xs text-muted">no matches</p>
          )}
          {filtered.map((it, i) => (
            <button
              key={it.id}
              id={optionId(i)}
              type="button"
              role="option"
              tabIndex={-1}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(it)}
              aria-selected={i === active}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-left cursor-pointer",
                i === active ? "bg-surface-hi" : "hover:bg-surface-hi",
              )}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {it.glyph}
              </span>
              <span className="min-w-0 flex-1 truncate font-sans text-sm text-text">
                {it.label}
              </span>
              {it.hint && (
                <span className="shrink-0 font-mono text-[10px] text-muted">
                  {it.hint}
                </span>
              )}
              {i === active && (
                <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
