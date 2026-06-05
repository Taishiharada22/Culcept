-- ════════════════════════════════════════════════════════════════════════
-- create_plan_seed_capture_bundle — seed + 任意 evidence の atomic 取り込み RPC（A1-5-4b-2・**draft / 未 apply**）
--
-- 設計: docs/aneurasync-reality-control-os-connection-design.md §8.17 + §8.18 + §8.19（A1-5-4b-2-fix hardened）
-- 手本: create_external_anchor_bundle（atomic source + anchors・SECURITY INVOKER・companions 20260602）
--   + sr_shift_import_rpc（2026-05-31・SET search_path = pg_catalog, public 規約）
--
-- 役割: A1-5-4b-1 write seam（writeStructuredCapture）が将来呼ぶ DB 関数。
--   plan_seeds 1 行 + 任意 plan_seed_duration_evidences 1 行を **同一 transaction（atomic）** で INSERT。
--   plpgsql 関数 = 1 transaction ゆえ、evidence INSERT / guard 失敗時は seed も含め **全 rollback**（partial write を防ぐ）。
--
-- 厳守:
--   - **SECURITY INVOKER**（RLS を呼出ユーザーで適用）+ **SET search_path = pg_catalog, public**（解決を pin・lint clean）・**service_role 非前提**。
--   - **schema 修飾**: public.create_plan_seed_capture_bundle / public.plan_seeds / public.plan_seed_duration_evidences（最新 RPC 規約とパリティ）。
--   - 認可: auth.uid() 必須 ∧ p_user_id = auth.uid()。
--   - **raw 引数を取らない**: p_seed / p_evidence の jsonb から **structured フィールドのみ抽出**。
--     signal / desired_action / raw_text / title / location は **引数にもテーブルにも入れない**（読まない）。
--   - source_ref は **opaque**（text のまま透過・raw 本文でない）。
--   - duration_min は **1 < 分 <= 1440**・evidence source/confidence は既存 table CHECK と一致（関数内でも guard）。
--   - owner 整合: evidence.user_id = p_user_id ∧ evidence.seed_id = 挿入 seed の id（composite FK と二重）。
--   - REVOKE ALL FROM PUBLIC / GRANT EXECUTE TO authenticated。DROP / destructive なし（CREATE OR REPLACE・冪等）。
--
-- ⚠ apply / db push は **別 GO（A1-5-4b-3・staging）**。本 file は draft。plan_seeds / plan_seed_duration_evidences は適用済前提。
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_plan_seed_capture_bundle(
  p_user_id UUID,
  p_seed JSONB,
  p_evidence JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_seed public.plan_seeds%ROWTYPE;
  v_evidence public.plan_seed_duration_evidences%ROWTYPE;
  v_duration_min INTEGER;
  v_result JSONB;
BEGIN
  -- 認可: auth.uid() 必須 ∧ p_user_id = auth.uid()
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- plan_seeds INSERT（structured-only・raw を受け取らない）
  INSERT INTO public.plan_seeds (
    id,
    user_id,
    desired_date,
    desired_time_hint,
    action_shape,
    confidence,
    status,
    source,
    captured_at,
    expires_at,
    source_ref
  )
  VALUES (
    COALESCE(NULLIF(p_seed->>'id', '')::uuid, gen_random_uuid()),
    p_user_id,
    NULLIF(p_seed->>'desired_date', '')::date,
    p_seed->>'desired_time_hint',
    p_seed->>'action_shape',
    (p_seed->>'confidence')::real,
    COALESCE(p_seed->>'status', 'active'),
    p_seed->>'source',
    COALESCE(NULLIF(p_seed->>'captured_at', '')::timestamptz, NOW()),
    NULLIF(p_seed->>'expires_at', '')::timestamptz,
    p_seed->>'source_ref'
  )
  RETURNING * INTO v_seed;

  -- 任意 evidence INSERT（**同一 transaction**・seed_id / user_id 整合を DB 側でも確認）
  IF p_evidence IS NOT NULL THEN
    v_duration_min := (p_evidence->>'duration_min')::integer;

    -- duration_min は 1 < 分 <= 1440（enrich / table CHECK と一致）
    IF v_duration_min IS NULL OR NOT (v_duration_min > 1 AND v_duration_min <= 1440) THEN
      RAISE EXCEPTION 'invalid evidence: duration_min > 1 AND duration_min <= 1440' USING ERRCODE = '22000';
    END IF;

    -- source / confidence は既存 table CHECK と一致
    IF (p_evidence->>'source') NOT IN ('seed_explicit', 'correction', 'prm_typical') THEN
      RAISE EXCEPTION 'invalid evidence source' USING ERRCODE = '22000';
    END IF;
    IF (p_evidence->>'confidence') NOT IN ('high', 'low') THEN
      RAISE EXCEPTION 'invalid evidence confidence' USING ERRCODE = '22000';
    END IF;

    -- owner / seed linkage 整合（composite FK の前段 fail-fast）
    IF (p_evidence->>'user_id') <> p_user_id::text THEN
      RAISE EXCEPTION 'evidence.user_id must equal p_user_id' USING ERRCODE = '42501';
    END IF;
    IF (p_evidence->>'seed_id') <> v_seed.id::text THEN
      RAISE EXCEPTION 'evidence.seed_id must equal inserted seed id' USING ERRCODE = '22000';
    END IF;

    INSERT INTO public.plan_seed_duration_evidences (
      user_id,
      seed_id,
      duration_min,
      source,
      confidence,
      source_ref
    )
    VALUES (
      p_user_id,
      v_seed.id,
      v_duration_min,
      p_evidence->>'source',
      p_evidence->>'confidence',
      p_evidence->>'source_ref'
    )
    RETURNING * INTO v_evidence;
  END IF;

  SELECT jsonb_build_object(
    'seed', to_jsonb(v_seed),
    'evidence', CASE WHEN p_evidence IS NOT NULL THEN to_jsonb(v_evidence) ELSE NULL END
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_plan_seed_capture_bundle(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_plan_seed_capture_bundle(UUID, JSONB, JSONB) TO authenticated;

COMMENT ON FUNCTION public.create_plan_seed_capture_bundle(UUID, JSONB, JSONB) IS
  'A1-5-4b: atomic seed + optional seed_explicit duration evidence INSERT. SECURITY INVOKER. SET search_path. structured-only (no raw). owner-checked.';
