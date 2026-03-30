-- ============================================================
-- Instant Resonance: 行動選択から性格軸を推定する選択結果テーブル
-- ============================================================

CREATE TABLE IF NOT EXISTS rendezvous_resonance_choices (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id    text        NOT NULL,
  selected   text        NOT NULL CHECK (selected IN ('a', 'b')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_resonance_choices_user
  ON rendezvous_resonance_choices(user_id);

ALTER TABLE rendezvous_resonance_choices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own resonance choices"
  ON rendezvous_resonance_choices
  FOR ALL
  USING (auth.uid() = user_id);
