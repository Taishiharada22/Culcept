-- Rendezvous: プレミアム機能
-- is_premium と priority_boost を profiles に追加

ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_boost integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS premium_expires_at timestamptz;

-- Second chance: expired_recoverable 状態の候補を復活
ALTER TABLE rendezvous_candidates
  ADD COLUMN IF NOT EXISTS recovery_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovered_at timestamptz;
