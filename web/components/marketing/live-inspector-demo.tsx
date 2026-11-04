"use client";

import * as React from "react";
import { StreamRow } from "@/components/inspector/stream-row";
import { SignatureVerifyPanel } from "@/components/inspector/signature-verify-panel";
import { JSONViewer } from "@/components/inspector/json-viewer";
import { LogoMark } from "@/components/ui/logo-mark";
import { LiveDot, StatusBadge } from "@/components/ui/status";
import type { Provider, VerifyCause, VerifyStatus } from "@/lib/types";

// THE hero (DESIGN §5.2): the actual inspector animating a looping
// capture -> verify -> replay, built from the real StreamRow +
// SignatureVerifyPanel + JSONViewer so what spreads on X is the product itself,
// not a mockup. Boldness is spent exactly where DESIGN §1 allows: the lime
// verify PASS and the arrival pulse. Reduced-motion users get a static frame
// (no interval, no slide — the globals also kill the CSS animations).

interface DemoEvent {
  id: string;
  method: string;
  label: string;
  verifyStatus: VerifyStatus;
  code: number;
  size: number;
}

interface PanelData {
  status: VerifyStatus;
  cause: VerifyCause;
  summary: string;
  details: Record<string, string>;
  provider: Provider;
}

interface Replay {
  target: string;
  status: number;
  latency: number;
}

interface Frame {
  stream: DemoEvent[]; // index 0 = newest / top row
  panel: PanelData;
  body: string;
  replay?: Replay;
}

// A fixed clock so relative times are deterministic across server + client
// (no Date.now() during render -> no hydration drift). Ages are assigned by row
// position below, so the top row always reads as the freshest.
const NOW = 1_762_180_927_000;
const AGE_MS = [2_000, 26_000, 180_000, 3_600_000]; // 2s, 26s, 3m, 1h

const EV = {
  checkout: {
    id: "evt_checkout",
    method: "POST",
    label: "checkout.session.completed",
    verifyStatus: "pass",
    code: 200,
    size: 2048,
  },
  payment: {
    id: "evt_payment",
    method: "POST",
    label: "payment_intent.succeeded",
    verifyStatus: "pass",
    code: 200,
    size: 1536,
  },
  invoice: {
    id: "evt_invoice",
    method: "POST",
    label: "invoice.payment_failed",
    verifyStatus: "fail",
    code: 400,
    size: 1788,
  },
  subscription: {
    id: "evt_subscription",
    method: "POST",
    label: "customer.subscription.updated",
    verifyStatus: "pass",
    code: 200,
    size: 1620,
  },
} satisfies Record<string, DemoEvent>;

const PASS_PANEL: PanelData = {
  status: "pass",
  cause: "ok",
  summary: "scheme v1 · HMAC-SHA256 · timestamp within 300s tolerance",
  details: {
    scheme: "v1",
    algorithm: "HMAC-SHA256",
    secret: "whsec_••••live",
  },
  provider: "stripe",
};

const FAIL_PANEL: PanelData = {
  status: "fail",
  cause: "timestamp_out_of_tolerance",
  summary: "timestamp skew 612s > 300s tolerance — event is stale, re-sign to replay",
  details: {
    "header t": "1762180315",
    skew: "612s",
    tolerance: "300s",
  },
  provider: "stripe",
};

const BODY_CHECKOUT = JSON.stringify(
  {
    id: "evt_1P9xK…",
    type: "checkout.session.completed",
    data: { object: { amount_total: 2000, currency: "usd", payment_status: "paid" } },
  },
  null,
  2,
);
const BODY_INVOICE = JSON.stringify(
  {
    id: "evt_1P9wD…",
    type: "invoice.payment_failed",
    data: { object: { amount_due: 2000, attempt_count: 2, status: "open" } },
  },
  null,
  2,
);
const BODY_SUBSCRIPTION = JSON.stringify(
  {
    id: "evt_1P9yT…",
    type: "customer.subscription.updated",
    data: { object: { status: "active", cancel_at_period_end: false } },
  },
  null,
  2,
);

// capture -> verify (incl. the misleading-fail differentiator) -> replay.
const FRAMES: Frame[] = [
  {
    stream: [EV.checkout, EV.payment],
    panel: PASS_PANEL,
    body: BODY_CHECKOUT,
  },
  {
    stream: [EV.invoice, EV.checkout, EV.payment],
    panel: FAIL_PANEL,
    body: BODY_INVOICE,
  },
  {
    stream: [EV.subscription, EV.invoice, EV.checkout, EV.payment],
    panel: PASS_PANEL,
    body: BODY_SUBSCRIPTION,
    replay: { target: "api.myapp.com/webhooks/stripe", status: 200, latency: 142 },
  },
  {
    stream: [EV.checkout, EV.subscription, EV.invoice, EV.payment],
    panel: PASS_PANEL,
    body: BODY_CHECKOUT,
  },
];

const STATIC_FRAME = 2; // the richest frame (pass + replay) for reduced-motion

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // One-shot sync read + subscribe; matches SSR (false) on first client paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Static tab strip — a faithful crop of the inspector's tabs (DESIGN §5.1).
 *  Decorative in the demo, so not focusable. */
function DemoTabs() {
  const tabs = ["headers", "body", "attempts", "curl"];
  return (
    <div
      className="flex items-center gap-1 border-b border-border px-3 py-1.5"
      aria-hidden
    >
      {tabs.map((t) => (
        <span
          key={t}
          className={
            t === "body"
              ? "rounded-sm bg-surface-hi px-2 py-1 font-mono text-[11px] text-text"
              : "px-2 py-1 font-mono text-[11px] text-muted"
          }
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export function LiveInspectorDemo() {
  const reduced = usePrefersReducedMotion();
  const [frameIndex, setFrameIndex] = React.useState(0);

  React.useEffect(() => {
    if (reduced) return; // hold a static frame; no looping motion
    const id = window.setInterval(() => {
      setFrameIndex((f) => (f + 1) % FRAMES.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [reduced]);

  const active = reduced ? STATIC_FRAME : frameIndex;
  const frame = FRAMES[active];
  const liveCount = 4 + active; // a count that ticks as events land

  return (
    <div
      className="overflow-hidden rounded-md border border-border bg-surface"
      role="img"
      aria-label="live webhook inspector: a Stripe event is captured, its signature verified, then replayed re-signed to a target endpoint"
    >
      {/* mini command bar */}
      <div className="flex h-10 items-center gap-2 border-b border-border px-3">
        <LogoMark withWordmark={false} />
        <span className="truncate font-mono text-[11px] text-muted">
          evt_7fa2 · stripe
        </span>
        <LiveDot on label={`live · ${liveCount}`} className="ml-auto" />
        <kbd className="hidden rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted sm:inline-block">
          ⌘K
        </kbd>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        {/* stream — new rows slide in at the top (arrival is the ambient motion) */}
        <div className="h-[196px] overflow-hidden border-b border-border md:border-b-0 md:border-r">
          {frame.stream.slice(0, 4).map((e, i) => (
            <StreamRow
              key={`${active}-${e.id}`}
              method={e.method}
              label={e.label}
              verifyStatus={e.verifyStatus}
              receivedAtMS={NOW - (AGE_MS[i] ?? AGE_MS[AGE_MS.length - 1])}
              size={e.size}
              code={e.code}
              now={NOW}
              selected={i === 0}
              isNew={!reduced && i === 0}
            />
          ))}
        </div>

        {/* detail — the signature verdict leads, then the body, then the replay */}
        <div className="flex min-w-0 flex-col">
          <div className="p-3">
            <SignatureVerifyPanel
              key={`${active}-panel`}
              status={frame.panel.status}
              cause={frame.panel.cause}
              summary={frame.panel.summary}
              details={frame.panel.details}
              provider={frame.panel.provider}
              animate={!reduced}
            />
          </div>
          <DemoTabs />
          <div className="max-h-[128px] overflow-hidden px-3 py-2">
            <JSONViewer data={frame.body} />
          </div>
          {frame.replay ? (
            <div className="flex items-center gap-2 border-t border-border px-3 py-2">
              <StatusBadge kind="warn">replayed</StatusBadge>
              <span className="min-w-0 truncate font-mono text-[11px] text-muted">
                re-signed · {frame.replay.target}
              </span>
              <span
                className="ml-auto shrink-0 font-mono text-[11px] tabular-nums"
                style={{ color: "var(--pass)" }}
              >
                {frame.replay.status} · {frame.replay.latency}ms
              </span>
            </div>
          ) : (
            <div className="h-[37px] border-t border-border" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}
