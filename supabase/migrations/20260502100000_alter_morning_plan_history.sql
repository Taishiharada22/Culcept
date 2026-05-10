-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- alter_morning_plan_history — minimum plan history persistence foundation
--
-- CEO/GPT 2026-05-02 PR B-5a 規律:
--   PR B-2c (Layer 2 前日終点 inheritance) のための DB 基盤のみ作成。
--   inheritance logic は本 migration では入れず、PR B-2c で別途実装。
--
-- 不変条件 (PR B-5a):
--   1. PRIMARY KEY (user_id, plan_date) で 1 user × 1 day = 1 plan 強制
--   2. CHECK 制約で plan_date と plan->>'date' の整合性を DB 側でも保証
--      (helper + unit test だけでは弱い、DB 側で防御層を作る)
--   3. RLS 4 policy で auth.uid() = user_id を必須化 (server-side owner enforcement と二重防御)
--   4. updated_at trigger で upsert 時の自動更新
--   5. 追加 index は最小 PR 規律で見送り (PRIMARY KEY で直前 1 日 lookup は十分)
--   6. inheritance logic は本 migration に入れない (PR B-2c で別途)
--
-- CEO 承認: 2026-05-02 (PR B-5a 実装着手 Yes)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ───────────────────────────────────────────────────────────────────────────
-- Table: alter_morning_plan_history
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alter_morning_plan_history (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  plan JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plan_date),

  -- GPT 修正 1 (2026-05-02): plan_date と plan->>'date' の整合性を DB 側で保証
  --   to_char(plan_date, 'YYYY-MM-DD') で format 固定 → DateStyle 非依存
  --   helper + unit test だけでは弱いため、DB CHECK で防御層を二重化
  CONSTRAINT plan_date_matches_jsonb_date CHECK (
    plan ? 'date'
    AND plan->>'date' = to_char(plan_date, 'YYYY-MM-DD')
  )
);

COMMENT ON TABLE public.alter_morning_plan_history IS
  'Alter Morning plan の persistence layer (PR B-5a)。PR B-2c で前日終点 inheritance に使用。';

COMMENT ON COLUMN public.alter_morning_plan_history.plan IS
  'MorningPlan JSONB (journeyOrigin / journeyEnd / items / transportSegments / dayConditions 等を含む)。';

COMMENT ON COLUMN public.alter_morning_plan_history.plan_date IS
  'plan の対象日 (= plan->>"date" と一致、CHECK 制約で保証)。前日 query で参照。';

-- ───────────────────────────────────────────────────────────────────────────
-- updated_at 自動更新 trigger
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_alter_morning_plan_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alter_morning_plan_history_updated_at
  ON public.alter_morning_plan_history;

CREATE TRIGGER trg_alter_morning_plan_history_updated_at
  BEFORE UPDATE ON public.alter_morning_plan_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_alter_morning_plan_history_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- Row Level Security (RLS): user は自分の plan のみアクセス可
--   server-side owner enforcement (helper の userId guard) と DB RLS の二重防御
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.alter_morning_plan_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own plan history"
  ON public.alter_morning_plan_history;
CREATE POLICY "Users can view own plan history"
  ON public.alter_morning_plan_history FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own plan history"
  ON public.alter_morning_plan_history;
CREATE POLICY "Users can insert own plan history"
  ON public.alter_morning_plan_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own plan history"
  ON public.alter_morning_plan_history;
CREATE POLICY "Users can update own plan history"
  ON public.alter_morning_plan_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own plan history"
  ON public.alter_morning_plan_history;
CREATE POLICY "Users can delete own plan history"
  ON public.alter_morning_plan_history FOR DELETE
  USING (auth.uid() = user_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 注 (PR B-5a で意図的に **入れない** もの):
--
-- 1. 追加 index `(user_id, plan_date DESC)` 等
--    理由: PRIMARY KEY (user_id, plan_date) の B-tree index で、
--         直前 1 日の exact lookup (`WHERE user_id = ? AND plan_date = ?`) は十分高速。
--         「過去 N 日から最新を探す」 cascade query は本 PR scope 外 (PR B-2c でも cascade なし)。
--         将来必要になったら別 PR で追加 (最小 PR 規律)。
--
-- 2. inheritance logic / view / function
--    理由: 「前日 plan を取得」 は helper (planHistory.ts:fetchPreviousDayPlan) で実装。
--         DB level の view / stored function は本 PR で扱わない。
--         PR B-2c の Layer 2 inheritance も application level で実装する。
--
-- 3. retention / TTL policy
--    理由: PRIMARY KEY (user_id, plan_date) により「1日につき最新1件」を保持する。
--         過去日付の plan は蓄積されるため、retention / TTL は将来の design judgment。
--         retention 削除は別 PR で扱う (PR B-5a は永続化 foundation のみ)。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
