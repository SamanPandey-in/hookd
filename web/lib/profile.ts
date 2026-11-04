// Profile-layer helpers for the Settings → Profile page.
//
// GET /api/me now carries the identity fields the profile view renders
// (avatar_url, name, email, created_at_ms) in addition to the billing shape in
// lib/types `Me`. The canonical `Me` type is owned elsewhere; we describe the
// extra fields here as a thin extension so this surface compiles against the
// documented wire shape regardless of when `Me` picks them up — if `Me` already
// declares them, the intersection is a no-op.

import { API_URL, ApiError } from "@/lib/api";
import type { Me } from "@/lib/types";

/** Identity fields GET /api/me returns for the profile view. */
export interface ProfileFields {
  /** Absolute avatar URL (GitHub), or "" when none is set. */
  avatar_url: string;
  /** Display name, or "" when the provider gave none. */
  name: string;
  /** Account email. */
  email: string;
  /** Account creation time, epoch milliseconds. */
  created_at_ms: number;
}

/** The shell's `me` as seen by the profile view: billing shape + identity. */
export type Profile = Me & ProfileFields;

/** Narrow the shell's `me` (which may be typed as the leaner `Me`) to the
 *  profile shape. The backend always sends these fields on /api/me, so this is
 *  a view-layer cast, not a runtime guarantee — reads below still default. */
export function asProfile(me: Me): Profile {
  return me as Profile;
}

/** Permanently delete the signed-in account and all its data.
 *  DELETE /api/account (authed) → 200. Reuses the same base URL + session
 *  cookie as the typed client; throws ApiError on a non-2xx response. */
export async function deleteAccount(): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/account`, {
      method: "DELETE",
      credentials: "include",
    });
  } catch (e) {
    throw new ApiError(0, `could not reach the API at ${API_URL} (${String(e)})`);
  }

  if (res.ok || res.status === 204) return;

  // Surface the backend's {"error":"…"} envelope when present.
  let message = `request failed (${res.status})`;
  try {
    const text = await res.text();
    if (text) {
      const data: unknown = JSON.parse(text);
      if (data && typeof data === "object" && "error" in data) {
        message = String((data as { error: unknown }).error);
      }
    }
  } catch {
    /* non-JSON body — keep the status-based message */
  }
  throw new ApiError(res.status, message);
}
