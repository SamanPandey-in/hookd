-- 0005_api_keys: programmatic API keys (bearer tokens) for the read/write API.
-- Applied by the migration runner in internal/store/migrate.go.
--
-- Only a SHA-256 hash of the key is stored (key_hash); the plaintext key is
-- shown to the user exactly once at creation and never persisted. A short,
-- non-secret display prefix (e.g. "whk_live_3f") is kept so the UI can identify
-- a key without revealing it. Keys cascade-delete with their owner.

CREATE TABLE IF NOT EXISTS api_keys (
    id              TEXT   PRIMARY KEY,                 -- unguessable token id
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT   NOT NULL DEFAULT '',
    key_hash        TEXT   NOT NULL UNIQUE,             -- hex SHA-256 of the full key
    prefix          TEXT   NOT NULL DEFAULT '',         -- safe display form, never the key
    created_at_ms   BIGINT NOT NULL,
    last_used_at_ms BIGINT                              -- NULL until first authenticated use
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id, created_at_ms DESC);
