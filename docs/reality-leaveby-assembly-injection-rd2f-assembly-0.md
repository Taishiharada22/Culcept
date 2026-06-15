# RD2f-assembly-0 — LeaveBy enrichment pass 注入設計（docs-only）

- 日付: 2026-06-15 / 位置づけ: RD2f-bind（`da1fff96`）の `attachComputedLeaveBy` を使い、`leaveByComputed` を RealityGraph assembly の**どこで・どの条件で・どう注入するか**を実装前設計。**まだ実装ではない**。leaveByComputed は依然 internal-only。
- 規律: 本書は**コードを書かない**。assembly/MovementReality/Feasibility/CollapseRisk/Intervention/Surface/preview/departure line/notification/DB write には進まない。
- 方法（CEO ①②③ + ultracode）: **adversarial workflow（`wf_028e4af8`・4 grounding + 2 synthesize・file:line 根拠）**で assembly mechanics を監査。下記は確認事実。

---

## 0. 現状監査（grounded・file:line）

| 対象 | 事実 |
|---|---|
| **assembleRealityGraph** | `realityGraphSnapshot.ts:185-309`。**ern[]/mv[] を pre-built input として受け取る**（`AssembleRealityGraphInput.ern: ReadonlyArray<EventRealityNodeV0>`:158-169）。内部で ern を**構築しない**・attachComputedLeaveBy を**呼ばない** → **enrichment は assembleRealityGraph の前**でなければならない。 |
| **compileEventRealityNodes** | `compileEventRealityNodes.ts:223`。`{date, graph, anchors, sources?}` → `EventRealityNodeV0[]`。**leaveBy computation を知らない**（混ぜない）。 |
| **integration 呼び順** | `operatorDayPreview.ts:86-97`（+ `dogfoodPreview.ts:~137`）: (1)compileEventRealityNodes→ern[] (2)compileMovementReality→mv[] (3)compileCommitmentSignals→cs[] (4)deriveDecisionDebt (5)deriveMomentSnapshot (6)assembleRealityGraph({ern,mv,cs,momentSnapshot})。**(2) と (6) の間が enrichment 注入点**。 |
| **MovementReality.leaveByKnown** | `movementReality.ts:128` `knownFalse('eta_source_missing_v0')`（inferredAttribute(false,0.9,debugOnly)）。**`movementRealityViolations`(:205-211) が「v0 は false 必須」を hard 強制** → **leaveByKnown=true は既存 invariant 違反**。 |
| **id-binding key** | `scope.targetNodeId` ≡ 到着 ERN の **`eventRealityNodeId`**（`"ern:YYYY-MM-DD:anchorId"`）。dayGraphNodeId でも anchorId でもない。安全 key = **full-string 等価** `eventRealityNodeId === computed.subjectNodeId === computedScope.targetNodeId === ernScope.targetNodeId`。anchorId 部分文字列を parse しない。 |
| **supply output** | `supplyAndResolveLeaveBy → { bundle, leaveBy }`。**`leaveBy`(LeaveByComputationV0) のみ bind 可・`bundle` は consumer に出さない**（discard）。 |
| **enrichment 先例** | `leaveByGraphBinding.ts:attachComputedLeaveBy` 自体が「compiled node + 追加材料 → optional field 付き enriched node」の pure pattern。これを loop で回すのが本 slice。 |

---

## 1. assembly 注入点（4 案比較 → separate enrichment pass）

| 案 | 評価 |
|---|---|
| compileEventRealityNode 内で注入 | ✗ ERN compile の責務を汚す・leaveBy は route/origin/buffer/duration の複合 fuel ゆえ Event 単体 compile に混ぜると重い |
| assembleRealityGraph 後に enrichment | ✗ snapshot は immutable・assembleRealityGraph は ern を pre-built 受領ゆえ後段で書くと identity/sort/missingRefs と不整合 |
| RD2e-SUPPLY 側から ERN へ直接 | ✗ direct assignment 禁止・attach seam を bypass |
| **separate enrichment pass**（推奨・CEO） | ✓ **`assembleLeaveByBindings(...)` を compileMovementReality と assembleRealityGraph の間**に置く。ern compile 不変・attach seam で再検証・mv/missing と分離容易 |

**設計**: `assembleLeaveByBindings({ ern: ERN[], supplyByNodeId, consumingInstant }) → { ern: ERN'[], trace }`（pure・(2)→(6) の間で実行）。出力 ern' を assembleRealityGraph に渡す。

---

## 2. input source 設計

- **ern[] を authoritative set として loop を駆動**（supply bundle 側から駆動しない）。各 ERN に対し `ern.eventRealityNodeId` で supply を引く。
- supply は `supplyAndResolveLeaveBy` の結果から **`{ leaveBy }` のみ destructure・`bundle` は即破棄**（consumer に出さない）。
- **id 等価で bind**: `computed.subjectNodeId === ern.eventRealityNodeId`（full-string・parse しない）。
- **cardinality guard**: `Map<eventRealityNodeId, LeaveByComputationV0[]>` を作り、**length ≠ 1 の key は attach しない**（複数候補/0 候補 → ERN 不変）。
- **orphan drop**: supply の targetNodeId が ern[] に**存在しない**ものは drop（trace に記録・どの ERN にも attach しない）。
- **supply なし ERN = 厳格 no-op**: 元の ERN 参照をそのまま返す（computed を構築せず seam も呼ばない）。
- **non-empty id guard**: `subjectNodeId`/`targetNodeId`/`eventRealityNodeId` が null/空/空白なら reject（attach しない）。

---

## 3. EventRealityNode への注入条件

- **`attachComputedLeaveBy` を必ず通す**（direct assignment 禁止・唯一の writer）。
- attach は RD2f-bind の再検証（status==computed / `leaveByComputationViolations`空 / displayPolicy internal / sourceTimeEstimateRef / bufferRef / origin evidence / `containsRawLocation` leak / scope 4 次元）+ **本 slice 追加の staleness gate**（§下記）を全通過時のみ。
- **staleness gate（rd2f-0 §2 step4 を実装化）**: `consumingInstant: RealityInstant` を渡し、`|computed.timeContract.evaluatedAt − consumingInstant| > bounded skew` なら新 violation `computation_stale` で attach 拒否（recompute-or-suppress）。
- 不成立（uncomputed / scope mismatch / raw leak / stale / cardinality≠1）→ **attach せず safe trace へ**（reason code のみ・raw echo なし）。

---

## 4. MovementReality との関係（本 slice は mv を触らない）

- **RD2f-assembly は `ern.leaveByComputed` のみ attach・mv は一切変更しない**（synthesis HIGH: `leaveByKnown=true` は `movementRealityViolations:205-211` の v0-false hard invariant を**直接違反**するため）。
- `deriveMovementLeaveByKnown`（RD2f-bind で実装済の pure helper）は**本 slice では wire しない**。mv.leaveByKnown を true にするには **v0-false invariant の緩和**が要る → **別 slice「RD2f-mv」**（invariant 変更 + deriveMovementLeaveByKnown 配線・CEO 専管）。
- routeKnown / etaKnown / mobilityStatus / missingInputs を**勝手に変更しない**。

---

## 5. missingInputRefs 方針

- **assembly で直接消さない**（immutable carry）。computed leaveBy は `ern.leaveByComputed`（attached field）として表現するのみ。
- recompile / 次 graph assembly で missing が**自然に減る**設計（本 slice は missing を mutate しない）。
- **display/action missing は別扱い**（route/eta/leaveBy missing と独立）。
- supply の missingInputs（arrival_target_unavailable 等）は **internal trace** で保持（reason code のみ・文面生成しない）。

---

## 6. Feasibility / CollapseRisk / Permission 非接続

- enrichment は Feasibility / CollapseRisk(RC2b) / InterventionEligibility(RC2c) / Permission を**変えない**（leaveByComputed を load-bearing input にしない）。
- computed leaveBy で「間に合う」「遅れる」「safe」を**出さない**・**no probability / no deadline assertion**。
- feasibility は引き続き `ern.leaveBy`（display string・null）を読む。`ern.leaveByComputed`（別 field）は feasibility が読まない。

---

## 7. consumer / surface / preview 境界

- **`ern.leaveByComputed` を consumer payload に出さない**（`EVENT_REALITY_ATTRIBUTE_KEYS` 非含有ゆえ attribute-key 投影に乗らない）。
- **exact timestamp を preview に出さない**・surface / copy / notification へ出さない。
- dogfood preview に出すとしても**別 slice で safe boolean のみ**検討（leaveByKnown 相当・exact instant でない）。
- **departure line boundary まで exact timestamp HOLD**。
- **bundle を ERN/mv/snapshot のどこにも保存しない**（leaveBy のみ・bundle discard）。

---

## 8. RD2f 実装候補（次段・各々別 GO）

| slice | 内容 | 新規 |
|---|---|---|
| **RD2f-assembly** | `assembleLeaveByBindings`(pure pass・ern[] 駆動・cardinality/orphan/no-op/discard) + RD2f-bind に **staleness(consumingInstant/`computation_stale`) + non-empty id guard** 追加 | `leaveByAssembly.ts` + binding 局所追加 + tests。**mv 不変** |
| **RD2f-mv（別・invariant 変更）** | `movementRealityViolations` の v0-false 緩和 + `deriveMovementLeaveByKnown` 配線（leaveByKnown debugOnly 維持） | movementReality 局所・**CEO 専管**（hard invariant 変更） |
| **RD2f-feasibility-guard** | `isLeaveByComputed` predicate・feasibility non-load-bearing | feasibility 局所 |
| **wiring（preview 統合）** | operatorDayPreview/dogfoodPreview に assembleLeaveByBindings を挿す（表示なし） | preview caller 局所 |

**推奨順**: RD2f-assembly（ern enrichment・mv 不変・表示なし）→ RD2f-feasibility-guard → RD2f-mv（invariant 緩和）→ 表示系 HOLD。

---

## 9. tests 計画（RD2f-assembly 実装時）

1. supply 完結 ERN → attachComputedLeaveBy 経由で leaveByComputed attach
2. supply なし ERN → 不変（同一参照・leaveByComputed undefined）
3. orphan supply（targetNodeId が ern[] に無い）→ drop・どの ERN も不変
4. 同一 ERN に複数候補 → cardinality≠1 → attach しない
5. uncomputed/violation/scope mismatch/raw leak → attach しない
6. **staleness（evaluatedAt が consumingInstant と乖離）→ computation_stale → attach しない**
7. non-empty id guard（空 id）→ attach しない
8. bundle は ERN/snapshot に保存されない（source-scan・leaveBy のみ bind）
9. mv は不変（leaveByKnown false 維持・movementRealityViolations green）
10. missingInputRefs を直接消さない（source-scan）
11. feasibility/CollapseRisk/permission を変えない（source-scan）
12. attachComputedLeaveBy が leaveByComputed の唯一 writer（tripwire・source-scan）
13. RD2 targeted tests pass / tsc 55

---

## 10. Department Responsibility Matrix（RD2f-assembly-0・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Mobility/Build** | R | enrichment pass・id binding・cardinality/orphan/discard・staleness gate |
| **Context/Temporal** | C | consumingInstant skew・recompile 契約 |
| **Permission** | C | bundle 非露出・raw leak-scan・leaveByComputed consumer 非露出 |
| **Risk** | C | feasibility/risk/permission 非接続・no probability |
| **Communication** | C | preview safe boolean のみ・exact instant HOLD |
| **CEO** | A | RD2f-assembly 実装 GO・RD2f-mv(invariant 変更)・preview/departure surface GO |

---

## 11. RD2f-assembly 実装 GO 可否 自己判定

- 注入は **separate pure pass（compileMovementReality→assembleRealityGraph の間）+ attachComputedLeaveBy 唯一 writer** で構造化可能。migration なし。
- **mv 不変**にすることで `movementRealityViolations` の v0-false invariant を**温存**（leaveByKnown 反映は別 slice RD2f-mv）→ 本 slice は低リスク。
- 封鎖すべき hole は設計済: ern[] 駆動 / cardinality Map / orphan drop / no-op same-ref / bundle discard / **staleness(consumingInstant)** / non-empty id / 唯一 writer tripwire。
- staleness + non-empty id は RD2f-bind の `attachComputedLeaveBy` に**小追加**（実装時）。
- **RD2f-assembly は実装可能水準**（mv 不変・表示なし）。GO は CEO 専管。本書はコードを含まない。
