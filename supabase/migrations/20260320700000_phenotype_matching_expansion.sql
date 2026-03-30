-- 理想パートナープロフィールに身長好みカラムを追加
ALTER TABLE rendezvous_ideal_partner_profiles
  ADD COLUMN IF NOT EXISTS preferred_height_min_cm int,
  ADD COLUMN IF NOT EXISTS preferred_height_max_cm int;

COMMENT ON COLUMN rendezvous_ideal_partner_profiles.preferred_height_min_cm IS
  '希望する相手の最低身長 (cm)。NULL = こだわらない';
COMMENT ON COLUMN rendezvous_ideal_partner_profiles.preferred_height_max_cm IS
  '希望する相手の最大身長 (cm)。NULL = こだわらない';
