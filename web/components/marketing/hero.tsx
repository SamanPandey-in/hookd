import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/marketing/section";
import { LiveInspectorDemo } from "@/components/marketing/live-inspector-demo";

// Proof row (DESIGN §5.2): honest, defensible claims — not logos, not invented
// stats. Numbers that are true today: six providers shipped, one-click replay,
// sub-second live capture (PRODUCT F1 acceptance). Separated by hairlines, not
// decorative middle-dots.
const PROOF = [
  { value: "<1s", label: "live capture" },
  { value: "1-click", label: "re-signed replay" },
  { value: "6", label: "providers verified" },
];

export function Hero() {
  return (
    <Section className="grid items-center gap-12 pt-12 pb-16 lg:grid-cols-[1.04fr_1fr] lg:gap-12 lg:pt-16 lg:pb-24">
      <div className="flex flex-col gap-6">
        {/* Status eyebrow — product-true and mono, not a generic all-caps label. */}
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
          <span
            aria-hidden
            className="animate-live inline-block h-[7px] w-[7px] rounded-full bg-accent shadow-[0_0_8px_1px_color-mix(in_oklab,var(--accent)_70%,transparent)]"
          />
          <span>listening</span>
          <span className="text-border">/</span>
          <span className="text-text/85">POST&nbsp;/i/ep_7fa2</span>
          <span className="text-border">/</span>
          <span>6 providers</span>
        </div>

        <h1 className="font-sans text-[2.7rem] font-semibold leading-[1.01] tracking-[-0.022em] text-text sm:text-6xl">
          see every webhook.
          <br />
          verify every{" "}
          <span className="relative whitespace-nowrap">
            signature
            <span
              aria-hidden
              className="absolute inset-x-[-2px] bottom-[0.04em] -z-10 h-[0.2em] rounded-[2px] bg-accent/90"
            />
          </span>
          .
        </h1>

        <p className="max-w-md text-base leading-relaxed text-muted">
          capture, inspect, replay and verify webhooks from stripe, razorpay,
          github &amp; more. when verification fails, we tell you exactly why —
          and replay the exact event, re-signed, to your endpoint.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/login" className="rounded-sm focus-visible:outline-2">
            <Button variant="primary" size="lg">
              start free
            </Button>
          </Link>
          <Link href="#demo" className="rounded-sm focus-visible:outline-2">
            <Button variant="secondary" size="lg">
              live demo
            </Button>
          </Link>
          <span className="font-mono text-xs text-muted">
            no card. point a webhook and watch.
          </span>
        </div>

        <dl className="mt-3 flex flex-wrap items-stretch gap-x-6 gap-y-3 border-t border-border pt-5">
          {PROOF.map((p) => (
            <div
              key={p.label}
              className="flex flex-col gap-0.5 border-l border-border pl-4 first:border-l-0 first:pl-0"
            >
              <dd className="font-mono text-xl font-medium tabular-nums text-text">
                {p.value}
              </dd>
              <dt className="font-sans text-xs text-muted">{p.label}</dt>
            </div>
          ))}
        </dl>
      </div>

      {/* The live instrument, lit by its own lime aura + a soft floor-glow —
          the one place boldness and elevation are spent, and it stays here
          (not fixed) so the glow is a hero moment, not a scroll-long band. */}
      <div id="demo" className="relative scroll-mt-20">
        <div
          aria-hidden
          className="aura-accent pointer-events-none absolute inset-0 -z-10 scale-[1.45] opacity-80"
        />
        <div className="relative rounded-md shadow-[0_40px_120px_-48px_color-mix(in_oklab,var(--accent)_40%,transparent)]">
          <LiveInspectorDemo />
        </div>
      </div>
    </Section>
  );
}
