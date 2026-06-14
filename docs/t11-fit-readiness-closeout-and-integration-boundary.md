# T11 Fit / Readiness Closeout + Integration Boundary（純 logic 境界の凍結・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **closeout + boundary 計画のみ・実装なし**（docs-only）。
**目的**: UI / CoAlter / Plan Intelligence / Travel runtime / M2 runtime / route API / weather API / solver / booking が
この純 logic を呼び始める**前に**、現在の境界（入口・authoritative・projection・runtime gate・safety invariant）を
**チェックポイントとして凍結**する。以後の統合で「守ってきた境界」が崩れないための単一参照点。
**スコープ**: コード変更なし。本書は次フェーズ候補の比較と推奨までで停止する。

---

## §1 Closeout summary（T11 系の到達点）

| Phase | 成果 | 主成果物 |
|---|---|---|
| **T11-A2** ontology | Unified StateEntity（user/entity が TraitVector 空間を共有・category は Identity field・7 Layer0 category・onsen=host-agnostic facet・connection=関係層） | `docs/` 設計 + `fit-types.ts` |
| **T11-A3.1** maximum state registry | 18×90 を天井にしない construct↔indicator latent model の上限設計（採用案 A+D） | 設計 |
| **T11-B/C/D** fit model | gate-first 2-stage `deriveFitLabel`（非補償 veto floor → affinity×comfortGate）・6 component・EntityFitGrade 5 値 | `fit-core.ts` |
| **T11.1** axis/state audit | 軸/状態の defined→stored→returned→consumed→rendered 整合監査 | 監査 docs |
| **T11-B2/C2/D2** construct registry | typed as-const registry（14 family・113 construct・700 indicator・`IndicatorKey` 派生・`ExtIndicatorSpec` escape hatch・string indicator 排除） | `fit-constructs.ts` |
| **T11-C3** construct rollup | construct→component の rollup（ROLLUP_WEIGHTS / CONTEXT_ROLLUP_OVERRIDE）・two-layer privacy（valueFull/valueShared+availableShared） | `fit-constructs-core.ts` |
| **T11-C4** interaction / veto | typed InteractionTerm（combiner-kind/scope/min-confidence/modifier-never-new-score）・night_safety/baggage_stairs_crowd/rain_outdoor_fallback・safety-missing→labelCap | `fit-constructs(-core).ts` |
| **T11-C5** ConnectionState 深化 | door-to-door burden（transfer/terminal/queue/reliability PTI）・derived provenance `derived_from_connection_state` | `fit-core.ts` |
| **T11-C5.1** route aggregate 修正 | walkingLoad 過積載の semantic 修正 → `routeChainBurden` 集約 construct 新設・total→routeChainBurden・walkingLoad は walking-only | `fit-constructs.ts` |
| **T11-C6** hotelDrop / earlyMorning | hotelDropPolicy（明示 droppedState ≠ ordering 単独 relief）・earlyMorning（sleepDebt 推論なし・explicit todayFatigueSpike のみ） | `fit-constructs-core.ts` |
| **T11-C6.1** lastDeparture strand | last_departure_lock × 高 delay → strand risk/labelCap/question（**burdenFit 不修飾**・delayRisk≠PTI 分離） | `fit-constructs-core.ts` |
| **T11-C7** cancelWeather readiness handoff | weather 不確実 × 取消不能 commitment を **fit でなく T6 readiness** で扱う（`weather_reversal_uncertainty` / `assessCancelWeatherRisk`）。**fit-core 非 producer** | `readiness-types/core.ts` |

T11 系を貫く invariant: pure logic / additive / presence-gated（入力なし→legacy 挙動不変）/ tsc baseline 55 / 既存 test green / no new parallel score component / `hasFitActionAuthority` literal false / two-layer privacy / non-opaque（weight/threshold export）/ no hallucination / safety-critical missing は fail-closed。

---

## §2 Current pure engine layer map（どこからどこまでが各層か）

★ 全 20 ファイル・6833 行・**app/components から import 0（完全未配線）**。2 つの pure subsystem に分かれる。

### (a) Decision chain（T2→T9）— 「合意形成と次の一手」
| T | ファイル | 入口（authoritative） | shared 射影 |
|---|---|---|---|
| T2 | `slot-normalizer.ts` (slot-types) | `normalizeSlots` | `toSharedProjection` |
| T3 | `proposal-builder.ts` (proposal-types) | `buildProposals` | `toSharedProposalView` |
| T4 | `proposal-comparator.ts` (proposal-comparison-types) | `compareProposals` | `toSharedComparisonView` |
| T5 | `decision-core.ts` (decision-types) | `decide` | `toSharedDecisionView` |
| **T6** | `readiness-core.ts` (readiness-types) | `assessReadiness` / `hasActionAuthority` **+C7 `assessCancelWeatherRisk`** | `toSharedReadinessView` |
| T7 | `contingency-core.ts` (contingency-types) | `planContingencies` / `hasContingencyActionAuthority` | `toSharedContingencyView` |
| T8 | `packet-core.ts` (packet-types) | `buildPlanDecisionPacket` | `buildSharedPacketView` / `buildViewerPacketView` |
| **T9** | `engine.ts` (engine-types) | **`runTravelPlanEngine`（単一 facade・T3→T8 を compose）** | output に shared/viewer packet 同梱 |

### (b) Fit Model（T11）— 「この対象は自分に合うか・どれだけ重いか」
| 層 | ファイル | 入口 | 射影 / 権限 |
|---|---|---|---|
| Fit types | `fit-types.ts` (749) | 型のみ | — |
| Fit core | `fit-core.ts` (1226) | `evaluateFit` / `evaluateFitBatch` / `aggregateGroupFit` / `deriveFitLabel` | `toSharedFitView` / **`hasFitActionAuthority` = literal `false`** |
| Construct registry | `fit-constructs.ts` (442) | as-const registry（113 construct/700 indicator/15 interaction） | — |
| Construct/interaction core | `fit-constructs-core.ts` (640) | `computeConstructBlend` / `runInteractions` / `applyCap` / `strandRisk` / `hotelDropPolicy` | — |

### (c) After-action（T10）— 「旅行後 → 次回入力デルタ」（**chain の外・別サイクル**）
| 層 | ファイル | 入口 | 性質 |
|---|---|---|---|
| T10 | `after-action-core.ts` (after-action-types) | `RegretToConstraintTransform`（regret→constraint） | soft/低 confidence/decay-ttl 既定・hard は explicit/severe/反復のみ・**永続化なし** |

★ **最重要構造事実**: **(a) Decision chain と (b) Fit Model は現在 1 度も合成されていない**。
`engine.ts` は `fit-*` を import しない（検証済み: grep NONE）。Fit は T9 の外にある独立 pure subsystem。
これが §4 の中心問題。

---

## §3 Authoritative vs Projection 境界（display-only / 決して権限を与えない）

権限境界は全層で**一様に**実装されている（T6.1/T7.1/T8 継承）:

| 出力 | authoritative | executionAuthority | 用途 |
|---|---|---|---|
| `FitResult`（evaluateFit） | **常に false** | — | fit は match の評価のみ。**`hasFitActionAuthority` は型レベルで `false` を返す**（`fit-core.ts:1221`） |
| `toSharedFitView(FitResult)` | false | — | display・private 入力は full に効くが shared に出さない（deep-equal canary） |
| `ReadinessResult`（assessReadiness） | **true** | — | schedule/reserve/book 可否の正本。`hasActionAuthority` = authoritative && ready_to_propose && 確認 0 |
| `toSharedReadinessView` | **false** | — | display 専用。private 確認を隠した ready が**実行権限に化けない**（C7 で riskFlags 射影も visibility 由来に強化） |
| `PlanDecisionPacket`（build） | **true** | `nextAction===propose_plan && hasActionAuthority(rd) && hasContingencyActionAuthority(ct)` のときのみ true | engine output の正本 |
| `buildSharedPacketView` / `buildViewerPacketView` | **false** | **構造的に false** | display 専用。各層の shared 射影から**組み立て直す**ため private confirmation/contingency は存在ごと消える |

**never grant action authority（不変）**:
- Fit は**いかなる経路でも**実行権限を産まない（literal false）。
- shared/viewer 射影（fit/readiness/packet すべて）は authoritative=false・executionAuthority=false。
- C7 の `weather_reversal_uncertainty` 確認 → readiness needs_confirmation → packet nextAction=confirm → **executionAuthority=false**（cancelWeather が予約権限を止める経路は packet まで一貫）。

---

## §4 Integration boundary（将来 consume してよい / 直接呼んではいけない）

### 4.1 consume してよいもの
- **UI / CoAlter / Plan Intelligence は T9 `runTravelPlanEngine` の output（packet）を consume する**（`engine-types.ts` の設計意図通り）。
- 表示は **shared / viewer packet** を使う。**authoritative packet は実行権限判定にのみ**使い、display に流さない。
- Fit の説明を見せる場合は **`toSharedFitView` の結果のみ**（full FitResult を UI に渡さない）。

### 4.2 直接呼んではいけないもの
- UI/CoAlter が `buildProposals` / `compareProposals` / `decide` / `assessReadiness` / `evaluateFit` を**個別に直接**呼ぶこと（中間層の直叩きは権限境界と fail-closed 伝播を壊す）。
- shared/viewer 射影を authoritative downstream の**入力**に使うこと（`engine.ts:13` の禁則）。

### 4.3 T9 を単一入口にすべきか → **Yes（条件付き）**
- Decision chain（T2–T8）は T9 を**唯一の入口**にするのが正しい（既に facade 完成）。
- **ただし Fit Model は現在 T9 の外**。よって T9 を「真の単一入口」にするには **Fit を T9 に compose する設計が別途必要**（§4.5）。それまでは T9（合意/可否）と Fit（適合度）は **2 入口**であることを明示し、UI/CoAlter には「可否は T9・適合度は toSharedFitView」と二分して渡す。

### 4.4 Readiness は T9 の後に合成すべきか / orchestrator の中か → **既に T9 の中（正しい）**
- `assessReadiness` は `engine.ts:33` で **T9 内部に compose 済み**。readiness を T9 の外で後付けする必要はない。
- 新しい上位 orchestrator は不要。**T9 が orchestrator**。将来 Fit を足す場合も T9 の内側で compose する（外側に第 2 orchestrator を作らない）。

### 4.5 cancelWeather evidence を将来どう供給するか（fit-core に産ませない）
現状の gap（検証済み）: `TravelPlanEngineInput` に `cancelWeather` field が無く、`engine.ts:33` の `assessReadiness` 呼び出しは `policy` のみ。将来の正しい配線（**実装は別 GO**）:
1. `TravelPlanEngineInput` に `cancelWeather?: CancelWeatherEvidence` を additive 追加。
2. `engine.ts` の `assessReadiness({ decision, selected, policy, cancelWeather: input.cancelWeather })` に thread。
3. evidence の出所は **fit-core ではない**。entity/route の純データ（weatherVulnerability/cancellationFlexibility 等）を組み立てる **専用 pure adapter**（fit scoring ではない単純写像）が供給する。fit-core は引き続き producer にしない。
4. これにより cancelWeather は readiness-facing のまま packet confirmationQueue に乗り、executionAuthority を正しく gate する。

### 4.6 Fit ↔ Decision chain の合成方針（推奨・設計のみ）
- Fit は **T3 proposal ranking / T4 comparison への scoring 入力**として合成するのが自然（候補の適合度・burden を比較に効かせる）。**並列の第 2 output にしない**（packet が単一 output である原則を守る）。
- 合成は **pure adapter**（FitResult.valueShared 群 → comparison が読める形）で行い、fit の two-layer privacy / literal-false authority を保持する。
- これは次フェーズの設計対象（§7 Option A）。本 closeout では**凍結のみ**。

---

## §5 Runtime gate list（各々が独立した明示 GO・closeout で凍結）

以下は**すべて未実装・各々が個別の CEO/GPT GO を要する**。closeout 時点で 1 つも超えていない:

| Gate | 状態 | 凍結事項 |
|---|---|---|
| M2 runtime personalization | **未** | 特権 runtime 流入は別途 HOLD（M2-B-2）。pure facade は M2 に依存しない |
| real route search | **未** | route は ConnectionState 純 input のみ。実 routing なし |
| real weather API | **未** | weather は純 input/evidence のみ。live 断定なし |
| hotel/flight/place search | **未** | entity は純 input。検索なし |
| solver / itinerary DAG | **未** | DAG 型（core-types）はあるが solver なし |
| booking / reservation | **未** | readiness は**可否のみ**・実予約なし |
| calendar writes | **未** | 書き込みなし |
| Plan Intelligence projection | **未** | packet を consume する投影は未実装 |
| CoAlter runtime integration | **未** | M2-B 経由・HOLD |
| UI rendering | **未** | 描画なし。shared/viewer packet を将来 consume |
| persistence / DB / migration | **未** | 全層 pure・永続化なし（T10 デルタも非永続） |

---

## §6 Safety invariants（統合後も不変・回帰したら停止）

1. **no action authority from fit** — `hasFitActionAuthority` literal `false`・FitResult.authoritative 常に false。
2. **no booking authority from readiness projection** — shared/viewer readiness/packet は executionAuthority 構造的 false。
3. **no client-only privacy filtering** — private 除去は engine の射影（toShared*）で行う。client/UI 側フィルタに依存しない。
4. **no private signal leakage** — private 入力は full/authoritative に効くが shared に出さない（fit deep-equal canary・readiness C7 riskFlags visibility 射影・packet 再組み立て）。
5. **no live data claims from derived values** — route 派生は `derived_from_connection_state` provenance。timetable/price/availability を断定しない。
6. **no route/timetable/weather availability hallucination** — 欠落は推測せず confidence 減 / question / fail-closed。
7. **no double-counting（fit burden ⊥ readiness confirmation）** — 同一 weatherVulnerability が fit（rain_outdoor_fallback=体験 burden）と readiness（cancel_weather=commitment confirmation）に効くが別層別 consequence。delayRisk(strand)≠PTI(routeChainBurden)。
8. **walkingLoad は walking-only** — door-to-door 総量は **routeChainBurden** が持つ（C5.1）。
9. **routeChainBurden は route aggregate のまま** — 個別 construct に割り戻して平均化しない。
10. **cancelWeather は readiness-facing のまま** — fit-core を producer にしない（C7 修正）。
11. **perceivedSafety は veto/interaction-facing**（soft trait でない）— `fit-constructs.ts:270` missingData=`safety_critical`・IX_night_safety の veto_escalation 対象・DOUBLE_COUNT_RULES で crisisRobustness（L2 構造リスク）と分離。

---

## §7 Recommended next options（比較と推奨）

| Option | 内容 | 評価 |
|---|---|---|
| **A. Fit + Readiness composition facade plan（docs/pure）** | §4.5/4.6 の gap を埋める設計: Fit を T9 内に compose する pure adapter + cancelWeather を TravelPlanEngineInput 経由で供給する配線の設計（実装は別 GO） | **★ 推奨**。closeout で判明した最大の構造 gap（Fit と chain が未合成）を、境界を保ったまま塞ぐ唯一の前進。単一入口化の前提 |
| B. explanation / rationale projection 強化 | two-layer rationale をより豊かに | 直交・価値はあるが composition gap が先 |
| C. 残り construct rollup slice | 未 wired construct を rollup へ | diminishing returns（C3 で主要済み） |
| D. itinerary DAG / solver preflight（docs-only） | solver 前の純 preflight 設計 | runtime gate 寄り・composition より後 |
| E. UI/CoAlter integration preflight（docs-only） | consume 契約の preflight | A（合成）未了では時期尚早 |

**推奨 = Option A（Fit + Readiness composition facade plan・docs/pure）**。
理由: 本 closeout の中心発見は「Fit Model と Decision chain が未合成・T9 は真の単一入口でない・cancelWeather は facade に未配線」。
UI/CoAlter/Plan Intelligence が consume を始める前に、**この 2 subsystem をどう 1 入口に束ねるか**を境界保持のまま設計するのが最優先。
A を docs/pure で固めてから D/E の runtime preflight、最後に各 runtime gate を個別 GO で開ける順序が安全。

---

## §8 Tests & verification expectations（統合前に green を保つ基準）

### 現行 key test group（travel unit 20 ファイル・**計 348 tests**）
| 群 | ファイル(件) |
|---|---|
| **Fit Model（157）** | travelFit(34) / travelFitConstructs(29) / travelFitRollup(16) / travelFitInteraction(17) / travelFitRoute(25) / travelFitC6(20) / travelFitStrand(16) |
| **Readiness（32）** | travelReadinessCore(15) / **travelCancelWeather(17・C7)** |
| **Decision chain / T9 / T10（159）** | travelEngine(14) / travelPacketCore(10) / travelDecisionCore(12) / travelContingencyCore(16) / travelProposalBuilder(15) / travelProposalComparator(12) / travelSlotNormalizer(19) / travelSlotTypes(18) / travelCoreHelpers(17) / travelCoreTypes(9) / travelAfterAction(17) |

### 統合前に green を保つもの
- 上記 **348 travel tests 全 green**（統合 slice は既存を改変しない）。
- **tsc baseline = 55**（additive のみ・回帰したら停止）。
- full suite **0 fail**。

### import 純度ルール（全 travel pure 層で維持）
- `from "next..."` / `supabase` / `fetch(` / `Date.now` / `Math.random` を**含まない**。
- readiness/decision/packet/engine は **Fit 層（fit-core/types/constructs）を import しない**（合成は専用 adapter 経由でのみ・§4.6）。
- Fit 層は route/weather/timetable/API/DB を import しない。

### known flaky note
- `proposalPlanClientHelpers.test.ts > PlanClient default export` が full suite で稀に ~5s timeout flake（travel 純 logic と無関係・no app import）。**C7 実行回では再発せず 0 fail**。今後も flaky 名 / timeout 値 / 再実行結果を継続報告。

---

## §9 出力 + CEO 判断請求

- 本書は **closeout + boundary 凍結のみ**。実装・配線なし。
- **推奨次フェーズ = Option A（Fit + Readiness composition facade plan・docs/pure・実装は更に別 GO）**。

### CEO 判断請求
1. 本 closeout を **T11 純 logic 境界の凍結点**として承認するか。
2. 「Fit Model と Decision chain は現在未合成・T9 が真の単一入口でない」という発見を**次の主課題**として認めるか。
3. 次フェーズ = **Option A（Fit+Readiness composition facade plan・docs/pure）** で良いか（vs B/C/D/E）。
4. cancelWeather の将来配線（§4.5: TravelPlanEngineInput 経由・fit-core 非 producer・専用 adapter 供給）方針で良いか。
5. §5 runtime gate を**各々独立 GO**として凍結することを確認するか。

実装は CEO 承認まで着手しない（closeout / boundary 計画レポートで停止）。
