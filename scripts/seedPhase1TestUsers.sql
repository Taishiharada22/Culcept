-- Phase 1 テストユーザー用シードデータ
-- 目的: 5人分の axis_scores を stargazer_resolved_types に用意し、
--        Layer 3 全機能がパーソナライズされた出力を返す状態にする
--
-- 使い方:
--   npx supabase db query --linked < scripts/seedPhase1TestUsers.sql
--
-- 前提: テストユーザーが auth.users に存在すること

-- ============================================================
-- 1. stargazer_resolved_types に axis_scores を upsert
--    (Decision Engine / SvO / Daily Intervention が参照)
-- ============================================================

DO $$
DECLARE
  v_users UUID[];
  v_count INT;
  v_axis JSONB[];
  v_archetype TEXT[];
  v_i INT;
BEGIN
  -- auth.users から最大5名取得
  SELECT array_agg(id ORDER BY created_at DESC)
  INTO v_users
  FROM (
    SELECT id, created_at FROM auth.users LIMIT 5
  ) sub;

  v_count := coalesce(array_length(v_users, 1), 0);

  IF v_count = 0 THEN
    RAISE NOTICE 'テストユーザーが見つかりません';
    RETURN;
  END IF;

  RAISE NOTICE '% 人のユーザーにシードデータを挿入します', v_count;

  -- 5パターンの axis_scores（10軸 × 5ペルソナ）
  v_axis := ARRAY[
    -- A: 社交的・直感型
    '{"social_energy":0.8,"analytical_intuitive":-0.6,"risk_tolerance":0.5,"routine_novelty":0.4,"independence_harmony":0.3,"emotional_rational":0.2,"detail_bigpicture":-0.3,"internal_external":0.6,"patience_urgency":0.1,"perfectionism_pragmatism":-0.4}'::JSONB,
    -- B: 内省的・分析型
    '{"social_energy":-0.7,"analytical_intuitive":0.8,"risk_tolerance":-0.3,"routine_novelty":-0.2,"independence_harmony":-0.5,"emotional_rational":-0.6,"detail_bigpicture":0.7,"internal_external":-0.8,"patience_urgency":-0.3,"perfectionism_pragmatism":0.6}'::JSONB,
    -- C: バランス型
    '{"social_energy":0.1,"analytical_intuitive":0.1,"risk_tolerance":0.0,"routine_novelty":0.2,"independence_harmony":0.0,"emotional_rational":0.1,"detail_bigpicture":-0.1,"internal_external":0.0,"patience_urgency":0.1,"perfectionism_pragmatism":0.0}'::JSONB,
    -- D: 感情優位型
    '{"social_energy":0.4,"analytical_intuitive":-0.5,"risk_tolerance":-0.2,"routine_novelty":0.3,"independence_harmony":0.5,"emotional_rational":0.7,"detail_bigpicture":-0.4,"internal_external":0.3,"patience_urgency":0.4,"perfectionism_pragmatism":-0.5}'::JSONB,
    -- E: 行動優位型
    '{"social_energy":0.5,"analytical_intuitive":-0.2,"risk_tolerance":0.7,"routine_novelty":0.6,"independence_harmony":-0.3,"emotional_rational":-0.3,"detail_bigpicture":-0.5,"internal_external":0.5,"patience_urgency":0.7,"perfectionism_pragmatism":-0.6}'::JSONB
  ];

  v_archetype := ARRAY['ACIO', 'ACSX', 'PVIO', 'SVEX', 'PVIA'];

  FOR v_i IN 1..v_count LOOP
    INSERT INTO stargazer_resolved_types (user_id, axis_scores, archetype_code, confidence, updated_at)
    VALUES (
      v_users[v_i],
      v_axis[v_i],
      v_archetype[v_i],
      0.75,
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      axis_scores = EXCLUDED.axis_scores,
      archetype_code = EXCLUDED.archetype_code,
      confidence = EXCLUDED.confidence,
      updated_at = now();

    RAISE NOTICE 'ユーザー % → %', v_users[v_i], v_archetype[v_i];
  END LOOP;

  RAISE NOTICE 'シード完了: % 人', v_count;
END;
$$;

-- ============================================================
-- 2. 確認
-- ============================================================
SELECT
  u.email,
  rt.archetype_code,
  rt.confidence,
  jsonb_object_keys(rt.axis_scores) IS NOT NULL AS has_scores
FROM stargazer_resolved_types rt
JOIN auth.users u ON u.id = rt.user_id
ORDER BY rt.updated_at DESC
LIMIT 5;
