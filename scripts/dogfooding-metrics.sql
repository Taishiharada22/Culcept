-- ============================================================
-- 創業者ドッグフーディング集計
-- 3軸: 言い当て精度 / 納得感 / 行動変化
-- + 運用指標: プリセット選択率 / 保留率 / フィードバック率 / SvO完走率
--
-- 合格ライン:
--   ✅ 言い当て精度: accuracy_rate > 50% (偶然以上)
--   ✅ 納得感: avg_satisfaction >= 3.5
--   ✅ 行動変化: 3日中2日以上アクセス
-- ============================================================

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. プリセット選択率
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  count(*) AS total_decisions,
  count(*) FILTER (WHERE is_preset = TRUE) AS preset_count,
  count(*) FILTER (WHERE is_preset = FALSE OR is_preset IS NULL) AS free_count,
  round(
    count(*) FILTER (WHERE is_preset = TRUE)::numeric / NULLIF(count(*), 0) * 100, 1
  ) AS preset_rate_pct,
  -- タイプ別内訳
  count(*) FILTER (WHERE decision_type = 'social') AS social,
  count(*) FILTER (WHERE decision_type = 'reply') AS reply,
  count(*) FILTER (WHERE decision_type = 'rest') AS rest,
  count(*) FILTER (WHERE decision_type = 'priority') AS priority,
  count(*) FILTER (WHERE decision_type = 'free') AS free_text
FROM stargazer_decision_engine_logs
WHERE decision_date >= current_date - interval '14 days';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. 保留率（withheld = true の割合）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  count(*) AS total_decisions,
  count(*) FILTER (WHERE withheld = TRUE) AS withheld_count,
  round(
    count(*) FILTER (WHERE withheld = TRUE)::numeric / NULLIF(count(*), 0) * 100, 1
  ) AS withheld_rate_pct
FROM stargazer_decision_engine_logs
WHERE decision_date >= current_date - interval '14 days';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. フィードバック率
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  count(*) AS total_decisions,
  count(*) FILTER (WHERE feedback_note IS NOT NULL) AS accuracy_feedback_count,
  count(*) FILTER (WHERE satisfaction_rating IS NOT NULL) AS satisfaction_feedback_count,
  round(
    count(*) FILTER (WHERE feedback_note IS NOT NULL)::numeric / NULLIF(count(*), 0) * 100, 1
  ) AS accuracy_feedback_rate_pct,
  round(
    count(*) FILTER (WHERE satisfaction_rating IS NOT NULL)::numeric / NULLIF(count(*), 0) * 100, 1
  ) AS satisfaction_feedback_rate_pct,
  round(avg(satisfaction_rating), 2) AS avg_satisfaction
FROM stargazer_decision_engine_logs
WHERE decision_date >= current_date - interval '14 days';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. Self vs Oracle 完走率
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  count(*) AS total_challenges,
  count(*) FILTER (WHERE status = 'pending') AS pending,
  count(*) FILTER (WHERE status = 'user_predicted') AS predicted_only,
  count(*) FILTER (WHERE status = 'verified') AS completed,
  round(
    count(*) FILTER (WHERE status = 'verified')::numeric / NULLIF(count(*), 0) * 100, 1
  ) AS completion_rate_pct,
  -- 精度（完走分のみ）
  round(avg(oracle_correct_count) FILTER (WHERE status = 'verified'), 2) AS avg_oracle_correct,
  round(avg(user_correct_count) FILTER (WHERE status = 'verified'), 2) AS avg_user_correct
FROM stargazer_self_vs_oracle_challenges
WHERE challenge_date >= current_date - interval '14 days';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 日別アクティビティ概要
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  d.dt::date AS date,
  coalesce(de.decisions, 0) AS decisions,
  coalesce(de.with_feedback, 0) AS with_feedback,
  coalesce(svo.challenges, 0) AS svo_challenges,
  coalesce(svo.completed, 0) AS svo_completed,
  coalesce(di.interventions, 0) AS interventions
FROM generate_series(
  current_date - interval '14 days',
  current_date,
  interval '1 day'
) d(dt)
LEFT JOIN (
  SELECT decision_date, count(*) AS decisions,
    count(*) FILTER (WHERE feedback_note IS NOT NULL) AS with_feedback
  FROM stargazer_decision_engine_logs GROUP BY decision_date
) de ON de.decision_date = d.dt::date
LEFT JOIN (
  SELECT challenge_date, count(*) AS challenges,
    count(*) FILTER (WHERE status = 'verified') AS completed
  FROM stargazer_self_vs_oracle_challenges GROUP BY challenge_date
) svo ON svo.challenge_date = d.dt::date
LEFT JOIN (
  SELECT intervention_date, count(*) AS interventions
  FROM stargazer_daily_interventions GROUP BY intervention_date
) di ON di.intervention_date = d.dt::date
ORDER BY date DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 【合格判定サマリー】
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  -- 言い当て精度
  round(
    count(*) FILTER (WHERE feedback_note = 'accurate')::numeric
    / NULLIF(count(*) FILTER (WHERE feedback_note IS NOT NULL), 0) * 100, 1
  ) AS accuracy_rate_pct,
  CASE WHEN round(
    count(*) FILTER (WHERE feedback_note = 'accurate')::numeric
    / NULLIF(count(*) FILTER (WHERE feedback_note IS NOT NULL), 0) * 100, 1
  ) > 50 THEN '✅' ELSE '❌' END AS accuracy_pass,

  -- 納得感
  round(avg(satisfaction_rating), 2) AS avg_satisfaction,
  CASE WHEN avg(satisfaction_rating) >= 3.5 THEN '✅' ELSE '❌' END AS satisfaction_pass,

  -- 行動変化（利用日数）
  count(DISTINCT decision_date) AS active_days,
  CASE WHEN count(DISTINCT decision_date) >= 2 THEN '✅' ELSE '❌' END AS continuity_pass
FROM stargazer_decision_engine_logs
WHERE decision_date >= current_date - interval '3 days';
