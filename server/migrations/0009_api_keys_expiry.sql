-- 0009_api_keys_expiry: API-key expiry + last-used IP.
-- Applied by the migration runner in internal/store/migrate.go.
--
-- expires_at_ms: optional expiry (unix ms). NULL => never expires. The API-key
-- auth middleware rejects a key once now >= expires_at_ms (expired key -> 401).
-- last_used_ip: best-effort client IP recorded on each authenticated use, for
-- the key-management UI (never a secret value).

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at_ms BIGINT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_used_ip  TEXT NOT NULL DEFAULT '';
