// Compatibility layer over the canonical typed client in lib/api.ts.
//
// RECONCILED: the ActivityEntry wire shape now lives in lib/types.ts as the
// single source of truth. This module used to define its OWN copy with `id`
// typed as a `string` — that was WRONG (the backend column is a BIGSERIAL, so
// `id` is a `number`); the canonical type fixes it and adds ip / user_agent.
// That local copy is gone. The ActivityAction label union stays here because it
// is a UI concern (it drives the action → glyph/label map), not a wire type.

import { activity } from "./api";

export type { ActivityEntry } from "./types";

/** The known activity verbs. A widenable string union so an unseen server
 *  action still renders (mapped to a sensible default label/glyph) rather than
 *  being dropped. `key.rotated` was added when key rotation shipped. */
export type ActivityAction =
  | "login"
  | "endpoint.created"
  | "endpoint.deleted"
  | "secret.set"
  | "replay.sent"
  | "key.created"
  | "key.rotated"
  | "key.revoked"
  | "plan.changed"
  | (string & {});

/** The typed activity client (list, paginated via `before`) from lib/api.ts. */
export { activity };
