-- 0007_account_theme: account-synced appearance theme.
-- Applied by the migration runner in internal/store/migrate.go.
--
-- Lets a signed-in user's chosen theme follow them across devices (the client
-- still falls back to localStorage when logged out). Empty string means "no
-- account preference set" — the client then uses its own default/system choice.

ALTER TABLE users ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT '';
