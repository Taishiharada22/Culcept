-- ============================================================
-- Unread message tracking + candidate_id alias
-- ============================================================

-- Add candidate_id for direct candidate-based queries
ALTER TABLE rendezvous_messages
  ADD COLUMN IF NOT EXISTS candidate_id uuid;

-- Add read_at for unread tracking
ALTER TABLE rendezvous_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Index for unread count queries
CREATE INDEX IF NOT EXISTS idx_messages_candidate_unread
  ON rendezvous_messages (candidate_id, sender_id, read_at)
  WHERE read_at IS NULL;

-- Index for candidate_id lookups
CREATE INDEX IF NOT EXISTS idx_messages_candidate
  ON rendezvous_messages (candidate_id, created_at);
