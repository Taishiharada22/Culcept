-- ============================================================
-- Synchronized Experience: 同期体験セッション
-- 二人が同じ質問に同時に向き合い、独立に回答し、同時に開示する。
-- ============================================================

CREATE TABLE IF NOT EXISTS rendezvous_sync_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES rendezvous_candidates(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  user_a_answer text,
  user_b_answer text,
  user_a_answered_at timestamptz,
  user_b_answered_at timestamptz,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','both_ready','answering','revealing','completed')),
  resonance_score int,
  resonance_insight text,
  resonance_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by candidate
CREATE INDEX idx_sync_sessions_candidate
  ON rendezvous_sync_sessions(candidate_id);

-- Index for finding active sessions
CREATE INDEX idx_sync_sessions_active
  ON rendezvous_sync_sessions(candidate_id, status)
  WHERE status != 'completed';

-- Row Level Security
ALTER TABLE rendezvous_sync_sessions ENABLE ROW LEVEL SECURITY;

-- Users can see and interact with sessions for their own candidates
CREATE POLICY "Users see own sync sessions"
  ON rendezvous_sync_sessions
  FOR ALL
  USING (
    candidate_id IN (
      SELECT id FROM rendezvous_candidates
      WHERE user_a = auth.uid() OR user_b = auth.uid()
    )
  );
