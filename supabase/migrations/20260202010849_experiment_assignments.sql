-- experiment_assignments テーブル（存在しない場合のみ作成）
CREATE TABLE IF NOT EXISTS experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  variant TEXT NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(experiment_id, user_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_experiment_assignments_experiment
  ON experiment_assignments(experiment_id);
CREATE INDEX IF NOT EXISTS idx_experiment_assignments_user
  ON experiment_assignments(user_id);
