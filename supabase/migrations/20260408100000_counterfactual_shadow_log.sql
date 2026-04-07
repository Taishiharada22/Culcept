-- P4-6.5: stargazer_counterfactual_shadow_log
-- Counterfactual simulation の発火・安全判定・統合判定を記録する
-- canary 監査の6指標（発火率/rejected率/フォールバック率/latency/rupture/違和感）の
-- データソースとなる

CREATE TABLE IF NOT EXISTS stargazer_counterfactual_shadow_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  perspective   text NOT NULL,              -- "alternative_part" | "other_party"
  source_part   text,                       -- gate で特定された parts 起点
  shift_direction text,                     -- "less_guarded" | "more_composed" | "more_boundaried" | "unknown"
  safe          boolean NOT NULL DEFAULT true,
  decision      text NOT NULL,              -- "adopted" | "weakened" | "rejected" | "rejected_post_check"
  violation_types text[] DEFAULT '{}',      -- 検出された violation type の配列
  latency_ms    integer DEFAULT 0,          -- micro-LLM 呼び出し所要時間
  candidate_length integer DEFAULT 0,       -- 候補テキストの長さ
  candidate_text_preview text,              -- safe なら先頭80文字、unsafe なら "[REDACTED]"
  live_integrated boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- インデックス: canary 監査クエリ用
CREATE INDEX idx_cf_shadow_user     ON stargazer_counterfactual_shadow_log(user_id);
CREATE INDEX idx_cf_shadow_decision ON stargazer_counterfactual_shadow_log(decision);
CREATE INDEX idx_cf_shadow_created  ON stargazer_counterfactual_shadow_log(created_at DESC);

-- RLS: ユーザーは自分のログのみ参照可能（管理者はサービスキーで全参照）
ALTER TABLE stargazer_counterfactual_shadow_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own shadow logs"
  ON stargazer_counterfactual_shadow_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Insert は API サーバー（service_role）経由のみ。ユーザー直接 insert 不可
CREATE POLICY "Service role can insert shadow logs"
  ON stargazer_counterfactual_shadow_log
  FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE stargazer_counterfactual_shadow_log IS
  'P4 counterfactual simulation: 発火ログ・安全判定・統合判定・post-check結果';
