-- Stargazer Analytics — feature usage tracking
-- Lightweight event log for internal analytics (no external provider)

CREATE TABLE IF NOT EXISTS stargazer_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  feature text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Query patterns:
-- 1. Per-user event history (feature engagement)
-- 2. Global event aggregation by date (retention, popularity)
CREATE INDEX idx_sa_user_event ON stargazer_analytics(user_id, event, created_at DESC);
CREATE INDEX idx_sa_event_date ON stargazer_analytics(event, created_at DESC);
CREATE INDEX idx_sa_feature_date ON stargazer_analytics(feature, created_at DESC);

ALTER TABLE stargazer_analytics ENABLE ROW LEVEL SECURITY;

-- Users can read their own analytics
CREATE POLICY "Users can read own analytics"
  ON stargazer_analytics FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own events
CREATE POLICY "Service can insert analytics"
  ON stargazer_analytics FOR INSERT
  WITH CHECK (auth.uid() = user_id);
