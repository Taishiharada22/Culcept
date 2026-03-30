-- Alter Growth State table
-- Stores Alter's accumulated understanding of each user across sessions.
-- This enables world-class personalization that evolves over time.

CREATE TABLE IF NOT EXISTS stargazer_alter_growth (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  growth_state JSONB NOT NULL DEFAULT '{}',
  sessions_completed INTEGER NOT NULL DEFAULT 0,
  trust_level REAL NOT NULL DEFAULT 0,
  core_wound_confidence REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_alter_growth_sessions
  ON stargazer_alter_growth (sessions_completed DESC);

-- RLS: users can only read their own growth state
ALTER TABLE stargazer_alter_growth ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own growth state"
  ON stargazer_alter_growth FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all rows (for server-side updates)
CREATE POLICY "Service role manages growth state"
  ON stargazer_alter_growth FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE stargazer_alter_growth IS
  'Alter の成長状態。ユーザーごとの蓄積された理解（恐れ、価値観、成功した問い、失敗した問い等）を保持する。';
