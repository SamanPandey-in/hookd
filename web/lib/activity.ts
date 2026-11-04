// Typed client for the account activity log (GET /api/activity?limit=). Same
// wire discipline as lib/api.ts: session cookie on every request, base URL from
// API_URL, backend {"error":...} envelope surfaced as ApiError. Shapes mirror
// the Go backend exactly.

import { API_URL, ApiError } from "./api";

/** The known activity verbs. Kept as a union of string literals but typed as a
 *  widenable string so an unseen server action still renders (mapped to a
 *  sensible default label/icon) rather than being dropped. */
export type ActivityAction =
  | "login"
  | "endpoint.created"
  | "endpoint.deleted"
  | "secret.set"
  | "replay.sent"
  | "key.created"
  | "key.revoked"
  | "plan.changed"
  | (string & {});

/** One recorded account event, newest first from the API. */
export interface ActivityEntry {
  id: string;
  action: ActivityAction;
  /** What the action acted on (an endpoint name, key prefix, plan, …); "" when
   *  the action has no target. Rendered in mono. */
  target: string;
  /** Free-form extra context, provider-defined; may be absent. */
  metadata: Record<string, unknown> | null;
  created_at_ms: number;
}

async function req<T>(path: string, query?: Record<string, number | string>) {
  const url = new URL(API_URL + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), { credentials: "include" });
  } catch (e) {
    throw new ApiError(0, `could not reach the API at ${API_URL} (${String(e)})`);
  }

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
    throw new ApiError(res.status, msg, res.status === 402);
  }

  return data as T;
}

export const activity = {
  list: (limit = 100) => req<ActivityEntry[]>("/api/activity", { limit }),
};
