# RD2e-SUPPLY-0 — LeaveBy Supply Boundary Design（設計提出のみ・コード禁止）

- 日付: 2026-06-15 / 位置づけ: RD2e-b（`leaveByAdapter.computeLeaveBy`・`0c8daaea`）に渡す **arrivalTarget / bufferPolicy / originTemporalValidity** を、**既存の上流構造から安全に供給する境界**を設計する。RD2e-b は「入力が揃えば計算する」状態。本書はその入力を**どこからどう作るか**。
- 規律: **コードを書かない**。供給 adapter 実装・RD2e-b 呼び出し配線・RC2a/MovementReality/departure line/currentLocation/weather/UI/DB write/production には進まない。
- 方法（CEO ①②③）: **既存コードを監査**してから設計（発明しない）。下記 §0 の監査は実コードの型/フィールドに基づく。

---

## 0. 現状監査（既存上流構造・実コード根拠）

| 供給対象 | 既存ソース（実在） | 直接使えるか | ギャップ |
|---|---|---|---|
| arrival startTime | `ExternalAnchor.startTime`（`lib/plan/external-anchor.ts`）/ `EventNode.startTime`（`lib/plan/dayGraph/dayGraphTypes.ts`・"HH:MM" local） | △ 形式変換要 | calendar-valid **JST ISO** 化（`YYYY-MM-DDTHH:MM:00+09:00`）が必要 |
| **fixedness** | **存在しない**。近いのは `ExternalAnchor.rigidity`("hard"\|"soft") / `CommitmentSignalV0.fixedStart: RealityAttribute<boolean>` / `EventNode.durationSource`("explicit"\|"assumed_default") | ✗ 導出要 | **本境界の核心 1**: fixedStart + rigidity + 明示 startTime から `fixed/tentative/movable` を**導出** |
| startTimeProvenance | `EventNode.durationSource` / anchor source | △ 導出要 | explicit→confirmed / 既定→default の写像 |
| commitment/rigidity（buffer 用） | `CommitmentSignalV0`（`lib/plan/realityCore/commitmentSignal.ts`）: `rigidity`/`fixedStart`/`changeCost`/`protectionReasons`/`reservationOrPaymentPossible`（各 `RealityAttribute<T>`） | ○ | 多次元 → bucket への保守的写像が必要 |
| subjectiveDate / targetEventDate | `CommitmentSignalV0.subjectiveDate`（<05:00 は前日へ shift）/ `RouteEtaIdentityBasisV0.subjectiveDate` | ○ | date 跨ぎ（subjective day が翌暦日に跨ぐ）の扱い |
| origin | `OriginInferenceV0`（`lib/plan/realityCore/originInference.ts`）: `stage`(6 値)/`certaintyStatus`/`confidence`/`source`/`originRef`/`evidenceRefs` | △ | **本境界の核心 2**: stage→originKind 写像 + **temporal validity（valid/stale/unknown）導出** |
| originConflict | `RouteEtaCapabilityV0.originConflict`（`OriginConflictForRouteV0`: status/userConfirmedOriginPresent/currentObservationOverrodeConfirmed） | ○ | capability から直接取得 |
| capability / durationValue | `RouteEtaCapabilityV0` / `PlanningGradeDurationValueV0` + 二鍵 binding | ○（RD2d-b-VALUE 実装済） | そのまま bundle に載せる |

**核心 2 ギャップ（設計の中心）**:
- **fixedness は上流に無い** → `CommitmentSignalV0.fixedStart` + `rigidity` + `durationSource` から保守的に導出（不明は movable=非 fixed → RD2e-b uncomputed）。
- **originTemporalValidity は `OriginInferenceV0` に無い**（origin が「どこ」かは持つが「この arrival の出発点として時間的に妥当か」は持たない）→ 導出する。

---

## 1. arrivalTarget supply（CEO 必須 1）

`ArrivalTargetForLeaveByV0` を **event anchor / EventNode の明示 startTime** から構築する。

**入力**: targetNodeId に対応する EventNode（startTime / durationSource / rigidity）+ ExternalAnchor（startTime / rigidity / date）+ CommitmentSignalV0（fixedStart / subjectiveDate）+ capability.identity（subjectiveDate / transportMode）。

**arrivalTargetInstant 構築**（pure・Date 不使用）:
- `${targetEventDate}T${pad(startHH)}:${pad(startMM)}:00+09:00`。**`isCalendarValidMinuteJstIso` green 必須**（RD2e-b と同 guard）。
- **v0 conservative — date 跨ぎは供給しない**: event 実暦日 ≠ subjectiveDate（<05:00 で subjective day が翌日跨ぎ）の場合は `arrival_target_missing`（unsupported）→ uncomputed。同日 event のみ v0 で供給（CEO ③）。

**fixedness 導出**（本境界の核心 1・保守的・fail-closed）:
```
fixedness =
  "fixed"     if CommitmentSignalV0.fixedStart.value === true
              ∧ fixedStart.status ∈ {confirmed, inferred}
              ∧ EventNode.durationSource === "explicit"        // 既定 startTime でない
              ∧ rigidity.value === "hard"
  "tentative" if (rigidity soft ∧ fixedStart inferred) など中間
  "movable"   otherwise（fixedStart 無 / assumed_default / unknown）
```
- RD2e-b が通すのは `fixed` のみ。不確実は tentative/movable に倒し RD2e-b で uncomputed（捏造より honest uncomputed）。

**startTimeProvenance 導出**: `durationSource==="explicit"` ∧ rigidity hard → `confirmed` / 推論連鎖由来 → `inferred` / `assumed_default` または startTime 未明示 → `default`（RD2e-b reject）。

**confidence**: CommitmentSignalV0.fixedStart.confidence を band 化（high≥0.7 / medium≥0.4 / low）。low → RD2e-b reject。

**sourceRefs / evidenceRefs**: anchor id / commitment evidenceRefs / EventNode 由来 ref（opaque）。

**禁止（CEO）**: startTime 未定を補完しない・**duration から arrivalTarget を逆算しない**・default 60min 等で作らない・low confidence で供給しない・date 跨ぎ/unsupported を供給しない・user-facing 文面を作らない。

---

## 2. bufferPolicy supply（CEO 必須 2・固定 catalog・賢くしない）

`BufferPolicyForLeaveByV0` を `CommitmentSignalV0` から保守的に導く。bucket は **small/medium/large のみ**（catalog 5/15/30・RD2e-b0A）。

**v0 写像（CEO 候補に準拠・過剰に賢くしない）**:
```
bucket =
  "large"   if rigidity.value==="hard" ∧ (fixedStart.value===true ∨ reservationOrPaymentPossible.value===true ∨ changeCost high)
                                                   // 仕事系/予約・支払い/高コミット
  "medium"  if (rigidity.value==="hard" ∨ fixedStart.value===true)    // 通常の fixed
  "small"   if rigidity.value==="soft" ∧ changeCost low ∧ 短時間ローカル文脈
  unknown   otherwise                              // → 供給しない（buffer_unknown → uncomputed）
```
- **commitment status が unknown / confidence 不足なら bucket を作らず `buffer_unknown`**（CEO「不明なら buffer unknown として leaveBy uncomputed」）。
- bufferKind 写像: large→`conservative_default` または `error_margin` / medium→`preparation` / small→`transition`。
- bufferScopeRef + targetNodeId/subjectiveDate/transportMode は **capability/duration と scope 一致**（不一致は RD2e-b binding_mismatch）。
- freshness: commitment signal が当該 subjectiveDate のものなら `valid` / 古い・別日 → `stale`/`unknown`（→ uncomputed）。
- evidenceRefs: commitment evidenceRefs（rigidity/protectionReasons 由来）。

**禁止（CEO）**: weather delay を数値化しない・LLM 推定で buffer を作らない・minute precision を動的に作らない・「間に合う保証」として扱わない。

---

## 3. originTemporalValidity supply（CEO 必須 3・核心 2）

`OriginTemporalValidityForLeaveByV0` を `OriginInferenceV0` + `capability.originConflict` から構築する。

**originKind 写像**（`OriginInferenceV0.stage` → `LeaveByOriginKind`）:
```
user_confirmed_origin       → user_confirmed
previous_event_end          → previous_event_end
home_assumed                → home_assumed
work_assumed                → work_assumed
current_location_candidate  → current_location_candidate   // RD2e-b で REJECT
unknown_origin              → unknown                       // RD2e-b で REJECT
```

**validity 導出**（本境界の核心 2・「出発点として時間的に妥当か」）:
```
validity =
  "valid"   if certaintyStatus ∈ {confirmed, inferred}
            ∧ confidence ∈ {high, moderate}
            ∧ 時間的妥当性:
                - previous_event_end: 前 event 終了 instant ≤ arrivalTargetInstant（到着後の場所から出発しない）∧ 同 subjectiveDate
                - user_confirmed: 当該 subjectiveDate に confirmed
                - home/work_assumed: 静的仮定として妥当（ただし confidence moderate 上限）
  "stale"   if origin 観測がもはや時間的に妥当でない（前 event 終了が arrival 後 / 別日 / 期限切れ）
  "unknown" if certaintyStatus unknown ∨ confidence ∈ {low, none}
```
- **originInference は「どこ」を持つが「この arrival に対し時間的に妥当か」を持たない** → 本境界が arrival との時間関係で導出する（GPT を超える設計点・CEO ⑦）。

**originConflict**: `capability.originConflict.originConflictStatus`（none/minor_discrepancy/conflict）をそのまま。`conflict` → RD2e-b reject。
**currentObservationOverrodeConfirmed**: `capability.originConflict.currentObservationOverrodeConfirmed`（**常に false 不変条件**・true は reject）。
**originEvidenceRef**: `OriginInferenceV0.evidenceRefs[0].code`（必須・空なら供給しない）。

**禁止（CEO）**: currentLocation を取得しない・currentLocation を自動で origin にしない・home/work_assumed を confirmed 扱いしない・user confirmed origin を current 観測で上書きしない。**current_location_candidate / unknown_origin は供給段階で「弾く候補」として渡し RD2e-b が uncomputed**（二重防御）。

---

## 4. RD2e-b への入力 bundle（CEO 必須 4）

```
interface LeaveBySupplyBundleV0 {
  readonly schemaVersion: 0;
  readonly subjectNodeId: string | null;
  readonly capability: RouteEtaCapabilityV0;
  readonly durationValue: PlanningGradeDurationValueV0 | null;
  readonly arrivalTarget: ArrivalTargetForLeaveByV0 | null;       // 供給不能なら null
  readonly bufferPolicy: BufferPolicyForLeaveByV0 | null;
  readonly originTemporalValidity: OriginTemporalValidityForLeaveByV0 | null;
  readonly evaluatedAt: string;                                   // canonical JST（caller 供給）
  readonly computedAt: string;                                    // canonical JST（identity 外）
  readonly sourceRefs: ReadonlyArray<string>;
  readonly evidenceRefs: ReadonlyArray<LeaveBySupplyEvidenceRef>;
  readonly missingInputs: ReadonlyArray<LeaveBySupplyMissingInput>;
}
```
- 供給 adapter `supplyLeaveByInputs(...)` は bundle を返す。各サブ供給が不能なら該当を null + missingInput を積む。
- **bundle → RD2e-b**: `arrivalTarget/bufferPolicy/originTemporalValidity` のいずれかが null、または durationValue null → RD2e-b は **uncomputed**（既存 gate がそのまま倒す）。supply は RD2e-b の門を**緩めない**（弱い候補を強い候補に偽装しない）。

**不変条件**: bundle は **internal-only**・consumer payload/client props に出さない・**raw anchor / raw coordinates / raw route response を含まない**（opaque ref のみ）・missing があれば RD2e-b は uncomputed。

---

## 5. supply missingInputs（CEO 必須 5・internal trace）

```
type LeaveBySupplyMissingInput =
  | "arrival_target_missing"        // startTime 未明示 / date 跨ぎ / unsupported
  | "arrival_not_fixed"             // fixedness ≠ fixed
  | "arrival_default_provenance"    // startTimeProvenance = default
  | "buffer_unknown"                // commitment 不明で bucket 作れない
  | "buffer_scope_mismatch"         // buffer scope ≠ capability/duration
  | "origin_unknown"                // stage unknown / confidence low
  | "origin_temporal_invalid"       // validity stale/unknown
  | "origin_conflict"               // capability.originConflict = conflict
  | "time_estimate_missing"         // capability planning false
  | "duration_value_missing"        // durationValue null
  | "capability_value_binding_missing"; // 二鍵 binding 不成立
```
- `missingInputs` は **internal trace**（consumer 文面ではない）。raw を echo しない（code + safe detail のみ）。
- RD2e-b の `LeaveByAdapterUncomputedReason` と対応づくが**同一ではない**（supply は「なぜ供給できなかったか」、adapter は「なぜ計算できなかったか」）。両者を trace で繋ぐ。

---

## 6. LeaveBySupplyEvidenceRef / LeaveBySupplyTrace（CEO 必須 6）

```
interface LeaveBySupplyEvidenceRef {
  readonly code: string;
  readonly capability: "arrival_target" | "buffer" | "origin" | "time_estimate";
  readonly source: string;   // anchor / commitment / origin_inference / provider 由来（opaque）
}
interface LeaveBySupplyTrace {
  readonly arrivalSource: "event_anchor" | "none";
  readonly bufferSource: "commitment_signal" | "none";
  readonly originSource: "origin_inference" | "none";
  readonly derivedFixedness: "fixed" | "tentative" | "movable" | "absent";
  readonly derivedOriginValidity: "valid" | "stale" | "unknown" | "absent";
  readonly missingInputs: ReadonlyArray<LeaveBySupplyMissingInput>;
}
```
- trace は **導出の根拠**（fixedness/validity をどう導いたか）を internal に残す。raw を含めない。

---

## 7. internal-only 方針 + fake 禁止 field（CEO 必須）

- bundle / trace / 各供給型は **internal-only**（displayPolicy hidden 系・consumer 非露出・client props なし）。
- **fake 禁止 field**: raw startTime 補完値 / duration 逆算 arrival / default 60min arrival / weather 数値 buffer / LLM buffer / dynamic minute buffer / raw lat/lng/address / raw route response / currentLocation field / user-facing copy / departure line / notification / proposal / action。
- supply は RD2e-b の門を**緩める方向に働かない**（不明は missing として渡し uncomputed に倒す）。

---

## 8. Department Responsibility Matrix（RD2e-SUPPLY-0・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Mobility** | R（owning） | 供給境界設計・fixedness/validity 導出規則・bundle/trace |
| **Context/Temporal** | C | event anchor startTime/subjectiveDate・date 跨ぎ・arrival 時間関係 |
| **Permission** | C | origin opaque・currentLocation 不使用・confirmed 上書き禁止 |
| **Risk** | C | fail-closed（不明→missing→uncomputed）・捏造 field 禁止 |
| **CEO** | A | RD2e-SUPPLY 実装 GO・RC2a 接続 GO（別） |

---

## 9. RD2e-SUPPLY 実装 GO 可否 自己判定

- 供給対象 3 つのうち **capability/durationValue は実装済**、**arrival startTime / commitment / origin は既存構造が揃っている**（§0 監査）。新規面積は **2 つの導出（fixedness / originTemporalValidity）+ 形式変換（startTime→calendar JST ISO）+ bundle 組立**。
- **2 つの導出が設計の核心**で、いずれも保守的 fail-closed（不明は非 fixed / unknown → uncomputed）ゆえ安全側。v0 は date 跨ぎ非対応・buffer は粗い 3 分岐で「賢くしない」。
- 残リスク: startTime provenance の厳密ソース（explicit/default の判定根拠）が `durationSource`（duration 用）からの間接導出になる点 → 実装時に `startTimeSource` の明示が要れば小追加（本書では発見として記録・実装しない）。
- **RD2e-SUPPLY は実装可能水準**。ただし GO は CEO 専管。本書はコードを含まない。
