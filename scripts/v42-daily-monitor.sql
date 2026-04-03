-- v4.2 日次監視クエリ（4/4〜4/10 毎日実行）
-- 使い方: Supabase SQL Editor にコピーして実行
-- 3項目を見る: ① 障害有無 ② 再生成発火率 ③ latency

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- D1. 24h 基本ヘルスチェック
-- v4.2 リクエスト数、成功率、latency 中央値/P95
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  COUNT(*) AS total_requests_24h,
  COUNT(*) FILTER (WHERE metadata->'v42'->>'role' IS NOT NULL) AS v42_active_requests,
  -- latency（total_latency_ms が記録されている行のみ）
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY (metadata->>'total_latency_ms')::int
  )) AS latency_p50_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (
    ORDER BY (metadata->>'total_latency_ms')::int
  )) AS latency_p95_ms,
  MAX((metadata->>'total_latency_ms')::int) AS latency_max_ms,
  -- LLM 呼出し回数
  ROUND(AVG((metadata->>'llm_call_count')::int), 1) AS avg_llm_calls,
  MAX((metadata->>'llm_call_count')::int) AS max_llm_calls,
  -- 判定
  CASE
    WHEN MAX((metadata->>'total_latency_ms')::int) > 30000 THEN '🔴 TIMEOUT_RISK'
    WHEN ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (metadata->>'total_latency_ms')::int)) > 15000 THEN '🟡 SLOW'
    ELSE '🟢 HEALTHY'
  END AS latency_judgment
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND created_at >= NOW() - INTERVAL '24 hours';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- D2. Compliance 再生成発火率（24h）
-- 再生成が発動した回数と成功率
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  COUNT(*) AS regeneration_fires_24h,
  COUNT(*) FILTER (WHERE (metadata->>'regeneration_succeeded')::boolean = true) AS regen_succeeded,
  COUNT(*) FILTER (WHERE (metadata->>'regeneration_succeeded')::boolean = false) AS regen_failed,
  -- ban 違反の元の数
  ROUND(AVG((metadata->>'original_ban_violations')::int), 1) AS avg_original_violations,
  -- 判定
  CASE
    WHEN COUNT(*) = 0 THEN '🟢 NO_VIOLATIONS'
    WHEN COUNT(*) FILTER (WHERE (metadata->>'regeneration_succeeded')::boolean = false) > 0 THEN '🟡 REGEN_FAILURES'
    ELSE '🟢 ALL_CAUGHT'
  END AS regen_judgment
FROM stargazer_analytics
WHERE event = 'v42_compliance_regeneration'
  AND created_at >= NOW() - INTERVAL '24 hours';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- D3. Kill Switch 判定サマリ（24h）
-- kill switch を切るべきレベルの問題がないかの一覧
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH daily AS (
  SELECT
    metadata->'v42'->>'semantic_ban_passed' AS ban_passed,
    metadata->'v42'->>'compliance_passed' AS compliance_passed,
    (metadata->'v42'->>'critical_violations')::int AS critical_violations,
    metadata->'v42'->>'rally_status' AS rally_status,
    (metadata->>'total_latency_ms')::int AS latency_ms,
    (metadata->>'llm_call_count')::int AS llm_calls
  FROM stargazer_analytics
  WHERE event = 'home_alter_judgment'
    AND feature = 'home_alter'
    AND metadata->'v42'->>'role' IS NOT NULL
    AND created_at >= NOW() - INTERVAL '24 hours'
)
SELECT
  COUNT(*) AS v42_turns,
  -- Semantic Ban 違反率
  ROUND(COUNT(*) FILTER (WHERE ban_passed = 'false')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS ban_violation_pct,
  -- Critical Compliance 違反
  COUNT(*) FILTER (WHERE critical_violations > 0) AS critical_compliance_count,
  -- Looping 率
  ROUND(COUNT(*) FILTER (WHERE rally_status = 'looping')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS looping_pct,
  -- latency > 20s の件数
  COUNT(*) FILTER (WHERE latency_ms > 20000) AS slow_requests,
  -- LLM 呼出し > 5 の件数
  COUNT(*) FILTER (WHERE llm_calls > 5) AS high_llm_call_requests,
  -- kill switch 判定
  CASE
    WHEN COUNT(*) FILTER (WHERE critical_violations > 0) > 0 THEN '🔴 KILL: critical compliance violations'
    WHEN ROUND(COUNT(*) FILTER (WHERE ban_passed = 'false')::numeric / NULLIF(COUNT(*), 0) * 100, 1) > 20 THEN '🔴 KILL: ban violation >20%'
    WHEN COUNT(*) FILTER (WHERE latency_ms > 30000) > 0 THEN '🔴 KILL: timeout-level latency'
    WHEN ROUND(COUNT(*) FILTER (WHERE rally_status = 'looping')::numeric / NULLIF(COUNT(*), 0) * 100, 1) > 30 THEN '🟡 WATCH: high looping rate'
    WHEN ROUND(COUNT(*) FILTER (WHERE ban_passed = 'false')::numeric / NULLIF(COUNT(*), 0) * 100, 1) > 10 THEN '🟡 WATCH: ban violation >10%'
    ELSE '🟢 OK: no kill-switch triggers'
  END AS kill_switch_verdict
FROM daily;
