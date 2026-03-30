-- Add slot_type to rendezvous_photos for typed photo slots
ALTER TABLE rendezvous_photos
  ADD COLUMN IF NOT EXISTS slot_type text CHECK (slot_type IN ('atmosphere', 'face', 'best', 'current'));

-- Add disclosure_phase: which phase this photo becomes visible
ALTER TABLE rendezvous_photos
  ADD COLUMN IF NOT EXISTS disclosure_phase int NOT NULL DEFAULT 0 CHECK (disclosure_phase IN (0, 1, 2));

-- Set disclosure phases by slot type
COMMENT ON COLUMN rendezvous_photos.disclosure_phase IS 'Phase 0: atmosphere only. Phase 1: atmosphere + best (style). Phase 2: face + current (mutual reveal).';

-- Photo disclosure state per candidate pair
CREATE TABLE IF NOT EXISTS rendezvous_photo_disclosure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES rendezvous_candidates(id) ON DELETE CASCADE,
  user_a uuid NOT NULL REFERENCES auth.users(id),
  user_b uuid NOT NULL REFERENCES auth.users(id),

  -- Current disclosure level for each direction
  a_disclosure_level int NOT NULL DEFAULT 0 CHECK (a_disclosure_level BETWEEN 0 AND 2),
  b_disclosure_level int NOT NULL DEFAULT 0 CHECK (b_disclosure_level BETWEEN 0 AND 2),

  -- Phase 2 mutual reveal consent
  a_reveal_requested boolean NOT NULL DEFAULT false,
  b_reveal_requested boolean NOT NULL DEFAULT false,
  revealed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(candidate_id)
);

ALTER TABLE rendezvous_photo_disclosure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own disclosure" ON rendezvous_photo_disclosure
  FOR SELECT USING (auth.uid() = user_a OR auth.uid() = user_b);
