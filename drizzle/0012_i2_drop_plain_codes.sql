-- I2: drop the plain-text verification/reset code columns — DDL only.
--
-- `email_verifications.code` and `password_resets.code` stored the 6-digit
-- codes IN CLEAR TEXT. Codes are now stored hashed (HMAC-SHA256 per user in
-- `code_hash`, added by 0011_i2_auth_rate_limits.sql); the clear columns are
-- dropped here. Existing rows are ephemeral (30 min validity) — no backfill.
-- Guarded so the migration is safe to re-apply (idempotent).
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'email_verifications'::regclass AND attname = 'code') THEN
    ALTER TABLE "email_verifications" DROP COLUMN "code";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'password_resets'::regclass AND attname = 'code') THEN
    ALTER TABLE "password_resets" DROP COLUMN "code";
  END IF;
END $$;