DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'idempotency_key'
	) THEN
		ALTER TABLE "orders" ADD COLUMN "idempotency_key" text;
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_user_idempotency_key_idx" ON "orders" USING btree ("user_id","idempotency_key") WHERE "idempotency_key" IS NOT NULL;