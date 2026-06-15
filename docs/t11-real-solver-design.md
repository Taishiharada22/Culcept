# Scheduled Draft / Solver Gate Closeout + Real Solver Design（真の solver 設計・docs-only）

**作成日**: 2026-06-14 / **ステータス**: docs-only・実装なし・**solver は HOLD**（別 GO まで）・stop after report。
**目的**: ①report(T11-C)→assembly(A) の凍結点を総括し、②**真の solver**（durations+windows+precedence → explicit interval/day/sequence を**計算**し、既存 copy-only assembler に渡す欠落中間層）を設計する。
**スコープ**: Travel 専属。max 1-2 人・day-trip or 1泊2日(nights 1-2)・予約直前まで（handoff・予約しない）。**禁止**: 実装・外部/route/weather/place/Maps/OTA/timetable API・fetch/DB/M2 runtime・booking/calendar/action authority・**捏造（default 60分/duration/dayIndex/window/order の guess）**・ranking 変更・本番 `/plan`・push。

**★設計思想（前提を疑った核心・directive ①⑦）**: これは **generic travel optimizer（スコア最大化の black-box）ではない**。Aneurasync の頂点体験は「この計画は**私の**制約と**私の**選択を反映し、**なぜそうなるか分かる**」。よって真の solver は **可能領域（feasible region）を計算し・強制(FORCED) vs 選択(CHOICE)を分離し・選択は折り畳まず提示する** 3 操作に再定義する。最適化器ではなく **feasibility + agency エンジン**。

**設計根拠の出所**: workflow `w0nn0o8bx`（12 agents）= 2 grounding（実ソース）→ 4 独立アーキテクチャ（lens: temporal-CSP / sequencing-complexity / possibility-preserving-agency / adaptive-correction）→ 2 judge panel（rigor / product）→ 1 synthesize → 3 adversarial verify（field-accuracy / boundary-safety / premise-critic）。**両 judge が同一 synthesis に収束**（STN 中核 + 有界 TSPTW + forced-vs-choice + minimal-perturbation 再計画[deferred]）。adversarial が **14 補正（4 HIGH / 7 MED / 3 LOW）** + 型横断補正を検出し全反映（§13）。

**学術基盤**: Simple Temporal Network（Dechter–Meiri–Pearl 1991）/ Floyd–Warshall・Bellman–Ford / TSPTW = single-machine scheduling with sequence-dependent setup times & time windows（NP-hard・n≤8 で Held–Karp O(2ⁿn²) exact）/ QuickXplain IIS（Junker 2004）/ minimal-perturbation dynamic CSP（Verfaillie–Schiex; Barták）。**★n≤8 では feasible 状態空間を直接列挙でき、QuickXplain/iterative-deepening は fallback 形式**（【ADV-fix LOW】enumerate-first はユーザに全 feasible 集合を見せられる点で agency も強い）。

---

## Part 0 — Gate Closeout（凍結点）
**完成（committed）**: 
- COMPOSITION (T11-B): `buildCompositionDraft` → `CompositionDraft`{candidateNodes:PreSolverNode[](startMin/endMin/dayIndex omit), edges:PreSolverEdge[](durationMin omit), reorderableHints, solverHints:SolverOrderingHint[], constraints:TravelConstraint[], unsatisfiedConstraints, hardBlockers, fallbackBranches}。
- SOLVER-BOUNDARY REPORT (T11-C): `classifyFeasibility(SolverFeasibilityInput): FeasibilityClassification{state, infeasibleConstraints}`・`detectScheduleGaps`・`buildSolverFeasibilityReport`（report builder は別モジュール `solver-feasibility-report.ts`）。
- ASSEMBLY (A): `assembleScheduledDraft(AssemblyInput)` = **copy-only**（explicit `nodeIntervals`/`nodeDayBindings`/`edgeDurations`/… を copy）→ `ScheduledTravelItineraryDraft`。`assemblyReady ⊂ feasible`。

**★ solver が埋める gap**: durations + lock windows + precedence + day scope → **explicit interval(startMin/endMin) + dayIndex + sequence を計算** = `AssemblyInput` がまさに要求する explicit 値を produce。**solver 出力 → AssemblyInput → 既存 copy-only assembler → ScheduledTravelItineraryDraft**。solver は report と assemble の間の欠落中間。

**型横断補正（両 judge が source proposal の誤りとして指摘・本設計で是正済）**:
- `ORDERING_KINDS` = **11**（must_precede, luggage_drop_enables, reorderable, derive_shortest_from_terminal + **lock 7 種**: timed_entry_lock, last_departure_lock, open_hours_window_lock, checkin_window_lock, checkout_window_lock, meal_time_lock, reservation_window_lock）。**lock は 7 種（9 でない）**。
- `PRE_SOLVER_EDGE_KINDS` は **4**（route_transition, must_precede, luggage_drop_enables, lock_implied）。**lock 種は edge kind でない** — `OrderingConstraint.kind` として `CompositionDraft.solverHints:SolverOrderingHint[]` で届く。lock 窓 bound は SolverOrderingHint/OrderingConstraint から作る（edge kind からでない）。
- `node_interval_missing` は **`AssemblyGapKind`**（`SolverInputGapKind` でない）。gap 語彙を層に正しく振り分ける。
- 2 つの `lockWindows` は別形: solve 時 `SolverFeasibilityInput.lockWindows: Record<constraintId, boolean>`（presence flag）vs assembly 時 `AssemblyInput.lockWindows: Record<placeRefId, ExplicitLockWindow>`。**bridge が必要**。

---

## §1 前提を疑う — なぜ generic optimizer でないか
generic travel optimizer は scalar objective（距離最小/fit 最大）を定義し、それを最大化する単一 schedule を黙って出す = **black-box が user の代わりに決める**。Aneurasync が禁じる挙動。再定義（3 つの非最適化操作）:
1. **点でなく可能領域を計算**: trip を STN として、各 event の `[earliest, latest]`（取り得る区間 = 整合 schedule 全体）を多項式時間で得る。**値を発明できない**（explicit 制約が含意する範囲を narrow するだけ）。
2. **各値を FORCED vs CHOICE 分類**: `earliest === latest`（点に collapse）→ **FORCED**（自動充填し binding 制約を引用）。`earliest < latest` or 複数 feasible sequence → **CHOICE**（黙って選ばず提示）。
3. **agency を消費せず提示**: 残余自由は typed `ScheduleChoicePoint`。preference/fit は **透明な tie-break/ranking のみ**で hidden objective にならず proposal ranking/dominance を変えない。

| | 素朴な「スコア最適化」 | 本 solver（feasibility-region + forced-vs-choice） |
|---|---|---|
| 出力 | hidden utility を最大化する単一 schedule | 可能領域・**explicit 強制下でのみ点に collapse** |
| 複数解 | 黙って "best" を選ぶ | `ScheduleChoicePoint` を提示（user が決める） |
| 不能 | 黙って緩和/best-effort | **fail-closed + 名前付き conflict set(IIS)** |
| 説明性 | objective に trade-off が埋没 | **全 minute が 制約/explicit input/名前付き tie-break に trace** |
| 再計画 | 一から → 別物 | **minimal-perturbation → "まだ私の計画"** |

**推奨 = feasibility-region + forced-vs-choice solver（utility 最大化器でない）**。STN が correctness と説明性を無償で与え、agency が構造的に保たれる。組合せ部（順序/日割）は微小規模ゆえ exact で、accuracy/agency の trade が無い。

---

## §2 問題形式化 — schedule を時間制約ネットワークに
**event**: 各 `PreSolverNode` が時点変数 `s_i`(=startMin), `e_i`(=endMin) ∈ [0,1439]（`TravelNode.startMin/endMin` 意味論「その日の 00:00 からの分・絶対時刻/Date 持たない」）。**day ごとに**原点 `Z_d`=0（§8 cross-midnight 前提参照・global 原点でない）。
**制約 → bounded-difference STN edge** `lo ≤ x_j − x_i ≤ hi`:
- **dwell**: explicit `nodeDurations[nodeId]=d_i` → 等式 edge `e_i − s_i = d_i`。**solver 発明しない**・欠落→`node_duration_missing` fail-closed。
- **route_transition → setup**: `PreSolverEdge.kind="route_transition"` + explicit `edgeDurations[edgeKey]=t` → sequenced 後 `s_to − e_from ≥ t`。**δ を consume するのみ・route 導出しない**・欠落→`route_duration_missing`。
- **precedence**: `must_precede`/`luggage_drop_enables`（+ `PreSolverEdge.kind` の `lock_implied`）→ `e_subj ≤ s_obj`。`relaxable:false` は破れない。
- **lock 窓 → unary domain bound**: **lock 7 種は `OrderingConstraint`/`SolverOrderingHint`（edge kind でない）として届く**。golden-tested **per-OrderingKind binding table**（proposed）が変数を固定:
  - `timed_entry_lock` / `checkin_window_lock` / `meal_time_lock` → **`s_i`**（start）
  - `last_departure_lock` / `checkout_window_lock` → **`e_i`**（end/departure）
  - `open_hours_window_lock` / `reservation_window_lock` → **両方**（窓が node 全体を bracket）
  - 未 mapping kind は **fail-close**（誤 binding は feasible-but-WRONG を生むため）。
- **★【ADV-fix HIGH-3/MED-7】time-axis `TravelConstraint`（axis:"time"・severity∈{red_line,hard}）は descriptor を分にパースしない**。`TravelConstraint.descriptor` は「正規化済み人間可読キー・詳細パースは consumer 責務」で `"return_by:20:00"` は**非拘束の例**にすぎない。→ solver は descriptor を schedule bound に変換**しない**。代わり caller が explicit 数値 bound を typed input で供給（§5 `timeBounds`）。欠落→ **`explicit_time_bound_missing`（新 gap）** で fail-closed。**bound を文字列から推論しない**（捏造防止）。
- **day scope → per-day domain**: `single_day{date}`→全 `dayIndex=0`; `range{nights:1|2}`→days `{0..nights}`。node→day は explicit `nodeDayBindings`（scope から導出しない）。`0 ≤ s_i,e_i ≤ 1439`。

**入力**: `CompositionDraft`(candidateNodes/edges/reorderableHints/solverHints/constraints/…) + explicit `scope`/`nodeDurations`/`edgeDurations`/`nodeDayBindings` + **【ADV-fix MED-6】数値 lock 窓 `lockWindowsNumeric: Record<constraintId, ExplicitLockWindow>`**（solve 時に必要・presence boolean からでも descriptor からでも bound を作らない）+ `timeBounds`。
**目標出力**（`AssemblyInput` が要求する explicit 値そのもの）: `nodeIntervals`(per-node {startMin,endMin}) + `nodeDayBindings`(dayIndex) + `edgeDurations`(echo)。→ **不変の copy-only `assembleScheduledDraft`** が `ScheduledTravelItineraryDraft` を emit。

---

## §3 アーキテクチャ（層）
- **L0 — Gate & Constraint Lift（no-fabrication firewall）**: 【ADV-fix MED-10】entry gate = 既存 `classifyFeasibility(SolverFeasibilityInput): FeasibilityClassification{state, infeasibleConstraints}` を**再利用**。**`state === "feasible_scheduled_draft"` の時のみ solver 実行**。それ以外は solver を**走らせず**、caller が既存 report builder `solver-feasibility-report.ts` で `SolverFeasibilityReport` を構成（classifyFeasibility は Report を返さない — 2 モジュールを混同しない）。`CompositionDraft` のみ consume（`CompositionFailure` 不可）。`OrderingConstraint.subjectRef/objectRef` を placeRefId→nodeId(`node:${placeRefId}:${activityKind}`) に lift。precedence DAG 構築・binding table で lock bound 採取。欠落 explicit input → `SolverInputGap`。*algo*: 線形走査 + Kahn topo-sort（precedence cycle→`ordering_cycle` fail-closed）。*O(V+E+C)*。
- **L1 — STN Feasibility-Region（多項式・negative-cycle fail-closed）**: 各 event の `[earliest, latest]` を**schedule を選ばず**計算。*algo*: Floyd–Warshall（最小ネットワーク）or Bellman–Ford（`Z_d` から earliest/latest）。**negative cycle ⇔ 時間的不整合 ⇔ infeasible** → L3 へ conflict set。*O(m³), m=2·nodes+origins≤~20 → μs。最適化なし*。
- **L2 — Sequencing + Day-Assignment（TSPTW・small-n exact・HARD CAP・決定的）**: 唯一の組合せ step。順序（ReorderableHint/`wander` node）+ `range` の dayIndex。`anchor`+locked が frame を拘束。*algo*: **single-machine scheduling with sequence-dependent setup times(route δ) & windows(locks) = TSPTW**。**HARD CAP=8 node/day（proposed・enforced invariant）**。n≤8: Held–Karp DP over subsets（state=(visited-subset,last-node)→earliest-feasible）or B&B + 各候補を L1 再検査。**超過→ fail-closed `split_day_required`（新 SolverInputGapKind・既存流用しない）**・**heuristic 不使用**。【ADV-fix MED-12】**同日 node の no-overlap を hard disjunctive 制約として L2 に組込む**（STN の各 node feasibility は選んだ**点**が pairwise-disjoint を含意しないため）→ 選択点が**証明上 pairwise-disjoint**になり「assemblyReady by construction」が真に成立。*O(2ⁿn²), n≤8≤16384 state・sub-ms・決定的*。
- **L3 — Forced-vs-Choice 分類 + Provenance + IIS 説明**: 各 event `earliest===latest`→FORCED（自動充填・binding 引用）/ slack or >1 sequence→CHOICE（`ScheduleChoicePoint` 提示・§7）。不能時 minimal conflict set(IIS)。*algo*: 【ADV-fix LOW】**n≤CAP=8 では feasible 状態空間を直接列挙して conflict/alternative を読む（primary）**・QuickXplain（Junker 2004）は fallback 形式。出力を `UnsatisfiedConstraintReason ∈ {impossible_time_lock, ordering_cycle, budget_red_line_exceeded, no_feasible_placement}` に map・private descriptor strip。
- **L4 — Minimal-Perturbation 再計画 + Correction Memory / ContingencyBranch hook（slice S5・DEFERRED）**: §10。同一 engine で first-solve/re-solve。**L0-gate-first で着地（first GO に bundle しない）**。

---

## §4 solver gate & 前提条件
**solver 実行可 = `classifyFeasibility` が `feasible_scheduled_draft` の時のみ**。他 state は solver 非実行で既存 `SolverFeasibilityReport`（report builder 経由）を返す: `not_enough_information`/`feasible_unscheduled`/`needs_*` → `eligibility.eligibleForScheduledDraft=false`+`missingForSchedule`; `infeasible_constraints`/`blocked_by_hard_constraint` → report only（`CompositionHardBlocker` あれば `blocked_by_hard_constraint`・schedule なし）。
**必須 explicit 入力（欠落=fail-closed gap）**: durations(`node_duration_missing`/`route_duration_missing`)・**数値 lock 窓 `lockWindowsNumeric`**（欠落 `explicit_window_missing`・presence boolean は gate 専用で bound 計算に使わない・descriptor から bound を作らない）・**time-axis 数値 bound `timeBounds`**（欠落 `explicit_time_bound_missing`）・precedence（cycle→`ordering_cycle`）・scope（欠落 `time_window_missing`/assembly で `date_missing`; range は各 node `nodeDayBindings` 必須 or checkin/checkout lock・precedence で forced、さもなくば `day_assignment_missing`・scope から推論しない）。
**前提超え**: node>CAP→`split_day_required`; cross-midnight node→§8。**未充足→ report path・schedule なし・default 捏造なし**。

---

## §5 出力契約（全 proposed・未実装）
solver は既存 copy-only `assembleScheduledDraft(AssemblyInput)` が消費する explicit 値**そのもの**を produce（**happy-path に net-new 出力型なし**・新 surface/HOLD 違反 risk 最小）。
```ts
// proposed (未実装)
type PlacementBasis =
  | "forced_by_lock" | "forced_by_precedence" | "forced_by_duration" | "forced_by_scope"
  | "forced_by_private_constraint"   // ★【ADV-fix HIGH-1】private 制約が shared node を狭めた（理由は shared に出さない）
  | "explicit_choice" | "single_day_zero"
  | "tiebreak_earliest_feasible"     // 名前付き決定的 tie-break（§6）
  | "tiebreak_shortest_route";       // ★【ADV-fix HIGH-2】derive_shortest_from_terminal 由来・override 可
interface PlacedNode { nodeId: string; startMin: number; endMin: number; dayIndex: number; placementBasis: PlacementBasis; }
interface ScheduleProvenance {
  intervalBasis: Record<string, PlacementBasis>;
  daySource: Record<string, "explicit" | "single_day_zero" | "forced_by_lock" | "forced_by_precedence">;
  tieBreaksApplied: Array<{ at: string; rule: "earliest_feasible" | "anchor_first" | "fewest_day_crossings" | "shortest_route" | "lexicographic_nodeId" }>;
  // ★【ADV-fix HIGH-1】slackBands は SHARED-only 制約から計算（private narrowing を反映しない・private で狭めた区間は publish しない）
  slackBands: Record<string, { earliestStart: number; latestStart: number }>;
}
interface ScheduleChoicePoint {
  kind: "day_assignment_choice" | "ordering_choice" | "time_window_choice";
  ref: string;
  feasibleRange?: { lo: number; hi: number };   // ★ SHARED-only 制約由来（private narrowing 非反映）
  feasibleOptions?: string[];
  namedTieBreak: "earliest_feasible" | "anchor_first" | "fewest_day_crossings" | "shortest_route" | "lexicographic_nodeId";
  provisionalDefault?: number;        // ★【ADV-fix HIGH-4】provisional のみ・user が override・自動 pin でない
  rationale: ViewerScopedRationale;   // private 理由は .forParticipant のみ
}
interface SolverInfeasibility {
  state: "infeasible_constraints" | "blocked_by_hard_constraint";
  conflictSet: UnsatisfiedConstraint[];   // shared-safe IIS（reason ∈ UnsatisfiedConstraintReason）
  // ★【ADV-fix MED-8】relaxable:true(severity∈{soft,preference})のみ・red_line を絶対含めない・wouldRestore は純 probe で auto-apply しない
  suggestedRelaxations?: Array<{ constraintId: string; wouldRestore: boolean }>;
}
type SolverSchedule =
  | { outcome: "solved"; placed: PlacedNode[]; provenance: ScheduleProvenance; choicePoints: ScheduleChoicePoint[]; authoritative: false; draft: true; candidateId: string }
  | { outcome: "needs_input"; missingForSchedule: SolverInputGap[]; authoritative: false; draft: true; candidateId: string }
  | { outcome: "infeasible"; infeasibility: SolverInfeasibility; authoritative: false; draft: true; candidateId: string };
```
**hand-off（happy path）**: `placed[]` → `AssemblyInput.nodeIntervals`+`nodeDayBindings`+`edgeDurations`(echo) → **不変** `assembleScheduledDraft` → `ScheduledTravelItineraryDraft`。day 内 sequence は explicit `startMin` 昇順で実現（codebase の CEO 補正「explicit startMin 順は stable display/copy 順・solver 順序でない」と整合）。
**hard 除外**: `TravelCandidate` emit なし・candidates 追加なし・proposal ranking なし・常に `authoritative:false`・`ReadinessResult`/`ReadinessState` 不触。

---

## §6 no-fabrication & 決定性
**全 produced time は 3 source のいずれかに trace（他は禁止）**: ①制約（explicit dwell/route δ/数値 lock 窓/precedence/数値 time bound; `placementBasis ∈ {forced_by_lock, forced_by_precedence, forced_by_duration, forced_by_scope, forced_by_private_constraint}`）②explicit caller/user 選択（`explicit_choice`/`single_day_zero`）③**名前付き決定的 tie-break**。
**tie-break ladder（完全・名前付き・透明・feasible slack 内のみ）**: ①`anchor` を `wander` より先に配置 ②**earliest-feasible canonical placement**（標準 STN earliest 解・region→点 collapse の既定）③fewest day-crossings(range) ④**【ADV-fix HIGH-2】`shortest_route`**（`derive_shortest_from_terminal` 由来・**feasibility 後の既 feasible 順序にのみ適用・`tieBreaksApplied`+ChoicePoint に記録・user override 可**・hard objective にしない。未定義のまま黙って honor/drop しない。S2/S3 で意味論を定義しない場合は presence で fail-close `ordering_directive_unsupported` 新 gap）⑤advisory: `soft`/`preference` `TravelConstraint` 充足数（透明 tie-break・objective でない）⑥lexicographic 最小 `nodeId`（最終決定 seal）。
**常に禁止**: default 60分 dwell・timetable/opening-hours/availability/weather の発明・`route_transition durationMin` の導出（route δ は echo のみ）・scope からの dayIndex guess・**複数解を forced のように 1 つ選ぶ**・**descriptor 文字列から bound を parse**。欠落→`SolverInputGap`（default なし）。`endMin = startMin + nodeDurations[nodeId]` 厳密。
**決定性**: Floyd–Warshall/Kahn/Held–Karp/列挙/tie-break ladder は input の純関数。edge 挿入・branch 列挙は `nodeId`/`constraintId`/`edgeKey` で sort。`Date.now()`/random を schedule に入れない（`date` は `scope.window` から決定的）。同 input ⇒ byte 同一 `AssemblyInput`。

---

## §7 forced-vs-choice & agency
**検出**: STN `[earliest, latest]` が**正確・決定的な discriminator**: `earliest===latest`→FORCED（単一値を自動充填・binding 制約を `placementBasis` tag）/ `earliest<latest` or >1 feasible sequence→CHOICE（earliest に黙って snap しない）。
**自動充填 vs 提示**:
- **FORCED / 単一 feasible 点** → 自動充填（質問なし）。例「美術館 10:00 は forced — 9:00 の timed_entry_lock + 45 分移動が一意に決定」。
- **★【ADV-fix HIGH-4/MED-5】CHOICE（material slack あり）→ ScheduleChoicePoint を PRIMARY behavior として emit**（「surface OR auto-fill」でなく **surface AND provisional default を提示**）。material 判定は typed const **`MATERIAL_SLACK_THRESHOLD_MIN`（proposed・契約の一部・実装者裁量でない）**: slack ≥ 閾値 → ChoicePoint 必須・startMin を**自動 pin しない**（`provisionalDefault` は override 可能な暫定として ChoicePoint が露出し、範囲 `{lo,hi}` を**user-facing surface に出す**・provenance に埋めない）。閾値未満 or `earliest===latest` のみ forced/provisional 充填可。
  - `ordering_choice`(≥2 feasible 順序)→options 提示・soft/fit は透明 rank・user の pick が立つ。
  - `day_assignment_choice`（range・caller binding なし）→**それ自体 fail-closed**: `day_assignment_missing`（day を auto-bucket しない）。
**思想接続**: 全 minute に「なぜこの時刻」provenance。FORCED は binding 制約を、CHOICE は rule と残 slack を引用。不能も IIS conflict で自己理解（「return_by:20:00 が宿の checkin_window_lock + 70 分移動と衝突」）。**ユーザは自由が在ったことを常に見る**。

---

## §8 複雑性・規模・cap
**正直な NP-hardness**: timing 部（STN 整合 + earliest/latest）は**多項式**（最適化なし）。**sequencing+day-assignment は TSPTW = NP-hard**。DTP（which-before/which-day の disjunction）一般化の下に留まる（窓を conjunctive・explicit に保つ）。
**n cap**: max 1-2 人・day-trip or nights 1-2（2-3 TravelDay）。per-day node 微小。**HARD CAP=8 node/day（proposed・enforced）**。n≤8 で Held–Karp ≤16384 state→sub-ms・exact・決定的。NP-hard を**定数時間 real-time 保証**に変換。
**cap 超過→ fail-closed・劣化させない**: per-day node>8 → **新 `split_day_required`**（既存流用なし）・day 分割/node 削減を求める・**nearest-neighbor/近似なし**。
**★【ADV-fix MED-11】cross-midnight = 中心 use case（fail-close でなく actionable gap）**: `TravelNode.startMin/endMin` は per-day 0-1439・絶対時刻 lift なし。1泊2日 の遅い onsen（深夜跨ぎ）は**中心的期待ケース**（edge でない）。MVP は**黙った out-of-window 拒否でなく、actionable な新 gap `cross_midnight_unsupported` を emit**（user-facing message + 修正案「前倒し/短縮」）。**併せて、user 確認つきの分割**（day d を 1439 で終え day d+1 を 0 から継続・provenance tag・黙ってやらない）を**named future slice として明示**（絶対時刻 lift）。flagship trip 型を opaque fail-close で出さない。
**性能**: MVP 規模 μs〜sub-ms・決定的・network なし。

---

## §9 不変 — と enforcement
- **NO AUTHORITY / readiness 分離**: 出力 `authoritative:false`/`draft:true`（不変 assembler が固定）。calendar/booking/send field を書かず `ReadinessResult.authoritative`/`ReadinessState` 不触。solved でも別 readiness 層が clear するまで act 不可。
- **★【ADV-fix HIGH-1/MED-9】PRIVACY 二層（side-channel を契約で閉じる・「review」でなく実装）**: private `TravelConstraint`(visibility:"private") は STN に server-side 参加し feasibility を曲げてよいが、その狭まりを **shared-facing field に反映しない**。具体的に: (a) **shared 投影の `slackBands`/`feasibleRange` は SHARED-only 制約から計算した可能領域を報告**（private narrowing は反映せず緩い shared bound を見せる）。(b) private で狭まった/固定された shared node は `placementBasis: "forced_by_private_constraint"` とし、**shared 文言は honest-but-opaque**（「この時刻は非公開の事情で固定されています」= 真・非捏造・非漏洩）、真の理由は所有者の `ViewerScopedRationale.forParticipant` のみ。(c) private で narrow された区間の `slackBands` を publish しない。**S1 型 + S4 enforcement に昇格**（S4 review でない）。golden: private 制約 1 つだけ異なる 2 入力が **byte 同一の shared provenance/choicePoints** を生む。raw `FitResult` は入らない（fit は `CompositionHardBlocker.reasonCode` に既約）。client-only filtering なし。
- **ADVISORY FIT / AGENCY**: feasibility は binary。`red_line`/`hard` → STN 制約（充足必須）。`soft`/`preference`+advisory fit は**既 feasible 上の名前付き tie-break のみ**・objective でなく hard を override せず proposal ranking/dominance を変えない。複数 feasible は ChoicePoint で提示（黙って collapse しない）。
- **NO EXTERNAL/LIVE DATA**: durations/lock 窓/transport/cost は explicit caller input のみ。Maps/route/OTA/timetable/weather API なし。`PreSolverEdge.burden`(`RouteBurdenMeta.derived:true`) は observed-norm で live でなく durationMin 捏造に使わない。
- **NO BOOKING**: planning draft のみ。`ContingencyBranch`/`FallbackAction` は advisory input（shared のみ・private 除外）。実行/cancel/rebook/send しない。

---

## §10 fallback / Correction Memory / day-of（slice S5・DEFERRED）
one-shot optimizer に対する world-top-share 差別化だが **L0-gate + first-solve(S1-S4) 着地後にのみ ship**。同 STN engine。
**minimal-perturbation 再計画**: 既 accepted `ScheduledTravelItineraryDraft`(or AssemblyInput) + explicit delta → **最小変更**で決定的な新 feasible draft。旧解の `s_i/e_i/order/dayIndex` を soft「stay-put」goal として hard STN 上に重ね、**名前付き lexicographic perturbation 距離** `d(old,new)` = (区間が動いた node 数)→(総 |ΔstartMin|)→(順序 swap 数)→(day 再割当数) を最小化。lexicographic ゆえ説明可能（black-box 加重和でない）。budget iterative-deepening: Δ=0 旧解維持・Δ=1 一 node 微調整…。【ADV-fix LOW】**n≤CAP=8 では feasible 状態空間の直接列挙で最小摂動代替を読む（primary）**・iterative-deepening は fallback。再計画を**認識可能**にする = 「まだ私の計画」。
```ts
// proposed (未実装)
type ReSolveDelta =
  | { kind: "new_constraint"; constraint: TravelConstraint }
  | { kind: "contingency"; scenario: ContingencyScenario }
  | { kind: "correction_memory"; constraint: TravelConstraint; sourceRegretCode: string };
interface ReSolveInput { priorAssemblyInput: AssemblyInput; delta: ReSolveDelta; }
interface PerturbationReport { changedNodeIds: string[]; totalStartMinDelta: number; orderSwaps: number; dayReassignments: number; tieBreakRule: string; rationale: ViewerScopedRationale; }
```
**Correction Memory = explicit・contestable 制約**: post-trip regret は hidden weight にならず `ReSolveDelta{kind:"correction_memory"; constraint: TravelConstraint; sourceRegretCode}` として first-class `TravelConstraint`（user が見て contest 可・例 regret→`fatigue` red_line）。可視に学習。
**ContingencyBranch 統合**: 既存 `ContingencyScenario{trigger:ContingencyTrigger,severity,visibility,participantId?}` → `ReSolveDelta{kind:"contingency"}`。最大 perturbation 予算内に feasible なし → infeasible を返し**旧 accepted draft を byte 不変に保つ**・day-of loop/user が `ContingencyBranch`(fallbackAction∈{keep_plan,ask_question,downgrade_to_easy,switch_proposal,defer,cancel})を選ぶ。solver は auto-cancel/rebook しない。

---

## §11 将来 golden test
1. **feasibility happy path** — 完全指定 + explicit 全 → `solved`・`placed[]` が valid `AssemblyInput`。
2. **infeasible→conflict set** — 矛盾 lock+precedence+δ → `infeasible`・`conflictSet`(IIS) が衝突 constraintId を `reason∈UnsatisfiedConstraintReason` で命名・itinerary なし・非relaxable 緩和なし。【ADV-fix HIGH-3】**unparseable/欠落 time descriptor は silent drop でなく `explicit_time_bound_missing` gap**。
3. **forced 決定的** — lock+precedence chain が点に collapse → 毎回同 startMin・`forced_by_lock`。
4. **★【ADV-fix HIGH-4】choice は提示・collapse しない** — slack or 2 feasible 順序 → **ScheduleChoicePoint が emit される**（slackBands を埋めるだけでない）・range 無 binding → `day_assignment_missing`。
5. **捏造なし** — `nodeDurations` 欠 → `needs_input`+`node_duration_missing`・interval emit なし・60分 default なし。
6. **minimal perturbation 再計画(S5)** — 旧計画が満たす 1 制約追加→Δ=0 同一・狭める 1 制約→正確に 1 node 移動。
7. **cap 超過 fail-closed** — 9 node/day → `split_day_required`・heuristic schedule なし。
8. **★【ADV-fix MED-12】出力が AssemblyInput を満たす（by construction）** — `placed[]`→`AssemblyInput`→`detectAssemblyReadiness` ready（`overlapping_interval` 等なし）。**広窓 wander 2 node が重なり得るケースで、solver は disjoint 点 OR ordering_choice を出す**（detectAssemblyReadiness が拒否する "solved" draft を出さない）。
9. **no authority/external/fabrication** — `authoritative:false`/`draft:true`・network なし・`TravelCandidate` なし・**cross-midnight → `cross_midnight_unsupported` gap（actionable・opaque 拒否でない）**。
10. **★【ADV-fix HIGH-1】privacy** — private `TravelConstraint` が feasibility を曲げるが descriptor が `conflictSet`/`ScheduleChoicePoint.rationale.shared`/`provenance`/`slackBands` に出ない。**private 1 つだけ異なる 2 入力 → byte 同一 shared provenance/choicePoints**。
11. **【ADV-fix MED-8】suggestedRelaxations は relaxable:true のみ・red_line を絶対含まない・auto-apply しない**。
12. **regression** — 既存 travel test green・tsc baseline 不変（pure-type slice は additive）。

---

## §12 実装スライス（各 STOP・各別 GO）
| Slice | scope | touched/new 型 | fail-closed | NP-hard core? |
|---|---|---|---|---|
| **S1 — solver 型（NARROW）** | pure types + as-const: PlacementBasis(forced_by_private_constraint/tiebreak_shortest_route 含)・PlacedNode・ScheduleProvenance・ScheduleChoicePoint(provisionalDefault)・SolverInfeasibility・SolverSchedule・**新 SolverInputGapKind**(split_day_required/cross_midnight_unsupported/explicit_time_bound_missing/ordering_directive_unsupported)・per-OrderingKind binding table const・MATERIAL_SLACK_THRESHOLD_MIN const・lockWindowsNumeric/timeBounds 入力型。logic/配線なし | 新: 上記。既存: SolverInputGap/Kind, OrderingKind, NodeInterval, ExplicitLockWindow, UnsatisfiedConstraint, ViewerScopedRationale, ContingencyScenario | n/a(型のみ・tsc 不変) | No |
| **S2 — STN feasibility-region（GATE 慎重）** | L0 gate(classifyFeasibility 再利用) + L1 STN: edge compile・Kahn topo・Floyd-Warshall/Bellman-Ford・negative cycle・earliest/latest。2 lockWindows 形を bridge。descriptor を parse しない（timeBounds/lockWindowsNumeric から bound） | CompositionDraft, SolverFeasibilityInput, PreSolverNode/Edge/Kind, SolverOrderingHint, OrderingConstraint, SolverFeasibilityReport(report builder), SolverBoundaryState, FeasibilityClassification | precedence cycle→ordering_cycle・negative cycle→infeasible・欠落→gap・descriptor 由来 bound 禁止 | 多項式のみ |
| **S3 — sequencing/day-assignment（NP-hard core・最も慎重に GATE）** | L2 TSPTW: Held-Karp/B&B(n≤CAP=8)・**同日 no-overlap disjunctive 制約**・range day-partition・tie-break ladder(shortest_route 含)・split_day_required 超過 | ReorderableHint, NodeConfidence, TravelPlanScope/Window, nodeDayBindings | 超過→split_day_required・feasible 順序なし→infeasible(heuristic なし)・disjoint 点を保証 | **YES — exact-at-small-n・CAP enforce** |
| **S4 — forced-vs-choice + provenance + canonical placement（NARROW-ish）** | L3 分類(earliest===latest)・placementBasis tag・**ScheduleChoicePoint を material slack で PRIMARY emit**・**privacy side-channel enforcement(shared-only slackBands/forced_by_private_constraint)**・IIS は n≤8 列挙 primary/QuickXplain fallback・earliest-feasible canonical。AssemblyInput emit・detectAssemblyReadiness 再検証 | ScheduleProvenance, ScheduleChoicePoint, SolverInfeasibility, AssemblyInput, AssemblyReadiness, AssemblyGapKind, UnsatisfiedConstraintReason, Visibility | range 未解決 CHOICE→day_assignment_missing・private narrowing 非漏洩 | No |
| **S5 — minimal-perturbation 再計画 + Correction Memory（DEFERRED・別 GO）** | L4: ReSolveInput/Delta/PerturbationReport・incremental 再伝播・lexicographic 摂動距離(n≤8 列挙 primary)・ContingencyScenario/FallbackAction hook | 新: ReSolveInput/Delta/PerturbationReport。既存: ContingencyScenario/Branch, FallbackAction, ContingencyTrigger, TravelConstraint | feasible 摂動なし→infeasible・旧 draft 不変・auto-cancel/rebook なし | S3 core 再利用・慎重 GATE |
| **S6 — golden tests（NARROW）** | §11 matrix・既存 green + tsc 不変 assert | 全上記 | 全 fail-closed path を assert | No |

**gating note**: S1/S4/S6 は narrow（型/分類/test）。**S2・特に S3 が algorithmic core**（S3 に NP-hardness）— CAP=8 invariant と split_day_required fail-close を**interval emit 前に**置く。**S5(再計画/Correction Memory)は deferred・first GO に bundle しない**（L0-gate-first・gate 前の早すぎる interval emit は no-fabrication/agency を破る）。

---

## §13 Adversarial verification summary（適用済 14 補正 + 型横断）
workflow `w0nn0o8bx`・3 lens（field-accuracy=clean / boundary-safety / premise-critic）。
| # | sev | lens | 検出 | 補正 |
|---|---|---|---|---|
| H1 | boundary | privacy side-channel | private 制約が shared node を狭め shared slackBands/feasibleRange が hidden 制約の存在を漏洩 | shared 投影は **shared-only 制約**から可能領域を計算・`forced_by_private_constraint`(honest-opaque)・private narrowing の slackBands 非 publish・S1 型+S4 enforce・byte 同一 golden |
| H2 | premise | derive_shortest_from_terminal | 唯一の最適化 directive を §2 が無視→黙って honor(black-box 化) or drop(指示喪失) | 透明な名前付き tie-break `tiebreak_shortest_route`(feasibility 後・override 可・記録) or presence で fail-close `ordering_directive_unsupported`。S2/S3 で明示 |
| H3 | premise | descriptor parse | `descriptor"return_by:20:00"→1200` は free-form 文字列の parse=捏造 channel | descriptor を bound に parse**しない**・explicit 数値 `timeBounds` を要求・欠落 `explicit_time_bound_missing` |
| H4 | premise | earliest-feasible collapse | CHOICE(slack)を黙って earliest に pin・slack を provenance に埋めるだけ=agency 消費 | material slack で **ScheduleChoicePoint を PRIMARY emit**・`provisionalDefault`(override 可)・範囲を user-facing に・閾値を typed const 化 |
| M5 | boundary | ask-vs-auto-fill 未規定 | (a)surface or (b)auto-fill が実装者裁量 | NAMED 決定的 rule + `MATERIAL_SLACK_THRESHOLD_MIN` typed const |
| M6 | boundary | lockWindows 数値 source | solve 時 presence boolean しかなく L1 が数値 bound を作れない | 数値 `lockWindowsNumeric: Record<constraintId,ExplicitLockWindow>` を solve 時入力に宣言・boolean/descriptor から bound 禁止・constraintId→placeRefId bridge |
| M7 | boundary | descriptor→1200 | 同 H3 | 同 H3 |
| M8 | boundary | suggestedRelaxations | red_line 緩和を示唆し fail-closed を UX で侵食 | relaxable:true(soft/preference)のみ・red_line 絶対除外・wouldRestore 純 probe・auto-apply なし |
| M9 | premise | privacy 先送り | 同 H1 を「S4 review」に punt | 同 H1（設計内で解決・S1 型化） |
| M10 | premise | classifyFeasibility 返り型 | gate が SolverFeasibilityReport を返すと誤記(実は FeasibilityClassification) | gate=classifyFeasibility→FeasibilityClassification{state,infeasibleConstraints}・report は別 builder・両 module/返り型を明記 |
| M11 | premise | cross-midnight fail-close | 1泊2日 遅 onsen=中心ケースを opaque 拒否 | actionable gap `cross_midnight_unsupported`(message+修正案)・user 確認つき分割を named future slice |
| M12 | premise | overlap by construction | STN の node feasibility は選んだ点の pairwise-disjoint を含意せず assembler が拒否し得る | 同日 no-overlap を **hard disjunctive 制約として L2 に組込む**・golden(広窓 2 node→disjoint or ordering_choice) |
| L13 | boundary | classifyFeasibility drift | 同 M10 | 同 M10 |
| L14 | boundary | suggestedRelaxations | 同 M8 | 同 M8 |
| L15 | premise | over-engineering(n≤8) | QuickXplain/iterative-deepening が sub-ms brute-force 可能 instance に重い | STN core 維持・L3 説明/L4 再計画は **n≤8 直接列挙 primary**・形式手法は fallback（列挙は全 feasible 集合を user に見せられ agency も強い） |
| 型横断 | both judges | source proposal の型誤り | lock 9 種誤/lock を edge kind 扱い/node_interval_missing を SolverInputGapKind 扱い/2 lockWindows 形混同 | lock=**7 種**・lock は SolverOrderingHint 経由(edge kind でない)・node_interval_missing は AssemblyGapKind・2 lockWindows 形を bridge |

---

## §14 CEO 判断請求
1. report→assembly の**凍結点**を承認し、次フェーズを **真の solver 設計（本書）** として承認するか。
2. **★再定義**（generic optimizer でなく **feasibility-region + forced-vs-choice + agency** エンジン・STN 中核・複数解は提示し折り畳まない・捏造ゼロ・説明可能）を正本として承認するか。
3. アーキ（L0 gate 再利用 / L1 STN 多項式 / L2 有界 TSPTW + CAP=8 + no-overlap disjunctive / L3 forced-vs-choice + IIS / L4 minimal-perturbation[S5 deferred]）で良いか。
4. adversarial 14 補正 + 型横断補正（§13）を正本として受理するか（特に: privacy side-channel を `forced_by_private_constraint`+shared-only slackBands で閉じる / derive_shortest_from_terminal を override 可 tie-break 化 / descriptor を parse せず数値 timeBounds 要求 / CHOICE を ChoicePoint で必須提示 / cross-midnight を actionable gap 化 / no-overlap を hard L2 制約）。
5. 実装順 = **S1(型)→S2(STN・gate 慎重)→S3(TSPTW・NP-hard core・最も慎重)→S4(forced-vs-choice+privacy enforce)→S6(tests)**、**S5(再計画/Correction Memory)は deferred で別 GO**、で良いか。各別途 implementation GO・solver は本書では HOLD。

**本書で停止**。実装（S1〜）は CEO 承認まで着手しない。
