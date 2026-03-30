-- =============================================================================
-- Add "partner" (パートナー / 結婚前提マッチング) category
-- =============================================================================

-- rendezvous_profiles: primary_category + enabled_categories
ALTER TABLE rendezvous_profiles
  DROP CONSTRAINT IF EXISTS rendezvous_profiles_primary_category_check;

ALTER TABLE rendezvous_profiles
  ADD CONSTRAINT rendezvous_profiles_primary_category_check
    CHECK (primary_category IN ('romantic', 'friendship', 'cocreation', 'community', 'partner'));

-- rendezvous_candidates: category
ALTER TABLE rendezvous_candidates
  DROP CONSTRAINT IF EXISTS rendezvous_candidates_category_check;

ALTER TABLE rendezvous_candidates
  ADD CONSTRAINT rendezvous_candidates_category_check
    CHECK (category IN ('romantic', 'friendship', 'cocreation', 'community', 'partner'));

-- rendezvous_preferences: desired_relation_types (array, no CHECK needed for arrays typically)
-- If there's a check on individual elements, update it here

-- Add profile_details JSONB column for extended profile data (hobbies, lifestyle sliders, etc.)
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS profile_details jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN rendezvous_profiles.profile_details IS
  'Extended profile: hobbies, interests, lifestyle sliders, occupation, area, food, travel, pets, meeting purpose, availability, partner-specific fields';
