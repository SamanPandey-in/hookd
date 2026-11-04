-- 0004_profile: user profile fields captured from the GitHub /user response.
-- Applied by the migration runner in internal/store/migrate.go.
--
-- email + created_at already exist (0001). These add the display profile the
-- frontend's Profile area shows. Both default to '' so existing rows are valid.

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS name       TEXT NOT NULL DEFAULT '';
