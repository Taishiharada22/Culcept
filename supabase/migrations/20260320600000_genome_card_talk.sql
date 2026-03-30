-- Genome Card Exchange + Talk (DM)
-- CEO方針 2026-03-19: Genome データをカード化し交換・DM 機能を追加

-- ============================================================================
-- 1. genome_connections — ユーザー同士のカード交換接続
-- ============================================================================
CREATE TABLE IF NOT EXISTS genome_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','accepted','declined','blocked')),
  -- 非対称公開レベル: 各自が相手への公開度を独立制御
  visibility_requester  int NOT NULL DEFAULT 1 CHECK (visibility_requester BETWEEN 1 AND 3),
  visibility_target     int NOT NULL DEFAULT 1 CHECK (visibility_target BETWEEN 1 AND 3),
  created_at      timestamptz NOT NULL DEFAULT now(),
  responded_at    timestamptz,
  UNIQUE (requester_id, target_id),
  CHECK (requester_id != target_id)
);

CREATE INDEX idx_genome_conn_requester ON genome_connections(requester_id, status);
CREATE INDEX idx_genome_conn_target    ON genome_connections(target_id, status);

ALTER TABLE genome_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "genome_conn_select" ON genome_connections
  FOR SELECT USING (auth.uid() IN (requester_id, target_id));

CREATE POLICY "genome_conn_insert" ON genome_connections
  FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "genome_conn_update" ON genome_connections
  FOR UPDATE USING (auth.uid() IN (requester_id, target_id));

-- ============================================================================
-- 2. talk_threads — 接続ごとに1スレッド
-- ============================================================================
CREATE TABLE IF NOT EXISTS talk_threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   uuid NOT NULL UNIQUE REFERENCES genome_connections(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz
);

ALTER TABLE talk_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "talk_threads_select" ON talk_threads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM genome_connections c
      WHERE c.id = connection_id
        AND auth.uid() IN (c.requester_id, c.target_id)
    )
  );

-- ============================================================================
-- 3. talk_messages — DM メッセージ
-- ============================================================================
CREATE TABLE IF NOT EXISTS talk_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       uuid NOT NULL REFERENCES talk_threads(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz
);

CREATE INDEX idx_talk_msg_thread   ON talk_messages(thread_id, created_at);
CREATE INDEX idx_talk_msg_unread   ON talk_messages(thread_id, sender_id, read_at)
  WHERE read_at IS NULL;

ALTER TABLE talk_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "talk_msg_select" ON talk_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM talk_threads t
      JOIN genome_connections c ON c.id = t.connection_id
      WHERE t.id = thread_id
        AND auth.uid() IN (c.requester_id, c.target_id)
    )
  );

CREATE POLICY "talk_msg_insert" ON talk_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM talk_threads t
      JOIN genome_connections c ON c.id = t.connection_id
      WHERE t.id = thread_id
        AND c.status = 'accepted'
        AND auth.uid() IN (c.requester_id, c.target_id)
    )
  );

-- ============================================================================
-- 4. talk_read_cursors — 既読カーソル（未読バッジ計算用）
-- ============================================================================
CREATE TABLE IF NOT EXISTS talk_read_cursors (
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id       uuid NOT NULL REFERENCES talk_threads(id) ON DELETE CASCADE,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, thread_id)
);

ALTER TABLE talk_read_cursors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "talk_cursors_select" ON talk_read_cursors
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "talk_cursors_upsert" ON talk_read_cursors
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "talk_cursors_update" ON talk_read_cursors
  FOR UPDATE USING (user_id = auth.uid());
