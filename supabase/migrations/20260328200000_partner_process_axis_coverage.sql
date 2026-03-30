-- Add axis_coverage and cognitive_profile columns to partner_process_profiles
-- axis_coverage: percentage of 35 relationship-relevant Stargazer axes with observed data
-- cognitive_profile: 6-dimension cognitive style profile for communication compatibility
ALTER TABLE partner_process_profiles
  ADD COLUMN IF NOT EXISTS axis_coverage real DEFAULT 0;

ALTER TABLE partner_process_profiles
  ADD COLUMN IF NOT EXISTS cognitive_profile jsonb DEFAULT '{}';

COMMENT ON COLUMN partner_process_profiles.axis_coverage IS
  'Fraction (0..1) of relationship-relevant Stargazer axes with observed data';

COMMENT ON COLUMN partner_process_profiles.cognitive_profile IS
  '6-dimension cognitive style: abstractStructuring, decomposition, cognitiveUpdating, decisionTempo, socialModeling, explorationClosure';
