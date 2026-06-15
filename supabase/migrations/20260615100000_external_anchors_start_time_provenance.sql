-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- U1-minimal: startTime provenance 永続化（manual + ICS-timed のみ）
--
-- 設計書: docs/reality-leaveby-u1-minimal-startsource-0.md / U1/U2-0
--
-- 目的:
--   RD2e-SUPPLY が arrival fixedness を honest に判定する土台。startTime の由来を
--   creation 時に server が確定して persist する。read-path では all-day 00:00 と実時刻が
--   区別不能（mapper が isAllDay/tzid を drop する）ため、創出時にしか記録できない。
--
-- 不変原則（fail-closed）:
--   1. 4 カラムとも **NULL 許容**（既存行 / 未適用環境は NULL = 後方互換）。app 層は NULL を
--      'unknown' に倒す（fixed arrival にしない）。**backfill しない**（既存 ICS all-day 行は
--      marker 無しで provenance 復元不能）。
--   2. start_time_source は server 導出（client は signal のみ・label を渡さない）。
--   3. CHECK 制約で all-day / floating を exact に偽装不可（DB レベル強制）。
--   4. create_external_anchor_bundle RPC を CREATE OR REPLACE（冪等）。sequential 直接 INSERT 経路
--      （anchorInsertPayload）と provenance が一致する。
--
-- ⚠️ apply は **CEO 承認後**（本 file は draft）。本番 / dev とも CEO が適用する。
--
-- Rollback:
--   ALTER TABLE external_anchors DROP COLUMN ...（破壊的）+ 3 CHECK DROP + 旧 RPC（20260602100000）に戻す。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE external_anchors
  ADD COLUMN IF NOT EXISTS start_time_source TEXT,
  ADD COLUMN IF NOT EXISTS is_all_day_placeholder BOOLEAN,
  ADD COLUMN IF NOT EXISTS timezone_of_record TEXT,
  ADD COLUMN IF NOT EXISTS start_time_provenance_recorded_at TIMESTAMPTZ;

COMMENT ON COLUMN external_anchors.start_time_source IS
  'U1-minimal: startTime 由来. user_explicit/imported_exact/system_inferred/assumed_default/unknown. NULL=unknown(fail-closed). RD2e-SUPPLY が READ.';
COMMENT ON COLUMN external_anchors.is_all_day_placeholder IS
  'U1-minimal: all-day import の 00:00 placeholder か. exact に偽装不可(CHECK).';
COMMENT ON COLUMN external_anchors.timezone_of_record IS
  'U1-minimal: ICS tzid. imported_exact の honest 根拠(floating=tzid 無は exact にしない).';
COMMENT ON COLUMN external_anchors.start_time_provenance_recorded_at IS
  'U1-minimal: startTime provenance を記録した時刻. anchor 存在の confirmed_at とは別. 単独で user_explicit 判定しない(start_time_source が正本).';

-- ── CHECK 制約（冪等・既存 NULL 行は全て pass）──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_anchors_start_time_source_chk') THEN
    ALTER TABLE external_anchors
      ADD CONSTRAINT external_anchors_start_time_source_chk
      CHECK (start_time_source IS NULL OR start_time_source IN
        ('user_explicit','imported_exact','system_inferred','assumed_default','unknown'));
  END IF;
  -- all-day placeholder を exact に偽装不可
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_anchors_start_time_allday_chk') THEN
    ALTER TABLE external_anchors
      ADD CONSTRAINT external_anchors_start_time_allday_chk
      CHECK (NOT (start_time_source IN ('user_explicit','imported_exact') AND is_all_day_placeholder IS TRUE));
  END IF;
  -- floating(tzid 無)を imported_exact に偽装不可
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_anchors_imported_exact_tz_chk') THEN
    ALTER TABLE external_anchors
      ADD CONSTRAINT external_anchors_imported_exact_tz_chk
      CHECK (NOT (start_time_source = 'imported_exact' AND timezone_of_record IS NULL));
  END IF;
END$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RPC を provenance 対応に更新（20260602100000 の companions 版を踏襲）。
-- INSERT に 4 列追加。start_time_provenance_recorded_at は source<>'unknown' の時 NOW()
-- （sequential 経路の startTimeProvenanceRecordedAt と一致）。他は不変。
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
    companions,
    start_time_source,
    is_all_day_placeholder,
    timezone_of_record,
    start_time_provenance_recorded_at
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
      WHEN a ? 'companions' AND jsonb_typeof(a->'companions') = 'array' THEN (
        SELECT array_agg(elem #>> '{}' ORDER BY ord)
        FROM jsonb_array_elements(a->'companions') WITH ORDINALITY AS t(elem, ord)
        WHERE jsonb_typeof(elem) = 'string'
      )
      ELSE NULL
    END,
    -- U1-minimal: provenance（label は server 導出済・signal でなく label を渡している）
    COALESCE(a->>'start_time_source', 'unknown'),
    CASE
      WHEN a ? 'is_all_day_placeholder' THEN (a->>'is_all_day_placeholder')::boolean
      ELSE NULL
    END,
    NULLIF(a->>'timezone_of_record', ''),
    CASE
      WHEN COALESCE(a->>'start_time_source', 'unknown') <> 'unknown' THEN NOW()
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
  'Alter Plan W1-Y + P4 companions + U1-minimal startTime provenance: atomic source + anchors INSERT. SECURITY INVOKER.';
