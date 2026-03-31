-- ============================================================
-- Alter Understanding Phase 4: Narrative + Cross-Context
-- user_narrative と alter_hypothesis の絶対分離
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. stargazer_alter_narratives
--    ユーザーが自分について語った物語の記録。
--    「私は〜なタイプ」「昔から〜」等の自己定義的発言。
--    source は常に user_stated。Alter は書き込まない。
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stargazer_alter_narratives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL,
  content text NOT NULL,
  domain text CHECK (domain IN ('work', 'relationship', 'family', 'friendship', 'self', 'health', 'general')),
  mention_count int NOT NULL DEFAULT 1,
  first_mentioned timestamptz NOT NULL DEFAULT now(),
  last_mentioned timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, theme)
);

CREATE INDEX idx_narratives_user ON stargazer_alter_narratives(user_id);

ALTER TABLE stargazer_alter_narratives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "narratives_select" ON stargazer_alter_narratives
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "narratives_insert" ON stargazer_alter_narratives
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "narratives_update" ON stargazer_alter_narratives
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "narratives_delete" ON stargazer_alter_narratives
  FOR DELETE USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 2. stargazer_alter_hypotheses
--    Alter が蓄積パターンから導出した仮説。
--    user_narrative とは完全に分離。
--    status で仮説のライフサイクルを管理。
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stargazer_alter_hypotheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hypothesis_type text NOT NULL CHECK (hypothesis_type IN ('recurring_pattern', 'cross_context', 'growth_signal', 'contradiction_pattern')),
  content text NOT NULL,
  evidence_summary text NOT NULL,
  domains text[] NOT NULL DEFAULT '{}',
  confidence float NOT NULL DEFAULT 0.3 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'emerging' CHECK (status IN ('emerging', 'strengthening', 'stable', 'weakening', 'retired')),
  required_trust int NOT NULL DEFAULT 2 CHECK (required_trust >= 0 AND required_trust <= 4),
  last_evaluated timestamptz NOT NULL DEFAULT now(),
  presented_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, hypothesis_type, content)
);

CREATE INDEX idx_hypotheses_user ON stargazer_alter_hypotheses(user_id);
CREATE INDEX idx_hypotheses_active ON stargazer_alter_hypotheses(user_id, status)
  WHERE status IN ('emerging', 'strengthening', 'stable');

ALTER TABLE stargazer_alter_hypotheses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hypotheses_select" ON stargazer_alter_hypotheses
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "hypotheses_insert" ON stargazer_alter_hypotheses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "hypotheses_update" ON stargazer_alter_hypotheses
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "hypotheses_delete" ON stargazer_alter_hypotheses
  FOR DELETE USING (auth.uid() = user_id);
