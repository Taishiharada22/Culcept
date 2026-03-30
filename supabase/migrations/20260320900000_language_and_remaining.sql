-- 言語カラム追加
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS languages text[] DEFAULT '{}';

COMMENT ON COLUMN rendezvous_profiles.languages IS 'ユーザーが話せる言語 (japanese, english, chinese, korean, etc)';

ALTER TABLE rendezvous_ideal_partner_profiles
  ADD COLUMN IF NOT EXISTS preferred_languages text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_age_by_category jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN rendezvous_ideal_partner_profiles.preferred_languages IS '希望する相手の言語。空 = こだわらない';
COMMENT ON COLUMN rendezvous_ideal_partner_profiles.preferred_age_by_category IS 'カテゴリ別の年齢好み {romantic: {min:20,max:35}, friendship: {min:18,max:50}, ...}';
