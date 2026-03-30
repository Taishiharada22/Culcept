-- =================================================================
-- P0: 年齢・性別・カテゴリ統一マイグレーション
-- =================================================================

-- 1. rendezvous_profiles に gender と date_of_birth 追加
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male', 'female', 'non_binary', 'prefer_not_to_say')),
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS smoking text CHECK (smoking IN ('non_smoker', 'sometimes', 'smoker')),
  ADD COLUMN IF NOT EXISTS drinking text CHECK (drinking IN ('non_drinker', 'sometimes', 'regular')),
  ADD COLUMN IF NOT EXISTS occupation_category text,
  ADD COLUMN IF NOT EXISTS education_level text CHECK (education_level IN ('high_school', 'vocational', 'university', 'graduate')),
  ADD COLUMN IF NOT EXISTS prefecture text;

COMMENT ON COLUMN rendezvous_profiles.gender IS 'ユーザーの性別';
COMMENT ON COLUMN rendezvous_profiles.date_of_birth IS '生年月日（年齢計算に使用）';
COMMENT ON COLUMN rendezvous_profiles.smoking IS '喫煙状況';
COMMENT ON COLUMN rendezvous_profiles.drinking IS '飲酒頻度';
COMMENT ON COLUMN rendezvous_profiles.occupation_category IS '職業カテゴリ';
COMMENT ON COLUMN rendezvous_profiles.education_level IS '最終学歴';
COMMENT ON COLUMN rendezvous_profiles.prefecture IS '居住都道府県';

-- 2. rendezvous_ideal_partner_profiles に年齢・性別・居住地・喫煙・飲酒・類似性・外見好み追加
ALTER TABLE rendezvous_ideal_partner_profiles
  ADD COLUMN IF NOT EXISTS preferred_age_min int,
  ADD COLUMN IF NOT EXISTS preferred_age_max int,
  ADD COLUMN IF NOT EXISTS preferred_genders text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_prefecture text,
  ADD COLUMN IF NOT EXISTS smoking_preference text CHECK (smoking_preference IN ('no_preference', 'non_smoker', 'smoker_ok')),
  ADD COLUMN IF NOT EXISTS drinking_preference text CHECK (drinking_preference IN ('no_preference', 'non_drinker', 'social', 'regular')),
  ADD COLUMN IF NOT EXISTS similarity_preference text CHECK (similarity_preference IN ('similar', 'complementary', 'mixed', 'no_preference')),
  ADD COLUMN IF NOT EXISTS preferred_appearance jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN rendezvous_ideal_partner_profiles.preferred_age_min IS '希望する相手の最低年齢。NULL = こだわらない';
COMMENT ON COLUMN rendezvous_ideal_partner_profiles.preferred_age_max IS '希望する相手の最大年齢。NULL = こだわらない';
COMMENT ON COLUMN rendezvous_ideal_partner_profiles.preferred_genders IS '希望する相手の性別（複数選択可: male, female, non_binary）。空 = こだわらない';
COMMENT ON COLUMN rendezvous_ideal_partner_profiles.preferred_prefecture IS '希望する相手の都道府県。NULL = こだわらない';
COMMENT ON COLUMN rendezvous_ideal_partner_profiles.smoking_preference IS '喫煙の好み';
COMMENT ON COLUMN rendezvous_ideal_partner_profiles.drinking_preference IS '飲酒の好み';
COMMENT ON COLUMN rendezvous_ideal_partner_profiles.similarity_preference IS '似た人 vs 補完する人の好み';
COMMENT ON COLUMN rendezvous_ideal_partner_profiles.preferred_appearance IS '詳細な外見好み: {eye_shapes, face_shapes, nose_impression, mouth_impression, hair, body_build, personal_colors}';
