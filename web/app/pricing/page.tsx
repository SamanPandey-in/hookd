import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { Section, SectionHeading } from "@/components/marketing/section";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { Faq } from "@/components/marketing/faq";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free vs Pro. A free tier that actually works — stable ingest url, live capture, basic verify — and Pro at $12/mo (or $9/mo yearly) for verify-explain, replay, retention and sharing. Billed via Dodo Payments.",
};

// Dedicated pricing page (DESIGN §5.3). Reuses the same PricingPlans + Faq as
// the landing so the numbers and the honest feature split never drift.
export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingNav />

      <main id="main" className="flex-1">
        <Section className="pt-14 pb-8 lg:pt-20">
          <SectionHeading
            title="priced like a tool, not a platform"
            lead="webhook.site caps you at 50 requests and a one-week expiry; hookdeck starts at production scale. we sit in between — the dev-time debug loop at an indie price."
            className="mx-auto items-center text-center"
          />
          <PricingPlans className="mx-auto mt-10 max-w-4xl" />
        </Section>

        <Faq />
      </main>

      <MarketingFooter />
    </div>
  );
}
