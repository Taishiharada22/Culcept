# T11-C7 — cancel_weather → T6 Readiness Handoff 計画（確認/取消の境界・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **計画/設計のみ・実装なし**（docs-only・CEO プロセス）。
**位置づけ**: C4/C6 で「T6 readiness 行き」として延期した `cancel_weather` を、**fit でなく Permission/Risk/Readiness 層**で扱う境界設計。天候不確実性 × 取消不能 × 支払い/予約/相手影響 → 「確認が必要 / 予約は待つ / 代替案を持つ」。
**スコープ**: 計画のみ。コード変更なし。**runtime booking / calendar write / weather API / live price/availability/cancellation policy 断定 / solver / Plan Intelligence は実装しない**。**C7 計画レポートで停止し C7-B/C/D 実装には着手しない**。

---

## §1 前提を疑う — 次は cancel_weather readiness handoff で正しいか

| 候補 | 評価 |
|---|---|
| **C7 cancel_weather readiness handoff** | **★ 採用**。最後の延期 interaction・fit でなく**別層(readiness)**・layer 分離を完成 |
| more fit-core interactions | 6 interaction で高価値は出尽くし・diminishing returns |
| fit rationale/explanation 強化 | 直交・rationale は既に two-layer・cancel_weather が明示的次item |

**推奨 = cancel_weather readiness handoff**。理由: (1) cancel_weather は「fit が悪い」でなく「**取消不能な約束を天候不確実下でして良いか**」= commitment の話 → readiness 層。(2) C6.1 で route-risk を fit に入れ切った今、commitment-risk は別層で正しく分離すべき。(3) **real options / irreversibility 理論**: 不確実性 × 取消不能性が高い時、commitment を defer する価値(wait-and-see)が生まれる = まさに「天候不確実 × 取消不能予約 → 確認/待ち/代替」。これは burden(体験の重さ)でなく commitment safety。

### ★ 層分離の核（directive ⑥/⑦）
| 層 | 問い | weather の扱い |
|---|---|---|
| **fit-core**(evaluateFit) | 「合うか / どれだけ重いか」 | IX_rain_outdoor_fallback = **体験の質**(burdenFit/block) |
| **T6 readiness**(assessReadiness) | 「どこまで commit して良いか」 | **cancel_weather = commitment safety**(confirmation) |
同一 weatherVulnerability が両層に効くが**別 consequence**(体験 burden vs 予約確認)= 二重計上でない（C6.1 delayRisk≠PTI と同型）。

---

## §2 なぜ cancel_weather は fit-core scoring でないか

- confirmation / reservation / reversibility の話（commitment）。
- **readiness state** に効く（needs_confirmation 等）。
- **required confirmations** に効く。
- **fallback planning** を要求しうる。
- **burdenFit に default でならない**（体験の重さでなく約束の安全性）。
- fit label cap も**しない**（fit は match の話・readiness state が出力）。

---

## §3 入力（pure・呼び出し側供給・実 API 無）

| 入力 | 出所 | 役割 |
|---|---|---|
| weatherVulnerability | RouteReliabilityState / activity weatherDependency | 天候脆弱性 |
| outdoorExposure | weatherTiming.outdoorExposureRatio | 屋外露出 |
| fallbackAvailability | RouteReliabilityState.fallbackAvailability / 構築子 | 代替の有無 |
| cancellationFlexibility | E_money cancellationFlexibility / FoodRich | 取消柔軟性 |
| bookingRigidity | E_money bookingRigidity | 予約硬直性 |
| irreversibleCommitment | E_money irreversibleCommitment / ReadinessPolicy.irreversible | 取消不能性 |
| paid booking indicator | ReadinessPolicy.involvesPaidBooking（明示供給時） | 有償予約 |
| participant impact | DecisionResult.impact / multiParticipant | 相手影響 |
| route reliability / delay | RouteReliabilityState（関連時） | 遅延×天候 |
| missing-data confidence/provenance | Observed | 欠落/確度 |

★ いずれも **欠落は推測しない**（§6）。live weather/price/cancellation policy を**断定しない**。

---

## §4 出力ターゲット（T6 readiness 行き）

- **T6 ReadinessState**（needs_confirmation 等）に反映。
- **required confirmation queue** に `weather_reversal_uncertainty`（★新 ConfirmationReason・additive）を追加。
- **riskFlag / handoff marker**（fit-core が evidence を出す場合のみ・純粋）。
- **missing question**（cancellation policy 不明等）。
- ★ **fit labelCap はしない**（readiness の話・fit cap でない）。
- **no booking/action authority**・**no live weather/cancellation claim**。

---

## §5 境界（fit は evidence・T6 が state を所有）

- **fit-core** は必要時 **risk/handoff evidence のみ**産出（pure data・T6 を mutate しない）。
- **T6 readiness が所有**: needs_confirmation / ready_to_propose / reserve_or_book_later / blocked / not_ready。
- handoff 機構: pure `assessCancelWeatherRisk(input) → CancelWeatherEvidence` → `ReadinessPolicy` に optional weather/reversibility/fallback フィールド追加 → `assessReadiness` が evidence を消費し `RequiredConfirmation{reason:"weather_reversal_uncertainty", visibility}` を追加。**fit-core と T6 は decoupled**（evidence は data として渡す）。
- **禁止**: runtime booking / calendar write / weather API / live price/availability/cancellation policy 断定。

---

## §6 missing-data 挙動

| 状況 | 挙動 |
|---|---|
| weather 欠落 | **rain を hallucinate しない** |
| cancellation policy 欠落 | **flexibility を推測しない**（question 化） |
| irreversible/paid 不明 | **question または confirmation 要求** |
| fallback 不明 | confidence 減 / question |
| safety/irreversible 不確実 | **fully ready for booking にならない**（reserve_or_book_later を許さず needs_confirmation 止まり） |

---

## §7 privacy

- private weather/fatigue/risk-tolerance 懸念は **authoritative readiness に効く**が **shared に出さない**（T6 既存機構: `RequiredConfirmation.visibility` + `ViewerScopedRationale` + `toSharedReadinessView`）。
- viewer-only rationale は分離維持。
- **confidence / reason / rationale / confirmation labels に private 懸念の存在を漏らさない**（既存 private_constraint_conflict と同型）。
- shared な天候懸念（entity 由来の天候脆弱性）は shared rationale に出てよい（private と区別）。

---

## §8 二重計上防止

| 規則 | 実装 |
|---|---|
| weatherVulnerability を fit penalty と readiness blocker に二度数えない | **fit(rain_outdoor_fallback)=体験 burden / readiness(cancel_weather)=commitment confirmation** の別 consequence・別層 |
| cancellationFlexibility と irreversibleCommitment を二重 penalty しない | 1 つの reversibility 軸に統合（柔軟↔取消不能）して 1 回評価 |
| fallbackAvailability は risk 緩和だが feasibility 保証でない | confidence/risk を下げるが ready_to_book を grant しない |
| cancel_weather は rain_outdoor_fallback(fit) を複製しない | 別層(readiness) |
| cancel_weather は last_departure_strand を複製しない | strand=route 足止め risk / cancel_weather=commitment risk（別 consequence） |

---

## §9 golden tests（C7-D）

1. 高 weatherVulnerability + irreversible booking → **needs_confirmation**（reason weather_reversal_uncertainty）。
2. 屋外天候 risk × fallback 無 → block か question。
3. fallback 有 → readiness concern 減るが **booking authority は grant しない**。
4. cancellation policy 欠落 → question。
5. paid/irreversible 不明 → **ready_to_book にならない**。
6. private risk-tolerance → authoritative readiness に効くが shared rationale に漏れない。
7. shared な天候懸念は shared rationale に出てよい。
8. **live weather/price/availability を断定しない**。
9. **no booking/calendar/send action authority**。
10. **fit-core burdenFit は不変**（cancel_weather は readiness のみ・明示正当化なき限り fit を触らない）。
11. weatherVulnerability の fit penalty(rain) と readiness blocker(cancel) が別層で二重計上しない。
12. cancel_weather が strand/rain_outdoor を複製しない。
13. 既存 **34+29+16+17+25+20+16** 無改変 green・no fetch/API/DB/route/UI imports・tsc 55 不変。

---

## §10 実装スライス（承認後・additive・小バンドル）

| Scope | 内容 |
|---|---|
| **C7-A** | 本計画（docs-only） |
| **C7-B** | 純 readiness handoff 型/helper（`readiness-types.ts`: `weather_reversal_uncertainty` ConfirmationReason 追加 + ReadinessPolicy に weather/reversibility/fallback optional・`assessCancelWeatherRisk` evidence helper・fit-core 非依存） |
| **C7-C** | T6 readiness pure state へ統合（`assessReadiness` が evidence を消費し RequiredConfirmation を追加・既存 assessReadiness 挙動は入力非供給時不変） |
| **C7-D** | golden tests（§9） |
| **C7-E** | closeout（decision-log + memory） |

**stop**: runtime booking / API / UI / Plan Intelligence / weather integration は実装しない（別承認）。

---

## §11 出力 + CEO 判断請求

- **推奨実装バンドル（承認後）**: C7-B+C+D を 1 commit（pure/additive/readiness 層/非 opaque/private 非漏洩/no authority）。検証: 新規 tests PASS・**既存 34+29+16+17+25+20+16 + 既存 readiness tests 無改変 green**・tsc 55 不変・full suite teed。
- guardrail: 実 weather/booking/calendar API・runtime・Plan Intelligence なし。fit-core burdenFit 不変。

### CEO 判断請求
1. 次 = **cancel_weather readiness handoff** で良いか（vs more fit interactions / rationale 強化）。
2. **cancel_weather は fit でなく T6 readiness 層**（burdenFit/fit labelCap にしない・needs_confirmation を産む）で良いか。
3. **handoff = pure evidence → ReadinessPolicy → assessReadiness が RequiredConfirmation 追加**（fit-core と T6 decoupled）で良いか。
4. `ConfirmationReason` に **`weather_reversal_uncertainty` を additive 追加**してよいか。
5. **weatherVulnerability の fit 面(rain burden)と readiness 面(cancel confirmation)を別層別 consequence に分離**（二重計上回避）で良いか。
6. 承認後 **C7-B/C/D bundle 実装** の GO。

実装は CEO 承認まで着手しない（T11-C7 計画レポートで停止）。
