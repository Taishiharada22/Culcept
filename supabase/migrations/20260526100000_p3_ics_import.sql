-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- P3 W3 Migration — .ics / iCal Import 対応
--
-- 設計書: docs/alter-plan-p3-ics-import-readiness.md §2 Q2 / Q4
--
-- 目的:
--   1. external_anchor_sources.source_type CHECK に 'ics' を追加
--   2. external_anchors.external_uid TEXT 列を追加 (= VEVENT UID 保持、 W3 dedup 用)
--
-- 不変原則 (= CEO 承認の最小 alter):
--   - 既存 row 影響なし (= ALTER ADD COLUMN + DROP/ADD CHECK の sequence)
--   - external_uid は NULL 許容 (= 既存 manual / template / pdf / image / chat anchor は持たない)
--   - idempotent (= IF NOT EXISTS / DROP IF EXISTS で再実行 OK)
--   - RLS 既存 policy 不変 (= user_id scope のまま)
--
-- 注:
--   - 本 migration draft 状態。 supabase db push は CEO 承認後。
--   - 既存 20260430100000_external_anchors.sql の sequence は破壊しない (= 上書きしない)。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. source_type CHECK に 'ics' 追加
--
-- 旧: 'manual', 'template', 'pdf', 'image', 'chat'
-- 新: 'manual', 'template', 'pdf', 'image', 'chat', 'ics'
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE external_anchor_sources
  DROP CONSTRAINT IF EXISTS external_anchor_sources_source_type_check;

ALTER TABLE external_anchor_sources
  ADD CONSTRAINT external_anchor_sources_source_type_check
  CHECK (source_type IN ('manual', 'template', 'pdf', 'image', 'chat', 'ics'));

COMMENT ON COLUMN external_anchor_sources.source_type IS
  'manual / template / pdf / image / chat / ics (= P3 W3 2026-05-26 追加、 iCalendar import)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. external_anchors.external_uid 新 column
--
-- 用途: .ics import 時の VEVENT UID 保持 → 同 UID 再 import で dedup
-- NULL 許容: 既存 manual 等の anchor は UID を持たない
-- index: (user_id, external_uid) で dedup lookup を高速化
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE external_anchors
  ADD COLUMN IF NOT EXISTS external_uid TEXT;

COMMENT ON COLUMN external_anchors.external_uid IS
  '.ics VEVENT UID (= P3 W3、 NULL 許容、 ics 以外の source では NULL)';

-- partial index: external_uid NOT NULL のみ対象 (= dedup lookup 用、 ics anchor のみ)
CREATE INDEX IF NOT EXISTS idx_external_anchors_uid_dedup
  ON external_anchors (user_id, external_uid)
  WHERE external_uid IS NOT NULL;
