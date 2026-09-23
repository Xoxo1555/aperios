DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'certificates_order_item_id_unique'
		  AND conrelid = 'certificates'::regclass
	) THEN
		ALTER TABLE "certificates" ADD CONSTRAINT "certificates_order_item_id_unique" UNIQUE("order_item_id");
	END IF;
END $$;