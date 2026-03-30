-- Origin Journal entries table
-- Stores daily journal entries with emotion tags, task references, and AI summaries

CREATE TABLE IF NOT EXISTS origin_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  title TEXT DEFAULT '',
  body TEXT DEFAULT '',
  voice_transcript TEXT,
  emotion_tags TEXT[] DEFAULT '{}',
  tomorrow_note TEXT,
  inner_weather_ref JSONB,
  completed_task_ids TEXT[] DEFAULT '{}',
  body_memo TEXT,
  shadow_text TEXT,
  ai_summary TEXT,
  forecast_result JSONB,
  surprise_observation JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, date)
);

-- RLS
ALTER TABLE origin_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own journal entries"
  ON origin_journal_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own journal entries"
  ON origin_journal_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own journal entries"
  ON origin_journal_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own journal entries"
  ON origin_journal_entries FOR DELETE
  USING (auth.uid() = user_id);

-- Index for efficient date-range queries
CREATE INDEX idx_origin_journal_user_date ON origin_journal_entries(user_id, date DESC);

-- Add body_snapshot column to Inner Weather
ALTER TABLE stargazer_inner_weather
  ADD COLUMN IF NOT EXISTS body_snapshot JSONB;

COMMENT ON COLUMN stargazer_inner_weather.body_snapshot IS 'Optional somatic snapshot: {head?: "heavy"|"light"|"foggy", chest?: "tight"|"open"|"normal"}';
