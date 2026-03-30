-- ============================================================
-- Phase 1: 心理学的深度プロファイルテーブル
-- アタッチメント理論・Gottman葛藤修復・自己決定理論（SDT）
-- ============================================================

-- アタッチメントプロファイル
CREATE TABLE IF NOT EXISTS rendezvous_attachment_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anxiety_level real NOT NULL DEFAULT 0.5 CHECK (anxiety_level >= 0 AND anxiety_level <= 1),
  avoidance_level real NOT NULL DEFAULT 0.5 CHECK (avoidance_level >= 0 AND avoidance_level <= 1),
  secure_base real NOT NULL DEFAULT 0.5 CHECK (secure_base >= 0 AND secure_base <= 1),
  protest_behavior real NOT NULL DEFAULT 0.5 CHECK (protest_behavior >= 0 AND protest_behavior <= 1),
  attachment_style text GENERATED ALWAYS AS (
    CASE
      WHEN anxiety_level < 0.45 AND avoidance_level < 0.45 THEN 'secure'
      WHEN anxiety_level >= 0.45 AND avoidance_level < 0.45 THEN 'anxious'
      WHEN anxiety_level < 0.45 AND avoidance_level >= 0.45 THEN 'avoidant'
      ELSE 'disorganized'
    END
  ) STORED,
  source text NOT NULL DEFAULT 'vector', -- 'vector' | 'stargazer' | 'questionnaire'
  source_response_count int NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_attachment_profiles_user ON rendezvous_attachment_profiles(user_id);
CREATE INDEX idx_attachment_profiles_style ON rendezvous_attachment_profiles(attachment_style);

-- 葛藤修復プロファイル
CREATE TABLE IF NOT EXISTS rendezvous_conflict_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repair_initiative real NOT NULL DEFAULT 0.5 CHECK (repair_initiative >= 0 AND repair_initiative <= 1),
  responsiveness real NOT NULL DEFAULT 0.5 CHECK (responsiveness >= 0 AND responsiveness <= 1),
  escalation_tendency real NOT NULL DEFAULT 0.3 CHECK (escalation_tendency >= 0 AND escalation_tendency <= 1),
  recovery_speed real NOT NULL DEFAULT 0.5 CHECK (recovery_speed >= 0 AND recovery_speed <= 1),
  tension_response_count int NOT NULL DEFAULT 0,
  last_tension_at timestamptz,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_conflict_profiles_user ON rendezvous_conflict_profiles(user_id);

-- SDTプロファイル
CREATE TABLE IF NOT EXISTS rendezvous_sdt_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  autonomy_satisfaction real NOT NULL DEFAULT 0.5 CHECK (autonomy_satisfaction >= 0 AND autonomy_satisfaction <= 1),
  competence_satisfaction real NOT NULL DEFAULT 0.5 CHECK (competence_satisfaction >= 0 AND competence_satisfaction <= 1),
  relatedness_satisfaction real NOT NULL DEFAULT 0.5 CHECK (relatedness_satisfaction >= 0 AND relatedness_satisfaction <= 1),
  source text NOT NULL DEFAULT 'vector', -- 'vector' | 'stargazer'
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_sdt_profiles_user ON rendezvous_sdt_profiles(user_id);

-- RLS ポリシー
ALTER TABLE rendezvous_attachment_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendezvous_conflict_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendezvous_sdt_profiles ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のプロファイルのみ参照可能
CREATE POLICY "Users can view own attachment profile"
  ON rendezvous_attachment_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own attachment profile"
  ON rendezvous_attachment_profiles FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own conflict profile"
  ON rendezvous_conflict_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own conflict profile"
  ON rendezvous_conflict_profiles FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own SDT profile"
  ON rendezvous_sdt_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own SDT profile"
  ON rendezvous_sdt_profiles FOR ALL
  USING (auth.uid() = user_id);

-- サービスロール（cron job等）は全プロファイルにアクセス可能
CREATE POLICY "Service role can access all attachment profiles"
  ON rendezvous_attachment_profiles FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all conflict profiles"
  ON rendezvous_conflict_profiles FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all SDT profiles"
  ON rendezvous_sdt_profiles FOR ALL
  USING (auth.role() = 'service_role');
