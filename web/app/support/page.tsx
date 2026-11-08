import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { Button } from "@/components/ui/button";

const SUPPORT_EMAIL = "support@hookd.dev";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get help with hookd — reach a human, read the docs, or debug a signature. One email, no ticket maze.",
};

// Support / contact surface (lowercase house voice — this is not a legal page).
// A single real path to a human, plus the self-serve routes.
export default function SupportPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingNav />
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-14 lg:py-20">
        <header className="mb-8 flex flex-col gap-2">
          <h1 className="font-sans text-3xl font-semibold tracking-tight text-text">
            support
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            something broken, a payment stuck, or a question about verify or
            replay? reach a human — no ticket maze.
          </p>
        </header>

        <div className="flex flex-col gap-6">
          {/* email card */}
          <div className="flex flex-col gap-4 rounded-md border border-border bg-surface p-6">
            <div className="flex flex-col gap-1">
              <h2 className="font-sans text-lg font-semibold text-text">
                email us
              </h2>
              <p className="text-sm leading-relaxed text-muted">
                the fastest way to get help. include your account email and, if
                it&rsquo;s a billing issue, your checkout or invoice reference so
                we can find it quickly.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="rounded-sm focus-visible:outline-2"
              >
                <Button variant="primary" size="lg">
                  email {SUPPORT_EMAIL}
                </Button>
              </a>
              <span className="font-mono text-[11px] text-muted">
                we aim to reply within 1–2 business days.
              </span>
            </div>
          </div>

          {/* self-serve */}
          <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-6">
            <h2 className="font-sans text-lg font-semibold text-text">
              before you write
            </h2>
            <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-muted">
              <li>
                check the{" "}
                <Link
                  href="/#faq"
                  className="rounded-sm text-text underline decoration-border underline-offset-2 hover:decoration-text focus-visible:outline-2"
                >
                  faq
                </Link>{" "}
                for pricing, retention and cancellation questions.
              </li>
              <li>
                debugging a failing signature? the{" "}
                <Link
                  href="/debugger"
                  className="rounded-sm text-text underline decoration-border underline-offset-2 hover:decoration-text focus-visible:outline-2"
                >
                  signature debugger
                </Link>{" "}
                tells you exactly why — no signup, nothing stored.
              </li>
              <li>
                read the{" "}
                <Link
                  href="/privacy"
                  className="rounded-sm text-text underline decoration-border underline-offset-2 hover:decoration-text focus-visible:outline-2"
                >
                  privacy policy
                </Link>{" "}
                and{" "}
                <Link
                  href="/terms"
                  className="rounded-sm text-text underline decoration-border underline-offset-2 hover:decoration-text focus-visible:outline-2"
                >
                  terms
                </Link>
                .
              </li>
            </ul>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
