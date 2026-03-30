-- ============================================================
-- Partner 枠: Life Plan Profile + Relationship Process 永続化
--
-- Life Plan Vector (8次元) の質問回答と算出プロファイルを保存。
-- Relationship Process Vector (6次元) のキャッシュも保存。
-- Partner 3層統合スコアの結果もログとして保存。
-- ============================================================

-- ── Life Plan 質問回答 ──

CREATE TABLE IF NOT EXISTS partner_life_plan_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id   TEXT NOT NULL,
  value         SMALLINT NOT NULL,
  response_time_ms INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, question_id)
);

CREATE INDEX idx_partner_lp_responses_user
  ON partner_life_plan_responses(user_id);

COMMENT ON TABLE partner_life_plan_responses IS
  'Partner枠 Life Plan 質問への個別回答。user×question で UPSERT。';

-- ── Life Plan Profile (算出済みベクトル) ──

CREATE TABLE IF NOT EXISTS partner_life_plan_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  vector        JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence    JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_confidence REAL NOT NULL DEFAULT 0,
  response_count INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE partner_life_plan_profiles IS
  'Partner枠 Life Plan Vector (8次元)。回答から算出され、回答更新時に再計算。';
COMMENT ON COLUMN partner_life_plan_profiles.vector IS
  'LifePlanVector JSON: {financial_values: 0.0-1.0, career_family_balance: ..., ...}';
COMMENT ON COLUMN partner_life_plan_profiles.confidence IS
  'LifePlanConfidence JSON: 各軸の {responseCount, confidence, variance}';

-- ── Relationship Process Profile (キャッシュ) ──

CREATE TABLE IF NOT EXISTS partner_process_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  four_horsemen_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  conflict_style_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  bid_responsiveness REAL NOT NULL DEFAULT 0.5,
  growth_vs_destiny REAL NOT NULL DEFAULT 0.5,
  source_snapshot_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE partner_process_profiles IS
  'Stargazer 45軸から算出された関係プロセスプロファイル。Stargazer 更新時に再計算。';
COMMENT ON COLUMN partner_process_profiles.four_horsemen_profile IS
  'FourHorsemenProfile JSON: {criticismRisk, contemptRisk, defensivenessRisk, stonewallingRisk, overallRisk}';
COMMENT ON COLUMN partner_process_profiles.conflict_style_profile IS
  'ConflictStyleProfile JSON: {validator, volatile, avoider, primary}';

-- ── Partner スコアリングログ ──

CREATE TABLE IF NOT EXISTS partner_scoring_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES rendezvous_candidates(id) ON DELETE CASCADE,
  user_a        UUID NOT NULL REFERENCES auth.users(id),
  user_b        UUID NOT NULL REFERENCES auth.users(id),
  layer1_score  REAL NOT NULL,
  layer15_score REAL NOT NULL,
  layer2_score  REAL NOT NULL,
  total_score   REAL NOT NULL,
  process_vector JSONB,
  life_plan_fit  JSONB,
  guard_result   JSONB NOT NULL DEFAULT '{}'::jsonb,
  partner_reason_codes TEXT[] NOT NULL DEFAULT '{}',
  partner_caution_codes TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_scoring_candidate
  ON partner_scoring_logs(candidate_id);
CREATE INDEX idx_partner_scoring_users
  ON partner_scoring_logs(user_a, user_b);

COMMENT ON TABLE partner_scoring_logs IS
  'Partner 3層統合スコアリングの結果ログ。デバッグ・分析・AI学習に使用。';

-- ── Life Plan Profile 更新用 RPC ──

CREATE OR REPLACE FUNCTION upsert_life_plan_response(
  p_user_id UUID,
  p_question_id TEXT,
  p_value SMALLINT,
  p_response_time_ms INT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO partner_life_plan_responses (user_id, question_id, value, response_time_ms)
  VALUES (p_user_id, p_question_id, p_value, p_response_time_ms)
  ON CONFLICT (user_id, question_id)
  DO UPDATE SET
    value = EXCLUDED.value,
    response_time_ms = COALESCE(EXCLUDED.response_time_ms, partner_life_plan_responses.response_time_ms),
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION upsert_life_plan_response IS
  'Life Plan 質問回答を upsert。既存回答は上書き。';

-- ── RLS ──

ALTER TABLE partner_life_plan_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_life_plan_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_process_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_scoring_logs ENABLE ROW LEVEL SECURITY;

-- Life Plan Responses: 自分の回答のみ
CREATE POLICY "users_own_lp_responses"
  ON partner_life_plan_responses
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Life Plan Profiles: 自分のプロファイルのみ閲覧可能
CREATE POLICY "users_own_lp_profile"
  ON partner_life_plan_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- システムからのみ書き込み（SECURITY DEFINER の RPC 経由）
CREATE POLICY "system_write_lp_profile"
  ON partner_life_plan_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Process Profiles: 自分のプロファイルのみ
CREATE POLICY "users_own_process_profile"
  ON partner_process_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "system_write_process_profile"
  ON partner_process_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Scoring Logs: 関与するユーザーのみ閲覧可能
CREATE POLICY "users_own_scoring_logs"
  ON partner_scoring_logs
  FOR SELECT
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "system_write_scoring_logs"
  ON partner_scoring_logs
  FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- Partner Dealbreaker 拡張: rendezvous_profiles の profile_details に
-- 新フィールドを格納（JSONB なのでスキーマ変更不要）。
-- ただし、フィルタ用に生成カラム + インデックスを追加。
-- ============================================================

-- 喫煙ステータス（フィルタ用の生成カラム）
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS smoking_status TEXT
    GENERATED ALWAYS AS (
      CASE WHEN profile_details IS NOT NULL
        THEN profile_details->>'smokingStatus'
        ELSE NULL
      END
    ) STORED;

-- 喫煙許容度（フィルタ用の生成カラム）
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS smoking_tolerance TEXT
    GENERATED ALWAYS AS (
      CASE WHEN profile_details IS NOT NULL
        THEN profile_details->>'smokingTolerance'
        ELSE NULL
      END
    ) STORED;

-- 宗教（フィルタ用の生成カラム）
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS religion TEXT
    GENERATED ALWAYS AS (
      CASE WHEN profile_details IS NOT NULL
        THEN profile_details->>'religion'
        ELSE NULL
      END
    ) STORED;

-- 宗教重要度（フィルタ用の生成カラム）
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS religion_importance TEXT
    GENERATED ALWAYS AS (
      CASE WHEN profile_details IS NOT NULL
        THEN profile_details->>'religionImportance'
        ELSE NULL
      END
    ) STORED;

-- フィルタ用インデックス
CREATE INDEX IF NOT EXISTS idx_rendezvous_profiles_smoking
  ON rendezvous_profiles(smoking_status) WHERE smoking_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rendezvous_profiles_religion
  ON rendezvous_profiles(religion) WHERE religion IS NOT NULL;

COMMENT ON COLUMN rendezvous_profiles.smoking_status IS
  'Generated: profile_details.smokingStatus ("吸わない"|"たまに吸う"|"毎日吸う")';
COMMENT ON COLUMN rendezvous_profiles.religion IS
  'Generated: profile_details.religion ("なし"|"仏教"|"キリスト教"|"イスラム教"|"神道"|"その他")';
