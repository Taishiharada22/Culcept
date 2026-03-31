-- ============================================================
-- Alter Understanding Phase 2: 継続的理解の厚み
-- 3テーブル: context / patterns / reactions
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. stargazer_alter_context
--    Life Context の永続化。人物・環境・感情・生活段階。
--    Phase 1 の fire-and-forget 保存を、照合+蓄積可能な構造へ。
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stargazer_alter_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('person', 'environment', 'emotion', 'life_stage')),
  content text NOT NULL,
  source text NOT NULL CHECK (source IN ('user_stated', 'user_implied', 'behavior_observed', 'alter_inferred', 'contradicted')),
  temporality text NOT NULL CHECK (temporality IN ('momentary', 'situational', 'persistent', 'structural')),
  confidence float NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count int NOT NULL DEFAULT 1,
  last_confirmed timestamptz NOT NULL DEFAULT now(),
  possibly_stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alter_context_user ON stargazer_alter_context(user_id);
CREATE INDEX idx_alter_context_active ON stargazer_alter_context(user_id, possibly_stale) WHERE possibly_stale = false;

ALTER TABLE stargazer_alter_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alter_context_select" ON stargazer_alter_context
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "alter_context_insert" ON stargazer_alter_context
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alter_context_update" ON stargazer_alter_context
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "alter_context_delete" ON stargazer_alter_context
  FOR DELETE USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 2. stargazer_alter_patterns
--    判断傾向・状態パターン・反応パターンの蓄積。
--    pattern_type + pattern_key でユニーク。
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stargazer_alter_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_type text NOT NULL CHECK (pattern_type IN ('decision', 'state', 'response', 'micro_signal')),
  pattern_key text NOT NULL,
  observation_count int NOT NULL DEFAULT 1,
  pattern_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence float NOT NULL DEFAULT 0.3 CHECK (confidence >= 0 AND confidence <= 1),
  last_observed timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pattern_type, pattern_key)
);

CREATE INDEX idx_alter_patterns_user ON stargazer_alter_patterns(user_id);
CREATE INDEX idx_alter_patterns_lookup ON stargazer_alter_patterns(user_id, pattern_type);

ALTER TABLE stargazer_alter_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alter_patterns_select" ON stargazer_alter_patterns
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "alter_patterns_insert" ON stargazer_alter_patterns
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alter_patterns_update" ON stargazer_alter_patterns
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "alter_patterns_delete" ON stargazer_alter_patterns
  FOR DELETE USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 3. stargazer_alter_reactions
--    Micro Insight 提示後のユーザー反応記録。
--    Reaction Learning の入力データ。
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stargazer_alter_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_type text NOT NULL,
  signal_types text[] NOT NULL DEFAULT '{}',
  reaction text NOT NULL CHECK (reaction IN ('accepted', 'denied', 'ignored', 'explored')),
  response_summary text,
  analytics_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alter_reactions_user ON stargazer_alter_reactions(user_id);
CREATE INDEX idx_alter_reactions_type ON stargazer_alter_reactions(user_id, insight_type);

ALTER TABLE stargazer_alter_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alter_reactions_select" ON stargazer_alter_reactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "alter_reactions_insert" ON stargazer_alter_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
