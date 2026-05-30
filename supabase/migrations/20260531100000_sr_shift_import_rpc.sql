-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SR Step 6B — シフト取り込み本保存 RPC（conflict-safe range-scoped replace, migration DRAFT）
--
-- 設計: SR Step 6B mini design（CEO + GPT 合議 2026-05-31）
-- 前提: 20260530100000_sr_shift_import_source_type_and_day_indicators.sql（apply 済み前提）
--
-- 目的:
--   確認画面で承認した「その月分のシフト」を /plan に **all-or-nothing** で保存する Postgres 関数。
--   関数本体は 1 トランザクション = 途中失敗で全 rollback（真の atomic）。
--
-- ロジック（ゴールから逆算 / 書込前に conflict 判定）:
--   0. owner guard: p_user_id = auth.uid() でなければ reject（RLS と二重防御）
--   1. conflict 検出: 新 indicator の日に **手動(manual) day_indicator** があれば、何も書かず
--      {status:'conflict', dates} を返す（manual を黙って上書きしない = CEO 補正）
--   2. range-scoped replace: **shift_image 由来のみ** を importRange[start,end) で削除
--      （manual / Google / ICS / Microsoft / 他月は一切触らない）
--   3. source cleanup: 子を失った shift_image source を GC
--   4. 新 source + anchors + indicators を insert
--   5. {status:'ok', summary{sourceId, inserted/deleted counts, conflicts:[]}} を返す
--
-- 戻り値契約（lib/plan/shift/shiftImportRpc.ts と一致）:
--   {status:'ok', summary} | {status:'conflict', dates}
--   ハード失敗（CHECK 違反等）は RAISE → 関数全体 rollback → client 側で {status:'error'} 化。
--
-- 不変原則:
--   - 置換対象は user_id 一致 × shift_image 由来 × importRange 内 のみ。
--   - 夜勤の翌日跨ぎは anchor.date(=勤務開始日) が range 内かで判定（end_time<start_time は同一 anchor）。
--   - SECURITY INVOKER + RLS で user-scoped を強制。
--
-- ★ 本 migration は **draft 状態**。`supabase db push` / apply は **CEO 別承認**。
--   ※ 関数の挙動は DB なしの unit test では検証不能 → fake RPC client で contract を検証済
--     （tests/unit/plan/shift/shiftImportRepositoryRpc.test.ts）。実 SQL は apply / staging smoke で検証（6B-apply）。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION import_shift_roster(
  p_user_id    uuid,
  p_range_start date,   -- 含む（月初）
  p_range_end   date,   -- 含まない（翌月1日）
  p_source     jsonb,   -- { originalFilename? }
  p_anchors    jsonb,   -- [{ date, title, startTime, endTime?, rigidity }]
  p_indicators jsonb    -- [{ date, kind, label, countsAsPublicHoliday, rawCode, semanticType }]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_conflicts text[];
  v_source_id uuid;
  v_deleted_anchors integer := 0;
  v_deleted_indicators integer := 0;
  v_inserted_anchors integer := 0;
  v_inserted_indicators integer := 0;
BEGIN
  -- 0. owner guard（RLS と二重防御）
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden: p_user_id must equal auth.uid()';
  END IF;

  -- 1. conflict 検出（新 indicator の日に手動印がある）→ 書込前に early return
  SELECT array_agg(DISTINCT to_char((e->>'date')::date, 'YYYY-MM-DD') ORDER BY to_char((e->>'date')::date, 'YYYY-MM-DD'))
    INTO v_conflicts
  FROM jsonb_array_elements(p_indicators) AS e
  WHERE EXISTS (
    SELECT 1 FROM plan_day_indicators pdi
    WHERE pdi.user_id = p_user_id
      AND pdi.source_type = 'manual'
      AND pdi.date = (e->>'date')::date
  );

  IF v_conflicts IS NOT NULL AND array_length(v_conflicts, 1) > 0 THEN
    RETURN jsonb_build_object('status', 'conflict', 'dates', to_jsonb(v_conflicts));
  END IF;

  -- 2. range-scoped replace（shift_image 由来のみ、importRange 内）
  DELETE FROM plan_day_indicators pdi
  WHERE pdi.user_id = p_user_id
    AND pdi.source_type = 'shift_image'
    AND pdi.date >= p_range_start
    AND pdi.date <  p_range_end;
  GET DIAGNOSTICS v_deleted_indicators = ROW_COUNT;

  DELETE FROM external_anchors ea
  WHERE ea.user_id = p_user_id
    AND ea.date >= p_range_start
    AND ea.date <  p_range_end
    AND ea.source_id IN (
      SELECT s.id FROM external_anchor_sources s
      WHERE s.user_id = p_user_id AND s.source_type = 'shift_image'
    );
  GET DIAGNOSTICS v_deleted_anchors = ROW_COUNT;

  -- 3. source cleanup（子を失った shift_image source を削除）
  DELETE FROM external_anchor_sources s
  WHERE s.user_id = p_user_id
    AND s.source_type = 'shift_image'
    AND NOT EXISTS (SELECT 1 FROM external_anchors a WHERE a.source_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM plan_day_indicators d WHERE d.source_id = s.id);

  -- 4. 新 source
  INSERT INTO external_anchor_sources (user_id, source_type, original_filename)
  VALUES (p_user_id, 'shift_image', NULLIF(p_source->>'originalFilename', ''))
  RETURNING id INTO v_source_id;

  -- 5. anchors（one_off, confirmed_at=now）
  INSERT INTO external_anchors
    (user_id, source_id, title, start_time, end_time, rigidity, confirmed_at, anchor_kind, date)
  SELECT
    p_user_id, v_source_id, e->>'title',
    (e->>'startTime')::time,
    NULLIF(e->>'endTime', '')::time,
    e->>'rigidity', now(), 'one_off', (e->>'date')::date
  FROM jsonb_array_elements(p_anchors) AS e;
  GET DIAGNOSTICS v_inserted_anchors = ROW_COUNT;

  -- 6. indicators（shift_image 由来）
  INSERT INTO plan_day_indicators
    (user_id, source_id, date, kind, label, counts_as_public_holiday, raw_code, semantic_type, source_type)
  SELECT
    p_user_id, v_source_id, (e->>'date')::date, e->>'kind', e->>'label',
    (e->>'countsAsPublicHoliday')::boolean, e->>'rawCode', e->>'semanticType', 'shift_image'
  FROM jsonb_array_elements(p_indicators) AS e;
  GET DIAGNOSTICS v_inserted_indicators = ROW_COUNT;

  RETURN jsonb_build_object(
    'status', 'ok',
    'summary', jsonb_build_object(
      'sourceId', v_source_id,
      'insertedAnchors', v_inserted_anchors,
      'deletedAnchors', v_deleted_anchors,
      'insertedIndicators', v_inserted_indicators,
      'deletedIndicators', v_deleted_indicators,
      'conflicts', '[]'::jsonb
    )
  );
END;
$$;

COMMENT ON FUNCTION import_shift_roster(uuid, date, date, jsonb, jsonb, jsonb) IS
  'SR 2026-05-31. シフト取り込み本保存（all-or-nothing）。conflict-safe range-scoped replace: 手動印は上書きせず conflict 返却、shift_image 由来のみ importRange[start,end) で置換。SECURITY INVOKER + RLS。';
