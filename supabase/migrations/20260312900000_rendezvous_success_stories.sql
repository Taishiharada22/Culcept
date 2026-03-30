-- Rendezvous: 成功ストーリー（匿名化）
CREATE TABLE IF NOT EXISTS rendezvous_success_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  category text NOT NULL DEFAULT 'friendship',
  title text NOT NULL,
  body text NOT NULL,
  emoji text DEFAULT '✨',
  -- 匿名化: 相手名やIDは保存しない
  anonymized_context jsonb DEFAULT '{}',
  -- 承認フロー
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_at timestamptz,
  approved_by uuid,
  -- Meta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE rendezvous_success_stories ENABLE ROW LEVEL SECURITY;

-- Users can read approved stories
CREATE POLICY "approved_stories_public_read" ON rendezvous_success_stories
  FOR SELECT USING (status = 'approved');

-- Users can insert their own stories
CREATE POLICY "users_insert_own_stories" ON rendezvous_success_stories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending stories
CREATE POLICY "users_update_own_pending" ON rendezvous_success_stories
  FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');

-- Index
CREATE INDEX idx_success_stories_status ON rendezvous_success_stories(status, created_at DESC);
