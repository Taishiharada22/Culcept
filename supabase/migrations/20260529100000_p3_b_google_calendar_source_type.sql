-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- P3 Phase B Migration — Google Calendar import 対応 (= source_type 恒久化)
--
-- 設計: docs/alter-plan-p3-phase-b-readiness.md §0 / §F (= β 恒久化、 CEO 2026-05-29 確定)
--
-- 目的:
--   external_anchor_sources.source_type CHECK に 'google_calendar' を追加
--   (= Google Calendar import を ICS と区別して schema レベルで識別)
--
-- 背景:
--   - P3-A-1-2 phase では googleEventsToAnchorMapper が 'ics' を暫定流用していた
--     (= migration 回避の暫定措置、 「恒久化しない」 と当時確定)
--   - Phase B 本流完成にあたり、 Google 由来を恒久的に識別するため CHECK を拡張
--   - mapper / sourceType union / ALLOWED_SOURCE_TYPES も 'google_calendar' に切替済
--     (= 同 commit 内、 lib/oauth/googleEventsToAnchorMapper.ts + lib/plan/external-anchor-*.ts)
--
-- 不変原則 (= ICS migration 20260526100000 と同パターン、 最小 alter):
--   - 既存 row 影響なし (= DROP/ADD CHECK の sequence のみ、 既存値は全て新 CHECK を満たす)
--   - external_uid 列は ICS migration (20260526100000) で追加済 → 本 migration では触らない
--   - idempotent (= DROP IF EXISTS + ADD で再実行 OK)
--   - RLS 既存 policy 不変 (= user_id scope のまま)
--
-- 注:
--   - 本 migration draft 状態。 supabase db push は CEO 承認後 (= readiness §5 stop)。
--   - staging 適用順: 20260526110000 (= oauth tables) → 本 migration (= 同 apply batch)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- source_type CHECK に 'google_calendar' 追加
--
-- 旧: 'manual', 'template', 'pdf', 'image', 'chat', 'ics'
-- 新: 'manual', 'template', 'pdf', 'image', 'chat', 'ics', 'google_calendar'
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE external_anchor_sources
  DROP CONSTRAINT IF EXISTS external_anchor_sources_source_type_check;

ALTER TABLE external_anchor_sources
  ADD CONSTRAINT external_anchor_sources_source_type_check
  CHECK (source_type IN ('manual', 'template', 'pdf', 'image', 'chat', 'ics', 'google_calendar'));

COMMENT ON COLUMN external_anchor_sources.source_type IS
  'manual / template / pdf / image / chat / ics / google_calendar (= P3 Phase B 2026-05-29 追加、 Google Calendar 連携)';
