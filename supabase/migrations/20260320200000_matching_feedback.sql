-- ============================================================
-- Phase 2: 適応的ウェイト学習 + フィードバックループ
-- スワイプ結果記録・マッチ結果追跡・A/Bテスト基盤
-- ============================================================

-- スワイプ結果（like/pass/save 時に記録）
CREATE TABLE IF NOT EXISTS rendezvous_swipe_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('like', 'pass', 'save', 'mute')),
  viewing_duration_ms int,
  scroll_depth real CHECK (scroll_depth IS NULL OR (scroll_depth >= 0 AND scroll_depth <= 1)),
  category text NOT NULL,
  score_at_swipe real,
  dimensions_at_swipe jsonb, -- スワイプ時の各次元スコアのスナップショット
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_swipe_outcomes_user_time ON rendezvous_swipe_outcomes(user_id, created_at DESC);
CREATE INDEX idx_swipe_outcomes_candidate ON rendezvous_swipe_outcomes(candidate_id);

-- マッチ結果（関係の成果を追跡）
CREATE TABLE IF NOT EXISTS rendezvous_match_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE,
  outcome text NOT NULL CHECK (outcome IN ('chat_active', 'chat_dead', 'graduated', 'blocked', 'expired')),
  chat_message_count int NOT NULL DEFAULT 0,
  relationship_duration_days int NOT NULL DEFAULT 0,
  user_satisfaction_a real CHECK (user_satisfaction_a IS NULL OR (user_satisfaction_a >= 0 AND user_satisfaction_a <= 1)),
  user_satisfaction_b real CHECK (user_satisfaction_b IS NULL OR (user_satisfaction_b >= 0 AND user_satisfaction_b <= 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_match_outcomes_outcome ON rendezvous_match_outcomes(outcome);

-- A/Bテスト実験設定
CREATE TABLE IF NOT EXISTS rendezvous_weight_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  weight_config jsonb NOT NULL, -- { vector: 0.28, stargazer: 0.20, ... }
  is_active boolean NOT NULL DEFAULT false,
  sample_percent real NOT NULL DEFAULT 0.1 CHECK (sample_percent > 0 AND sample_percent <= 1),
  metrics jsonb DEFAULT '{}', -- 集計結果
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_weight_experiments_active ON rendezvous_weight_experiments(is_active) WHERE is_active = true;

-- パーソナライズドウェイト（ユーザー別学習結果）
CREATE TABLE IF NOT EXISTS rendezvous_personalized_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  category text NOT NULL,
  weights jsonb NOT NULL, -- CategoryWeights
  swipe_count int NOT NULL DEFAULT 0,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_personalized_weights_user ON rendezvous_personalized_weights(user_id);

-- RLS
ALTER TABLE rendezvous_swipe_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendezvous_match_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendezvous_weight_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendezvous_personalized_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own swipe outcomes"
  ON rendezvous_swipe_outcomes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own swipe outcomes"
  ON rendezvous_swipe_outcomes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access swipe outcomes"
  ON rendezvous_swipe_outcomes FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access match outcomes"
  ON rendezvous_match_outcomes FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access weight experiments"
  ON rendezvous_weight_experiments FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own personalized weights"
  ON rendezvous_personalized_weights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access personalized weights"
  ON rendezvous_personalized_weights FOR ALL
  USING (auth.role() = 'service_role');
