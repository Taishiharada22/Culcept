-- MI Cross-session Convergence State — DB table
-- Design: lib/stargazer/miConvergenceEngine.ts ConvergenceState type
-- Date: 2026-04-04

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- stargazer_mi_convergence_state
-- セッション跨ぎの Micro Insight 収束状態を永続化する
-- signal_type × related_topic ごとに 1 行
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS stargazer_mi_convergence_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  signal_type text NOT NULL,
  related_topic text,  -- nullable: some signals have no topic

  -- セッション別履歴 { session_id: { signal_count, avg_strength, timestamps[] } }
  session_history jsonb NOT NULL DEFAULT '{}',
  total_sessions_with_signal int NOT NULL DEFAULT 0,

  -- トレンド分析結果
  trend text NOT NULL DEFAULT 'emerging' CHECK (trend IN ('emerging', 'strengthening', 'stable', 'weakening')),
  trend_confidence float NOT NULL DEFAULT 0,

  -- セッション跨ぎ連続性 0-1
  cross_session_continuity float NOT NULL DEFAULT 0,

  -- 最後の収束スコア (jsonb: ConvergenceScore)
  last_convergence_score jsonb,
  last_convergence_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- signal_type × related_topic per user で一意
  UNIQUE(user_id, signal_type, related_topic)
);

CREATE INDEX IF NOT EXISTS idx_mi_convergence_user ON stargazer_mi_convergence_state(user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RLS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE stargazer_mi_convergence_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own convergence state" ON stargazer_mi_convergence_state
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own convergence state" ON stargazer_mi_convergence_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own convergence state" ON stargazer_mi_convergence_state
  FOR UPDATE USING (auth.uid() = user_id);

-- service_role bypass for API route
CREATE POLICY "Service role full access mi_convergence_state" ON stargazer_mi_convergence_state
  FOR ALL USING (auth.role() = 'service_role');
