-- 0002_billing: billing (Dodo Payments) + plan gating state.
-- Applied by the migration runner in internal/store/migrate.go.
--
-- Plan/subscription state lives on the users row (one subscription per user is
-- all the product needs). A processed_webhooks table gives idempotent handling
-- of Dodo's at-least-once webhook delivery (dedupe by Standard-Webhooks id).

ALTER TABLE users ADD COLUMN IF NOT EXISTS plan             TEXT   NOT NULL DEFAULT 'free';   -- 'free' | 'pro'
ALTER TABLE users ADD COLUMN IF NOT EXISTS dodo_customer_id TEXT   NOT NULL DEFAULT '';        -- Dodo customer id, links webhooks + portal to this user
ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_id           TEXT   NOT NULL DEFAULT '';        -- Dodo subscription id
ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_status       TEXT   NOT NULL DEFAULT '';        -- active|on_hold|cancelled|expired|failed|...
ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_current_period_end_ms BIGINT NOT NULL DEFAULT 0; -- next_billing_date as unix ms
ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_cancel_at_period_end  BOOLEAN NOT NULL DEFAULT false;

-- Fast lookup of the owning user when a Dodo webhook arrives.
CREATE INDEX IF NOT EXISTS idx_users_dodo_customer ON users(dodo_customer_id) WHERE dodo_customer_id <> '';

-- Webhook idempotency ledger. One row per handled Standard-Webhooks id.
CREATE TABLE IF NOT EXISTS processed_webhooks (
    webhook_id   TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
