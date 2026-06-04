-- ════════════════════════════════════════════════════════════════════════
-- plan_seed_duration_evidences — DurationEvidence 永続 store（A1-5-3b-1・**draft / 未 apply**）
--
-- 設計: docs/aneurasync-reality-control-os-connection-design.md §8.13 + §8.14（CEO 2 補正反映）
-- 方針:
--   - duration を plan_seeds に置かず **独立 store**（複数 evidence / priority / conflict / provenance /
--     correction 時系列 / prm_typical 弱推定の分離）。plan_seeds は structured-only・duration-free のまま不変。
--   - **raw 列を持たない**（structured-only）。source_ref は **opaque**（不透明 ID・raw 本文でない・
--     read path の allowed columns には載せない＝Complete projection 到達不能）。
--   - **owner integrity を DB 制約で担保（補正2）**: composite FK (seed_id, user_id) → plan_seeds(id, user_id)。
--     ＝ evidence.user_id は seed の owner と一致必須（他人 seed を自分 user_id で参照不能）。
--     そのため plan_seeds(id, user_id) に UNIQUE を追加（id は PK ゆえ常に充足・冪等・非破壊・additive）。
--   - **duration_min は enrich validation と一致（補正1）**: 1 < 分 <= 1440（>=1 ではない）。
--   - RLS owner-only（auth.uid() = user_id）・service_role 非前提。
--
-- ⚠ 本 migration は plan_seeds（apply 済）に additive な UNIQUE 制約を **ALTER で追加**する。
--    apply / db push は **別 GO（A1-5-3b-2・staging・A1-5-2-2-2b 同手順）**。本 file は draft。
-- ════════════════════════════════════════════════════════════════════════

-- ── composite FK の参照先要件: plan_seeds(id, user_id) に UNIQUE（冪等・id は PK ゆえ常に充足）──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plan_seeds_id_user_key'
  ) THEN
    ALTER TABLE plan_seeds ADD CONSTRAINT plan_seeds_id_user_key UNIQUE (id, user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS plan_seed_duration_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- owner（auth.users）。直接 FK は composite FK 経由で担保（plan_seeds.user_id -> auth.users）。
  user_id UUID NOT NULL,

  -- どの seed の duration evidence か。owner integrity は composite FK で担保（下記）。
  seed_id UUID NOT NULL,

  -- 証拠が示す所要時間（分）。enrich isValidEvidenceDuration と一致（補正1: 1 < 分 <= 1440）。
  duration_min INTEGER NOT NULL
    CHECK (duration_min > 1 AND duration_min <= 1440),

  -- 出所（DurationEvidenceSource と一致）。priority は read 時 enrich が解決（seed_explicit>correction>prm_typical）。
  source TEXT NOT NULL
    CHECK (source IN ('seed_explicit', 'correction', 'prm_typical')),

  -- 確からしさ（DurationConfidence と一致。high のみ enrich 採用）。
  confidence TEXT NOT NULL
    CHECK (confidence IN ('high', 'low')),

  -- 元観測への **opaque** 参照（不透明 ID・自由文本体ではない・read path allowed columns に含めない）。
  source_ref TEXT,

  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- source ごとに「現在の有効 evidence」1 行（新観測は upsert で置換・stale 同 priority 衝突を防ぐ）
  CONSTRAINT plan_seed_duration_evidences_seed_source_key UNIQUE (seed_id, source),

  -- 補正2: owner integrity（DB 制約）。seed の owner = evidence.user_id 必須・seed 削除で cascade。
  CONSTRAINT plan_seed_duration_evidences_seed_owner_fk
    FOREIGN KEY (seed_id, user_id) REFERENCES plan_seeds (id, user_id) ON DELETE CASCADE
);

-- ── indexes ──
CREATE INDEX IF NOT EXISTS idx_psde_user_seed
  ON plan_seed_duration_evidences (user_id, seed_id);
-- 失効 sweep 用 partial index
CREATE INDEX IF NOT EXISTS idx_psde_active_expiry
  ON plan_seed_duration_evidences (user_id, expires_at)
  WHERE expires_at IS NOT NULL;

-- ── updated_at trigger（UPDATE 毎に now() へ）──
CREATE OR REPLACE FUNCTION public.plan_seed_duration_evidences_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plan_seed_duration_evidences_set_updated_at_trigger ON plan_seed_duration_evidences;
CREATE TRIGGER plan_seed_duration_evidences_set_updated_at_trigger
  BEFORE UPDATE ON plan_seed_duration_evidences
  FOR EACH ROW
  EXECUTE FUNCTION public.plan_seed_duration_evidences_set_updated_at();

-- ── RLS（owner-only・service_role 非前提）──
ALTER TABLE plan_seed_duration_evidences ENABLE ROW LEVEL SECURITY;

CREATE POLICY psde_owner_select ON plan_seed_duration_evidences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY psde_owner_insert ON plan_seed_duration_evidences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY psde_owner_update ON plan_seed_duration_evidences
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY psde_owner_delete ON plan_seed_duration_evidences
  FOR DELETE USING (auth.uid() = user_id);
