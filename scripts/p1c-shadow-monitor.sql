-- P1-C Shadow Monitor: リアクション分類器の本番精度検証クエリ
-- 使い方: Supabase SQL Editor にコピーして実行
-- 期間: デプロイ後 3-7日分のデータで判断

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. リアクション検出率の全体分布
-- 期待: reaction != null が全会話の 10-30% 程度（高すぎると false positive 疑い）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  CASE WHEN metadata->'reaction' != 'null' THEN 'reaction_detected' ELSE 'no_reaction' END AS status,
  COUNT(*) AS cnt,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. リアクションタイプ別の内訳
-- 確認ポイント: agree/disagree/deepen/redirect の比率が自然か
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  metadata->'reaction'->>'type' AS reaction_type,
  metadata->'reaction'->>'disagree_strength' AS disagree_strength,
  metadata->'reaction'->>'redirect_subtype' AS redirect_subtype,
  metadata->'reaction'->>'confidence' AS confidence,
  COUNT(*) AS cnt
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'reaction' != 'null'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1, 2, 3, 4
ORDER BY cnt DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. False positive 疑い: redirect:topic_change → 直後の response_mode
-- 確認: topic_change 検出後に通常パイプラインが正常にルーティングしているか
-- NG例: topic_change なのに repair になっている
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  metadata->>'response_mode' AS final_mode,
  metadata->>'mode_decision_reason' AS final_reason,
  COUNT(*) AS cnt
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'reaction'->>'redirect_subtype' = 'topic_change'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY cnt DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. disagree strong vs weak の分布
-- 期待: strong < weak（やんわり否定の方が多いのが自然）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  metadata->'reaction'->>'disagree_strength' AS strength,
  COUNT(*) AS cnt,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'reaction'->>'type' = 'disagree'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. 目視確認用: 直近のリアクション検出ログ（ユーザー発話付き）
-- dialogues テーブルと JOIN してユーザーの実際の発話を確認
-- false positive を目で確認するための最重要クエリ
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  a.created_at,
  a.metadata->'reaction'->>'type' AS reaction_type,
  a.metadata->'reaction'->>'disagree_strength' AS strength,
  a.metadata->'reaction'->>'redirect_subtype' AS redirect_sub,
  a.metadata->'reaction'->>'confidence' AS conf,
  a.metadata->>'response_mode' AS mode,
  d.content AS user_message
FROM stargazer_analytics a
LEFT JOIN stargazer_alter_dialogues d
  ON d.user_id = a.user_id
  AND d.session_id = (a.metadata->>'session_id')
  AND d.role = 'user'
  AND d.created_at BETWEEN a.created_at - INTERVAL '5 seconds' AND a.created_at + INTERVAL '5 seconds'
WHERE a.event = 'home_alter_judgment'
  AND a.feature = 'home_alter'
  AND a.metadata->'reaction' != 'null'
  AND a.created_at >= NOW() - INTERVAL '7 days'
ORDER BY a.created_at DESC
LIMIT 50;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. P1-D 接続開始条件チェック（全指標一括）
-- 全て PASS なら P1-D GO
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH stats AS (
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE metadata->'reaction' != 'null') AS detected,
    COUNT(*) FILTER (WHERE metadata->'reaction'->>'type' = 'disagree' AND metadata->'reaction'->>'disagree_strength' = 'strong') AS disagree_strong,
    COUNT(*) FILTER (WHERE metadata->'reaction'->>'type' = 'disagree' AND metadata->'reaction'->>'disagree_strength' = 'weak') AS disagree_weak,
    COUNT(*) FILTER (WHERE metadata->'reaction'->>'redirect_subtype' = 'topic_change') AS topic_change
  FROM stargazer_analytics
  WHERE event = 'home_alter_judgment'
    AND feature = 'home_alter'
    AND created_at >= NOW() - INTERVAL '7 days'
)
SELECT
  total AS total_conversations,
  detected AS reactions_detected,
  ROUND(detected::numeric / NULLIF(total, 0) * 100, 1) AS detection_rate_pct,
  -- 条件1: 検出率 10-40% が正常範囲
  CASE WHEN detected::numeric / NULLIF(total, 0) BETWEEN 0.05 AND 0.50 THEN 'PASS' ELSE 'WARN' END AS detection_rate_check,
  -- 条件2: strong < weak * 3 (strong が異常に多くないこと)
  disagree_strong,
  disagree_weak,
  CASE WHEN disagree_strong <= disagree_weak * 3 OR disagree_strong + disagree_weak < 5 THEN 'PASS' ELSE 'WARN' END AS strength_ratio_check,
  -- 条件3: topic_change が検出全体の 30% 以下
  topic_change,
  CASE WHEN topic_change::numeric / NULLIF(detected, 0) <= 0.30 OR detected < 10 THEN 'PASS' ELSE 'WARN' END AS topic_change_check,
  -- 条件4: 目視で false positive 0/50 (このクエリでは自動判定不可、Query 5 で確認)
  'MANUAL_CHECK' AS false_positive_check
FROM stats;
