-- HDM Phase: Heart Dynamics Model v1 のフェーズ状態を stargazer_alter_growth に追加
-- Phase 0-5 の状態を JSONB で保持（manual gate / regression 追跡のため）

-- hdm_phase_state カラムを追加
ALTER TABLE stargazer_alter_growth
ADD COLUMN IF NOT EXISTS hdm_phase_state JSONB NOT NULL DEFAULT '{
  "currentPhase": 0,
  "lastTransitionAt": null,
  "manualOverride": null,
  "hardRegressionActive": false,
  "hardRegressionFloor": null
}'::jsonb;

-- コメント
COMMENT ON COLUMN stargazer_alter_growth.hdm_phase_state IS 'HDM Phase state: currentPhase (0-5), manual gate, regression tracking';

-- Phase 値でのインデックス（Phase 別のユーザー検索用）
CREATE INDEX IF NOT EXISTS idx_alter_growth_hdm_phase
ON stargazer_alter_growth ((hdm_phase_state->>'currentPhase'));
