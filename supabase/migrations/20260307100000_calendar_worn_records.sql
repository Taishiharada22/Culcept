-- カレンダー着用記録カラム追加
-- calendar_outfits テーブルに着用記録データを追加

ALTER TABLE calendar_outfits
  ADD COLUMN IF NOT EXISTS worn_item_ids JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS satisfaction SMALLINT DEFAULT NULL CHECK (satisfaction IS NULL OR (satisfaction >= 1 AND satisfaction <= 5)),
  ADD COLUMN IF NOT EXISTS worn_note TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sync_snapshot JSONB DEFAULT NULL;

COMMENT ON COLUMN calendar_outfits.worn_item_ids IS 'Array of wardrobe item IDs actually worn';
COMMENT ON COLUMN calendar_outfits.satisfaction IS 'User satisfaction rating 1-5';
COMMENT ON COLUMN calendar_outfits.worn_note IS 'User note about outfit experience';
COMMENT ON COLUMN calendar_outfits.sync_snapshot IS 'SYNC score snapshot at time of recording';
