import { Suspense } from "react";
import type { Metadata } from "next";
import { share } from "@/lib/api";
import { providerLabel } from "@/lib/providers";
import { deriveEventType } from "@/components/inspector/derive";
import type { Provider } from "@/lib/types";
import { ShareView } from "./share-view";

// Per-share-link metadata (STANDOUT §3.2). The matching opengraph-image.tsx is
// auto-wired by Next's file convention and renders the verdict card; here we set
// a verdict-specific title/description so the unfurl reads e.g.
// `✓ verified · checkout.session.completed · stripe` or `✕ failed · <cause>`.
// Only non-secret verdict fields are used; the event is already server-redacted.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  let title = "shared webhook event";
  let description = "a read-only, redaction-aware snapshot of one captured webhook.";
  try {
    const ev = await share.get(token);
    const provider = providerLabel((ev.verify_provider || "") as Provider | "");
    const eventType = deriveEventType(ev.body, ev.headers) || ev.path;
    if (ev.verify_status === "pass") {
      title = `✓ verified · ${eventType} · ${provider}`;
      description = `${provider} signature verified on ${eventType}. captured and checked by hookd.`;
    } else if (ev.verify_status === "fail") {
      title = `✕ failed · ${ev.verify_cause || "signature invalid"}`;
      description =
        ev.verify_summary ||
        `${provider} signature failed on ${eventType}. hookd names the exact cause.`;
    } else {
      title = `◦ unverified · ${eventType} · ${provider}`;
      description = `a captured ${provider} webhook, shared read-only via hookd.`;
    }
  } catch {
    // Expired/missing link — fall back to the generic title above.
  }
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description },
    twitter: { title, description, card: "summary_large_image" },
  };
}

// The token is runtime data. Under Next 16's Cache Components, accessing `params`
// must sit inside a <Suspense> boundary so the static shell prerenders and the
// token-dependent view streams in. The client ShareView then fetches the event.
export default function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <Resolver params={params} />
    </Suspense>
  );
}

async function Resolver({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareView token={token} />;
}
