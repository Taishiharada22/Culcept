-- ============================================================
-- Voice Resonance: 声の共鳴セッション
-- ============================================================

CREATE TABLE IF NOT EXISTS rendezvous_voice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES rendezvous_candidates(id) ON DELETE CASCADE,
  prompt_id text NOT NULL,
  user_a_analysis jsonb,
  user_b_analysis jsonb,
  user_a_submitted_at timestamptz,
  user_b_submitted_at timestamptz,
  resonance_score int,
  resonance_type text,
  resonance_insight text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'one_submitted', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX idx_voice_sessions_candidate
  ON rendezvous_voice_sessions(candidate_id);

CREATE INDEX idx_voice_sessions_status
  ON rendezvous_voice_sessions(candidate_id, status);

-- RLS
ALTER TABLE rendezvous_voice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own voice sessions"
  ON rendezvous_voice_sessions
  FOR ALL
  USING (
    candidate_id IN (
      SELECT id FROM rendezvous_candidates
      WHERE user_a = auth.uid() OR user_b = auth.uid()
    )
  );
