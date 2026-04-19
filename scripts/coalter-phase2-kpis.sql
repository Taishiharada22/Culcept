-- ============================================================
-- CoAlter Phase 2 — 本番観測 KPI クエリ集 (2026-04-19)
--
-- 目的:
--   Phase 2 凍結後の実測を集め、Phase 3 優先順位付けの判断材料にする。
--   7 指標すべてを coalter_messages.metadata / coalter_sessions のみから算出する
--   （追加ログ不要）。
--
-- データソース:
--   coalter_messages.metadata (JSONB)
--     ├ proposalCard          : legacy ProposalCard（互換用に常に書き込み）
--     ├ card                  : CoAlterCard union ({ mode: decision|negotiate|clarify, ... })
--     ├ routerTrace           : RouterTrace ({ selectedMode, reason, triggeredSignals, ... })
--     ├ gateResult            : { pass: bool, reason: string? }
--     └ executorFallbackReason: "gate_blocked" | "theme_not_movie_yet" | null
--   coalter_sessions           : セッション lifecycle (active/completed/cancelled)
--   coalter_pair_states        : ペア enabled/disabled
--
-- 実行: Supabase Dashboard > SQL Editor
-- 単位: デフォルト 30 日ウィンドウ、day 単位で集計。
-- 命名規約: coalter_phase2_* で全 7 指標を揃える。
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- KPI-1: mode 選択率
--   分子: 各 mode が selectedMode になった数
--   分母: routerTrace を持つ coalter メッセージ総数
--   意味: router が何をどれだけ選んでいるかの分布
-- ──────────────────────────────────────────────────────────────
SELECT
  date_trunc('day', cm.created_at)::date AS day,
  count(*) AS total_with_trace,
  count(*) FILTER (WHERE cm.metadata -> 'routerTrace' ->> 'selectedMode' = 'decision')  AS decision_count,
  count(*) FILTER (WHERE cm.metadata -> 'routerTrace' ->> 'selectedMode' = 'negotiate') AS negotiate_count,
  count(*) FILTER (WHERE cm.metadata -> 'routerTrace' ->> 'selectedMode' = 'clarify')   AS clarify_count,
  round(100.0 * count(*) FILTER (WHERE cm.metadata -> 'routerTrace' ->> 'selectedMode' = 'decision')  / NULLIF(count(*), 0), 1) AS decision_rate_pct,
  round(100.0 * count(*) FILTER (WHERE cm.metadata -> 'routerTrace' ->> 'selectedMode' = 'negotiate') / NULLIF(count(*), 0), 1) AS negotiate_rate_pct,
  round(100.0 * count(*) FILTER (WHERE cm.metadata -> 'routerTrace' ->> 'selectedMode' = 'clarify')   / NULLIF(count(*), 0), 1) AS clarify_rate_pct
FROM coalter_messages cm
WHERE cm.role = 'coalter'
  AND cm.metadata ? 'routerTrace'
  AND cm.metadata -> 'routerTrace' IS NOT NULL
  AND cm.created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;


-- ──────────────────────────────────────────────────────────────
-- KPI-2: gate block 率
--   分子: executorFallbackReason = 'gate_blocked' の数
--   分母: coalter メッセージ総数
--   意味: consent / emotion_heat high で dispatch が止まった割合
-- ──────────────────────────────────────────────────────────────
SELECT
  date_trunc('day', cm.created_at)::date AS day,
  count(*) AS total,
  count(*) FILTER (WHERE cm.metadata ->> 'executorFallbackReason' = 'gate_blocked') AS gate_blocked_count,
  round(
    100.0 * count(*) FILTER (WHERE cm.metadata ->> 'executorFallbackReason' = 'gate_blocked')
          / NULLIF(count(*), 0),
    1
  ) AS gate_block_rate_pct,
  -- 内訳: gateResult.reason 別（consent_not_active / emotion_heat_high）
  count(*) FILTER (WHERE cm.metadata -> 'gateResult' ->> 'reason' = 'consent_not_active') AS consent_blocked,
  count(*) FILTER (WHERE cm.metadata -> 'gateResult' ->> 'reason' = 'emotion_heat_high') AS emotion_blocked
FROM coalter_messages cm
WHERE cm.role = 'coalter'
  AND cm.created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;


-- ──────────────────────────────────────────────────────────────
-- KPI-3: movie-first theme fallback 率
--   分子: executorFallbackReason = 'theme_not_movie_yet' の数
--   分母: gate 通過した coalter メッセージ（gate_blocked を除く）
--   意味: movie 以外のテーマで dispatch が走ったが decision に戻された割合
-- ──────────────────────────────────────────────────────────────
SELECT
  date_trunc('day', cm.created_at)::date AS day,
  count(*) FILTER (WHERE cm.metadata ->> 'executorFallbackReason' IS DISTINCT FROM 'gate_blocked') AS gate_passed_total,
  count(*) FILTER (WHERE cm.metadata ->> 'executorFallbackReason' = 'theme_not_movie_yet') AS theme_fallback_count,
  round(
    100.0 * count(*) FILTER (WHERE cm.metadata ->> 'executorFallbackReason' = 'theme_not_movie_yet')
          / NULLIF(count(*) FILTER (WHERE cm.metadata ->> 'executorFallbackReason' IS DISTINCT FROM 'gate_blocked'), 0),
    1
  ) AS theme_fallback_rate_pct
FROM coalter_messages cm
WHERE cm.role = 'coalter'
  AND cm.created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;


-- ──────────────────────────────────────────────────────────────
-- KPI-4: usedFallback 発生率 (status resolver fallback)
--   分子: metadata.card 欠損 AND metadata.proposalCard 存在 のメッセージ
--   分母: coalter メッセージ総数
--   意味: legacy session (Phase 6.C 以前) や card 書き込み失敗の割合。
--         resolver は status API 呼び出し時に動的に計算するが、
--         永続化された metadata から同等条件で proxy 計測できる。
--   注意: Phase 6.C 以降の新規セッションは常に card を書き込むため、
--         この値は「古いデータの割合」に収束していくのが期待挙動。
-- ──────────────────────────────────────────────────────────────
SELECT
  date_trunc('day', cm.created_at)::date AS day,
  count(*) AS total,
  count(*) FILTER (
    WHERE NOT (cm.metadata ? 'card')
       OR cm.metadata -> 'card' IS NULL
  ) AS card_missing,
  count(*) FILTER (
    WHERE (NOT (cm.metadata ? 'card') OR cm.metadata -> 'card' IS NULL)
      AND cm.metadata ? 'proposalCard'
      AND cm.metadata -> 'proposalCard' IS NOT NULL
  ) AS used_fallback_count,
  round(
    100.0 * count(*) FILTER (
      WHERE (NOT (cm.metadata ? 'card') OR cm.metadata -> 'card' IS NULL)
        AND cm.metadata ? 'proposalCard'
        AND cm.metadata -> 'proposalCard' IS NOT NULL
    ) / NULLIF(count(*), 0),
    1
  ) AS used_fallback_rate_pct
FROM coalter_messages cm
WHERE cm.role = 'coalter'
  AND cm.created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;


-- ──────────────────────────────────────────────────────────────
-- KPI-5: activeCard 復元失敗率
--   分子: session に紐づく最新 coalter message で
--         metadata.card も proposalCard も欠損している数
--   分母: coalter message を 1 件以上持つ session 数
--   意味: 相手側 / 再読込で何も復元できないセッションの割合。
--         通常は 0%。値が出たら書き込み失敗 or スキーマ不整合の兆候。
--
--   補足 (2026-04-19 修正):
--     当初 `cs.state = 'completed'` を分母にしていたが、現実装では
--     pipeline 完了直後に state='completed' になった後、ユーザー dismiss /
--     adopt / opt-out で state='cancelled' に上書きされる（engine.ts:368 → end/route.ts:56）。
--     このため state='completed' 固定では分母がほぼ常に空になり、
--     復元健全性を観測できない。代わりに「coalter_messages が 1 件以上ある」
--     = 「pipeline が最後まで走った」を分母にする。
-- ──────────────────────────────────────────────────────────────
WITH latest_msg_per_session AS (
  SELECT DISTINCT ON (cm.session_id)
    cm.session_id,
    cm.metadata,
    cm.created_at
  FROM coalter_messages cm
  WHERE cm.role = 'coalter'
  ORDER BY cm.session_id, cm.created_at DESC
)
SELECT
  date_trunc('day', cs.created_at)::date AS day,
  count(*) AS invoked_sessions,
  count(*) FILTER (
    WHERE l.metadata IS NULL
       OR (
         (NOT (l.metadata ? 'card') OR l.metadata -> 'card' IS NULL)
         AND (NOT (l.metadata ? 'proposalCard') OR l.metadata -> 'proposalCard' IS NULL)
       )
  ) AS unrestorable_count,
  round(
    100.0 * count(*) FILTER (
      WHERE l.metadata IS NULL
         OR (
           (NOT (l.metadata ? 'card') OR l.metadata -> 'card' IS NULL)
           AND (NOT (l.metadata ? 'proposalCard') OR l.metadata -> 'proposalCard' IS NULL)
         )
    ) / NULLIF(count(*), 0),
    1
  ) AS unrestorable_rate_pct
FROM coalter_sessions cs
INNER JOIN latest_msg_per_session l ON l.session_id = cs.id
WHERE cs.created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;


-- ──────────────────────────────────────────────────────────────
-- KPI-6: negotiate proposals=0 発生率
--   分子: card.mode='negotiate' AND jsonb_array_length(card.proposals) = 0
--   分母: card.mode='negotiate' の全件
--   意味: negotiate が成立したが第三案を materialize できなかった割合。
--         設計上 0 件は正常系（§4.2）だが、率が高いと negotiate 実装の
--         catalog / ranker が弱いシグナル。Phase 3 で materialize 改善の
--         優先度を決める根拠になる。
-- ──────────────────────────────────────────────────────────────
SELECT
  date_trunc('day', cm.created_at)::date AS day,
  count(*) FILTER (WHERE cm.metadata -> 'card' ->> 'mode' = 'negotiate') AS negotiate_total,
  count(*) FILTER (
    WHERE cm.metadata -> 'card' ->> 'mode' = 'negotiate'
      AND jsonb_array_length(cm.metadata -> 'card' -> 'proposals') = 0
  ) AS negotiate_empty_proposals,
  round(
    100.0 * count(*) FILTER (
      WHERE cm.metadata -> 'card' ->> 'mode' = 'negotiate'
        AND jsonb_array_length(cm.metadata -> 'card' -> 'proposals') = 0
    ) / NULLIF(count(*) FILTER (WHERE cm.metadata -> 'card' ->> 'mode' = 'negotiate'), 0),
    1
  ) AS negotiate_empty_rate_pct
FROM coalter_messages cm
WHERE cm.role = 'coalter'
  AND cm.created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;


-- ──────────────────────────────────────────────────────────────
-- KPI-7: clarify question=null 発生率
--   分子: card.mode='clarify' AND card.question IS NULL
--   分母: card.mode='clarify' の全件
--   意味: emotion_heat mid / target 不明等で 0 問に落ちた割合。
--         設計上 0 問は正常系（§2.2）だが、率が高いと clarify が
--         「聞かずに閉じる」が多いシグナル。Phase 3 で質問生成ロジック
--         改善の優先度を決める根拠になる。
-- ──────────────────────────────────────────────────────────────
SELECT
  date_trunc('day', cm.created_at)::date AS day,
  count(*) FILTER (WHERE cm.metadata -> 'card' ->> 'mode' = 'clarify') AS clarify_total,
  count(*) FILTER (
    WHERE cm.metadata -> 'card' ->> 'mode' = 'clarify'
      AND cm.metadata -> 'card' -> 'question' IS NULL
  ) AS clarify_no_question,
  round(
    100.0 * count(*) FILTER (
      WHERE cm.metadata -> 'card' ->> 'mode' = 'clarify'
        AND cm.metadata -> 'card' -> 'question' IS NULL
    ) / NULLIF(count(*) FILTER (WHERE cm.metadata -> 'card' ->> 'mode' = 'clarify'), 0),
    1
  ) AS clarify_no_question_rate_pct
FROM coalter_messages cm
WHERE cm.role = 'coalter'
  AND cm.created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;


-- ============================================================
-- 補助クエリ（初回観測時に併せて見る）
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- AUX-1: router reason 分布 (8 分岐のどこで決まったか)
--   Phase 3 で「どの分岐が多くて、どこが機能していないか」を見る。
-- ──────────────────────────────────────────────────────────────
SELECT
  cm.metadata -> 'routerTrace' ->> 'reason' AS router_reason,
  count(*) AS n,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS share_pct
FROM coalter_messages cm
WHERE cm.role = 'coalter'
  AND cm.metadata ? 'routerTrace'
  AND cm.created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY n DESC;


-- ──────────────────────────────────────────────────────────────
-- AUX-2: theme fallback の実態（食事/旅行/予定…のどれが多いか）
--   theme は metadata に直接出ていないため、同 session の proposalCard.theme
--   または user message から推定することになる。
--   ここでは executorFallbackReason 別の件数のみ提示（詳細は logs で補う）。
-- ──────────────────────────────────────────────────────────────
SELECT
  cm.metadata ->> 'executorFallbackReason' AS fallback_reason,
  count(*) AS n,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS share_pct
FROM coalter_messages cm
WHERE cm.role = 'coalter'
  AND cm.created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY n DESC;


-- ──────────────────────────────────────────────────────────────
-- AUX-3: セッション lifecycle（active / completed / cancelled 分布）
--   ダッシュボード健全性の sanity check。
-- ──────────────────────────────────────────────────────────────
SELECT
  date_trunc('day', created_at)::date AS day,
  state,
  count(*) AS n
FROM coalter_sessions
WHERE created_at >= now() - interval '30 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;


-- ──────────────────────────────────────────────────────────────
-- AUX-4: 連続 clarify の実測
--   RouterTrace.previousMode が clarify で、かつ今ターンも clarify の
--   セッション/ペア数。自己増殖の兆候を見る。
-- ──────────────────────────────────────────────────────────────
SELECT
  date_trunc('day', cm.created_at)::date AS day,
  count(*) FILTER (
    WHERE cm.metadata -> 'routerTrace' ->> 'selectedMode' = 'clarify'
      AND cm.metadata -> 'routerTrace' ->> 'previousMode' = 'clarify'
  ) AS consecutive_clarify,
  count(*) FILTER (WHERE cm.metadata -> 'routerTrace' ->> 'selectedMode' = 'clarify') AS clarify_total
FROM coalter_messages cm
WHERE cm.role = 'coalter'
  AND cm.metadata ? 'routerTrace'
  AND cm.created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;
