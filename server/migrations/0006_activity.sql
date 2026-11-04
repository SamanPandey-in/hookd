-- 0006_activity: per-user activity log (audit trail) shown in the app.
-- Applied by the migration runner in internal/store/migrate.go.
--
-- Rows are written best-effort by handlers (a logging failure never blocks the
-- underlying request). action is a short machine string (e.g. "endpoint.created"),
-- target a short human label, metadata a small JSON object. Cascades with owner.

CREATE TABLE IF NOT EXISTS activity (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action        TEXT   NOT NULL,
    target        TEXT   NOT NULL DEFAULT '',
    metadata      JSONB  NOT NULL DEFAULT '{}'::jsonb,
    created_at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_user_time ON activity(user_id, created_at_ms DESC, id DESC);
