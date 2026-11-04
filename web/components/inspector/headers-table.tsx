import * as React from "react";
import { cn } from "@/lib/utils";
import { SIGNATURE_HEADERS } from "@/lib/providers";
import { CopyButton } from "@/components/ui/copy-field";
import type { HeaderPair } from "@/lib/types";

// Headers table (DESIGN §6): signature headers are pinned to the top and
// highlighted — they're why the user is here. Order + duplicates are preserved.
export function HeadersTable({
  headers,
  className,
}: {
  headers: HeaderPair[];
  className?: string;
}) {
  const indexed = headers.map((h, i) => ({ ...h, i }));
  const isSig = (name: string) => SIGNATURE_HEADERS.has(name.toLowerCase());

  // Stable partition: signature headers first (keeping their relative order),
  // then the rest in received order.
  const sig = indexed.filter((h) => isSig(h.name));
  const rest = indexed.filter((h) => !isSig(h.name));
  const ordered = [...sig, ...rest];

  if (headers.length === 0) {
    return (
      <p className={cn("px-4 py-6 font-mono text-xs text-muted", className)}>
        no headers captured
      </p>
    );
  }

  return (
    <div className={cn("divide-y divide-border", className)}>
      {ordered.map((h) => {
        const highlight = isSig(h.name);
        return (
          <div
            key={`${h.name}-${h.i}`}
            className={cn(
              "group/h grid grid-cols-[minmax(9rem,14rem)_1fr_auto] items-start gap-3 px-4 py-2",
              highlight && "rule-pass bg-[color-mix(in_oklab,var(--accent)_6%,transparent)]",
            )}
          >
            <span
              className={cn(
                "break-all font-mono text-xs",
                highlight ? "text-text font-medium" : "text-muted",
              )}
            >
              {h.name}
            </span>
            <span className="break-all font-mono text-xs text-text">
              {h.value}
            </span>
            <CopyButton
              value={h.value}
              label={`copy ${h.name}`}
              className="opacity-0 group-hover/h:opacity-100 focus-visible:opacity-100"
            />
          </div>
        );
      })}
    </div>
  );
}
