-- ============================================================
-- Escalation Rules: 3日制限 + あと1日ルール
-- ============================================================

-- avatar_conversations に初回会話開始日を追跡するためのカラムは started_at で既に存在

-- 候補者ごとのエスカレーション状態を追跡
CREATE TABLE IF NOT EXISTS rendezvous_escalation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  user_id uuid NOT NULL,
  first_conversation_at timestamptz,
  postpone_used_at timestamptz,        -- 「あと1日だけ」を使った日時（NULLなら未使用）
  baton_changed_at timestamptz,        -- バトンタッチした日時（NULLなら未実行）
  auto_archived_at timestamptz,        -- 自動アーカイブされた日時
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(candidate_id, user_id)
);

CREATE INDEX idx_escalation_state_user ON rendezvous_escalation_state(user_id);
CREATE INDEX idx_escalation_state_candidate ON rendezvous_escalation_state(candidate_id);

ALTER TABLE rendezvous_escalation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own escalation state"
  ON rendezvous_escalation_state
  FOR ALL
  USING (auth.uid() = user_id);
