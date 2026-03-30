-- Stargazer Scoring Engine Upgrade
-- ベイズ軸更新 + 回答時間 + 質問弁別力 + 重みキャリブレーション
-- 全て ADD COLUMN / CREATE TABLE — 既存データに影響なし

-- 1. stargazer_profiles にベイズ信念と回答時間ベースラインを追加
ALTER TABLE stargazer_profiles
  ADD COLUMN IF NOT EXISTS axis_beliefs JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS median_response_time_ms INTEGER DEFAULT 5000;

COMMENT ON COLUMN stargazer_profiles.axis_beliefs IS 'ベイズ共役ガウス更新の軸別信念 {axisId: {mu, precision}}';
COMMENT ON COLUMN stargazer_profiles.median_response_time_ms IS 'ユーザー個人の回答時間中央値 (ms)';

-- 2. stargazer_question_pool に弁別力パラメータを追加
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stargazer_question_pool') THEN
    ALTER TABLE stargazer_question_pool
      ADD COLUMN IF NOT EXISTS response_variance REAL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS axis_correlation REAL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS median_response_time_ms INTEGER DEFAULT 5000,
      ADD COLUMN IF NOT EXISTS user_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- 3. 重みキャリブレーションテーブル（週次 cron で更新）
CREATE TABLE IF NOT EXISTS stargazer_weight_calibration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  axis_id TEXT NOT NULL,
  weight_type TEXT NOT NULL DEFAULT 'axis',
  calibrated_value REAL NOT NULL DEFAULT 1.0,
  signals JSONB DEFAULT '{}',
  calibration_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(axis_id, weight_type, calibration_date)
);

CREATE INDEX IF NOT EXISTS idx_weight_calibration_axis_date
  ON stargazer_weight_calibration(axis_id, calibration_date DESC);

COMMENT ON TABLE stargazer_weight_calibration IS '軸重みのキャリブレーション結果（週次更新）';
