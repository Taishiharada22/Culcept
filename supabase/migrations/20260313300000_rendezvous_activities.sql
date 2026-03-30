-- ============================================================
-- Resonance Activities テーブル（Phase E）
-- ============================================================

CREATE TABLE IF NOT EXISTS rendezvous_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES rendezvous_candidates(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN ('parallel_question', 'style_duet', 'future_scene')),
  payload jsonb NOT NULL DEFAULT '{}',
  user_a_answer jsonb,
  user_b_answer jsonb,
  revealed boolean NOT NULL DEFAULT false,
  insight_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_candidate
  ON rendezvous_activities (candidate_id, created_at);

-- RLS
ALTER TABLE rendezvous_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities_select_own" ON rendezvous_activities
  FOR SELECT USING (
    candidate_id IN (
      SELECT id FROM rendezvous_candidates
      WHERE user_a = auth.uid() OR user_b = auth.uid()
    )
  );

-- ============================================================
-- Push Notification トークン管理テーブル
-- ============================================================

CREATE TABLE IF NOT EXISTS push_notification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_token UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON push_notification_tokens (user_id);

ALTER TABLE push_notification_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_tokens_own" ON push_notification_tokens
  FOR ALL USING (user_id = auth.uid());
