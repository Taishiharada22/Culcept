-- Add observation_state column to stargazer_axis_snapshots
-- Stores the user's energy/emotion/social context at the time of observation
-- Used by fluctuationEngine.ts to compute condition-dependent axis distributions

ALTER TABLE stargazer_axis_snapshots
  ADD COLUMN IF NOT EXISTS observation_state JSONB DEFAULT NULL;

-- Add index for efficient querying of state-tagged observations
CREATE INDEX IF NOT EXISTS idx_axis_snapshots_state
  ON stargazer_axis_snapshots (user_id, axis_id)
  WHERE observation_state IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN stargazer_axis_snapshots.observation_state IS
  'JSON with energy, emotion, social, timeOfDay, timestamp — captures user state during observation';
