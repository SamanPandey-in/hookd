import { Section, SectionHeading } from "@/components/marketing/section";
import { FieldLabel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status";

// Replay + re-sign (PRODUCT F3). The unsolved sub-problem: a captured event
// replayed verbatim trips replay protection (stale timestamp). We re-sign with
// a fresh timestamp and the endpoint's secret so it lands valid — with a toggle
// to keep the original signature. The panel is an illustrative crop of the real
// replay control, not fabricated customer data.
const POINTS: { term: string; detail: string }[] = [
  {
    term: "replay the exact event",
    detail:
      "not a lookalike. re-send the request you captured, so you can prove your fix handled the one that failed.",
  },
  {
    term: "re-sign on send",
    detail:
      "fresh timestamp + the endpoint secret, so replay protection doesn't reject it. or keep the original signature verbatim.",
  },
  {
    term: "edit, then replay",
    detail:
      "tweak the payload — a different amount, a missing field — and we re-sign the edited bytes so your handler still verifies. craft the edge case you can't trigger upstream.",
  },
  {
    term: "or forward straight to localhost",
    detail:
      "npx hookd listen <endpoint> --forward localhost:3000 streams live events to your machine, re-signed so verification passes. no tunnel, no ngrok churn.",
  },
  {
    term: "set the response, see the result",
    detail:
      "force a 500 to exercise retry logic. every attempt records status, headers, body and latency.",
  },
];

export function ReplayResign() {
  return (
    <Section className="pt-8 pb-8">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div className="flex flex-col gap-8">
          <SectionHeading
            index="02"
            kicker="replay"
            title="replay the exact event — re-signed"
            lead="re-triggering gives you a different event. we re-send the one that broke, with a valid fresh signature — to a staging url, or straight to your localhost with the cli."
          />
          <dl className="flex flex-col gap-5">
            {POINTS.map((p) => (
              <div key={p.term} className="flex flex-col gap-1">
                <dt className="font-sans text-sm font-semibold text-text">
                  {p.term}
                </dt>
                <dd className="max-w-md text-sm leading-relaxed text-muted">
                  {p.detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* illustrative replay control */}
        <div className="rounded-md border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <FieldLabel>replay</FieldLabel>
            <span className="font-mono text-[11px] text-muted">
              checkout.session.completed
            </span>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-1.5">
              <FieldLabel>target url</FieldLabel>
              <div className="flex items-center rounded-sm border border-border bg-surface-hi px-3 py-2">
                <code className="truncate font-mono text-xs text-text">
                  https://api.myapp.com/webhooks/stripe
                </code>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-sm border border-border px-3 py-2">
              <span className="font-mono text-xs text-text">
                re-sign with fresh timestamp
              </span>
              {/* on-state switch, illustrative */}
              <span
                aria-hidden
                className="relative inline-flex h-5 w-9 items-center rounded-full"
                style={{ background: "var(--accent-fill)" }}
              >
                <span className="absolute right-0.5 h-4 w-4 rounded-full bg-[var(--on-accent)]" />
              </span>
            </div>

            <div className="flex items-center gap-2 border-t border-border pt-3">
              <StatusBadge kind="warn">replayed</StatusBadge>
              <span className="font-mono text-[11px] text-muted">
                re-signed · delivered
              </span>
              <span
                className="ml-auto font-mono text-[11px] tabular-nums"
                style={{ color: "var(--pass)" }}
              >
                200 · 142ms
              </span>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
