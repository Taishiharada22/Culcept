-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Alter Plan W1-Y: create_external_anchor_bundle RPC
--
-- 設計書:
--   - docs/alter-plan-w1y-rpc-atomicity-mini-design.md
--   - docs/alter-plan-a2-atomicity-tradeoff.md (W1-Y で解消した負債)
--
-- 目的:
--   A-2 で採択した best-effort atomicity (client-side sequential +
--   compensating delete) の orphan source 発生可能性を物理的に消滅させる。
--   PostgreSQL function 内で 1 TRANSACTION に source + anchors INSERT を
--   入れることで、任意の段階で失敗すれば自動 ROLLBACK。
--
-- 不変原則:
--   1. SECURITY INVOKER 一択 (DEFINER 禁止、RLS bypass 構造禁止)
--   2. 冒頭で auth.uid() != p_user_id を明示拒否 (RLS と app 層の二重防御)
--   3. REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated
--      (anon / public は不可、authenticated のみ)
--   4. function 内 validation を入れず DB CHECK / RLS に委ねる
--      (SoT 一貫、二重 validator なし)
--   5. ERRCODE 標準化: '42501' (insufficient_privilege) で auth 拒否
--   6. CREATE OR REPLACE で冪等、Rollback は DROP FUNCTION 1 行
--
-- W1-Y 範囲外:
--   - production migration apply (CEO 判断、別 wave)
--   - service_role 使用
--   - SECURITY DEFINER
--   - RLS bypass
--   - client-side compensating delete の完全削除
--     (Repository は RPC-first + fallback パターン、production migration
--      完了まで fallback path を残す)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION create_external_anchor_bundle(
  p_user_id UUID,
  p_source JSONB,
  p_anchors JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_source external_anchor_sources%ROWTYPE;
  v_result JSONB;
BEGIN
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 1. Auth check (二重防御: RLS + app 層)
  --    auth.uid() == p_user_id でないと即拒否。
  --    ERRCODE 42501 は insufficient_privilege、既存 mapPostgrestError
  --    の 42501 → forbidden ロジックが透過動作する。
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 2. INSERT source
  --    id / captured_at / created_at は DEFAULT (gen_random_uuid / NOW)
  --    で自動補完。RLS policy も発火するため auth check 二重で安全。
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  INSERT INTO external_anchor_sources (
    user_id,
    source_type,
    original_filename,
    extracted_at,
    raw_retention,
    raw_storage_path,
    raw_expires_at,
    notes
  )
  VALUES (
    p_user_id,
    p_source->>'source_type',
    p_source->>'original_filename',
    NULLIF(p_source->>'extracted_at', '')::timestamptz,
    COALESCE(p_source->>'raw_retention', 'discarded'),
    p_source->>'raw_storage_path',
    NULLIF(p_source->>'raw_expires_at', '')::timestamptz,
    p_source->>'notes'
  )
  RETURNING * INTO v_source;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 3. INSERT anchors (jsonb_array_elements で展開、source_id を共通注入)
  --    anchors が空配列なら INSERT 0 行で no-op (W1-X1 / source-only と整合)
  --    confirmed_at は NOW() (memory 実装と同じ意味論)
  --    DB CHECK が発火: anchor_kind_one_off_columns / anchor_kind_recurring_columns
  --    違反は 23514、function 全体が ROLLBACK される
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  INSERT INTO external_anchors (
    user_id,
    source_id,
    title,
    start_time,
    end_time,
    location_text,
    location_category,
    rigidity,
    confirmed_at,
    confidence,
    sensitive_category,
    anchor_kind,
    date,
    valid_from,
    valid_until,
    recurrence_rule,
    exception_dates
  )
  SELECT
    p_user_id,
    v_source.id,
    a->>'title',
    (a->>'start_time')::time,
    NULLIF(a->>'end_time', '')::time,
    a->>'location_text',
    a->>'location_category',
    a->>'rigidity',
    NOW(),
    NULLIF(a->>'confidence', '')::numeric,
    a->>'sensitive_category',
    a->>'anchor_kind',
    NULLIF(a->>'date', '')::date,
    NULLIF(a->>'valid_from', '')::date,
    NULLIF(a->>'valid_until', '')::date,
    a->>'recurrence_rule',
    CASE
      WHEN a ? 'exception_dates' AND jsonb_typeof(a->'exception_dates') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(a->'exception_dates'))::date[]
      ELSE NULL
    END
  FROM jsonb_array_elements(p_anchors) a;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- 4. 戻り値構築: { source: <row>, anchors: [<row>, ...] }
  --    Repository 側で rowToSource / rowToAnchor で透過 mapping。
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SELECT jsonb_build_object(
    'source', to_jsonb(v_source),
    'anchors', COALESCE(
      (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at, a.id)
       FROM external_anchors a
       WHERE a.source_id = v_source.id),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Permissions: anon / public は不可、authenticated のみ
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REVOKE ALL ON FUNCTION create_external_anchor_bundle(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_external_anchor_bundle(UUID, JSONB, JSONB) TO authenticated;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Comments (traceability)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMMENT ON FUNCTION create_external_anchor_bundle(UUID, JSONB, JSONB) IS
  'Alter Plan W1-Y: atomic source + anchors INSERT in single transaction. SECURITY INVOKER (RLS-respecting). See docs/alter-plan-w1y-rpc-atomicity-mini-design.md';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Rollback (staging 動作確認失敗時):
--   DROP FUNCTION create_external_anchor_bundle(UUID, JSONB, JSONB);
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
