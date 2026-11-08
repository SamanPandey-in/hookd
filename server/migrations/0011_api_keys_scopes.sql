-- 0011_api_keys_scopes: per-key authorization scopes.
-- Applied by the migration runner in internal/store/migrate.go.
--
-- scopes: the actions a key may perform. The minimal model is 'read' (safe GETs)
-- and 'write' (anything that mutates). BACKWARD COMPATIBILITY IS MANDATORY: the
-- default '{}' (empty array) means FULL access (both read and write), so every
-- key issued before this column existed keeps working with no change. A new key
-- defaults to BOTH unless the caller narrows it. Never a secret value.

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT '{}';
