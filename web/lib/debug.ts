// Typed client for the PUBLIC signature debugger endpoint (F3, IMPR_PLAN §6.F3).
// This intentionally does NOT import from lib/api.ts: the debugger is a public,
// no-signup tool, so unlike the app client it sends NO cookies/credentials and
// hits the unauthenticated /debug/verify route. The base URL still comes from
// NEXT_PUBLIC_API_URL (mirrors lib/keys.ts's local-fetch-helper pattern).

import type { Provider, VerifyCause, VerifyStatus } from "./types";

export const DEBUG_API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8099";

/** Error carrying the backend's {"error":"..."} envelope + HTTP status. Kept
 *  local to this module so the public tool never depends on lib/api.ts. */
export class DebugError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DebugError";
    this.status = status;
  }
}

/** Request body for POST /debug/verify. `provider` omitted => backend auto-detects. */
export interface DebugVerifyInput {
  provider?: Provider | "";
  secret: string;
  headers: Record<string, string>;
  body: string;
}

/** The subset of verify.Result the debugger renders — the same fields
 *  SignatureVerifyPanel consumes. */
export interface DebugVerifyResult {
  provider: Provider | "";
  status: VerifyStatus;
  cause: VerifyCause;
  summary: string;
  details: Record<string, string> | null;
}

/** POST the paste to the public verify engine. No cookies, no storage — the
 *  endpoint is pure and stores nothing. */
export async function debugVerify(
  input: DebugVerifyInput,
): Promise<DebugVerifyResult> {
  let res: Response;
  try {
    res = await fetch(`${DEBUG_API_URL}/debug/verify`, {
      method: "POST",
      // Public endpoint — deliberately no credentials/cookies.
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: input.provider || undefined,
        secret: input.secret,
        headers: input.headers,
        body: input.body,
      }),
    });
  } catch (e) {
    throw new DebugError(
      0,
      `could not reach the debugger at ${DEBUG_API_URL} (${String(e)})`,
    );
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
        : undefined) ||
      (res.status === 429
        ? "rate limit reached — wait a moment and try again"
        : `request failed (${res.status})`);
    throw new DebugError(res.status, msg);
  }

  return data as DebugVerifyResult;
}
