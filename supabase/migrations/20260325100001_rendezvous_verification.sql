-- Rendezvous identity verification (4 photos + ID document)
CREATE TABLE IF NOT EXISTS rendezvous_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),

  -- Photos (Supabase Storage paths)
  photo_atmosphere text,
  photo_face text,
  photo_best text,
  photo_current text,
  id_document text,

  -- Review
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id)
);

-- RLS
ALTER TABLE rendezvous_verification ENABLE ROW LEVEL SECURITY;

-- Users can read their own verification status
CREATE POLICY "Users can view own verification" ON rendezvous_verification
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own (for photo upload)
CREATE POLICY "Users can submit verification" ON rendezvous_verification
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own while still pending
CREATE POLICY "Users can update own verification" ON rendezvous_verification
  FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');
