import { ImageResponse } from "next/og";
import { share } from "@/lib/api";
import type { Provider } from "@/lib/types";
import { deriveEventType } from "@/components/inspector/derive";
import {
  DiagnosisCard,
  DIAGNOSIS_DETAIL_KEYS,
  OG_SIZE,
  type DiagnosisCardProps,
} from "@/app/og/diagnosis-card";

// Per-share-link OG card (STANDOUT §3.2). Reuses the Lane's diagnosis renderer so
// a shared event posts the actual verdict, not the generic site card. The event
// is already server-redacted by the share endpoint; we pass only the verdict
// fields + the whitelisted non-secret details into the shared card — never the
// body or headers.

export const alt = "hookd — shared webhook signature verdict";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let props: DiagnosisCardProps;
  try {
    const ev = await share.get(token);
    const details: Record<string, string> = {};
    for (const k of DIAGNOSIS_DETAIL_KEYS) {
      const v = ev.verify_details?.[k];
      if (v) details[k] = v;
    }
    const eventType = deriveEventType(ev.body, ev.headers);
    props = {
      status: ev.verify_status,
      provider: (ev.verify_provider || "") as Provider | "",
      cause: ev.verify_cause,
      // Prefer the server summary; fall back to the event type for context.
      summary: ev.verify_summary || (eventType ? `event: ${eventType}` : ""),
      details,
      ts: String(ev.received_at_ms || ""),
    };
  } catch {
    // Expired or missing link — render a neutral, on-brand fallback card.
    props = {
      status: "unknown",
      provider: "",
      cause: "",
      summary: "this shared event could not be loaded — it may have expired.",
      details: {},
    };
  }

  return new ImageResponse(<DiagnosisCard {...props} />, { ...size });
}
