-- ============================================================
-- 運営通知（broadcast）監査クエリ
-- broadcast_id 単位で送信履歴を正確に追跡する
-- ============================================================
--
-- 運用手順:
--   1. 送信後、CEO画面に表示される broadcast_id を控える
--   2. クエリ1 で全送信履歴を確認（定期チェック用）
--   3. クエリ2 で特定送信の既読状況を確認（問い合わせ対応用）
--   4. クエリ3 で二重送信の有無を確認（事故チェック用）
--
-- 実行場所: Supabase SQL Editor
-- ============================================================

-- 1. 送信一覧（誰が・いつ・何件・何を送ったか）
-- 同タイトル・同分送信でも broadcast_id で分離される
SELECT
    data->>'broadcast_id'  AS broadcast_id,
    data->>'sent_by'       AS sent_by,
    type,
    title,
    body,
    link,
    MIN(created_at)        AS sent_at,
    COUNT(*)               AS recipients,
    COUNT(*) FILTER (WHERE read_at IS NOT NULL) AS read_count,
    ROUND(
        COUNT(*) FILTER (WHERE read_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) * 100,
        1
    ) AS read_rate_pct
FROM notifications
WHERE (data->>'broadcast')::boolean = true
GROUP BY data->>'broadcast_id', data->>'sent_by', type, title, body, link
ORDER BY sent_at DESC;

-- 2. 特定 broadcast_id の詳細（個別ユーザーの既読状態）
-- broadcast_id を差し替えて使う
--
-- SELECT
--     n.user_id,
--     p.display_name,
--     n.created_at,
--     n.read_at,
--     CASE WHEN n.read_at IS NOT NULL THEN '既読' ELSE '未読' END AS status
-- FROM notifications n
-- LEFT JOIN profiles p ON p.id = n.user_id
-- WHERE n.data->>'broadcast_id' = '<ここにbroadcast_idを入れる>'
-- ORDER BY n.read_at NULLS LAST;

-- 3. 二重送信チェック（同一タイトルが短時間に複数回送られていないか）
-- 同じ title で broadcast_id が複数ある = 複数回送信された
SELECT
    title,
    type,
    COUNT(DISTINCT data->>'broadcast_id') AS send_count,
    ARRAY_AGG(DISTINCT data->>'broadcast_id') AS broadcast_ids,
    MIN(created_at) AS first_sent,
    MAX(created_at) AS last_sent
FROM notifications
WHERE (data->>'broadcast')::boolean = true
GROUP BY title, type
HAVING COUNT(DISTINCT data->>'broadcast_id') > 1
ORDER BY last_sent DESC;
