"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function useCopy() {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = React.useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard blocked (e.g. insecure context) — leave the value selectable.
    }
  }, []);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { copied, copy };
}

/** An icon-only copy button with an accessible label and a copied confirmation. */
export function CopyButton({
  value,
  label = "copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      aria-label={copied ? "copied" : label}
      title={copied ? "copied" : label}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-surface-hi hover:text-text cursor-pointer transition-colors duration-[80ms]",
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" style={{ color: "var(--pass)" }} />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
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
