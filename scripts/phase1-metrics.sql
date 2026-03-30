-- ============================================================
-- Phase 1 実験メトリクス集計 SQL
-- 3軸: 言い当て精度 / 納得感 / 行動変化
-- 対象期間: 直近14日間（実験開始後に WHERE 日付を調整）
-- ============================================================

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 軸1: 言い当て精度（Self vs Oracle）
-- Oracle がユーザーの判断をどれだけ正しく予測できたか
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1-a. ユーザー別の Oracle 正解率（日次）
SELECT
  u.email,
  c.challenge_date,
  c.oracle_correct_count,
  c.user_correct_count,
  jsonb_array_length(c.scenarios) AS total_scenarios,
  CASE WHEN jsonb_array_length(c.scenarios) > 0
    THEN round(c.oracle_correct_count::numeric / jsonb_array_length(c.scenarios) * 100, 1)
    ELSE 0
  END AS oracle_accuracy_pct,
  CASE WHEN jsonb_array_length(c.scenarios) > 0
    THEN round(c.user_correct_count::numeric / jsonb_array_length(c.scenarios) * 100, 1)
    ELSE 0
  END AS user_self_accuracy_pct
FROM stargazer_self_vs_oracle_challenges c
JOIN auth.users u ON u.id = c.user_id
WHERE c.status = 'verified'
  AND c.challenge_date >= current_date - interval '14 days'
ORDER BY c.challenge_date DESC, u.email;

-- 1-b. 全体サマリー（Oracle 精度の平均・中央値）
SELECT
  count(*) AS total_challenges,
  round(avg(oracle_accuracy), 1) AS avg_oracle_accuracy,
  round(avg(user_accuracy), 1) AS avg_user_accuracy,
  round(avg(oracle_accuracy) - avg(user_accuracy), 1) AS oracle_advantage
FROM (
  SELECT
    c.id,
    CASE WHEN jsonb_array_length(c.scenarios) > 0
      THEN c.oracle_correct_count::numeric / jsonb_array_length(c.scenarios) * 100
      ELSE 0
    END AS oracle_accuracy,
    CASE WHEN jsonb_array_length(c.scenarios) > 0
      THEN c.user_correct_count::numeric / jsonb_array_length(c.scenarios) * 100
      ELSE 0
    END AS user_accuracy
  FROM stargazer_self_vs_oracle_challenges c
  WHERE c.status = 'verified'
    AND c.challenge_date >= current_date - interval '14 days'
) sub;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 軸2: 納得感（Decision Engine satisfaction_rating）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 2-a. ユーザー別の納得感スコア（日次）
SELECT
  u.email,
  d.decision_date,
  d.decision_type,
  d.satisfaction_rating,
  d.feedback_note
FROM stargazer_decision_engine_logs d
JOIN auth.users u ON u.id = d.user_id
WHERE d.satisfaction_rating IS NOT NULL
  AND d.decision_date >= current_date - interval '14 days'
ORDER BY d.decision_date DESC, u.email;

-- 2-b. 全体サマリー
SELECT
  count(*) AS total_feedback,
  round(avg(satisfaction_rating), 2) AS avg_satisfaction,
  count(*) FILTER (WHERE satisfaction_rating >= 4) AS high_satisfaction_count,
  count(*) FILTER (WHERE satisfaction_rating <= 2) AS low_satisfaction_count,
  round(
    count(*) FILTER (WHERE satisfaction_rating >= 4)::numeric / NULLIF(count(*), 0) * 100, 1
  ) AS high_satisfaction_pct
FROM stargazer_decision_engine_logs
WHERE satisfaction_rating IS NOT NULL
  AND decision_date >= current_date - interval '14 days';

-- 2-c. 正確性フィードバック分布
SELECT
  feedback_note,
  count(*) AS cnt,
  round(count(*)::numeric / NULLIF(sum(count(*)) OVER (), 0) * 100, 1) AS pct
FROM stargazer_decision_engine_logs
WHERE feedback_note IS NOT NULL
  AND decision_date >= current_date - interval '14 days'
GROUP BY feedback_note
ORDER BY cnt DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 軸3: 行動変化
-- 継続利用日数 / 利用頻度の変化 / フィードバック傾向の推移
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 3-a. ユーザー別の利用日数・アクション数
SELECT
  u.email,
  count(DISTINCT d.decision_date) AS active_days_decision,
  count(DISTINCT c.challenge_date) AS active_days_svo,
  count(DISTINCT i.intervention_date) AS active_days_intervention,
  GREATEST(
    count(DISTINCT d.decision_date),
    count(DISTINCT c.challenge_date),
    count(DISTINCT i.intervention_date)
  ) AS max_active_days
FROM auth.users u
LEFT JOIN stargazer_decision_engine_logs d
  ON d.user_id = u.id AND d.decision_date >= current_date - interval '14 days'
LEFT JOIN stargazer_self_vs_oracle_challenges c
  ON c.user_id = u.id AND c.challenge_date >= current_date - interval '14 days'
LEFT JOIN stargazer_daily_interventions i
  ON i.user_id = u.id AND i.intervention_date >= current_date - interval '14 days'
WHERE u.id IN (SELECT user_id FROM stargazer_resolved_types)
GROUP BY u.email
ORDER BY max_active_days DESC;

-- 3-b. 週次トレンド（前半7日 vs 後半7日の利用量比較）
SELECT
  CASE
    WHEN decision_date < current_date - interval '7 days' THEN 'week1'
    ELSE 'week2'
  END AS period,
  count(*) AS total_decisions,
  count(*) FILTER (WHERE feedback_note IS NOT NULL) AS with_feedback,
  round(avg(satisfaction_rating), 2) AS avg_satisfaction
FROM stargazer_decision_engine_logs
WHERE decision_date >= current_date - interval '14 days'
GROUP BY period
ORDER BY period;

-- 3-c. 正確性フィードバックの週次推移（行動変化の間接指標）
-- 「当たってた」の比率が上がる = Oracle の精度向上 or ユーザーの自己理解向上
SELECT
  CASE
    WHEN decision_date < current_date - interval '7 days' THEN 'week1'
    ELSE 'week2'
  END AS period,
  count(*) FILTER (WHERE feedback_note = 'accurate') AS accurate_cnt,
  count(*) FILTER (WHERE feedback_note = 'off') AS off_cnt,
  count(*) FILTER (WHERE feedback_note = 'unsure') AS unsure_cnt,
  count(*) FILTER (WHERE feedback_note IS NOT NULL) AS total_feedback
FROM stargazer_decision_engine_logs
WHERE decision_date >= current_date - interval '14 days'
GROUP BY period
ORDER BY period;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ボーナス: Daily Intervention の helpful_rating 集計
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT
  u.email,
  count(*) AS intervention_count,
  round(avg(di.helpful_rating), 2) AS avg_helpful_rating,
  count(*) FILTER (WHERE di.helpful_rating IS NOT NULL) AS rated_count
FROM stargazer_daily_interventions di
JOIN auth.users u ON u.id = di.user_id
WHERE di.intervention_date >= current_date - interval '14 days'
GROUP BY u.email
ORDER BY avg_helpful_rating DESC NULLS LAST;
