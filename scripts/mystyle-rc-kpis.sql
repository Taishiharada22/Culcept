-- My Style RC KPI ダッシュボード
-- 期間: 限定公開開始から1週間
-- 実行方法: Supabase SQL Editor で実行
-- 注意: @start_date を限定公開開始日に書き換えること

-- ═══════════════════════════════════════════════
-- 0. 期間設定
-- ═══════════════════════════════════════════════

-- SET @start_date = '2026-04-05';  -- Supabase は SET 非対応のため下記 CTE で定義

WITH period AS (
  SELECT
    '2026-04-05'::date AS start_date,
    '2026-04-12'::date AS end_date
),

-- ═══════════════════════════════════════════════
-- 基礎集計
-- ═══════════════════════════════════════════════

events AS (
  SELECT *
  FROM stargazer_analytics
  WHERE created_at >= (SELECT start_date FROM period)
    AND created_at < (SELECT end_date FROM period)
    AND event LIKE 'mystyle_%'
),

-- ═══════════════════════════════════════════════
-- KPI 1: decision_completion_rate
-- 提案を見た人のうち「これ着る」を押した割合
-- ═══════════════════════════════════════════════

kpi1_proposal_shown AS (
  SELECT COUNT(DISTINCT user_id) AS cnt
  FROM events WHERE event = 'mystyle_proposal_shown'
),
kpi1_proposal_accepted AS (
  SELECT COUNT(DISTINCT user_id) AS cnt
  FROM events WHERE event = 'mystyle_proposal_accepted'
),

-- ═══════════════════════════════════════════════
-- KPI 2: onboarding_completion_rate
-- オンボーディング開始者のうち完了した割合
-- ═══════════════════════════════════════════════

kpi2_onboarding_start AS (
  SELECT COUNT(DISTINCT user_id) AS cnt
  FROM events WHERE event = 'mystyle_onboarding_start'
),
kpi2_onboarding_complete AS (
  SELECT COUNT(DISTINCT user_id) AS cnt
  FROM events WHERE event = 'mystyle_onboarding_complete'
),

-- ═══════════════════════════════════════════════
-- KPI 3: satisfaction_rate
-- 着用記録者のうち満足度を記録した割合
-- ═══════════════════════════════════════════════

kpi3_accepted AS (
  SELECT COUNT(DISTINCT user_id) AS cnt
  FROM events WHERE event = 'mystyle_proposal_accepted'
),
kpi3_satisfaction AS (
  SELECT COUNT(DISTINCT user_id) AS cnt
  FROM events WHERE event = 'mystyle_satisfaction_recorded'
),

-- ═══════════════════════════════════════════════
-- KPI 4: d7_retention
-- 初日に訪問したユーザーのうち7日後にも訪問した割合
-- ═══════════════════════════════════════════════

kpi4_first_visit AS (
  SELECT user_id, MIN(created_at::date) AS first_day
  FROM events
  WHERE event IN ('mystyle_today_view', 'mystyle_closet_view', 'mystyle_self_view')
  GROUP BY user_id
),
kpi4_return_visit AS (
  SELECT DISTINCT fv.user_id
  FROM kpi4_first_visit fv
  JOIN events e ON e.user_id = fv.user_id
    AND e.event IN ('mystyle_today_view', 'mystyle_closet_view', 'mystyle_self_view')
    AND e.created_at::date >= fv.first_day + 7
),

-- ═══════════════════════════════════════════════
-- KPI 5: mystyle_failure 発生率
-- セッション数に対する failure 発生割合
-- ═══════════════════════════════════════════════

kpi5_sessions AS (
  SELECT COUNT(DISTINCT user_id || '-' || created_at::date) AS cnt
  FROM events
  WHERE event IN ('mystyle_today_view', 'mystyle_closet_view', 'mystyle_self_view')
),
kpi5_failures AS (
  SELECT COUNT(*) AS cnt
  FROM events WHERE event = 'mystyle_failure'
)

-- ═══════════════════════════════════════════════
-- 結果出力
-- ═══════════════════════════════════════════════

SELECT
  -- KPI 1
  (SELECT cnt FROM kpi1_proposal_shown) AS "提案閲覧ユーザー数",
  (SELECT cnt FROM kpi1_proposal_accepted) AS "着用記録ユーザー数",
  CASE WHEN (SELECT cnt FROM kpi1_proposal_shown) > 0
    THEN ROUND((SELECT cnt FROM kpi1_proposal_accepted)::numeric / (SELECT cnt FROM kpi1_proposal_shown) * 100, 1)
    ELSE 0
  END AS "decision_completion_rate_%",

  -- KPI 2
  (SELECT cnt FROM kpi2_onboarding_start) AS "オンボ開始ユーザー数",
  (SELECT cnt FROM kpi2_onboarding_complete) AS "オンボ完了ユーザー数",
  CASE WHEN (SELECT cnt FROM kpi2_onboarding_start) > 0
    THEN ROUND((SELECT cnt FROM kpi2_onboarding_complete)::numeric / (SELECT cnt FROM kpi2_onboarding_start) * 100, 1)
    ELSE 0
  END AS "onboarding_completion_rate_%",

  -- KPI 3
  (SELECT cnt FROM kpi3_accepted) AS "着用記録ユーザー数_2",
  (SELECT cnt FROM kpi3_satisfaction) AS "満足度記録ユーザー数",
  CASE WHEN (SELECT cnt FROM kpi3_accepted) > 0
    THEN ROUND((SELECT cnt FROM kpi3_satisfaction)::numeric / (SELECT cnt FROM kpi3_accepted) * 100, 1)
    ELSE 0
  END AS "satisfaction_rate_%",

  -- KPI 4
  (SELECT COUNT(*) FROM kpi4_first_visit) AS "初訪問ユーザー数",
  (SELECT COUNT(*) FROM kpi4_return_visit) AS "D7復帰ユーザー数",
  CASE WHEN (SELECT COUNT(*) FROM kpi4_first_visit) > 0
    THEN ROUND((SELECT COUNT(*) FROM kpi4_return_visit)::numeric / (SELECT COUNT(*) FROM kpi4_first_visit) * 100, 1)
    ELSE 0
  END AS "d7_retention_%",

  -- KPI 5
  (SELECT cnt FROM kpi5_sessions) AS "セッション数",
  (SELECT cnt FROM kpi5_failures) AS "failure数",
  CASE WHEN (SELECT cnt FROM kpi5_sessions) > 0
    THEN ROUND((SELECT cnt FROM kpi5_failures)::numeric / (SELECT cnt FROM kpi5_sessions) * 100, 2)
    ELSE 0
  END AS "mystyle_failure_rate_%";
