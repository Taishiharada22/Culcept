-- Stargazer Human OS: Self vs Oracle + Decision Engine + Daily Intervention
-- 2026-03-27

-- ============================================================
-- 1. Self vs Oracle: 毎日の予測対決
-- ============================================================

CREATE TABLE IF NOT EXISTS stargazer_self_vs_oracle_challenges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_date DATE NOT NULL,
  scenarios JSONB NOT NULL DEFAULT '[]',
  -- scenarios: [{ id, situation, options: [{id, label, description}],
  --   oraclePrediction, oracleReason, category }]
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'user_predicted', 'revealed', 'verified')),
  user_predictions JSONB, -- [{ scenarioId, optionId }]
  actual_outcomes JSONB,  -- [{ scenarioId, optionId }]
  oracle_correct_count INTEGER,
  user_correct_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, challenge_date)
);

-- 2. Self-Accuracy Score: 自己認識精度の蓄積
CREATE TABLE IF NOT EXISTS stargazer_self_accuracy_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score_date DATE NOT NULL,
  sas_score NUMERIC(5,2) NOT NULL, -- 0.00-100.00
  sas_level TEXT NOT NULL
    CHECK (sas_level IN ('fog', 'dawn', 'moonlight', 'starry', 'telescope', 'supernova')),
  oracle_accuracy NUMERIC(5,2),
  gap NUMERIC(5,2), -- user - oracle
  streak_days INTEGER DEFAULT 0,
  total_challenges INTEGER DEFAULT 0,
  category_breakdown JSONB, -- { social: { userAcc, oracleAcc }, ... }
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, score_date)
);

-- 3. Decision Engine: 意思決定ログ
CREATE TABLE IF NOT EXISTS stargazer_decision_engine_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_date DATE NOT NULL,
  decision_type TEXT NOT NULL
    CHECK (decision_type IN ('social', 'reply', 'priority', 'rest', 'purchase', 'career', 'relationship', 'other')),
  question TEXT NOT NULL,
  options JSONB NOT NULL, -- ["行く", "行かない"]
  context TEXT,
  urgency TEXT CHECK (urgency IN ('low', 'medium', 'high')),
  -- シミュレーション結果
  simulations JSONB NOT NULL, -- DecisionSimulation[]
  recommended_option TEXT,    -- 推奨選択肢（nullなら保留）
  withheld BOOLEAN DEFAULT FALSE,
  withheld_reason TEXT,
  blind_spot_warning TEXT,
  overall_uncertainty NUMERIC(3,2),
  -- 現在の状態スナップショット
  state_snapshot JSONB, -- { socialBattery, cognitiveLoad, energyLevel, stressLevel }
  -- フィードバック（後で記録）
  actual_choice TEXT,
  regretted BOOLEAN,
  feedback_note TEXT,
  feedback_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Daily Intervention: 1日の介入ログ
CREATE TABLE IF NOT EXISTS stargazer_daily_interventions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intervention_date DATE NOT NULL,
  phase TEXT NOT NULL
    CHECK (phase IN ('morning', 'noon', 'evening', 'night')),
  -- 状態推定
  estimated_state JSONB NOT NULL,
  -- { energy, socialBattery, cognitiveLoad, stress }
  vulnerability_score NUMERIC(2,1), -- 0.0-5.0
  vulnerability_factors JSONB, -- ["矛盾スコア高", "社交バッテリー低"]
  -- 介入内容
  message TEXT NOT NULL,
  suggestions JSONB, -- ["15分の回復時間を確保する"]
  warnings JSONB,    -- ["社交バッテリーが閾値以下"]
  -- ユーザーの反応
  viewed BOOLEAN DEFAULT FALSE,
  viewed_at TIMESTAMPTZ,
  helpful_rating INTEGER CHECK (helpful_rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, intervention_date, phase)
);

-- 5. 反応パターン言い当てログ
CREATE TABLE IF NOT EXISTS stargazer_reaction_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_date DATE NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('self_deception', 'hidden_trigger', 'defense_pattern',
                        'contradiction', 'blind_spot', 'cycle')),
  situation TEXT NOT NULL,
  reaction TEXT NOT NULL,
  hidden_reason TEXT NOT NULL,
  self_image TEXT NOT NULL,
  evidence JSONB NOT NULL,
  confidence NUMERIC(3,2),
  novelty NUMERIC(3,2),
  -- フィードバック
  user_reaction TEXT CHECK (user_reaction IN ('resonated', 'surprised', 'denied', 'reflected')),
  feedback_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, pattern_date)
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_svo_challenges_user_date
  ON stargazer_self_vs_oracle_challenges(user_id, challenge_date DESC);

CREATE INDEX IF NOT EXISTS idx_sas_scores_user_date
  ON stargazer_self_accuracy_scores(user_id, score_date DESC);

CREATE INDEX IF NOT EXISTS idx_decision_logs_user_date
  ON stargazer_decision_engine_logs(user_id, decision_date DESC);

CREATE INDEX IF NOT EXISTS idx_decision_logs_user_type
  ON stargazer_decision_engine_logs(user_id, decision_type);

CREATE INDEX IF NOT EXISTS idx_daily_interventions_user_date_phase
  ON stargazer_daily_interventions(user_id, intervention_date, phase);

CREATE INDEX IF NOT EXISTS idx_reaction_patterns_user_date
  ON stargazer_reaction_patterns(user_id, pattern_date DESC);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE stargazer_self_vs_oracle_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_self_accuracy_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_decision_engine_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_daily_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_reaction_patterns ENABLE ROW LEVEL SECURITY;

-- Self vs Oracle
CREATE POLICY "Users can view own challenges"
  ON stargazer_self_vs_oracle_challenges FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own challenges"
  ON stargazer_self_vs_oracle_challenges FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own challenges"
  ON stargazer_self_vs_oracle_challenges FOR UPDATE
  USING (auth.uid() = user_id);

-- SAS Scores
CREATE POLICY "Users can view own SAS"
  ON stargazer_self_accuracy_scores FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own SAS"
  ON stargazer_self_accuracy_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Decision Engine
CREATE POLICY "Users can view own decisions"
  ON stargazer_decision_engine_logs FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own decisions"
  ON stargazer_decision_engine_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own decisions"
  ON stargazer_decision_engine_logs FOR UPDATE
  USING (auth.uid() = user_id);

-- Daily Interventions
CREATE POLICY "Users can view own interventions"
  ON stargazer_daily_interventions FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own interventions"
  ON stargazer_daily_interventions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own interventions"
  ON stargazer_daily_interventions FOR UPDATE
  USING (auth.uid() = user_id);

-- Reaction Patterns
CREATE POLICY "Users can view own patterns"
  ON stargazer_reaction_patterns FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own patterns"
  ON stargazer_reaction_patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own patterns"
  ON stargazer_reaction_patterns FOR UPDATE
  USING (auth.uid() = user_id);
