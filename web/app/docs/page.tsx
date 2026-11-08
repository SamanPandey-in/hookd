import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { DocsContent } from "@/app/docs/docs-content";

export const metadata: Metadata = {
  title: "Docs — getting started",
  description:
    "Capture, inspect, verify and replay webhooks with hookd. Point a webhook at a stable ingest url, read the inspector, verify signatures with the reason (not just a red dot), and replay re-signed. Plus the REST API and an agent brief.",
};

// Public docs (P1-8). Previously this lived inside the auth-gated (app) group,
// so logged-out prospects evaluating the product couldn't read it. It is static
// reference content with no app-shell/auth dependency, so it now serves at a
// public /docs with marketing chrome. The in-app "docs" nav link resolves to
// the same URL — the content is identical.
export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingNav />

      <main id="main" className="flex-1">
        <div className="px-4 py-14 lg:py-20">
          <DocsContent />
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
