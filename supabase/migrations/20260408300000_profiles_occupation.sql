-- profiles テーブルに職業フィールドを追加（A baseline 拡張）
-- Stargazer careerAptitude の job role ID と対応

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS occupation_detail text;

COMMENT ON COLUMN profiles.occupation IS '職業ID（careerAptitude.ts の job role ID に対応）';
COMMENT ON COLUMN profiles.occupation_detail IS '具体的な役職・専門分野（任意入力）';
