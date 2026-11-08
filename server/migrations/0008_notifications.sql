-- 0008_notifications: notification preferences + a billing email distinct from
-- the GitHub login email (CAN-SPAM relevance).
-- Applied by the migration runner in internal/store/migrate.go.
--
-- NOTE: this is PREFERENCE STORAGE ONLY. No outbound-email provider is wired in
-- this build, so nothing is actually sent — the server records intent so a
-- later mail integration can honor it. See internal/api/account.go.
--
-- billing_email: where receipts/billing notices would go if different from the
-- login email ('' => fall back to the login email).
-- notify_product: product-update emails (opt-in by default).
-- notify_capture_alerts: alerts on notable captures (opt-out by default).

ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_email         TEXT    NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_product        BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_capture_alerts BOOLEAN NOT NULL DEFAULT FALSE;
