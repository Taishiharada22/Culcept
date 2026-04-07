-- P2-2: Body Lens — 身体→感情構築パターンの個人内学習
-- HDM v1 §8.2 (Body Lens / Constructed Emotion)
--
-- 新テーブル: stargazer_body_emotion_mappings
-- 各ユーザーの body_signal → emotion の個人内写像を蓄積する。
-- ゼロプライヤー設計: 汎用mappingはseedしない。全ユーザーが空から始まる。

CREATE TABLE IF NOT EXISTS stargazer_body_emotion_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 身体信号カテゴリ（日常表現ベース、医学用語ではない）
  body_signal_type text NOT NULL
    CHECK (body_signal_type IN ('tension', 'fatigue', 'headache', 'stomach', 'chest', 'sleep', 'appetite', 'energy')),

  -- この人がこの身体信号から構築しやすい感情（自由テキスト、個人内学習）
  likely_emotion_mapping text NOT NULL,

  -- 保守的 confidence: max(0, (evidence-1)) / (evidence + counter + strong_counter + 2)
  confidence real NOT NULL DEFAULT 0,

  -- 共起が観測された回数
  evidence_count int NOT NULL DEFAULT 0,

  -- 反例が観測された回数（通常の反例）
  counter_evidence_count int NOT NULL DEFAULT 0,

  -- 強い反例の回数（明確に逆の感情が観測された場合。将来的に重み分離用）
  strong_counter_evidence_count int NOT NULL DEFAULT 0,

  -- 別文脈（別日 or 別状況）で観測された回数
  -- confidence は distinct_context_count >= 2 でなければ 0
  distinct_context_count int NOT NULL DEFAULT 0,

  -- 最後に観測された日時
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  -- 観測時の状況タグ（最大20件）
  context_tags jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- 同一ユーザー × 同一信号 × 同一感情の組み合わせはユニーク
  UNIQUE (user_id, body_signal_type, likely_emotion_mapping)
);

-- ユーザーごとの mapping 検索用インデックス
CREATE INDEX IF NOT EXISTS idx_body_emotion_mappings_user
  ON stargazer_body_emotion_mappings(user_id);

-- 身体信号タイプでの検索用
CREATE INDEX IF NOT EXISTS idx_body_emotion_mappings_signal
  ON stargazer_body_emotion_mappings(user_id, body_signal_type);

-- RLS
ALTER TABLE stargazer_body_emotion_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own body mappings"
  ON stargazer_body_emotion_mappings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own body mappings"
  ON stargazer_body_emotion_mappings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own body mappings"
  ON stargazer_body_emotion_mappings FOR UPDATE
  USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE stargazer_body_emotion_mappings IS
  'P2-2 Body Lens: individual body-signal → emotion construction mappings. Zero-prior design.';
COMMENT ON COLUMN stargazer_body_emotion_mappings.body_signal_type IS
  'Body signal category: tension/fatigue/headache/stomach/chest/sleep/appetite/energy';
COMMENT ON COLUMN stargazer_body_emotion_mappings.likely_emotion_mapping IS
  'Emotion this person tends to construct from this body signal (learned per-user)';
COMMENT ON COLUMN stargazer_body_emotion_mappings.confidence IS
  'Conservative confidence: max(0, evidence-1)/(evidence+counter+strong_counter+2). Zero until distinct_context≥2';
COMMENT ON COLUMN stargazer_body_emotion_mappings.distinct_context_count IS
  'Number of distinct contexts (different days or situations). Mapping only activates at ≥2';
COMMENT ON COLUMN stargazer_body_emotion_mappings.strong_counter_evidence_count IS
  'Strong counter-evidence count (clearly opposite emotion observed). Reserved for future weight separation';
