-- TASK-5d: ImplicitSignal テーブル
-- 会話から暗黙的に検出されたシグナルを蓄積し、
-- 一定パターンで MicroInsight へ昇格させる。

CREATE TABLE IF NOT EXISTS stargazer_implicit_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  session_id text NOT NULL,
  signal_type text NOT NULL,        -- avoidance|elaboration|deflection|hesitation|topic_shift|strong_affect
  related_axis text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.5,
  promoted_to_insight boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ユーザー × 軸 × シグナルタイプでの検索を高速化
CREATE INDEX idx_implicit_signals_user_axis
  ON stargazer_implicit_signals(user_id, related_axis, signal_type);

-- セッション別の検索
CREATE INDEX idx_implicit_signals_session
  ON stargazer_implicit_signals(user_id, session_id);

-- RLS
ALTER TABLE stargazer_implicit_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own implicit signals"
  ON stargazer_implicit_signals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own implicit signals"
  ON stargazer_implicit_signals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own implicit signals"
  ON stargazer_implicit_signals FOR UPDATE
  USING (auth.uid() = user_id);

-- データ寿命管理用ビュー（手動クリーンアップの参照用）
-- promoted_to_insight = true かつ 30日経過 → DELETE
-- confidence < 0.3 かつ 14日経過 → DELETE
-- promoted_to_insight = false かつ 90日経過 → DELETE
-- 同一 user × 同一 axis × 同一 type が 50件超 → 古い方から DELETE（最新30件を残す）
COMMENT ON TABLE stargazer_implicit_signals IS
  'Implicit signals detected from conversation behavior. Lifecycle: promoted+30d, low-conf+14d, unpromoted+90d → DELETE. Cap: 50 per user×axis×type.';
