-- Calendar: 天気ドリフト対応カラム追加
ALTER TABLE calendar_outfits
  ADD COLUMN IF NOT EXISTS previous_outfit_items JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS regeneration_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS weather_checked_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN calendar_outfits.previous_outfit_items IS '再生成前の旧コーデ（比較表示用）';
COMMENT ON COLUMN calendar_outfits.regeneration_reason IS '再生成理由: weather_drift / manual / event_change';
COMMENT ON COLUMN calendar_outfits.weather_checked_at IS '最終天気チェック日時';
