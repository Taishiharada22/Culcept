-- Age verification columns for Rendezvous
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS age_verified_at timestamptz;

-- Index for querying verified users
CREATE INDEX IF NOT EXISTS idx_rendezvous_profiles_age_verified
  ON rendezvous_profiles (user_id) WHERE age_verified_at IS NOT NULL;
