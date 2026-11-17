import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { Section, SectionHeading } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "changelog",
  description:
    "What shipped in hookd, dated. Signature verify on 10 providers, the public debugger, edit + replay re-signed, and npx hookd listen.",
};

// Changelog (DESIGN §5.2 nav, STANDOUT §3.9). A dated, lowercase, one-line-per-
// ship list — factual, no indie-challenge framing. Newest first. Mono dates,
// hairline between rows, no shadow — reads like the rest of the instrument.
// Dates are the real commit dates from the repo history.
const ENTRIES: { date: string; shipped: string }[] = [
  {
    date: "2026-11-16",
    shipped:
      "shared sample sender, and the detected provider now shows on every verdict",
  },
  {
    date: "2026-11-15",
    shipped:
      "captured events remember the resolved provider; the cli points at the production api",
  },
  {
    date: "2026-11-08",
    shipped:
      "signature verify across all 10 providers (added lemon squeezy + twitch); account settings, api-key security and response control",
  },
  {
    date: "2026-11-07",
    shipped:
      "public signature debugger, edit + replay re-signed to any url, and npx hookd listen to localhost",
  },
  {
    date: "2026-11-06",
    shipped:
      "retention — expired events are pruned automatically (7-day free, 90-day pro)",
  },
  {
    date: "2026-11-04",
    shipped:
      "v1 — live capture on stable ingest urls that never expire, the exact raw request with headers in order",
  },
];

export default function ChangelogPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingNav />

      <main id="main" className="flex-1">
        <Section className="pt-14 pb-16 lg:pt-20">
          <SectionHeading
            title="changelog"
            lead="what shipped, dated. newest first."
          />

          <ol className="mt-10 flex max-w-2xl flex-col border-t border-border">
            {ENTRIES.map((e) => (
              <li
                key={e.date}
                className="flex flex-col gap-1.5 border-b border-border py-4 sm:flex-row sm:gap-5"
              >
                <time
                  dateTime={e.date}
                  className="shrink-0 font-mono text-xs tabular-nums text-muted sm:pt-0.5"
                >
                  {e.date}
                </time>
                <span className="text-sm leading-relaxed text-text">
                  {e.shipped}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      </main>

      <MarketingFooter />
    </div>
  );
}
