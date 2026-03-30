-- ============================================================
-- Tension Architecture + Community Resonance tables
-- ============================================================

-- Tension responses
CREATE TABLE IF NOT EXISTS rendezvous_tension_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES rendezvous_candidates(id) ON DELETE SET NULL,
  prompt_id text NOT NULL,
  response text NOT NULL CHECK (response IN ('faced','deferred','reflected')),
  reflection text,
  insight jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tension_user ON rendezvous_tension_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_tension_candidate ON rendezvous_tension_responses(candidate_id);
ALTER TABLE rendezvous_tension_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tension responses" ON rendezvous_tension_responses
  FOR ALL USING (auth.uid() = user_id);

-- Community resonance groups
CREATE TABLE IF NOT EXISTS rendezvous_resonance_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_ids uuid[] NOT NULL,
  member_roles jsonb NOT NULL DEFAULT '{}',
  emergent_type text,
  group_score int,
  narrative text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resonance_groups_creator ON rendezvous_resonance_groups(created_by);
ALTER TABLE rendezvous_resonance_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own groups" ON rendezvous_resonance_groups
  FOR ALL USING (auth.uid() = created_by OR auth.uid() = ANY(member_ids));
