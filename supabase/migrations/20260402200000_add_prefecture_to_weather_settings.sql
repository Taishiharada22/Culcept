-- 居住地（都道府県）を shared domain として user_weather_settings に追加
-- Calendar も My-Style もこのカラムを参照する
ALTER TABLE user_weather_settings
  ADD COLUMN IF NOT EXISTS prefecture TEXT;

COMMENT ON COLUMN user_weather_settings.prefecture IS '居住地の都道府県名（例: 東京都）。shared location domain の正本。';
