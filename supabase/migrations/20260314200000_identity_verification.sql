-- Identity verification columns for rendezvous_profiles
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'none'
    CHECK (verification_status IN ('none','pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS verification_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_reviewer_note text,
  ADD COLUMN IF NOT EXISTS id_document_path text,
  ADD COLUMN IF NOT EXISTS selfie_path text,
  ADD COLUMN IF NOT EXISTS document_type text
    CHECK (document_type IS NULL OR document_type IN ('drivers_license','passport','my_number_card'));

CREATE INDEX IF NOT EXISTS idx_rendezvous_profiles_verification_pending
  ON rendezvous_profiles (verification_status) WHERE verification_status = 'pending';
