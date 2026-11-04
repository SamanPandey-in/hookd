// Typed client for the Go backend. Every request sends the session cookie
// (credentials: "include"); the base URL comes from NEXT_PUBLIC_API_URL and
// defaults to the local dev server. This is the ONLY place that knows the wire
// shapes — components import typed functions, never raw fetch.

import type {
  Endpoint,
  EventDetail,
  EventSummary,
  Me,
  Provider,
  ReplayAttempt,
  ReplayResult,
  ResponseRule,
  ShareResult,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8099";

/** Error carrying the backend's {"error":"..."} envelope + HTTP status. */
export class ApiError extends Error {
  status: number;
  /** True when the backend signalled this action needs a Pro upgrade (HTTP 402
   *  {error, upgrade:true}) so callers can show an upgrade affordance. */
  upgrade: boolean;
  constructor(status: number, message: string, upgrade = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.upgrade = upgrade;
  }
}

/** True when the error means "not signed in" so callers can route to /login. */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/** True when the error means "this is a Pro-only action" (HTTP 402) so callers
 *  can surface an inline upgrade prompt instead of a generic failure. */
export function isUpgradeRequired(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 402 || err.upgrade);
}

type ReqOpts = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** Query params; undefined/empty values are dropped. */
  query?: Record<string, string | number | undefined>;
};

async function request<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const url = new URL(API_URL + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: opts.method ?? "GET",
      credentials: "include",
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    // Network/transport failure — surface a precise, debuggable message.
    throw new ApiError(0, `could not reach the API at ${API_URL} (${String(e)})`);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : undefined) || `request failed (${res.status})`;
    // A 402 (or an explicit {upgrade:true}) means the action is Pro-only.
    const upgrade =
      res.status === 402 ||
      (!!data &&
        typeof data === "object" &&
        "upgrade" in data &&
        Boolean((data as { upgrade: unknown }).upgrade));
    throw new ApiError(res.status, msg, upgrade);
  }

  return data as T;
}

// ---- Auth ------------------------------------------------------------------

/** The browser navigates here to begin the GitHub OAuth dance (server redirects
 *  to GitHub, then back to the app). Not a fetch — a full navigation. */
export const githubLoginURL = () => `${API_URL}/auth/github/login`;

export const auth = {
  me: () => request<Me>("/api/me"),
  logout: () => request<{ status: string }>("/auth/logout", { method: "POST" }),
};

// ---- Billing (Dodo Payments, merchant of record) ---------------------------
// Checkout redirects the browser to a hosted Dodo page; the portal lets an
// existing subscriber manage/cancel. A 503 from either means billing is not
// configured on this deploy — callers show a calm "not enabled yet" state.

export const billing = {
  /** Start a Pro checkout; the caller redirects the browser to checkout_url. */
  checkout: (input: { plan: "pro"; interval: "monthly" | "annual" }) =>
    request<{ checkout_url: string }>("/api/billing/checkout", {
      method: "POST",
      body: input,
    }),

  /** The customer portal URL. 409 {error:"no subscription"} when there is none. */
  portal: () => request<{ portal_url: string }>("/api/billing/portal"),
};

// ---- Endpoints -------------------------------------------------------------

export const endpoints = {
  list: () =>
    request<{ endpoints: Endpoint[] }>("/api/endpoints").then((r) => r.endpoints),

  get: (id: string) => request<Endpoint>(`/api/endpoints/${id}`),

  create: (input: {
    name: string;
    provider?: Provider | "";
    retention_days?: number;
  }) =>
    request<Endpoint>("/api/endpoints", {
      method: "POST",
      body: {
        name: input.name,
        provider: input.provider ?? "",
        retention_days: input.retention_days ?? 0,
      },
    }),

  update: (
    id: string,
    patch: { name?: string; provider?: Provider | ""; retention_days?: number },
  ) => request<Endpoint>(`/api/endpoints/${id}`, { method: "PATCH", body: patch }),

  remove: (id: string) =>
    request<{ status: string }>(`/api/endpoints/${id}`, { method: "DELETE" }),

  setSecret: (id: string, secret: string) =>
    request<{ has_secret: boolean; secret_mask: string }>(
      `/api/endpoints/${id}/secret`,
      { method: "PUT", body: { secret } },
    ),

  clearSecret: (id: string) =>
    request<{ has_secret: boolean }>(`/api/endpoints/${id}/secret`, {
      method: "DELETE",
    }),

  setResponseRule: (id: string, rule: ResponseRule) =>
    request<Endpoint>(`/api/endpoints/${id}/response`, {
      method: "PUT",
      body: rule,
    }),

  sendSample: (id: string, provider?: Provider) =>
    request<EventDetail>(`/api/endpoints/${id}/sample`, {
      method: "POST",
      body: provider ? { provider } : {},
    }),

  listEvents: (
    id: string,
    filter?: {
      method?: string;
      verify?: string;
      q?: string;
      limit?: number;
      before?: number;
    },
  ) =>
    request<{ events: EventSummary[] }>(`/api/endpoints/${id}/events`, {
      query: filter,
    }).then((r) => r.events),

  /** The SSE stream URL for an endpoint (consumed by useEventStream). */
  streamURL: (id: string) => `${API_URL}/api/endpoints/${id}/stream`,
};

// ---- Events ----------------------------------------------------------------

export const events = {
  get: (id: string) => request<EventDetail>(`/api/events/${id}`),

  /** Direct download URL for the exact raw bytes (served as an attachment). */
  bodyURL: (id: string) => `${API_URL}/api/events/${id}/body`,

  replay: (id: string, targetURL: string, resign: boolean) =>
    request<ReplayResult>(`/api/events/${id}/replay`, {
      method: "POST",
      body: { target_url: targetURL, resign },
    }),

  listReplays: (id: string) =>
    request<{ attempts: ReplayAttempt[] }>(`/api/events/${id}/replays`).then(
      (r) => r.attempts,
    ),

  share: (id: string) =>
    request<ShareResult>(`/api/events/${id}/share`, { method: "POST" }),
};

// ---- Public share ----------------------------------------------------------

export const share = {
  get: (token: string) => request<EventDetail>(`/share/${token}`),
};

/** The public ingest URL a provider POSTs to (shown as the copy-able URL). */
export const ingestURL = (endpointId: string) => `${API_URL}/i/${endpointId}`;
