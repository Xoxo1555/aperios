ALTER TABLE "photos" ADD COLUMN "hd_path" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "hd_mime" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "hd_size" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cover_image" text;