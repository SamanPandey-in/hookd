-- 0003_event_type: add a derived, human-readable event type to captured events.
-- Nullable with an empty-string default so existing rows backfill to '' and the
-- inspector can show e.g. "checkout.session.completed" instead of the ingest path.
-- Derived at ingest from the body `type` field or provider headers; inert text.

ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT '';
