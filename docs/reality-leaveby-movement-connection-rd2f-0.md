# RD2f-0 — LeaveBy → RC2a / MovementReality / RealityGraph 接続設計（docs-only）

> **✅ RD2f-bind 実装完了（`da1fff96`・2026-06-15）**: §8 の RD2f-bind を実コード化。`EventRealityNodeV0.leaveByComputed?: LeaveByComputationV0`（別 field・既存 `leaveBy`[display string] 不変）+ 新 pure `lib/plan/realityCore/leaveByGraphBinding.ts`（`attachComputedLeaveBy`[再検証 seam]/`deriveMovementLeaveByKnown`[derived-and-bound]/`leaveByGraphBindingViolations`）。MovementReality/feasibility/risk/permission 非接続・internal-only。20/20 tests・full 21004 + baseline FAIL 2・tsc 55。assembly 接続は **RD2f-assembly（別 GO）**。表現補正反映: CollapseRisk/Intervention は「本 slice の接続対象でない・load-bearing input にしない」（不在でなく既存・RC2b/RC2c）。

- 日付: 2026-06-15 / 位置づけ: RD2e-SUPPLY（`6f707fbc`）で internal に得た `LeaveByComputationV0` を RealityGraph へ**どう接続するか**を実装前に設計する。**まだ実装ではない**。leaveBy は依然 internal-only（MovementReality 正本でも departure line でも user-facing でも notification でも action でもない）。
- 規律: 本書は**コードを書かない**。MovementReality/assembleRealityGraph/compileMovementReality/RC2a/dogfood preview/departure line/UI/notification/currentLocation/DB write には進まない。
- 方法（CEO ①②③ + ultracode）: **adversarial workflow（`wf_d6271c97`・6 grounding + 2 synthesize・file:line 根拠）**で実構造を監査。下記は確認事実。

---

## 0. 現状監査（grounded・file:line）

| 対象 | 事実 |
|---|---|
| **MovementRealityV0** | `movementReality.ts:60-83`・13 field（8 RealityAttribute + sourceRefs/id/date/subjectiveDate/missingInputs）。**leaveBy instant 値 field なし**。`leaveByKnown: RealityAttribute<boolean>`(:80) は **v0 常に false**（`knownFalse('eta_source_missing_v0')`:128・displayPolicy debugOnly）。`compileMovementReality({date, graph})→MovementRealityV0[]`(:167-186)・transition ごと 1 node・`graph.movementRealityNodes[]` に**node として**載る（edge でない）。 |
| **ern.leaveBy** | `eventRealityNode.ts:105-108`・**`RealityAttribute<string>`（display 寄り・feasibility が `=== null` で読む）・v0 null**。← **`LeaveByComputationV0`(internal object) の置き場ではない**（型も意味も別）。 |
| **assembleRealityGraph** | `realityGraphSnapshot.ts:185`→`RealityGraphSnapshotV0`(:108-156)（ern[]/mv[]/cs[]/decisionDebt/momentSnapshot・2 層 identity）。 |
| **missingInputRefs** | **immutable・never cleared**（dedupeKey で carry・`:239-254`）。known-flag が true に**反転**することで解消を表す（ref 削除でない）。codes: event(place_missing/route_missing/eta_source_missing)・supply(arrival_target_unavailable/buffer_unknown/origin_unavailable/duration_value_missing/scope_incomplete)。 |
| **CollapseRisk / InterventionEligibility** | **本 slice の接続対象ではない**（Risk/Permission 層は RC2b/RC2c で別途存在する。RD2f-bind では leaveByComputed をそれらの **load-bearing input にしない**）。Feasibility(`lib/plan/feasibility/`)は**観測専用**（余白/不足・prescriptive でない）。lateness/deadline は `lsat.ts:computeLsat` のみ・**movement/feasibility から切断済**。departure-line/probability/「間に合う」logic は**未配線**。 |
| **gates** | DISPLAY: `RealityDisplayPolicy`(field: visible/hidden/debugOnly/notActionable) + `SurfaceExposureLevel`(plan: none/internal_only/passive_only/ask_eligible・`surfaceProjection.ts`) + **G4 REDACTION**（L0→L1 irreversible）。NOTIFICATION: Delivery gate。departure surface は `judgmentSurfacePlan.ts:253` で静的 suppress(`departure_suppressed_movement`)。 |
| **typed attach seam** | **存在しない**。`LeaveByComputationV0`/`computeLeaveBy`/`supplyAndResolveLeaveBy` は**まだ誰も import していない** → 「fail-closed」は今は偶然。明示 seam が要る。 |

---

## 1. leaveByKnown の意味 再定義（epistemic・derived-and-bound・≠ display/notify/action）

**裁定**: `leaveByKnown` 名は維持（routeKnown/etaKnown と語彙互換）。ただし意味を厳密化:
- `leaveByKnown.value===true` ≡ **「mobility 層に planning-grade leave-by が RESOLVED」という epistemic 主張**。**「leaveBy instant を表示してよい」ではない**。
- **DERIVE only・hand-set 禁止**（synthesis HIGH: docs `rd2d-b0:121` の「leaveByKnown ← leaveByComputable」は over-claim）。導出:
  ```
  deriveLeaveByKnown = (cap, computed) =>
    cap.leaveBy.leaveByComputable === true
    ∧ computed.status === "computed"
    ∧ leaveByComputationViolations(computed).length === 0
    ∧ cap.planning.timeEstimateUsableForPlanning === true
    ∧ buffer present ∧ fresh
    ∧ computed.originUsabilityKind ∈ ComputedOriginKind（current_location 不可）
  ```
  → `leaveByComputable` 単独では **true にしない**。
- displayPolicy は **debugOnly**（v0）→ **構造的に表示されない**。
- **leaveByKnown ≠ 表示許可・notification 許可・action 許可**（不変条件として明文化）。
- **evidence 語彙を分離**（synthesis M）: v0=`leaveby_supply_pending_v0`（etaKnown の `eta_source_missing_v0` を流用しない）・supply 後は具体 blocker（`leaveby_origin_unusable`/`leaveby_buffer_unknown`/`leaveby_arrival_not_fixed`）。
- 名前候補（補助 internal）: `leaveByComputedInternal`(boolean)・exact instant は別 internal field（§2）。

---

## 2. LeaveByComputationV0 の接続点（典型 hole を封鎖）

**接続点 = `EventRealityNodeV0` の新 optional field `leaveByComputed?: LeaveByComputationV0`**（到着 event node）。**`ern.leaveBy`（display string）に載せない**（synthesis L+H: feasibility が `=== null` で読むため over-claim を生む）。
- `ern.leaveBy`（RealityAttribute<string>）は **v0 null のまま**（departure-display 用・未配線）。
- 新 `ern.leaveByComputed`（internal object・displayPolicy internalReference/debugOnly）が computed leaveBy の置き場。
- **typed attach seam（唯一の入口・新 module `leaveByGraphBinding.ts`）**:
  ```
  attachComputedLeaveBy(ern, computed): EventRealityNodeV0
  ```
  境界で**必ず**:
  1. `leaveByComputationViolations(computed) === []`（再検証）。
  2. `containsRawLocation(JSON.stringify(computed).toLowerCase()) === false`（`routeEtaSafety` 再利用・leak-scan）。
  3. `computed.originUsabilityKind ∈ ComputedOriginKind` ∧ `originEvidencePresent`（current_location 再 attest）。
  4. **staleness**: `computed.timeContract.evaluatedAt` が消費 snapshot の RealityInstant と bounded skew 内（超過→recompute-or-suppress）。
  5. いずれか不成立 → **attach しない**（ern.leaveByComputed 未設定 = uncomputed 扱い）。
- これで「attach 境界で再検証・leak-scan・origin/staleness 再 attest」が**enforced**（今の偶然 fail-closed を構造化）。

---

## 3. missingInputRefs 合流（clear でなく recompile・immutable）

- **missingInputRefs は消さない**（immutable carry・`:239-254`）。**recompile（実 supply 後の再計算）で known-flag が true に反転**することで解消を表現。route/eta/leaveBy missing は **recompile 経由のみ**で消える（filter 削除でない）。
- **display/action missing とは独立**（route/eta/leaveBy が known になっても display/action missing は残す）。
- supply の missingInputs（arrival_target_unavailable 等）は **MovementReality.missingInputs / graph missingInputRefs に trace として合流**（reason code のみ・user 文面でない）。
- **テスト契約（実装時）**: route/eta/leaveBy missing は recompile 後にのみ消え・display/action missing と独立に残る。

---

## 4. routeKnown / etaKnown / leaveByKnown の関係（heuristic は never known）

- **leaveByKnown ⇒ etaKnown ⇒ (route or schedule backed)**。leaveBy は planning-grade duration（external_route/cached_route/scheduled/user_confirmed のみ）を要するため、heuristic/straight-line では **絶対 known にしない**（durationProjectionGradeOk allowlist と整合）。
- routeKnown=false でも leaveBy computed はあり得るか: **scheduled / user_confirmed basis** は routeShape なしで duration を持てる（transit 時刻表・user 申告）。その場合 routeKnown は false でも etaKnown/leaveByKnown は true 可。ただし **heuristic basis は不可**。
- `timeEstimateUsableForPlanning`(capability) は **etaKnown の必要条件**（movement 層 flag は capability 由来）。`arrivalProjectionKnown` は leaveByComputed の必要条件の 1 つ（cap.leaveBy.leaveByComputable 経由）。
- **cross-node coherence 不変条件**（synthesis HIGH）: 同一 transition の (ern, mv) で `NOT( mv.leaveByKnown.value===true ∧ (ern.leaveByComputed undefined ∨ status≠computed) )`。assembleRealityGraph か momentSnapshotViolations で assert。

---

## 5. Feasibility / CollapseRisk 接続（non-load-bearing・over-claim 防止）

- **computed leaveBy があるだけで feasible=true / risk low にしない**（leaveByComputed を Risk/Feasibility の load-bearing input にしない）。
- **feasibility over-claim 封鎖**（synthesis HIGH・`feasibilityJudgment.ts:324`）: feasibility は `ern.leaveBy.value===null` で resolution を読む。computed leaveBy を `ern.leaveBy` に載せると誤って「resolved」= optimism になる → **§2 で別 field にする**。feasibility は **typed predicate `isLeaveByComputed(ern)`（attach 済 ∧ status computed のみ true）で読む**・かつ leaveBy 解決を **feasibility optimism に対し non-load-bearing** にする（leaveBy は missing 解消材料の一部であって feasible 判定材料ではない）。
- **deadline / departure line / lateness 判断は別 slice**（lsat は切断維持）。**no probability / no「間に合う」/ no「遅れる」**。

---

## 6. Permission / Surface / Delivery gate（leaveBy は permission を緩めない）

- leaveBy computation は **permission を緩めない**（otherPeople/reservation/work/sensitive gate は不変）。
- **display は SurfaceExposureLevel(ask_eligible 以上) + G4 REDACTION が必須**（leaveByComputed の displayPolicy は internalReference/debugOnly ゆえ default 非表示）。
- **notification は Delivery gate 必須**。
- **INV-DEP-A 4-conjunct 述語**（synthesis HIGH・departure surface だけでなく clarification question も同 gate）: departure 系 ref（departure line **および** 出発時刻 back-calc を促す clarification question）は **`leaveBy.status==='computed' ∧ violations==[] ∧ leaveByKnown ∧ mobilityStatus 解決`** の全充足時のみ存在可。`judgmentSurfacePlan.ts:253` の departure suppress 解除条件をこの述語に縛る。
- internal preview に raw leaveBy（exact instant）を出すかは **別判断**（§7）。

---

## 7. preview / dogfood 方針（RD2f-0 では実装しない・将来設計）

- v0 preview: **internal debug only**（leaveByComputed は debugOnly field）。
- 出してよい候補（将来）: **safe boolean のみ**（`leaveByKnown` / `leaveByComputedInternal`）・「leaveBy internal computed」表記のみ。
- **exact timestamp は departure-line boundary まで HOLD**（preview にも raw instant を出さない）。
- preview は consumer-facing surface ゆえ SurfaceExposureLevel + G4 を経由（internal-only の境界を破らない）。

---

## 8. RD2f 実装候補（次段・各々別 GO）

| slice | 内容 | 新規 |
|---|---|---|
| **RD2f-bind** | `attachComputedLeaveBy`(seam・再検証/leak-scan/origin/staleness) + `ern.leaveByComputed?` + `deriveLeaveByKnown` + cross-node coherence invariant。**✅ 実装 `da1fff96`**（staleness は RD2f-assembly で追加） | `leaveByGraphBinding.ts` + ern/mv 型 additive + tests |
| **RD2f-assembly** | enrichment pass `assembleLeaveByBindings`（compile→assemble の間・ern[] 駆動・cardinality/orphan/discard/staleness）。**設計 → `docs/reality-leaveby-assembly-injection-rd2f-assembly-0.md`（RD2f-assembly-0）**。**mv 不変**（leaveByKnown 反映は別 RD2f-mv・invariant 緩和要） | `leaveByAssembly.ts` |
| **RD2f-feasibility-guard** | `isLeaveByComputed` predicate・feasibility を non-load-bearing 化（over-claim 封鎖） | feasibility 局所 + tests |
| **RD2f-surface（後段）** | INV-DEP-A 述語で departure surface / clarification question を gate（**表示はまだ HOLD**） | judgmentSurfacePlan 局所 |
| **departure line（ずっと後段）** | user-facing 表示 | RJ2/Surface/Delivery |

**推奨順**: RD2f-bind（internal 接続・表示なし）→ RD2f-feasibility-guard → 表示系は HOLD（CEO 判断）。

---

## 9. Department Responsibility Matrix（RD2f-0・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Mobility/Build** | R | attach seam・leaveByKnown derive・coherence invariant・feasibility non-load-bearing |
| **Context/Temporal** | C | staleness（evaluatedAt skew）・recompile 契約 |
| **Permission** | C | leaveBy が permission を緩めない・current_location 再 attest・leak-scan |
| **Risk** | C | feasible/risk over-claim 防止・departure 系 INV-DEP-A・no lateness |
| **Communication** | C | display/notification gate・preview は safe boolean のみ・exact instant HOLD |
| **CEO** | A | RD2f-bind 実装 GO・departure line / preview surface GO（別） |

---

## 10. RD2f 実装 GO 可否 自己判定

- 接続は **internal-only で構造化可能**: `ern.leaveByComputed?`（別 field）+ typed seam `attachComputedLeaveBy`（再検証/leak-scan/origin/staleness）+ `deriveLeaveByKnown`（leaveByComputable 単独禁止）+ cross-node coherence。migration なし。
- **最重要 hole は封鎖済（設計上）**: (a) feasibility over-claim → 別 field + isLeaveByComputed + non-load-bearing。(b) leaveByKnown over-claim → derived-and-bound。(c) attach 境界の再検証/leak/staleness/origin。(d) departure 系 INV-DEP-A（line も question も）。(e) missingInputRefs は recompile-only。
- **表示・notification・departure line・lateness は本 slice 外**（HOLD）。preview も safe boolean のみ・exact instant HOLD。
- **RD2f-bind は実装可能水準**。ただし GO は CEO 専管。本書はコードを含まない。
