-- CoAlter: 関係性支援OS — データベーススキーマ
-- 設計文書: docs/coalter-master-design.md

-- ─────────────────────────────────────────────
-- coalter_pair_states: ペア単位のCoAlter有効化状態
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coalter_pair_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL,
  thread_type TEXT NOT NULL DEFAULT 'talk' CHECK (thread_type IN ('talk')),
  user_a UUID NOT NULL REFERENCES auth.users(id),
  user_b UUID NOT NULL REFERENCES auth.users(id),
  state TEXT NOT NULL DEFAULT 'pending_consent'
    CHECK (state IN ('pending_consent', 'enabled', 'disabled')),
  initiated_by UUID NOT NULL REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  disabled_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (thread_id)
);

CREATE INDEX idx_coalter_pair_users ON coalter_pair_states (user_a, user_b);

-- RLS: スレッド参加者のみアクセス可能
ALTER TABLE coalter_pair_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coalter_pair_select" ON coalter_pair_states
  FOR SELECT USING (auth.uid() IN (user_a, user_b));

CREATE POLICY "coalter_pair_insert" ON coalter_pair_states
  FOR INSERT WITH CHECK (auth.uid() IN (user_a, user_b));

CREATE POLICY "coalter_pair_update" ON coalter_pair_states
  FOR UPDATE USING (auth.uid() IN (user_a, user_b));

-- ─────────────────────────────────────────────
-- coalter_sessions: セッション（1起動 = 1セッション）
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coalter_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_state_id UUID NOT NULL REFERENCES coalter_pair_states(id),
  thread_id UUID NOT NULL,
  mode TEXT NOT NULL DEFAULT 'decision'
    CHECK (mode IN ('decision', 'negotiate', 'clarify', 'reflect')),
  state TEXT NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'completed', 'cancelled')),
  invoked_by UUID NOT NULL REFERENCES auth.users(id),
  trigger_pattern TEXT,          -- マッチしたトリガーパターン名
  trigger_confidence TEXT,       -- strong / soft
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_coalter_sessions_thread ON coalter_sessions (thread_id, created_at DESC);
CREATE INDEX idx_coalter_sessions_pair ON coalter_sessions (pair_state_id, created_at DESC);

ALTER TABLE coalter_sessions ENABLE ROW LEVEL SECURITY;

-- セッションはペアのメンバーのみ閲覧可能
CREATE POLICY "coalter_session_select" ON coalter_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM coalter_pair_states ps
      WHERE ps.id = coalter_sessions.pair_state_id
        AND auth.uid() IN (ps.user_a, ps.user_b)
    )
  );

CREATE POLICY "coalter_session_insert" ON coalter_sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM coalter_pair_states ps
      WHERE ps.id = pair_state_id
        AND auth.uid() IN (ps.user_a, ps.user_b)
        AND ps.state = 'enabled'
    )
  );

CREATE POLICY "coalter_session_update" ON coalter_sessions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM coalter_pair_states ps
      WHERE ps.id = coalter_sessions.pair_state_id
        AND auth.uid() IN (ps.user_a, ps.user_b)
    )
  );

-- ─────────────────────────────────────────────
-- coalter_messages: CoAlterの提案カード + ユーザー応答
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coalter_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES coalter_sessions(id),
  role TEXT NOT NULL CHECK (role IN ('user_a', 'user_b', 'coalter')),
  sender_id UUID REFERENCES auth.users(id), -- CoAlterの場合NULL
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',     -- ProposalCard等
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coalter_messages_session ON coalter_messages (session_id, created_at);

ALTER TABLE coalter_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coalter_message_select" ON coalter_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM coalter_sessions s
      JOIN coalter_pair_states ps ON ps.id = s.pair_state_id
      WHERE s.id = coalter_messages.session_id
        AND auth.uid() IN (ps.user_a, ps.user_b)
    )
  );

CREATE POLICY "coalter_message_insert" ON coalter_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM coalter_sessions s
      JOIN coalter_pair_states ps ON ps.id = s.pair_state_id
      WHERE s.id = session_id
        AND auth.uid() IN (ps.user_a, ps.user_b)
    )
  );

-- ─────────────────────────────────────────────
-- coalter_fairness_ledger: 公平性台帳（内部のみ、Phase 1では非表示）
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coalter_fairness_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_state_id UUID NOT NULL REFERENCES coalter_pair_states(id),
  session_id UUID NOT NULL REFERENCES coalter_sessions(id),
  -- -1.0（完全にA寄り）〜 +1.0（完全にB寄り）、0=均衡
  bias_score REAL NOT NULL DEFAULT 0,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coalter_fairness_pair ON coalter_fairness_ledger (pair_state_id, decided_at DESC);

ALTER TABLE coalter_fairness_ledger ENABLE ROW LEVEL SECURITY;

-- 公平性台帳はペアメンバーのみ（Phase 1では読み取り不要だがRLSは設定）
CREATE POLICY "coalter_fairness_select" ON coalter_fairness_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM coalter_pair_states ps
      WHERE ps.id = coalter_fairness_ledger.pair_state_id
        AND auth.uid() IN (ps.user_a, ps.user_b)
    )
  );

CREATE POLICY "coalter_fairness_insert" ON coalter_fairness_ledger
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM coalter_pair_states ps
      WHERE ps.id = pair_state_id
        AND auth.uid() IN (ps.user_a, ps.user_b)
    )
  );

-- ─────────────────────────────────────────────
-- Realtime: coalter_sessions の変更をリアルタイムで配信
-- （相手がCoAlterを起動/終了した時に両方のクライアントに通知）
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.coalter_sessions';
  END IF;
END $$;
