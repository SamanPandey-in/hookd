import Link from "next/link";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { Hero } from "@/components/marketing/hero";
import { VerifyExplain } from "@/components/marketing/verify-explain";
import { ReplayResign } from "@/components/marketing/replay-resign";
import { Retention } from "@/components/marketing/retention";
import { Faq } from "@/components/marketing/faq";
import { Section, SectionHeading } from "@/components/marketing/section";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { SiteBackdrop } from "@/components/marketing/site-backdrop";
import { ShareOnX } from "@/components/marketing/share-on-x";
import { Button } from "@/components/ui/button";

// Marketing landing (DESIGN §5.2). Server component; the one piece of
// interactivity (the looping inspector hero, the pricing toggle) lives in
// client leaves. Section order follows the spec: hero -> verify-explain ->
// replay/re-sign -> retention -> pricing -> faq. No fade-up choreography.
export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <SiteBackdrop />
      <MarketingNav />

      <main className="relative z-10 flex-1">
        <Hero />
        <VerifyExplain />
        <ReplayResign />
        <Retention />

        <Section id="pricing" className="pt-8 pb-8">
          <SectionHeading
            title="one plan. priced like a tool, not a platform"
            lead="a free tier that actually works, and pro for the full debug-and-replay loop. no per-event metering, no $499 production tier."
            className="mx-auto items-center text-center"
          />
          <PricingPlans className="mx-auto mt-10 max-w-4xl" />
        </Section>

        <Faq />

        {/* final CTA */}
        <Section className="pt-8 pb-4">
          <div className="flex flex-col items-center gap-5 rounded-md border border-border bg-surface px-6 py-12 text-center">
            <h2 className="max-w-xl font-sans text-2xl font-semibold leading-tight tracking-tight text-text sm:text-3xl">
              point a webhook at it and watch.
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-muted">
              a stable url, a live stream, and a verdict on every signature —
              free to start, no card.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/login" className="rounded-sm focus-visible:outline-2">
                <Button variant="primary" size="lg">
                  start free
                </Button>
              </Link>
              <ShareOnX />
            </div>
            <p className="font-mono text-[11px] text-muted">
              or{" "}
              <Link
                href="/debugger"
                className="text-text underline decoration-border underline-offset-2 hover:decoration-text"
              >
                debug a signature right now
              </Link>{" "}
              — no signup, nothing stored
            </p>
            <p className="font-mono text-[11px] text-muted">
              private, unguessable urls · bodies encrypted, never logged
            </p>
          </div>
        </Section>
      </main>

      <div className="relative z-10">
        <MarketingFooter />
      </div>
    </div>
  );
}
