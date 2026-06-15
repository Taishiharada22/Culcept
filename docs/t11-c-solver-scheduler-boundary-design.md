# T11-C Solver / Scheduler Boundary Design（solver/scheduler 境界・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: docs-only・実装なし・solver は HOLD・stop after report。
**スコープ**: 本セッション = **Travel Mode 専属**。**目的**: T11-B の pre-solver `CompositionDraft` と、最終 `TravelItinerary` の間の境界を設計する — solver が**何を消費してよいか・何を産んでよいか・最終 `TravelItinerary` 成立に何が explicit 必須か・不足時の fail-closed 状態**。実 solver/scheduler/optimizer/topological sort/interval scheduler/day-assignment/route-search/fallback-selection は**実装しない（HOLD）**。
**禁止（再掲）**: 実装・コード・solver/optimizer・route/weather/place/Maps/OTA API・fetch/DB/Supabase/M2 runtime・booking/calendar/action authority・ranking/dominance 変更・**duration/dayIndex/window/opening-hours/timetable/availability/weather の捏造**・本番 `/plan`・push。

**設計根拠の出所**: workflow `wpk4ot5g7`（17 agents）= 2 grounding（実ソース read-only）→ 5 design chunk → 10 adversarial verify（field-accuracy + boundary-safety）。adversarial が **9 補正（2 HIGH / 7 LOW）** を検出し本文へ全反映（§18 一覧）。最重要 HIGH 2 件 = ①per-node `dayIndex` は scope から導出不可（solver の day-assignment・HOLD）→ proposed `day_assignment_missing` で多日は fail-closed、②`node_duration_missing` を schedule gate 語彙に追加し `feasible_scheduled_draft` を阻む。

---

## §1 前提を疑う — T11-C が最初にやるべきは何か
ゴールからの逆算: **旅行は「いつ real `TravelItinerary` が成立してよいか」の feasibility/scheduling 境界が定まるまで未完**。T11-B は `CompositionDraft.candidateNodes:PreSolverNode[]`（時刻/日割なし）・`edges:PreSolverEdge[]`（`durationMin` なし）を産むのみで、何も `TravelCandidate.itinerary` になれない。次手はこの gap を**閉じるか／既に閉じた前提か**で判定する。

| 案 | 前提 | gap を閉じるか | 判定 |
|---|---|---|---|
| **(a) solver/scheduler 境界設計** | 実装済 `CompositionDraft` のみ | **Yes** | **推奨** |
| (b) Bundle 2 fit dominance/ranking | 並べる solved itinerary が既存 | No（出力を並べる・fit advisory 不変と衝突） | 早い |
| (c) Tier1 safe links / Maps URL | 確定旅程が既存 | No（外部 place/Maps・scope 外） | 早い+scope外 |
| (d) Tier2 official/Maps extraction | 外部 live access | No（"no route/weather/place API" 直接違反・捏造禁止と衝突） | scope外 |
| (e) production `/plan` preflight | 境界+readiness 既存 | No（runtime は (a) を前提） | 早い+scope外 |

**推奨 = (a)**。(b)-(e) は solved/scheduled plan or 外部 access を前提とし未成立。(a) のみが unscheduled `CompositionDraft` を「consume してよいもの／produce してよいもの／explicit 必須／fail-closed 状態」の境界に変える。solver 本体は HOLD。

---

## §2 実装済 input の grounding — 何が在り何が未解決か
**実装済（T11-B・`composition-types.ts`）pre-solver surface**:
- `PreSolverNode`{nodeId, placeRefId, place, activityKind, fatigueLoad, nodeConfidence, budgetBand?} — **`startMin`/`endMin`/`dayIndex` を OMIT**（solver 所有）。
- `PreSolverEdge`{fromNodeId, toNodeId, kind:PreSolverEdgeKind(route_transition|must_precede|luggage_drop_enables|lock_implied), transport?, cost?, burden?:RouteBurdenMeta} — **`durationMin` を OMIT**。`RouteBurdenMeta`{derived:true, doorToDoorNorm?} は正規化 burden hint で**分単位でない**。
- `ReorderableHint`{nodeIdA, nodeIdB}（無向）・`SolverOrderingHint`{kind, subjectRef, objectRef, relaxable}。
- `CompositionDraft`{outcome:"draft", authoritative:false, draft:true, candidateNodes, edges, reorderableHints, solverHints, constraints:TravelConstraint[], unsatisfiedConstraints, missingCompositionQuestions, hardBlockers, fallbackBranches}（**フラット node 集合・day 分割なし**）。
- `CompositionFailure`{outcome:"failure", failed:true, reason∈(no_bound_entities|all_nodes_hard_blocked|impossible_time_lock|missing_required_subject), needsAlternative, diagnostics, hardBlockers}。
- `UnsatisfiedConstraint`{constraintId, reason∈(impossible_time_lock|ordering_cycle|budget_red_line_exceeded|no_feasible_placement), visibility, ownerParticipantId}・`CompositionMissingQuestion`{field, reason∈(entity_unbound|lock_unplaceable|low_confidence|area_unresolved|route_duration_missing|price_unknown)}・`CompositionHardBlocker`{placeRefId, reasonCode, visibility, ownerParticipantId}。

**既存 scheduled 出力型（T1A・solver が将来産む・本フェーズで産まない）**:
- `TravelNode`{nodeId, **startMin, endMin**(非optional number 0-1439), place, activityKind, budgetBand, fatigueLoad, nodeConfidence} — **node-level duration field は無い**（duration は `endMin−startMin` で暗黙）。
- `TravelEdge`{fromNodeId, toNodeId, transport, **durationMin**(非optional number), cost}・`TravelDay`{**dayIndex**(非optional number), date, nodes, edges}・`TravelItinerary`{days}・`TravelCandidate`{candidateId, title, tags, itinerary, tradeoff, rationale, uncertainty, reversal?}。

**gap（PreSolver* → scheduled Travel*）= 未解決**:
| scheduled field（非optional・既存） | pre-solver 現状 | 未解決理由 |
|---|---|---|
| `TravelNode.startMin`/`endMin` | PreSolverNode で **omit** | placement なし・合成は割らない |
| `TravelDay.dayIndex` | PreSolverNode で **omit**（フラット） | day 分割なし |
| `TravelEdge.durationMin` | PreSolverEdge で **omit** | route API なし・`RouteBurdenMeta` は分でない |
| `TravelDay.date` | draft になし（scope 由来） | `TravelPlanScope.window` から caller 注入・捏造しない |
| `TravelItinerary.days` | draft に**存在しない** | draft 単独から `TravelItinerary` は産めない |

omit された field 群こそ本フェーズが**境界を与える**対象（埋める対象ではない）。

---

## §3 solver 問題の定義（problem statement のみ・アルゴリズムなし）
**与件**: `CompositionDraft`（時刻/日割/duration なし）+ ordering hint + `constraints`（time lock/window）+ 検出済 `unsatisfiedConstraints`/`missingCompositionQuestions`/`hardBlockers`。
**目標（将来・別 GO の後）**: `TravelNode.startMin`/`endMin`・`TravelEdge.durationMin`・`TravelDay.dayIndex`(+`TravelItinerary.days`) を持つ scheduled draft。
**問題文**: solver は constraints + ordering hint を、**全 required field を捏造なく埋められる explicit data が揃う時のみ** scheduled draft に変換し、不足時は **fail closed**。本フェーズは problem の定義のみ — topological sort/interval scheduler/day-assignment/optimization/route-search/fallback-selection は HOLD。

---

## §4 solver input 契約（proposed `SolverInput`）
境界の設計であって solver でない。**live route/weather/place/Maps/OTA data はどの field にも入らない**。

| field（proposed） | source（grounded） | invariant |
|---|---|---|
| `draft:CompositionDraft` | `buildCompositionDraft` | `outcome==="draft"`/`authoritative===false`/`draft===true`。`CompositionFailure` は valid input でない |
| `nodes` | `candidateNodes`(PreSolverNode[]) | フラット・無時刻・`startMin/endMin/dayIndex` omit |
| `edges` | `edges`(PreSolverEdge[]) | `durationMin` omit・transport/cost/burden は explicit 時のみ |
| `scope:TravelPlanScope` | `CompositionInput.scope` | explicit trip window（single_day{date}/range{startDate,endDate,nights}）を供給 |
| `nodeDurationInputs?`（proposed） | **absent today・C1 proposed** | per-nodeId の explicit dwell 分。PreSolverNode/TravelNode に node-duration field 無。explicit 供給時のみ・default しない |
| `timeWindowsAndLocks` | `constraints`(TravelConstraint[]) + OrderingKind lock 群 | 【ADV-fix LOW】**TravelConstraint を verbatim carry**（constraintId/axis/severity/visibility/owner/descriptor）。**境界は descriptor を window 分にパースしない** — lock 窓の解釈は downstream consumer/solver。window/opening-hours 値をここで合成しない |
| `edgeDurationInputs?`（proposed） | **absent today・C1 proposed** | per-edge explicit durationMin。explicit 供給時のみ |
| `orderingConstraints` | precedence edges + `solverHints`(SolverOrderingHint[]) + `reorderableHints`(ReorderableHint[]) | precedence=must_precede/luggage_drop_enables。ReorderableHint は**無向**（solver が順序を選ぶ・境界は選ばない） |
| `routePlaceholders` | `edges` の kind==="route_transition" | 移動 placeholder のみ・leg 幾何/live duration なし・transport は "other" 可 |
| `fallbackBranches` | `fallbackBranches`(ContingencyBranch[]) | shared-safe のみ（private は合成で除去済）・advisory・本フェーズで branch を自動選択しない |
| `readinessHint?` | `ReadinessState` 供給時 | 文脈のみ。readiness は **action** を gate・feasibility/scheduling を gate しない |

server-side/advisory のみ: `hardBlockers`/`unsatisfiedConstraints`。**raw `FitResult` は SolverInput に入らない**・fit は再ランクも authority も持たない。**禁止 field**: live route duration/weather/place/opening-hours/Maps/OTA availability/booking/calendar authority。

---

## §5 solving に必要な data（MANDATORY vs OPTIONAL）
最終 `TravelItinerary` は下記 mandatory が **explicit** な時のみ成立。欠落は **fail-closed**（`CompositionMissingQuestion` + not-enough-information 状態）・default 捏造しない。

| 必要 data | 必須? | 欠落時の reason/state |
|---|---|---|
| **node duration**（per node・分） | **MANDATORY**（startMin/endMin 配置に必要） | proposed `needs_node_duration`。★**net-new** proposed reason `node_duration_missing`（既存 analog なし — PreSolverNode に dwell 概念が無い・`route_duration_missing` は node に流用しない） |
| **trip date/range**（dayIndex 用） | **MANDATORY** | 【ADV-fix LOW】`TravelPlanScope.window` 欠落→ proposed `needs_time_window`（date 用に proposed `time_window_missing`）。**`area_unresolved` は area/location 専用で date 欠落に流用しない**。`dayIndex` を捏造しない |
| **feasible day window**（1日の使用可能時間帯） | **MANDATORY** | proposed `needs_time_window`。09:00–21:00 等の default なし |
| **hard time lock**（timed_entry/reservation_window 等） | **lock node がある時 MANDATORY** | 不可置→`lock_unplaceable`／構造的不能→`UnsatisfiedConstraint.impossible_time_lock` |
| **lodging checkin/checkout window** | **range/多日(nights≥1) で MANDATORY** | 欠落→ proposed `needs_time_window`／present-but-unplaceable→`lock_unplaceable` |
| **meal window**（meal_time_lock） | **OPTIONAL**（meal lock 時のみ必須） | 関連欠落→ proposed `needs_time_window`。meal を auto-insert しない |
| **last-departure window**（last_departure_lock） | **OPTIONAL**（terminal/return lock 時必須） | 欠落→`needs_time_window`／不能→`impossible_time_lock` |
| **edge duration**（TravelEdge.durationMin） | **OPTIONAL — explicit 供給時のみ消費** | 必要だが欠落→`route_duration_missing`（state `needs_route_duration`）。durationMin 捏造しない |
| **route feasibility**（到達/接続） | **OPTIONAL — explicit 時のみ** | 不明→`no_feasible_placement` or `route_duration_missing`。live route search で "発見" しない |
| **budget band**（PreSolverNode.budgetBand） | **OPTIONAL** | 欠落→`price_unknown`／red-line 抵触→`budget_red_line_exceeded`。BudgetBand を default しない |
| **entity binding**（PreSolverNode.placeRefId） | **MANDATORY**（node 0 なら schedule 不能） | 未束縛→`entity_unbound`／低信頼→`low_confidence` |

**proposed report states（未実装）**: `needs_node_duration`・`needs_route_duration`・`needs_time_window`。既存 reason に 1:1 写る所は写し、**`node_duration_missing` は新規 proposed enum 値**（既存になし）。mandatory 欠落時は `SolverFeasibilityReport` を出し `ScheduledTravelItineraryDraft` を**出さない**（`TravelCandidate` も）。

---

## §6 禁止推論（explicit prohibitions）
境界は**何も捏造しない**。欠落値は *question* / *not-enough-information* へ — **default/guess は禁止**。
- **60分（や任意）node duration の捏造禁止**。PreSolverNode/TravelNode に node-duration field 無 → 欠落は proposed `needs_node_duration`。
- **travel time 捏造禁止**。`RouteBurdenMeta`(derived:true, doorToDoorNorm?) は advisory burden で**分でない**・`TravelEdge.durationMin` に流用しない。
- **route duration 捏造禁止**。PreSolverEdge は durationMin omit・Maps/route API 不使用 → 欠落は `route_duration_missing`/`needs_route_duration`。
- **`dayIndex` 捏造禁止**。【ADV-fix HIGH-1】day-assignment は solver 所有で、**`TravelPlanScope.window` は「どの日が在るか」だけを供給し per-node の day を供給しない**。window 欠落→`needs_time_window`、多日で node→day binding なし→ proposed `day_assignment_missing`（§7/§8）。date を guess して dayIndex を割らない。
- **opening hours 捏造禁止**。explicit `open_hours_window_lock` のみ→欠落は `lock_unplaceable`/`needs_time_window`。"終日営業" を仮定しない。
- **live timetable 推論禁止**（`last_departure_lock` は explicit window 要・欠落→`needs_time_window`）。
- **live availability 推論禁止**（`reservation_window_lock`/`timed_entry_lock` は explicit lock のみ・不明→`lock_unplaceable`）。
- **booking/cancellation status 推論禁止**（境界は authority を持たない・出力は `authoritative===false` の DRAFT・readiness が別途 action を gate）。
- **weather 推論禁止**（weather は SolverInput に入らず・hidden default/fatigue 調整/availability 仮定にしない）。

**privacy 二層**: private blocker は server-side で feasibility を変えてよいが reason text を shared `CompositionMissingQuestion`(field+bounded reason のみ)/shared report に漏らさない。raw `FitResult` なし・client-only filtering なし。

---

## §7 出力契約の選択肢
| 案 | 形 | 判定 |
|---|---|---|
| A. SolverFeasibilityReport のみ | report-only（時刻を産まない） | 捏造不可能（構造的安全）だが full 指定でも schedule を出さず under-deliver |
| B. ScheduledTravelItineraryDraft | 常に schedule を出す | **REJECTED — duration/time 欠落でも schedule を強制→durationMin/startMin 捏造=no-fabrication 違反。選ばない** |
| C. TravelCandidate with itinerary | full `TravelCandidate` を出す | candidate 構築（TradeoffProfile/rationale/ranking）に侵入・scope 外。**TravelCandidate を出さない**（later GO まで） |
| **D. Hybrid（推奨）** | 常に proposed `SolverFeasibilityReport`・**全 required explicit な時のみ** optional proposed `ScheduledTravelItineraryDraft`・**`TravelCandidate` を出さない** | 構造的 fail-closed・privacy 二層遵守・ranking 無 |

**推奨 = D**。solver は `CompositionDraft` surface を consume し、`SolverFeasibilityReport` を常に produce、`ScheduledTravelItineraryDraft` は §5 全 required explicit 時のみ。**`TravelCandidate` は later GO まで産まない**。

**proposed `SolverFeasibilityReport`**（report-only・非authoritative）:
```jsonc
// PROPOSED — T11-C 未実装
SolverFeasibilityReport {
  outcome: "feasibility_report",   // proposed literal
  authoritative: false,            // CompositionDraft.authoritative を踏襲・実行権限でない
  draft: true,                     // planning draft・readiness が別途 action を gate
  candidateId: string,             // CompositionDraft.candidateId を echo（新 candidate を作らない）
  state: SolverBoundaryState,      // proposed union・§8
  // CompositionDraft から verbatim（shared-safe 投影のみ・private 漏洩なし・raw FitResult なし）:
  unsatisfiedConstraints: UnsatisfiedConstraint[],
  missingCompositionQuestions: CompositionMissingQuestion[],
  hardBlockers: CompositionHardBlocker[],
  diagnostics: CompositionDiagnostic[],
  // solver 境界 additions（proposed・全 advisory・fit advisory 不変・ranking 無）:
  missingForSchedule: SolverInputGap[],   // proposed: どの §5 required explicit input が欠落か
  scheduledDraft?: ScheduledTravelItineraryDraft  // proposed: missingForSchedule 空の時のみ
}
```
【ADV-fix HIGH-2】`missingForSchedule` の reason 語彙 = 既存 `CompositionMissingQuestionReason`(route_duration_missing/price_unknown/area_unresolved/lock_unplaceable/low_confidence/entity_unbound) **＋ proposed 新規 `node_duration_missing`（既存になし・PreSolverNode に dwell 概念が無いため net-new）＋ proposed `day_assignment_missing`（多日 node→day binding 欠落用）**。`SolverInputGap` wrapper は absent today・C1 proposed。

**proposed `ScheduledTravelItineraryDraft`**（全 explicit 時のみ）:
```jsonc
// PROPOSED — T11-C 未実装
ScheduledTravelItineraryDraft {
  outcome: "scheduled_draft", authoritative: false, draft: true,
  candidateId: string,            // CompositionDraft.candidateId を echo
  itinerary: TravelItinerary      // 既存型・全 explicit 時のみ TravelDay/Node/Edge を参照
}
```
- 埋め込み `TravelItinerary` は `TravelDay.dayIndex`/`TravelNode.startMin`/`endMin`/`TravelEdge.durationMin`/`transport`/`budgetBand` を **各値が explicit 供給の時のみ** 使う。【ADV-fix HIGH-1】**`dayIndex` は scope から導出不可**: `TravelPlanScope` は「在る日の集合」のみ供給し per-node day を供給しない。node→day assignment は **solver 所有（HOLD）**。よって ScheduledTravelItineraryDraft は **(a) explicit node→day binding が供給** or **(b) single_day scope で dayIndex が自明に 0** の時のみ emit 可。多日で binding なし→ proposed `day_assignment_missing` で **fail-closed（feasible_unscheduled に落ちる）**、複数 `TravelDay` を捏造しない。【ADV-fix HIGH-2】さらに `missingForSchedule` に `node_duration_missing` が在る間は `feasible_scheduled_draft` に到達しない。いずれか欠落で draft を**出さない**（report-only 継続）。実 topo-sort/interval placement/day-assignment は **HOLD** — 本章は solver が将来埋める *形* のみ規定。

---

## §8 solver 境界 states（proposed `SolverBoundaryState`）
```ts
// PROPOSED — T11-C 未実装
type SolverBoundaryState =
  | "not_enough_information" | "feasible_unscheduled" | "feasible_scheduled_draft"
  | "infeasible_constraints" | "blocked_by_hard_constraint"
  | "needs_route_duration" | "needs_node_duration" | "needs_time_window" | "needs_alternative_entity";
```
| state | 返す時 | 既存 reason への ties |
|---|---|---|
| `not_enough_information` | composition が床で失敗（bound entity 無 or subject 欠落） | `CompositionFailureReason.no_bound_entities`/`missing_required_subject`・`entity_unbound` |
| `feasible_unscheduled` | valid draft + 構造的 precedence OK だが §5 required scheduling input が ≥1 欠落 → report-only・`scheduledDraft` 省略。【ADV-fix HIGH-1/2】**多日 day-assignment 欠落（`day_assignment_missing`）/ node duration 欠落（`node_duration_missing`）はここに集約** | 非空 `missingForSchedule`・`candidateNodes` あり・cycle なし |
| `feasible_scheduled_draft` | §5 全 explicit・unsatisfied/hard block 無 → `ScheduledTravelItineraryDraft` を同梱。【ADV-fix HIGH-2】**`missingForSchedule` に `node_duration_missing`/`day_assignment_missing` を含まないことが必須** | `missingForSchedule` 空・`unsatisfiedConstraints` 空・`hardBlockers` 空 |
| `infeasible_constraints` | 制約を共存不能（cycle or window/budget 衝突） | `UnsatisfiedConstraintReason.impossible_time_lock`/`ordering_cycle`/`budget_red_line_exceeded`/`no_feasible_placement`・`hasNonRelaxableCycle`・`CompositionFailureReason.impossible_time_lock` |
| `blocked_by_hard_constraint` | ≥1 place が hard-block（全 block なら composition が既に失敗） | `CompositionHardBlocker` あり・`all_nodes_hard_blocked` |
| `needs_route_duration` | edge があるが durationMin 不明・explicit route duration 未供給 | `route_duration_missing`・absent `PreSolverEdge.durationMin` |
| `needs_node_duration` | node の dwell 未供給（startMin/endMin を `endMin−startMin` で導けない） | absent `PreSolverNode.startMin/endMin`・**proposed `node_duration_missing`（net-new）** |
| `needs_time_window` | lock（開館/checkin/timed-entry）に置ける具体 window が無い | `lock_unplaceable`・`EntityTimeLock` あり・window 未解決 |
| `needs_alternative_entity` | required subject が block/unbound で代替必要 | `CompositionFailure.needsAlternative`・`missing_required_subject`+`CompositionHardBlocker` |

state 優先（fail-closed 先）: `not_enough_information` → `infeasible_constraints` → `blocked_by_hard_constraint` → `needs_alternative_entity` → (`needs_route_duration`|`needs_node_duration`|`needs_time_window` → `feasible_unscheduled` に集約) → `feasible_scheduled_draft`。

---

## §9 制約 handling（各 `OrderingKind`・solver は HOLD）
| 制約 | class | 境界挙動 |
|---|---|---|
| `must_precede` | **(i) 構造** | 方向 precedence・validity=DAG(no cycle) check（`CollectedConstraints.precedence` 上で scheduling なし可）。`PreSolverEdgeKind.must_precede` で carry |
| `luggage_drop_enables` | **(i) 構造** | enablement precedence・同 DAG check・`PreSolverEdgeKind.luggage_drop_enables` で carry・時刻不要 |
| `checkin_window_lock` | **(ii) scheduling** | explicit checkin window 要・欠落→`needs_time_window`/`lock_unplaceable`・default 窓を作らない |
| `checkout_window_lock` | **(ii) scheduling** | 同上 |
| `open_hours_window_lock` | **(ii) scheduling** | 供給開館時間内に配置・欠落→`needs_time_window`・開館時間を捏造しない |
| `meal_time_lock` | **(ii) scheduling** | meal 窓に anchor・explicit 窓要・欠落→`needs_time_window` |
| `last_departure_lock` | **(ii) scheduling** | 上限時間制約・explicit last-departure 時間 + (edge) durationMin で検証・時間欠落→`needs_time_window`/leg 欠落→`needs_route_duration` |
| `timed_entry_lock` | **(ii) scheduling** | 固定入場時刻に対する interval scheduling・未解決→`needs_time_window`/周辺 leg 欠落→`needs_route_duration`・2 lock 衝突→`impossible_time_lock` |
| `reservation_window_lock` | **(ii) scheduling** | 予約窓内配置・explicit 窓要・欠落→`needs_time_window` |
| `reorderable` | **(iii) hint** | `ReorderableHint`(無向)で carry・**それ自体で順序を作らない**・edge を出さない（PreSolverEdge は reorderable を除外）・solver(HOLD) が順序決定 |
| `derive_shortest_from_terminal` | **(iii) hint** | `SolverOrderingHint` で carry・解かない・route-shortest 導出は solver work（route data も無い） |

【ADV-fix LOW】**`ordering_cycle` は `OrderingKind` 値でない**（cross-cutting）: constraint collection 中に `CollectedConstraints.hasNonRelaxableCycle` で検出し `UnsatisfiedConstraintReason.ordering_cycle` として surface → `infeasible_constraints`。境界は **cycle を検出して fail-closed・break/resolve しない**（relaxation 選択も edge 除去もしない）。

不変: (i) は無時刻で decidable（precedence DAG のみ検証）/ (ii) は explicit data 前提・欠落で `needs_*`（捏造なし）/ (iii) はそれ自体で順序を誘導しない。fit は終始 advisory（hard block は `CompositionHardBlocker.reasonCode` のみ・raw FitResult/ranking なし・private は server-side のみ）。

---

## §10 scheduling アルゴリズム境界
**本フェーズで何も build しない・全 FUTURE-POSSIBLE のみ**。境界が既に pin する点: `candidateNodes` はフラット（startMin/endMin/dayIndex omit）・`edges` は durationMin omit・`CollectedConstraints` は carry のみ。
FUTURE-POSSIBLE（各 later GO・今は範囲外）: ①deterministic topological sort（precedence 消費・cycle 検出は既存だが sort/resolution は無）②interval feasibility check（lock 窓 vs assigned startMin/endMin）③day assignment（`TravelDay.dayIndex/date/nodes/edges` を `TravelPlanScope.window` 内に）④fallback branch selection（§11）。
**本フェーズ hard 除外**: optimization/scoring/ranking なし・route search なし・external/live data なし・**捏造なし**（60分 default/`durationMin`/`startMin`/`endMin`/`dayIndex`/opening hours/availability を作らない）。

---

## §11 fallback handling
`fallbackBranches:ContingencyBranch[]` は**代替であって実行 action でない**。`FallbackAction`(keep_plan|ask_question|downgrade_to_easy|switch_proposal|defer|cancel) は計画 branch ラベルで境界は発火しない。
- **live trigger 評価なし**: "rain" branch は事前代替で live-weather read を含意しない。
- **state 推論なし**: "fatigue" branch（`PreSolverNode.fatigueLoad`/`NodeConfidence` keyed）は健康/エネルギーを推論しない。
- **branch action は planning のみ**: downgrade_to_easy/defer/cancel は draft を再形成・book/un-book/calendar/accept をしない（§14）。
- **SELECTION は HOLD**: どの branch を適用するかは future-possible solver/phase work・later GO まで実装しない。`buildCompositionDraft` は shared-safe 全集合を carry・1 つを選ばない。
- **privacy**: 入出力とも shared-safe のみ（private は合成前に除去・§13）。`CompositionFailure.needsAlternative` も「代替必要」を signal するのみで auto-select/execute しない。

---

## §12 fit/ranking との関係
- **fit は advisory 維持**: `ProposalFitSummary`（bounded・raw FitResult でない）は advisory のみ。境界が fit を使うのは 2 経路のみ: (a) `FitHardBlock`→`CompositionHardBlocker` を **gate**（feasibility・preference でない）、(b) `budgetRedLine` 抵触→`budget_red_line_exceeded`（hard ceiling）。soft fit grade は feasibility 計算に入らない。
- **dominance/ranking 不変**: report は feasible/not を述べ、再ランク/再重み/dominance 主張をしない（scoring が無い・§10）。
- **Bundle 2 は分離**: fit/ranking surface は別 bundle・feasibility に畳み込まない。
- **authority 昇格なし**: いかなる fit 値も feasible 判定も action/booking authority にならない（§14）。`CompositionHardBlocker.reasonCode` は bounded code で raw descriptor/authorization でない。

---

## §13 Privacy（二層）
`Visibility="shared"|"private"`。T11-B と同 tiering。
- **server-side 効果・shared 漏洩なし**: `CompositionHardBlocker.visibility="private"`(+`ownerParticipantId`) は server-side で feasibility を変えてよいが、shared 投影に reasonCode/owner を出さない。shared view は「infeasible/選択肢減」を見るが**なぜ**(誰/理由)を見ない。
- **missing-question 非漏洩**: `CompositionMissingQuestion` は field + bounded reason のみ・private 内容を露出しない。private `UnsatisfiedConstraint` は shared report から抑止。
- **raw FitResult を client に出さない**: 越境は bounded code のみ（reasonCode・ProposalFitSummary）。raw FitResult/FitHardBlock/private `TravelConstraint.descriptor` は server-side。
- **private diagnostics なし**: `CompositionDiagnostic.code`/`detail` は shared-safe。
- **client-only filtering なし**: mask は server 投影前・client に full data を送って "UI で隠す" を禁止。

---

## §14 Authority
- **出力は planning DRAFT のみ**: `outcome="draft"`/`draft=true`/`authoritative=false` 構造。proposed report/scheduled draft も同 invariant 踏襲。**solver artifact は実行権限を持たない**。
- **solver は act 不可**: book/reserve/calendar write/send/accept-decline をしない。feasible な `ScheduledTravelItineraryDraft` は実行同意でない。
- **readiness が別途 action を gate**: 実行権限は readiness のみ（`ReadinessResult.authoritative` + `ReadinessState` + actionKind + requiredConfirmations）。境界は readiness を呼ばず/推論せず/短絡しない。"feasible" は `ready_to_propose` を含意しない。
- **booking/calendar は別 GO**: feasible draft + ready でも実 booking は別 downstream GO。feasibility(§12)→readiness(本章)→action は 3 つの別 gate・solver は最初のみ所有。

---

## §15 将来実装の golden test（今は未実行）
proposed `SolverFeasibilityReport`（C1 proposed）に対する将来 assertion。全 proposed・既存型に field 追加なし。fixture は `CompositionInput`（entities/bindings/orderingConstraints/timeLocks/routeChains）から。
1. **node duration 無 → `needs_node_duration`**（startMin/endMin を合成しない・feasible でない）。
2. **edge duration 無 → `needs_route_duration`**（route_transition で explicit 無→`route_duration_missing` 並行・durationMin 捏造なし）。
3. 【ADV-fix LOW・2 副ケースに分割】**(a) 非relaxable cycle**（`hasNonRelaxableCycle===true`）→ `CompositionFailure(reason="impossible_time_lock")` + `feasibilityState="infeasible"`・部分 schedule 無。**(b) relaxable-only cycle**（`cyclePresent===true`・`hasNonRelaxableCycle===false`）→ **failure でない**・`UnsatisfiedConstraint(reason="ordering_cycle")` で surface・state∈{needs_data|needs_question}・**impossible_time_lock にしない**（grounded collector の 2 flag 挙動に一致・過剰 block 防止）。
4. **`must_precede` を feasibility report で尊重**（precedence pair を respected ordering として記録・跨いで reorder しない・実 topo-sort はしない）。
5. **`reorderable` はそれ自体で順序を作らない**（`ReorderableHint`(無向)・`precedence` に入らない・must_precede edge を合成しない・順序未選択）。
6. 【ADV-fix LOW・型 routing 訂正】**`last_departure_lock` は constraint で live timetable でない**: `EntityTimeLock`→`OrderingKind="last_departure_lock"` は **`TIME_LOCK_KINDS` 経由で `TravelConstraint`(axis=time) として carry（`SolverOrderingHint` ではない）**。explicit departure window 無→ proposed `needs_explicit_window`（`lock_unplaceable` 並行）。**`derive_shortest_from_terminal` のみが `SolverOrderingHint` として carry**・どちらも実 timetable に解決しない。
7. **checkin/open-hours lock は explicit window 要**（無→ proposed `needs_explicit_window`・`feasibilityState!="feasible"`・opening hours/checkin を捏造しない）。
8. **全 explicit → later GO で scheduled draft**（全 node dwell・全 route_transition duration・全 lock window が explicit な時のみ proposed `ScheduledTravelItineraryDraft` を産み得る・`authoritative:false`/`draft:true`・`TravelCandidate` を出さない・later GO flag default OFF）。
9. **60分 duration 捏造なし**（どの node も default dwell を受けない・explicit source 無き interval を scan で否定）。
10. **route duration 捏造なし**（`TravelEdge.durationMin` は explicit 由来のみ・各 leg を explicit にたどれねば `needs_route_duration`）。
11. 【ADV-fix HIGH-1】**explicit trip range 無しに `dayIndex` 割当なし**: scope 欠落 or `window.kind="single_day"`→多日分割なし（dayIndex 自明 0）。`window.kind="range"`(explicit startDate/endDate/nights 1|2) **かつ explicit node→day binding** がある時のみ複数 `TravelDay.dayIndex` を持ち得る・各 `date` は caller 注入。**binding なき多日→ proposed `day_assignment_missing` で `feasible_unscheduled`**・dayIndex を捏造しない。
12. **private blocker は feasibility を変えるが shared reason を漏らさない**（server-side で `infeasible`/`needs_question` に flip 可・shared は bounded `reasonCode`@shared visibility のみ・raw text/owner/`fitInputs`/raw FitResult を出さない・client-only filtering なし）。
13. **booking/action authority なし**（report/scheduled draft は `authoritative:false`・action は別 `ReadinessResult.authoritative` gate・境界は readiness を set/book/calendar しない）。
14. **外部 fetch/API/DB/Supabase import なし**（C1-C5 は `lib/shared/travel/*` pure のみ import）。
15. **M2 runtime なし**。 16. **app/UI import なし**。 17. **既存 travel test green**（additive・golden は GO まで `it.skip`/snapshot）。 18. **tsc baseline 不変**（proposed 型は additive・golden は test-only）。

---

## §16 CEO 承認後の実装スライス
各 pure・fail-closed・named grounded 型のみ触る。全 proposed・本フェーズ未実装。逐次・C5 後 STOP。
- **C1 solver boundary 型**: proposed input/output 契約型のみ（`SolverFeasibilityInput`＝`CompositionDraft` 上の re-projection・`SolverFeasibilityReport{feasibilityState, missingData[], infeasibleConstraints[], respectedOrdering[], scheduledDraft?}`・proposed enum `FeasibilityState`(feasible|needs_data|infeasible|needs_question)・`MissingDataKind`(**`node_duration_missing`**[net-new・既存 analog なし]|`route_duration_missing`[既存再投影]|`needs_explicit_window`[`lock_unplaceable` 再投影]|**`day_assignment_missing`**[net-new・多日 binding 欠落])）。*touch*: PreSolverNode/Edge/TravelConstraint/SolverOrderingHint/ReorderableHint/Visibility（read-only・field 追加なし）。*fail-closed*: 型のみ・logic なし・default は最 restrictive(`needs_data`)。
- **C2 feasibility classifier**: pure 関数 `CompositionResult`→`feasibilityState`+`infeasibleConstraints[]`。`hasNonRelaxableCycle`/`unsatisfiedConstraints`/`hardBlockers` 消費・`CompositionFailure.reason`→`infeasible`。【ADV-fix LOW】**非relaxable cycle のみ `impossible`・relaxable-only cycle は `ordering_cycle` で needs_*（過剰 block しない）**。*fail-closed*: cycle/unsatisfied/hard-block/failure→非 feasible・sort/scheduling/route-search なし・private は server-side で flip し shared に reasonCode のみ。
- **C3 missing-data detector**: pure 関数で `missingData[]`(MissingDataKind) 導出（absent node duration・absent route_transition edge duration・explicit window 欠 lock・**多日 node→day binding 欠 → `day_assignment_missing`**）。既存 `CompositionMissingQuestion.reason` 意味を再利用。*fail-closed*: 欠落→報告・default しない・`needs_data`/`needs_question`・never `feasible`。
- **C4 optional scheduled-draft 設計（NARROW・safe な時のみ）**: proposed `ScheduledTravelItineraryDraft` の **設計のみ**（C2=`feasible` ∧ C3 `missingData[]` 空 ∧ `TravelPlanScope.window` explicit ∧ **node→day binding explicit/single_day** の時のみ `TravelDay/Node/Edge` を埋め得る・`TravelCandidate` を出さない）。*fail-closed*: draft 生成が **interval scheduling search/day-assignment optimization/route resolution を要するなら STOP して別 GO に分割**。C4 は explicit 値の placement mapper であって optimizer でない。default=設計 doc のみ・emission code は別 GO まで無。
- **C5 golden tests**: §15 1-18 を `it.skip`/golden で encode。*fail-closed*: 非捏造/fail-closed を assert・additive・既存 green/tsc 不変。
> **実 solver/optimizer の前で STOP**（別承認なき限り）。topo-sort/interval scheduler/day-assignment/optimization/route-search を**どのスライスでも実装しない**。

---

## §17 Stop
本設計 report で停止。C1-C5 を実装しない・file を書かない・`TravelCandidate`/populated `TravelItinerary` を出さない・solver/scheduler/optimizer/route-search を作らない。proposed 型は提案のまま。CEO 承認後のみ進む（設計提案=自律・実行=CEO 承認後）。C1 実装前に `docs/decision-log.md` に GO を記録。

---

## §18 Adversarial verification summary（適用済 9 補正）
workflow `wpk4ot5g7` の 10 verifier が検出し本文へ反映:
| # | sev | 場所 | 検出 | 補正 |
|---|---|---|---|---|
| HIGH-1 | boundary | §7 ScheduledTravelItineraryDraft | "dayIndex from supplied scope" が scope（在る日）と per-node day-assignment（solver work）を混同・多日 itinerary を binding なしに具現化し得る | scope=「在る日の集合」のみ・per-node dayIndex は solver 所有(HOLD)・**node→day binding explicit or single_day の時のみ draft**・多日 binding 欠→ proposed `day_assignment_missing` で `feasible_unscheduled` |
| HIGH-2 | boundary | §7/§8 needs_node_duration | `node_duration_missing` が `missingForSchedule` 語彙に無く、node duration 欠でも `feasible_scheduled_draft` 到達→捏造リスク | proposed `node_duration_missing` を `missingForSchedule` に追加・`feasible_scheduled_draft` は当該 gap が無いことを必須化・net-new(既存 analog なし)と明記 |
| LOW | field | §5 trip date | `area_unresolved`(area 専用)を date 欠落に流用 | date/window 欠落は proposed `needs_time_window`/`time_window_missing` へ・`area_unresolved` は area のみ |
| LOW | boundary | §4 timeWindowsAndLocks | descriptor を window 分にパースする読みを誘発 | TravelConstraint verbatim carry・**境界は descriptor を window 分にパースしない**・下流が解決 |
| LOW | field | §9 ordering_cycle | `OrderingKind` 分類表に `ordering_cycle`(=UnsatisfiedConstraintReason)を混在 | cross-cutting として分離・`OrderingKind` 値でないと明記 |
| LOW | boundary | §7 Option B | "常に schedule" 案を誤採用し得る・重複 token | **REJECTED（no-fabrication 違反・選ばない）**明記・token 修正 |
| LOW | boundary | §15 case 3 | 非relaxable と relaxable-only cycle を混同し過剰 block | (a)非relaxable→impossible_time_lock failure (b)relaxable-only→ordering_cycle・非failure に分割 |
| LOW | field | §15 case 6 | `last_departure_lock` を SolverOrderingHint と誤記 | TIME_LOCK_KINDS 経由 `TravelConstraint`(axis=time)・SolverOrderingHint は `derive_shortest_from_terminal` のみ |
| LOW | field | §15/§16 | `needs_node_duration` を既存 analog ありと誤示唆 | net-new proposed と明記（route_duration_missing/lock_unplaceable は既存再投影） |

---

## §19 CEO 判断請求
1. 次フェーズを **T11-C Solver / Scheduler Boundary Design（docs-only・本書）** として承認するか（§1 推奨=(a) solver 境界・vs B/C/D/E）。
2. **★出力契約 = D（Hybrid: 常に `SolverFeasibilityReport`・全 explicit 時のみ optional `ScheduledTravelItineraryDraft`・`TravelCandidate` を出さない）** で良いか。
3. **★HIGH 2 補正**（per-node `dayIndex` は scope から導出不可で solver 所有=HOLD→`day_assignment_missing`／`node_duration_missing` が schedule gate を阻む）を正本として受理するか。
4. §4-§14 の契約・states・constraint 分類・fail-closed/privacy/authority 規則で進めて良いか（特に: 捏造なし・fit advisory・no TravelCandidate・readiness 別 gate）。
5. 承認時、実装は **C1→C2→C3→C4(narrow)→C5・solver 前 STOP**（§16）の順で良いか（各別途 GO・C4 が scheduling search を要すれば分割）。

**本書で停止**。実装（C1〜）は CEO 承認まで着手しない。
