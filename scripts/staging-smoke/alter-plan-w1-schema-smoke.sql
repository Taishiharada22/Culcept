-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Alter Plan W1 Schema Smoke (副作用ゼロ、SELECT only)
--
-- 実行: staging Supabase project の Dashboard SQL Editor で全 §を順次 Run
-- 前提: W1-3 (external_anchors / external_anchor_sources)
--       W1-5 (plan_drift_events) migration が staging に適用済み
--
-- 設計書: docs/alter-plan-foundation-design.md
-- 手順書: docs/alter-plan-a1-staging-smoke.md
--
-- 注意: SQL Editor は postgres superuser role で実行される。
--       RLS の policy 存在・定義は確認できるが、実 user 文脈での
--       enforcement は確認できない（A-2 の API smoke で別途検証）。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §1. テーブル存在確認
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 期待: 3 行（external_anchor_sources / external_anchors / plan_drift_events）

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'external_anchor_sources',
    'external_anchors',
    'plan_drift_events'
  )
ORDER BY table_name;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §2. カラム情報（型 / nullable / default）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 期待:
--   external_anchor_sources: 11 行
--   external_anchors:        19 行
--   plan_drift_events:       13 行
-- 重要 field:
--   external_anchors.confirmed_at: timestamp with time zone, NO（NOT NULL）
--   external_anchors.anchor_kind:   text, NO
--   external_anchors.user_id:        uuid, NO
--   external_anchors.source_id:      uuid, NO
--   external_anchors.start_time:     time, NO (W1-3 fix で TIME 型に変更)
--   external_anchors.end_time:       time, YES (nullable)
--   plan_drift_events.target_type:   text, NO
--   plan_drift_events.target_id:     uuid, NO
--   plan_drift_events.target_snapshot: jsonb, NO + default '{}'

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('external_anchor_sources', 'external_anchors', 'plan_drift_events')
ORDER BY table_name, ordinal_position;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §3. CHECK constraint 一覧
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 期待: 計 21 件以上
--   external_anchor_sources の CHECK:
--     - source_type IN (...)
--     - raw_retention IN ('discarded', 'stored')
--     - raw_retention_integrity（discarded ↔ path/expires NULL）
--   external_anchors の CHECK:
--     - location_category IN (...) OR NULL
--     - rigidity IN ('hard', 'soft')
--     - confidence range (0-1) OR NULL
--     - sensitive_category IN (...) OR NULL
--     - anchor_kind IN ('one_off', 'recurring')
--     - anchor_kind_one_off_columns
--     - anchor_kind_recurring_columns
--     - validity_window_order
--     - recurrence_rule_length
--   plan_drift_events の CHECK:
--     - target_type IN (...)
--     - drift_type IN (...)
--     - evidence_source IN (...)
--     - evidence_strength IN (...)
--     - repetition_count >= 0 OR NULL
--     - time_window_days >= 0 OR NULL
--     - target_snapshot_is_object
--     - predicted_is_object
--     - actual_is_object

SELECT
  conrelid::regclass::text AS table_name,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'c'
  AND conrelid::regclass::text IN (
    'external_anchor_sources',
    'external_anchors',
    'plan_drift_events'
  )
ORDER BY conrelid::regclass::text, conname;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §4. NOT NULL 制約確認（必須 field）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 期待: 全行 is_nullable = NO

SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'external_anchors' AND column_name IN
      ('id', 'user_id', 'source_id', 'title', 'start_time', 'rigidity',
       'confirmed_at', 'anchor_kind', 'created_at', 'updated_at'))
    OR
    (table_name = 'external_anchor_sources' AND column_name IN
      ('id', 'user_id', 'source_type', 'captured_at', 'raw_retention', 'created_at'))
    OR
    (table_name = 'plan_drift_events' AND column_name IN
      ('id', 'user_id', 'target_type', 'target_id', 'drift_type',
       'evidence_source', 'evidence_strength', 'target_snapshot', 'created_at'))
  )
ORDER BY table_name, column_name;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §5. Foreign Key 制約確認
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 期待 FK:
--   external_anchor_sources.user_id → auth.users(id) ON DELETE CASCADE
--   external_anchors.user_id        → auth.users(id) ON DELETE CASCADE
--   external_anchors.source_id      → external_anchor_sources(id) ON DELETE CASCADE
--   plan_drift_events.user_id       → auth.users(id) ON DELETE CASCADE
--
-- 重要: plan_drift_events の target_id には FK が**ない**（polymorphic、API 層で検証）

SELECT
  conrelid::regclass::text AS table_name,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid::regclass::text IN (
    'external_anchor_sources',
    'external_anchors',
    'plan_drift_events'
  )
ORDER BY conrelid::regclass::text, conname;

-- §5.1 plan_drift_events に target_id への FK が**ない**ことを明示確認
-- 期待: 0 行（target_id を含む FK は存在しない）

SELECT
  conrelid::regclass::text AS table_name,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid::regclass::text = 'plan_drift_events'
  AND pg_get_constraintdef(oid) LIKE '%target_id%';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §6. Index 一覧
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 期待: 計 6 件以上（partial index 含む）
--   external_anchor_sources:
--     - PK (id)
--     - idx_external_anchor_sources_user_captured
--     - idx_external_anchor_sources_stored_expiry (partial WHERE raw_retention = 'stored')
--   external_anchors:
--     - PK (id)
--     - idx_external_anchors_user_date (partial WHERE anchor_kind = 'one_off')
--     - idx_external_anchors_user_validity (partial WHERE anchor_kind = 'recurring')
--     - idx_external_anchors_source
--   plan_drift_events:
--     - PK (id)
--     - idx_plan_drift_events_user_created
--     - idx_plan_drift_events_target
--     - idx_plan_drift_events_user_pattern (partial WHERE pattern_key IS NOT NULL)

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('external_anchor_sources', 'external_anchors', 'plan_drift_events')
ORDER BY tablename, indexname;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §7. RLS enabled 確認
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 期待: 全 3 行で rowsecurity = true

SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('external_anchor_sources', 'external_anchors', 'plan_drift_events')
ORDER BY tablename;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §8. RLS policy 一覧
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 期待:
--   external_anchor_sources: 4 policy（SELECT / INSERT / UPDATE / DELETE all owner-scoped）
--   external_anchors:        4 policy（同上）
--   plan_drift_events:       3 policy（SELECT / INSERT / DELETE のみ、UPDATE 意図的不在）
-- 全 policy の qual / with_check は auth.uid() = user_id

SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('external_anchor_sources', 'external_anchors', 'plan_drift_events')
ORDER BY tablename, cmd, policyname;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §9. plan_drift_events に UPDATE policy が**不在**であることを明示確認
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 期待: update_policy_count = 0
-- これが append-only event log の物理保証（W1-5b で確定）

SELECT
  tablename,
  count(*) FILTER (WHERE cmd = 'UPDATE') AS update_policy_count,
  count(*) FILTER (WHERE cmd = 'SELECT') AS select_policy_count,
  count(*) FILTER (WHERE cmd = 'INSERT') AS insert_policy_count,
  count(*) FILTER (WHERE cmd = 'DELETE') AS delete_policy_count,
  count(*) AS total_policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'plan_drift_events'
GROUP BY tablename;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §10. テーブル COMMENT 確認
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 期待:
--   plan_drift_events の comment に "APPEND-ONLY" を含む
--   external_anchors の comment に "discriminated union" を含む
--   external_anchor_sources の comment に "Source trace" を含む

SELECT
  c.relname AS table_name,
  d.description AS table_comment
FROM pg_class c
JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = 0
WHERE c.relname IN ('external_anchor_sources', 'external_anchors', 'plan_drift_events')
ORDER BY c.relname;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §11. カラム COMMENT 抜粋（重要 field の意図記録）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 期待:
--   external_anchors.confirmed_at の comment に "unconfirmed AI extractions must NEVER" を含む
--   external_anchors.anchor_kind の comment に "Mutual exclusivity enforced" を含む
--   plan_drift_events.target_type の comment に "NO foreign key" を含む

SELECT
  c.relname AS table_name,
  a.attname AS column_name,
  pgd.description AS column_comment
FROM pg_class c
JOIN pg_attribute a ON a.attrelid = c.oid
JOIN pg_description pgd ON pgd.objoid = c.oid AND pgd.objsubid = a.attnum
WHERE c.relname IN ('external_anchors', 'external_anchor_sources', 'plan_drift_events')
  AND a.attnum > 0
ORDER BY c.relname, a.attnum;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PASS criteria summary (CEO 確認用)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §1:  3 件
-- §2:  external_anchor_sources=11, external_anchors=19, plan_drift_events=13
-- §3:  21 件以上の CHECK
-- §4:  必須 field 全て is_nullable=NO
-- §5:  FK 4 件、§5.1 で plan_drift_events に target_id への FK ゼロ
-- §6:  index 計 6 件以上（partial 含む）
-- §7:  全 3 件で rowsecurity=true
-- §8:  source=4 / anchors=4 / drift=3 policy
-- §9:  plan_drift_events update_policy_count=0
-- §10: plan_drift_events comment に "APPEND-ONLY" を含む
-- §11: 設計意図 comment が保持されている
--
-- 全項目 PASS なら Schema smoke PASS → Behavior smoke へ進む
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
