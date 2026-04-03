-- v4.2 FULL Pipeline 評価クエリ集
-- 使い方: Supabase SQL Editor にコピーして実行
-- 期間: デプロイ後 7日分のデータで判断

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Interpretation Arena: レンズ勝利分布
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
-- 2. Role Selection 分布
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
-- 3. Self Model 充実度分布
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
-- 4. Signal Reader: Intent 分布
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
-- 5. Semantic Ban 違反率
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
-- 6. Strategy Compliance 違反率
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
-- 7. Rally Critic: ラリー状態分布
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
-- 8. Novelty Gate 発動率
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
-- 9. v4.2 全 KPI サマリ（PASS/FAIL 判定用）
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
