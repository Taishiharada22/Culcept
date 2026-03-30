-- Feedback Collection Improvements
-- Ghost Resonance: reacted_at column
-- Vanishing Insight: reaction column
-- Alter Letters: reaction column

-- 1. Ghost Resonance: add reacted_at timestamp
ALTER TABLE stargazer_ghost_resonance
  ADD COLUMN IF NOT EXISTS reacted_at TIMESTAMPTZ;

-- 2. Vanishing Insight: add reaction tracking
ALTER TABLE stargazer_vanishing_insights
  ADD COLUMN IF NOT EXISTS user_reaction TEXT CHECK (user_reaction IN ('resonated', 'surprising', 'expected', 'unclear'));

ALTER TABLE stargazer_vanishing_insights
  ADD COLUMN IF NOT EXISTS reacted_at TIMESTAMPTZ;

-- 3. Alter Letters: add reaction tracking
ALTER TABLE stargazer_alter_letters
  ADD COLUMN IF NOT EXISTS user_reaction TEXT CHECK (user_reaction IN ('resonated', 'thought_provoking', 'off_target'));

ALTER TABLE stargazer_alter_letters
  ADD COLUMN IF NOT EXISTS reacted_at TIMESTAMPTZ;
