import * as React from "react";
import { cn } from "@/lib/utils";

// Separation by hairline border, never shadow (DESIGN §4). Panels use the 6px
// radius; the surface sits one step above the page base.
export const Panel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function Panel({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-md border border-border bg-surface",
        className,
      )}
      {...props}
    />
  );
});

/** A short all-caps field header (SIGNATURE / HEADERS). All-caps is allowed
 *  ONLY for these short field labels (DESIGN §8) — never as an eyebrow. */
export function FieldLabel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Monospace data text — the dominant texture for values/numbers (DESIGN §3). */
export function MonoText({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("font-mono", className)} {...props}>
      {children}
    </span>
  );
}
