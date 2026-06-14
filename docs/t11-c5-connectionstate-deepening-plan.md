# T11-C5 — ConnectionState / RouteChain Deepening 計画（door-to-door 状態の深化・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **計画/設計のみ・実装なし**（docs-only・CEO プロセス）。
**位置づけ**: T11-C4（interaction veto 実装済）の次。延期 interaction（hotelDrop / earlyMorning / cancel_weather）は connection/ordering/route-chain/schedule-lock 状態に依存 → **先に ConnectionState を深化**して局所 patch 化を防ぐ（GPT 判断）。
**スコープ**: 計画のみ。コード変更なし。実 route/place/weather API・solver・booking・永続化・UI・M2 runtime・push なし。**C5 計画レポートで停止し C5-B/C/D/E 実装には着手しない**。

---

## §1 前提を疑う + ★三表現の reconciliation（本計画の核心）

| 候補 | 評価 |
|---|---|
| **B ConnectionState 深化** | **★ 採用**。延期 interaction が依存・先に固めないと局所 patch 化 |
| A 第二 interaction slice | hotelDrop/earlyMorning/cancel は connection/ordering/lock 状態に依存 → 浅い ConnectionState の上に足すと patch |
| C more construct rollup | 直交・route 依存の interaction を解錠しない |

**推奨 = B**。ただし重要な前提監査（directive ①）: route には**既に 3 表現が存在し、増やさず 1 パイプラインに統一する**:

| 既存表現 | 場所 | 状態 |
|---|---|---|
| (1) `ConnectionState` 型（AccessLeg/TransferNode/OrderingConstraint/RouteChainState） | fit-types §6 | 型のみ・**未配線** |
| (2) `doorToDoorBurden(routeChain)` 合成 helper | fit-core | 実装済・Hiroshima test 済・**fit 未接続** |
| (3) `H_route` 構築子 **22**（firstMileBurden/lastMileBurden/airportToCityBurden/stationToHotelBurden/arrivalFreshness 他） | registry | 登録済・**arrivalFreshness のみ C3 配線** |

### ★ 統一パイプライン（新並列表現を作らない）
```
ConnectionState(構造化 route 入力)  →  doorToDoorBurden(合成)  →  H_route 構築子 observations 派生
  →  既存 C3 rollup / C4 interaction で burdenFit / recoveryFit を修飾（新 component を作らない）
```
C5 = (1) を ~25 項目に深化 + (2) を enrich + (3) の残 21 構築子へ ConnectionState から observation を供給。**route は新 component を持たず burdenFit/recoveryFit を修飾**（C3/C4 原則の踏襲）。

---

## §2 target ConnectionState モデル（既存型に additive 拡張）

| 型 | 役割 | 既存/新 |
|---|---|---|
| `AccessLeg` | leg（firstMile/mainLeg/lastMile）の mode/time/weight | 既存・§3 で拡張 |
| `TransferNode` | 乗換（型/min-time/pathway/barrier） | 既存・§4 で拡張 |
| `TerminalBurden`(spec) | terminal（security/check-in/fare-gate/walk） | 既存・§4 で拡張 |
| `BaggageState` | 荷物 pieces/occupancy/drop 状態遷移 | **新**・§5 |
| `LuggageDropAffordance` | locker/hotel/delivery drop 可否 | **新**・§5 |
| `OrderingConstraint` | must_precede/lock 群（11 種） | 既存 4→**11 に拡張**・§6 |
| `RouteChainState` | connection + ordering + baggage + reliability + comfort の容器 | 既存・拡張 |
| `RouteReliabilityState` | PTI/buffer/delay/weather/seasonal | **新**・§7 |
| `RouteComfortState` | seat/work/sleep/scenic/comfort | **新**・§3 |
| `RoutePurposeModifier` | tripIntent×role で route 価値変調 | **新**・§9 |
| `ArrivalFreshnessState` | 残存エネルギー導出 | **新**（arrivalFreshness 構築子に供給）・§3 |

すべて optional・additive。ConnectionState 入力非供給時=従来挙動（presence-gated）。

---

## §3 leg 構造（AccessLeg 拡張）

`firstMile` / `mainLeg[]` / `lastMile(=egress)` 各 leg:
- `mode`（GTFS route_type 写像・既存）/ `legKind`（既存）
- `inVehicleMin` / `walkingMin` / `waitingMin` / `boardingAlightingMin`
- `egressWeight`（★lastMile=firstMile×3・既存 ROUTE_CHAIN_WEIGHTS）
- `seatProbability`(0..1) / `workability`(0..1) / `sleepability`(0..1) / `scenicValue`(0..1) / `comfort`(0..1)
- `accessibilityContinuity`（step-free 連続・3値）
→ **RouteComfortState** = seat/work/sleep/scenic の集約。`workabilityValue`/`sleepabilityValue`/`scenicValue` 構築子へ供給。
→ **ArrivalFreshnessState** = Σ(legBurden) と comfort から残存エネルギー導出 → `arrivalFreshness` 構築子（既配線）。

---

## §4 transfer / terminal 構造

**TransferNode**: `transferCount`（chain 全体）/ `transferType`(GTFS 0-5) / `transferComplexity`(0..1) / `minTransferMin` / `missedConnectionRisk`(0..1) / `pathwayMode`(GTFS 1-7) / `stairsSlopeElevator`（昇降手段） / `signageComplexity`(0..1) / `accessibilityBarrier`。
**TerminalBurden**: `kind`(security/check_in/fare_gate/station_walk/immigration_placeholder) / `overheadMin` / `walkM` / `queueVariance`(0..1)。
→ `transferComplexityBurden`/`terminalWalkingBurden`/`reliabilityBurden`(missedConnection) 構築子へ供給。immigration/customs は placeholder（国内 MVP 範囲外）。

---

## §5 baggage / luggage 構造（before/after drop 状態遷移）

```
BaggageState {
  pieces; spatialOccupancy(0..1); weightBurden(0..1);
  droppedState: "carried" | "dropped";        // ★状態遷移
  stairInteraction; crowdInteraction;          // 交互作用 hook（C4 superadditive と整合）
}
LuggageDropAffordance { locker?; hotel?; delivery?; }   // drop 可否
OrderingConstraint{kind:"luggage_drop_enables", subjectRef:hotel, objectRef:destination}
```
- **before-drop vs after-drop burden**: drop 後の後続 leg `baggageBurden=0`（C4 IX_hoteldrop が消費する状態）。
- **hotel-first dependency**: `luggage_drop_enables`（既存 `baggageDroppedByOrdering` helper）+ LuggageDropAffordance.hotel。
- **destination-order impact**: drop の有無で後続 leg の baggage 交互作用が変わる（§9 の hotelDrop interaction）。

---

## §6 ordering / lock carriers（4 → 11 に拡張）

| kind | 意味 | 消費先 |
|---|---|---|
| must_precede | 順序固定 | solver(HOLD) |
| luggage_drop_enables | 宿先行→荷物 base 化 | hotelDrop interaction |
| reorderable | 部分順序（最短化余地） | solver |
| derive_shortest_from_terminal | 空港から最短経路推論 | solver |
| **timed_entry_lock** | 時間指定券 | ordering 制約・周辺 reorder 不可 |
| **last_departure_lock** | 終電/最終便 | earlyMorning/一日終端 risk |
| **open_hours_window_lock** | 営業時間窓 | 成立可否 gate |
| **checkin_window_lock** | チェックイン時刻 | 宿先行 ordering |
| **checkout_window_lock** | チェックアウト時刻 | morning burden |
| **meal_time_lock** | 食事固定時刻 | ordering |
| **reservation_window_lock** | 予約枠 | 確保 ordering |

C5 は lock **状態を carry** するのみ（solver が並べる・fit は順序非依存に評価・guardrail）。

---

## §7 reliability / uncertainty（PTI placeholder・実 API 無）

```
RouteReliabilityState {
  planningTimeIndex(0..1 推定・95%ile/free-flow 思想・★実 API 無の Observed)；
  bufferIndex; delayRisk; weatherVulnerability; seasonalSuspensionRisk;
  transferFragility; lastDepartureFragility;
}
```
- missing data: ordinary 欠落→confidence 減 / safety 関与なし→fail-open。
- provenance/confidence: 全 field `Observed`・source は confidence のみ。**price/実時刻/空室を断定しない**。
- → `reliabilityBurden`/`delayRiskBurden` 構築子 + confidence へ供給（FitContext.weatherSeverity と同 scale）。

---

## §8 door-to-door burden（既存 `doorToDoorBurden` を enrich・非 opaque）

```
burden(chain) = Σ_leg(legMin × legWeight)                      // 線形（既存・egress×3 非対称）
              + Σ_transfer(transferPenalty[型別] + minTransferMin)
              + Σ_terminal(overheadMin + walkBurden)
              + baggageTerm(occupancy × stair × crowd × dropped?0)   // ★交互作用 hook（C4 superadditive と整合）
              × reliabilityModifier(PTI)                             // 信頼性で全体補正
arrivalFreshness = f(Σ legBurden, comfort, reliability)              // 残存エネルギー
```
- 重み（待ち×1.7/徒歩×1.65/乗換≒18分/egress×3）は **export 済 ROUTE_CHAIN_WEIGHTS**（非 opaque）。
- **superadditive hook**: baggage×stairs×crowd は C4 IX_baggage_stairs_crowd が EXCESS を担い、ここでは線形のみ（二重計上回避）。
- 実 route API 無し。ConnectionState は呼び出し側供給の純 input。

---

## §9 interaction 依存（延期 interaction が深化状態をどう消費するか）

| 延期 interaction | 消費する深化状態 | 修飾先（新 component 無） |
|---|---|---|
| **hotelDrop × ordering × baggage** | `BaggageState.droppedState` + `luggage_drop_enables` + `LuggageDropAffordance` | burdenFit（後続 leg baggageBurden=0 化・gating） |
| **earlyMorning × terminal × fatigue** | TerminalBurden + `checkout_window_lock`/`last_departure_lock` + morningBurden 構築子 | burdenFit（superadditive） |
| **cancel_weather × irreversible** | `RouteReliabilityState`(weatherVulnerability) + reversibility/schedule lock | **T6 readiness 行き**（fit component でなく confirmation/blocker） |

route-chain 出力は **burdenFit/recoveryFit を rollup/interaction で修飾**（新並列 component を作らない・C3/C4 原則）。

---

## §10 privacy / authority

- route 状態は **full fit に効く**。private な mobility/accessibility 懸念（user の私的移動制約）は **shared 射影に漏らさない**（C3/C4 の two-layer + availableShared + shared-safe confidence/signalBasis 踏襲）。
- **action authority 無**: fit は route の良し悪しを scoring/説明するのみ。**booking/scheduling/route 推薦の権限を生成しない**（`authoritative=false`・`hasFitActionAuthority` literal false）。solver(HOLD) が並べる。

---

## §11 実装スライス（承認後・additive・小バンドル）

| Scope | 内容 |
|---|---|
| **C5-A** | 本計画（docs-only） |
| **C5-B** | pure types/state 拡張（fit-types §6: BaggageState/LuggageDropAffordance/RouteReliabilityState/RouteComfortState/RoutePurposeModifier/ArrivalFreshnessState + AccessLeg/TransferNode/OrderingConstraint 拡張・additive） |
| **C5-C** | `doorToDoorBurden` enrich（reliability modifier/comfort/arrival freshness・既存 Hiroshima test 不変） |
| **C5-D** | 統合: `EvaluateFitArgs.routeInput?: RouteChainState`（optional・presence-gated）→ ConnectionState から H_route 構築子 observation 派生 → 既存 C3 rollup へ供給（burdenFit/recoveryFit 修飾・新 component 無） |
| **C5-E** | golden tests（§12） |

**stop**: 実 route/place/weather API 無し。lock は carry のみ（solver placement しない）。

---

## §12 golden tests（C5-E）

1. **Hiroshima** air vs rail が依然成立（既存 doorToDoorBurden test 不変）。
2. **egress 非対称**が main-leg 速度優位を反転（airport-to-city bus が新幹線中心直結に負ける）。
3. **station-to-hotel** burden が fit に効く。
4. **hotel drop** が後続 baggageBurden を下げる（ordering 状態経由）。
5. **last_departure_lock** が risk を上げる。
6. **timed_entry_lock** が ordering 状態を制約（reorderable 不可化）。
7. **open_hours_window_lock** が成立フローを制約。
8. **transfer complexity** 高 → burdenFit 上昇。
9. **PTI/reliability** が confidence/burden に効く（実 API 無）。
10. route **comfort/workability** が work-trip fit を改善。
11. route **sleepability** が長 leg の recovery を改善。
12. **private mobility 懸念**が full に効くが shared に漏れない（canary）。
13. route 入力非供給 → 従来挙動（既存 34/29/16/17 green）。
14. no fetch/route/weather/API/DB/UI imports・tsc 55 不変・full suite teed。

---

## §13 出力 + CEO 判断請求

- **推奨実装バンドル（承認後）**: C5-B+C+D+E を 1 commit（pure/additive/presence-gated/非 opaque/private 非漏洩/no authority）。検証: 新規 tests PASS・**既存 34+29+16+17 無改変 green**・tsc 55 不変・full suite teed・purity/import grep。
- guardrail: 実 route/place/weather API・solver・booking なし。route 入力非供給=従来挙動。

### CEO 判断請求
1. 次 = **ConnectionState 深化(B)** で良いか（vs 第二 interaction slice / more rollup）。
2. **★三表現統一パイプライン**（ConnectionState → doorToDoorBurden → H_route 構築子 → burdenFit/recoveryFit・新 component 無）で良いか。
3. **ConnectionState ~25 項目拡充**（BaggageState 状態遷移 / RouteReliability PTI / RouteComfort / ordering 11 lock）の方向で良いか。
4. **`EvaluateFitArgs.routeInput?` optional 配線**（presence-gated・C3 rollup へ供給）で良いか。
5. cancel_weather は **T6 readiness 行き**（fit component にしない）で良いか。
6. 承認後 **C5-B/C/D/E bundle 実装** の GO。

実装は CEO 承認まで着手しない（T11-C5 計画レポートで停止）。
