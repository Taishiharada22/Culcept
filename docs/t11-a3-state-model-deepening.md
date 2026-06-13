# T11-A3 — 状態モデル深化：潜在構築子 ↔ 観測指標（軸ファミリー）

**作成日**: 2026-06-14 / **ステータス**: **設計のみ・実装なし**（docs-only・CEO プロセス: 設計→監査→承認後 additive 実装）。
**位置づけ**: T11-B/C/D（実装済 `5aec343e`）の状態モデルを **壊さず additive に深化** する設計。[`t11-travel-fit-model-plan.md`](t11-travel-fit-model-plan.md) §3-§4 と [`t11-travel-object-ontology.md`](t11-travel-object-ontology.md) の正統な延長。
**CEO 決裁（2026-06-14）**: 「12軸 TraitVector では不足」「1軸でなく軸ファミリー」の指摘に対し、**統合案＝②多層レジストリ（既存）を土台に L1 trait へ『潜在構築子↔観測指標』の2階層を導入** を採択。
**スコープ**: docs-only。型・rollup 写像の設計のみ。実 API/booking/price 断定/永続化/UI/solver なし（§10）。

---

## §0 一行要約

> ユーザは「静かな旅がいい」と**構築子**で語る。対象は防音・客層・夜の騒がしさ…という**観測指標**を持つ。fit = 指標を**文脈依存 rollup** で構築子スコアに畳み、ユーザ選好と照合し、**valence（静けさ＝価値か退屈か）で符号反転**する。これは Aneurasync の深層観測（回答→潜在 trait）を対象側に適用したもの。

---

## §1 監査結論（誤解の解消 + 2 つの正当な gap）

T11-B/C/D は「12軸 TraitVector で全部を表現」していない。実体は既に多層（[fit-types.ts](../lib/shared/travel/fit-types.ts)）:

| レイヤー | 実体 | 行 |
|---|---|---|
| L1 共有 trait（雰囲気/価値） | **12軸** `SHARED_TRAIT_AXES` | :54 |
| L2 burden / 耐性 | entity 6 + user 6 | :89 :99 |
| L3 role（何として扱うか） | **55軸**（category 別 9+8+8+6+6+8+10） | :138–150 |
| L4 category-rich facet | Onsen/Lodging/Place/Food/Transport/Area/Activity/Support | :330+ |
| L5 hard constraint | 6 + relief 8 | :168 :441 |
| L6 context modifier | FitContext 11 項目 | :230 |
| L7 connection | ConnectionState + AccessLeg/TransferNode/Ordering 4 種 | :270+ |
| L8/L9 provenance / visibility | `Observed<T>` + private/shared 全層貫通 | — |

**判定 = A**（12 は L1 の MVP 代表軸・拡張可能）。構造は CEO ②（多層レジストリ）そのもの。ただし CEO 指摘の 2 点は正しい:
1. **L1 が 12 で M1 24軸 北極星に未到達**。
2. **どの層も「軸」が単層** で、「軸ファミリー（静けさ=音量+防音+客層+夜の騒がしさ+…）」を表現していない。

本書はこの 2 点を、L1 を 2 階層化 + 各層拡充で補正する。

---

## §2 なぜ統合案か（① 弱い / ② 単層 / 統合 = 構築子↔指標）

| 案 | 評価 |
|---|---|
| **① flat 拡張**（静けさ→音量/防音/客層…を兄弟軸化） | **弱い**。指標が 1 構築子の facet だという構造が消失・ユーザに防音を直接聞く羽目・組合せ爆発。CEO も「弱い」。 |
| **② 多層レジストリ（既存）** | 正しい骨格・実装済。だが各層単層・中身が薄い（特に L7）。 |
| **★ 統合**（②土台 + L1 を構築子↔指標 2 階層 + 各層拡充） | **厳密に強い**。下記 §2.1。 |

### §2.1 統合が ①② より強い 5 点
1. **ユーザ選好空間が人間的**（防音と外部騒音を別々に聞かない・構築子 1 つで表明）。
2. **対象は豊かな測定可能指標**を持つ（指標は entity 観測・拡張は indicator 追加のみ）。
3. **rollup が文脈依存**（romance では個室性↑・work では防音/作業性↑＝**状態依存 = 製品の核**）。
4. **指標ごとに独立 confidence/provenance**（一部欠損でも構築子は残 weight 再正規化で動く）。
5. **valence 符号反転を型化**（静けさが rest_to_recover に価値・stimulation_to_recover に退屈＝CEO の核心）。

---

## §3 中核設計：潜在構築子 ↔ 観測指標

### §3.1 型（additive・既存 SharedTraitAxis を内包）

```ts
// 構築子（latent・ユーザが選好を表明する単位）
type ConstructAxis = "tranquility" | "aestheticRefinement" | ... ; // §4 レジストリ（~18）
interface TraitConstruct {
  axis: ConstructAxis;
  userPreference: Observed<number>;     // -1..1（何を望むか）
  importance?: number;                  // 0..2（この構築子の当人重み・default 1）
}

// 指標（entity 観測の sub-dimension・各々 Observed + provenance）
type IndicatorKey = string;             // §4 で構築子別に有限 union 定義
type IndicatorSet = Partial<Record<IndicatorKey, Observed<number>>>;

// 構築子 → 指標 の所属 + rollup 重み（非 opaque・export・文脈依存）
const CONSTRUCT_INDICATORS: Record<ConstructAxis, IndicatorKey[]>;
const ROLLUP_WEIGHTS: Record<ConstructAxis, Partial<Record<IndicatorKey, number>>>;
const CONTEXT_ROLLUP_OVERRIDE: Partial<Record<FitContext["tripIntent"], Partial<Record<ConstructAxis, Partial<Record<IndicatorKey, number>>>>>>;
```

### §3.2 rollup（entity 指標 → 構築子スコア・決定論・文脈依存・非 opaque）

```
constructScore(axis, indicators, ctx) =
  Σ_i  indicator_i · rollupWeight(axis, i, ctx) · confidence_i
  ────────────────────────────────────────────────────────────   ∈ [-1, 1]
  Σ_i  rollupWeight(axis, i, ctx) · confidence_i

rollupWeight(axis, i, ctx) = CONTEXT_ROLLUP_OVERRIDE[ctx.tripIntent]?.[axis]?.[i]
                              ?? ROLLUP_WEIGHTS[axis][i]
```
欠損指標は分母から除外（残 weight 再正規化）。指標が一つも無い構築子は **未観測**（fit から除外し confidence 減算・distance 加算しない）。

### §3.3 valence（符号反転・CEO 核心「価値か退屈か」）

```
valenceMultiplier(user, axis) =
  recoveryStyle = rest_to_recover        →  +1   （静けさ=価値）
  recoveryStyle = stimulation_to_recover →  VALENCE_FLIP[axis]   （tranquility/restorativeValue は退屈=減点）
  mixed                                  →  0.5+0.5·default
VALENCE_FLIP: Record<ConstructAxis, number>   // 退屈化しうる構築子のみ <1（export）
```

### §3.4 constructFit（traitFit の置換・後方互換）

```
constructFit(user, entity, ctx) =
  weightedMean over user.constructs of
    [ match(pref_k, constructScore_k(entity, ctx)) · valenceMultiplier(user, axis_k) ]
  weighted by (importance_k · prefConfidence_k)
match(pref, score) = 1 − |pref − score| / 2     // -1..1 → 0..1
```
**後方互換**: 既存 `SharedTraitAxis`(12) は構築子レジストリの subset として残す。旧 `TraitVector` を渡した場合は「指標を持たない構築子（=直接スコア）」として扱い、現行 traitFit と同値を返す（移行は §9）。

---

## §4 L1 構築子レジストリ（~18・各 indicator family）

> 構築子 = 共有**価値/雰囲気**空間（logistics は L2 burden / purpose は L3 role と分離）。各指標は entity 観測の `Observed<number>`。

### 雰囲気・感覚
| 構築子 | 観測指標 family | valence |
|---|---|---|
| **tranquility**（静けさ） | soundproofing / crowdDensity / conversationEase / privateness / clientele / nightNoise / externalNoise / timeOfDayVariance | ★退屈化（stim user で減点） |
| **stimulationLevel**（活気/刺激） | activityDensity / sensoryIntensity / eventfulness / energyOfPlace | rest user で減点 |
| **spatialOpenness**（開放/こもり） | spaciousness / outdoorConnection / ceilingHeight / seatSpacing | 中立 |
| **sensoryGentleness**（感覚の優しさ） | lightSoftness / olfactoryCalm / surfaceWarmth / noiseFloor | 中立 |

### 美学・価値
| 構築子 | 指標 family | |
|---|---|---|
| **aestheticRefinement**（洗練/素朴） | designQuality / materialQuality / maintenance / curation | rustic 志向で反転 |
| **localAuthenticity**（地元/観光地） | localPatronage / touristDensity / chainVsIndependent / regionalCharacter | |
| **photogenicValue**（映え） | visualDistinctiveness / sceneryQuality / architecturalInterest / lightingForPhotos | |
| **heritageDepth**（歴史/伝統） | age / culturalSignificance / preservation / storytelling | |
| **naturalImmersion**（自然/都市） | greenery / waterPresence / naturalSoundscape / urbanDistance | |

### 学び・体験
| 構築子 | 指標 family | |
|---|---|---|
| **learningDepth**（学び深度） | informationDensity / expertGuidance / interactivity / contextRichness | |
| **experientialIntensity**（体験の濃さ） | engagement / memorability / uniqueness / flowPotential | |

### 社交・関係の手触り
| 構築子 | 指標 family | |
|---|---|---|
| **socialIntimacy**（親密/社交） | privacyForTwo / groupTableAffordance / conversationConducive / sharedExperiencePotential | |
| **serviceWarmth**（接客/放置） | attentiveness / personalAttention / autonomyRespect / intrusiveness(逆) | attentive 嫌い user で反転 |
| **crowdValence**（賑わい/孤独） | peopleDensity × （energizing↔draining は valence で per-user 反転） | ★双方向 |

### 回復・身体価値
| 構築子 | 指標 family | |
|---|---|---|
| **restorativeValue**（回復力） | lowStimulation / comfort / decompression / sensoryGentleness | ★退屈化 |
| **onsenQuality**（温泉質） | springTypeRichness / kakenagashi / bathVariety / scenicBath（**OnsenState を rollup**・§7） | |
| **comfortFamiliarity**（安心/新規） | predictability / knownness / lowRisk / comfortFoodLikeness（Aneurasync「安心の源」） | novelty 志向で反転 |

### 方向
| 構築子 | 指標 family | |
|---|---|---|
| **priceValue**（価格価値） | priceTier(逆) / valueForMoney / splurgeWorthiness | budgetFit と二重計上しない（§10） |

**計**: 18 構築子 × 平均 ~5 指標 ≈ **90 観測指標**。ユーザ選好空間は 18 のまま（人間的）、対象状態は 90 次元（世界最高級の密度）。拡張は指標追加のみ（他層不変）。

---

## §5 L2 burden 構築子（指標分解・既に半分実装済を明示化）

burden も同じ構築子↔指標。既存 `ENTITY_BURDEN_AXES`(6) を構築子に、指標は physicalLoad + ConnectionState 由来:

| burden 構築子 | 観測指標 family |
|---|---|
| **mobilityBurden** | walkingKm / stairs / slope / surfaceRoughness / **firstMile / lastMile(egress×3)** / transferCount / **transferComplexity** / terminalWalk |
| **fatigueBurden** | sustainedLoad / sensoryLoad / energyRequired / waitTime |
| **morningBurden** | earlyDepartureMin / fixedBreakfastTime / preCheckoutRush |
| **crowdBurden** | peakCrowdBands / queueExpected / sensoryDensity |
| **weatherBurden** | outdoorExposure / weatherFragility / shelterAvailability |
| **baggageBurden** | spatialOccupancy / pieces / stairInteraction / dropAffordance(逆) |
| **reliabilityBurden** | **PTI(95%ile/free-flow)** / bufferIndex / missedConnectionRisk / seasonalSuspension |

user 側は per-construct tolerance（既存 6 tolerance を踏襲・effectiveTolerance は FitContext で当日値）。burdenFit = Σ penalty(constructBurden, effectiveTolerance)。

---

## §6 L7 ConnectionState 拡充（CEO「7 項目では不足」に直答・~25 項目）

GTFS / ISO 21902 / FHWA 接地の世界最高級 connection 状態（既存 `ConnectionState` を additive 拡張）:

### leg 構成
- `firstMile { mode(GTFS route_type); timeMin; modeWeight }`
- `mainLeg[] { mode; timeMin; inVehicleKind(in_vehicle/wait/walk/board/alight); seatProbability; scenicValue; workability; sleepability }`
- `lastMile/egress { mode; egressMin; egressWeight(×3); directnessAfterArrival }`

### transfer node（型付き・回数でない）
- `transferType(GTFS 0-5)` / `minTransferMin` / `pathwayMode(GTFS 1-7)` / `levelChange(stairs/escalator/elevator/flat)` / **`signageComplexity`** / **`missedConnectionRisk`** / `accessibilityBarrier`

### terminal
- `kind(security/immigration/check_in/fare_gate/station_walk)` / `overheadMin` / **`queueVariance`**

### baggage
- `pieces` / `spatialOccupancy` / **`dropAffordance(coin_locker/hotel/delivery/none)`** / `droppedState` / `stairInteraction`

### reliability
- **`planningTimeIndex(95%ile/free-flow)`** / `bufferIndex` / `weatherSensitivity` / `seasonalSuspensionRisk`

### egress 特化
- `airportToCenterBurden` / `stationToHotelBurden`

### ordering carrier（4 → **7 種**）
- `must_precede` / `luggage_drop_enables` / `reorderable` / `derive_shortest_from_terminal` / **`timed_entry_lock`** / **`last_departure_lock`（終電・最終便が当日終端を固定）** / **`open_hours_window_lock`**

### accessibility chain
- `stepFreeContinuity(AND 連鎖)` / `levelBoarding` / `assistanceDependency`

### holistic / 逆算
- `doorToDoorTotalBurden`（§4 plan 合成・既存 `doorToDoorBurden`）
- **`arrivalFreshness`（残存エネルギー = 到着後の活動に繰越）**
- **`modeArbiterRanking`（door-to-door でどの mode が勝つか）**
- **`deriveFromOverallPurpose`（全体目的からの逆算: recovery→乗換/egress 最小・exploration→複雑さ許容・work→作業性/座席優先）**
- `costBand`（価格断定なし）

---

## §7 L4 facet → L1 構築子の feed（OnsenState 等の rollup）

category-rich facet（L4）は L1 構築子の**指標供給源**になる。例:
- `OnsenState`（泉質10/泉温/液性/掛け流し confidence/scenicView） → **onsenQuality** 構築子へ rollup（springTypeRichness ← springType、kakenagashi ← circulation、bathVariety ← bathTypes、scenicBath ← scenicView）。
- `FoodRich`（cuisine/format/priceTier/conversationSuitability/comfortFood） → **diningGravity**（L1 拡張候補）・comfortFamiliarity・socialIntimacy へ feed。
- `AreaRich.safetyPerception` → tranquility（nightNoise）・restorativeValue へ feed。

これにより「facet を持つ object は自動的に構築子スコアが立つ」= facet projection（T11-A2 §2）が fit に直結。OnsenState は依然 category 化せず、host(lodging/place/area)の facet として onsenQuality 構築子に射影される。

---

## §8 9 層レジストリ全体像（統合ビュー）

```
L1 共有価値構築子 (18・user 表明)  ←─ 文脈 rollup ─←  L1b 観測指標 (~90・entity)
L2 burden 構築子 (7・user tolerance) ←─ rollup ─←  L2b burden 指標 (physicalLoad + L7 由来)
L3 role/purpose 軸 (55・category 別「何として扱うか」)
L4 category facet (Onsen/Lodging/Place/Food/Transport/Area/Activity/Support・指標供給源)
L5 hard constraint (allergy/accessibility/tattoo/medical/age/reservation・安全側 fail-closed)
L6 context modifier (season/timeOfDay/crowd/weather/fatigue/energy/dayType/budgetRedLine)
L7 connection / route-chain (~25・door-to-door/egress×3/PTI/ordering 7 種/accessibility chain/逆算)
L8 provenance / confidence (指標ごと・source 独立性割引)
L9 visibility (private/shared 二層・全層貫通)
```
構築子↔指標は **L1/L2 に適用する一般パターン**。L4 facet は両者の指標供給源。fit = gate-first（L5→veto floor→bounded compensatory）で全層を合成（T11-B/C/D の deriveFitLabel を踏襲）。

---

## §9 additivity（T11-B/C/D を壊さない・既存 34 テスト維持）

- **新規ファイル `fit-constructs.ts`**（型 + レジストリ + rollup 関数）を追加。`fit-types.ts`/`fit-core.ts` は破壊変更なし。
- `SharedTraitAxis`(12) は構築子レジストリの subset として温存。旧 `TraitVector` 入力は「指標なし構築子（直接スコア）」として現行 traitFit と**同値**を返す互換 path を残す。
- `evaluateFit` は構築子 path を**任意入力**で受ける（未供給なら現行挙動）。既存 34 テストは無改変で green を維持。
- 拡張は 4 手段のみ（T11-A2 §10 と同一）: 新構築子 / 新指標 / 新 facet field / 新 context modifier。すべて additive。

---

## §10 guardrail / 不変条件（T11 と整合）

- **pure・additive・未配線**: 型と決定論写像のみ。実 API/booking/price 断定/永続化/UI/solver なし。
- **非 opaque**: `ROLLUP_WEIGHTS` / `CONTEXT_ROLLUP_OVERRIDE` / `VALENCE_FLIP` / burden 写像を **export**（rollup を隠さない）。
- **provenance**: 指標ごと `Observed<T>`・source は confidence のみに効き構築子スコアの生値を変えない。
- **二重計上回避**: priceValue 構築子 と budgetFit は同一価格信号を二重に減点しない（priceValue は「価格に対する価値」・budgetFit は「予算赤線との距離」・境界を明記）。crowd は crowdValence(L1 価値) と crowdBurden(L2 負荷) で意味分離（既存方針踏襲）。
- **private 非漏洩**: 構築子選好/指標も visibility を持ち、`toSharedFitView` の二層 + 要素削除に組込む（private 構築子は shared rollup から除外）。
- **安全側 fail-closed**: hard constraint（L5）は構築子 rollup の外（veto floor）。未確認の安全 critical は満たさず扱い。
- **authority**: fit は scoring/説明のみ。`authoritative=false` 固定・`hasFitActionAuthority` literal false を維持。

---

## §11 追加 golden tests（T11-D2・既存 34 に additive）

| # | 検証 |
|---|---|
| 1 | **rollup**: tranquility 指標 {防音 0.9 + 客層 0.8 + 夜騒 0.1} → 構築子スコアが指標の文脈重み付き平均に一致（決定論） |
| 2 | **文脈依存 rollup**: 同一指標が tripIntent=work で防音↑・romance で個室性↑（CONTEXT_ROLLUP_OVERRIDE が効く） |
| 3 | **valence 符号反転**: 同一「静かな宿」が rest_to_recover に高 fit・stimulation_to_recover に低 fit |
| 4 | **指標欠損**: tranquility の一部指標欠損 → 残 weight 再正規化（construct 未崩壊）・全欠損 → 未観測扱い（distance 加算しない） |
| 5 | **facet feed**: OnsenState → onsenQuality 構築子スコアが立つ（springType+kakenagashi で上昇） |
| 6 | **後方互換**: 旧 `TraitVector`(12 直接) 入力が現行 traitFit と同値（既存 34 テスト無改変 green） |
| 7 | **ConnectionState 拡充**: arrivalFreshness / PTI / last_departure_lock が door-to-door 評価に反映（広島 + 終電制約） |
| 8 | **provenance**: 指標 source 数差は構築子スコア生値を変えず confidence のみ動かす |
| 9 | **privacy**: private 構築子選好が full に効くが shared rollup に出ない（連続値逆算不能・既存 canary 拡張） |
| 10 | **二重計上回避**: priceValue 構築子と budgetFit が同一価格を二重減点しない |

---

## §12 実装スコープ + CEO 判断請求

| Scope | 内容 |
|---|---|
| **T11-A3** | 本設計書（docs-only・本書） |
| **T11-B2** | `fit-constructs.ts`（ConstructAxis/TraitConstruct/IndicatorSet/CONSTRUCT_INDICATORS/ROLLUP_WEIGHTS/CONTEXT_ROLLUP_OVERRIDE/VALENCE_FLIP・18 構築子 + ~90 指標 + burden 7 + L7 拡充型）。additive・他層不変 |
| **T11-C2** | rollup core（`constructScore`/`constructFit`/`valenceMultiplier`・evaluateFit へ任意 path 統合・後方互換維持） |
| **T11-D2** | §11 の追加 golden tests（10 件）+ 既存 34 維持 |
| **T11-E2** | closeout（decision-log + memory） |

各 scope: pure/additive/未配線/非 opaque/private 非漏洩/no authority。検証: 新規 tests PASS・既存 34 維持・tsc 55 不変・full suite teed・purity/import/runtime importer grep 0。

### CEO 判断請求
1. **構築子レジストリ 18 + 指標 ~90** の粒度で良いか（増減・命名の方向）。
2. **valence 符号反転（静けさ=価値↔退屈）** を recoveryStyle 駆動で型化する方向で良いか。
3. **文脈依存 rollup（tripIntent で指標重み変調）** を入れて良いか（状態依存=製品核）。
4. **ConnectionState ~25 項目拡充**（PTI/arrival freshness/ordering 7 種/逆算）の方向で良いか。
5. 承認後 **T11-B2/C2/D2 bundle 実装** の GO（additive・既存 34 維持）。

実装は CEO 承認まで着手しない。

---

## 出典グラウンディング（T11-A2 と共通 + 追加）

- **潜在構築子↔観測指標** = 心理測定の潜在変数モデル（latent construct ← observed indicators）/ Aneurasync 深層観測（回答→潜在 trait）の対象側適用。
- **GTFS**（route_type / transfer_type 0-5 / pathways 1-7 / wheelchair 3値）: <https://gtfs.org/documentation/schedule/reference/>
- **FHWA Travel Time Reliability**（PTI=95%ile/free-flow・Buffer Index）: <https://ops.fhwa.dot.gov/publications/tt_reliability/ttr_report.htm>
- **ISO 21902:2021**（value-chain アクセシビリティ・step-free continuity）: <https://www.iso.org/standard/72126.html>
- **egress≈access×3 / 待ち×1.7 / 徒歩×1.65 / 乗換≒18分** 不効用重み実証（ITF/OECD・ScienceDirect）。
- 温泉状態（環境省 10 泉質）/ アレルゲン（消費者庁 28・EU14・Codex）は T11-A2 出典に同じ。
