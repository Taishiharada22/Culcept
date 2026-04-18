# CoAlter Food — Diagnostics Contract (Phase B Commit 2.5)

**Status**: 契約固定 / Commit 3 以降の監査基準（Audit Contract）
**Date**: 2026-04-19
**Scope**: `lib/coalter/foodOrchestrator.ts`（Commit 3 で新設）が emit する diagnostics / log の仕様固定

本ドキュメントは Commit 3 の実装監査契約書である。ここで固定した分母・分類・非違反の扱いが、Commit 3 で実装される `foodOrchestrator` と `bookingResolver` の正本となる。
実装が本ドキュメントと食い違った場合は、実装側を修正する。ドキュメントを追従させてはならない。

---

## 1. 各 diagnostic の算式と分母

CoAlter food パイプラインは 4 段（search → parse → rank → narration）。各 diagnostic は「どの段で、どの母集合に対してカウントされるか」を固定する。

### 1.1 母集合（分母）の定義

| 名前 | 定義 | 得られる段 |
|---|---|---|
| `rawSearchCandidates` | Web 検索 API が返した raw ヒット総数（URL × title × snippet 単位） | Layer 0（search） |
| `parsedVenues` | `parseFoodVenues` が name gate を通して生成した `ActivityCandidate<FoodVenue>` の件数 | Layer 1（catalog） |
| `rankedCandidates` | `rankFood` の `ranked` 配列長（最大 3、hard filter 通過 + role 割当済み） | Layer 2（rank） |
| `filterTrace` | `rankFood` の `filterTrace` 配列長（= hard filter で drop された件数） | Layer 2（rank） |

不変関係:
```
rawSearchCandidates  ≥  parsedVenues  ≥  parsedVenues - filterTrace.length  ≥  rankedCandidates
```

### 1.2 diagnostic フィールド別 算式と分母

| フィールド | 算式 | 分母 | 出現段 |
|---|---|---|---|
| `rawSearchCandidates` | `input.searchCandidates.length` | — | Layer 0 |
| `parsedVenues` | `catalog.length` (= `parseFoodVenues(raw).length`) | — | Layer 1 |
| `nameGateDropCount` | `rawSearchCandidates - parsedVenues` | `rawSearchCandidates` | Layer 1 |
| `candidateIdDedupDropCount` | parse 内で candidateId 衝突により棄却された件数 | `rawSearchCandidates - nameGateDropCount` | Layer 1 |
| `rankedCount` | `rankOutput.ranked.length` | — | Layer 2 |
| `filterTraceCount` | `rankOutput.filterTrace.length` | — | Layer 2 |
| `hardFilterReasonCounts` | `filterTrace` を reason 別に集計（9 種の Record） | `filterTraceCount` | Layer 2 |
| `missingWhereDropCount` | `filterTrace` で `missing_where` を含む件数 | `filterTraceCount` | Layer 2 |
| `insufficientInfoDropCount` | `filterTrace` で `insufficient_info` を含む件数 | `filterTraceCount` | Layer 2 |
| `avgConfidence` | `filterTrace` 中 `confidence` が付いた drop 件の平均 | `filterTrace` のうち `confidence != null` 件 | Layer 2 |
| `appliedPreset` | `rankOutput.appliedPreset`（文字列） | — | Layer 2 |
| `compromiseActiveCount` | `ranked` 中 `metrics.compromiseQuality > 0` の件数 | `rankedCount` | Layer 2 |
| `noveltyUsedRoleCount` | `ranked` 中 role が `NOVELTY_BLOCKED_ROLES` に含まれない件数 | `rankedCount` | Layer 2 |
| `bookingProviderDistribution` | 5 分類ごとの件数と比率（§2） | `rankedCount` | Layer 3 |
| `ratingMissingCount` | `ranked` 中 `venue.rating == null` の件数 | `rankedCount` | Layer 2 |
| `openingHoursUnknownCount` | `ranked` 中 `venue.openingHours == null` の件数 | `rankedCount` | Layer 2 |

### 1.3 分母固定の意味

監査時は必ず「分子 / 分母」を同じ log 行に出す。比率だけを見ると、母集合の突然の縮小（例：検索が外部要因で 3 件しか返らない）を見落とす。

---

## 2. bookingProviderDistribution（正式採用）

Commit 3 で `bookingResolver` を 5 分類に拡張する。その正本をここで定義する。

### 2.1 5 分類

| コード | 意味 | 判定条件（Commit 3 で実装） |
|---|---|---|
| `official` | 公式予約確定ページ | 公式ドメイン AND URL に `/reserve`, `/booking`, `/reservation`, `/ticket` 等を含む |
| `official_site` | 公式サイトだが予約確定ページでない | 公式ドメイン AND 予約パスなし（top, menu, about 等） |
| `official_reservation_partner` | 公式が採用している予約 SaaS（TableCheck, OpenTable, Toreta 等）への公式導線 | 公式ページからの遷移 or ドメインが公式予約 SaaS ホワイトリスト内 |
| `third_party_listing` | 食べログ / Retty / ぐるなび / ホットペッパー等のリスティング | `KNOWN_FOOD_DOMAINS` 内 AND 上記いずれでもない |
| `unknown` | 5 分類のいずれにも確信を持って振れない | 上記いずれにも合致しない / 判定途中で情報不足 |

**重要**: `unknown` はエラーではない。判定不能な場合の明示的な classification であって、後段の監査や改善の起点となる観測カテゴリである（§3）。

### 2.2 出力フォーマット（件数 + 比率の両方）

割合だけだと母集合の薄さが隠れる。**必ず件数と比率の両方**を出す。

```json
"bookingProviderDistribution": {
  "official":                    { "count": 1, "ratio": 0.333 },
  "official_site":               { "count": 1, "ratio": 0.333 },
  "official_reservation_partner":{ "count": 0, "ratio": 0.000 },
  "third_party_listing":         { "count": 1, "ratio": 0.333 },
  "unknown":                     { "count": 0, "ratio": 0.000 },
  "total":                       3
}
```

- `ratio` は `count / total`、`total == 0` の場合は全 `ratio` を `0` とする（NaN 回避）
- 分母は `rankedCount`（提案として出す 3 件まで）
- `alternatives` は対象外（narration 出力にしか現れないため別指標）

### 2.3 5 分類 × CTA ラベルの対応（narration 側の契約）

Commit 4 で使用するが、ここで先に固定する（narration の挙動を Commit 3 監査時点で検証可能にするため）:

| providerType | 既定 CTA ラベル | confidence 要件 |
|---|---|---|
| `official` | 「公式サイトで予約する」 | high 時のみ予約系ラベル |
| `official_site` | 「公式サイトで確認する」 | medium 以上 |
| `official_reservation_partner` | 「予約サイトで確認する」（提供元名を併記可） | medium 以上 |
| `third_party_listing` | 「{providerName} で見る」（例: 「食べログで見る」） | medium 以上 |
| `unknown` | CTA 非表示 | — |

---

## 3. unknown ≠ violation

**強制原則**: 情報不足による不明状態は、hard filter 違反ではない。

| 状態 | 扱い | 該当 hard filter |
|---|---|---|
| `openingHours` が null（不明） | **hard filter しない**。通す。rating と openingHours を伴わない候補にも機会を与える | `violates_opening_hours` は発火しない |
| `openingHours` が既知 AND brief.timeSlot と明確に重ならない | hard filter する | `violates_opening_hours` |
| `priceBand` が null（不明） | hard filter しない | `violates_budget` は発火しない |
| `priceBand` が既知 AND brief.budget 上限を超える | hard filter する | `violates_budget` |
| `area`/`station` 両方 null | hard filter する（位置情報なしでは提案不能） | `missing_where` |
| `area` が既知 AND brief.area と不一致 | hard filter する | `violates_area` |
| `rating` が null（不明） | 中立値 0.5 を metric に使う（§4） | hard filter しない |
| `providerType` が `unknown` | CTA 非表示（§2.3）だが hard filter しない | — |

**ロジック上の対偶**: `violates_*` と名のつく hard filter は、該当フィールドが「既知 AND 違反」のときだけ発火する。「不明」は常に通す。

### 3.1 openingHours の扱い（明文固定）

- `venue.openingHours == null` → **通す**（`violates_opening_hours` にしない）
- `venue.openingHours` パース不能（形式が `HH:MM-HH:MM` に当てはまらない） → **通す**
- `venue.openingHours` パース可能 AND brief.timeSlot の時間窓と `hoursOverlap() == false` → **drop**（`violates_opening_hours`）

テスト上の固定: `foodRanker.test.ts > 実装ガード #5` 配下。

---

## 4. rating 欠損 → 中立値 0.5

**仕様固定**: `venue.rating == null` の場合、`ratingFit` metric は **0.5**（中立）とする。**0.0 ではない**。

### 4.1 背景

公式サイトは食べログ/Retty/Filmarks のような評価値を持たないことが多い。欠損を 0.0 としてしまうと、

- 公式ドメイン（信頼性は最も高い）が ratingFit で不利になり
- 第三者リスティング（評価値は取れるが確度は low〜medium）が有利になる

これは観測と逆転しており、公式導線を優先したい CoAlter の設計意図に反する。

### 4.2 具体値（実装と一致）

| `venue.rating` | `ratingFit` |
|---|---|
| null（欠損） | 0.5 |
| パース不能文字列 | 0.5 |
| `★3.5` / `3.5` / `3.5点` 等（3.0 〜 5.0 想定） | `(rating - 3.0) / 2.0` を [0, 1] に clamp |
| 3.0 未満 | 0.0 |
| 5.0 超 | 1.0 |

### 4.3 診断との関係

`ratingMissingCount` を別途出しているのは、「中立値 0.5 で通った件数」を観測するため。この件数が高止まりする場合、rating 抽出器の精度改善で得られるリフトが大きいことを示す（Phase B+ 改善の優先度信号）。

---

## 5. 非対象（Phase B+ 改善として外出し）

**Phase B では以下は実装しない**。Commit 3 監査時に「不足」と指摘しないこと。

| 項目 | 理由 | Phase B+ での扱い |
|---|---|---|
| **session 履歴ベース novelty** | Phase B では履歴ストアが未整備。`novelty` は `sourceDomain` 多様性のみの proxy。 | ユーザー単位の既出 venue 記憶と突き合わせ、真の「新規性」を算出する |
| **cross-source dedup** | 同一店舗が食べログ / Retty / 公式の 3 ドメインから並んで出ても、candidateId が異なれば別物として扱う。 | 店舗名 + 位置の fuzzy match で canonical venue 単位に束ねる |
| **fuzzy venue merge** | 表記ゆれ（「鮨 まさ」/「鮨まさ」/「すしまさ」）は現時点で別候補。 | NFKC + 読み仮名変換 + 編集距離で名寄せする |
| **リアルタイム営業状況** | `openingHours` はテキスト抽出のみ、営業中/営業外の動的判定はしない。 | Google Places API 等で「今営業中か」を取得 |
| **価格の通貨・税込/税抜正規化** | `priceBand` は文字列 snapshot。数値化と税抜/税込の統一はしない。 | 正規化テーブル導入 |
| **予約可能枠のリアルタイム問合せ** | `providerType=official` でも「今空いているか」までは判定しない。 | TableCheck/OpenTable API 等との結合 |

これらを Commit 3/4 で実装することは**明示的に scope out**する。

---

## 6. 観測出力の JSON 例

`foodOrchestrator.ts` が emit する `console.info` の 1 ターン分サンプル（Commit 3 実装時にこれと完全一致させる）:

```
[CoAlter] food.diagnostics {"sessionId":"coalter_sess_abc123","rawSearchCandidates":18,"parsedVenues":11,"nameGateDropCount":7,"candidateIdDedupDropCount":2,"rankedCount":3,"filterTraceCount":6,"hardFilterReasonCounts":{"violates_budget":1,"violates_area":0,"violates_cuisine_exclusion":0,"violates_companions":0,"violates_opening_hours":1,"closed_permanently":0,"missing_where":3,"insufficient_info":1,"violates_avoid_keys":0},"missingWhereDropCount":3,"insufficientInfoDropCount":1,"avgConfidence":0.18,"appliedPreset":"balance_focus","compromiseActiveCount":1,"noveltyUsedRoleCount":0,"ratingMissingCount":1,"openingHoursUnknownCount":2,"bookingProviderDistribution":{"official":{"count":1,"ratio":0.333},"official_site":{"count":1,"ratio":0.333},"official_reservation_partner":{"count":0,"ratio":0.000},"third_party_listing":{"count":1,"ratio":0.333},"unknown":{"count":0,"ratio":0.000},"total":3},"latencyMsCatalog":12,"latencyMsRank":8,"latencyMsNarration":1340,"latencyMsTotal":1890}
```

整形した等価な JSON:

```json
{
  "sessionId": "coalter_sess_abc123",

  "rawSearchCandidates": 18,
  "parsedVenues": 11,
  "nameGateDropCount": 7,
  "candidateIdDedupDropCount": 2,

  "rankedCount": 3,
  "filterTraceCount": 6,
  "hardFilterReasonCounts": {
    "violates_budget": 1,
    "violates_area": 0,
    "violates_cuisine_exclusion": 0,
    "violates_companions": 0,
    "violates_opening_hours": 1,
    "closed_permanently": 0,
    "missing_where": 3,
    "insufficient_info": 1,
    "violates_avoid_keys": 0
  },
  "missingWhereDropCount": 3,
  "insufficientInfoDropCount": 1,
  "avgConfidence": 0.18,

  "appliedPreset": "balance_focus",
  "compromiseActiveCount": 1,
  "noveltyUsedRoleCount": 0,

  "ratingMissingCount": 1,
  "openingHoursUnknownCount": 2,

  "bookingProviderDistribution": {
    "official":                     { "count": 1, "ratio": 0.333 },
    "official_site":                { "count": 1, "ratio": 0.333 },
    "official_reservation_partner": { "count": 0, "ratio": 0.000 },
    "third_party_listing":          { "count": 1, "ratio": 0.333 },
    "unknown":                      { "count": 0, "ratio": 0.000 },
    "total": 3
  },

  "latencyMsCatalog": 12,
  "latencyMsRank": 8,
  "latencyMsNarration": 1340,
  "latencyMsTotal": 1890
}
```

### 6.1 ログ監査の読み方

- `rawSearchCandidates - parsedVenues == nameGateDropCount + candidateIdDedupDropCount` を満たすこと（不変条件）
- `missing_where` が `filterTraceCount` の過半なら、検索クエリが「店舗名のみで地名が取れていない」サインなので catalog 段階の抽出改善が先
- `insufficient_info` + `avgConfidence < 0.15` は `confidence` scoring を引き上げるか、検索ソースを多様化するサイン
- `bookingProviderDistribution.unknown.ratio > 0.3` なら bookingResolver の判定ヒューリスティックに穴がある（5 分類のどれかに寄せられるはず）
- `ratingMissingCount / rankedCount == 1.0` が継続する場合、rating 抽出器が公式ドメインだけヒットしている可能性
- `noveltyUsedRoleCount == 0` が続く場合、現在の preset 割当で `adventure/discovery/stimulating` が選ばれにくい。brief 側 preset 選択ロジックを見る

---

## 7. Commit 3 監査時のチェックリスト

このチェックリストが Commit 3 の PR 監査で全て満たされること。

- [ ] `foodOrchestrator.ts` が §6 の JSON shape を完全に emit している
- [ ] §1.2 の分母関係（不変条件）が自動テストで検証されている
- [ ] `bookingResolver` が §2.1 の 5 分類を返せる（型 `BookingProviderType` 更新含む）
- [ ] `bookingProviderDistribution` が件数と比率の両方を持つ（片方だけではない）
- [ ] `total == 0` のとき `ratio` が `0` に落ちる（NaN 回避）
- [ ] `openingHours == null` が `violates_opening_hours` を発火させない回帰テスト
- [ ] `rating == null` 時に `ratingFit == 0.5` が実際に metric に流れていることの回帰テスト
- [ ] `unknown` bookingProvider が CTA 非表示、かつ hard filter にならないことの回帰テスト
- [ ] §5 の非対象項目が Commit 3/4 で実装されていないこと（scope 肥大の防止）

---

## 8. 関連ファイル

- `lib/coalter/foodRanker.ts` — hard filter / metrics 実装（Commit 2 で完了）
- `lib/coalter/foodCatalog.ts` — parseFoodVenues / candidateId（Commit 1 で完了）
- `lib/coalter/types.ts` — FoodMetrics / FoodFilterTrace / BookingProviderType（Commit 1-2 + Commit 3 拡張）
- `lib/coalter/foodOrchestrator.ts` — **Commit 3 で新設**。本ドキュメントの契約を満たす実装
- `lib/coalter/bookingResolver.ts` — **Commit 3 で 5 分類に拡張**
- `lib/coalter/narrationBuilder.ts` — Commit 4 で food template 追加、§2.3 CTA ラベル契約を使う
