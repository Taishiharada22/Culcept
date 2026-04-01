-- Tour / onboarding seen-state を user 単位で永続化するテーブル
-- localStorage はキャッシュ扱い。真実は DB。

CREATE TABLE IF NOT EXISTS tour_seen_states (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_key   TEXT        NOT NULL,
  seen_version INT       NOT NULL DEFAULT 1,
  seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tour_key)
);

-- RLS
ALTER TABLE tour_seen_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tour_seen_select"
  ON tour_seen_states FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "tour_seen_insert"
  ON tour_seen_states FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tour_seen_update"
  ON tour_seen_states FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_tour_seen_user
  ON tour_seen_states (user_id);
