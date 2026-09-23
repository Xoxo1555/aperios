-- I6: repayment / refund lifecycle for payment confirmations — DDL ONLY.
--
-- Adds the refund & amount-validation bookkeeping on `orders`, the revoked
-- flag on `certificates`, and the deduplicated `webhook_events` audit table.
-- Every statement is guarded so the migration can be re-applied safely
-- (idempotent), including on an already-partially-migrated app_db.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"order_number" text,
	"payload" jsonb,
	"error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'certificates'::regclass AND attname = 'revoked_at') THEN
    ALTER TABLE "certificates" ADD COLUMN "revoked_at" timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'orders'::regclass AND attname = 'expected_amount_minor') THEN
    ALTER TABLE "orders" ADD COLUMN "expected_amount_minor" integer;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'orders'::regclass AND attname = 'expected_currency') THEN
    ALTER TABLE "orders" ADD COLUMN "expected_currency" text;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'orders'::regclass AND attname = 'refund_reason') THEN
    ALTER TABLE "orders" ADD COLUMN "refund_reason" text;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'orders'::regclass AND attname = 'refund_id') THEN
    ALTER TABLE "orders" ADD COLUMN "refund_id" text;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'orders'::regclass AND attname = 'refunded_at') THEN
    ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'orders'::regclass AND attname = 'disputed_at') THEN
    ALTER TABLE "orders" ADD COLUMN "disputed_at" timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_provider_event_key" ON "webhook_events" USING btree ("provider","event_id");