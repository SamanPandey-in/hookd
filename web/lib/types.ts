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
  | "slack"
  | "twilio"
  | "vercel";

export const PROVIDERS: Provider[] = [
  "stripe",
  "github",
  "razorpay",
  "shopify",
  "standard_webhooks",
  "slack",
  "twilio",
  "vercel",
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

/** The subscription status strings the backend (billing.go) actually emits.
 *  Note the British spelling "cancelled" — this must match the backend exactly
 *  so the status→label map keys correctly (no silent fallthrough). */
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "on_hold"
  | "past_due"
  | "cancelled"
  | "expired"
  | "failed";

/** Subscription snapshot from the billing provider (Dodo), surfaced on /api/me.
 *  `current_period_end` is formatted defensively (epoch seconds/ms or ISO). */
export interface Subscription {
  /** Real backend status (see SubscriptionStatus). Typed as the union | string
   *  so an unforeseen server value still renders rather than breaking the type. */
  status: SubscriptionStatus | (string & {});
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
  /** Account-synced appearance theme (see account.setTheme). "" means no
   *  account preference is set and the client uses its own default/system. */
  theme: string;
  /** The account's billing plan. Treat anything other than "pro" as free. */
  plan: Plan;
  /** The active subscription, or null when the account has never subscribed. */
  subscription: Subscription | null;
  /** Server-authoritative plan limits (mirrors server/internal/plan). The UI
   *  reads caps from here instead of hardcoding them, so the walls it draws can
   *  never drift from what the API actually enforces. `pro_*` are the Pro-tier
   *  ceilings, used in upgrade copy ("pro lifts to 25"). */
  limits: PlanLimits;
}

export interface PlanLimits {
  max_endpoints: number;
  max_retention_days: number;
  pro_max_endpoints: number;
  pro_retention_days: number;
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

/** Notification preferences + a billing email distinct from the GitHub login
 *  email. NOTE: delivery is deferred on the backend — no mail provider is wired,
 *  so this is PREFERENCE STORAGE ONLY (the server records intent; nothing is
 *  sent yet). GET/PUT /api/account/notifications. */
export interface NotificationPreferences {
  /** Where billing mail would go if different from the login email; "" => use
   *  the login email. */
  billing_email: string;
  /** Product-update emails (opt-in by default). */
  notify_product: boolean;
  /** Alerts on notable captures (opt-out by default). */
  notify_capture_alerts: boolean;
}

/** An API key as listed — the secret itself is NEVER returned here, only a
 *  short display prefix. Mirrors the Go store.APIKey JSON exactly. */
export interface ApiKey {
  id: string;
  name: string;
  /** Leading mnemonic of the key (e.g. "whk_live_3f"); shown as `prefix…`. */
  prefix: string;
  created_at_ms: number;
  /** Epoch ms of the last authenticated call, or null if never used. */
  last_used_at_ms: number | null;
  /** Optional expiry (epoch ms); null means the key never expires. An expired
   *  key is rejected by the backend (401). */
  expires_at_ms: number | null;
  /** Best-effort client IP of the most recent authenticated use; "" until used.
   *  Never a secret value. */
  last_used_ip: string;
  /** Authorization scopes. `"read"` = safe GETs; `"write"` = anything that
   *  mutates. An EMPTY array means FULL access (both) — how keys issued before
   *  scopes existed behave. Mirrors store.APIKey.Scopes. */
  scopes: string[];
}

/** The create/rotate response — the ONLY time the full `key` is returned. Show
 *  it once, then drop it from state; it is unrecoverable afterward. */
export interface CreatedApiKey {
  id: string;
  name: string;
  /** The full secret, shown exactly once. */
  key: string;
  prefix: string;
  created_at_ms: number;
  /** The key's expiry (epoch ms) or null; echoed back on create/rotate. */
  expires_at_ms: number | null;
  /** The key's scopes (["read","write"] by default). An empty array means full
   *  access. Echoed back on create/rotate. */
  scopes: string[];
}

/** One recorded account event, newest first from the API. `id` is numeric
 *  (backend BIGSERIAL). Mirrors the Go store.Activity JSON exactly. */
export interface ActivityEntry {
  id: number;
  action: string;
  /** What the action acted on (an endpoint name, key prefix, plan, …); "" when
   *  the action has no target. */
  target: string;
  /** Free-form extra context, provider-defined; may be absent/null. */
  metadata: Record<string, string> | null;
  created_at_ms: number;
  /** Best-effort client IP captured on login + sensitive actions; "" when not
   *  captured. */
  ip: string;
  /** Best-effort device (user agent) captured alongside ip; "" when not captured. */
  user_agent: string;
}
