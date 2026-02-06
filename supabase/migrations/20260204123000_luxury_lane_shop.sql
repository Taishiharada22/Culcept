-- Luxury lane brand link fields
ALTER TABLE luxury_lanes
    ADD COLUMN IF NOT EXISTS shop_url TEXT,
    ADD COLUMN IF NOT EXISTS shop_slug TEXT;
