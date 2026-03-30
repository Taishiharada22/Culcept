-- user_personal_color_profiles に photo_analysis JSONB カラム追加
-- 写真ベースのパーソナルカラー分析結果を保存
ALTER TABLE user_personal_color_profiles
  ADD COLUMN IF NOT EXISTS photo_analysis JSONB DEFAULT NULL;

COMMENT ON COLUMN user_personal_color_profiles.photo_analysis IS
  'Photo-based personal color analysis result (season, undertone, axes, confidence, palette)';
