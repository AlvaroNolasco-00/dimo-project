-- Migration: add access_token to product_categories
-- Safe to run on existing databases (idempotent via DO block).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'product_categories' AND column_name = 'access_token'
    ) THEN
        ALTER TABLE product_categories ADD COLUMN access_token VARCHAR UNIQUE;
        CREATE INDEX ix_product_categories_access_token ON product_categories(access_token);
    END IF;
END
$$;

-- Generate tokens for any existing categories that don't have one yet
UPDATE product_categories
SET access_token = gen_random_uuid()::text
WHERE access_token IS NULL;
