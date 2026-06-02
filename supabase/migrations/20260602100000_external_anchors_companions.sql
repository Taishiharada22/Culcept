-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Alter Plan P4: 誰と? (companions) 永続化
--
-- 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md（誰と? 永続化）
--
-- 目的:
--   予定追加 compose の「誰と?」を anchor 正本に保存する。
--   これまで draft 表示専用だった companions を external_anchors に永続化。
--
-- 不変原則:
--   1. companions TEXT[] は **NULL 許容**（既存行 / 未指定は NULL = 後方互換）。
--   2. create_external_anchor_bundle RPC を companions 対応に CREATE OR REPLACE（冪等）。
--      exception_dates と同じ array 抽出パターン。
--   3. アプリ層は companions が present の時だけ列に書く（本 migration 未適用環境でも
--      legacy 保存を壊さない）。
--
-- ⚠️ apply は **CEO 承認後**（本 file は draft）。本番 / dev とも CEO が適用する。
--    compose flag(PLAN_COMPOSE_TIMELINE_ENABLED) を ON にする環境では本 migration を
--    先に適用しておく。
--
-- Rollback:
--   DROP COLUMN は破壊的。戻す場合は 20260519100000 の旧 function に CREATE OR REPLACE で
--   戻し、ALTER TABLE external_anchors DROP COLUMN companions;
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE external_anchors
  ADD COLUMN IF NOT EXISTS companions TEXT[];

COMMENT ON COLUMN external_anchors.companions IS
  '誰と (P4). 参加者名の配列. NULL 許容 (既存行 / 未指定は NULL).';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RPC を companions 対応に更新（W1-Y の create_external_anchor_bundle を踏襲）。
-- INSERT に companions 列 + jsonb array 抽出を追加。他は不変。
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
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

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
    exception_dates,
    companions
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
    END,
    CASE
      WHEN a ? 'companions' AND jsonb_typeof(a->'companions') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(a->'companions'))::text[]
      ELSE NULL
    END
  FROM jsonb_array_elements(p_anchors) a;

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

REVOKE ALL ON FUNCTION create_external_anchor_bundle(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_external_anchor_bundle(UUID, JSONB, JSONB) TO authenticated;

COMMENT ON FUNCTION create_external_anchor_bundle(UUID, JSONB, JSONB) IS
  'Alter Plan W1-Y + P4 companions: atomic source + anchors INSERT (companions 対応). SECURITY INVOKER.';
