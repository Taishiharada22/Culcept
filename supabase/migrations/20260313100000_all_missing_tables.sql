-- ============================================================
-- All missing tables + columns for Rendezvous API routes
-- Single atomic migration
-- ============================================================

-- 1. rendezvous_mirror_profiles
CREATE TABLE IF NOT EXISTS rendezvous_mirror_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  archetype text,
  trait_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rendezvous_mirror_profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "mirror_profiles_select_own" ON rendezvous_mirror_profiles FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. rendezvous_season_snapshots
CREATE TABLE IF NOT EXISTS rendezvous_season_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  current_season text NOT NULL,
  progress numeric(4,3) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rendezvous_season_snapshots ENABLE ROW LEVEL SECURITY;

-- 3. rendezvous_living_scores
CREATE TABLE IF NOT EXISTS rendezvous_living_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  user_id uuid NOT NULL,
  score numeric(5,2) NOT NULL DEFAULT 50,
  direction text DEFAULT 'stable',
  signal_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rendezvous_living_scores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "living_scores_select_own" ON rendezvous_living_scores FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. implicit_observatory_adjustments
CREATE TABLE IF NOT EXISTS implicit_observatory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  axis text NOT NULL,
  delta numeric(4,3) NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE implicit_observatory_adjustments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "obs_adj_select_own" ON implicit_observatory_adjustments FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. rendezvous_engagement_streaks
CREATE TABLE IF NOT EXISTS rendezvous_engagement_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  streak_days integer NOT NULL DEFAULT 0,
  last_engagement_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rendezvous_engagement_streaks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "streaks_select_own" ON rendezvous_engagement_streaks FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. rendezvous_anima_insights
CREATE TABLE IF NOT EXISTS rendezvous_anima_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message text NOT NULL,
  subtext text,
  emotional_tone text DEFAULT 'warm',
  insight_type text,
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rendezvous_anima_insights ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "anima_insights_select_own" ON rendezvous_anima_insights FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7. rendezvous_milestones
CREATE TABLE IF NOT EXISTS rendezvous_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  type text NOT NULL,
  reached_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb,
  CONSTRAINT unique_candidate_milestone_type UNIQUE (candidate_id, type)
);
ALTER TABLE rendezvous_milestones ENABLE ROW LEVEL SECURITY;

-- 8. rendezvous_seasons
CREATE TABLE IF NOT EXISTS rendezvous_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  season text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rendezvous_seasons ENABLE ROW LEVEL SECURITY;

-- 9. rendezvous_vector_snapshots
CREATE TABLE IF NOT EXISTS rendezvous_vector_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  user_id uuid NOT NULL,
  vector jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rendezvous_vector_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "vec_snap_select_own" ON rendezvous_vector_snapshots FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 10. implicit_observatory_events
CREATE TABLE IF NOT EXISTS implicit_observatory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE implicit_observatory_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "obs_events_all_own" ON implicit_observatory_events FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 11. rendezvous_view_logs
CREATE TABLE IF NOT EXISTS rendezvous_view_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  view_duration_ms integer DEFAULT 0,
  view_count integer DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rendezvous_view_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "view_logs_all_own" ON rendezvous_view_logs FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Alter existing tables
-- ============================================================

-- avatar_conversations: add missing columns
ALTER TABLE avatar_conversations
  ADD COLUMN IF NOT EXISTS highlight_text text,
  ADD COLUMN IF NOT EXISTS conversation_score numeric(4,2) DEFAULT 0;

-- rendezvous_notifications: expand for phantom signals
ALTER TABLE rendezvous_notifications
  ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}';

ALTER TABLE rendezvous_notifications
  DROP CONSTRAINT IF EXISTS rendezvous_notifications_type_check;

ALTER TABLE rendezvous_notifications
  ADD CONSTRAINT rendezvous_notifications_type_check CHECK (
    notification_type IN (
      'new_candidate', 'waiting_response', 'mutual_like',
      'chat_opened', 'reminder', 'phantom_signal'
    )
  );

ALTER TABLE rendezvous_notifications
  ALTER COLUMN candidate_id DROP NOT NULL;

-- rendezvous_candidates: avatar_summary
ALTER TABLE rendezvous_candidates
  ADD COLUMN IF NOT EXISTS avatar_summary text;

-- rendezvous_profiles: last_active_at + avatar_url
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz,
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_living_scores_candidate_user
  ON rendezvous_living_scores (candidate_id, user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_ntype
  ON rendezvous_notifications (user_id, notification_type, created_at);

CREATE INDEX IF NOT EXISTS idx_obs_events_user
  ON implicit_observatory_events (user_id, event_type);

CREATE INDEX IF NOT EXISTS idx_anima_insights_user
  ON rendezvous_anima_insights (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_view_logs_user
  ON rendezvous_view_logs (user_id, candidate_id);

CREATE INDEX IF NOT EXISTS idx_avatar_conv_candidate
  ON avatar_conversations (candidate_id);

CREATE INDEX IF NOT EXISTS idx_profiles_last_active
  ON rendezvous_profiles (last_active_at);
