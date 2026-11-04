// Inspector-only, pure helpers. No JSX, no network. Derives a human event-type
// label from a captured request and builds a faithful "copy as cURL" string.
// Captured content is inert data — these only read it, never execute it.

import type { EventDetail, HeaderPair } from "@/lib/types";

function headerVal(headers: HeaderPair[], name: string): string | undefined {
  const lower = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === lower)?.value;
}

function parseBody(body: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(body) as unknown;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * A best-effort, human event-type label for a captured request:
 * GitHub/Shopify expose it in a header; most JSON providers put it in the body
 * (`type` / `event` / `event_type`, or a nested `event.type` for Slack).
 * Returns null when nothing meaningful is present (callers fall back to path).
 */
export function deriveEventType(
  body: string,
  headers: HeaderPair[],
): string | null {
  const gh = headerVal(headers, "x-github-event");
  if (gh) return gh;
  const shop = headerVal(headers, "x-shopify-topic");
  if (shop) return shop;

  const obj = parseBody(body);
  if (!obj) return null;

  const direct = obj.type ?? obj.event ?? obj.event_type;
  if (typeof direct === "string" && direct) return direct;

  // Slack event callbacks nest the real type under `event`.
  const nested = obj.event;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const t = (nested as Record<string, unknown>).type;
    if (typeof t === "string" && t) return t;
  }
  return null;
}

// Headers curl sets itself; echoing the captured values back fights it.
const CURL_SKIP = new Set(["host", "content-length"]);

/** Shell-single-quote a value so the cURL line is copy-paste safe. */
function sq(v: string): string {
  return `'${v.replace(/'/g, "'\\''")}'`;
}

/**
 * Reproduce the captured request as a cURL command aimed at `targetURL`
 * (defaults to the event's own path). Headers are echoed exactly as received
 * except the ones curl manages, and the body is passed verbatim via
 * --data-raw so it is never reinterpreted.
 */
export function buildCurl(ev: EventDetail, targetURL: string): string {
  const parts: string[] = [`curl -X ${ev.method} ${sq(targetURL)}`];
  for (const h of ev.headers) {
    if (CURL_SKIP.has(h.name.toLowerCase())) continue;
    parts.push(`  -H ${sq(`${h.name}: ${h.value}`)}`);
  }
  if (ev.body) parts.push(`  --data-raw ${sq(ev.body)}`);
  return parts.join(" \\\n");
}
