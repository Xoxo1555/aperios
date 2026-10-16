CREATE TABLE "wallet_deposit_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"reference" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"transaction_reference" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_deposit_intents_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "wallet_deposit_intents" ADD CONSTRAINT "wallet_deposit_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_deposit_intents_user_idx" ON "wallet_deposit_intents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_deposit_intents_status_idx" ON "wallet_deposit_intents" USING btree ("status");