-- ============================================================
-- Rendezvous: オンボーディング完了フラグ
-- ============================================================

ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
