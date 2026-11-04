"use client";

import * as React from "react";
import { Panel, MonoText } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import {
  StatusGlyph,
  StatusBadge,
  StatusCode,
  LiveDot,
} from "@/components/ui/status";
import { CopyField, CopyButton } from "@/components/ui/copy-field";
import { ProviderSelect } from "@/components/ui/provider-select";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LogoMark } from "@/components/ui/logo-mark";
import {
  SkeletonRows,
  ErrorBanner,
  WaitingEmptyState,
  EmptyState,
} from "@/components/ui/states";
import { SignatureVerifyPanel } from "@/components/inspector/signature-verify-panel";
import { JSONViewer } from "@/components/inspector/json-viewer";
import { HeadersTable } from "@/components/inspector/headers-table";
import { AttemptsTimeline } from "@/components/inspector/attempts-timeline";
import { StreamRow } from "@/components/inspector/stream-row";
import { useClientNow } from "@/lib/use-client-now";
import type { HeaderPair, Provider, ReplayAttempt } from "@/lib/types";

const SAMPLE_JSON = JSON.stringify(
  {
    id: "evt_1P9sample",
    object: "event",
    type: "checkout.session.completed",
    created: 1700000000,
    livemode: false,
    data: {
      object: {
        id: "cs_test_sample",
        amount_total: 2000,
        currency: "usd",
        payment_status: "paid",
        status: "complete",
        metadata: { order_id: "ord_42", vip: true, note: null },
      },
    },
  },
  null,
  0,
);

const SAMPLE_HEADERS: HeaderPair[] = [
  { name: "Content-Type", value: "application/json" },
  { name: "User-Agent", value: "Stripe/1.0 (+https://stripe.com/docs/webhooks)" },
  {
    name: "Stripe-Signature",
    value:
      "t=1700000000,v1=5f3a...e7c1a,v0=9b2c...deadbeef",
  },
  { name: "Stripe-Version", value: "2024-06-20" },
  { name: "Authorization", value: "Bearer sk_live_redacted" },
];

const PASS_DETAILS = {
  scheme: "v1",
  algo: "HMAC-SHA256",
  timestamp: "within 300s",
  matched_secret: "whsec_…a1b2",
};
const FAIL_DETAILS = {
  scheme: "v1",
  algo: "HMAC-SHA256",
  skew_seconds: "612",
  tolerance: "300",
};

const ATTEMPTS: ReplayAttempt[] = [
  {
    id: 3,
    event_id: "ev_1",
    target_url: "https://api.myapp.com/webhooks/stripe",
    resigned: true,
    response_status: 200,
    response_headers: { "content-type": "application/json" },
    response_body: "{}",
    latency_ms: 142,
    error: "",
    created_at: new Date(Date.now() - 20_000).toISOString(),
  },
  {
    id: 2,
    event_id: "ev_1",
    target_url: "https://staging.myapp.com/webhooks/stripe",
    resigned: false,
    response_status: 500,
    response_headers: {},
    response_body: "internal error",
    latency_ms: 88,
    error: "",
    created_at: new Date(Date.now() - 120_000).toISOString(),
  },
  {
    id: 1,
    event_id: "ev_1",
    target_url: "http://169.254.169.254/latest/meta-data",
    resigned: false,
    response_status: 0,
    response_headers: null,
    response_body: "",
    latency_ms: 0,
    error: "blocked: target resolves to a link-local/metadata address (169.254.169.254)",
    created_at: new Date(Date.now() - 600_000).toISOString(),
  },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function GalleryClient() {
  const [provider, setProvider] = React.useState<Provider | "">("stripe");
  const [newRow, setNewRow] = React.useState(0); // bump to replay arrival anim
  const now = useClientNow();
  const base = now ?? 1_762_000_000_000; // stable fallback before mount

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-8">
      <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <LogoMark />
          <span className="font-sans text-sm text-muted">component gallery</span>
        </div>
        <ThemeToggle />
      </header>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">replay</Button>
          <Button variant="secondary">copy as cURL</Button>
          <Button variant="ghost">forward</Button>
          <Button variant="danger">purge</Button>
          <Button variant="primary" disabled>
            replay
          </Button>
          <Button variant="secondary" size="sm">
            small
          </Button>
          <Button variant="secondary" size="lg">
            large
          </Button>
        </div>
      </Section>

      <Section title="Status — glyphs, dot, badges, codes">
        <Panel className="flex flex-wrap items-center gap-6 p-4">
          <span className="flex items-center gap-2">
            <StatusGlyph kind="pass" /> <MonoText className="text-xs text-muted">pass</MonoText>
          </span>
          <span className="flex items-center gap-2">
            <StatusGlyph kind="fail" /> <MonoText className="text-xs text-muted">fail</MonoText>
          </span>
          <span className="flex items-center gap-2">
            <StatusGlyph kind="pending" /> <MonoText className="text-xs text-muted">pending</MonoText>
          </span>
          <LiveDot on />
          <LiveDot on={false} label="idle" />
          <StatusBadge kind="pass">delivered</StatusBadge>
          <StatusBadge kind="warn">retrying</StatusBadge>
          <StatusBadge kind="fail">failed</StatusBadge>
          <StatusCode code={200} />
          <StatusCode code={302} />
          <StatusCode code={400} />
          <StatusCode code={500} />
        </Panel>
      </Section>

      <Section title="Typography">
        <Panel className="flex flex-col gap-2 p-4">
          <p className="font-sans text-2xl font-semibold text-text">
            Hanken Grotesk — chrome & headings
          </p>
          <p className="font-sans text-sm text-muted">
            UI/display sans at 500/600. Sentence case, no tracked-out eyebrows.
          </p>
          <p className="font-mono text-sm text-text">
            Commit Mono 0123456789 · evt_1P9sample · HMAC-SHA256 · 142ms
          </p>
        </Panel>
      </Section>

      <Section title="Copy field & button">
        <div className="flex flex-col gap-3">
          <CopyField
            value="http://localhost:8099/i/7fa2c1d0e3b94a6f8c2d1e0f9a8b7c6d"
            display="/i/7fa2c1d0e3b94a6f8c2d1e0f9a8b7c6d"
          />
          <div className="flex items-center gap-2">
            <MonoText className="text-xs text-muted">copy button</MonoText>
            <CopyButton value="copied-value" />
          </div>
        </div>
      </Section>

      <Section title="Provider select">
        <ProviderSelect value={provider} onChange={setProvider} />
      </Section>

      <Section title="Signature verify panel (the hero)">
        <div className="grid gap-4 md:grid-cols-2">
          <SignatureVerifyPanel
            status="pass"
            cause="ok"
            summary="scheme v1 · HMAC-SHA256 · timestamp within 300s · secret whsec_…a1b2 matched"
            details={PASS_DETAILS}
            provider="stripe"
          />
          <SignatureVerifyPanel
            status="fail"
            cause="timestamp_out_of_tolerance"
            summary="timestamp skew 612s > 300s tolerance"
            details={FAIL_DETAILS}
            provider="stripe"
          />
          <SignatureVerifyPanel
            status="fail"
            cause="signature_mismatch"
            summary="computed v1 ≠ header v1 (check you're signing the raw body, not a re-encoded copy)"
            details={{ computed: "5f3a…e7c1a", provided: "a91c…0f2b" }}
            provider="github"
          />
          <SignatureVerifyPanel
            status="unknown"
            cause="missing_secret"
            summary="no signing secret configured for this endpoint"
            provider=""
          />
        </div>
      </Section>

      <Section title="JSON viewer">
        <div className="grid gap-4 md:grid-cols-2">
          <Panel className="p-2">
            <JSONViewer data={SAMPLE_JSON} />
          </Panel>
          <Panel className="p-2">
            <JSONViewer data={"not json — raw bytes\nsecond line <script>inert</script>"} />
          </Panel>
        </div>
      </Section>

      <Section title="Headers table (signature pinned + highlighted)">
        <Panel className="overflow-hidden">
          <HeadersTable headers={SAMPLE_HEADERS} />
        </Panel>
      </Section>

      <Section title="Attempts timeline">
        <Panel className="overflow-hidden">
          <AttemptsTimeline attempts={ATTEMPTS} />
        </Panel>
      </Section>

      <Section title="Stream rows (select + arrival)">
        <Panel className="overflow-hidden">
          <div key={newRow}>
            <StreamRow
              method="POST"
              label="checkout.session.completed"
              verifyStatus="pass"
              receivedAtMS={base - 4000}
              now={now}
              size={812}
              code={200}
              isNew
            />
          </div>
          <StreamRow
            method="POST"
            label="payment_intent.succeeded"
            verifyStatus="pass"
            receivedAtMS={base - 60_000}
            now={now}
            size={1340}
            code={200}
            selected
          />
          <StreamRow
            method="POST"
            label="invoice.payment_failed"
            verifyStatus="fail"
            receivedAtMS={base - 3_600_000}
            now={now}
            size={980}
            code={400}
          />
          <StreamRow
            method="POST"
            label="customer.created"
            verifyStatus="unknown"
            receivedAtMS={base - 86_400_000}
            now={now}
            size={420}
          />
        </Panel>
        <Button variant="secondary" size="sm" onClick={() => setNewRow((n) => n + 1)}>
          replay arrival
        </Button>
      </Section>

      <Section title="States — loading / empty / error">
        <div className="flex flex-col gap-4">
          <Panel className="overflow-hidden">
            <SkeletonRows rows={4} />
          </Panel>
          <Panel className="overflow-hidden">
            <WaitingEmptyState ingestURL="http://localhost:8099/i/7fa2c1d0e3b94a6f" />
          </Panel>
          <Panel className="overflow-hidden">
            <EmptyState title="no replays yet" hint="replay this event to a target url to see attempts here." />
          </Panel>
          <ErrorBanner
            message="timestamp skew 612s > 300s tolerance — re-sign with a fresh timestamp or widen the window"
            onRetry={() => {}}
          />
        </div>
      </Section>
    </div>
  );
}
