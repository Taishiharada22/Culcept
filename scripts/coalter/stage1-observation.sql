-- ═══════════════════════════════════════════════════════════════════════
-- [CoAlter Stage 1 observation 2026-04-20]
--   M1 C3 (pair onboarding) 本番化後の定点観測クエリ。
--
-- 想定タイミング:
--   T0 (flag ON 当日)        — 基準線
--   T1 (flag ON 翌日)        — 新規 onboard の立ち上がり
--   T2 (flag ON 3 日後)      — 継続性・ガード漏れ検知
--   T3 (flag ON 7 日後)      — Stage 1 live / G1 canary 判断の根拠
--
-- 使い方:
--   Supabase SQL editor または psql で個別に実行。
--   観測結果は docs/coalter-stage1-observation-protocol.md の対応セクションに
--   コピペし、差分を追う（絶対値ではなく推移を見る契約）。
--
-- 契約:
--   - READ ONLY。UPDATE / DELETE / INSERT を含むクエリはこのファイルに置かない。
--   - 本 migration の前提は COALTER_PAIR_ONBOARDING=true、かつ
--     stage1LiveEnabled / stage1NarrationEnabled は OFF 継続。
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- Q1. ペア単位のオンボード状況（監査の骨格）
-- ─────────────────────────────────────────────
--   onboarded_at が NULL = flag ON 後に activate していないペア（旧ペア含む）
--   onboarded_at が NOT NULL = activate 済み（新規 or 既存の再 activate）
SELECT
  COUNT(*)                                          AS total_pairs,
  COUNT(*) FILTER (WHERE onboarded_at IS NOT NULL)  AS onboarded_pairs,
  COUNT(*) FILTER (WHERE onboarded_at IS NULL)      AS not_onboarded_pairs,
  COUNT(*) FILTER (WHERE state = 'enabled')         AS enabled_pairs,
  ROUND(
    100.0
      * COUNT(*) FILTER (WHERE onboarded_at IS NOT NULL)
      / NULLIF(COUNT(*) FILTER (WHERE state = 'enabled'), 0),
    1
  ) AS onboarded_ratio_of_enabled_pct
FROM coalter_pair_states;


-- ─────────────────────────────────────────────
-- Q2. オンボード済ペアの seed row 完全性チェック
-- ─────────────────────────────────────────────
--   期待: すべての onboarded ペアに seed row が 1 件だけ存在する（= 契約）
--   `seed_count = 1` 以外の行があれば異常（0 件 = stamp 漏れ / 2+ 件 = 重複 seed）
SELECT
  ps.id                    AS pair_state_id,
  ps.thread_id,
  ps.onboarded_at,
  COUNT(fl.id) FILTER (WHERE fl.session_id IS NULL) AS seed_count,
  COUNT(fl.id) FILTER (WHERE fl.session_id IS NOT NULL) AS normal_count
FROM coalter_pair_states ps
LEFT JOIN coalter_fairness_ledger fl ON fl.pair_state_id = ps.id
WHERE ps.onboarded_at IS NOT NULL
GROUP BY ps.id, ps.thread_id, ps.onboarded_at
ORDER BY ps.onboarded_at DESC;


-- ─────────────────────────────────────────────
-- Q3. 未オンボードペアに seed row が混入していないか（retro-seed 検知）
-- ─────────────────────────────────────────────
--   期待: 0 件（未オンボードペアには seed row を作らないのが契約）
--   1 件以上あれば: cold-start 保護の抜け or activate 前 write の疑い
SELECT
  ps.id,
  ps.thread_id,
  ps.state,
  COUNT(fl.id) FILTER (WHERE fl.session_id IS NULL) AS unexpected_seed_count
FROM coalter_pair_states ps
LEFT JOIN coalter_fairness_ledger fl ON fl.pair_state_id = ps.id
WHERE ps.onboarded_at IS NULL
GROUP BY ps.id, ps.thread_id, ps.state
HAVING COUNT(fl.id) FILTER (WHERE fl.session_id IS NULL) > 0;


-- ─────────────────────────────────────────────
-- Q4. connection accept → activate ラグの分布
-- ─────────────────────────────────────────────
--   pair_states.accepted_at と onboarded_at の差（秒）を分布で見る。
--   長すぎる場合: UI 上で activate ボタンに辿り着けていない可能性。
--   負値: onboarded_at < accepted_at → 時刻整合性バグ（あってはいけない）
SELECT
  COUNT(*)                                            AS n,
  MIN(EXTRACT(EPOCH FROM (onboarded_at - accepted_at))) AS min_sec,
  ROUND(AVG(EXTRACT(EPOCH FROM (onboarded_at - accepted_at)))::numeric, 1) AS avg_sec,
  MAX(EXTRACT(EPOCH FROM (onboarded_at - accepted_at))) AS max_sec,
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (onboarded_at - accepted_at))) AS p50_sec,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (onboarded_at - accepted_at))) AS p95_sec
FROM coalter_pair_states
WHERE onboarded_at IS NOT NULL
  AND accepted_at IS NOT NULL;


-- ─────────────────────────────────────────────
-- Q5. normal ledger (session_id IS NOT NULL) 件数の進展
-- ─────────────────────────────────────────────
--   Stage 1 live/narration は OFF のため、normal ledger は
--   Stage 2+（既存の決定）だけから生える想定。flag ON が
--   意図せず Stage 1 を有効化していないかの sanity check。
SELECT
  COUNT(*) AS total_normal_ledger_rows,
  COUNT(DISTINCT pair_state_id) AS pairs_with_normal_ledger,
  MIN(decided_at) AS earliest_normal_decided,
  MAX(decided_at) AS latest_normal_decided
FROM coalter_fairness_ledger
WHERE session_id IS NOT NULL;


-- ─────────────────────────────────────────────
-- Q6. 直近 24h の onboard 新規 / invoke の分布
-- ─────────────────────────────────────────────
--   日次の新規 onboard 数と、それが invoke（= coalter_sessions 生成）に
--   繋がったかを見る。onboard >> sessions なら UX 断絶の可能性。
WITH last24h AS (
  SELECT NOW() - INTERVAL '24 hours' AS since
)
SELECT
  (SELECT COUNT(*) FROM coalter_pair_states, last24h
     WHERE onboarded_at >= since)                    AS new_onboarded_24h,
  (SELECT COUNT(DISTINCT pair_state_id) FROM coalter_sessions, last24h
     WHERE created_at >= since)                      AS pairs_with_session_24h,
  (SELECT COUNT(*) FROM coalter_sessions, last24h
     WHERE created_at >= since)                      AS sessions_created_24h;


-- ─────────────────────────────────────────────
-- Q7. G1 Canary 判断の根拠指標（Stage 1 解放可否）
-- ─────────────────────────────────────────────
--   後で Stage 1 live/narration を G1 で切る判断をするときの根拠集約。
--   T0 時点は「基準線」、T1-T3 で差分を見る。
SELECT
  -- オンボード規模
  (SELECT COUNT(*) FROM coalter_pair_states WHERE onboarded_at IS NOT NULL) AS onboarded_total,
  -- 契約違反 0 の確認（Q3 と重なるが単一行で見たい）
  (SELECT COUNT(*)
     FROM coalter_pair_states ps
     WHERE ps.onboarded_at IS NULL
       AND EXISTS (
         SELECT 1 FROM coalter_fairness_ledger fl
           WHERE fl.pair_state_id = ps.id AND fl.session_id IS NULL
       )
  ) AS contract_violations,
  -- seed=1 違反（Q2 の「seed_count != 1」の個数）
  (WITH seeds AS (
     SELECT ps.id,
            COUNT(fl.id) FILTER (WHERE fl.session_id IS NULL) AS s
       FROM coalter_pair_states ps
       LEFT JOIN coalter_fairness_ledger fl ON fl.pair_state_id = ps.id
       WHERE ps.onboarded_at IS NOT NULL
       GROUP BY ps.id
   )
   SELECT COUNT(*) FROM seeds WHERE s <> 1
  ) AS seed_cardinality_violations;
