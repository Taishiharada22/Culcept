-- ============================================================
-- Origin β KPI ダッシュボードクエリ集
-- stargazer_analytics テーブル (feature = 'origin') から集計
-- 実行: Supabase Dashboard > SQL Editor
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. EntryGate 回答率 (origin_entry_recorded / origin_page_view)
-- ──────────────────────────────────────────────────────────────
SELECT
  date_trunc('day', created_at)::date AS day,
  count(*) FILTER (WHERE event = 'origin_page_view')   AS page_views,
  count(*) FILTER (WHERE event = 'origin_entry_recorded') AS entries,
  CASE
    WHEN count(*) FILTER (WHERE event = 'origin_page_view') > 0
    THEN round(
      100.0 * count(*) FILTER (WHERE event = 'origin_entry_recorded')
            / count(*) FILTER (WHERE event = 'origin_page_view'), 1
    )
    ELSE 0
  END AS entry_rate_pct
FROM stargazer_analytics
WHERE feature = 'origin'
  AND event IN ('origin_page_view', 'origin_entry_recorded')
  AND created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;

-- ──────────────────────────────────────────────────────────────
-- 2. 証拠カード表示率 (origin_evidence_card_shown / origin_page_view)
-- ──────────────────────────────────────────────────────────────
SELECT
  date_trunc('day', created_at)::date AS day,
  count(*) FILTER (WHERE event = 'origin_page_view')          AS page_views,
  count(*) FILTER (WHERE event = 'origin_evidence_card_shown') AS evidence_shown,
  CASE
    WHEN count(*) FILTER (WHERE event = 'origin_page_view') > 0
    THEN round(
      100.0 * count(*) FILTER (WHERE event = 'origin_evidence_card_shown')
            / count(*) FILTER (WHERE event = 'origin_page_view'), 1
    )
    ELSE 0
  END AS evidence_rate_pct
FROM stargazer_analytics
WHERE feature = 'origin'
  AND event IN ('origin_page_view', 'origin_evidence_card_shown')
  AND created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;

-- ──────────────────────────────────────────────────────────────
-- 3. 仮説作成率 (origin_hypothesis_created / origin_inquiry_shown)
-- ──────────────────────────────────────────────────────────────
SELECT
  date_trunc('day', created_at)::date AS day,
  count(*) FILTER (WHERE event = 'origin_inquiry_shown')      AS inquiries,
  count(*) FILTER (WHERE event = 'origin_hypothesis_created') AS hypotheses,
  CASE
    WHEN count(*) FILTER (WHERE event = 'origin_inquiry_shown') > 0
    THEN round(
      100.0 * count(*) FILTER (WHERE event = 'origin_hypothesis_created')
            / count(*) FILTER (WHERE event = 'origin_inquiry_shown'), 1
    )
    ELSE 0
  END AS hypothesis_rate_pct
FROM stargazer_analytics
WHERE feature = 'origin'
  AND event IN ('origin_inquiry_shown', 'origin_hypothesis_created')
  AND created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;

-- ──────────────────────────────────────────────────────────────
-- 4. 検証完了率 (origin_verification_confirmed / origin_hypothesis_created)
-- ──────────────────────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE event = 'origin_hypothesis_created')      AS total_hypotheses,
  count(*) FILTER (WHERE event = 'origin_hypothesis_evaluated')    AS auto_evaluated,
  count(*) FILTER (WHERE event = 'origin_verification_confirmed')  AS user_confirmed,
  CASE
    WHEN count(*) FILTER (WHERE event = 'origin_hypothesis_created') > 0
    THEN round(
      100.0 * count(*) FILTER (WHERE event = 'origin_verification_confirmed')
            / count(*) FILTER (WHERE event = 'origin_hypothesis_created'), 1
    )
    ELSE 0
  END AS verification_rate_pct,
  -- AI一致率
  count(*) FILTER (
    WHERE event = 'origin_verification_confirmed'
      AND (metadata->>'agreed')::boolean = true
  ) AS ai_agreed,
  CASE
    WHEN count(*) FILTER (WHERE event = 'origin_verification_confirmed') > 0
    THEN round(
      100.0 * count(*) FILTER (
        WHERE event = 'origin_verification_confirmed'
          AND (metadata->>'agreed')::boolean = true
      ) / count(*) FILTER (WHERE event = 'origin_verification_confirmed'), 1
    )
    ELSE 0
  END AS ai_agreement_rate_pct
FROM stargazer_analytics
WHERE feature = 'origin'
  AND event IN ('origin_hypothesis_created', 'origin_hypothesis_evaluated', 'origin_verification_confirmed')
  AND created_at >= now() - interval '30 days';

-- ──────────────────────────────────────────────────────────────
-- 5. Day 3 / 7 / 14 再訪率 (リテンション)
-- 初回訪問日を基準に D3/D7/D14 に再訪したユーザーの割合
-- ──────────────────────────────────────────────────────────────
WITH first_visit AS (
  SELECT
    user_id,
    min(created_at::date) AS first_day
  FROM stargazer_analytics
  WHERE feature = 'origin'
    AND event = 'origin_page_view'
  GROUP BY user_id
),
revisits AS (
  SELECT
    fv.user_id,
    fv.first_day,
    bool_or(sa.created_at::date = fv.first_day + 3)  AS d3,
    bool_or(sa.created_at::date = fv.first_day + 7)  AS d7,
    bool_or(sa.created_at::date = fv.first_day + 14) AS d14
  FROM first_visit fv
  JOIN stargazer_analytics sa
    ON sa.user_id = fv.user_id
   AND sa.feature = 'origin'
   AND sa.event = 'origin_page_view'
  GROUP BY fv.user_id, fv.first_day
)
SELECT
  count(*) AS total_users,
  count(*) FILTER (WHERE first_day <= now()::date - 3)  AS eligible_d3,
  count(*) FILTER (WHERE d3 AND first_day <= now()::date - 3)  AS retained_d3,
  count(*) FILTER (WHERE first_day <= now()::date - 7)  AS eligible_d7,
  count(*) FILTER (WHERE d7 AND first_day <= now()::date - 7)  AS retained_d7,
  count(*) FILTER (WHERE first_day <= now()::date - 14) AS eligible_d14,
  count(*) FILTER (WHERE d14 AND first_day <= now()::date - 14) AS retained_d14,
  -- 率 (eligible が 0 の場合は NULL)
  CASE WHEN count(*) FILTER (WHERE first_day <= now()::date - 3) > 0
    THEN round(100.0 * count(*) FILTER (WHERE d3 AND first_day <= now()::date - 3)
              / count(*) FILTER (WHERE first_day <= now()::date - 3), 1)
  END AS d3_rate_pct,
  CASE WHEN count(*) FILTER (WHERE first_day <= now()::date - 7) > 0
    THEN round(100.0 * count(*) FILTER (WHERE d7 AND first_day <= now()::date - 7)
              / count(*) FILTER (WHERE first_day <= now()::date - 7), 1)
  END AS d7_rate_pct,
  CASE WHEN count(*) FILTER (WHERE first_day <= now()::date - 14) > 0
    THEN round(100.0 * count(*) FILTER (WHERE d14 AND first_day <= now()::date - 14)
              / count(*) FILTER (WHERE first_day <= now()::date - 14), 1)
  END AS d14_rate_pct
FROM revisits;

-- ──────────────────────────────────────────────────────────────
-- 6. 同期信頼性 (origin_sync_conflict の頻度)
-- ──────────────────────────────────────────────────────────────
SELECT
  date_trunc('day', created_at)::date AS day,
  count(*) FILTER (WHERE event = 'origin_sync_completed') AS syncs,
  count(*) FILTER (WHERE event = 'origin_sync_conflict')  AS conflicts,
  CASE
    WHEN count(*) FILTER (WHERE event = 'origin_sync_completed') > 0
    THEN round(
      100.0 * count(*) FILTER (WHERE event = 'origin_sync_conflict')
            / count(*) FILTER (WHERE event = 'origin_sync_completed'), 1
    )
    ELSE 0
  END AS conflict_rate_pct
FROM stargazer_analytics
WHERE feature = 'origin'
  AND event IN ('origin_sync_completed', 'origin_sync_conflict')
  AND created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;

-- ──────────────────────────────────────────────────────────────
-- 7. サマリー: 全 KPI 一覧 (直近 7 日)
-- ──────────────────────────────────────────────────────────────
SELECT
  'EntryGate回答率' AS kpi,
  round(100.0 * count(*) FILTER (WHERE event = 'origin_entry_recorded')
        / NULLIF(count(*) FILTER (WHERE event = 'origin_page_view'), 0), 1) AS value_pct
FROM stargazer_analytics
WHERE feature = 'origin' AND created_at >= now() - interval '7 days'

UNION ALL

SELECT
  '証拠カード表示率',
  round(100.0 * count(*) FILTER (WHERE event = 'origin_evidence_card_shown')
        / NULLIF(count(*) FILTER (WHERE event = 'origin_page_view'), 0), 1)
FROM stargazer_analytics
WHERE feature = 'origin' AND created_at >= now() - interval '7 days'

UNION ALL

SELECT
  '仮説作成率',
  round(100.0 * count(*) FILTER (WHERE event = 'origin_hypothesis_created')
        / NULLIF(count(*) FILTER (WHERE event = 'origin_inquiry_shown'), 0), 1)
FROM stargazer_analytics
WHERE feature = 'origin' AND created_at >= now() - interval '7 days'

UNION ALL

SELECT
  '検証完了率',
  round(100.0 * count(*) FILTER (WHERE event = 'origin_verification_confirmed')
        / NULLIF(count(*) FILTER (WHERE event = 'origin_hypothesis_created'), 0), 1)
FROM stargazer_analytics
WHERE feature = 'origin' AND created_at >= now() - interval '7 days'

UNION ALL

SELECT
  'AI一致率',
  round(100.0 * count(*) FILTER (
    WHERE event = 'origin_verification_confirmed'
      AND (metadata->>'agreed')::boolean = true
  ) / NULLIF(count(*) FILTER (WHERE event = 'origin_verification_confirmed'), 0), 1)
FROM stargazer_analytics
WHERE feature = 'origin' AND created_at >= now() - interval '7 days'

UNION ALL

SELECT
  '同期競合率',
  round(100.0 * count(*) FILTER (WHERE event = 'origin_sync_conflict')
        / NULLIF(count(*) FILTER (WHERE event = 'origin_sync_completed'), 0), 1)
FROM stargazer_analytics
WHERE feature = 'origin' AND created_at >= now() - interval '7 days';
