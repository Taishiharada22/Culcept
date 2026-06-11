-- ════════════════════════════════════════════════════════════════════════
-- lifeops_structured_sources — Life Ops 構造化 source（A-4-c27・**draft / 未 apply**）
--
-- 設計: docs/life-ops-structured-storage-a4-c27-mini-design.md / docs/life-ops-real-source-contract-a4-c26-mini-design.md
--
-- 役割: ユーザー自身が入力する**構造化された**期限（税/免許/パスポート/支払い/更新/提出）と
--   周期（美容院/眉/買い物/日用品/定期メンテ/前回完了日）の保存先。candidate へは
--   column-restricted reader → c26 structured DTO → normalizer 経由でのみ到達（DB row 直結禁止）。
--
-- 方針（c26 contract の mirror・structured-only）:
--   - **free text 列を持たない**: free_text / title / note / memo / description / place_query / url / raw /
--     source_ref / calendar_title / event_name / store_name / location_name は**列として存在しない**
--     （表示名は category/menu 辞書から導出・schema が自由文を表現不能）。
--   - **category_id は TEXT + app 層辞書 validation**（L-1 辞書は拡張前提＝DB CHECK 化は migration 負債。
--     辞書 roundtrip は c26 normalizer の必須経路として test 固定済み）。**menu は安定 3 値 enum → DB CHECK 併用**。
--   - **編集可能な設定系**（M1 の append-only と異なり owner UPDATE policy を許可・updated_at trigger あり）。
--   - **RLS owner-only**（auth.uid() = user_id）・service_role 非前提・cross-user 不可。
--
-- ⚠ **staging apply 済（2026-06-11・A-4-c28・CEO 実行・Dashboard SQL Editor・POST 全 PASS）**。**production へは未 apply**（別 GO）。
--    SQL Editor 実行ゆえ supabase_migrations history 未記録（c11 と同様・既知）。staging には c27 版を適用済みで、
--    本 file はその後 trigger/policy に DROP IF EXISTS を前置して**再実行冪等化**（end-state は staging と同一）。
--    apply 後の database.types 更新は reader 接続 slice の checklist 項目。
--    ── rollback / down（新規 table ゆえ clean DROP・別 revert migration で実行）:
--      DROP TRIGGER IF EXISTS trg_lifeops_structured_sources_updated_at ON lifeops_structured_sources;
--      DROP FUNCTION IF EXISTS lifeops_structured_sources_set_updated_at();
--      DROP INDEX IF EXISTS idx_lifeops_structured_sources_owner;
--      DROP TABLE IF EXISTS lifeops_structured_sources;  -- policies は table と共に drop
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lifeops_structured_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 種別（期限 or 周期・per-type 整合は下部 CHECK）
  source_type TEXT NOT NULL
    CHECK (source_type IN ('deadline', 'cadence')),

  -- L-1 辞書 category（TEXT + app 層 validation・§方針）/ L-2 menu（安定 enum → DB でも固定）
  category_id TEXT NOT NULL,
  menu TEXT
    CHECK (menu IS NULL OR menu IN ('cut', 'color', 'treatment')),

  -- deadline 用（due 期日）/ cadence 用（前回完了・個人周期[L-9 予約]）
  due_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ,
  typical_interval_days INTEGER
    CHECK (typical_interval_days IS NULL OR (typical_interval_days > 0 AND typical_interval_days <= 730)),

  -- occurrence 厳密照合用の非 PII 構造キー（writer が deriveLifeOpsOccurrenceKey で導出・将来 UI slice）
  occurrence_key TEXT,

  confidence TEXT NOT NULL DEFAULT 'high'
    CHECK (confidence IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- per-type 整合（deadline 行に cadence 列が混ざれない / cadence は完了日か周期の少なくとも一方）
  CONSTRAINT lifeops_structured_sources_deadline_shape CHECK (
    source_type <> 'deadline' OR (due_at IS NOT NULL AND last_completed_at IS NULL AND typical_interval_days IS NULL)
  ),
  CONSTRAINT lifeops_structured_sources_cadence_shape CHECK (
    source_type <> 'cadence' OR (due_at IS NULL AND (last_completed_at IS NOT NULL OR typical_interval_days IS NOT NULL))
  )
);

-- ── index（owner の active 読み取り）──
CREATE INDEX IF NOT EXISTS idx_lifeops_structured_sources_owner
  ON lifeops_structured_sources (user_id, status, source_type);

-- ── updated_at trigger（既存 per-table 方式の踏襲）──
CREATE OR REPLACE FUNCTION lifeops_structured_sources_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lifeops_structured_sources_updated_at ON lifeops_structured_sources;
CREATE TRIGGER trg_lifeops_structured_sources_updated_at
  BEFORE UPDATE ON lifeops_structured_sources
  FOR EACH ROW EXECUTE FUNCTION lifeops_structured_sources_set_updated_at();

-- ── RLS（owner-only・編集可能な設定系＝UPDATE policy あり・DROP IF EXISTS 前置で再実行冪等）──
ALTER TABLE lifeops_structured_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lifeops_structured_sources_owner_select ON lifeops_structured_sources;
CREATE POLICY lifeops_structured_sources_owner_select ON lifeops_structured_sources
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS lifeops_structured_sources_owner_insert ON lifeops_structured_sources;
CREATE POLICY lifeops_structured_sources_owner_insert ON lifeops_structured_sources
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lifeops_structured_sources_owner_update ON lifeops_structured_sources;
CREATE POLICY lifeops_structured_sources_owner_update ON lifeops_structured_sources
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lifeops_structured_sources_owner_delete ON lifeops_structured_sources;
CREATE POLICY lifeops_structured_sources_owner_delete ON lifeops_structured_sources
  FOR DELETE USING (auth.uid() = user_id);
