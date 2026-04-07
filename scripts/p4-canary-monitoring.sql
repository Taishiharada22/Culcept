-- P4-6.5 Canary 監視クエリ
-- 使い方: Supabase SQL Editor で実行
-- 対象期間: 直近7日（WHERE句を調整可能）

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 指標1: live 統合発火率
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  COUNT(*)                                    AS total_fires,
  COUNT(*) FILTER (WHERE live_integrated)     AS integrated,
  COUNT(*) FILTER (WHERE NOT live_integrated) AS not_integrated,
  ROUND(
    COUNT(*) FILTER (WHERE live_integrated)::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  )                                           AS integration_rate_pct
FROM stargazer_counterfactual_shadow_log
WHERE created_at >= now() - interval '7 days';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 指標2: rejected_post_check 率
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  COUNT(*)                                                AS total_fires,
  COUNT(*) FILTER (WHERE decision = 'rejected_post_check') AS post_check_rejected,
  ROUND(
    COUNT(*) FILTER (WHERE decision = 'rejected_post_check')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  )                                                       AS post_check_reject_rate_pct
FROM stargazer_counterfactual_shadow_log
WHERE created_at >= now() - interval '7 days';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 指標3: decision 分布（再生成フォールバック含む）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  decision,
  COUNT(*)     AS count,
  ROUND(COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100, 1) AS pct
FROM stargazer_counterfactual_shadow_log
WHERE created_at >= now() - interval '7 days'
GROUP BY decision
ORDER BY count DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 指標4: latency 分布
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  COUNT(*)                        AS total,
  ROUND(AVG(latency_ms), 0)      AS avg_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)  AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
  MAX(latency_ms)                 AS max_ms
FROM stargazer_counterfactual_shadow_log
WHERE created_at >= now() - interval '7 days'
  AND decision != 'rejected_post_check';  -- post-check は latency_ms=0 なので除外

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 指標5: violation type 分布
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  unnest(violation_types) AS violation_type,
  COUNT(*)                AS count
FROM stargazer_counterfactual_shadow_log
WHERE created_at >= now() - interval '7 days'
  AND array_length(violation_types, 1) > 0
GROUP BY violation_type
ORDER BY count DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 指標6: ユーザー別サマリ（違和感・rupture 確認用）
-- home_alter_judgment analytics から P4 統合セッションを抽出
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  sa.user_id,
  COUNT(*)                                                              AS total_sessions,
  COUNT(*) FILTER (WHERE (sa.metadata->>'p4_live_integrated')::boolean) AS p4_integrated,
  COUNT(*) FILTER (WHERE sa.metadata->>'p4_decision' = 'adopted')       AS adopted,
  COUNT(*) FILTER (WHERE sa.metadata->>'p4_decision' = 'rejected')      AS rejected
FROM stargazer_analytics sa
WHERE sa.event = 'home_alter_judgment'
  AND sa.created_at >= now() - interval '7 days'
  AND sa.metadata->>'p4_decision' IS NOT NULL
GROUP BY sa.user_id
ORDER BY p4_integrated DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 絶対レッドライン: 直近の全ログ一覧（問題発生時の詳細確認用）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  id,
  user_id,
  perspective,
  source_part,
  shift_direction,
  safe,
  decision,
  violation_types,
  latency_ms,
  candidate_length,
  candidate_text_preview,
  live_integrated,
  created_at
FROM stargazer_counterfactual_shadow_log
WHERE created_at >= now() - interval '7 days'
ORDER BY created_at DESC
LIMIT 50;
