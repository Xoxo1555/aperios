-- C5: edition-number bounds and per-photo uniqueness — DDL ONLY (no data change).
-- If any pre-existing row violates the CHECK below (available_stock >
-- total_editions, or available_stock set while total_editions IS NULL), this
-- migration FAILS LOUDLY. Repair such rows first with
-- `scripts/fix-edition-bounds.ts` (dry-run by default), then re-apply.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'photos_edition_bounds') THEN
    ALTER TABLE "photos" ADD CONSTRAINT "photos_edition_bounds" CHECK ((available_stock IS NULL) OR (total_editions IS NOT NULL AND available_stock >= 0 AND available_stock <= total_editions));
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_items_photo_edition_idx" ON "order_items" USING btree ("photo_id","edition_number") WHERE "edition_number" IS NOT NULL;
