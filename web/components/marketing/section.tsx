import * as React from "react";
import { cn } from "@/lib/utils";

// Shared marketing layout rhythm. One max-width + one side gutter everywhere so
// the page reads as a single system and never scrolls sideways at 390px.
export function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("mx-auto w-full max-w-6xl px-4", className)}>
      {children}
    </section>
  );
}

/** A section's title + optional one-line lead. Sentence case, no eyebrow label
 *  (DESIGN §8 bans the tracked-out all-caps eyebrow). An optional mono `index` +
 *  `kicker` anchors the section to the product's real flow (capture → verify →
 *  replay → retain) — numbering is honest here because it IS a sequence. */
export function SectionHeading({
  title,
  lead,
  index,
  kicker,
  className,
}: {
  title: string;
  lead?: string;
  index?: string;
  kicker?: string;
  className?: string;
}) {
  const centered = className?.includes("items-center");
  return (
    <div className={cn("flex max-w-2xl flex-col gap-3", className)}>
      {kicker && (
        <div
          className={cn(
            "flex items-center gap-2 font-mono text-xs",
            centered && "justify-center"
          )}
        >
          <span className="inline-block h-2 w-2 rounded-[1px] bg-accent" aria-hidden />
          {index && <span className="text-accent tabular-nums">{index}</span>}
          <span className="text-border">/</span>
          <span className="text-muted">{kicker}</span>
        </div>
      )}
      <h2 className="font-sans text-2xl font-semibold leading-tight tracking-tight text-text sm:text-3xl">
        {title}
      </h2>
      {lead && (
        <p className="text-sm leading-relaxed text-muted sm:text-base">{lead}</p>
      )}
    </div>
  );
}
