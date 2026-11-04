import { Section, SectionHeading } from "@/components/marketing/section";
import { Check, X } from "lucide-react";
import { FieldLabel } from "@/components/ui/panel";
import { BRAND } from "@/lib/brand";

// Durable history vs the free-tier death clock (PRODUCT F4; competitive data
// from research/competitive-analysis.md — real published limits, not invented).
const FREE_INSPECTORS: { name: string; limit: string }[] = [
  { name: "webhook.site free", limit: "50 requests · url expires in 1 week" },
  { name: "requestbin free", limit: "100 stored, then dropped" },
  { name: "smee.io", limit: "no history at all" },
];

const OURS: string[] = [
  "a stable ingest url that never expires",
  "searchable history — filter by provider, status or verify result",
  "share a captured event with a teammate via a read-only link",
];

export function Retention() {
  return (
    <Section className="pt-8 pb-8">
      <SectionHeading
        index="03"
        kicker="retain"
        title="your events don't vanish in a week"
        lead="the free inspectors you reach for first lose your data on a timer. a webhook you captured last sprint should still be there when the bug comes back."
      />

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {/* the death clock */}
        <div className="rounded-md border border-border bg-surface p-5">
          <FieldLabel>free inspectors expire</FieldLabel>
          <ul className="mt-4 flex flex-col divide-y divide-border">
            {FREE_INSPECTORS.map((t) => (
              <li
                key={t.name}
                className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0"
              >
                <X
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: "var(--fail)" }}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-col">
                  <span className="font-sans text-sm text-text">{t.name}</span>
                  <span className="font-mono text-[11px] text-muted">
                    {t.limit}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* durable */}
        <div
          className="rounded-md border bg-surface p-5"
          style={{ borderColor: "color-mix(in oklab, var(--accent) 24%, var(--border))" }}
        >
          <FieldLabel>{BRAND.name} keeps them</FieldLabel>
          <ul className="mt-4 flex flex-col divide-y divide-border">
            {OURS.map((o) => (
              <li
                key={o}
                className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0"
              >
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: "var(--pass)" }}
                  aria-hidden
                />
                <span className="min-w-0 font-sans text-sm text-text">{o}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
