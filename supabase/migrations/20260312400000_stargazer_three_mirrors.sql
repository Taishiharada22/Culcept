-- 20260312400000_stargazer_three_mirrors.sql
-- 三面鏡アーキテクチャ — Shadow Play回答 & Footprint集計 & ミラーメタデータ

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. stargazer_axis_snapshots に observation_layer = 'shadow_play' を追加
--    (既存テーブル。shadow_play layer は新しい値として使用)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 既存テーブルの observation_layer に 'shadow_play' を追加するためのインデックス
-- observation_layer は TEXT なので新しい値は自動的に許容される
CREATE INDEX IF NOT EXISTS idx_axis_snapshots_shadow_play
  ON stargazer_axis_snapshots (user_id, axis_id, created_at DESC)
  WHERE observation_layer = 'shadow_play';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. stargazer_shadow_play_shown — 影絵質問の出題・回答記録
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_shadow_play_shown (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shadow_play_id TEXT NOT NULL,           -- sp_proj_01 etc.
  shadow_play_type TEXT NOT NULL,         -- projection / third_party_view / meta_observation
  primary_axis TEXT NOT NULL,             -- 主軸
  option_id TEXT,                         -- 選択した選択肢ID（null = 未回答）
  score NUMERIC(4,3),                     -- 選択肢のスコア
  response_time_ms INT,
  shown_at DATE NOT NULL DEFAULT CURRENT_DATE,
  answered BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, shadow_play_id, shown_at)
);

CREATE INDEX IF NOT EXISTS idx_shadow_play_shown_user_recent
  ON stargazer_shadow_play_shown (user_id, shown_at DESC);

CREATE INDEX IF NOT EXISTS idx_shadow_play_shown_axis
  ON stargazer_shadow_play_shown (user_id, primary_axis);

-- RLS
ALTER TABLE stargazer_shadow_play_shown ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own shadow play records"
  ON stargazer_shadow_play_shown
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own shadow play records"
  ON stargazer_shadow_play_shown
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. stargazer_footprint_summaries — Footprint集計のサーバー側保存
--    (Footprint は主にclient-sideだが、定期的にサーバーに同期)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_footprint_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,              -- response_speed, hesitation_pattern, etc.
  average NUMERIC(10,4),                  -- 直近30日の平均値
  std_dev NUMERIC(10,4),                  -- 標準偏差
  sample_count INT NOT NULL DEFAULT 0,
  trend TEXT NOT NULL DEFAULT 'stable',   -- rising / falling / stable
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, signal_type, period_end)
);

CREATE INDEX IF NOT EXISTS idx_footprint_summaries_user
  ON stargazer_footprint_summaries (user_id, period_end DESC);

-- RLS
ALTER TABLE stargazer_footprint_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own footprint summaries"
  ON stargazer_footprint_summaries
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own footprint summaries"
  ON stargazer_footprint_summaries
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own footprint summaries"
  ON stargazer_footprint_summaries
  FOR UPDATE
  USING (auth.uid() = user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. stargazer_mirror_snapshots — ミラー統合スコアのスナップショット
--    三面鏡の各ミラーごとのスコアを時系列で記録
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS stargazer_mirror_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  axis_id TEXT NOT NULL,
  self_portrait_score NUMERIC(4,3),       -- 自画像スコア
  footprint_score NUMERIC(4,3),           -- 足跡スコア
  shadow_play_score NUMERIC(4,3),         -- 影絵スコア
  integrated_score NUMERIC(4,3),          -- 統合スコア
  divergence_type TEXT,                   -- all_aligned / self_vs_footprint / etc.
  divergence_magnitude NUMERIC(4,3),
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, axis_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_mirror_snapshots_user_date
  ON stargazer_mirror_snapshots (user_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_mirror_snapshots_divergent
  ON stargazer_mirror_snapshots (user_id, divergence_type)
  WHERE divergence_type IS NOT NULL AND divergence_type != 'all_aligned';

-- RLS
ALTER TABLE stargazer_mirror_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own mirror snapshots"
  ON stargazer_mirror_snapshots
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own mirror snapshots"
  ON stargazer_mirror_snapshots
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mirror snapshots"
  ON stargazer_mirror_snapshots
  FOR UPDATE
  USING (auth.uid() = user_id);
