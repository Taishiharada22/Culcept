# B-3c-2 設計提案 — journey_origin promotion rollout 判断 PR

**作成**: 2026-05-03 (Build Unit)
**前提**: PR #70 (B-3c-1 機能実装) merge 済 (`3d7884ca`)、production deploy Ready 確認済
**対象 reviewer**: CEO + GPT
**Status**: 提案 (CEO/GPT 判断履歴 1 回反映済 — §17 参照)

**判断履歴**:
- 1st (2026-05-03 GPT): 5 点補正 → 本 doc に反映済 (= telemetry PII 除去 / zero reason 分離 / toast 文言 / rollout 判断頻度段階別 / dashboard 代替正本明記)

---

## 1. ゴール

production user に journey_origin promotion を **段階的に開放** し、稼働実績に基づいて **expand / hold / rollback** を判断する PR。

**重要 (= CEO 指定)**:
- B-3c-2 は **flag 削除 PR ではない**。flag 削除は B-3c-3。
- B-3c-2 は **global ON にする PR でもない**。staging → canary (allowlist 数 user) → 拡大 → global の段階開放。
- 失敗時の rollback は flag OFF (= env 1 行、数秒) で即座に切り戻し。git revert 不要。

## 2. CEO 7 固定条件 (= merge 後反映)

| # | 条件 | B-3c-2 反映 |
|---|------|-------------|
| 1 | production env で `journeyOriginGrounding` が OFF | ✅ 確認済 (= env 設定不在 = default false) |
| 2 | main HEAD と production/preview deploy state 確認 | ✅ main = `3d7884ca`、production deploy `culcept-b04zuqkq7` Ready (5m duration) |
| 3 | B-3c-2 は rollout 判断 PR (= flag 削除でも global ON でもない) | ✅ §1 に明記、§7 で expand/hold/rollback を判断点として固定 |
| 4 | rollout 判断に必要な telemetry 追加または確認 | ✅ §4 で 5 events を新規 emit (PII 除去版) |
| 5 | coordinates なし候補の presentation 前除外、または UI disabled/error handling 検討 | ✅ §5 で 2 オプション検討 + 採用案 |
| 6 | missing_coordinates 時 activePresentation 維持しつつ詰まらない導線 | ✅ §6 で UI 表示 + 説明テキスト規定 (技術用語回避版) |
| 7 | staging E2E protocol、allowlist、canary、rollback 条件を設計してから flag ON | ✅ §8 staging E2E + §9 canary 拡大 (段階別頻度) + §10 rollback 手順 |

## 3. Scope (= 本 PR で完結させるもの)

| 機能 | 状態 |
|------|------|
| Telemetry emit (= 5 events、PII フリー) | **本 PR で追加** |
| presentation 前 coords filter (= Layer A) | **本 PR で追加** |
| UI disabled/error handling (= Layer B + global hint toast) | **本 PR で追加** |
| zero_candidates internal reason 分離 | **本 PR で追加** |
| staging E2E protocol doc | **本 PR で追加** |
| 観測クエリテンプレート (= dashboard 不在時の正本、Supabase SQL) | **本 PR で追加** |
| canary allowlist の env 設定 | **CEO 別途実施** (= env 追加は AI 自律実行範囲外) |
| flag global ON | **本 PR scope 外** (= rollout 判断点で CEO 実施) |
| flag 削除 | **B-3c-3 (別 PR)** |

### Out of scope (= CEO 明示禁止)

- ❌ flag 削除
- ❌ global ON (= 自律実行禁止、CEO 判断のみ)
- ❌ journey_end (= B-3e)
- ❌ saved_places 連携
- ❌ targetDate / timezone 拡張

## 4. Telemetry (= rollout 判断の核心、5 events、**PII フリー**)

CEO 指定 #1 (GPT 1st 補正) 反映: place name / address / raw label / lat/lng / placeId / raw user text / fingerprint 平文 を **絶対に入れない**。

既存 `trackStargazerEvent` 経由 (= fire-and-forget、Supabase `stargazer_analytics` テーブル persist)。

### 4.1 入れる metric (= 全て enum / count / boolean / hash)

| metric | 型 | 説明 |
|--------|-----|------|
| `targetKind` | enum (`"journey_origin"`) | 将来 journey_end 追加時の分析軸 |
| `flagState` | bool | presentation/selection 時の flag 値 |
| `flagSource` | enum (`"override"\|"allowlist"\|"env_default"`) | flag 解決 source |
| `candidateCountBeforeFilter` | int | Places API 戻り値 raw count |
| `candidateCountAfterFilter` | int | Layer A filter 通過 count |
| `invalidCoordinateCount` | int | filter 除外数 (= API anomaly 検出指標) |
| `accepted` | bool | reducer 受理フラグ (succeeded path のみ true) |
| `rejectReason` | enum (`"missing_coordinates"\|"invalid_state"\|"target_event_mismatch"\|...`) | reject path のみ |
| `segmentGenerated` | bool | rebuild で travel item 生成されたか |
| `activePresentationCleared` | bool | reducer dispatch されたか (= blocked 時 false) |
| `latencyMs` | int | event 別の意味 (= 後述) |
| `labelClassificationToken` | enum (`"public_poi"\|"generic"\|"private"\|"ambiguous"`) | label 種別 (= 平文ではない) |

### 4.2 入れない metric (= GPT 1st 補正、絶対禁止)

- ❌ place name / display name / address (= raw text)
- ❌ raw user input text
- ❌ raw label string
- ❌ lat / lng (= 数値でも位置特定性高い)
- ❌ placeId (= raw form。必要なら hash 化、本 PR では emit しない)
- ❌ fingerprint 平文 (= label を含むため)
- ❌ event_id / session_id raw form (= 既存パターンに従い hash 化されているなら OK)

### 4.3 5 events 詳細

#### `journey_origin_promotion_presented`

journeyAnchorHandoff で presentation が dispatch された時。

```
metadata: {
  schema_version: "2026-05-03",
  target_kind: "journey_origin",
  flag_state: bool,
  flag_source: enum,
  candidate_count_before_filter: int,
  candidate_count_after_filter: int,
  invalid_coordinate_count: int,
  label_classification_token: enum,
  outcome: "presented_from_api" | "presented_from_cache",
}
```

#### `journey_origin_promotion_succeeded`

selection で applied_journey_origin → reducer accepted → plan rebuild 完了時。

```
metadata: {
  schema_version: "2026-05-03",
  target_kind: "journey_origin",
  flag_state: bool,
  flag_source: enum,
  candidate_count: int,           // presented count
  selection_latency_ms: int,      // presentation→selection time
  segment_generated: bool,        // travel item rebuild 結果
  active_presentation_cleared: true,
}
```

#### `journey_origin_promotion_blocked`

selection で blocked_journey_origin (= GPT 2nd 補正対象、coordinates 不正)。

```
metadata: {
  schema_version: "2026-05-03",
  target_kind: "journey_origin",
  flag_state: bool,
  flag_source: enum,
  candidate_count: int,
  reject_reason: "missing_coordinates" | "invalid_state",
  active_presentation_cleared: false,  // 半壊 UX 防止確認用
}
```

#### `journey_origin_promotion_provider_failure`

journeyAnchorHandoff 内 Places API failure。

```
metadata: {
  schema_version: "2026-05-03",
  target_kind: "journey_origin",
  log_class: enum,         // classifyProviderErrorForLog 既存
  reason: enum,            // PlacesHandoffResult provider_error reason
  flag_state: bool,
  flag_source: enum,
}
```

#### `journey_origin_promotion_zero_candidates`

候補ゼロ outcome。**GPT 1st 補正反映: zero_reason を 2 種に分離**。

```
metadata: {
  schema_version: "2026-05-03",
  target_kind: "journey_origin",
  flag_state: bool,
  flag_source: enum,
  zero_reason:
    | "no_candidates_from_places_search"      // Places API 0 件
    | "no_coordinate_candidates_after_filter", // Places API は返したが Layer A 全除外
  candidate_count_before_filter: int,
  candidate_count_after_filter: 0,
}
```

(= 補足) `journey_origin_promotion_cancelled` 案は本 PR では 削除。理由: client-side cancel signal の検出は別 work item (= cancel hooking が既存実装にない)。代替に `succeeded` / `blocked` 比率と `presented` 数の差分で間接観測可能。

### 4.4 算出可能な比率 (= CEO 判断 input)

```
selection_success_rate
  = succeeded / (succeeded + blocked + zero_after_filter + provider_failure)

missing_coordinates_block_rate
  = blocked(missing_coordinates) / (succeeded + blocked)

invalid_coordinate_filter_rate
  = sum(invalid_coordinate_count) / sum(candidate_count_before_filter)
  // = Places API が invalid coords を返す比率 (= API health 指標)

zero_after_filter_rate
  = zero_candidates(no_coordinate_candidates_after_filter)
    / zero_candidates(total)
  // = Layer A が「全候補除外」発動した割合

provider_failure_rate
  = provider_failure / presented

travel_segment_generation_rate
  = segment_generated_true / succeeded
```

### 4.5 閾値 (= CEO 判断目安、調整可)

| 指標 | 警戒値 | rollback 推奨閾値 |
|------|--------|-------------------|
| selection_success_rate | < 0.7 | < 0.5 |
| missing_coordinates_block_rate | > 0.05 | > 0.15 |
| invalid_coordinate_filter_rate | > 0.10 | > 0.30 (= API anomaly) |
| zero_after_filter_rate | > 0.30 | > 0.50 (= Layer A 過敏) |
| provider_failure_rate | > 0.10 | > 0.25 |

これらは **目安** であり、CEO が最終判断する。

## 5. Coordinates なし候補の presentation 前除外 (= CEO 指定 #5)

### 現状 (= B-3c-1 後)

- `NormalizedPlaceCandidate.coordinates` は型上 required (`GeoCoordinates`)
- runtime で NaN / Infinity / 範囲外 / null が混入する可能性 (= JSON deser、Places API anomaly)
- `promoteJourneyOrigin` は runtime defense として `isValidCoordinate` で blocked → reject

### 問題

presentation 段階では候補が表示されているのに、selection で blocked → 「選んだのに何も起きない」(= 半壊 UX) が発生する。

### 採用案 (= 2 層防御)

**Layer A — presentation 前 filter (= journeyAnchorHandoffOrchestrator で実装)**:
- Places API 戻り値を `isValidCoordinate` で filter
- 全候補 invalid → `journey_origin_promotion_zero_candidates` (zero_reason: `no_coordinate_candidates_after_filter`) emit + UI は既存 zero path
- 一部 invalid → invalid 候補のみ除外、残りで presentation
- emit: `invalid_coordinate_count` (= 監視用)

**Layer B — UI candidate-level disabled (= PlaceCandidatePicker で実装)**:
- candidate に `validCoordinates: boolean` field 追加 (= 既存 type 拡張、optional default true)
- false の候補は disabled + tooltip
- B-3c-1 の `disabledTargetKinds` props と同じ pattern

### 二層採用理由

- Layer A だけだと、Places API が SDK バグで invalid を返した時 user に見えなくなり debug 困難
- Layer B だけだと、user が「使えない候補」を見てしまい UX 低下
- 両方 → 通常時は Layer A で除去、稀に Layer A をすり抜けても Layer B で disabled

## 6. missing_coordinates 時の UI 導線 (= CEO 指定 #6、GPT 1st 補正反映)

### 必要な体験

1. user が候補 click → blocked
2. activePresentation 維持 (= picker は表示されたまま、必須 #2)
3. user に「この候補は無効、別を選ぶか場所を具体的に」とフィードバック
4. user は別候補 / 場所を具体化 / cancel から選択

### 実装 (= 本 PR で追加)

- selection route response の reject reason `journey_anchor_promotion_not_possible` を client が受信
- AlterClient で reason を見て toast 表示

**Toast 文言 (= GPT 1st 補正、技術用語回避)**:

```
この候補は移動に必要な位置情報が不足しています。
別の候補を選ぶか、場所をもう少し具体的に教えてください。
```

- toast は 4-5 秒 auto-dismiss + 候補 picker は維持
- §5 Layer B が機能していれば user は最初から disabled の候補を click できないため通常起きない (= defense in depth)

### Out of scope (= 本 PR でやらない)

- 全候補 blocked 時の UX (= 通常 zero_candidates として既存 path)
- candidate を skip して journey_origin clarify に戻る復旧経路 (= B-3d 候補)

## 7. CEO 判断点 (= expand / hold / rollback)

rollout 判断は **CEO の最終判断**。AI は telemetry 数値を提示するのみ。

| 判断 | trigger | next action |
|------|---------|-------------|
| **expand** | Phase 期間内 全閾値 OK + 質的に問題なし | 次 Phase へ → allowlist 拡大 (= env 更新は CEO) |
| **hold** | 一部閾値 警戒値超過、ただし rollback 閾値未達 | 同 Phase 維持 → 原因調査、必要なら fix PR |
| **rollback** | rollback 閾値超過 OR critical bug 発見 | flag OFF (= env で `ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING=false` 即時反映、§10 詳細) |

判断頻度は §9 で Phase 別に固定 (= GPT 1st 補正反映)。

## 8. Staging E2E Protocol (= CEO 指定 #7、Step A 検証)

### 前提

- staging env (= preview deploy) に `ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING=true` を設定
  - または `ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING_ALLOWLIST=<userId>` で CEO のみ ON
- staging user 1 名 (= CEO 自身) で E2E

### シナリオ #1: Happy path

1. CEO が「明日 8 時東京駅から渋谷へ」と入力
2. Alter が origin clarify presentation を返す (= candidates [東京駅丸の内口 / 八重洲口 / ...])
3. CEO が「丸の内口」を click
4. **期待**: plan card 上部 journeyOrigin label = 「東京駅丸の内口」、travel item from = 「東京駅丸の内口」
5. CEO が次に「池袋に行きたい」を追加
6. **期待**: 次 turn でも journey_origin label と travel from が一致 (= 半壊 UX なし)
7. **観測**: `journey_origin_promotion_presented` + `journey_origin_promotion_succeeded` 両方 emit (Supabase で確認)

### シナリオ #2: Coordinates 不正候補 (= test 用 fixture で人工的に再現)

- staging で provider mock を入れ、1 候補に `lat: NaN` を設定
- §5 Layer A で除外される → presentation には現れない → `invalid_coordinate_count: 1` で emit
- (Layer A 失敗想定で) Layer B で disabled 表示確認

### シナリオ #3: 全候補 zero (Places API 由来)

1. CEO が「明日 8 時 hogeholgehogeから渋谷へ」と入力 (= invalid 地名)
2. **期待**: zero_candidates 経路、「該当する場所が見つかりませんでした」表示
3. **観測**: `journey_origin_promotion_zero_candidates` emit、`zero_reason: no_candidates_from_places_search`

### シナリオ #4: cancel 経路

1. CEO が「ホテルから」と入力 → ambiguous 分類で skip (= 既存 PR #69 動作)
2. **期待**: presentation 出ない、別 path で clarify

### シナリオ #5: blocked → 別候補選び直し (= GPT 2nd 補正の体験検証)

1. provider mock で全候補のうち 1 つに invalid coords 設定
2. CEO が invalid 候補を click (= Layer B disabled でも click 可能性想定、または直接 endpoint 叩く)
3. **期待**: toast 表示「この候補は移動に必要な…」、picker は閉じない、journeyOrigin 不変
4. CEO が別 (valid) 候補を click → promotion 成功

### Pass 条件

- シナリオ #1-#5 全てで期待挙動
- console error なし
- network tab で全 5 events emit
- Supabase `stargazer_analytics` で events が persist 確認

## 9. Canary 拡大判断 (= CEO 指定 #7、GPT 1st 補正で頻度調整)

| Phase | allowlist size | 観測頻度 (= GPT 1st 補正) | 期間 | 拡大条件 |
|-------|----------------|---------------------------|------|----------|
| 0 | 0 user (= staging のみ) | **実行ごと** | 即時 | §8 全シナリオ Pass |
| 1 | 1-3 user (= CEO + 知人 1-2) | **初日 / 翌日 / その後 24h ごと** | 3-7 日 | 全閾値 警戒値内 |
| 2 | 5-10 user (= 招待制初期検証) | **24-48 時間ごと** | 1-2 週間 | 全閾値 警戒値内、user feedback 否定的でない |
| 3 | global 候補 (= env で `ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING=true`) | **週次 standup** | — | Phase 2 全条件 + CEO 最終承認 + 24h Phase 3 観測 |

allowlist 設定は env 編集 = AI 自律実行範囲外 → CEO 実施。
**重要**: B-3c-2 は Phase 0 完了までを scope とし、Phase 1 以降は CEO 判断ベースで進む。

## 10. Rollback 条件 + 手順 (= CEO 指定 #7)

### Rollback 即時実施条件

- §4.5 rollback 推奨閾値 超過
- production critical bug (= 既存 user 影響、既存 event_where 経路退行)
- security 問題 (= 想定外、defense in depth として記載)
- CEO 判断 (= 数値外の理由でも CEO は OFF にできる)

### Rollback 手順

1. Vercel env で `ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING_ALLOWLIST` を空に or 全削除
2. (global ON 後の場合) `ALTER_MORNING_JOURNEY_ORIGIN_GROUNDING=false` に
3. Vercel 自動 deploy 完了 (= 数分)、または production redeploy
4. 全 user で flag OFF → 既存 reject 経路に戻る (= 既存 event_where 完全不変)
5. selection route が `not_implemented_journey_anchor_promotion` を返す → client は選択不可 (= B-3c-1 前と同等)

**重要**: rollback は env 操作のみ。code 変更不要。git revert より速い。

## 11. dashboard 不在時の観測手段 (= CEO 指定 #5、GPT 1st 補正必須)

admin dashboard 統合は別 PR とするが、**B-3c-2 完了時点で CEO が数値を見て判断できる正本** が必要。

### 採用正本: Supabase SQL クエリ

`stargazer_analytics` テーブルへの直接 SQL クエリを正本とする (= 既存 telemetry の persist 先)。

### 観測クエリテンプレート (= 本 PR doc に同梱、`docs/alter-morning-b3c2-rollout-protocol.md` に記載)

```sql
-- 過去 24 時間の selection_success_rate
SELECT
  COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_succeeded') AS succeeded,
  COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_blocked') AS blocked,
  COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_zero_candidates') AS zero_cand,
  COUNT(*) FILTER (WHERE event = 'journey_origin_promotion_provider_failure') AS provider_fail,
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
FROM stargazer_analytics
WHERE event LIKE 'journey_origin_promotion_%'
  AND created_at > now() - interval '24 hours';

-- missing_coordinates_block_rate
SELECT
  COUNT(*) FILTER (
    WHERE event = 'journey_origin_promotion_blocked'
      AND metadata->>'reject_reason' = 'missing_coordinates'
  )::numeric
  / NULLIF(COUNT(*), 0) AS missing_coords_rate
FROM stargazer_analytics
WHERE event IN (
  'journey_origin_promotion_succeeded',
  'journey_origin_promotion_blocked'
)
  AND created_at > now() - interval '24 hours';

-- zero_after_filter_rate (= Layer A 発動率)
SELECT
  COUNT(*) FILTER (
    WHERE metadata->>'zero_reason' = 'no_coordinate_candidates_after_filter'
  )::numeric
  / NULLIF(COUNT(*), 0) AS zero_after_filter_rate
FROM stargazer_analytics
WHERE event = 'journey_origin_promotion_zero_candidates'
  AND created_at > now() - interval '24 hours';

-- raw event log (= debug / 個別 trace)
SELECT created_at, user_id, event, metadata
FROM stargazer_analytics
WHERE event LIKE 'journey_origin_promotion_%'
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC
LIMIT 100;
```

### 補助観測

- **Vercel logs**: `console.info('[journey-origin-grounding:...')` の structured log (= B-3b'-2 Commit 4 で追加済)
- **Sentry**: 想定外例外 (= 全 try/catch でログ出してるので Sentry に流れる、既存 setup 流用)

### admin dashboard 統合は別 PR

dashboard UI 化は B-3c-2 後の別 PR (= scope creep 防止)。
B-3c-2 完了時点では SQL クエリ + Vercel logs で十分。

## 12. 変更ファイル一覧 (= 本 PR、推定)

| File | 変更 | 推定 LOC |
|------|------|----------|
| `lib/alter-morning/search/journeyAnchorHandoffOrchestrator.ts` | Layer A coords filter 追加 + zero_reason 分離 | +50 |
| `lib/alter-morning/search/normalizedPlace.ts` | NormalizedPlaceCandidate に `validCoordinates?: boolean` field 追加 (= optional default true) | +10 |
| `components/alter-morning/PlaceCandidatePicker.tsx` | Layer B candidate-level disabled (= validCoordinates false で disabled + tooltip) | +30 |
| `app/api/stargazer/alter/route.ts` | journey_origin presentation 時 telemetry emit (5 events 中 presented / zero_candidates / provider_failure) | +60 |
| `app/api/stargazer/alter/selection/route.ts` | succeeded / blocked telemetry emit | +50 |
| `app/AlterClient.tsx` (or 相当) | reject reason 受信時 toast 表示 | +25 |
| `lib/alter-morning/search/normalizedPlace.ts` | 既存 types 拡張 (= validCoordinates field) | (上記 +10 に含む) |
| `docs/alter-morning-b3c2-rollout-protocol.md` | staging E2E + canary 判断 + SQL クエリ doc | +250 |
| tests | telemetry emit / Layer A / Layer B unit & integration | +250 |

合計推定: **+225 production / +250 doc / +250 tests** = 約 **725 LOC** (CEO 限度 900 の 81%)

## 13. risk register

| Risk | 確率 | 影響 | 緩和 |
|------|------|------|------|
| Telemetry に PII 混入 | 低 | 高 (= privacy violation) | §4.2 禁止リスト + reviewer + integration test (= metadata に raw label が含まれない assertion) |
| Layer A filter で valid candidate を誤って除外 | 低 | 中 (= 候補が減る、UX) | unit test で boundary case (= 0,0 / 90,180) carve-out |
| Telemetry emit が plan rebuild を block | 低 | 中 | fire-and-forget pattern (既存と一貫)、await しない |
| Toast 表示が他の UI と干渉 | 低 | 低 | 既存 toast system 流用 (= 新規 UI element 追加しない) |
| SQL クエリが CEO に難解 | 中 | 中 | §11 テンプレート + Supabase Studio で coexist 確認、必要なら GUI 補助 PR |
| canary user が想定外バグ報告 | 低 | 低 (= 数 user) | rollback 即時実施、原因調査、fix PR |

## 14. CEO/GPT 確認論点 (= 本 PR の判断ポイント)

### Q1: Telemetry event 名規約 (= 1st 確定)
**確定**: `journey_origin_promotion_*` prefix
**根拠**: 既存 transport_v2 events と並列、journey_end は将来 `journey_end_promotion_*` で並列拡張可

### Q2: Layer A の zero_candidates 扱い (= 1st 補正)
**確定**: UI は既存 zero path、internal reason は分離
- `no_candidates_from_places_search`: Places API 自体が 0 件
- `no_coordinate_candidates_after_filter`: Places API は返したが Layer A 全除外
**根拠 (GPT 1st 補正)**: rollout 判断上の意味が完全に違う、混ぜると診断不能

### Q3: Toast 文言 (= 1st 補正)
**確定**:「この候補は移動に必要な位置情報が不足しています。別の候補を選ぶか、場所をもう少し具体的に教えてください。」
**根拠 (GPT 1st 補正)**: `coordinates` 等技術語回避、復旧経路 2 つ提示

### Q4: rollout 判断頻度 (= 1st 補正)
**確定**: Phase 別頻度 (= §9)
- Phase 0 staging: 実行ごと
- Phase 1 (1-3 user): 初日/翌日/24h ごと
- Phase 2 (5-10 user): 24-48h ごと
- Phase 3 (global 候補): 週次
**根拠 (GPT 1st 補正)**: 初期 canary では問題発覚が遅延すると rollback タイミングを逃す

### Q5: dashboard 不在時の観測正本 (= 1st 補正)
**確定**: Supabase `stargazer_analytics` への直接 SQL クエリを正本とする
**補助**: Vercel logs (= console.info structured) + Sentry (= 例外)
**Out of scope**: admin dashboard UI 統合 (= 別 PR)
**根拠 (GPT 1st 補正)**: dashboard なしでも rollout 判断が必須、SQL は既存 stack で十分

## 15. 想定スケジュール

- **D+0 (今日)**: 本 doc 2 度目 CEO/GPT 判断 (= 5 点補正反映後)
- **D+1**: 判断 OK なら B-3c-2 着手 (= 5-7 commits、推定 6-8 時間)
- **D+2**: B-3c-2 PR 提出
- **D+2-3**: PR review + merge
- **D+3-5**: §8 staging E2E (CEO 担当)
- **D+5-12**: §9 canary Phase 1-2
- **D+12-14**: rollout 判断 (= expand → global ON、または hold/rollback)
- **D+14+**: B-3c-3 (= flag 削除専用 PR) 着手検討

## 16. 開閉 token

本 doc は **提案** であり実装ではない。CEO/GPT 判断が出るまで:
- ✋ コードに触らない
- ✋ B-3c-2 branch を切らない
- ✋ B-3c-2 の test を書かない
- ✋ doc commit/PR 化しない

判断後の対応:
- ✅ 「OK」 → §12 commit 構成で B-3c-2 着手
- ✏ 「修正要」 → §17 で判断履歴更新 → 再判断
- 🚫 「reject」 → 別アプローチ提案

### 17. 判断履歴

#### 1st (2026-05-03 GPT、本 doc 反映済)

5 点補正:
- **#1 Telemetry privacy**: PII (place name / address / raw label / lat/lng / placeId / raw user text) を入れない → §4.2 禁止リスト追加、§4.3 から `fingerprint` 削除、`label_classification_token` enum 化
- **#2 zero_candidates reason 分離**: `no_candidates_from_places_search` / `no_coordinate_candidates_after_filter` → §4.3 `journey_origin_promotion_zero_candidates` event の `zero_reason` field、§5 Layer A の zero outcome 分岐
- **#3 Toast 文言**: 技術用語回避 → §6 で「移動に必要な位置情報が不足」採用
- **#4 Rollout 判断頻度**: Phase 別頻度 → §9 表の観測頻度欄に Phase 0 「実行ごと」 / Phase 1 「初日翌日24h」 / Phase 2 「24-48h」 / Phase 3 「週次」
- **#5 Dashboard 代替正本**: Supabase SQL を正本明記 → §11 新章追加 (= SQL クエリテンプレート 4 種)

CEO 追加 exclusion (= §3 Out of scope に明記):
- flag 削除 / global ON / journey_end / saved_places / targetDate-timezone を扱わない
- B-3c-2 は rollout 判断準備 PR、global rollout PR ではない
