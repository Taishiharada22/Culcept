-- ============================================================
-- Avatar Live System — Phase 1 Foundation (idempotent)
-- ============================================================

-- 1. avatar_conversations
CREATE TABLE IF NOT EXISTS avatar_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  highlight jsonb,
  summary text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'archived')),
  category text NOT NULL DEFAULT 'friendship',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avatar_conversations_candidate
  ON avatar_conversations (candidate_id);

ALTER TABLE avatar_conversations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "avatar_conversations_select" ON avatar_conversations FOR SELECT
  USING (candidate_id IN (SELECT id FROM rendezvous_candidates WHERE user_a = auth.uid() OR user_b = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "avatar_conversations_insert" ON avatar_conversations FOR INSERT
  WITH CHECK (candidate_id IN (SELECT id FROM rendezvous_candidates WHERE user_a = auth.uid() OR user_b = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. avatar_reactions
CREATE TABLE IF NOT EXISTS avatar_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  message_index int NOT NULL,
  reaction_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avatar_reactions_conv_user
  ON avatar_reactions (conversation_id, user_id);

ALTER TABLE avatar_reactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "avatar_reactions_select" ON avatar_reactions FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "avatar_reactions_insert" ON avatar_reactions FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. avatar_skills
CREATE TABLE IF NOT EXISTS avatar_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  personality_state jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE avatar_skills ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "avatar_skills_select" ON avatar_skills FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "avatar_skills_insert" ON avatar_skills FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "avatar_skills_update" ON avatar_skills FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. avatar_activity_schedule
CREATE TABLE IF NOT EXISTS avatar_activity_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  activity_type text NOT NULL,
  target_category text,
  target_candidate_id uuid,
  payload jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avatar_activity_user_time
  ON avatar_activity_schedule (user_id, scheduled_at);

ALTER TABLE avatar_activity_schedule ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "avatar_activity_select" ON avatar_activity_schedule FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "avatar_activity_insert" ON avatar_activity_schedule FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "avatar_activity_update" ON avatar_activity_schedule FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. live_events (may already exist with different schema)
CREATE TABLE IF NOT EXISTS live_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text,
  category text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE live_events ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE live_events ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE live_events ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE live_events ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE live_events ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_live_events_time
  ON live_events (starts_at, ends_at);

ALTER TABLE live_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "live_events_select" ON live_events FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. baton_changes
CREATE TABLE IF NOT EXISTS baton_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  user_id uuid NOT NULL,
  avatar_conversation_id uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_baton_changes_candidate
  ON baton_changes (candidate_id);

ALTER TABLE baton_changes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "baton_changes_select" ON baton_changes FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "baton_changes_insert" ON baton_changes FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
