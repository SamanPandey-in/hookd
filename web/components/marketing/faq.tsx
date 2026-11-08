import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Section } from "@/components/marketing/section";

// FAQ answers the paying objections from research (privacy, free-is-enough,
// localhost, billing) honestly. Native <details> — keyboard-operable, no JS,
// works with reduced motion. Answers state facts, never invent numbers.
interface QA {
  q: string;
  a: React.ReactNode;
}

const ITEMS: QA[] = [
  {
    q: "is there really a free tier?",
    a: "yes. a stable ingest url that never expires, live capture + inspect, basic signature verify, and 7 days of capped history — no card. replay, verify-explain depth, search, sharing and long retention are the paid upgrades.",
  },
  {
    q: "which providers can you verify?",
    a: "stripe, github, razorpay, shopify, standard webhooks (svix / dodo), slack, twilio and vercel — each with its correct scheme, encoding and (where it applies) timestamp tolerance. twilio is the url-bound one: its signature covers the exact url it called, not just the body. more by request after launch.",
  },
  {
    q: "my webhooks carry payment data. is it private?",
    a: "ingest urls are private and unguessable. bodies are stored encrypted, never written to our logs, and rendered as inert escaped text — never live html. you can set endpoints to auto-purge.",
  },
  {
    q: "can i replay to localhost?",
    a: "v1 replays server-side to a target url — your staging or deployed endpoint — re-signed with a fresh timestamp so replay protection doesn't trip. a localhost-forwarding cli is on the roadmap.",
  },
  {
    q: "how does billing work?",
    a: "pro is $12/mo, or $9/mo billed yearly, through dodo payments — a merchant of record that handles global tax and vat. cancel anytime. dodo's own subscription webhooks are standard-webhooks signed, which we verify with our own engine.",
  },
  {
    q: "how is this different from webhook.site or hookdeck?",
    a: "free inspectors capture and pretty-print but never verify a signature or explain a failure, and they expire your data. hookdeck and svix verify and deliver at production scale, priced for volume. we own the dev-time job in between: why did verify fail, and replay the exact event — at an indie price.",
  },
];

export function Faq() {
  return (
    <Section id="faq" className="grid gap-10 pt-8 pb-8 lg:grid-cols-[0.9fr_1.6fr] lg:gap-16">
      {/* left rail — fills the old dead space with a sticky heading + CTA */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="inline-block h-2 w-2 rounded-[1px] bg-accent" aria-hidden />
          <span className="text-muted">faq</span>
        </div>
        <h2 className="font-sans text-2xl font-semibold leading-tight tracking-tight text-text sm:text-3xl">
          questions,
          <br />
          answered straight.
        </h2>
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          the honest answers to what developers actually ask — pricing, privacy,
          and where the free tier ends.
        </p>
        <div className="mt-2 flex items-center gap-3 rounded-md border border-border bg-surface/60 px-4 py-3">
          <span className="font-mono text-[11px] text-muted">still stuck?</span>
          <Link
            href="/login"
            className="ml-auto rounded-sm font-sans text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2"
          >
            start free
          </Link>
        </div>
      </div>

      {/* right — the accordion */}
      <div className="divide-y divide-border border-y border-border">
        {ITEMS.map((item) => (
          <details key={item.q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-sans text-base font-medium text-text marker:content-none focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDown
                className="h-4 w-4 shrink-0 text-muted transition-transform duration-[80ms] group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="max-w-2xl pb-4 text-sm leading-relaxed text-muted">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
