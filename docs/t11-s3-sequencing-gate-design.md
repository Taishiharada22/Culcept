# S1+S2 Closeout + S3 Sequencing / Day-Assignment Gate Design（docs-only・S3 は HOLD）

**作成日**: 2026-06-14 / **ステータス**: docs-only・実装なし・**S3 は HOLD**（別 CEO gate）・stop after report。
**スコープ**: Travel 専属。**禁止**: 実装・外部/route/weather/place/Maps/OTA API・fetch/DB/M2 runtime・booking/calendar/action authority・捏造（day/order/placement guess）・hidden 最適化 objective・本番 `/plan`・push。

**★前提を疑った reframe（directive ①⑦・GPT 仕様を鵜呑みにしない・自前 adversarial review で精緻化）**:
1. **S3 は「TSPTW」ではない**。TSPTW は time window 下の**最小コスト巡回**= 最適化問題で、本プロダクトは最適化を拒否する。正しい定式化は **Disjunctive Temporal Problem (DTP) feasibility**（Stergiou–Koubarakis 2000; Tsamardinos–Pollack 2003）= S2 の STN に **disjunction**（no-overlap `(e_A≤s_B)∨(e_B≤s_A)`・reorderable）を載せ、**整合する disjunct 選択の存在と構造を求める feasibility 問題**。cost objective を持たない。
2. **★出力は「全 feasible sequence の列挙(8!)」でも「per-pair の独立 flat list」でもない — 半順序 P**。最も重要な設計判断: feasible 順序の集合 = **半順序 P の線形拡大の集合**。**A→B が FORCED ⇔ 逆 disjunct `e_B≤s_A` を STN に足すと大域不整合**（= B→A 不能）。これを **O(n²) STN probe（flip-and-test）** で計算 — **8! 列挙でない**。`P` = FORCED 半順序。CHOICE = `P` の非比較 pair。**★coupling を明示**: P の推移性が依存を符号化するので、結合した choice は**独立 toggle として出さず複合 choice として提示**（"A→B→C か C→B→A"）。これで「3 つ自由」と誤示して残りを黙って解決する agency 崩壊を防ぐ。
3. **day-assignment 列挙は S3 に入れない**（捏造防止）。多日は **explicit `nodeDayBindings` のみ**・無ければ fail-closed。day 列挙は**別 future gate**。CAP=8 は **per-day**（per-trip でない）。

---

## §1 Closeout（S1+S2）
**完成（committed `74b98817`）**:
- **S1 型壁** `solver-schedule-types.ts`: authoritative vs shared placement basis 二層（`forced_by_private_constraint` server-only・`projectSharedPlacementBasis`→`constrained`）・`tiebreak_shortest_route`・数値入力（`SolverLockBoundInput`/`SolverTimeBoundInput`/`SolverScheduleInput`）・`LOCK_ORDERING_KINDS` 7 + `ORDERING_LOCK_BINDING`・`EventRegion`/`TemporalFeasibilityResult`・`PlacedNode`/`ScheduleProvenance`/**`ScheduleChoicePoint`**(kind: day_assignment_choice|ordering_choice|time_window_choice・`feasibleOptions`/`provisionalDefault`/`namedTieBreak`/`rationale`)/`SolverInfeasibility`/`SolverSchedule`・`MATERIAL_SLACK_THRESHOLD_MIN=15`/`SCHEDULE_NODE_CAP_PER_DAY=8`。`SOLVER_INPUT_GAP_KINDS` を 5 additive 拡張。
- **S2 STN feasibility-region** `solver-stn-feasibility.ts`: `computeTemporalFeasibility`（Floyd–Warshall・earliest/latest・negative cycle→infeasible・forced=点 collapse）・`computeSharedTemporalFeasibility`（private narrowing 非漏洩）・missing→fail-closed gap・descriptor 非 parse・derive_shortest 無 metric→gap。

**今完成**: explicit 制約に対する**時間 feasibility-region**。**順序を選ばず・node を配置せず・itinerary を産まない**。
**HOLD のまま**: **S3**（sequencing/no-overlap feasibility = 半順序 P）・S4（forced-vs-choice 確定 + provisional default + AssemblyInput emission）・S5（minimal-perturbation 再計画）・day-assignment 列挙（別 gate）。

---

## §2 現在の solver stack
```
intake → CompositionDraft (T11-B)                                   [DONE]
       → SolverFeasibilityReport (T11-C, classifyFeasibility)        [DONE・gate]
       → S1 solver 型壁                                              [DONE]
       → S2 TemporalFeasibilityResult (STN region)                  [DONE]
       → ★S3 sequencing/no-overlap feasibility (半順序 P)            [本書設計・HOLD]
       → S4 forced-vs-choice 確定 + provisional default → AssemblyInput [HOLD]
       → AssemblyReadiness (A・assemblyReady ⊂ feasible)             [DONE]
       → assembleScheduledDraft → ScheduledTravelItineraryDraft (A・copy-only) [DONE]
```
**S3 が足すもの**: S2 は固定制約の時間 region を出すが、(a) 同日 node の**順序**を選ばない、(b) 未順序 node の **pairwise no-overlap** を強制しない、(c) **reorderableHint** を解決しない。S3 はこの**組合せ feasibility 層**を **hidden optimizer にならず**担い、**半順序 P（FORCED）+ 非比較 pair（CHOICE）**を出す。**day 割当は explicit binding のみ**消費（列挙しない）。

---

## §3 S3 問題の定義
- S2 は固定制約に対し時間 region を計算できる。
- だが S2 は **sequence を選ばない**・**未順序 node 間の pairwise no-overlap を強制しない**・**reorderable hint を解決しない**。
- S3 は組合せ層を **hidden optimizer にならず**扱う: **∃ 整合 sequence（DTP 充足）か**、**半順序 P（どの順序が FORCED か）**、**非比較 pair（CHOICE）とその coupling** を出す。**day 割当は与えられた binding のみ**（列挙しない・§10）。

---

## §4 なぜ S3 が hard gate か（+ 正直な複雑性）
- **★ 正しくは DTP feasibility（TSPTW 最適化でない）**: 単一旅行者 = single machine、no-overlap = disjunction、目的は**整合性**（最小コストでない）。
- **★ 正直な複雑性**: 半順序 P は **O(n²) の flip-and-test**（各 directed pair に逆 disjunct を足し Floyd–Warshall O((2n)³) で大域整合性を 1 回検査）で計算 — **8! 列挙でない**。残る自由（P で全順序化されない node）は通常 0-2 個で、その小 cluster 内のみ feasible 順序を列挙（k! で k=自由 node 数・微小）。**CAP=8 は per-day**（day 割当が explicit binding で固定された時のみ per-day 独立に bound）。**day 割当を列挙すると per-trip で 8! の bound は崩れる → ゆえ day 列挙は S3 に入れない（§10）**。
- 杜撰な実装は (a) **複数解を黙って 1 つに collapse して agency を奪う**、(b) **day/order/placement を捏造**し得る。ゆえ **別 CEO 承認**が必要。

## §5 S3 許可入力
S2 `TemporalFeasibilityResult`(feasible_region) / `SolverScheduleInput`・`CompositionDraft.candidateNodes`/`edges`/`reorderableHints`/`solverHints`・explicit `nodeDurations`/`edgeDurations`/`nodeDayBindings`(供給時)/`scope`/数値 lock 窓/数値 time bound/explicit route metric。**外部データなし**。

## §6 S3 禁止入力
fit ranking を order objective に**しない**・raw `FitResult` なし・M2 runtime なし・live route/weather/place なし・source popularity を quality/order metric に**しない**・hidden objective weight なし・shared 出力に private 制約を**入れない**。

---

## §7 S3 出力の選択肢
| 案 | 形 | 評価 |
|---|---|---|
| A. FeasibleSequenceSet (flat list) | 全 feasible 順序を列挙 | ★**不可**（最大 8!・noise・scale しない） |
| B. ChoicePoint only | choice のみ・forced 出さない | forced の provenance 欠落 |
| C. 決定的 canonical sequence | 単一順序 | **複数解を黙って collapse = agency 消費** |
| **D'. 半順序 P + 複合 choice（推奨・GPT D を精緻化）** | feasibility 検証 + **半順序 P(FORCED)** + 非比較 pair を `ScheduleChoicePoint` で（**coupling は複合 choice**）+ 透明 provisional default | scale する（O(n²)）・forced は provenance・**依存を明示**・agency 保持 |

**推奨 = D'**。出力（**既存 `ScheduleChoicePoint` を再利用・新 `SequenceDecision` は作らない**）:
```ts
// proposed (未実装・S3-B で定義)
interface SequencingFeasibilityResult {
  outcome: "feasible_space" | "infeasible" | "needs_input"; // ★ split は needs_input に畳む(split_day_required は gap)
  // feasible_space:
  forcedOrder?: Array<{ from: string; to: string }>;   // 半順序 P（FORCED precedence・transitive reduction）
  choicePoints?: ScheduleChoicePoint[];                 // ★ 既存 S1 型を再利用（非比較 pair・coupling は 1 つの ordering_choice に複合）
  // infeasible:
  infeasibility?: SolverInfeasibility;                  // conflictSet reason ∈ UnsatisfiedConstraintReason
  // needs_input:
  missingForSchedule?: SolverInputGap[];                // split_day_required / day_assignment_missing 等
  authoritative: false; draft: true; candidateId: string;
}
```
**FORCED 計算（半順序 P・O(n²)）**: 各 directed 同日 pair (A,B) に逆 disjunct `e_B ≤ s_A` を base STN に足す → 大域不整合なら **A→B FORCED**（`forcedOrder` に追加）。**CHOICE 計算**: P で順序化されない pair = 非比較 → `ScheduleChoicePoint{kind:"ordering_choice"}`。**coupling**: P で全順序化されない自由 node の小 cluster 内のみ feasible 順序を列挙（k! 微小）し、結合した自由は**1 つの複合 `ordering_choice`**（feasibleOptions に joint 順序）として提示。**★S3 は AssemblyInput / `PlacedNode` 最終値を産まない**（S4・§14）。

---

## §8 CAP 政策
- **CAP=8 node/day**（`SCHEDULE_NODE_CAP_PER_DAY`・per-day）。
- 超過 → **`needs_input` + `split_day_required` gap**（既存 gap・独立 outcome arm にしない）。
- **heuristic/nearest-neighbor/近似 TSP/silent truncation なし**。
- **CAP は組合せ計算の前に enforce**（per-day node count をまず数え、>8 なら flip-and-test/列挙に入らず split）。

## §9 no-overlap 政策（半順序 + flip-and-test）
- 同日 node は重ならない: 未順序の同日 pair (A,B) に disjunction `(e_A≤s_B)∨(e_B≤s_A)`。
- **FORCED/CHOICE 判定（O(n²)・8! 列挙でない）**: pair (A,B) に対し ①`e_B≤s_A`（B→A）を STN に足し大域不整合なら **A→B FORCED**、②`e_A≤s_B`（A→B）を足し不整合なら **B→A FORCED**、③どちらも整合 → **CHOICE**（非比較）、④**両方不整合 → no-overlap 不能 → infeasible**（reason = **`no_feasible_placement`**・新 reason を作らない）。
- **overlap を node 移動で「修復」しない**（移動が explicit/承認 enumeration の一部である場合を除く）。
- **AssemblyInput を emit しない**（interval/order/day が S4 で確定/選択されるまで）。
- pairwise だけで大域 cycle を見逃さない: flip-and-test は**大域 STN 整合**を見るので、P は大域的に健全（pairwise 近似でない）。

## §10 day-assignment 政策
- single_day → `dayIndex 0`。
- **多日 → explicit `nodeDayBindings` のみ**（無ければ **fail-closed `day_assignment_missing`**・S2 既存挙動踏襲）。
- **★day-assignment 列挙は S3 に入れない**（machine が候補 day を生成するのは placement 捏造の agency 偽装）。day 列挙は **別途承認の future gate**（S3 sub-option でない）。
- **scope から day を推論しない**・**category で auto-bucket しない**。
- day 割当が複数 binding で与えられても S3 は binding を消費するのみ。cross-midnight は別 gap（`cross_midnight_unsupported`・S2 既存）。

## §11 reorderable 政策
- `reorderableHint` は **hint であって order でない**。
- S3 は半順序 P で order alternatives を表す（非比較 pair = 自由）。
- **earliest-feasible に黙って collapse しない**。
- **provisional default は `namedTieBreak ∈ TieBreakRule` 由来のみ**（捏造ゼロの普遍 default は `lexicographic_nodeId`）・**slack ≥ `MATERIAL_SLACK_THRESHOLD_MIN`(=15) の CHOICE は必ず `ScheduleChoicePoint` で提示し自動 pin しない**（契約）。
- fit/advisory は**後段(S4)の透明 tie-break のみ**・hidden objective にならない。

## §12 `derive_shortest_from_terminal` 政策
- **explicit route metric(`edgeDurations`)がある時のみ**・feasible alternatives を**透明 tie-break candidate**(`tiebreak_shortest_route`)として rank してよい（hard 制約を override せず・hidden objective でなく）。
- **metric 欠落 → `ordering_directive_unsupported`**（S2 既存・推論しない）。
- **正直な注記**: provisional default / tie-break は DTP の解集合上の**選択関数**であり、これ自体が退化した objective。ゆえ**名前付き透明 tie-break として明示**（最適化を隠さない）。

## §13 privacy 政策
- private 制約は **authoritative feasible set / 半順序 P** を narrow してよい（server-side）。
- **shared P / choice point は private narrowing を明かさない**: shared 用は **shared-only 制約から再計算**（`computeSharedTemporalFeasibility` を flip-and-test の内側 STN として使い、shared-only で P を再計算）。
- **shared-visible な選択肢を user が選び private 制約に違反 → server が再検証し fail-closed・理由を明かさない**（neutral `constrained`/gap）。
- diagnostics/rationale/provenance/reason label に private 理由を**入れない**。

---

## §14 S4 との関係
- S3 は半順序 P（FORCED）+ 非比較 pair（CHOICE・coupling 複合）を**分類**。
- S4 が後で **forced vs choice を確定**し**透明 provisional default を適用**し **AssemblyInput を emit**。
- S3 は **agency を消費しない**（choice を勝手に決めない）。**S3 単独で最終 AssemblyInput を産まない**。

## §15 assembly との関係
- `AssemblyInput` は explicit interval/day/duration/cost を要求。
- S3 は候補 order feasibility(半順序)を出せるが**必ずしも assembly-ready でない**。
- **`AssemblyReadiness` は依然より厳しい**（interval/budget/transport/cost 全 explicit）。`ScheduledTravelItineraryDraft` は下流のまま（A・copy-only）。

---

## §16 将来 golden test
- CAP=8 通過・CAP=9 → `needs_input`+`split_day_required`。
- 未順序 non-overlap alternatives → `ordering_choice`（flip-and-test 両方整合）。
- hard `must_precede` が P を拡大（FORCED edge 追加）。
- `reorderable` 単独で order を強制しない（非比較のまま）。
- 同日 overlap 不能（両 flip 不整合）→ infeasible（`no_feasible_placement`）。
- ★**coupling**: feasible 順序が {A<B<C, C<B<A} の時、3 pair 全てが個別には CHOICE だが **1 つの複合 ordering_choice**（options=["A→B→C","C→B→A"]）として出る（独立 3 toggle にしない）。
- 多日 binding 有 → 消費・**binding 無 → day を推論しない**（`day_assignment_missing`）・**S3 が day を列挙しない**。
- single_day `dayIndex 0` valid。
- `derive_shortest_from_terminal` 無 metric → fail-closed・有 metric → 透明 tie-break のみ。
- private 制約は authoritative P を narrow するが shared choice 出力に出ない（shared-only 再計算で byte 同一）。
- hidden fit ranking なし・provisional default は namedTieBreak 由来のみ。
- AssemblyInput / ScheduledTravelItineraryDraft / TravelItinerary / TravelCandidate を emit しない。
- 外部 fetch/API/DB/Supabase import なし・app/UI import なし・M2 runtime なし。
- 既存 travel test green・tsc baseline 不変。

---

## §17 承認後の実装スライス
- **S3-A** docs/plan（本書）。
- **S3-B** 型（`SequencingFeasibilityResult`・`forcedOrder` carrier・**既存 `ScheduleChoicePoint` 再利用**・`SequenceDecision` を作らない）。
- **S3-C** CAP guard + **半順序 P 計算（flip-and-test・O(n²)）**（CAP を計算前 enforce・base STN は S2 再利用）。
- **S3-D** no-overlap feasibility + **coupling 検出/複合 choice**（自由 node cluster 内のみ k! 列挙・両 flip 不整合→no_feasible_placement）。
- **S3-E** shared-safe 投影 / privacy guard（shared-only で P 再計算・private narrowing 非漏洩）。
- **S3-F** golden tests（§16）。
- **S4（forced-vs-choice 確定 / provisional default / AssemblyInput emission）の前で STOP**。
- **gating**: S3-C/S3-D が **NP-hard core（DTP）** だが flip-and-test で O(n²)+自由 cluster k! に抑制。CAP=8 enforce と split_day_required を**計算前に**置く。S3-B/S3-E/S3-F は narrow。

## §18 Adversarial review summary（自前 review・適用済）
| sev | 検出 | 補正 |
|---|---|---|
| H | per-pair flat list は coupled 決定を独立 toggle と誤示し agency 崩壊（{A<B<C,C<B<A} で 3 pair 全 CHOICE だが実質 1 自由） | **半順序 P + coupling を複合 choice 化**（独立 toggle にしない） |
| H | day-assignment 列挙が placement 捏造 | day は **explicit binding のみ**・day 列挙は **S3 外の別 gate** |
| H | CAP=8 を per-trip と取れる・8! は day 固定時のみ | **per-day 明記**・FORCED は **O(n²) flip-and-test**（8! でない）・正直な複雑性 |
| M | `SequenceDecision` が既存 `ScheduleChoicePoint` と重複 | **`ScheduleChoicePoint` 再利用**・`SequenceDecision` 廃止 |
| M | `split_required` 独立 arm が S2 と不整合 | `split_day_required` は gap → **`needs_input` に畳む** |
| M | provisional default の規律欠落 | **namedTieBreak 由来のみ**・slack≥15 は提示・default は `lexicographic_nodeId` |
| M | DTP は正しいが provisional default = 退化 objective を hand-wave | **名前付き透明 tie-break として明示**（最適化を隠さない） |
| L | no-overlap 不能の reason 未指定 | **`no_feasible_placement`**（新 reason を作らない） |

## §19 Stop
本 S3 gate 設計 report で停止。**S3 を CEO 承認まで実装しない**。

---

## §20 CEO 判断請求
1. S1+S2（型壁 + STN feasibility-region）を**凍結点**として承認するか。
2. **★reframe**（S3 = TSPTW でなく **DTP feasibility**・出力は 8! flat list でも独立 per-pair でもなく **半順序 P + coupling 複合 choice**・FORCED は **O(n²) flip-and-test**）を正本として承認するか。
3. S3 出力 = **D'（半順序 P + 既存 ScheduleChoicePoint 再利用 + 透明 provisional default）** で良いか。
4. §8-§13 政策（CAP=8 per-day 計算前 enforce / no-overlap flip-and-test・両不能→no_feasible_placement / **day は explicit binding のみ・列挙は別 gate** / reorderable collapse しない / derive_shortest は metric 必須透明 tie-break / privacy shared-only 再計算）で良いか。
5. 実装順 = **S3-A→S3-B(型・ScheduleChoicePoint 再利用)→S3-C(CAP+flip-and-test P)→S3-D(no-overlap+coupling)→S3-E(privacy)→S3-F(tests)・S4 前 STOP** で良いか（各別途 GO・S3-C/D は NP-hard core ゆえ最慎重）。

**本書で停止**。S3 実装は CEO 承認まで着手しない。
