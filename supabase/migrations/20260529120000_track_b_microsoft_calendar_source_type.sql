-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Track B (provider native) TB-1 — Microsoft / Outlook import 対応 (= source_type 追加)
--
-- 設計: docs/alter-plan-track-b-provider-native-readiness.md §3 TB-1 (= CEO 2026-05-29 承認)
--
-- 目的:
--   external_anchor_sources.source_type CHECK に 'microsoft_calendar' を追加
--   (= Outlook/Microsoft 365 連携取り込みを ICS / Google と区別して schema レベルで識別)
--
-- 背景:
--   - Track B Phase 1 = Outlook (Microsoft Graph OAuth)。 Google の 'google_calendar'
--     (= migration 20260529100000) と同パターンで provider 由来を恒久識別。
--   - mapper / sourceType union / ALLOWED_SOURCE_TYPES も 'microsoft_calendar' に拡張
--     (= 同 commit 内、 lib/oauth/microsoftEventsToAnchorMapper.ts [TB-3] + lib/plan/external-anchor-*.ts)
--   - CEO 確定: 'outlook_calendar' ではなく 'microsoft_calendar' を採用。
--
-- 不変原則 (= ICS / Google migration と同パターン、 最小 alter):
--   - 既存 row 影響なし (= DROP/ADD CHECK の sequence のみ、 既存値は全て新 CHECK を満たす)
--   - external_uid 列は ICS migration (20260526100000) で追加済 → 本 migration では触らない
--   - idempotent (= DROP IF EXISTS + ADD で再実行 OK)
--   - RLS 既存 policy 不変 (= user_id scope のまま)
--   - user_calendar_connections.provider CHECK は既に 'microsoft' を許可済
--     (= migration 20260526110000) → connection 側は本 migration 不要
--
-- 注:
--   - 本 migration は **draft 状態**。 supabase db push / apply は **CEO 別承認** (= readiness §7 補足、 TB stop 手前)。
--   - staging 適用順: 20260529100000 (= google_calendar) の後に本 migration。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- source_type CHECK に 'microsoft_calendar' 追加
--
-- 旧: 'manual', 'template', 'pdf', 'image', 'chat', 'ics', 'google_calendar'
-- 新: 'manual', 'template', 'pdf', 'image', 'chat', 'ics', 'google_calendar', 'microsoft_calendar'
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE external_anchor_sources
  DROP CONSTRAINT IF EXISTS external_anchor_sources_source_type_check;

ALTER TABLE external_anchor_sources
  ADD CONSTRAINT external_anchor_sources_source_type_check
  CHECK (source_type IN ('manual', 'template', 'pdf', 'image', 'chat', 'ics', 'google_calendar', 'microsoft_calendar'));

COMMENT ON COLUMN external_anchor_sources.source_type IS
  'manual / template / pdf / image / chat / ics / google_calendar / microsoft_calendar (= Track B 2026-05-29 追加、 Outlook/Microsoft 365 連携)';
