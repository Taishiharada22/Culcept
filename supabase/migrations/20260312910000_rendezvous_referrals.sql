-- Rendezvous: 友達紹介システム
CREATE TABLE IF NOT EXISTS rendezvous_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id),
  referral_code text NOT NULL UNIQUE,
  referred_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'expired')),
  -- 報酬
  reward_type text DEFAULT 'priority_boost',
  reward_claimed_at timestamptz,
  -- Meta
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

-- RLS
ALTER TABLE rendezvous_referrals ENABLE ROW LEVEL SECURITY;

-- Users can read their own referrals
CREATE POLICY "users_read_own_referrals" ON rendezvous_referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Users can create referrals
CREATE POLICY "users_create_referrals" ON rendezvous_referrals
  FOR INSERT WITH CHECK (auth.uid() = referrer_id);

-- Index
CREATE INDEX idx_referrals_code ON rendezvous_referrals(referral_code);
CREATE INDEX idx_referrals_referrer ON rendezvous_referrals(referrer_id, status);
