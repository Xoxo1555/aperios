-- I2: auth rate limiting — DDL only.
--
-- Adds the `auth_attempts` table ((scope, key) rate-limiter rows guided by the
-- DATABASE clock), the per-code attempt counters, and the hashed code columns
-- on `email_verifications` / `password_resets`. The plain-text `code` columns
-- stay (dropped by 0012_i2_drop_plain_codes.sql once hashed storage is live).
-- Every statement is guarded so the migration can be re-applied safely
-- (idempotent), including on an already-partially-migrated app_db.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_attempts_scope_key_idx" ON "auth_attempts" USING btree ("scope","key");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'email_verifications'::regclass AND attname = 'attempts') THEN
    ALTER TABLE "email_verifications" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'email_verifications'::regclass AND attname = 'code_hash') THEN
    ALTER TABLE "email_verifications" ADD COLUMN "code_hash" text NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'password_resets'::regclass AND attname = 'attempts') THEN
    ALTER TABLE "password_resets" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'password_resets'::regclass AND attname = 'code_hash') THEN
    ALTER TABLE "password_resets" ADD COLUMN "code_hash" text NOT NULL;
  END IF;
END $$;