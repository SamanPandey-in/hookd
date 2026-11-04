// Typed client for the API-keys endpoints. Same wire discipline as lib/api.ts:
// every request carries the session cookie (credentials:"include"), the base
// URL comes from NEXT_PUBLIC_API_URL via API_URL, and the backend's
// {"error":...} / 402 {upgrade:true} envelope surfaces as an ApiError. These
// shapes mirror the Go backend exactly (GET/POST/DELETE /api/keys).

import { API_URL, ApiError } from "./api";

/** An API key as listed — the secret itself is NEVER returned here, only a
 *  short display prefix. */
export interface ApiKey {
  id: string;
  name: string;
  /** Leading mnemonic of the key (e.g. "whk_a1b2c3"); shown as `prefix…`. */
  prefix: string;
  created_at_ms: number;
  /** Epoch ms of the last authenticated call, or null if never used. */
  last_used_at_ms: number | null;
}

/** The POST response — the ONLY time the full `key` is returned. Show it once,
 *  then drop it from state; it is unrecoverable afterward. */
export interface CreatedApiKey {
  id: string;
  name: string;
  /** The full secret, shown exactly once. */
  key: string;
  prefix: string;
  created_at_ms: number;
}

async function req<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: opts.method ?? "GET",
      credentials: "include",
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
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

export const apiKeys = {
  list: () => req<ApiKey[]>("/api/keys"),

  /** Create a key. Returns the full secret ONCE. May throw a 402 ApiError
   *  (isUpgradeRequired) when the free plan's key cap is hit. */
  create: (name: string) =>
    req<CreatedApiKey>("/api/keys", { method: "POST", body: { name } }),

  remove: (id: string) => req<void>(`/api/keys/${id}`, { method: "DELETE" }),
};
