-- Proactive Understanding Engine — DB tables
-- Design: docs/proactive-understanding-engine.md §12
-- Date: 2026-04-04

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Causal Map: fact→axis の因果接続
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS stargazer_alter_causal_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  source_fact text NOT NULL,
  target_axis text NOT NULL,
  influence text NOT NULL CHECK (influence IN ('amplify', 'suppress', 'context')),

  hypothesis text NOT NULL,
  origin text NOT NULL CHECK (origin IN ('archetype_prior', 'conversation_observed', 'user_stated')),
  confidence float NOT NULL DEFAULT 0.15,
  evidence_count int NOT NULL DEFAULT 0,
  contradiction_count int NOT NULL DEFAULT 0,
  last_confirmed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_causal_map_user ON stargazer_alter_causal_map(user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Trust Budget: domain別の信頼度+文脈アクセス
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS stargazer_alter_trust_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (domain IN ('career', 'relationship', 'identity', 'health', 'daily', 'creative')),

  -- Earned Trust (cumulative, no decay)
  earned_score float NOT NULL DEFAULT 0.0,

  -- Contextual Access (decays over time)
  contextual_level float NOT NULL DEFAULT 0.0,
  contextual_last_active timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id, domain)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. Consent: subdomain単位の同意管理
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS stargazer_alter_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subdomain text NOT NULL,  -- "relationship/romance", "health/mental", etc.

  status text NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'implicit', 'explicit', 'revoked')),
  cooldown_until timestamptz,  -- revoked/none時のクールダウン期限
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id, subdomain)
);

CREATE INDEX IF NOT EXISTS idx_consent_user ON stargazer_alter_consent(user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. Trust Events: 信頼イベントログ
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS stargazer_alter_trust_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain text NOT NULL,
  event_type text NOT NULL,
  weight float NOT NULL,
  session_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trust_events_user ON stargazer_alter_trust_events(user_id, created_at DESC);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. Payback Tracker: 質問→価値還元の追跡
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS stargazer_alter_payback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_probe_id text NOT NULL,
  fact_id text NOT NULL,
  causal_link_ids text[] NOT NULL DEFAULT '{}',
  used_in_sessions text[] NOT NULL DEFAULT '{}',
  first_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payback_user ON stargazer_alter_payback(user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RLS: 全テーブルにユーザー分離ポリシー
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE stargazer_alter_causal_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_alter_trust_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_alter_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_alter_trust_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stargazer_alter_payback ENABLE ROW LEVEL SECURITY;

-- causal_map
CREATE POLICY "Users can read own causal map" ON stargazer_alter_causal_map
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own causal map" ON stargazer_alter_causal_map
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own causal map" ON stargazer_alter_causal_map
  FOR UPDATE USING (auth.uid() = user_id);

-- trust_budget
CREATE POLICY "Users can read own trust budget" ON stargazer_alter_trust_budget
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trust budget" ON stargazer_alter_trust_budget
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trust budget" ON stargazer_alter_trust_budget
  FOR UPDATE USING (auth.uid() = user_id);

-- consent
CREATE POLICY "Users can read own consent" ON stargazer_alter_consent
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own consent" ON stargazer_alter_consent
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own consent" ON stargazer_alter_consent
  FOR UPDATE USING (auth.uid() = user_id);

-- trust_events
CREATE POLICY "Users can read own trust events" ON stargazer_alter_trust_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trust events" ON stargazer_alter_trust_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- payback
CREATE POLICY "Users can read own payback" ON stargazer_alter_payback
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own payback" ON stargazer_alter_payback
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own payback" ON stargazer_alter_payback
  FOR UPDATE USING (auth.uid() = user_id);

-- service_role bypass for API route
CREATE POLICY "Service role full access causal_map" ON stargazer_alter_causal_map
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access trust_budget" ON stargazer_alter_trust_budget
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access consent" ON stargazer_alter_consent
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access trust_events" ON stargazer_alter_trust_events
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access payback" ON stargazer_alter_payback
  FOR ALL USING (auth.role() = 'service_role');
