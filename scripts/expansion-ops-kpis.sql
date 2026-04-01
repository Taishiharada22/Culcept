-- scripts/expansion-ops-kpis.sql
-- P4 運用確認フェーズ: 拡張軸の安全性 + 価値検証 KPI
-- Supabase SQL Editor で実行可能

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. 出題率（日別）+ 1日1問チェック
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  session_date,
  count(DISTINCT user_id) AS users_with_expansion_q,
  count(*) AS total_expansion_snapshots,
  count(*) FILTER (WHERE per_user_count > 1) AS users_exceeding_1_per_day
FROM (
  SELECT
    user_id, session_date,
    count(*) OVER (PARTITION BY user_id, session_date) AS per_user_count
  FROM stargazer_axis_snapshots
  WHERE variant_id LIKE 'exp_%'
    AND session_date >= CURRENT_DATE - INTERVAL '30 days'
) sub
GROUP BY session_date
ORDER BY session_date DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. 軸ごとの出題分布 + 回答時間
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  axis_id,
  count(*) AS total_asked,
  count(DISTINCT user_id) AS unique_users,
  round(avg(score::numeric), 3) AS avg_score,
  round(stddev(score::numeric), 3) AS score_stddev,
  count(DISTINCT variant_id) AS unique_questions_used
FROM stargazer_axis_snapshots
WHERE variant_id LIKE 'exp_%'
  AND session_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY axis_id
ORDER BY total_asked DESC;

-- 回答時間（raw_answers から抽出）
SELECT
  (raw_answers->'expansionAnswer'->>'questionId') AS question_id,
  count(*) AS answer_count,
  round(percentile_cont(0.5) WITHIN GROUP (
    ORDER BY (raw_answers->'expansionAnswer'->>'responseTimeMs')::numeric
  )) AS response_time_median_ms,
  round(percentile_cont(0.9) WITHIN GROUP (
    ORDER BY (raw_answers->'expansionAnswer'->>'responseTimeMs')::numeric
  )) AS response_time_p90_ms
FROM stargazer_daily_states
WHERE raw_answers->'expansionAnswer'->>'questionId' IS NOT NULL
  AND raw_answers->'expansionAnswer'->>'responseTimeMs' IS NOT NULL
  AND observation_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY question_id
ORDER BY question_id;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. 回答完了率
--    served = raw_answers に expansionAnswer が存在するセッション
--    answered = axis_snapshots に exp_ レコードがあるユーザー日
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH served AS (
  SELECT count(*) AS cnt
  FROM stargazer_daily_states
  WHERE raw_answers->'expansionAnswer'->>'questionId' IS NOT NULL
    AND observation_date >= CURRENT_DATE - INTERVAL '30 days'
),
answered AS (
  SELECT count(DISTINCT user_id || ':' || session_date) AS cnt
  FROM stargazer_axis_snapshots
  WHERE variant_id LIKE 'exp_%'
    AND session_date >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT
  s.cnt AS served,
  a.cnt AS answered,
  CASE WHEN s.cnt > 0
    THEN round(100.0 * a.cnt / s.cnt, 1)
    ELSE NULL
  END AS completion_rate_pct
FROM served s, answered a;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. 解放率 + precision改善量 + visible到達率
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH expansion_beliefs AS (
  SELECT
    sp.user_id,
    key AS axis_id,
    (value->>'mu')::numeric AS mu,
    (value->>'precision')::numeric AS precision,
    LEAST(0.45, 0.45 * (1 - exp(-(value->>'precision')::numeric / 15.0))) AS confidence
  FROM stargazer_profiles sp,
       jsonb_each(sp.axis_beliefs::jsonb) AS kv(key, value)
  WHERE key IN (
    'energy_rhythm', 'conflict_style', 'novelty_threshold',
    'self_disclosure_depth', 'decision_regret', 'relational_investment'
  )
),
tiered AS (
  SELECT *,
    CASE
      WHEN confidence < 0.15 THEN 'hidden'
      WHEN confidence < 0.25 THEN 'emerging'
      WHEN confidence < 0.35 THEN 'forming'
      ELSE 'visible'
    END AS display_tier
  FROM expansion_beliefs
)
SELECT
  axis_id,
  count(*) AS total_users,
  count(*) FILTER (WHERE display_tier = 'hidden') AS hidden,
  count(*) FILTER (WHERE display_tier = 'emerging') AS emerging,
  count(*) FILTER (WHERE display_tier = 'forming') AS forming,
  count(*) FILTER (WHERE display_tier = 'visible') AS visible,
  round(100.0 * count(*) FILTER (WHERE display_tier != 'hidden') / NULLIF(count(*), 0), 1) AS release_rate_pct,
  round(100.0 * count(*) FILTER (WHERE display_tier = 'visible') / NULLIF(count(*), 0), 1) AS visible_rate_pct,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY precision), 2) AS precision_median,
  round(percentile_cont(0.75) WITHIN GROUP (ORDER BY precision), 2) AS precision_p75,
  round(max(precision), 2) AS precision_max
FROM tiered
GROUP BY axis_id
ORDER BY axis_id;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. 日次観測の軽さ (avg + p90 + p95)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH per_session AS (
  SELECT
    user_id, session_date,
    count(*) AS q_count,
    count(*) FILTER (WHERE variant_id LIKE 'exp_%') AS exp_count
  FROM stargazer_axis_snapshots
  WHERE session_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY user_id, session_date
)
SELECT
  session_date,
  count(*) AS active_sessions,
  round(avg(q_count), 1) AS avg_q,
  round(percentile_cont(0.9) WITHIN GROUP (ORDER BY q_count), 1) AS p90_q,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY q_count), 1) AS p95_q,
  round(avg(exp_count), 2) AS avg_exp,
  max(q_count) AS max_q,
  count(*) FILTER (WHERE q_count > 10) AS heavy_sessions
FROM per_session
GROUP BY session_date
ORDER BY session_date DESC
LIMIT 14;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. Core逆流チェック（0行であるべき）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT id, user_id, axis_id, variant_id, session_date
FROM stargazer_axis_snapshots
WHERE variant_id LIKE 'exp_%'
  AND axis_id NOT IN (
    'energy_rhythm', 'conflict_style', 'novelty_threshold',
    'self_disclosure_depth', 'decision_regret', 'relational_investment'
  )
LIMIT 10;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. 解放進捗の軸間偏り
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH visible_counts AS (
  SELECT
    key AS axis_id,
    count(*) FILTER (
      WHERE LEAST(0.45, 0.45 * (1 - exp(-(value->>'precision')::numeric / 15.0))) >= 0.35
    ) AS visible_count,
    count(*) AS total_count
  FROM stargazer_profiles,
       jsonb_each(axis_beliefs::jsonb) AS kv(key, value)
  WHERE key IN (
    'energy_rhythm', 'conflict_style', 'novelty_threshold',
    'self_disclosure_depth', 'decision_regret', 'relational_investment'
  )
  GROUP BY key
)
SELECT
  axis_id,
  visible_count,
  total_count,
  CASE WHEN total_count > 0
    THEN round(100.0 * visible_count / total_count, 1)
    ELSE 0
  END AS visible_rate_pct,
  visible_count - min(visible_count) OVER () AS gap_from_min,
  max(visible_count) OVER () - visible_count AS gap_from_max
FROM visible_counts
ORDER BY visible_rate_pct DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. サマリー
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  (SELECT count(DISTINCT user_id) FROM stargazer_axis_snapshots
   WHERE variant_id LIKE 'exp_%') AS total_expansion_users,
  (SELECT count(*) FROM stargazer_axis_snapshots
   WHERE variant_id LIKE 'exp_%') AS total_expansion_answers,
  (SELECT count(DISTINCT axis_id) FROM stargazer_axis_snapshots
   WHERE variant_id LIKE 'exp_%') AS axes_with_data,
  (SELECT CASE WHEN count(*) > 0 THEN 'BUG' ELSE 'OK' END
   FROM stargazer_axis_snapshots
   WHERE variant_id LIKE 'exp_%'
     AND axis_id NOT IN (
       'energy_rhythm', 'conflict_style', 'novelty_threshold',
       'self_disclosure_depth', 'decision_regret', 'relational_investment'
     )) AS core_isolation;
