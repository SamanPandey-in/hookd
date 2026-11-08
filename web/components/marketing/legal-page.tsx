import * as React from "react";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/footer";

// Shared chrome for the legal/support pages. These pages deliberately break the
// all-lowercase house voice and use normal sentence case — legal text reads and
// earns trust better that way (per the lane brief).

/** A visible, unmissable banner marking the document as a pre-launch draft. */
export function DraftBanner() {
  return (
    <div
      role="note"
      className="mb-8 flex items-start gap-3 rounded-md border px-4 py-3"
      style={{
        borderColor: "color-mix(in oklab, var(--warn) 45%, var(--border))",
        background: "color-mix(in oklab, var(--warn) 8%, transparent)",
      }}
    >
      <span
        aria-hidden
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{ background: "var(--warn)" }}
      />
      <p className="text-sm leading-relaxed text-text">
        <strong className="font-semibold">DRAFT — pending legal review, not yet in effect.</strong>{" "}
        This document is a working draft generated from a standard template and
        has not been reviewed by counsel. It does not yet govern your use of
        hookd. We will post the effective version here before launch.
      </p>
    </div>
  );
}

/** The page frame: marketing nav + footer, a readable measure, the #main
 *  landmark the skip-link targets, and a title/updated header. */
export function LegalPage({
  title,
  updated,
  draft = true,
  children,
}: {
  title: string;
  updated: string;
  draft?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingNav />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-14 lg:py-20">
        {draft && <DraftBanner />}
        <header className="mb-10 flex flex-col gap-2">
          <h1 className="font-sans text-3xl font-semibold tracking-tight text-text">
            {title}
          </h1>
          <p className="font-mono text-xs text-muted">Last updated: {updated}</p>
        </header>
        <div className="flex flex-col gap-8">{children}</div>
      </main>
      <MarketingFooter />
    </div>
  );
}

/** A top-level section with a heading and body. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-sans text-xl font-semibold tracking-tight text-text">
        {heading}
      </h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted [&_a]:rounded-sm [&_a]:text-text [&_a]:underline [&_a]:decoration-border [&_a]:underline-offset-2 hover:[&_a]:decoration-text [&_strong]:font-medium [&_strong]:text-text">
        {children}
      </div>
    </section>
  );
}

/** A simple unordered list styled for legal prose. */
export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted"
          />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
