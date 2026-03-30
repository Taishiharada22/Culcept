-- ============================================================
-- Rendezvous: チャットメッセージにメディア対応を追加
-- ============================================================

ALTER TABLE rendezvous_messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'voice', 'system')),
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_metadata jsonb;

COMMENT ON COLUMN rendezvous_messages.message_type IS 'text | image | voice | system';
COMMENT ON COLUMN rendezvous_messages.media_url IS 'Storage URL for image/voice messages';
COMMENT ON COLUMN rendezvous_messages.media_metadata IS '{"width":w,"height":h,"duration_ms":d,"size_bytes":n}';
