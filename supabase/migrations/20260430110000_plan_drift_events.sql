-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Alter Plan: PlanDriftEvent 物理モデル
-- Wave 1 / W1-5 — migration draft (NOT for production push)
--
-- 設計書: docs/alter-plan-foundation-design.md
--   - §2.3 PlanDriftEvent (polymorphic target + targetSnapshot)
--   - §11 Privacy & Source Trace
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 設計判断（CEO 2026-04-30）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. target は target_type + target_id の polymorphic association（FK なし）
--    理由: plan_seeds / draft_plan_items / outfit_calendar_items の
--    entity が W1-5 時点でまだ存在しない。未来テーブルへの中途半端な FK は
--    作らず、柔軟なイベントログ基盤として持つ。
--
-- 2. target 存在確認は API 層で実施する（DB レベルでは強制しない）。
--
-- 3. target_snapshot は JSONB。snapshot は immutable な過去状態の写しで
--    検索主対象ではない。詳細スキーマは TypeScript の
--    PlanDriftTargetSnapshot 型で担保。DB では jsonb_typeof = 'object'
--    までの最低限の型保証のみ。
--
-- 4. predicted / actual も同様に JSONB（任意、存在時は object）。
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 物理層で強制する不変原則
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- - user_id NOT NULL + RLS user-scoped 完全分離
-- - target_type / drift_type / evidence_source / evidence_strength の許可値 CHECK
-- - target_id NOT NULL（FK は張らないが必ず uuid を持つ）
-- - target_snapshot は JSONB object（jsonb_typeof = 'object'）
-- - predicted / actual も JSONB object（任意、存在時は object）
-- - repetition_count / time_window_days は非負
--
-- 本 migration は draft 状態。`supabase db push` は CEO 承認後。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS plan_drift_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Polymorphic target（FK 不在、API 層で存在確認）
  -- W1-5 時点では external_anchor のみが既存。他は未来テーブル。
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  target_type TEXT NOT NULL
    CHECK (target_type IN (
      'external_anchor',
      'plan_seed',
      'draft_plan_item',
      'outfit_calendar_item'
    )),
  target_id UUID NOT NULL,

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Drift 分類（§2.3 PlanDriftType）
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  drift_type TEXT NOT NULL
    CHECK (drift_type IN (
      'time_changed',
      'location_changed',
      'deleted',
      'delayed',
      'completed',
      'skipped',
      'replaced'
    )),

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 観測値（任意、JSONB）
  -- 詳細形は TypeScript の PlanDriftPredicted / PlanDriftActual で担保
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  predicted JSONB,
  actual JSONB,

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 証拠（§2.3）
  -- evidence_strength の動的昇格は Wave 4。W1-5 では保存のみ。
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  evidence_source TEXT NOT NULL
    CHECK (evidence_source IN ('passive', 'inferred', 'explicit')),

  evidence_strength TEXT NOT NULL
    CHECK (evidence_strength IN ('weak', 'medium', 'strong')),

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 反復検出（Wave 4 で本格利用、W1-5 では保存のみ）
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  pattern_key TEXT,
  repetition_count INTEGER
    CHECK (repetition_count IS NULL OR repetition_count >= 0),
  time_window_days INTEGER
    CHECK (time_window_days IS NULL OR time_window_days >= 0),

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 対象削除耐性スナップショット（§2.3）
  -- snapshot は immutable な過去状態の写し。
  -- 元 target が CASCADE 削除されても drift event の意味（何がいつズレたか）は失われない。
  -- 詳細スキーマは TypeScript の PlanDriftTargetSnapshot 型で担保。
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  target_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- JSONB の最低限の型保証（object であること）
  -- 詳細形は API/TypeScript 層で担保（DB ではやりすぎない）
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CONSTRAINT target_snapshot_is_object CHECK (
    jsonb_typeof(target_snapshot) = 'object'
  ),
  CONSTRAINT predicted_is_object CHECK (
    predicted IS NULL OR jsonb_typeof(predicted) = 'object'
  ),
  CONSTRAINT actual_is_object CHECK (
    actual IS NULL OR jsonb_typeof(actual) = 'object'
  )
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Indexes
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 特定ユーザーの drift event 時系列（履歴表示 / 集計）
CREATE INDEX idx_plan_drift_events_user_created
  ON plan_drift_events (user_id, created_at DESC);

-- 特定 target の drift event（target 経由検索 / snapshot 確認）
-- target_type と target_id の複合検索
CREATE INDEX idx_plan_drift_events_target
  ON plan_drift_events (target_type, target_id, created_at DESC);

-- 反復検出用 partial index（pattern_key を持つイベントのみ対象）
CREATE INDEX idx_plan_drift_events_user_pattern
  ON plan_drift_events (user_id, pattern_key)
  WHERE pattern_key IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RLS（user-scoped 完全分離、§11）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE plan_drift_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_drift_events_owner_select"
  ON plan_drift_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "plan_drift_events_owner_insert"
  ON plan_drift_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: pattern_key の後付けや repetition_count の集計バッチ用（Wave 4）
CREATE POLICY "plan_drift_events_owner_update"
  ON plan_drift_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: ユーザーのプライバシー権（自分の drift 履歴削除可能）
CREATE POLICY "plan_drift_events_owner_delete"
  ON plan_drift_events FOR DELETE
  USING (auth.uid() = user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Comments（設計書との traceability）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMMENT ON TABLE plan_drift_events IS
  'Alter Plan PlanDriftEvent. Polymorphic target log without FK (target existence checked at API layer). See docs/alter-plan-foundation-design.md §2.3';
COMMENT ON COLUMN plan_drift_events.target_type IS
  'external_anchor / plan_seed / draft_plan_item / outfit_calendar_item. CEO 2026-04-30 decision: NO foreign key (some target tables do not exist yet at W1-5).';
COMMENT ON COLUMN plan_drift_events.target_id IS
  'UUID of the target entity. NO foreign key (polymorphic). API layer must verify existence on INSERT and refuse stale references.';
COMMENT ON COLUMN plan_drift_events.target_snapshot IS
  'Immutable JSONB snapshot of target at drift time. Survives target deletion. Schema enforced by TypeScript PlanDriftTargetSnapshot, not DB.';
COMMENT ON COLUMN plan_drift_events.predicted IS
  'Predicted values at drift time (optional JSONB object). Schema: PlanDriftPredicted in TypeScript.';
COMMENT ON COLUMN plan_drift_events.actual IS
  'Actual observed values (optional JSONB object). Schema: PlanDriftActual in TypeScript.';
COMMENT ON COLUMN plan_drift_events.evidence_source IS
  'passive (auto-captured edits / W1-6) / inferred (LLM analysis / Wave 2) / explicit (user check-in / Wave 3).';
COMMENT ON COLUMN plan_drift_events.evidence_strength IS
  'weak / medium / strong. W1-5 stores only. Dynamic upgrade based on repetition is Wave 4.';
COMMENT ON COLUMN plan_drift_events.pattern_key IS
  'Hash for repetition detection. NULL means single event. Used by Wave 4 reflexive learning.';
COMMENT ON COLUMN plan_drift_events.repetition_count IS
  'Cumulative count of events with the same pattern_key. Updated by Wave 4 batch.';
COMMENT ON COLUMN plan_drift_events.time_window_days IS
  'Time window (in days) for repetition counting. NULL if not yet computed.';
