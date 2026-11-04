// Domain types mirrored EXACTLY from the Go backend (server/internal/store +
// server/internal/verify + server/internal/api). Keep this the single source of
// truth for the API shapes; do not scatter fetch shapes across components.

/** Providers whose signature schemes the verify engine understands. */
export type Provider =
  | "stripe"
  | "github"
  | "razorpay"
  | "shopify"
  | "standard_webhooks"
  | "slack";

export const PROVIDERS: Provider[] = [
  "stripe",
  "github",
  "razorpay",
  "shopify",
  "standard_webhooks",
  "slack",
];

/** Top-level signature verification outcome (verify.Status). */
export type VerifyStatus = "pass" | "fail" | "unknown" | "";

/** Machine-readable verification cause (verify.Cause). */
export type VerifyCause =
  | "ok"
  | "no_signature_header"
  | "malformed_signature_header"
  | "missing_secret"
  | "signature_mismatch"
  | "timestamp_out_of_tolerance"
  | "encoding_mismatch"
  | "body_possibly_altered"
  | "unsupported_provider"
  | "";

/** The HTTP response an endpoint returns to the webhook sender. */
export interface ResponseRule {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** A user-owned ingest target. `id` is the unguessable path token in /i/{id}. */
export interface Endpoint {
  id: string;
  name: string;
  provider: Provider | "";
  has_secret: boolean;
  secret_mask?: string;
  response: ResponseRule;
  retention_days: number;
  created_at: string;
}

/** A single captured header, order + duplicates preserved exactly as received. */
export interface HeaderPair {
  name: string;
  value: string;
}

/** A captured inbound webhook request (list representation; no body inlined). */
export interface EventSummary {
  id: string;
  endpoint_id: string;
  method: string;
  path: string;
  query: string;
  headers: HeaderPair[];
  size: number;
  content_type: string;
  source_ip: string;
  received_at_ms: number;
  /** Derived human label, e.g. "checkout.session.completed"; "" when unknown. */
  event_type: string;
  verify_status: VerifyStatus;
  verify_cause: VerifyCause;
  verify_summary: string;
  verify_details: Record<string, string> | null;
}

/** Full event detail (adds decoded + base64 body). */
export interface EventDetail extends EventSummary {
  body: string;
  body_base64: string;
  shared?: boolean;
}

/** The compact payload pushed over SSE on each new capture. */
export interface StreamEvent {
  id: string;
  endpoint_id: string;
  method: string;
  path: string;
  size: number;
  content_type: string;
  source_ip: string;
  received_at_ms: number;
  event_type: string;
  verify_status: VerifyStatus;
  verify_cause: VerifyCause;
  verify_summary: string;
}

/** One recorded replay of an event to a target URL. */
export interface ReplayAttempt {
  id: number;
  event_id: string;
  target_url: string;
  resigned: boolean;
  response_status: number;
  response_headers: Record<string, string> | null;
  response_body: string;
  latency_ms: number;
  error: string;
  created_at: string;
}

/** Billing plan on the account. `free` is the default anchor-beating tier;
 *  `pro` unlocks verify-explain depth, replay/re-sign, retention, search,
 *  response control and sharing (PRODUCT §6). */
export type Plan = "free" | "pro";

/** Subscription snapshot from the billing provider (Dodo), surfaced on /api/me.
 *  `current_period_end` is formatted defensively (epoch seconds/ms or ISO). */
export interface Subscription {
  status: string; // active | trialing | past_due | canceled | ...
  current_period_end: number | string;
  cancel_at_period_end: boolean;
}

export interface Me {
  id: number;
  login: string;
  email: string;
  /** GitHub display name (may be empty) + avatar; account creation time (ms). */
  name: string;
  avatar_url: string;
  created_at_ms: number;
  /** The account's billing plan. Treat anything other than "pro" as free. */
  plan: Plan;
  /** The active subscription, or null when the account has never subscribed. */
  subscription: Subscription | null;
}

export interface ReplayResult {
  attempt: ReplayAttempt;
  delivered: boolean;
  error?: string;
}

export interface ShareResult {
  token: string;
  path: string;
}
