import Link from "next/link";
import { LogoMark } from "@/components/ui/logo-mark";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// Landing nav (DESIGN §5.2). Hairline-separated, 56px, surface over the page
// base — no shadow. One primary action only (start free); `pricing` and the
// `live demo` anchor are the only other links so there are no dead routes.
export function MarketingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/70 backdrop-blur-md">
      <nav className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <Link
          href="/"
          aria-label="hookd — home"
          className="rounded-sm focus-visible:outline-2"
        >
          <LogoMark />
        </Link>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href="/#demo"
            className="hidden rounded-sm px-2 py-1.5 font-sans text-sm text-muted transition-colors duration-[80ms] hover:text-text focus-visible:outline-2 sm:inline-block"
          >
            live demo
          </Link>
          <Link
            href="/pricing"
            className="rounded-sm px-2 py-1.5 font-sans text-sm text-muted transition-colors duration-[80ms] hover:text-text focus-visible:outline-2"
          >
            pricing
          </Link>
          <ThemeToggle />
          <Link href="/login" className="rounded-sm focus-visible:outline-2">
            <Button variant="primary" size="sm">
              start free
            </Button>
          </Link>
        </div>
      </nav>
    </header>
  );
}
