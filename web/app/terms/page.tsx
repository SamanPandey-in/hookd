import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalPage,
  LegalSection,
  LegalList,
} from "@/components/marketing/legal-page";

const SUPPORT_EMAIL = "support@hookd.dev";
const UPDATED = "November 7, 2026";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of hookd, including subscriptions, billing via Dodo Payments, acceptable use and disclaimers. Draft — pending legal review.",
};

// First-party terms of service for hookd. Sentence case for readability/trust.
// DRAFT — generated from a standard SaaS template, pending legal review.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={UPDATED}>
      <LegalSection heading="Agreement">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and
          use of hookd (&ldquo;hookd&rdquo;, &ldquo;we&rdquo;,
          &ldquo;us&rdquo;), a webhook capture, inspection, verification and
          replay tool. By creating an account or using the service, you agree to
          these Terms. If you do not agree, do not use hookd.
        </p>
      </LegalSection>

      <LegalSection heading="The service">
        <p>
          hookd gives you ingest URLs that capture incoming webhook requests, an
          inspector to read them, signature verification with explanations, and
          replay (optionally re-signed) to a target of your choice. Free and Pro
          plans differ in retention, limits and features as described on our{" "}
          <Link href="/pricing">pricing page</Link>. We may change, add or remove
          features over time.
        </p>
      </LegalSection>

      <LegalSection heading="Accounts">
        <p>
          You sign in with GitHub. You are responsible for activity under your
          account and for keeping your credentials and API keys secure. Notify
          us promptly of any unauthorized use. You must be able to form a binding
          contract to use hookd.
        </p>
      </LegalSection>

      <LegalSection heading="Subscriptions, billing and merchant of record">
        <LegalList
          items={[
            <>
              <strong>Merchant of record.</strong> Paid subscriptions are sold
              and processed by <strong>Dodo Payments</strong>, our merchant of
              record. Dodo handles payment, card data, invoicing, and the
              collection and remittance of applicable taxes (including VAT/GST).
              Your purchase is also subject to Dodo&rsquo;s terms at checkout.
            </>,
            <>
              <strong>Plans and renewal.</strong> Pro is billed monthly or
              annually and renews automatically at the then-current price until
              cancelled. Prices are shown on the pricing page before you buy.
            </>,
            <>
              <strong>Cancellation.</strong> You can cancel at any time from your
              billing settings; access continues until the end of the paid
              period, after which your account returns to the free plan. Failed
              or lapsed payments may lead to a short grace period before Pro
              access is suspended.
            </>,
            <>
              <strong>Refunds.</strong> Except where required by law, payments are
              non-refundable. If something is wrong, contact us and we will try
              to make it right.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to use hookd to:</p>
        <LegalList
          items={[
            "break the law, infringe others' rights, or capture data you have no right to capture;",
            "replay requests to systems you do not own or are not authorized to send to, or otherwise use replay to attack, flood or defraud any system;",
            "attempt to disrupt, overload, reverse-engineer or gain unauthorized access to the service or other users' data;",
            "resell or expose the service as your own without permission.",
          ]}
        />
        <p>
          You are responsible for the content of the webhooks you capture and for
          having a lawful basis to send that data to hookd. We may suspend
          accounts that abuse the service.
        </p>
      </LegalSection>

      <LegalSection heading="Your data">
        <p>
          You retain ownership of the data you capture. We handle it as described
          in our <Link href="/privacy">Privacy Policy</Link>, including
          encryption at rest and automatic retention limits. You grant us the
          limited rights needed to store and process that data to provide the
          service to you.
        </p>
      </LegalSection>

      <LegalSection heading="Availability">
        <p>
          We work to keep hookd available and reliable, but the service is
          provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo;
          basis. This is an indie product in active development; we do not
          currently offer a formal uptime SLA.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimers and limitation of liability">
        <p>
          To the fullest extent permitted by law, hookd disclaims all implied
          warranties, including merchantability and fitness for a particular
          purpose. hookd is a debugging aid: you are responsible for validating
          webhook handling in your own production systems. To the extent
          permitted by law, our total liability for any claim relating to the
          service is limited to the amount you paid us in the 12 months before
          the claim, and we are not liable for indirect or consequential damages.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          You may stop using hookd and delete your account at any time. We may
          suspend or terminate access if you breach these Terms or to protect the
          service. On termination, your data is handled per the Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          We may update these Terms as the product evolves. Material changes will
          be reflected by the &ldquo;last updated&rdquo; date above, and the
          effective version will be posted here before it takes effect.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these Terms? Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or visit our{" "}
          <Link href="/support">support page</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
