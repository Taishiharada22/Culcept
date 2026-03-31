-- ============================================================
-- Alter Feedback: 回答単位のユーザーフィードバック
-- 👍/👎 + 自由記載 + 回答メタデータの紐付け
-- ============================================================

CREATE TABLE IF NOT EXISTS stargazer_alter_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  response_id text NOT NULL,
  rating text NOT NULL CHECK (rating IN ('positive', 'negative')),
  free_text text,
  -- 対象機能の分類
  target_feature text NOT NULL DEFAULT 'alter' CHECK (target_feature IN (
    'alter', 'gemini_reading', 'micro_insight', 'deepening_probe', 'relational_context', 'other'
  )),
  -- 回答時のメタデータスナップショット（後で追跡可能にする）
  response_metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alter_feedback_user ON stargazer_alter_feedback(user_id);
CREATE INDEX idx_alter_feedback_session ON stargazer_alter_feedback(session_id);
CREATE INDEX idx_alter_feedback_rating ON stargazer_alter_feedback(rating);
CREATE INDEX idx_alter_feedback_created ON stargazer_alter_feedback(created_at DESC);
CREATE INDEX idx_alter_feedback_feature ON stargazer_alter_feedback(target_feature);

ALTER TABLE stargazer_alter_feedback ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のフィードバックのみ操作可能
CREATE POLICY "feedback_select" ON stargazer_alter_feedback
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "feedback_insert" ON stargazer_alter_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- CEOダッシュボード用: service_role で全件読み取り可能（API側で認証）
