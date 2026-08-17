-- Align the legacy users table with the custom Google OAuth flow.
-- Google-created users do not have a local password, so password_hash must be nullable.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_access_token" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_refresh_token" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_token_expires_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "users_google_id_key" ON "users"("google_id");
