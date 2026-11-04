import Link from "next/link";
import { LogoMark } from "@/components/ui/logo-mark";
import { ShareOnX } from "@/components/marketing/share-on-x";
import { BRAND } from "@/lib/brand";

// Quiet footer — hairline over the page base, no shadow. Only real routes are
// linked; nothing here invents a page that does not exist.
export function MarketingFooter() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <LogoMark />
          <span className="font-mono text-[11px] text-muted">
            {BRAND.descriptor}
          </span>
        </div>
        <ShareOnX label="share on x" className="order-last sm:order-none" />
        <nav className="flex items-center gap-5 font-sans text-sm text-muted">
          <Link
            href="/pricing"
            className="rounded-sm hover:text-text focus-visible:outline-2"
          >
            pricing
          </Link>
          <Link
            href="/#faq"
            className="rounded-sm hover:text-text focus-visible:outline-2"
          >
            faq
          </Link>
          <Link
            href="/login"
            className="rounded-sm hover:text-text focus-visible:outline-2"
          >
            sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
