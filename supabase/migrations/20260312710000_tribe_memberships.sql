-- ============================================================
-- Tribe memberships table (server-side persistence)
-- Enables encounter generation from tribe co-membership
-- ============================================================

CREATE TABLE IF NOT EXISTS tribe_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tribe_id text NOT NULL,
  tribe_name text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tribe_id)
);

CREATE INDEX IF NOT EXISTS idx_tribe_memberships_tribe
  ON tribe_memberships (tribe_id);
CREATE INDEX IF NOT EXISTS idx_tribe_memberships_user
  ON tribe_memberships (user_id);

ALTER TABLE tribe_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY tribe_memberships_select_own ON tribe_memberships
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY tribe_memberships_insert_own ON tribe_memberships
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY tribe_memberships_delete_own ON tribe_memberships
  FOR DELETE USING (auth.uid() = user_id);
