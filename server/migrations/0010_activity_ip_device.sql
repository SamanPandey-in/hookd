-- 0010_activity_ip_device: capture IP + device (user agent) on activity rows.
-- Applied by the migration runner in internal/store/migrate.go.
--
-- Recorded best-effort on login and sensitive actions so the activity log can
-- show where/what a change came from. Both default to '' so existing rows stay
-- valid. Neither is a secret value.

ALTER TABLE activity ADD COLUMN IF NOT EXISTS ip         TEXT NOT NULL DEFAULT '';
ALTER TABLE activity ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT '';
