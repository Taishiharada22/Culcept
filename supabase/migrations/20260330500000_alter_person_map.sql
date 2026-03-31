-- ============================================================
-- Alter Understanding Phase 3: 人物マップ
-- ============================================================

CREATE TABLE IF NOT EXISTS stargazer_alter_person_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  role text NOT NULL CHECK (role IN ('parent', 'sibling', 'partner', 'ex', 'crush', 'close_friend', 'friend', 'acquaintance', 'boss', 'senior', 'colleague', 'subordinate', 'client', 'other')),
  sentiment_trend text CHECK (sentiment_trend IN ('improving', 'stable', 'declining')),
  mention_count int NOT NULL DEFAULT 1,
  influence_score float NOT NULL DEFAULT 0.3 CHECK (influence_score >= 0 AND influence_score <= 1),
  last_sentiment text CHECK (last_sentiment IN ('positive', 'negative', 'mixed', 'neutral')),
  last_mentioned timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, label)
);

CREATE INDEX idx_person_map_user ON stargazer_alter_person_map(user_id);
CREATE INDEX idx_person_map_influence ON stargazer_alter_person_map(user_id, influence_score DESC);

ALTER TABLE stargazer_alter_person_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "person_map_select" ON stargazer_alter_person_map
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "person_map_insert" ON stargazer_alter_person_map
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "person_map_update" ON stargazer_alter_person_map
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "person_map_delete" ON stargazer_alter_person_map
  FOR DELETE USING (auth.uid() = user_id);
