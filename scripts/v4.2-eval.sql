-- v4.2 FULL Pipeline 評価クエリ集
-- 使い方: Supabase SQL Editor にコピーして実行
-- 期間: デプロイ後 7日分のデータで判断

-- ╔══════════════════════════════════════════════════════════╗
-- ║  A. 体験 KPI（ユーザー体験が変わったか）                ║
-- ╚══════════════════════════════════════════════════════════╝

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- A1. Aha率（目標: ≥20%）
-- 定義: v4.2 応答後にユーザーが agree / deepen で返したターンの割合
-- Aha = 「その通り」「もっと聞きたい」= 洞察が刺さった証拠
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH v42_turns AS (
  SELECT
    id,
    user_id,
    metadata->>'session_id' AS session_id,
    created_at,
    metadata->'v42'->>'role' AS v42_role,
    LEAD(metadata->'reaction'->>'type') OVER (
      PARTITION BY user_id, metadata->>'session_id'
      ORDER BY created_at
    ) AS next_reaction
  FROM stargazer_analytics
  WHERE event = 'home_alter_judgment'
    AND feature = 'home_alter'
    AND metadata->'v42'->>'role' IS NOT NULL
    AND created_at >= NOW() - INTERVAL '7 days'
)
SELECT
  COUNT(*) AS total_v42_turns,
  COUNT(*) FILTER (WHERE next_reaction IS NOT NULL) AS turns_with_followup,
  COUNT(*) FILTER (WHERE next_reaction IN ('agree', 'deepen')) AS aha_turns,
  ROUND(
    COUNT(*) FILTER (WHERE next_reaction IN ('agree', 'deepen'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE next_reaction IS NOT NULL), 0) * 100, 1
  ) AS aha_rate_pct,
  -- 内訳
  COUNT(*) FILTER (WHERE next_reaction = 'agree') AS agree_count,
  COUNT(*) FILTER (WHERE next_reaction = 'deepen') AS deepen_count,
  COUNT(*) FILTER (WHERE next_reaction = 'disagree') AS disagree_count,
  COUNT(*) FILTER (WHERE next_reaction = 'redirect') AS redirect_count
FROM v42_turns;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- A2. 共同思考成功率（目標: ≥40%）
-- 定義: co_thinker role で応答した後、ユーザーが agree/deepen した割合
-- 失敗 = disagree/redirect（Alter の仮説がズレていた）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH co_think_turns AS (
  SELECT
    id,
    user_id,
    metadata->>'session_id' AS session_id,
    created_at,
    LEAD(metadata->'reaction'->>'type') OVER (
      PARTITION BY user_id, metadata->>'session_id'
      ORDER BY created_at
    ) AS next_reaction
  FROM stargazer_analytics
  WHERE event = 'home_alter_judgment'
    AND feature = 'home_alter'
    AND metadata->'v42'->>'role' = 'co_thinker'
    AND created_at >= NOW() - INTERVAL '7 days'
)
SELECT
  COUNT(*) AS co_thinker_total,
  COUNT(*) FILTER (WHERE next_reaction IS NOT NULL) AS with_followup,
  COUNT(*) FILTER (WHERE next_reaction IN ('agree', 'deepen')) AS success,
  COUNT(*) FILTER (WHERE next_reaction IN ('disagree', 'redirect')) AS failure,
  ROUND(
    COUNT(*) FILTER (WHERE next_reaction IN ('agree', 'deepen'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE next_reaction IS NOT NULL), 0) * 100, 1
  ) AS co_think_success_rate_pct
FROM co_think_turns;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- A3. repair成功率（目標: ≥60%）
-- 定義: repair role 発動後、ユーザーが agree/deepen（修復受容）した割合
-- 失敗 = 再度 disagree（修復が不十分だった）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH repair_turns AS (
  SELECT
    id,
    user_id,
    metadata->>'session_id' AS session_id,
    created_at,
    LEAD(metadata->'reaction'->>'type') OVER (
      PARTITION BY user_id, metadata->>'session_id'
      ORDER BY created_at
    ) AS next_reaction,
    LEAD(metadata->'reaction'->>'disagree_strength') OVER (
      PARTITION BY user_id, metadata->>'session_id'
      ORDER BY created_at
    ) AS next_disagree_strength
  FROM stargazer_analytics
  WHERE event = 'home_alter_judgment'
    AND feature = 'home_alter'
    AND metadata->'v42'->>'role' = 'repair'
    AND created_at >= NOW() - INTERVAL '7 days'
)
SELECT
  COUNT(*) AS repair_total,
  COUNT(*) FILTER (WHERE next_reaction IS NOT NULL) AS with_followup,
  COUNT(*) FILTER (WHERE next_reaction IN ('agree', 'deepen')) AS repair_accepted,
  COUNT(*) FILTER (WHERE next_reaction = 'disagree') AS repair_rejected,
  COUNT(*) FILTER (WHERE next_reaction = 'disagree' AND next_disagree_strength = 'strong') AS still_angry,
  ROUND(
    COUNT(*) FILTER (WHERE next_reaction IN ('agree', 'deepen'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE next_reaction IS NOT NULL), 0) * 100, 1
  ) AS repair_success_rate_pct
FROM repair_turns;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- A4. 直接回答率（目標: ≥90%）
-- 定義: conclude モードの応答のうち、evasion ban がなかったターンの割合
-- evasion ban = 「状況による」「一概には言えない」等で逃げた応答
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  COUNT(*) AS conclude_total,
  COUNT(*) FILTER (
    WHERE metadata->'v42'->>'semantic_ban_passed' = 'true'
       OR metadata->'v42'->>'semantic_ban_passed' IS NULL
  ) AS no_evasion,
  COUNT(*) FILTER (
    WHERE metadata->'v42'->>'semantic_ban_passed' = 'false'
      AND metadata->'v42'->'semantic_ban_categories' @> '"evasion"'
  ) AS evasion_violations,
  ROUND(
    (COUNT(*) - COUNT(*) FILTER (
      WHERE metadata->'v42'->>'semantic_ban_passed' = 'false'
        AND metadata->'v42'->'semantic_ban_categories' @> '"evasion"'
    ))::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS direct_answer_rate_pct
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->>'response_mode' = 'conclude'
  AND created_at >= NOW() - INTERVAL '7 days';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- A5. 責任転嫁率（目標: ≤5%）
-- 定義: delegation ban（「考えてみて」「書き出してみて」等）が残った割合
-- v4.2 の再生成ループで排除されるべきだが、漏れがないか確認
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  COUNT(*) FILTER (
    WHERE metadata->'v42'->>'semantic_ban_passed' = 'false'
      AND metadata->'v42'->'semantic_ban_categories' @> '"delegation"'
  ) AS delegation_violations,
  COUNT(*) AS total,
  ROUND(
    COUNT(*) FILTER (
      WHERE metadata->'v42'->>'semantic_ban_passed' = 'false'
        AND metadata->'v42'->'semantic_ban_categories' @> '"delegation"'
    )::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS delegation_rate_pct,
  -- 再生成が発動した回数（delegation が検出 → 再生成で排除されたケース）
  (SELECT COUNT(*) FROM stargazer_analytics
   WHERE event = 'v42_compliance_regeneration'
     AND created_at >= NOW() - INTERVAL '7 days'
  ) AS regeneration_count,
  (SELECT COUNT(*) FROM stargazer_analytics
   WHERE event = 'v42_compliance_regeneration'
     AND (metadata->>'regeneration_succeeded')::boolean = true
     AND created_at >= NOW() - INTERVAL '7 days'
  ) AS regeneration_success_count
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'v42'->>'role' IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- A-SUMMARY. 体験 KPI 一覧（PASS/FAIL 判定用）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH v42_with_next AS (
  SELECT
    metadata->'v42'->>'role' AS v42_role,
    metadata->>'response_mode' AS response_mode,
    metadata->'v42'->>'semantic_ban_passed' AS ban_passed,
    metadata->'v42'->'semantic_ban_categories' AS ban_cats,
    LEAD(metadata->'reaction'->>'type') OVER (
      PARTITION BY user_id, metadata->>'session_id'
      ORDER BY created_at
    ) AS next_reaction
  FROM stargazer_analytics
  WHERE event = 'home_alter_judgment'
    AND feature = 'home_alter'
    AND metadata->'v42'->>'role' IS NOT NULL
    AND created_at >= NOW() - INTERVAL '7 days'
)
SELECT
  COUNT(*) AS total_v42_turns,
  COUNT(*) FILTER (WHERE next_reaction IS NOT NULL) AS turns_with_followup,
  CASE
    WHEN COUNT(*) FILTER (WHERE next_reaction IS NOT NULL) < 10 THEN 'LOW_N'
    WHEN COUNT(*) FILTER (WHERE next_reaction IS NOT NULL) < 30 THEN 'CAUTION'
    ELSE 'OK'
  END AS sample_size_warning,

  -- A1. Aha率（全ロール、follow-up ありのうち agree+deepen）
  ROUND(
    COUNT(*) FILTER (WHERE next_reaction IN ('agree', 'deepen'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE next_reaction IS NOT NULL), 0) * 100, 1
  ) AS aha_rate_pct,
  CASE WHEN COUNT(*) FILTER (WHERE next_reaction IS NOT NULL) < 10 THEN 'LOW_N'
       WHEN ROUND(
    COUNT(*) FILTER (WHERE next_reaction IN ('agree', 'deepen'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE next_reaction IS NOT NULL), 0) * 100, 1
  ) >= 20 THEN 'PASS' ELSE 'FAIL' END AS aha_judgment,

  -- A2. 共同思考成功率（co_thinker のうち agree+deepen）
  COUNT(*) FILTER (WHERE v42_role = 'co_thinker' AND next_reaction IS NOT NULL) AS co_thinker_n,
  ROUND(
    COUNT(*) FILTER (WHERE v42_role = 'co_thinker' AND next_reaction IN ('agree', 'deepen'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE v42_role = 'co_thinker' AND next_reaction IS NOT NULL), 0) * 100, 1
  ) AS co_think_success_pct,
  CASE WHEN COUNT(*) FILTER (WHERE v42_role = 'co_thinker' AND next_reaction IS NOT NULL) < 5 THEN 'LOW_N'
       WHEN ROUND(
    COUNT(*) FILTER (WHERE v42_role = 'co_thinker' AND next_reaction IN ('agree', 'deepen'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE v42_role = 'co_thinker' AND next_reaction IS NOT NULL), 0) * 100, 1
  ) >= 40 THEN 'PASS' ELSE 'FAIL' END AS co_think_judgment,

  -- A3. repair成功率（repair のうち agree+deepen）
  COUNT(*) FILTER (WHERE v42_role = 'repair' AND next_reaction IS NOT NULL) AS repair_n,
  ROUND(
    COUNT(*) FILTER (WHERE v42_role = 'repair' AND next_reaction IN ('agree', 'deepen'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE v42_role = 'repair' AND next_reaction IS NOT NULL), 0) * 100, 1
  ) AS repair_success_pct,
  CASE WHEN COUNT(*) FILTER (WHERE v42_role = 'repair' AND next_reaction IS NOT NULL) < 3 THEN 'LOW_N'
       WHEN ROUND(
    COUNT(*) FILTER (WHERE v42_role = 'repair' AND next_reaction IN ('agree', 'deepen'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE v42_role = 'repair' AND next_reaction IS NOT NULL), 0) * 100, 1
  ) >= 60 THEN 'PASS' ELSE 'FAIL' END AS repair_judgment,

  -- A4. 直接回答率（conclude のうち evasion ban なし）
  ROUND(
    (COUNT(*) FILTER (WHERE response_mode = 'conclude')
     - COUNT(*) FILTER (WHERE response_mode = 'conclude' AND ban_passed = 'false' AND ban_cats @> '"evasion"')
    )::numeric
    / NULLIF(COUNT(*) FILTER (WHERE response_mode = 'conclude'), 0) * 100, 1
  ) AS direct_answer_pct,
  CASE WHEN ROUND(
    (COUNT(*) FILTER (WHERE response_mode = 'conclude')
     - COUNT(*) FILTER (WHERE response_mode = 'conclude' AND ban_passed = 'false' AND ban_cats @> '"evasion"')
    )::numeric
    / NULLIF(COUNT(*) FILTER (WHERE response_mode = 'conclude'), 0) * 100, 1
  ) >= 90 THEN 'PASS' ELSE 'FAIL' END AS direct_answer_judgment,

  -- A5. 責任転嫁率（delegation ban 残存率）
  ROUND(
    COUNT(*) FILTER (WHERE ban_passed = 'false' AND ban_cats @> '"delegation"')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS delegation_rate_pct,
  CASE WHEN ROUND(
    COUNT(*) FILTER (WHERE ban_passed = 'false' AND ban_cats @> '"delegation"')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) <= 5 THEN 'PASS' ELSE 'FAIL' END AS delegation_judgment

FROM v42_with_next;


-- ╔══════════════════════════════════════════════════════════╗
-- ║  B. 内部健全性 KPI（中で壊れていないか）                ║
-- ╚══════════════════════════════════════════════════════════╝

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- B1. Interpretation Arena: レンズ勝利分布
-- 確認: 特定レンズに偏っていないか（open_hypothesis が多すぎないか）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  metadata->'v42'->>'arena_primary_lens' AS primary_lens,
  COUNT(*) AS cnt,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'v42'->>'arena_primary_lens' IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY cnt DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- B2. Role Selection 分布
-- 確認: repair が多すぎないか（10%以下が健全）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  metadata->'v42'->>'role' AS alter_role,
  metadata->'v42'->>'role_reason' AS reason,
  COUNT(*) AS cnt,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'v42'->>'role' IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY cnt DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- B3. Self Model 充実度分布
-- 確認: 新規ユーザーは低い（<0.3）、5セッション以上は高い（>0.5）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  CASE
    WHEN (metadata->'v42'->>'completeness')::float < 0.2 THEN 'very_low (<0.2)'
    WHEN (metadata->'v42'->>'completeness')::float < 0.4 THEN 'low (0.2-0.4)'
    WHEN (metadata->'v42'->>'completeness')::float < 0.6 THEN 'medium (0.4-0.6)'
    WHEN (metadata->'v42'->>'completeness')::float < 0.8 THEN 'high (0.6-0.8)'
    ELSE 'very_high (0.8+)'
  END AS completeness_band,
  COUNT(*) AS cnt
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'v42'->>'completeness' IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- B4. Signal Reader: Intent 分布
-- 確認: neutral が多すぎないか（30%以下が健全）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  metadata->'v42'->>'intent' AS turn_intent,
  COUNT(*) AS cnt,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'v42'->>'intent' IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY cnt DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- B5. Semantic Ban 違反率
-- 合格基準: 5%以下
-- ━━��━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  COUNT(*) FILTER (WHERE metadata->'v42'->>'semantic_ban_passed' = 'false') AS ban_violations,
  COUNT(*) AS total,
  ROUND(
    COUNT(*) FILTER (WHERE metadata->'v42'->>'semantic_ban_passed' = 'false')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS violation_rate_pct
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'v42'->>'semantic_ban_passed' IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- B6. Strategy Compliance 違反率
-- 合格基準: critical 0%, warning < 10%
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  COUNT(*) FILTER (WHERE metadata->'v42'->>'compliance_passed' = 'false') AS compliance_failures,
  COUNT(*) FILTER (WHERE (metadata->'v42'->>'critical_violations')::int > 0) AS critical_failures,
  COUNT(*) AS total,
  ROUND(
    COUNT(*) FILTER (WHERE metadata->'v42'->>'compliance_passed' = 'false')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS failure_rate_pct
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'v42'->>'compliance_passed' IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- B7. Rally Critic: ラリー状態分布
-- 確認: looping が 10%以上なら堂々巡り対策が必要
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  metadata->'v42'->>'rally_status' AS status,
  COUNT(*) AS cnt,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct,
  ROUND(AVG((metadata->'v42'->>'rally_depth')::float), 2) AS avg_depth
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'v42'->>'rally_status' IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY cnt DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- B8. Novelty Gate 発動率
-- 確認: 5-15%が健全（低すぎ=多様性不足、高すぎ=不安定）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  COUNT(*) FILTER (WHERE metadata->'v42'->>'novelty_gate_triggered' = 'true') AS novelty_triggered,
  COUNT(*) AS total,
  ROUND(
    COUNT(*) FILTER (WHERE metadata->'v42'->>'novelty_gate_triggered' = 'true')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS trigger_rate_pct
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'v42'->>'novelty_gate_triggered' IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- B-SUMMARY. 内部健全性 KPI 一覧（PASS/FAIL 判定用）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH base AS (
  SELECT metadata
  FROM stargazer_analytics
  WHERE event = 'home_alter_judgment'
    AND feature = 'home_alter'
    AND metadata->'v42'->>'role' IS NOT NULL
    AND created_at >= NOW() - INTERVAL '7 days'
)
SELECT
  COUNT(*) AS total_v42_turns,
  -- Arena
  COUNT(DISTINCT metadata->'v42'->>'arena_primary_lens') AS unique_lenses_used,
  ROUND(
    COUNT(*) FILTER (WHERE metadata->'v42'->>'arena_primary_lens' = 'open_hypothesis')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS open_hypothesis_pct,
  -- Role
  ROUND(
    COUNT(*) FILTER (WHERE metadata->'v42'->>'role' = 'repair')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS repair_role_pct,
  -- Bans
  ROUND(
    COUNT(*) FILTER (WHERE metadata->'v42'->>'semantic_ban_passed' = 'false')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS semantic_ban_fail_pct,
  -- Compliance
  ROUND(
    COUNT(*) FILTER (WHERE metadata->'v42'->>'compliance_passed' = 'false')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS compliance_fail_pct,
  -- Rally
  ROUND(
    COUNT(*) FILTER (WHERE metadata->'v42'->>'rally_status' = 'looping')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS looping_pct,
  -- Self Model
  ROUND(AVG((metadata->'v42'->>'completeness')::float) * 100, 1) AS avg_model_completeness_pct
FROM base;
