# RD2e-CLOSEOUT — LeaveBy Internal Chain Integration Audit（docs-only）

- 日付: 2026-06-15 / 位置づけ: RD2e 系（route/ETA capability → duration value → leaveBy）の internal chain が**どこまで成立し、どこから先が HOLD か**を一枚に固定する統合監査。実装の追加なし。
- 規律: **コードを書かない**。RC2a 接続・MovementReality 変更・departure line・UI・currentLocation・weather・production には進まない。本書は「leaveBy 内部鎖は完成・consumer 露出はまだ」を CEO が一目で確認するための監査記録。

---

## 1. 責務整理（RD2e-a / a-A / RD2d-b-VALUE / RD2e-b）

| slice | commit | 責務 | 成果物 |
|---|---|---|---|
| **RD2e-a** | （型/walker） | leaveBy の**型 + 不変条件 + walker**（計算しない） | `leaveByComputation.ts`: `LeaveByComputationV0`・`createComputedLeaveBy`/`createUncomputedLeaveBy`・`leaveByComputationViolations` |
| **RD2e-a-A** | （canonical 補正） | canonical JST ISO 強制・`leaveBy ≤ arrival`・computedAt identity 外・displayPolicy visible 禁止 | `isCanonicalJstIso`・`leaveByAtOrBeforeArrival` |
| **RD2d-b-VALUE** | `c99afd46` | leaveBy 計算燃料（**duration 数値**）の internal-only channel + 二鍵 binding | `routeEtaDurationValue.ts`: `PlanningGradeDurationValueV0`・`bindDurationValueToCapability` |
| **RD2e-b** | `0c8daaea` | **実減算 adapter**（二鍵照合 → 合流 → `instantMinusMinutes` 1 回 → fail-closed） | `leaveByAdapter.ts`: `computeLeaveBy`・`instantMinusMinutes`・`isCalendarValidMinuteJstIso` |

**鎖の形**: `RouteEtaCapabilityV0`（flag・consumer-safe）+ `PlanningGradeDurationValueV0`（minutes・server-only）→ 二鍵照合 → `computeLeaveBy` → `LeaveByComputationV0`（internal-only）。capability だけでも value だけでも leaveBy にならない（二鍵）。

---

## 2. leaveByInstantComputed はどこまで成立したか

**成立（pure・internal）**:
- 二鍵が揃った時のみ `leaveByInstant`（canonical minute JST・ss=00）を**実計算**する（`arrivalTarget − (durationUpperBound + buffer)`、1 回減算、二重丸めなし）。
- 暦妥当性（leap/月末/range）・date 跨ぎ・年跨ぎ・閏 2/29 を `instantMinusMinutes`（Date 不使用 civil 算術）で正しく処理。
- 7 段 first-failing-gate-wins で fail-closed（数値捏造なし）。多重欠落でも reason 安定。
- `leaveBy ≤ arrival` を walker で最終 assert。computed は walker green の時のみ emit。

**未成立（意図的に範囲外・別 GO）**:
- arrivalTarget / bufferPolicy / originTemporalValidity の**供給配線**（本鎖は「与えられたら計算する」adapter。供給元の実配線は別 slice）。
- leaveBy object の**消費**（departure line / proposal / 表示）。
- production data・実 route provider 接続・実時刻供給（evaluatedAt/computedAt は caller 供給契約）。

---

## 3. consumer 非露出の確認（最重要）

leaveBy 鎖は **完全に consumer 非露出**である:
- `LeaveByComputationV0.displayPolicy ∈ {internalReference, debugOnly, hidden}`（visible は walker が禁止・RD2e-a-A）。
- `PlanningGradeDurationValueV0.displayPolicy = internalServerOnly`（consumer DTO に出さない・RD2d-b-VALUE）。
- adapter output `RouteEtaAdapterOutputV0.durationValue` は **server-only sibling**（capability に nest しない）。
- 鎖の**外部 consumer が 0**: `leaveByAdapter` / `routeEtaDurationValue` / `routeEtaProviderAdapter` を参照するのは realityCore 内 + tests のみ（app/components/lib 他から未参照）。
- user-facing copy / notification / departure line / action / proposal field は型・walker（FORBIDDEN_FIELDS）で封じられている。

→ **leaveBy は計算されるが、まだ誰の画面にも出ない**。これが RD2e の正しい着地点。

---

## 4. RC2a 接続条件（HOLD・別 GO）

RD2e の leaveBy を RC2a（実プラン文脈）に繋ぐには、以下が **CEO GO 込みで**必要:
- arrivalTarget / bufferPolicy / originTemporalValidity の**実供給元**（event anchor の到着目標・rigidity 由来 buffer・origin inference）の配線。
- 二鍵が揃わない時（uncomputed）の RC2a 側の honest な扱い（leaveBy なしでも壊れない）。
- consumer 露出は **RJ2 / Permission / Delivery gate** を別途通す（leaveBy computable ≠ display eligible）。
- **本 CLOSEOUT では接続しない**。

---

## 5. MovementReality 接続条件（HOLD・別 GO）

- MovementReality（移動の現実観測）への接続は leaveBy の**実測補正**を意味し、現在地観測・実 route・実時刻に触れる → 大きな別 slice。
- 前提: currentLocation HOLD（§7）の解除・実 provider 接続・Permission。
- **本 CLOSEOUT では変更しない**。

---

## 6. departure line 条件（HOLD・別 GO）

- departure line（「そろそろ出発」の演出/線）は **leaveBy の consumer 表示**であり、leaveBy computation とは別レイヤ。
- 前提: §3 の非露出を破る判断 = RJ2/Permission/Delivery gate + UI + コピー設計（世界観）。
- leaveBy が internal で正しく出ることと、それを user に見せることは**別の意思決定**。**本 CLOSEOUT では作らない**。

---

## 7. currentLocation が HOLD であることの確認

- RD2e 全体で **currentLocation を取得しない / navigator / geolocation を import しない**（source-scan green）。
- origin は供給済の **opaque + temporal validity**（`current_location_candidate` origin は computed 不可・RD2c/RD2e-a/RD2e-b で三重に封じ）。
- `currentObservationOverrodeConfirmed` は常に false 強制（現在観測が user 確認 origin を上書きしない）。
- **currentLocation は引き続き HOLD**。解除は CEO 判断 + Permission 設計込みの別 slice。

---

## 8. weather friction が HOLD であることの確認

- RD2e は weather を一切参照しない（buffer は固定 catalog・**weather 数値化禁止**・condition は capability 側の enum status のみ）。
- duration の condition（traffic_aware 等）は capability の質 gate であって weather friction の数値ではない。
- **weather friction は引き続き HOLD**。leaveBy に天候遅延を混ぜない（過剰精密・捏造防止）。

---

## 9. next 候補（各々別 CEO GO）

| 候補 | 内容 | 前提 |
|---|---|---|
| **RD2e-SUPPLY** | arrivalTarget / bufferPolicy / originValidity の**実供給配線**（pure・event anchor/rigidity/origin inference から組む）。**設計済 → `docs/reality-leaveby-supply-boundary-rd2e-supply-0.md`（RD2e-SUPPLY-0）** | event anchor 構造の確定（監査済） |
| **RD2f（RC2a 接続）** | leaveBy を RC2a に honest に接続（uncomputed 耐性・gate 込み） | RJ2/Permission/Delivery |
| **departure line** | leaveBy consumer 表示（世界観・コピー） | 非露出解除の CEO 判断 |
| **currentLocation 解除** | 現在地観測の取り込み | Permission 設計 |
| **weather friction** | 天候遅延の扱い（数値化せず質的に） | 過剰精密回避の設計 |

**推奨**: まず **RD2e-SUPPLY**（pure・低リスク・鎖を完結させる）を次段候補とする。consumer 露出（RC2a/departure line）はその後。

---

## 10. 監査結論

- **leaveBy internal chain は完成**（capability → duration value 二鍵 → 実減算 → internal leaveBy・全 pure・全 fail-closed・consumer 非露出）。
- RC2a / MovementReality / departure line / currentLocation / weather は **全て意図的に HOLD**（各々別 GO・本鎖の外）。
- 次に倒すべきは供給配線（RD2e-SUPPLY）か consumer 露出か = **CEO 判断**。本書はコードを含まない。
