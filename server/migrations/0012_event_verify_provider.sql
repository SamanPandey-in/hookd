-- 0012_event_verify_provider: persist the provider verification actually used.
-- Applied by the migration runner in internal/store/migrate.go.
--
-- verify_provider: the provider the engine resolved/detected for this capture
-- (e.g. "github" from X-Hub-Signature-256), or '' when none was resolved. This
-- is distinct from the endpoint's configured provider, which may be auto-detect,
-- so the inspector can show what actually verified. NOT NULL with an empty-string
-- default so existing rows backfill to ''. Inert text; never a secret value.

ALTER TABLE events ADD COLUMN IF NOT EXISTS verify_provider TEXT NOT NULL DEFAULT '';
