-- 0001_init: core schema for the webhook debugger.
-- Applied by the migration runner in internal/store/migrate.go.

CREATE TABLE IF NOT EXISTS users (
    id          BIGSERIAL PRIMARY KEY,
    github_id   BIGINT NOT NULL UNIQUE,
    login       TEXT   NOT NULL,
    email       TEXT   NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS endpoints (
    id                  TEXT PRIMARY KEY,                 -- unguessable >=128-bit token
    owner_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                TEXT   NOT NULL DEFAULT '',
    provider            TEXT   NOT NULL DEFAULT '',        -- verify.Provider or '' (auto-detect)
    signing_secret_enc  BYTEA,                             -- AES-256-GCM ciphertext, never plaintext
    secret_mask         TEXT   NOT NULL DEFAULT '',        -- safe display form, never the secret
    response_status     INT    NOT NULL DEFAULT 200,
    response_headers    JSONB  NOT NULL DEFAULT '{}'::jsonb,
    response_body       TEXT   NOT NULL DEFAULT '{}',
    retention_days      INT    NOT NULL DEFAULT 7,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_endpoints_owner ON endpoints(owner_id);

CREATE TABLE IF NOT EXISTS events (
    id              TEXT PRIMARY KEY,                      -- unguessable token
    endpoint_id     TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
    method          TEXT NOT NULL,
    path            TEXT NOT NULL,
    query           TEXT NOT NULL DEFAULT '',
    headers         JSONB NOT NULL DEFAULT '[]'::jsonb,    -- ordered array of {name,value}, dupes preserved
    raw_body        BYTEA NOT NULL,
    size            INT  NOT NULL,
    content_type    TEXT NOT NULL DEFAULT '',
    source_ip       TEXT NOT NULL DEFAULT '',
    received_at_ms  BIGINT NOT NULL,
    verify_status   TEXT NOT NULL DEFAULT '',
    verify_cause    TEXT NOT NULL DEFAULT '',
    verify_summary  TEXT NOT NULL DEFAULT '',
    verify_details  JSONB NOT NULL DEFAULT '{}'::jsonb,
    share_token     TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_events_endpoint_time ON events(endpoint_id, received_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_events_verify ON events(endpoint_id, verify_status);

CREATE TABLE IF NOT EXISTS replay_attempts (
    id                BIGSERIAL PRIMARY KEY,
    event_id          TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    target_url        TEXT NOT NULL,
    resigned          BOOLEAN NOT NULL DEFAULT false,
    response_status   INT  NOT NULL DEFAULT 0,
    response_headers  JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_body     TEXT NOT NULL DEFAULT '',
    latency_ms        BIGINT NOT NULL DEFAULT 0,
    error             TEXT NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_replay_event ON replay_attempts(event_id, created_at DESC);
