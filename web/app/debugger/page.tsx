import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { Section, SectionHeading } from "@/components/marketing/section";
import { DebuggerClient } from "@/app/debugger/debugger-client";

export const metadata: Metadata = {
  title: "Signature debugger",
  description:
    "Free, no-signup webhook signature debugger. Paste a secret + the raw request and find out exactly why the signature won't verify — timestamp skew, wrong secret, hex-vs-base64, or a body a middleware re-serialized. Stripe, GitHub, Shopify, Razorpay, Slack and Standard Webhooks.",
};

// F3 — the public on-ramp (IMPR_PLAN §6.F3). Standalone marketing-style page,
// NOT behind the app shell or auth. Reuses SignatureVerifyPanel at full detail
// so the free tool shows exactly what the paid product does.
export default function DebuggerPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingNav />

      <main id="main" className="flex-1">
        <Section className="pt-14 pb-10 lg:pt-20">
          <SectionHeading
            title="why won't this webhook verify?"
            lead="paste the secret and the raw request — hookd runs the exact signature-verify engine behind the product and tells you precisely why it passes or fails, and how to fix it. free, no signup, nothing stored."
            className="mx-auto items-center text-center"
          />
          <div className="mx-auto mt-10 max-w-5xl">
            <DebuggerClient />
          </div>
        </Section>
      </main>

      <MarketingFooter />
    </div>
  );
}
