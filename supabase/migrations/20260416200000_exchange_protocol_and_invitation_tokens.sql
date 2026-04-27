-- ============================================================
-- Exchange Protocol + Invitation Tokens
-- Idempotent — safe to re-run
-- ============================================================

-- ── 1. Exchange Protocol ──

CREATE TABLE IF NOT EXISTS rendezvous_exchanges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES rendezvous_candidates(id) ON DELETE CASCADE,
  from_user_id  UUID NOT NULL REFERENCES auth.users(id),
  to_user_id    UUID NOT NULL REFERENCES auth.users(id),
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exchanges_from_user
  ON rendezvous_exchanges(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchanges_to_user
  ON rendezvous_exchanges(to_user_id, acknowledged, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchanges_candidate
  ON rendezvous_exchanges(candidate_id, created_at DESC);

ALTER TABLE rendezvous_exchanges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='exchange_own_read' AND tablename='rendezvous_exchanges') THEN
    CREATE POLICY "exchange_own_read" ON rendezvous_exchanges FOR SELECT USING (auth.uid() IN (from_user_id, to_user_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='exchange_own_insert' AND tablename='rendezvous_exchanges') THEN
    CREATE POLICY "exchange_own_insert" ON rendezvous_exchanges FOR INSERT WITH CHECK (auth.uid() = from_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='exchange_own_update' AND tablename='rendezvous_exchanges') THEN
    CREATE POLICY "exchange_own_update" ON rendezvous_exchanges FOR UPDATE USING (auth.uid() = to_user_id);
  END IF;
END $$;

-- ── 2. Invitation Tokens ──

CREATE TABLE IF NOT EXISTS rendezvous_token_balances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  points        INT NOT NULL DEFAULT 0,
  friendship_tokens INT NOT NULL DEFAULT 0,
  discovery_tokens  INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rendezvous_token_balances ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='token_balance_own' AND tablename='rendezvous_token_balances') THEN
    CREATE POLICY "token_balance_own" ON rendezvous_token_balances FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── 3. Invitations ──

CREATE TABLE IF NOT EXISTS rendezvous_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id UUID NOT NULL REFERENCES auth.users(id),
  invitee_email   TEXT,
  invite_code     TEXT NOT NULL UNIQUE,
  invitee_user_id UUID REFERENCES auth.users(id),
  invitee_registered BOOLEAN NOT NULL DEFAULT false,
  invitee_phase1   BOOLEAN NOT NULL DEFAULT false,
  invitee_phase2   BOOLEAN NOT NULL DEFAULT false,
  points_awarded_register BOOLEAN NOT NULL DEFAULT false,
  points_awarded_phase1   BOOLEAN NOT NULL DEFAULT false,
  points_awarded_phase2   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_inviter
  ON rendezvous_invitations(inviter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_code
  ON rendezvous_invitations(invite_code);

ALTER TABLE rendezvous_invitations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='invitations_own' AND tablename='rendezvous_invitations') THEN
    CREATE POLICY "invitations_own" ON rendezvous_invitations FOR ALL USING (auth.uid() = inviter_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='invitations_invitee_read' AND tablename='rendezvous_invitations') THEN
    CREATE POLICY "invitations_invitee_read" ON rendezvous_invitations FOR SELECT USING (auth.uid() = invitee_user_id);
  END IF;
END $$;
