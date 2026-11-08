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
  title: "Privacy Policy",
  description:
    "How hookd collects, stores, encrypts and retains webhook data, and the rights you have over it. Draft — pending legal review.",
};

// First-party privacy policy for hookd. Sentence case for readability/trust.
// DRAFT — generated from a standard SaaS template, pending legal review.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED}>
      <LegalSection heading="Overview">
        <p>
          hookd (&ldquo;hookd&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a
          webhook debugging tool. You point your webhook providers at a hookd
          ingest URL, and we capture, store, inspect, verify and replay those
          requests for you. This policy explains what data we hold, how we
          protect it, how long we keep it, and the choices you have. We have
          written it to be read, not skimmed.
        </p>
      </LegalSection>

      <LegalSection heading="Data we collect">
        <LegalList
          items={[
            <>
              <strong>Captured webhook data.</strong> The core of the service:
              the full request bodies, HTTP headers (including signature
              headers), method, and metadata of every webhook sent to your
              ingest URLs. These payloads can contain whatever your provider
              includes — potentially personal data or financial event data about{" "}
              <em>your</em> end users. You control what you send to hookd.
            </>,
            <>
              <strong>Account data.</strong> We authenticate with GitHub OAuth,
              so we receive your GitHub user ID, login, and email address. We
              store your plan and endpoint configuration.
            </>,
            <>
              <strong>Signing secrets.</strong> If you add a provider signing
              secret to an endpoint (to verify or re-sign), we store it encrypted
              and use it only to compute signatures.
            </>,
            <>
              <strong>Billing data.</strong> Payments are handled by our
              merchant of record (see below). We store a customer/subscription
              identifier and plan status — never your full card details.
            </>,
            <>
              <strong>Operational data.</strong> Basic logs and an in-app
              activity log for security and debugging. We do not log webhook
              request bodies or signing secrets.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="How we use your data">
        <p>
          We use captured data solely to provide the service to you: to display
          it in the inspector, verify signatures, replay events, and power
          search and sharing where you enable them. We use account and billing
          data to run your subscription and keep your account secure. We do not
          sell your data, and we do not use your captured webhook payloads to
          train models or for advertising.
        </p>
      </LegalSection>

      <LegalSection heading="Encryption at rest">
        <p>
          Captured request bodies and stored signing secrets are encrypted at
          rest. Data in transit is protected with TLS. Signing secrets are never
          displayed back to you in full after they are saved, and are never
          written to application logs.
        </p>
      </LegalSection>

      <LegalSection heading="Retention and automatic purge">
        <p>
          Captured events are retained for a limited window and then purged
          automatically — we do not keep your webhook payloads indefinitely.
        </p>
        <LegalList
          items={[
            <>
              <strong>Free plan:</strong> short retention (currently 7 days),
              with a cap on stored events.
            </>,
            <>
              <strong>Pro plan:</strong> long / extended retention per your plan.
            </>,
            <>
              <strong>On downgrade or cancellation:</strong> retention drops back
              to the free window, and events older than that window are purged.
              There is a short grace period before Pro access ends.
            </>,
            <>
              <strong>On account deletion:</strong> your endpoints, captured
              events and signing secrets are deleted.
            </>,
          ]}
        />
        <p>
          The public signature debugger (available without an account) stores
          nothing: secrets and request bodies pasted there are used in-memory to
          compute a verdict and are not persisted or logged.
        </p>
      </LegalSection>

      <LegalSection heading="Payments and merchant of record">
        <p>
          Payments are processed by <strong>Dodo Payments</strong>, which acts
          as the <strong>merchant of record</strong> for hookd subscriptions.
          Dodo handles checkout, card data, global tax and VAT, and invoicing.
          Your payment card details are entered on Dodo&rsquo;s hosted pages and
          are handled by Dodo under its own privacy policy and PCI compliance —
          hookd never receives or stores your full card number.
        </p>
      </LegalSection>

      <LegalSection heading="Sub-processors">
        <p>
          We rely on a small number of third-party providers to run the service,
          including GitHub (authentication), Dodo Payments (billing), and our
          cloud hosting and database providers. Each processes data only to
          provide their part of the service.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights (GDPR and similar)">
        <p>
          Depending on where you live, you may have the right to access, correct,
          export, or delete your personal data, to object to or restrict certain
          processing, and to withdraw consent. Specifically:
        </p>
        <LegalList
          items={[
            <>
              <strong>Access and portability:</strong> request a copy of your
              account data and captured events.
            </>,
            <>
              <strong>Deletion:</strong> delete your account from settings, or
              ask us to do it, and we will remove your data.
            </>,
            <>
              <strong>Correction and objection:</strong> contact us to correct
              data or object to processing.
            </>,
          ]}
        />
        <p>
          To exercise any of these rights, email us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. If you are in
          the EEA/UK, you also have the right to lodge a complaint with your
          local data protection authority.
        </p>
      </LegalSection>

      <LegalSection heading="Data processor note">
        <p>
          For the webhook payloads you capture, you are typically the data
          controller and hookd acts as a data processor on your behalf. You are
          responsible for having a lawful basis to send that data to hookd and
          for informing your own end users as required.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          hookd is a developer tool and is not directed to children. We do not
          knowingly collect personal data from anyone under 16.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We may update this policy as the product evolves. Material changes will
          be reflected by the &ldquo;last updated&rdquo; date above, and we will
          post the effective version here before it takes effect.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about privacy or your data? Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or see our{" "}
          <Link href="/support">support page</Link>. See also our{" "}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
