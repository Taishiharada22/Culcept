-- Rendezvous Analytics — 3枠分離の計測テーブル
-- 全イベントに lane (romance/connection/partner) を含む

CREATE TABLE IF NOT EXISTS rendezvous_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  lane text,          -- romance / connection / partner
  submode text,       -- friendship / community / business (connection枠のみ)
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Query patterns:
-- 1. Per-lane event aggregation (3枠比較)
-- 2. Per-user event history
-- 3. Global event trends by date
CREATE INDEX IF NOT EXISTS idx_ra_lane_event ON rendezvous_analytics(lane, event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ra_user_event ON rendezvous_analytics(user_id, event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ra_event_date ON rendezvous_analytics(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ra_submode ON rendezvous_analytics(submode, created_at DESC) WHERE submode IS NOT NULL;

ALTER TABLE rendezvous_analytics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rendezvous_analytics' AND policyname = 'Users can read own rendezvous analytics') THEN
    CREATE POLICY "Users can read own rendezvous analytics" ON rendezvous_analytics FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rendezvous_analytics' AND policyname = 'Users can insert own rendezvous analytics') THEN
    CREATE POLICY "Users can insert own rendezvous analytics" ON rendezvous_analytics FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
