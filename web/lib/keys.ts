// Compatibility layer over the canonical typed client in lib/api.ts.
//
// RECONCILED: the API-key wire shapes (ApiKey, CreatedApiKey) now live in
// lib/types.ts as the single source of truth, and the request functions live in
// lib/api.ts (the one place that knows the wire). This module used to define its
// OWN divergent copies of those shapes (missing expires_at_ms / last_used_ip);
// those are gone. It now re-exports the canonical types and the typed client so
// existing `apiKeys` / `ApiKey` / `CreatedApiKey` imports keep working, and adds
// the per-plan key caps mirrored from the Go backend for proactive display.

import { keys } from "./api";
import type { Plan } from "./types";

export type { ApiKey, CreatedApiKey } from "./types";

/** Per-plan API-key caps, mirrored EXACTLY from server/internal/api/keys.go
 *  (FreeMaxAPIKeys / ProMaxAPIKeys). The cap is NOT carried on /me.limits, so
 *  the UI reads it from here to show "used / limit" proactively; the backend is
 *  still the authority (a create past the cap returns 402 → UpgradePrompt). Keep
 *  these in sync with keys.go if the caps ever change. */
export const FREE_MAX_API_KEYS = 2;
export const PRO_MAX_API_KEYS = 20;

/** The caller's API-key cap for their plan. */
export function maxApiKeys(plan: Plan): number {
  return plan === "pro" ? PRO_MAX_API_KEYS : FREE_MAX_API_KEYS;
}

/** The typed API-key client (list / create / rotate / remove) from lib/api.ts,
 *  exposed under the historical `apiKeys` name. */
export const apiKeys = keys;
