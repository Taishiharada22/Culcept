-- Phase 4A: Expand rendezvous_ideal_partner_profiles with appearance preferences
-- and user_style_vector with face/hair fields for cross-feature use

-- Replace appearance_weight_mode with matching_priority (3-axis priority system)
-- matching_priority is a JSONB column with { priorities: ["personality", "face", "style"] }
-- where order determines weight distribution across face/style/personality categories
ALTER TABLE rendezvous_ideal_partner_profiles
  ADD COLUMN IF NOT EXISTS matching_priority jsonb DEFAULT '{"priorities": ["personality", "face", "style"]}',
  ADD COLUMN IF NOT EXISTS preferred_body_types text[],
  ADD COLUMN IF NOT EXISTS preferred_personal_color_seasons text[],
  ADD COLUMN IF NOT EXISTS preferred_hair_features jsonb,
  ADD COLUMN IF NOT EXISTS appearance_priority_order text[];

-- Migrate existing appearance_weight_mode data to matching_priority
-- (backward compatibility: convert old modes to new priority format)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rendezvous_ideal_partner_profiles'
    AND column_name = 'appearance_weight_mode'
  ) THEN
    -- looks → face first
    UPDATE rendezvous_ideal_partner_profiles
    SET matching_priority = '{"priorities": ["face", "style", "personality"]}'
    WHERE appearance_weight_mode = 'looks'
    AND (matching_priority IS NULL OR matching_priority = '{"priorities": ["personality", "face", "style"]}');

    -- personality → personality first (default)
    UPDATE rendezvous_ideal_partner_profiles
    SET matching_priority = '{"priorities": ["personality", "face", "style"]}'
    WHERE appearance_weight_mode = 'personality'
    AND (matching_priority IS NULL OR matching_priority = '{"priorities": ["personality", "face", "style"]}');

    -- balanced → default (no change needed, already the default)

    -- Drop old column
    ALTER TABLE rendezvous_ideal_partner_profiles
      DROP COLUMN IF EXISTS appearance_weight_mode;
  END IF;
END $$;

-- Expand user_style_vector with face/hair fields for cross-feature use
ALTER TABLE user_style_vector
  ADD COLUMN IF NOT EXISTS face_type_primary text,
  ADD COLUMN IF NOT EXISTS hair_length text,
  ADD COLUMN IF NOT EXISTS hair_texture text;
