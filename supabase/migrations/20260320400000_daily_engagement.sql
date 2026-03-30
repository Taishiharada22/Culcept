-- ============================================================
-- Phase 4: リテンションエンジン
-- Daily Resonance + 分身成長日記
-- ============================================================

-- Daily Resonance（日次共鳴）
CREATE TABLE IF NOT EXISTS rendezvous_daily_resonances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resonance_date date NOT NULL,
  resonance_text text NOT NULL,
  resonance_subtext text,
  source_type text NOT NULL, -- viewing_pattern, swipe_pattern, time_pattern, etc.
  source_signals jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, resonance_date)
);

CREATE INDEX idx_daily_resonances_user_date ON rendezvous_daily_resonances(user_id, resonance_date DESC);

-- 分身成長日記
CREATE TABLE IF NOT EXISTS rendezvous_avatar_diary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  diary_date date NOT NULL,
  entry_text text NOT NULL,
  personality_voice text NOT NULL DEFAULT 'contemplative', -- curious, contemplative, warm, surprised, protective
  source_signal text NOT NULL DEFAULT 'idle',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, diary_date)
);

CREATE INDEX idx_avatar_diary_user_date ON rendezvous_avatar_diary(user_id, diary_date DESC);

-- RLS
ALTER TABLE rendezvous_daily_resonances ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendezvous_avatar_diary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily resonances"
  ON rendezvous_daily_resonances FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access daily resonances"
  ON rendezvous_daily_resonances FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own avatar diary"
  ON rendezvous_avatar_diary FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access avatar diary"
  ON rendezvous_avatar_diary FOR ALL
  USING (auth.role() = 'service_role');
