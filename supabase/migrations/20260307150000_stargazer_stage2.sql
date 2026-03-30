-- Stargazer Stage 2: Neural Deep Probe スキーマ拡張
-- Stage 1 多肢選択 + Stage 2 分岐プローブの回答・進捗を保存

-- stargazer_observations に stage カラムを追加
ALTER TABLE stargazer_observations
  ADD COLUMN IF NOT EXISTS answer_value JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT NULL;

-- stargazer_profiles に stage_progress カラムを追加
ALTER TABLE stargazer_profiles
  ADD COLUMN IF NOT EXISTS stage_progress JSONB DEFAULT '{"stage":"none"}';

-- stargazer_resolved_types に stage2_data カラムを追加
ALTER TABLE stargazer_resolved_types
  ADD COLUMN IF NOT EXISTS stage2_data JSONB DEFAULT NULL;

-- stage カラムにインデックスを追加（ステージ別クエリ用）
CREATE INDEX IF NOT EXISTS idx_stargazer_observations_stage
  ON stargazer_observations (user_id, stage);
