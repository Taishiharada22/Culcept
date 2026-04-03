-- P1.5 Thin-Slice 評価クエリ集
-- 使い方: Supabase SQL Editor にコピーし���実行
-- 期間: デプロイ後 7日分のデ��タで判断

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Thin-Slice 発火状況
-- 確認: elevated/critical が全ターンの 20-30% 程度か
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  metadata->'thin_slice'->>'turn_budget' AS budget,
  metadata->'thin_slice'->>'turn_budget_reason' AS reason,
  COUNT(*) AS cnt,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY cnt DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. A/B 比較: thin-slice ON vs OFF
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  CASE WHEN metadata->'thin_slice'->>'enabled' = 'true' THEN 'ON' ELSE 'OFF' END AS thin_slice,
  COUNT(*) AS total_turns,
  COUNT(*) FILTER (WHERE metadata->'thin_slice'->>'insight_generated' = 'true') AS insights,
  COUNT(*) FILTER (WHERE metadata->'thin_slice'->>'bet' IS NOT NULL) AS bets,
  COUNT(*) FILTER (WHERE metadata->'thin_slice'->>'previous_bet_outcome' = 'hit') AS hits,
  COUNT(*) FILTER (WHERE metadata->'thin_slice'->>'previous_bet_outcome' = 'miss') AS misses
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. KPI 1: Aha率（強い同意反応の割合）
-- 合格基準: 20%以上
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH user_turns AS (
  SELECT content FROM stargazer_alter_dialogues
  WHERE role = 'user' AND created_at >= NOW() - INTERVAL '7 days'
)
SELECT
  COUNT(*) FILTER (WHERE content ~ 'それだ[。！!]|まさに(?:それ|そう)|そうそう|当た���てる|合ってる|その通り|ほんとそう|わかる[！!]|それな[。！!]|そうなんだよ') AS aha_count,
  COUNT(*) AS total,
  ROUND(
    COUNT(*) FILTER (WHERE content ~ 'それだ[。！!]|まさに(?:それ|そう)|そうそう|当たってる|合ってる|その通り|ほんとそう|わかる[！!]|それな[。！!]|そうなんだよ')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS aha_rate_pct
FROM user_turns;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. KPI 5: 責任転嫁率��宿���逃げを含む拡張版）
-- 合格基準: 5%以下
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH alter_turns AS (
  SELECT content FROM stargazer_alter_dialogues
  WHERE role = 'alter' AND created_at >= NOW() - INTERVAL '7 days'
)
SELECT
  COUNT(*) FILTER (WHERE content ~ '考えてみて|自分で決めて|状況による|場合による|一概には|書き出して|3つ挙げて|リストアップして|整理してみて|まず情報収集|調べてみて|確認してみて|自分の気持ちを.*見つめ|振り返ってみて') AS deflection_count,
  COUNT(*) AS total,
  ROUND(
    COUNT(*) FILTER (WHERE content ~ '考えてみて|自分で決めて|状況による|場合による|一概には|書き出して|3つ挙げて|リストアップして|整理してみて|まず情報収集|調べてみて|確認してみて|自分の気持ちを.*見つめ|振り返ってみて')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS deflection_rate_pct
FROM alter_turns;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. Bet Hit/Miss 率
-- 確認: hit率が 40%以上なら insight 品質��合格
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  metadata->'thin_slice'->>'previous_bet_outcome' AS outcome,
  COUNT(*) AS cnt,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) AS pct
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'thin_slice'->>'previous_bet_outcome' IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. Claim Strength ��布
-- 確認: assert が多すぎないか（trust低い段階では probe/lean_in が主流であるべき）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  metadata->'thin_slice'->>'claim_strength' AS claim,
  COUNT(*) AS cnt
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'thin_slice'->>'claim_strength' IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY cnt DESC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. 人間評価対象: thin-slice 発火セ��ションのラリー抽出
-- CEO が 10本を目視で 5軸評価する
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH target_sessions AS (
  SELECT DISTINCT metadata->>'session_id' AS sid
  FROM stargazer_analytics
  WHERE event = 'home_alter_judgment'
    AND feature = 'home_alter'
    AND metadata->'thin_slice'->>'turn_budget' IN ('elevated', 'critical')
    AND metadata->'thin_slice'->>'enabled' = 'true'
    AND created_at >= NOW() - INTERVAL '7 days'
  LIMIT 10
)
SELECT
  d.session_id,
  d.role,
  d.content,
  d.created_at
FROM stargazer_alter_dialogues d
WHERE d.session_id IN (SELECT sid FROM target_sessions)
ORDER BY d.session_id, d.created_at;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. 全 KPI サマリ（PASS/FAIL 判���用）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH
ts_stats AS (
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE metadata->'thin_slice'->>'enabled' = 'true') AS ts_on,
    COUNT(*) FILTER (WHERE metadata->'thin_slice'->>'turn_budget' = 'elevated') AS elevated,
    COUNT(*) FILTER (WHERE metadata->'thin_slice'->>'turn_budget' = 'critical') AS critical,
    COUNT(*) FILTER (WHERE metadata->'thin_slice'->>'insight_generated' = 'true') AS insights,
    COUNT(*) FILTER (WHERE metadata->'thin_slice'->>'bet' IS NOT NULL) AS bets,
    COUNT(*) FILTER (WHERE metadata->'thin_slice'->>'previous_bet_outcome' = 'hit') AS hits,
    COUNT(*) FILTER (WHERE metadata->'thin_slice'->>'previous_bet_outcome' = 'miss') AS misses
  FROM stargazer_analytics
  WHERE event = 'home_alter_judgment'
    AND feature = 'home_alter'
    AND created_at >= NOW() - INTERVAL '7 days'
),
aha AS (
  SELECT
    COUNT(*) FILTER (WHERE content ~ 'それだ[。！!]|まさに(?:それ|そう)|そうそう|当たってる|合ってる|その通り|ほんとそう|わかる[！!]|それな[。！!]|そうなんだよ') AS aha_count,
    COUNT(*) AS total
  FROM stargazer_alter_dialogues
  WHERE role = 'user' AND created_at >= NOW() - INTERVAL '7 days'
),
deflection AS (
  SELECT
    COUNT(*) FILTER (WHERE content ~ '考えてみて|自分で決めて|状況による|場合による|一概には|書き出して|3つ挙げて|リストアップして|整理してみて|まず情報収集|調べてみて|確認してみて|自分の気持ちを.*見つめ|振り返ってみて') AS defl_count,
    COUNT(*) AS total
  FROM stargazer_alter_dialogues
  WHERE role = 'alter' AND created_at >= NOW() - INTERVAL '7 days'
)
SELECT
  ts.total AS total_turns,
  ts.ts_on AS thin_slice_on,
  ts.elevated,
  ts.critical,
  ts.insights AS insight_generated,
  ts.bets AS bets_placed,
  ts.hits AS bet_hits,
  ts.misses AS bet_misses,
  ROUND(ts.hits::numeric / NULLIF(ts.hits + ts.misses, 0) * 100, 1) AS bet_hit_rate_pct,
  -- KPI 1: Aha率
  ROUND(a.aha_count::numeric / NULLIF(a.total, 0) * 100, 1) AS aha_rate_pct,
  CASE WHEN a.aha_count::numeric / NULLIF(a.total, 0) >= 0.20 THEN 'PASS' ELSE 'WATCH' END AS aha_check,
  -- KPI 5: 責任転嫁率
  ROUND(d.defl_count::numeric / NULLIF(d.total, 0) * 100, 1) AS deflection_rate_pct,
  CASE WHEN d.defl_count::numeric / NULLIF(d.total, 0) <= 0.05 THEN 'PASS' ELSE 'WATCH' END AS deflection_check,
  -- 発火率チェック
  ROUND((ts.elevated + ts.critical)::numeric / NULLIF(ts.total, 0) * 100, 1) AS fire_rate_pct,
  CASE WHEN (ts.elevated + ts.critical)::numeric / NULLIF(ts.total, 0) BETWEEN 0.10 AND 0.40 THEN 'PASS' ELSE 'WARN' END AS fire_rate_check
FROM ts_stats ts, aha a, deflection d;
