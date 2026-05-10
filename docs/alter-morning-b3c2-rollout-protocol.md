# B-3c-2 rollout 運用プロトコル — journey_origin promotion

**目的**: PR #70 (B-3c-1) で実装した journey_origin promotion 機能を、実 user に
段階的に開放し、稼働実績に基づいて expand / hold / rollback を判断する運用 doc。

**前提**:
- B-3c-2 PR が main merge 済 (= telemetry / Layer A / Layer B / inline feedback 配信済)
- production env で `journeyOriginGrounding` flag default OFF を維持
- Vercel env `ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING_ALLOWLIST` を CSV で操作 (= CEO 担当)

**Out of scope**:
- ❌ flag 削除 → B-3c-3
- ❌ admin dashboard UI 統合 → 別 PR
- ❌ journey_end → B-3e

---

## 1. 観測手段 (= GPT 1st 補正 #5、dashboard 不在時の正本)

### 1.1 正本: Supabase SQL クエリ

`stargazer_analytics` テーブルへの直接 SQL クエリ。Supabase Studio から実行。

| 用途 | クエリ | 頻度 |
|------|--------|------|
| selection_success_rate | §2.1 | Phase 別 §3 |
| missing_coordinates_block_rate | §2.2 | 同上 |
| invalid_coordinate_filter_rate | §2.3 | 同上 |
| zero_after_filter_rate | §2.4 | 同上 |
| provider_failure_rate | §2.5 | 同上 |
| raw event log (debug) | §2.6 | 異常検出時 |

### 1.2 補助観測

- **Vercel logs**: `console.info('[journey-origin-grounding:...')` の structured log (= B-3b'-2 で追加済)
- **Sentry**: 想定外例外 (= 全 try/catch でログ出力)
- **Browser DevTools**: staging で network tab で event emit を直接確認可能

### 1.3 admin dashboard 統合は別 PR

dashboard UI 化は B-3c-2 後の別 PR (= scope creep 防止)。
B-3c-2 完了時点では本 doc の SQL クエリ + Vercel logs で十分判断可能。

---

## 2. SQL クエリテンプレート

### 2.1 selection_success_rate (= 主要指標)

```sql
WITH events_24h AS (
  SELECT event, metadata
  FROM stargazer_analytics
  WHERE event LIKE 'journey_origin_promotion_%'
    AND created_at > now() - interval '24 hours'
)
SELECT
  COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_succeeded') AS succeeded,
  COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_blocked') AS blocked,
  COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_zero_candidates') AS zero_candidates,
  COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_provider_failure') AS provider_failure,
  ROUND(
    COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_succeeded')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE event IN (
      'journey_origin_promotion_succeeded',
      'journey_origin_promotion_blocked',
      'journey_origin_promotion_zero_candidates',
      'journey_origin_promotion_provider_failure'
    )), 0),
    3
  ) AS selection_success_rate
FROM events_24h;
```

**閾値**:
- 警戒値: < 0.7
- rollback 推奨: < 0.5

### 2.2 missing_coordinates_block_rate (= GPT 2nd 補正の主検証)

```sql
SELECT
  COUNT(*) FILTER (
    WHERE event = 'journey_origin_promotion_blocked'
      AND metadata->>'reject_reason' = 'missing_coordinates'
  ) AS missing_coords_blocked,
  COUNT(*) FILTER (
    WHERE event IN (
      'journey_origin_promotion_succeeded',
      'journey_origin_promotion_blocked'
    )
  ) AS total_attempts,
  ROUND(
    COUNT(*) FILTER (
      WHERE event = 'journey_origin_promotion_blocked'
        AND metadata->>'reject_reason' = 'missing_coordinates'
    )::numeric
    / NULLIF(COUNT(*) FILTER (
      WHERE event IN (
        'journey_origin_promotion_succeeded',
        'journey_origin_promotion_blocked'
      )
    ), 0),
    3
  ) AS missing_coords_block_rate
FROM stargazer_analytics
WHERE event LIKE 'journey_origin_promotion_%'
  AND created_at > now() - interval '24 hours';
```

**閾値**:
- 警戒値: > 0.05
- rollback 推奨: > 0.15

### 2.3 invalid_coordinate_filter_rate (= API anomaly 指標)

```sql
SELECT
  SUM((metadata->>'invalid_coordinate_count')::int) AS total_invalid,
  SUM((metadata->>'candidate_count_before_filter')::int) AS total_before_filter,
  ROUND(
    SUM((metadata->>'invalid_coordinate_count')::int)::numeric
    / NULLIF(SUM((metadata->>'candidate_count_before_filter')::int), 0),
    3
  ) AS invalid_coordinate_filter_rate
FROM stargazer_analytics
WHERE event = 'journey_origin_promotion_presented'
  AND created_at > now() - interval '24 hours';
```

**閾値**:
- 警戒値: > 0.10
- rollback 推奨: > 0.30 (= API 大規模 anomaly)

### 2.4 zero_after_filter_rate (= Layer A 過敏度)

```sql
SELECT
  COUNT(*) FILTER (
    WHERE metadata->>'zero_reason' = 'no_coordinate_candidates_after_filter'
  ) AS zero_after_filter,
  COUNT(*) AS total_zero,
  ROUND(
    COUNT(*) FILTER (
      WHERE metadata->>'zero_reason' = 'no_coordinate_candidates_after_filter'
    )::numeric
    / NULLIF(COUNT(*), 0),
    3
  ) AS zero_after_filter_rate
FROM stargazer_analytics
WHERE event = 'journey_origin_promotion_zero_candidates'
  AND created_at > now() - interval '24 hours';
```

**閾値**:
- 警戒値: > 0.30 (= Layer A が必要以上に発動)
- rollback 推奨: > 0.50 (= Layer A 過敏で UX 破壊)

### 2.5 provider_failure_rate

```sql
SELECT
  COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_provider_failure') AS provider_failure,
  COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_presented') AS presented,
  ROUND(
    COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_provider_failure')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_presented'), 0),
    3
  ) AS provider_failure_rate
FROM stargazer_analytics
WHERE event LIKE 'journey_origin_promotion_%'
  AND created_at > now() - interval '24 hours';
```

**閾値**:
- 警戒値: > 0.10
- rollback 推奨: > 0.25

### 2.6 raw event log (= debug / 個別 trace)

```sql
SELECT
  created_at,
  user_id,
  event,
  metadata
FROM stargazer_analytics
WHERE event LIKE 'journey_origin_promotion_%'
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC
LIMIT 100;
```

**用途**:
- 異常パターン (= 同一 user 連続 blocked / provider failure 集中時間帯) の発見
- specific user の trace 追跡 (= 報告ベース debug)

### 2.6.5 zero_reason 別 count + funnel coverage (= CEO 2026-05-03 audit 反映)

CEO 2026-05-03 merge 直前 audit で「分母 SQL の存在確認」 要請があった項目 #4 / #6 / #8。
metadata に値は persist されているが、独立 query が無かったため追加。

```sql
-- 全 funnel 集計 (= 1 query で 11 項目中 9 項目を一覧)
SELECT
  -- #2 presentation 到達数
  COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_presented') AS presented_count,

  -- #3 candidateCountBeforeFilter sum (= sum で集計)
  SUM(
    CASE WHEN event = 'journey_origin_promotion_presented'
      THEN (metadata->>'candidate_count_before_filter')::int
      ELSE 0
    END
  ) AS sum_candidate_before_filter,

  -- #4 candidateCountAfterFilter sum (= 独立追加、CEO audit #4)
  SUM(
    CASE WHEN event = 'journey_origin_promotion_presented'
      THEN (metadata->>'candidate_count_after_filter')::int
      ELSE 0
    END
  ) AS sum_candidate_after_filter,

  -- #5 invalidCoordinateCount sum
  SUM(
    CASE WHEN event = 'journey_origin_promotion_presented'
      THEN COALESCE((metadata->>'invalid_coordinate_count')::int, 0)
      ELSE 0
    END
  ) AS sum_invalid_coordinate_count,

  -- #6 no_candidates_from_places_search count (= 独立追加、CEO audit #6)
  COUNT(*) FILTER (
    WHERE event = 'journey_origin_promotion_zero_candidates'
      AND metadata->>'zero_reason' = 'no_candidates_from_places_search'
  ) AS zero_no_candidates_from_places,

  -- #7 no_coordinate_candidates_after_filter count
  COUNT(*) FILTER (
    WHERE event = 'journey_origin_promotion_zero_candidates'
      AND metadata->>'zero_reason' = 'no_coordinate_candidates_after_filter'
  ) AS zero_after_filter,

  -- #8 selection attempt 数 (= succeeded + blocked、CEO audit #8 で明示化)
  COUNT(*) FILTER (
    WHERE event IN (
      'journey_origin_promotion_succeeded',
      'journey_origin_promotion_blocked'
    )
  ) AS selection_attempts,

  -- #9 promotion success 数
  COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_succeeded') AS succeeded_count,

  -- #10 missing_coordinates rejection 数
  COUNT(*) FILTER (
    WHERE event = 'journey_origin_promotion_blocked'
      AND metadata->>'reject_reason' = 'missing_coordinates'
  ) AS rejected_missing_coords,

  -- #11 travel segment generated 数
  COUNT(*) FILTER (
    WHERE event = 'journey_origin_promotion_succeeded'
      AND (metadata->>'segment_generated')::bool = true
  ) AS travel_segment_generated_count
FROM stargazer_analytics
WHERE event LIKE 'journey_origin_promotion_%'
  AND created_at > now() - interval '24 hours';
```

**項目別 SQL カバレッジ (= CEO 2026-05-03 merge 直前 audit)**:

| # | CEO 項目 | クエリ section | 集計可能 |
|---|----------|----------------|----------|
| 1 | eligible journey_origin grounding intent 数 | §11 ⚠ gap (= 別 telemetry 必要) | **未対応** (= follow-up PR で対応) |
| 2 | candidate presentation 到達数 | §2.6.5 `presented_count` | ✅ |
| 3 | candidateCountBeforeFilter | §2.6.5 `sum_candidate_before_filter` | ✅ |
| 4 | candidateCountAfterFilter | §2.6.5 `sum_candidate_after_filter` | ✅ |
| 5 | invalidCoordinateCount | §2.6.5 `sum_invalid_coordinate_count` + §2.3 | ✅ |
| 6 | no_candidates_from_places_search | §2.6.5 `zero_no_candidates_from_places` | ✅ |
| 7 | no_coordinate_candidates_after_filter | §2.6.5 `zero_after_filter` + §2.4 | ✅ |
| 8 | selection attempt 数 | §2.6.5 `selection_attempts` | ✅ |
| 9 | promotion success 数 | §2.6.5 `succeeded_count` + §2.1 | ✅ |
| 10 | missing_coordinates / rejection 数 | §2.6.5 `rejected_missing_coords` + §2.2 | ✅ |
| 11 | travel segment generated 数 | §2.6.5 `travel_segment_generated_count` + §2.7 | ✅ |

⚠ #1 の eligible intent 数は本 PR で telemetry event 自体が未実装。Vercel log
search (`[journey-origin-grounding:skip_classification]` / `[journey-origin-grounding:skip_gate]`) で間接観測のみ可能。
完全な funnel 観測には follow-up PR で `journey_origin_promotion_intent_generated`
event 追加が必要 (= §11 gap 詳述)。

### 2.7 segment_generation_rate (= 必須 #7 検証)

```sql
SELECT
  COUNT(*) FILTER (WHERE (metadata->>'segment_generated')::bool = true) AS segments_generated,
  COUNT(*) AS total_succeeded,
  ROUND(
    COUNT(*) FILTER (WHERE (metadata->>'segment_generated')::bool = true)::numeric
    / NULLIF(COUNT(*), 0),
    3
  ) AS travel_segment_generation_rate
FROM stargazer_analytics
WHERE event = 'journey_origin_promotion_succeeded'
  AND created_at > now() - interval '24 hours';
```

**期待**: ≥ 0.9 (= ほぼ全 succeeded で travel item 生成、= 必須 #7 動作確認)

---

## 3. Phase 別観測頻度 (= GPT 1st 補正 #4)

| Phase | allowlist size | 観測頻度 | 期間 | 拡大判断 |
|-------|----------------|----------|------|----------|
| **0 (staging)** | 0 user | 実行ごと (= §4 staging E2E 実施時に毎回) | 即時 | §4 全シナリオ Pass |
| **1 (1-3 user)** | CEO + 知人 1-2 | 初日 → 翌日 → 24h ごと | 3-7 日 | 全閾値 警戒値内、§5 expand 条件満たす |
| **2 (5-10 user)** | 招待制初期検証 | 24-48h ごと | 1-2 週間 | 全閾値 警戒値内、user feedback 否定的でない |
| **3 (global 候補)** | 全 user | 週次 | — | Phase 2 全条件 + CEO 最終承認 + 24h Phase 3 観測 |

---

## 4. Staging E2E protocol (= Phase 0 検証、CEO 担当)

### 前提

- staging env (= preview deploy) に以下のいずれかを設定:
  - `ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING=true` (= staging 全 user ON)
  - `ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING_ALLOWLIST=<CEO userId>` (= CEO のみ ON)
- 必要に応じて `ALTER_MORNING_TRANSPORT_V2=true` (= travel item 生成検証用)

### シナリオ #1: Happy path (= 必須 #1 #3 #7 検証)

1. CEO「明日 8 時東京駅から渋谷へ」と入力
2. Alter が origin clarify presentation を返す
3. CEO「丸の内口」を click
4. **期待**:
   - plan card 上部 journeyOrigin label = 「東京駅丸の内口」
   - travel item from = 「東京駅丸の内口」 (= 統一)
5. CEO「池袋に行きたい」を追加
6. **期待**: 次 turn でも journey_origin label と travel from が一致 (= 半壊 UX なし)
7. **観測**: `journey_origin_promotion_presented` + `journey_origin_promotion_succeeded` 両方 emit を §2.6 raw event log で確認

### シナリオ #2: Coordinates 不正 (= GPT 1st 補正 #1 + Layer A 検証)

- staging で provider mock または手動で 1 候補に lat: NaN を設定
- §5 Layer A で除外される → presentation には現れない
- **観測**: `journey_origin_promotion_presented.invalid_coordinate_count: 1`

### シナリオ #3: 全候補 zero (= zero_reason 分離検証)

1. CEO「明日 8 時 hogeholgehogeから渋谷へ」 (= invalid 地名)
2. **期待**: zero_candidates 経路、UI で「該当する場所が見つかりませんでした」表示
3. **観測**: `journey_origin_promotion_zero_candidates` emit、`zero_reason: no_candidates_from_places_search`

### シナリオ #4: generic_category skip 経路 (= 既存挙動維持、CEO 2026-05-03 訂正)

1. CEO「ホテルから」と入力 → **generic_category** 分類で skip (= 既存 PR #69 動作、`labelClassification.ts` GENERIC_CATEGORIES vocabulary に "ホテル" 含まれる)
2. **期待**:
   - candidate presentation は出ない
   - journeyOrigin は **known_label_only 維持** (= label="ホテル" のまま)
   - 即「どのホテル？」とは聞かない (= CEO 規律「質問アプリ化防止」)
   - 後続文脈で具体化 (= 「東京駅前のホテル」「ANA ホテル」 等) された場合のみ grounding に進む
3. **観測**: 本 events は emit されない (= flag ON でも skip_classification path、Vercel log `[journey-origin-grounding:skip_classification] classification=generic_category` で確認可)

**注意 (= CEO 2026-05-03 audit)**:
- 「ホテル」 = `generic_category` (= NOT `ambiguous`)。
- `ambiguous_or_demonstrative` は「あそこ」「そこ」「あれ」 等の指示語。
- generic / ambiguous を混同すると skip 理由 / telemetry / UX 判断がズレる。

### シナリオ #5: blocked → 別候補選び直し (= GPT 2nd 補正検証)

1. provider mock で全候補のうち 1 つに invalid coords 設定
2. CEO が invalid 候補を click (= Layer B disabled でも click 可能性想定)
3. **期待**:
   - inline feedback 表示「この候補は移動に必要な位置情報が不足しています…」
   - picker 閉じない、journeyOrigin 不変
4. CEO「別の valid 候補」を click
5. **期待**: promotion 成功、上記 inline feedback が消える
6. **観測**:
   - `journey_origin_promotion_blocked` emit、`reject_reason: missing_coordinates`、`active_presentation_cleared: false`
   - 続いて `journey_origin_promotion_succeeded` emit

### Pass 条件

- シナリオ #1-#5 全てで期待挙動
- console error なし
- network tab で全 5 events emit
- Supabase で events persist 確認

---

## 5. CEO 判断 (= expand / hold / rollback)

| 判断 | trigger | next action |
|------|---------|-------------|
| **expand** | 期間内 全閾値 OK + 質的に問題なし | allowlist 拡大 (= env 更新は CEO) |
| **hold** | 警戒値超過、rollback 閾値未達 | 同 Phase 維持 → 原因調査 → 必要なら fix PR |
| **rollback** | rollback 閾値超過 OR critical bug | flag OFF (= §6 手順) |

判断ベースは §2 の SQL クエリ結果。AI は数値提示と異常検出のみ、最終判断は CEO。

---

## 6. Rollback 手順

### 6.1 rollback 即時実施条件

- §2 rollback 推奨閾値 超過
- production critical bug (= 既存 user 影響、event_where 経路退行)
- security 問題
- CEO 判断 (= 数値外の理由でも CEO は OFF にできる)

### 6.2 手順

#### Phase 1-2 (= allowlist) からの rollback

```bash
# Vercel CLI (= preview / production)
vercel env rm ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING_ALLOWLIST production
# または allowlist を空文字に上書き
vercel env add ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING_ALLOWLIST production
# 値: "" (= 空)

# Vercel 自動 redeploy 完了 (= 数分)
```

#### Phase 3 (= global ON) からの rollback

```bash
# Phase 1-2 と同じ + global flag を OFF
vercel env add ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING production
# 値: "false"

# 既に "false" の場合は env を削除
vercel env rm ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING production
```

#### 共通

1. Vercel deployments page で rollback deploy が `Ready` になることを確認
2. main HEAD ではなく **既存 production deploy を redeploy** することで環境変数を反映
3. 動作確認: §2 SQL で rollback 後 1 時間以内の events 件数を確認 (= 0 件のはず)

### 6.3 rollback 後の対応

- 原因調査: §2.6 raw event log で異常パターン特定
- fix PR が必要なら新 branch で対応
- canary 再開は Phase 0 (= staging) からやり直し

---

## 7. 異常検出パターン (= 観測時に確認すべきパターン)

CEO 2026-05-03 訂正: AI は自律的に常時監視しない。
以下いずれかのタイミングで AI が SQL を回して確認する:
- **CEO が依頼したタイミング** (= ad-hoc check)
- **別途 monitoring / automation を設定した場合** (= 例: Supabase scheduled function、Vercel Cron 等。本 PR scope 外)

| パターン | SQL | 対応 |
|----------|-----|------|
| selection_success_rate 急落 | §2.1 で 24h 平均が 警戒値超過 | hold / rollback 判断要請 |
| missing_coordinates_block_rate 上昇 | §2.2 で警戒値超過 | API anomaly 調査 + rollback 判断 |
| invalid_coordinate_filter_rate 急上昇 | §2.3 で警戒値超過 | Places SDK / API status 確認 |
| 同一 user 連続 blocked | §2.6 で `user_id` 集中 | UX 個別調査 |
| 短時間に大量 events | §2.6 で `created_at` 集中 | bot / abuse 検出 |

**重要**: 上記パターン検出時、AI は **CEO に報告のみ**。判断 (= hold / rollback / 拡大) は CEO。

---

## 11. 既知 gap (= follow-up PR で対応)

### 11.1 eligible intent 数 telemetry 不在 (= CEO 2026-05-03 audit #1)

**現状**:
- legacyAdapter で journey_origin grounding intent は生成されるが、telemetry event
  `journey_origin_promotion_intent_generated` は **存在しない**
- 結果: classification === "public_poi_proper_noun" の path のみ orchestrator が呼ばれ
  `journey_origin_promotion_presented` を emit するが、 generic / private / ambiguous
  classification path (= skip) の数は SQL から見えない

**影響**:
- funnel 全体把握ができない (= 「intent → classification → presentation 比率」を
  algorithmic に観測できない)
- Phase 1-2 では小規模 user 観測なので Vercel log で間接確認は可能だが、Phase 3
  (= global 候補) では SQL 集計必須

**間接観測 (= B-3c-2 期間中の workaround)**:
- Vercel logs で以下を grep:
  - `[journey-origin-grounding:skip_classification] classification=` の出現数
    → generic / private / ambiguous の合計
  - `[journey-origin-grounding:skip_gate]` の出現数
    → orchestrator gate 失敗 (= label 空、cache 不在等)

  両者の合計 + `journey_origin_promotion_presented` emit 数 = eligible intent 数

**Follow-up PR (= B-3c-2.x または B-3c-3 で対応)**:
- 新 telemetry event `journey_origin_promotion_intent_generated` を追加
  metadata: target_kind, label_classification_token (= public_poi / generic / private / ambiguous)
- legacyAdapter で intent 生成時 emit (= PII フリー、classification は token のみ)
- 本 doc §2.6.5 query に新 event の集計を追加

**判断**:
- B-3c-2 merge は遅延しない (= CEO 2026-05-03 判断)
- Phase 0 staging E2E、Phase 1 1-3 user では Vercel log 観測で十分
- Phase 2 (5-10 user) 開始前に follow-up PR 提出予定

## 8. 文書履歴

- **2026-05-03 初版** (= B-3c-2 PR で作成)
- **2026-05-03 audit 反映**: §2.6.5 11 項目 全 funnel SQL 追加 + §11 eligible intent 数 gap 明記
  - GPT 1st 補正 5 点全反映 (= telemetry PII / zero reason / toast 文言 / Phase 別頻度 / SQL 正本)
  - CEO 7 固定条件全反映 (= flag OFF / main 反映 / rollout 判断 PR scope / telemetry / coords 2 層 / 詰まり防止 / E2E + canary + rollback)
