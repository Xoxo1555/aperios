CREATE TABLE IF NOT EXISTS "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"reference" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"type" text DEFAULT 'deposit' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text NOT NULL,
	"transaction_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'wallet_transactions_user_id_users_id_fk'
		  AND conrelid = 'wallet_transactions'::regclass
	) THEN
		ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_transactions_user_idx" ON "wallet_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_transactions_status_idx" ON "wallet_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_transactions_created_idx" ON "wallet_transactions" USING btree ("created_at");