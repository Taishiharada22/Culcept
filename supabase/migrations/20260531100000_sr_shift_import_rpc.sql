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
-- v2 hardening（Step 6B-FIX, CEO 2026-05-31）:
--   ① INSERT も importRange[start,end) で縛る（範囲外 date は書込前に RAISE。孤児化防止）
--   ② null 配列防御（v_anchors/v_indicators = coalesce(p_*, '[]')）
--   ③ pg_advisory_xact_lock(user × importStart) で同月二重 submit を直列化（anchor 重複防止）
--   ④ source cleanup は anchors と day_indicators の両方を子として見る（既存どおり、明示化）
--   ⑤ duplicate 防御: anchors 内 / indicators 内 / anchors∩indicators の同日重複を RAISE
--      （1 日 = 勤務 anchor か day_indicator のどちらか一方）
--   ※ ①⑤ は app 側（shiftImportRepositoryRpc）にもミラーし unit test で検証（SQL は apply 時検証）。
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
  -- 強化②: null 配列防御（p_* が null でも '[]' として扱う）
  v_anchors    jsonb := coalesce(p_anchors, '[]'::jsonb);
  v_indicators jsonb := coalesce(p_indicators, '[]'::jsonb);
  v_conflicts text[];
  v_source_id uuid;
  v_deleted_anchors integer := 0;
  v_deleted_indicators integer := 0;
  v_inserted_anchors integer := 0;
  v_inserted_indicators integer := 0;
BEGIN
  -- 0. owner guard（RLS と二重防御）。
  -- ERRCODE 42501 (insufficient_privilege) で既存 mapPostgrestError → forbidden に透過
  -- （sibling create_external_anchor_bundle と同規約）。
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- 強化③: 同一ユーザー × 同一月の取り込みを直列化（二重 submit による anchor 重複防止）
  -- transaction-scoped。indicator の UNIQUE だけに頼らない。
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':shift_import:' || p_range_start::text));

  -- 強化①: INSERT も importRange で縛る。範囲外 date が 1 件でもあれば書込前に reject。
  -- （範囲外データは次回 range replace で消えず孤児化するため）
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_anchors) e
    WHERE (e->>'date')::date < p_range_start OR (e->>'date')::date >= p_range_end
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_indicators) e
    WHERE (e->>'date')::date < p_range_start OR (e->>'date')::date >= p_range_end
  ) THEN
    RAISE EXCEPTION 'shift import: all dates must be within importRange [%, %)', p_range_start, p_range_end;
  END IF;

  -- 強化⑤: duplicate input 防御（1 日 = 勤務 anchor か day_indicator のどちらか一方）
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_anchors) e
    GROUP BY (e->>'date') HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'shift import: duplicate anchor date';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_indicators) e
    GROUP BY (e->>'date') HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'shift import: duplicate indicator date';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_anchors) a
    JOIN jsonb_array_elements(v_indicators) i ON (a->>'date') = (i->>'date')
  ) THEN
    RAISE EXCEPTION 'shift import: a date appears in both anchors and indicators';
  END IF;

  -- 1. conflict 検出（新 indicator の日に手動印がある）→ 書込前に early return
  SELECT array_agg(DISTINCT to_char((e->>'date')::date, 'YYYY-MM-DD') ORDER BY to_char((e->>'date')::date, 'YYYY-MM-DD'))
    INTO v_conflicts
  FROM jsonb_array_elements(v_indicators) AS e
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
  -- 強化④: anchors **と** day_indicators の両方を子として見る。
  -- anchor が無くても indicator が残る source は消さない（逆も同様）。
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
  FROM jsonb_array_elements(v_anchors) AS e;
  GET DIAGNOSTICS v_inserted_anchors = ROW_COUNT;

  -- 6. indicators（shift_image 由来）
  INSERT INTO plan_day_indicators
    (user_id, source_id, date, kind, label, counts_as_public_holiday, raw_code, semantic_type, source_type)
  SELECT
    p_user_id, v_source_id, (e->>'date')::date, e->>'kind', e->>'label',
    (e->>'countsAsPublicHoliday')::boolean, e->>'rawCode', e->>'semanticType', 'shift_image'
  FROM jsonb_array_elements(v_indicators) AS e;
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

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Function permission（6B-APPLY-PREP, CEO 2026-05-31）
--   sibling create_external_anchor_bundle と同規約 + explicit anon revoke（CEO 補正）:
--   PUBLIC から全権限を剥奪し、さらに anon への直接 grant も明示剥奪（防御一段）、
--   authenticated のみ EXECUTE 可能にする。auth.uid() 前提の関数境界を明確化（anon は呼べない）。
--   ※ signature は CREATE FUNCTION 定義（uuid, date, date, jsonb, jsonb, jsonb）と完全一致・unqualified（search_path=public）。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REVOKE ALL ON FUNCTION import_shift_roster(uuid, date, date, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION import_shift_roster(uuid, date, date, jsonb, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION import_shift_roster(uuid, date, date, jsonb, jsonb, jsonb) TO authenticated;
