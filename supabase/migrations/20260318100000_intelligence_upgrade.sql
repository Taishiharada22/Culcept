-- 20260318100000_intelligence_upgrade.sql
-- Stargazer Intelligence Upgrade: behavioral signals, detected patterns, alter session summaries

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Table 1: stargazer_behavioral_signals
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_behavioral_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,          -- 'response_time' | 'answer_revision' | 'session_duration' | 'category_avoidance' | 'phantom_hesitation' | 'completion_rate' | 'time_of_day' | 'answer_speed_category'
  value NUMERIC NOT NULL,
  context TEXT,                       -- question_id, category, axis, etc.
  question_id TEXT,
  original_choice INT,                -- for revision detection (the first choice before change)
  final_choice INT,                   -- the final chosen value
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bsig_user_type ON stargazer_behavioral_signals (user_id, signal_type, recorded_at DESC);
CREATE INDEX idx_bsig_session ON stargazer_behavioral_signals (user_id, session_date);

ALTER TABLE stargazer_behavioral_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own signals" ON stargazer_behavioral_signals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own signals" ON stargazer_behavioral_signals FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Table 2: stargazer_detected_patterns
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_detected_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL,         -- 'weekday' | 'time_of_day' | 'avoidance' | 'cycle' | 'hesitation' | 'contradiction' | 'behavioral_blind'
  axis_id TEXT,
  description_ja TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmation_count INT DEFAULT 1,
  surfaced BOOLEAN DEFAULT false,
  surfaced_at TIMESTAMPTZ,
  user_reaction TEXT CHECK (user_reaction IN ('resonated', 'surprised', 'denied', NULL)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_patterns_user ON stargazer_detected_patterns (user_id, pattern_type);
CREATE INDEX idx_patterns_unsurfaced ON stargazer_detected_patterns (user_id, surfaced, confidence DESC);

ALTER TABLE stargazer_detected_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own patterns" ON stargazer_detected_patterns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own patterns" ON stargazer_detected_patterns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own patterns" ON stargazer_detected_patterns FOR UPDATE USING (auth.uid() = user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Table 3: stargazer_alter_session_summaries
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_alter_session_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  summary_date DATE NOT NULL,
  key_themes TEXT[] NOT NULL DEFAULT '{}',
  contradictions_discovered TEXT[] DEFAULT '{}',
  user_admissions TEXT[] DEFAULT '{}',
  resistance_points TEXT[] DEFAULT '{}',
  emotional_arc TEXT,
  deepest_moment TEXT,
  follow_up_hooks TEXT[] DEFAULT '{}',
  raw_message_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alter_summaries_user ON stargazer_alter_session_summaries (user_id, summary_date DESC);
CREATE UNIQUE INDEX idx_alter_summaries_session ON stargazer_alter_session_summaries (user_id, session_id);

ALTER TABLE stargazer_alter_session_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own summaries" ON stargazer_alter_session_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own summaries" ON stargazer_alter_session_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Alter stargazer_daily_states for free text
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$ BEGIN
  ALTER TABLE stargazer_daily_states ADD COLUMN IF NOT EXISTS free_text TEXT;
  ALTER TABLE stargazer_daily_states ADD COLUMN IF NOT EXISTS free_text_analysis JSONB;
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist yet, skip
  NULL;
END $$;
