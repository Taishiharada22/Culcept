-- Create stargazer_vanishing_insights table for persisting AI-generated insights and user reactions
CREATE TABLE IF NOT EXISTS stargazer_vanishing_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight TEXT NOT NULL,
  depth TEXT NOT NULL CHECK (depth IN ('表層', '中層', '深層', '核心')),
  surprise_score NUMERIC(3,2) CHECK (surprise_score >= 0 AND surprise_score <= 1),
  based_on TEXT,
  chain_reference TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  user_reaction TEXT CHECK (user_reaction IN ('resonated', 'surprising', 'expected', 'unclear')),
  reacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vanishing_insights_user_date
  ON stargazer_vanishing_insights(user_id, created_at DESC);

ALTER TABLE stargazer_vanishing_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own insights"
  ON stargazer_vanishing_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own insights"
  ON stargazer_vanishing_insights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own insights"
  ON stargazer_vanishing_insights FOR UPDATE
  USING (auth.uid() = user_id);
