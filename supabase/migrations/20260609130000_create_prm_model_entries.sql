-- ════════════════════════════════════════════════════════════════════════
-- prm_model_entries — PRM 本体（review 済 tendency）（A1-7-29 / M3・**draft / 未 apply**）
--
-- 設計: docs/prm-m3-model-entries-design.md（A1-7-29）/ docs/prm-persistence-schema-design.md §3.3（A1-7-5）
--       M2: prm_review_decisions（A1-7-27・FK 先）
--
-- 役割: 人間が **approve した tendency** の蓄積＝**「第二の自己」の PRM 本体**。
--   events(M1) を集約した proposal を、人間が review(M2) で approve した結果だけが entry になる（**自動学習禁止**）。
--   保持するのは **(context_dimension, context_value, tendency_direction) の文脈束縛 tendency**＝性格/trait でない。
--
-- 方針（過断定防止・privacy・review gate・可逆）:
--   - **reviewRequired の構造的実体**: `review_decision_id` を prm_review_decisions に **NOT NULL FK**＝review 決定なしに entry は生まれない。
--   - **certainty CHECK in (low, tentative)＝high を DB で不可能化**（PRM の確からしさは最大 tentative）。
--   - **counter-evidence**（counter_count）/ **代替仮説**（still_possible code[]・潰さない）/ **decay_weight**（recency 減衰）を保持。
--   - **可逆**: `supersedes_id`（自己 FK・versioning）/ `retracted_at`（論理削除・rollback）/ `user_correction`（強い override）。
--   - **structured-only**: raw / 元発話 / seedRef を列に持たない。jsonb 不使用（flat 列 + code[]・CHECK 強制）。**personality/trait 列なし**。
--   - **RLS owner-only**（auth.uid()=user_id）・service_role 非前提・**user_visible**（ユーザーが見て訂正できる）。
--
-- ⚠ 本 migration は **M3 schema draft**。**実 DB への apply / db push / local reset は別 GO（CEO 承認後）**。
--    **FK 依存**: prm_review_decisions（M2・20260609120000）を **先に apply** する必要がある。
--    ── revert / down（M3 独立で可逆・新規 table ゆえ clean DROP）:
--      DROP INDEX IF EXISTS idx_prm_model_entries_user_active;
--      DROP INDEX IF EXISTS idx_prm_model_entries_user_context;
--      DROP TABLE IF EXISTS prm_model_entries;  -- policies/trigger は table と共に drop
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS prm_model_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ── 文脈束縛 tendency（trait でない）──
  context_dimension TEXT NOT NULL
    CHECK (context_dimension IN ('band', 'durationBucket', 'confidence', 'source')),
  context_value TEXT NOT NULL,
  tendency_direction TEXT NOT NULL
    CHECK (tendency_direction IN ('adoption', 'non_adoption', 'deferral')),
  favored_hypothesis TEXT NOT NULL,
  still_possible TEXT[] NOT NULL DEFAULT '{}', -- 代替仮説 code（潰さない）

  -- ── evidence / 確からしさ（過断定防止）──
  evidence_count INTEGER NOT NULL
    CHECK (evidence_count >= 0),
  counter_count INTEGER NOT NULL
    CHECK (counter_count >= 0),
  certainty TEXT NOT NULL
    CHECK (certainty IN ('low', 'tentative')), -- **high を構造的に不可能化**
  decay_weight REAL NOT NULL DEFAULT 1.0
    CHECK (decay_weight >= 0 AND decay_weight <= 1), -- recency 減衰

  -- ── review gate の構造的実体（review なしに entry なし＝自動学習禁止）──
  review_decision_id UUID NOT NULL REFERENCES prm_review_decisions(id) ON DELETE CASCADE,

  -- ── 可逆 / user override ──
  supersedes_id UUID REFERENCES prm_model_entries(id) ON DELETE SET NULL, -- versioning（self FK・null 可）
  user_visible BOOLEAN NOT NULL DEFAULT TRUE,                              -- ユーザーが見える
  user_correction TEXT                                                    -- ユーザー訂正（強い override・structured code・raw でない）
    CHECK (user_correction IS NULL OR user_correction IN ('rejected', 'direction_adjusted', 'context_refined')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retracted_at TIMESTAMPTZ -- 論理削除（rollback・null=有効）
);

-- ── indexes（context ごとの active tendency 照会 + active subset）──
CREATE INDEX IF NOT EXISTS idx_prm_model_entries_user_context
  ON prm_model_entries (user_id, context_dimension, context_value);
CREATE INDEX IF NOT EXISTS idx_prm_model_entries_user_active
  ON prm_model_entries (user_id)
  WHERE retracted_at IS NULL;

-- ── updated_at trigger（UPDATE で自動更新・mutable な model 層）──
CREATE OR REPLACE FUNCTION set_prm_model_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prm_model_entries_updated_at
  BEFORE UPDATE ON prm_model_entries
  FOR EACH ROW EXECUTE FUNCTION set_prm_model_entries_updated_at();

-- ── RLS（owner-only・service_role 非前提・SELECT/INSERT/UPDATE/DELETE）──
--   UPDATE 許可（retracted_at / user_correction / decay_weight 更新）。CHECK が certainty high を UPDATE でも禁止。
ALTER TABLE prm_model_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY prm_model_entries_owner_select ON prm_model_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY prm_model_entries_owner_insert ON prm_model_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY prm_model_entries_owner_update ON prm_model_entries
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY prm_model_entries_owner_delete ON prm_model_entries
  FOR DELETE USING (auth.uid() = user_id);
