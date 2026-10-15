CREATE INDEX "bookmarks_photo_idx" ON "bookmarks" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "collection_photos_photo_idx" ON "collection_photos" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "collections_user_idx" ON "collections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comments_user_idx" ON "comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "likes_photo_idx" ON "likes" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payouts_user_idx" ON "payouts" USING btree ("user_id");