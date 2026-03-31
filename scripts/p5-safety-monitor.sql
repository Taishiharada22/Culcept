-- ============================================================
-- P5 Micro Insight 安全監視クエリ集
-- ============================================================
-- 対象テーブル:
--   stargazer_alter_reactions  (user_id, insight_type, signal_types, reaction, created_at)
--   stargazer_analytics        (user_id, event, feature, metadata, created_at)
--   stargazer_alter_dialogues  (user_id, session_id, role, created_at)
--
-- 実行環境: Supabase (PostgreSQL)
-- 作成日: 2026-03-31
-- ============================================================


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. 否定率（Deny Rate）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- reaction カラムの値: 'accepted', 'denied', 'ignored', 'explored'
-- evaluateMIGate のフェイルセーフ閾値: 全体 deny rate > 30% で全停止


-- 1-a. 全体の deny rate（全期間）
-- 計測: denied / total
-- 合格ライン: <= 30%（30% 超でフェイルセーフ発動）
SELECT
  count(*)                                                   AS total,
  count(*) FILTER (WHERE reaction = 'denied')                AS denied,
  count(*) FILTER (WHERE reaction = 'accepted')              AS accepted,
  count(*) FILTER (WHERE reaction = 'explored')              AS explored,
  count(*) FILTER (WHERE reaction = 'ignored')               AS ignored,
  round(
    count(*) FILTER (WHERE reaction = 'denied')::numeric
    / NULLIF(count(*), 0) * 100, 1
  )                                                          AS deny_rate_pct
FROM stargazer_alter_reactions;


-- 1-b. 直近 7 日・30 日の deny rate 推移（日別）
-- 計測: 日ごとの denied / total
-- 合格ライン: 7日平均で <= 30%
SELECT
  d.dt::date                                                 AS date,
  count(r.id)                                                AS total,
  count(r.id) FILTER (WHERE r.reaction = 'denied')           AS denied,
  round(
    count(r.id) FILTER (WHERE r.reaction = 'denied')::numeric
    / NULLIF(count(r.id), 0) * 100, 1
  )                                                          AS deny_rate_pct
FROM generate_series(
  current_date - interval '30 days',
  current_date,
  interval '1 day'
) AS d(dt)
LEFT JOIN stargazer_alter_reactions r
  ON r.created_at >= d.dt
  AND r.created_at < d.dt + interval '1 day'
GROUP BY d.dt
ORDER BY d.dt DESC;


-- 1-c. ユーザー別 deny rate（上位 10 名）
-- 計測: ユーザーごとの denied / total（サンプル数 >= 3 のみ）
-- 目的: 個別にフェイルセーフが掛かるべきユーザーの特定
SELECT
  user_id,
  count(*)                                                   AS total,
  count(*) FILTER (WHERE reaction = 'denied')                AS denied,
  count(*) FILTER (WHERE reaction = 'accepted')              AS accepted,
  round(
    count(*) FILTER (WHERE reaction = 'denied')::numeric
    / NULLIF(count(*), 0) * 100, 1
  )                                                          AS deny_rate_pct
FROM stargazer_alter_reactions
GROUP BY user_id
HAVING count(*) >= 3
ORDER BY deny_rate_pct DESC
LIMIT 10;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. 不快誤検知率
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 定義: denied 後 30 秒以内にそのセッションで会話が終了（以降の発話なし）
-- stargazer_alter_reactions.created_at と stargazer_alter_dialogues.created_at を比較
-- 合格ライン: <= 5%


-- 2-a. 不快誤検知の件数と割合
-- 「denied 後 30 秒以内にセッション終了」を近似するため、
-- denied の reaction 時刻以降に同一ユーザーの dialogue が 30 秒以内に存在しないケースを検出
WITH denied_events AS (
  SELECT
    r.id AS reaction_id,
    r.user_id,
    r.created_at AS denied_at,
    r.analytics_event_id
  FROM stargazer_alter_reactions r
  WHERE r.reaction = 'denied'
),
-- analytics_event_id から元の insight_presented イベントの session_id を取得
denied_with_session AS (
  SELECT
    de.reaction_id,
    de.user_id,
    de.denied_at,
    (sa.metadata->>'session_id')::uuid AS session_id
  FROM denied_events de
  LEFT JOIN stargazer_analytics sa ON sa.id = de.analytics_event_id
),
-- denied 後 30 秒以内にユーザーの次の dialogue があるか確認
next_activity AS (
  SELECT
    dws.reaction_id,
    dws.user_id,
    dws.denied_at,
    dws.session_id,
    EXISTS (
      SELECT 1
      FROM stargazer_alter_dialogues d
      WHERE d.user_id = dws.user_id
        AND d.role = 'user'
        AND d.created_at > dws.denied_at
        AND d.created_at <= dws.denied_at + interval '30 seconds'
    ) AS had_followup_within_30s
  FROM denied_with_session dws
)
SELECT
  count(*)                                                               AS total_denied,
  count(*) FILTER (WHERE NOT had_followup_within_30s)                    AS silent_exits,
  round(
    count(*) FILTER (WHERE NOT had_followup_within_30s)::numeric
    / NULLIF(count(*), 0) * 100, 1
  )                                                                      AS discomfort_misfire_pct,
  CASE
    WHEN count(*) FILTER (WHERE NOT had_followup_within_30s)::numeric
         / NULLIF(count(*), 0) * 100 <= 5 THEN 'PASS'
    ELSE 'FAIL'
  END                                                                    AS verdict
FROM next_activity;


-- 2-b. 不快誤検知の直近 7 日推移
WITH denied_events AS (
  SELECT
    r.id AS reaction_id,
    r.user_id,
    r.created_at AS denied_at
  FROM stargazer_alter_reactions r
  WHERE r.reaction = 'denied'
    AND r.created_at >= current_date - interval '7 days'
),
next_activity AS (
  SELECT
    de.reaction_id,
    de.user_id,
    de.denied_at,
    de.denied_at::date AS denied_date,
    EXISTS (
      SELECT 1
      FROM stargazer_alter_dialogues d
      WHERE d.user_id = de.user_id
        AND d.role = 'user'
        AND d.created_at > de.denied_at
        AND d.created_at <= de.denied_at + interval '30 seconds'
    ) AS had_followup_within_30s
  FROM denied_events de
)
SELECT
  denied_date                                                            AS date,
  count(*)                                                               AS total_denied,
  count(*) FILTER (WHERE NOT had_followup_within_30s)                    AS silent_exits,
  round(
    count(*) FILTER (WHERE NOT had_followup_within_30s)::numeric
    / NULLIF(count(*), 0) * 100, 1
  )                                                                      AS discomfort_misfire_pct
FROM next_activity
GROUP BY denied_date
ORDER BY denied_date DESC;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. 断定表現検出（lintMIAssertions）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- event: 'home_alter_mi_assertion_lint'
-- metadata: { violations: string[], session_id: string }
-- lintMIAssertions は出力後の regex lint。patched = true のときのみ記録される。
-- 合格ライン: 断定表現 0%（= lint イベント自体が 0 件であるべき）


-- 3-a. 断定表現検出の総件数と、提示総数に対する割合
-- 計測: lint 発火数 / insight_presented 数
-- 合格ライン: 0%（lint 発火はパッチで救済されるが、発火自体が 0 であるべき）
WITH lint_count AS (
  SELECT count(*) AS cnt
  FROM stargazer_analytics
  WHERE event = 'home_alter_mi_assertion_lint'
),
presented_count AS (
  SELECT count(*) AS cnt
  FROM stargazer_analytics
  WHERE event = 'home_alter_insight_presented'
)
SELECT
  p.cnt                                                      AS total_presented,
  l.cnt                                                      AS lint_violations_detected,
  round(
    l.cnt::numeric / NULLIF(p.cnt, 0) * 100, 1
  )                                                          AS violation_rate_pct,
  CASE WHEN l.cnt = 0 THEN 'PASS' ELSE 'FAIL' END          AS verdict
FROM lint_count l, presented_count p;


-- 3-b. violation 種別ごとの発生頻度
-- metadata.violations は text[] (JSON array of strings like '行動断定: "..."')
-- violation ラベル: 行動断定 / メタ分析 / 診断風 / 状態断定 / 分析暴露
SELECT
  split_part(v.violation, ':', 1)                            AS violation_type,
  count(*)                                                   AS occurrences
FROM stargazer_analytics sa,
  LATERAL jsonb_array_elements_text(sa.metadata->'violations') AS v(violation)
WHERE sa.event = 'home_alter_mi_assertion_lint'
GROUP BY violation_type
ORDER BY occurrences DESC;


-- 3-c. 日別の lint 検出推移（直近 30 日）
SELECT
  sa.created_at::date                                        AS date,
  count(*)                                                   AS lint_violations
FROM stargazer_analytics sa
WHERE sa.event = 'home_alter_mi_assertion_lint'
  AND sa.created_at >= current_date - interval '30 days'
GROUP BY date
ORDER BY date DESC;


-- 3-d. patched（lint で救済済み）の割合
-- lintMIAssertions は patched = true のときのみ analytics に記録されるため、
-- 記録された件数 = patched 件数。未検出（patched = false）は記録されない。
-- つまり「patched 率」は常に 100%（記録 = パッチ済み）。
-- 注意: LLM が断定表現を含まなかった正常ケースは記録されない（= 検出数 0 が理想）。
SELECT
  'lint 記録あり = 全て patched 済み（未検出は記録されない設計）' AS note,
  count(*)                                                   AS total_patched
FROM stargazer_analytics
WHERE event = 'home_alter_mi_assertion_lint';


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. suppress の発動状況
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- home_alter_judgment イベントの metadata.micro_insight に以下が含まれる:
--   suppressed: string (blockReason) or undefined
--   presented: boolean
-- home_alter_insight_presented イベントの metadata に mi_gate_accuracy が含まれる
-- evaluateMIGate のブロック理由の分類:
--   - "P5: 1セッション1回制限"
--   - 既存 suppression（時間ベース / ストリーク / trap / wound）
--   - "failsafe: 否定率 N% > 30%"
--   - "failsafe: 連続 denied N回"
--   - "P5: 3セッション中1回制限"
--   - "suppressedTypes: 全シグナル(...) が抑制対象"


-- 4-a. suppress 発動の全体統計
-- 計測: micro_insight が生成されたが suppressed された件数 vs presented された件数
WITH judgment_mi AS (
  SELECT
    sa.metadata->'micro_insight'->>'suppressed'              AS suppress_reason,
    (sa.metadata->'micro_insight'->>'presented')::boolean    AS presented
  FROM stargazer_analytics sa
  WHERE sa.event = 'home_alter_judgment'
    AND sa.metadata->'micro_insight' IS NOT NULL
    AND sa.metadata->>'micro_insight' != 'null'
)
SELECT
  count(*)                                                   AS total_mi_generated,
  count(*) FILTER (WHERE presented = true)                   AS presented,
  count(*) FILTER (WHERE presented = false OR presented IS NULL) AS suppressed,
  round(
    count(*) FILTER (WHERE presented = false OR presented IS NULL)::numeric
    / NULLIF(count(*), 0) * 100, 1
  )                                                          AS suppress_rate_pct
FROM judgment_mi;


-- 4-b. ブロック理由の分布
-- 計測: suppress_reason の先頭キーワードでグルーピング
WITH judgment_mi AS (
  SELECT
    sa.metadata->'micro_insight'->>'suppressed'              AS suppress_reason
  FROM stargazer_analytics sa
  WHERE sa.event = 'home_alter_judgment'
    AND sa.metadata->'micro_insight' IS NOT NULL
    AND sa.metadata->>'micro_insight' != 'null'
    AND sa.metadata->'micro_insight'->>'suppressed' IS NOT NULL
)
SELECT
  CASE
    WHEN suppress_reason LIKE 'P5: 1セッション1回制限%'         THEN 'session_limit'
    WHEN suppress_reason LIKE 'P5: 3セッション中1回制限%'       THEN 'cooldown_72h'
    WHEN suppress_reason LIKE 'failsafe: 否定率%'              THEN 'failsafe_deny_rate'
    WHEN suppress_reason LIKE 'failsafe: 連続 denied%'         THEN 'failsafe_consecutive'
    WHEN suppress_reason LIKE 'suppressedTypes%'               THEN 'type_suppressed'
    WHEN suppress_reason LIKE '%wound%'                        THEN 'wound_protection'
    WHEN suppress_reason LIKE '%trap%'                         THEN 'trap_guard'
    WHEN suppress_reason LIKE '%streak%'                       THEN 'deny_streak'
    ELSE 'other_legacy'
  END                                                        AS block_category,
  count(*)                                                   AS occurrences,
  round(
    count(*)::numeric / NULLIF(sum(count(*)) OVER (), 0) * 100, 1
  )                                                          AS pct
FROM judgment_mi
GROUP BY block_category
ORDER BY occurrences DESC;


-- 4-c. failsafe 発動回数（否定率フェイルセーフ + 連続 denied フェイルセーフ）
-- 計測: blockReason に 'failsafe' を含むもの
-- 注意: failsafe は深刻なシグナルであり、1 件でも要確認
SELECT
  CASE
    WHEN suppress_reason LIKE 'failsafe: 否定率%'      THEN 'global_deny_rate'
    WHEN suppress_reason LIKE 'failsafe: 連続 denied%'  THEN 'consecutive_denied'
  END                                                        AS failsafe_type,
  count(*)                                                   AS occurrences,
  min(sa.created_at)                                         AS first_seen,
  max(sa.created_at)                                         AS last_seen
FROM stargazer_analytics sa
WHERE sa.event = 'home_alter_judgment'
  AND sa.metadata->'micro_insight'->>'suppressed' LIKE 'failsafe:%'
GROUP BY failsafe_type
ORDER BY occurrences DESC;


-- 4-d. suppressedTypes の内訳
-- insight_presented イベントの metadata.signal_types から提示されたタイプを集計し、
-- reactions テーブルの denied 率が 50% 以上のタイプ（= computeMIAccuracy の抑制対象）を特定
-- computeMIAccuracy の条件: stats.total >= 3 AND denied / total >= 0.5
WITH type_stats AS (
  SELECT
    insight_type,
    count(*)                                                 AS total,
    count(*) FILTER (WHERE reaction = 'denied')              AS denied,
    count(*) FILTER (WHERE reaction = 'accepted')            AS accepted,
    count(*) FILTER (WHERE reaction = 'explored')            AS explored,
    count(*) FILTER (WHERE reaction = 'ignored')             AS ignored,
    round(
      count(*) FILTER (WHERE reaction = 'denied')::numeric
      / NULLIF(count(*), 0) * 100, 1
    )                                                        AS deny_rate_pct
  FROM stargazer_alter_reactions
  GROUP BY insight_type
)
SELECT
  insight_type,
  total,
  denied,
  accepted,
  explored,
  ignored,
  deny_rate_pct,
  CASE
    WHEN total >= 3 AND deny_rate_pct >= 50 THEN 'SUPPRESSED'
    WHEN total < 3                          THEN 'INSUFFICIENT_SAMPLE'
    ELSE 'ACTIVE'
  END                                                        AS status
FROM type_stats
ORDER BY deny_rate_pct DESC;


-- 4-e. suppressedTypes による抑制が発動した件数
SELECT
  count(*)                                                   AS type_suppression_events
FROM stargazer_analytics sa
WHERE sa.event = 'home_alter_judgment'
  AND sa.metadata->'micro_insight'->>'suppressed' LIKE 'suppressedTypes:%';


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ダッシュボード用: P5 安全指標サマリ
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 全 4 指標を 1 行で確認するクエリ
-- 合格ライン: deny_rate <= 30%, discomfort_misfire <= 5%, assertion_violations = 0
WITH deny AS (
  SELECT
    count(*)                                                 AS total,
    count(*) FILTER (WHERE reaction = 'denied')              AS denied
  FROM stargazer_alter_reactions
),
discomfort AS (
  SELECT
    count(*)                                                 AS total_denied,
    count(*) FILTER (WHERE NOT EXISTS (
      SELECT 1
      FROM stargazer_alter_dialogues d
      WHERE d.user_id = r.user_id
        AND d.role = 'user'
        AND d.created_at > r.created_at
        AND d.created_at <= r.created_at + interval '30 seconds'
    ))                                                       AS silent_exits
  FROM stargazer_alter_reactions r
  WHERE r.reaction = 'denied'
),
lint AS (
  SELECT count(*) AS violations
  FROM stargazer_analytics
  WHERE event = 'home_alter_mi_assertion_lint'
),
failsafe AS (
  SELECT count(*) AS cnt
  FROM stargazer_analytics
  WHERE event = 'home_alter_judgment'
    AND metadata->'micro_insight'->>'suppressed' LIKE 'failsafe:%'
)
SELECT
  -- 1. Deny Rate
  round(deny.denied::numeric / NULLIF(deny.total, 0) * 100, 1)
    AS deny_rate_pct,
  CASE WHEN deny.denied::numeric / NULLIF(deny.total, 0) <= 0.30
    THEN 'PASS' ELSE 'FAIL' END
    AS deny_rate_verdict,

  -- 2. Discomfort Misfire Rate
  round(discomfort.silent_exits::numeric / NULLIF(discomfort.total_denied, 0) * 100, 1)
    AS discomfort_misfire_pct,
  CASE WHEN discomfort.silent_exits::numeric / NULLIF(discomfort.total_denied, 0) <= 0.05
    THEN 'PASS' ELSE 'FAIL' END
    AS discomfort_verdict,

  -- 3. Assertion Violations
  lint.violations
    AS assertion_violations,
  CASE WHEN lint.violations = 0
    THEN 'PASS' ELSE 'FAIL' END
    AS assertion_verdict,

  -- 4. Failsafe Activations
  failsafe.cnt
    AS failsafe_activations

FROM deny, discomfort, lint, failsafe;
