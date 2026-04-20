-- CoAlter Phase 1.5.4.6: Topic Scope 永続化
--
-- 目的: 「来週木曜のランチ」と言ったのに「四国」の話が引っ張られるバグの対策。
--       セッション単位で topic anchor（話題の核）を保持する。
--
-- 設計原則:
--   - 起動時に anchor を決定（invoke userMessage か、直前の talk_messages）
--   - scope は JSONB で theme/timeRef/placeRef/confidence を保持（柔軟な拡張を許容）
--   - 監査のため anchor text を全文保持
--   - RLS は coalter_sessions 既存ポリシーをそのまま継承（同じ行への更新）

ALTER TABLE coalter_sessions
  ADD COLUMN IF NOT EXISTS topic_anchor_message_id UUID,
  ADD COLUMN IF NOT EXISTS topic_anchor_text TEXT,
  ADD COLUMN IF NOT EXISTS topic_anchor_scope JSONB;

COMMENT ON COLUMN coalter_sessions.topic_anchor_message_id IS
  'Phase 1.5.4.6: 話題アンカー発話の talk_messages.id。NULL = invoke userMessage が anchor。';
COMMENT ON COLUMN coalter_sessions.topic_anchor_text IS
  'Phase 1.5.4.6: 話題アンカーの原文（監査用）。誤抽出時に遡れるよう保持。';
COMMENT ON COLUMN coalter_sessions.topic_anchor_scope IS
  'Phase 1.5.4.6: 抽出された scope（theme/timeRef/placeRef/confidence/anchorConfidence/source）。';

-- anchor でよく引かれるので index（theme / place の運用分析用）
CREATE INDEX IF NOT EXISTS idx_coalter_sessions_anchor_theme
  ON coalter_sessions ((topic_anchor_scope ->> 'theme'))
  WHERE topic_anchor_scope IS NOT NULL;
