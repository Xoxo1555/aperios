ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "photographer_share" numeric(10, 2);