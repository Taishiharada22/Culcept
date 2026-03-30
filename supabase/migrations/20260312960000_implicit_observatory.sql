-- ============================================================
-- Implicit Observatory: 暗黙的行動観測データ
-- ============================================================

-- Raw observation events
CREATE TABLE IF NOT EXISTS rendezvous_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  axis_adjustments jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_observations_user_type ON rendezvous_observations(user_id, event_type);
CREATE INDEX idx_observations_created ON rendezvous_observations(created_at);

ALTER TABLE rendezvous_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own observations"
  ON rendezvous_observations
  FOR ALL
  USING (auth.uid() = user_id);

-- Aggregated observation summary per user (updated periodically)
CREATE TABLE IF NOT EXISTS rendezvous_observation_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  total_events_processed int NOT NULL DEFAULT 0,
  axis_confidence jsonb NOT NULL DEFAULT '{}',
  detected_patterns jsonb NOT NULL DEFAULT '[]',
  last_processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rendezvous_observation_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own summaries"
  ON rendezvous_observation_summaries
  FOR SELECT
  USING (auth.uid() = user_id);
