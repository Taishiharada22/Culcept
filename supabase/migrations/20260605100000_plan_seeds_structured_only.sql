-- ════════════════════════════════════════════════════════════════════════
-- plan_seeds — structured-only seed storage（A1-5-2-2-1・**draft / 未 apply**）
--
-- 設計: docs/aneurasync-reality-control-os-connection-design.md §8 + A1-5-2-2-0 audit
-- 方針（CEO 補正・「raw を同じ読み取り表面に置かない」）:
--   - raw 自由文（元発話・自由記述）の列を **持たない**（structured-only）。
--     raw 発話が必要な場合は別層（external_anchor_sources 同型・Storage 参照・破棄既定・短期 retention）
--     へ隔離し、Complete/projection 経路から到達不能にする（本 migration には含めない）。
--   - 列は A1-5-2-1 ALLOWED_SEED_COLUMNS と整合（+ source / captured_at / expires_at / source_ref）。
--   - RLS owner-only（auth.uid() = user_id）・service_role 非前提。
--
-- ⚠ 本 migration は **canonical な structured-only schema を確定する draft**。
--    実 DB への apply / db push は **別 GO（A1-5-2-2-2）で CEO 承認後**。
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS plan_seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 「明日」「来週水曜」等を解決した日付（漠然な希望は NULL）
  desired_date DATE,

  -- 希望時間帯（PlanSeedTimeHint と一致。anytime は projection 側で no-window 扱い）
  desired_time_hint TEXT
    CHECK (desired_time_hint IS NULL OR desired_time_hint IN
      ('morning', 'afternoon', 'evening', 'anytime')),

  -- 判断形（ActionShape と一致・8 値）
  action_shape TEXT
    CHECK (action_shape IS NULL OR action_shape IN
      ('full_go', 'bounded_go', 'prepare_then_go', 'trial_then_decide',
       'observe_first', 'delegate_or_request', 'defer_with_trigger', 'skip')),

  -- 抽出時の自信度（0..1）
  confidence REAL NOT NULL
    CHECK (confidence >= 0 AND confidence <= 1),

  -- lifecycle（PlanSeedStatus と一致）
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'consumed', 'expired', 'rejected')),

  -- 入力経路（PlanSeedSource と一致）
  source TEXT NOT NULL
    CHECK (source IN ('chat', 'manual')),

  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  -- 元入力への opaque 参照（不透明 ID。自由文本体ではない。Complete projection の許可列には含めない）
  source_ref TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── indexes ──
CREATE INDEX IF NOT EXISTS idx_plan_seeds_user_status
  ON plan_seeds (user_id, status);
CREATE INDEX IF NOT EXISTS idx_plan_seeds_user_date
  ON plan_seeds (user_id, desired_date);
-- active seed の期限切れ sweep 用 partial index
CREATE INDEX IF NOT EXISTS idx_plan_seeds_active_expiry
  ON plan_seeds (user_id, expires_at)
  WHERE status = 'active';

-- ── updated_at trigger（UPDATE 毎に now() へ）──
CREATE OR REPLACE FUNCTION public.plan_seeds_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plan_seeds_set_updated_at_trigger ON plan_seeds;
CREATE TRIGGER plan_seeds_set_updated_at_trigger
  BEFORE UPDATE ON plan_seeds
  FOR EACH ROW
  EXECUTE FUNCTION public.plan_seeds_set_updated_at();

-- ── RLS（owner-only・service_role 非前提）──
ALTER TABLE plan_seeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_seeds_owner_select ON plan_seeds
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY plan_seeds_owner_insert ON plan_seeds
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY plan_seeds_owner_update ON plan_seeds
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY plan_seeds_owner_delete ON plan_seeds
  FOR DELETE USING (auth.uid() = user_id);
