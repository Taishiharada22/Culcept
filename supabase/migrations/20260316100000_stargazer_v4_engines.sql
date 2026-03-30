-- 20260316100000_stargazer_v4_engines.sql
-- Stargazer v4: Self-Decoding Engine
-- 盲点ドロップ・予言・未踏地図・内的天気・ゴースト共鳴・分身対話・決断オラクル・心理署名・予測精度

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. stargazer_blind_spot_drops — 盲点ドロップ通知
--    三面鏡乖離などから検出した盲点をドロップとして配信
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_blind_spot_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drop_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tone TEXT NOT NULL CHECK (tone IN ('warm', 'harsh', 'neutral', 'poetic', 'clinical')),
  category TEXT NOT NULL CHECK (category IN ('mirror_gap', 'contradiction', 'pattern_blind', 'shadow_leak', 'defense_exposure', 'stability_illusion', 'condition_blind')),
  content_title TEXT NOT NULL,
  content_body TEXT NOT NULL,
  content_hint TEXT,
  source_axes TEXT[],
  mirror_divergence JSONB,
  intensity FLOAT CHECK (intensity >= 0 AND intensity <= 1),
  delivery_hour INT CHECK (delivery_hour >= 0 AND delivery_hour <= 23),
  reaction TEXT CHECK (reaction IN ('resonated', 'surprised', 'denied', 'reflected')),
  reacted_at TIMESTAMPTZ,
  depth_phase TEXT CHECK (depth_phase IN ('seedling', 'sprout', 'growth', 'deep', 'veteran')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, drop_date)
);

CREATE INDEX idx_blind_spot_drops_user_date
  ON stargazer_blind_spot_drops (user_id, delivered_at DESC);

CREATE INDEX idx_blind_spot_drops_date
  ON stargazer_blind_spot_drops (user_id, drop_date DESC);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. stargazer_daily_prophecies — 日次予言
--    ユーザーの行動・感情パターンから翌日の予言を生成
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_daily_prophecies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prophecy_date DATE NOT NULL,
  prediction_text TEXT NOT NULL,
  prediction_category TEXT NOT NULL CHECK (prediction_category IN ('decision', 'emotion', 'social', 'energy', 'avoidance', 'impulse')),
  prediction_confidence FLOAT CHECK (prediction_confidence >= 0 AND prediction_confidence <= 1),
  prediction_basis JSONB,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'exact', 'close', 'partial', 'off', 'opposite', 'skipped')),
  user_verification_text TEXT,
  verified_at TIMESTAMPTZ,
  accuracy_score FLOAT CHECK (accuracy_score >= 0 AND accuracy_score <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, prophecy_date)
);

CREATE INDEX idx_daily_prophecies_user_date
  ON stargazer_daily_prophecies (user_id, prophecy_date DESC);

CREATE INDEX idx_daily_prophecies_verification
  ON stargazer_daily_prophecies (user_id, verification_status)
  WHERE verification_status = 'pending';

CREATE INDEX idx_daily_prophecies_basis
  ON stargazer_daily_prophecies USING GIN (prediction_basis)
  WHERE prediction_basis IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. stargazer_unseen_map — 未踏地図
--    各軸の探索深度を管理し、未知の領域を可視化
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_unseen_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  axis_key TEXT NOT NULL,
  depth_level INT NOT NULL DEFAULT 0 CHECK (depth_level >= 0 AND depth_level <= 5),
  unlocked_at TIMESTAMPTZ,
  evidence_count INT NOT NULL DEFAULT 0,
  last_observation_at TIMESTAMPTZ,
  adjacent_revealed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, axis_key)
);

CREATE INDEX idx_unseen_map_user
  ON stargazer_unseen_map (user_id);

CREATE INDEX idx_unseen_map_user_depth
  ON stargazer_unseen_map (user_id, depth_level);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. stargazer_inner_weather — 内的天気
--    ユーザーの内面状態を天気メタファーで記録・追跡
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_inner_weather (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weather_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  weather_type TEXT NOT NULL CHECK (weather_type IN ('sunny', 'cloudy', 'rainy', 'stormy', 'foggy', 'windy', 'snow', 'aurora')),
  energy_level FLOAT CHECK (energy_level >= 0 AND energy_level <= 1),
  stress_level FLOAT CHECK (stress_level >= 0 AND stress_level <= 1),
  emotional_tone TEXT CHECK (emotional_tone IN ('calm', 'excited', 'anxious', 'melancholic', 'joyful', 'numb', 'conflicted')),
  social_battery FLOAT CHECK (social_battery >= 0 AND social_battery <= 1),
  stability FLOAT CHECK (stability >= 0 AND stability <= 1),
  defense_active BOOLEAN NOT NULL DEFAULT false,
  defense_type TEXT,
  defense_confidence FLOAT CHECK (defense_confidence >= 0 AND defense_confidence <= 1),
  pressure_points JSONB,
  weather_report TEXT,
  forecast JSONB,
  pattern_interrupt_triggered BOOLEAN NOT NULL DEFAULT false,
  pattern_interrupt_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inner_weather_user_date
  ON stargazer_inner_weather (user_id, recorded_at DESC);

CREATE INDEX idx_inner_weather_pressure
  ON stargazer_inner_weather USING GIN (pressure_points)
  WHERE pressure_points IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. stargazer_ghost_resonance — ゴースト共鳴
--    匿名化されたパターン類似ユーザーからのインサイト配信
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_ghost_resonance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resonance_date DATE NOT NULL,
  ghost_pattern_hash TEXT NOT NULL,
  pattern_name TEXT,
  category TEXT CHECK (category IN ('discovery', 'struggle', 'breakthrough', 'pattern', 'mirror', 'wound', 'season', 'echo')),
  ghost_insight TEXT NOT NULL,
  resonance_context TEXT,
  pattern_similarity FLOAT CHECK (pattern_similarity >= 0 AND pattern_similarity <= 1),
  ghost_population INT DEFAULT 0,
  user_reaction TEXT CHECK (user_reaction IN ('curious', 'indifferent', 'resonated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ghost_resonance_user_date
  ON stargazer_ghost_resonance (user_id, resonance_date DESC);

CREATE INDEX idx_ghost_resonance_pattern
  ON stargazer_ghost_resonance (ghost_pattern_hash);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. stargazer_alter_dialogues — 分身対話
--    ユーザーと alter ego の対話セッション記録
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_alter_dialogues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('alter', 'user', 'system')),
  message TEXT NOT NULL,
  alter_mode TEXT CHECK (alter_mode IN ('warm', 'provocative', 'analytical')),
  insight TEXT,
  emotional_context JSONB,
  turn_number INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alter_dialogues_user_session
  ON stargazer_alter_dialogues (user_id, session_id, created_at);

CREATE INDEX idx_alter_dialogues_emotional_context
  ON stargazer_alter_dialogues USING GIN (emotional_context)
  WHERE emotional_context IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. stargazer_decision_oracle — 決断オラクル
--    ユーザーの意思決定を予測し、実際の選択と比較
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_decision_oracle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_question TEXT NOT NULL,
  decision_options JSONB,
  decision_context TEXT,
  predicted_choice TEXT NOT NULL,
  predicted_reason TEXT NOT NULL,
  predicted_confidence FLOAT CHECK (predicted_confidence >= 0 AND predicted_confidence <= 1),
  shadow_choice TEXT,
  shadow_reason TEXT,
  ideal_choice TEXT,
  ideal_reason TEXT,
  narrative TEXT,
  decision_tendency TEXT,
  actual_choice TEXT,
  prediction_correct BOOLEAN,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_decision_oracle_user_date
  ON stargazer_decision_oracle (user_id, created_at DESC);

CREATE INDEX idx_decision_oracle_verified
  ON stargazer_decision_oracle (user_id, prediction_correct)
  WHERE prediction_correct IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. stargazer_psyche_signature — 心理署名
--    週次/月次/年次の内面パターンをビジュアル指紋として記録
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_psyche_signature (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signature_type TEXT NOT NULL CHECK (signature_type IN ('weekly', 'monthly', 'yearly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  signature_data JSONB NOT NULL,
  highlights JSONB,
  share_token TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_psyche_signature_user_period
  ON stargazer_psyche_signature (user_id, signature_type, period_end DESC);

CREATE INDEX idx_psyche_signature_share
  ON stargazer_psyche_signature (share_token)
  WHERE share_token IS NOT NULL;

CREATE INDEX idx_psyche_signature_data
  ON stargazer_psyche_signature USING GIN (signature_data);

CREATE INDEX idx_psyche_signature_highlights
  ON stargazer_psyche_signature USING GIN (highlights)
  WHERE highlights IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 9. stargazer_prediction_accuracy — 予測精度トラッキング
--    予言・オラクルの累計精度を管理
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_prediction_accuracy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_predictions INT NOT NULL DEFAULT 0,
  correct_predictions INT NOT NULL DEFAULT 0,
  partial_predictions INT NOT NULL DEFAULT 0,
  accuracy_percentage FLOAT NOT NULL DEFAULT 0 CHECK (accuracy_percentage >= 0 AND accuracy_percentage <= 100),
  category_accuracy JSONB,
  streak_current INT NOT NULL DEFAULT 0,
  streak_best INT NOT NULL DEFAULT 0,
  trend TEXT CHECK (trend IN ('rising', 'falling', 'stable')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX idx_prediction_accuracy_user_date
  ON stargazer_prediction_accuracy (user_id, calculated_at DESC);

CREATE INDEX idx_prediction_accuracy_category
  ON stargazer_prediction_accuracy USING GIN (category_accuracy)
  WHERE category_accuracy IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RLS Policies
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE stargazer_blind_spot_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_daily_prophecies ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_unseen_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_inner_weather ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_ghost_resonance ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_alter_dialogues ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_decision_oracle ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_psyche_signature ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_prediction_accuracy ENABLE ROW LEVEL SECURITY;

-- ── blind_spot_drops ──
CREATE POLICY "Users can read own blind spot drops"
  ON stargazer_blind_spot_drops FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own blind spot drops"
  ON stargazer_blind_spot_drops FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own blind spot drops"
  ON stargazer_blind_spot_drops FOR UPDATE
  USING (auth.uid() = user_id);

-- ── daily_prophecies ──
CREATE POLICY "Users can read own prophecies"
  ON stargazer_daily_prophecies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prophecies"
  ON stargazer_daily_prophecies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prophecies"
  ON stargazer_daily_prophecies FOR UPDATE
  USING (auth.uid() = user_id);

-- ── unseen_map ──
CREATE POLICY "Users can read own unseen map"
  ON stargazer_unseen_map FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own unseen map"
  ON stargazer_unseen_map FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own unseen map"
  ON stargazer_unseen_map FOR UPDATE
  USING (auth.uid() = user_id);

-- ── inner_weather ──
CREATE POLICY "Users can read own inner weather"
  ON stargazer_inner_weather FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own inner weather"
  ON stargazer_inner_weather FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own inner weather"
  ON stargazer_inner_weather FOR UPDATE
  USING (auth.uid() = user_id);

-- ── ghost_resonance ──
-- Users can read their own resonance records
CREATE POLICY "Users can read own ghost resonance"
  ON stargazer_ghost_resonance FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ghost resonance"
  ON stargazer_ghost_resonance FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ghost resonance"
  ON stargazer_ghost_resonance FOR UPDATE
  USING (auth.uid() = user_id);

-- Ghost resonance: allow reading anonymized patterns from other users
-- Only ghost_insight and pattern_similarity are exposed; user_id is NOT the reader's
CREATE POLICY "Users can read anonymized ghost patterns"
  ON stargazer_ghost_resonance FOR SELECT
  USING (true);

-- ── alter_dialogues ──
CREATE POLICY "Users can read own alter dialogues"
  ON stargazer_alter_dialogues FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alter dialogues"
  ON stargazer_alter_dialogues FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── decision_oracle ──
CREATE POLICY "Users can read own decision oracle"
  ON stargazer_decision_oracle FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own decision oracle"
  ON stargazer_decision_oracle FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own decision oracle"
  ON stargazer_decision_oracle FOR UPDATE
  USING (auth.uid() = user_id);

-- ── psyche_signature ──
CREATE POLICY "Users can read own psyche signatures"
  ON stargazer_psyche_signature FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own psyche signatures"
  ON stargazer_psyche_signature FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow reading shared signatures by share_token (public sharing)
CREATE POLICY "Anyone can read shared psyche signatures"
  ON stargazer_psyche_signature FOR SELECT
  USING (share_token IS NOT NULL);

-- ── prediction_accuracy ──
CREATE POLICY "Users can read own prediction accuracy"
  ON stargazer_prediction_accuracy FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prediction accuracy"
  ON stargazer_prediction_accuracy FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prediction accuracy"
  ON stargazer_prediction_accuracy FOR UPDATE
  USING (auth.uid() = user_id);
