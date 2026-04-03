-- v4.2 人間評価用ラリー抽出（4/10 CEO目視評価用）
-- 使い方: Supabase SQL Editor にコピーして実行
-- 結果を v42-human-eval-template.md に転記して採点

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- R1. 評価対象セッション選定（v4.2 アクティブ、3ターン以上）
-- 多様な role / response_mode を含むセッションを優先抽出
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WITH session_stats AS (
  SELECT
    user_id,
    metadata->>'session_id' AS session_id,
    COUNT(*) AS turn_count,
    COUNT(DISTINCT metadata->'v42'->>'role') AS distinct_roles,
    COUNT(DISTINCT metadata->>'response_mode') AS distinct_modes,
    bool_or(metadata->>'response_mode' = 'repair') AS has_repair,
    bool_or(metadata->'v42'->>'rally_status' = 'looping') AS has_looping,
    MIN(created_at) AS session_start,
    MAX(created_at) AS session_end
  FROM stargazer_analytics
  WHERE event = 'home_alter_judgment'
    AND feature = 'home_alter'
    AND metadata->'v42'->>'role' IS NOT NULL
    AND created_at >= NOW() - INTERVAL '7 days'
  GROUP BY user_id, metadata->>'session_id'
  HAVING COUNT(*) >= 3
)
SELECT
  user_id,
  session_id,
  turn_count,
  distinct_roles,
  distinct_modes,
  has_repair,
  has_looping,
  session_start,
  session_end
FROM session_stats
ORDER BY
  -- repair / looping がある方を優先（品質検証に有用）
  has_repair DESC,
  has_looping DESC,
  -- 多様な role が出たセッションを優先
  distinct_roles DESC,
  -- ターン数が多い方を優先
  turn_count DESC
LIMIT 15;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- R2. 選定セッションの全会話ラリー展開
-- ↑の結果から session_id を選び、以下の WHERE に入れて実行
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ★ 使い方: R1 の結果から session_id を 10件選び、
--   下の IN ('SESSION_ID_1', 'SESSION_ID_2', ...) に入れる

SELECT
  d.session_id,
  d.turn_number,
  d.role,
  d.message,
  d.created_at,
  -- analytics から v4.2 メタデータを結合
  a.metadata->>'response_mode' AS response_mode,
  a.metadata->'v42'->>'role' AS v42_role,
  a.metadata->'v42'->>'arena_primary_lens' AS arena_lens,
  a.metadata->'v42'->>'semantic_ban_passed' AS ban_passed,
  a.metadata->'v42'->>'rally_status' AS rally_status,
  a.metadata->'reaction'->>'type' AS detected_reaction
FROM stargazer_alter_dialogues d
LEFT JOIN LATERAL (
  SELECT metadata
  FROM stargazer_analytics
  WHERE event = 'home_alter_judgment'
    AND feature = 'home_alter'
    AND user_id = d.user_id
    AND metadata->>'session_id' = d.session_id::text
    -- alter 発言の直前のイベントを取得
    AND created_at BETWEEN d.created_at - INTERVAL '5 seconds' AND d.created_at + INTERVAL '5 seconds'
  ORDER BY created_at DESC
  LIMIT 1
) a ON d.role = 'alter'
WHERE d.session_id IN (
  -- ★ R1 から選んだ session_id をここに入れる
  '00000000-0000-0000-0000-000000000000'
)
ORDER BY d.session_id, d.created_at;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- R3. v4.2 コンテキスト付きラリー一覧（analytics ベース）
-- dialogues テーブルとの結合なしで、analytics 単体から展開
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECT
  user_id,
  metadata->>'session_id' AS session_id,
  created_at,
  metadata->>'response_mode' AS mode,
  metadata->'v42'->>'role' AS v42_role,
  metadata->'v42'->>'arena_primary_lens' AS arena_lens,
  metadata->'v42'->>'semantic_ban_passed' AS ban_ok,
  metadata->'v42'->>'rally_status' AS rally,
  metadata->'reaction'->>'type' AS user_reaction,
  metadata->'v42'->>'completeness' AS model_completeness,
  (metadata->>'total_latency_ms')::int AS latency_ms,
  (metadata->>'llm_call_count')::int AS llm_calls
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND feature = 'home_alter'
  AND metadata->'v42'->>'role' IS NOT NULL
  AND metadata->>'session_id' IN (
    -- ★ R1 から選んだ session_id をここに入れる
    '00000000-0000-0000-0000-000000000000'
  )
ORDER BY user_id, metadata->>'session_id', created_at;
