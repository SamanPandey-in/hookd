import Link from "next/link";
import { LogoMark } from "@/components/ui/logo-mark";
import { ShareOnX } from "@/components/marketing/share-on-x";
import { BRAND } from "@/lib/brand";

// Quiet footer — hairline over the page base, no shadow. Product links on one
// row, legal/support on a muted second line. Every href resolves to a real
// route (privacy/terms/support are first-party pages; docs is the getting-
// started guide).
const PRODUCT_LINKS = [
  { href: "/debugger", label: "signature debugger" },
  { href: "/docs", label: "docs" },
  { href: "/pricing", label: "pricing" },
  { href: "/#faq", label: "faq" },
  { href: "/login", label: "sign in" },
];

const LEGAL_LINKS = [
  { href: "/support", label: "support" },
  { href: "/privacy", label: "privacy" },
  { href: "/terms", label: "terms" },
];

export function MarketingFooter() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <LogoMark />
            <span className="font-mono text-[11px] text-muted">
              {BRAND.descriptor}
            </span>
          </div>
          <ShareOnX label="share on x" className="order-last sm:order-none" />
          <nav
            aria-label="footer"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 font-sans text-sm text-muted"
          >
            {PRODUCT_LINKS.map((l) => (
              <Link
                key={l.href + l.label}
                href={l.href}
                className="rounded-sm hover:text-text focus-visible:outline-2"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <nav
            aria-label="legal"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 font-sans text-[13px] text-muted"
          >
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-sm hover:text-text focus-visible:outline-2"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <p className="font-mono text-[11px] text-muted">
            built in public · week 2 of weekly-ship
          </p>
        </div>
      </div>
    </footer>
  );
}
