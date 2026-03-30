-- ============================================================
-- Fix: オンボーディング関連の不足テーブル・カラム追加
-- ============================================================

-- 1. rendezvous_profiles に onboarding_completed_at カラム追加
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- 2. rendezvous_onboarding テーブル作成（オンボーディングデータ保存用）
CREATE TABLE IF NOT EXISTS rendezvous_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  partial_vector jsonb,
  discovered_axes jsonb,
  confidence jsonb,
  selected_questions jsonb,
  enabled_categories jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rendezvous_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own onboarding"
  ON rendezvous_onboarding
  FOR ALL
  USING (auth.uid() = user_id);

-- 3. avatar_activity_schedule に payload カラム追加（オンボーディングで使用）
ALTER TABLE avatar_activity_schedule
  ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb;
