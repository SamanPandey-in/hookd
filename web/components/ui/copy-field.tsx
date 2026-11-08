"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Copy text to the clipboard with a fallback for insecure contexts where the
 *  async Clipboard API is unavailable or throws (http://, old webviews). Returns
 *  true on success. The execCommand path is deprecated but still the only option
 *  without `navigator.clipboard`, so copy never silently no-ops. */
export async function writeClipboard(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to the execCommand path below */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

type CopyState = "idle" | "copied" | "failed";

function useCopy() {
  const [state, setState] = React.useState<CopyState>("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = React.useCallback(async (value: string) => {
    const ok = await writeClipboard(value);
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), ok ? 1400 : 2600);
  }, []);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { state, copy };
}

/** An icon-only copy button with an accessible label and a copied confirmation.
 *  On a clipboard failure it shows a brief "copy failed" hint rather than
 *  silently doing nothing. */
export function CopyButton({
  value,
  label = "copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const { state, copy } = useCopy();
  const title =
    state === "copied" ? "copied" : state === "failed" ? "copy failed — select and copy manually" : label;
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      aria-label={title}
      title={title}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-surface-hi hover:text-text cursor-pointer transition-colors duration-[80ms]",
        className,
      )}
    >
      {state === "copied" ? (
        <Check className="h-3.5 w-3.5" style={{ color: "var(--pass)" }} />
      ) : (
        <Copy
          className="h-3.5 w-3.5"
          style={state === "failed" ? { color: "var(--fail)" } : undefined}
        />
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? "copied" : state === "failed" ? "copy failed" : ""}
      </span>
    </button>
  );
}

/** A copy-able value: the value in mono (selectable, truncating on phones) plus
 *  a copy button. Long values like ingest URLs stay readable at 390px. */
export function CopyField({
  value,
  display,
  className,
  label = "copy",
}: {
  value: string;
  display?: string;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-sm border border-border bg-surface-hi pl-2.5 pr-1 min-w-0",
        className,
      )}
    >
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-text py-2">
        {display ?? value}
      </code>
      <CopyButton value={value} label={label} />
    </div>
  );
}
