-- Journal title (AI-generated one-line summary) and photo support
-- Part of Origin Phase 1: competing with Day One on record richness

ALTER TABLE origin_journal_entries
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN origin_journal_entries.title IS
  'AI生成の一文タイトル。保存後に非同期で付与。ユーザー編集可能';
COMMENT ON COLUMN origin_journal_entries.photo_url IS
  '写真1枚のStorage URL。保存後に追加可能（後から追加設計）';
