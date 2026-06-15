# S4 Forced-vs-Choice Finalization / Provisional Default / AssemblyInput Handoff Design（docs-only・S4 は HOLD）

**作成日**: 2026-06-14 / **ステータス**: docs-only・実装なし・**S4 は HOLD**（別 GO）・stop after report。
**スコープ**: Travel 専属。**禁止**: 実装・外部/route/weather/place/Maps/OTA API・fetch/DB/M2 runtime・booking/calendar/action authority・捏造（time/day/order の自動決定）・ranking 変更・本番 `/plan`・push。

**★前提を疑った核心（CEO+GPT が名指しする最大の危険・directive ①⑦）**: **provisionalDefault が実質的な自動決定になること**。よって S4 を「**default を決める層**」でなく「**選択肢を保持したまま暫定値を提示し、ユーザー/上流が明示選択した時のみ AssemblyInput へ渡す層**」= **selection-ledger（選択台帳）+ STN 再伝播 + handoff 適格判定** として設計する。**provisionalDefault は SUGGESTION のみで台帳の外に置き、絶対に自動適用しない**。

**設計根拠**: workflow `wz4dc55aj`（11 agents）= 2 grounding → 3 アーキ（**selection-ledger** / default-deciding / pure-report）→ 2 judge（agency-safety / handoff）→ synthesize → 3 adversarial verify。**両 judge が selection-ledger を spine に採用**。adversarial が **15 補正（3H/7M/5L）** 検出し全反映（§16）。

---

## §1 前提を疑う — S4 が次か（vs S5/Bundle2/UI preview）
- **vs S5（minimal-perturbation 再計画）**: 摂動する安定構造がまだ無い（S3 の feasible_space で止まり handoff 無）。S5 は S4 が産む選択/handoff 構造を基盤に要する。**S4 が先**。
- **vs Bundle 2（ranking）**: ranking は「どの提案が勝つか」、S4 は per-candidate finalization。直交。**S4 が先**。
- **vs scheduled-draft UI/preview**: handoff 層が無いと UI が default を捏造する羽目になる（禁忌）。**S4 が先**。
**推奨 = S4**。S2 region + S3 forced-order/choice を、**完全解決した非権限 `AssemblyInputCandidate`** or **透明な未解決 report** に変換する唯一の unblocker（user の代わりに決めずに）。

---

## §2 Closeout（S1/S2/S3）
| Slice | 成果 | 状態 |
|---|---|---|
| **S1 型壁** | `solver-schedule-types.ts`: PlacementBasis/SharedPlacementBasis + projectSharedPlacementBasis・TieBreakRule・PlacedNode・ScheduleProvenance/SharedScheduleProvenance・**ScheduleChoicePoint**(provisionalDefault?/namedTieBreak/rationale)・SolverInfeasibility・EventRegion・TemporalFeasibilityResult・MATERIAL_SLACK_THRESHOLD_MIN=15・SCHEDULE_NODE_CAP_PER_DAY=8 | 完成 |
| **S2 temporal region** | `solver-stn-feasibility.ts`: computeTemporalFeasibility/Shared・**buildClosedStn**(input,{includePrivate})→ClosedStn/BuildStnResult・temporalInfeasibility | 完成 |
| **S3 partial order + coupled choice** | `solver-sequencing-feasibility.ts`: computeSequencingFeasibility/Shared→feasible_space{forcedOrder:P, choicePoints}。**S3 は provisionalDefault を立てず・namedTieBreak は S4 用 rule 名宣言のみ**・coupling=連結成分(size2 binary/size≥3 composite) | 完成 |
| **S4** | 本書 | **HOLD** |

---

## §3 S4 問題 + selection-ledger framing
**gap**: S2=possibility space(EventRegion)・S3=forced 半順序 P + open choice。だが `AssemblyInput` は explicit な intervals/day/durations/costs を要求。各値の **FORCED**(自動充填・binding 引用) / **CHOICE**(保持) / **provisional**(SUGGESTION) を決める透明層が無い。
**interaction**: choice は coupled — 1 選択が STN を再伝播し他を **FORCED 化**(透明・user 選択に帰属)。ゆえ S4 は default-deciding でなく **selection-application + re-propagation + handoff-eligibility**。
**framing（採用）**: S4 = `(SolverScheduleInput, ledger)` 上の pure 決定論関数。**ledger** = append-only `ChoiceSelection[]`（各々 user/上流 action に trace・provisionalDefault を**受諾する明示行為**も含む）。① shared choice surface 再計算 ② 各 selection を explicit STN edge として適用 ③ STN 再閉路→EventRegion 再導出（新 forced = 選択の **cascade 帰結**）④ residual choice 再計算 ⑤ 各 selection を **authoritative STN で再検証**（fail-closed）⑥ 完全解決時のみ非権限 `AssemblyInputCandidate`、さもなくば `UnresolvedChoiceReport`。**最適化/ranking/objective 無し**。

---

## §4 forced vs choice semantics
**FORCED（自動充填・binding 引用）**: forced interval(`EventRegion.forced===true`)・forced ordering(S3 forcedOrder が cluster を全順序化)・forced day(single_day→`dayIndex 0` / range→`nodeDayBindings` explicit or precedence/lock 固定)。
**CHOICE（保持・選択まで handoff block）**: choice interval(slack ≥ `MATERIAL_SLACK_THRESHOLD_MIN`=15 の `time_window_choice`)・choice ordering(S3 `ordering_choice`・binary/composite)。
**【ADV-fix HIGH-2/MED day】choice day は無い**: day 列挙は S3 で HOLD ゆえ S4 でも **`day_assignment_choice` を S4 が産まない**。range で binding 無 = **explicit input 欠落 `day_assignment_missing` gap**（fail-closed・guess しない）。`ChoiceSelection.mode:"day"` は **reserved-for-future**（day-enumeration GO まで使わない）。
**no hidden collapse**: open choice に触れる node は **placed しない**・open axis のまま handoff を block。material-slack 値を matching selection 無しに pin する code path は無い。

---

## §5 provisional default semantics（★SUGGESTION のみ・自動適用しない）
**`provisionalDefault` は open `ScheduleChoicePoint` に付く SUGGESTION で、明示 `ChoiceSelection`（"suggestion を受諾"含む）が選ぶまで `AssemblyInput` に流れない**。
- **権限でない/承認でない**・**可視に暫定+override 可**（pre-check しない・feasibleOptions/feasibleRange を併置し「受諾」を真の比較にする＝status-quo bias guard）。
- **named 透明 tie-break が適用できる時のみ計算**（S3 宣言の `namedTieBreak` を shared range 上で）。**計算は可・適用は不可**。precondition 不成立（例 metric 無の shortest_route・feasibleRange 無）→ **provisionalDefault を産まない**（bare のまま）。
- **hidden objective でない**（named/transparent/recorded）。
- **★自動適用しない**: provisionalDefault は **ledger machine の外**・selection→STN 適用で読まれず・nodeIntervals/nodeDayBindings に copy されず・handoff 適格に数えない。**default 付きで matching selection 無の choice は default 無と全く同じに扱い handoff を block し residualChoicePoints に出る**。
**唯一の promotion path**: user/上流が `ChoiceSelection{origin:"accept_default"}` を出し**選択値 = suggestion** の時のみ pin。`HandoffBasis="accepted_default"`（"system が決めた"でなく"user が suggestion を受諾"を記録）。
**【ADV-fix MED accept_default】機械的 guard**: S4 は **`origin:"accept_default"` で選択値 ≠ その choice point の現 provisionalDefault の selection を `selection_rejected` で拒否**（prose 不変条件を機械 check 化）。S4 は accept_default を**合成しない**。**台帳 append 境界（S4 外の上流 writer）が、user の明示 accept action 時のみ origin=accept_default を立て selected=suggestion とする責務**。
**不変条件**: matching `accept_default` 無しに適用された provisionalDefault 数 = 常に 0。

---

## §6 許可 named tie-break
| TieBreakRule | suggestion 用途 | precondition |
|---|---|---|
| `earliest_feasible` | time_window_choice → `feasibleRange.lo` | feasibleRange あり |
| `fewest_day_crossings` | ordering/day choice | shared nodeDayBindings 文脈あり |
| `shortest_route` | ordering choice | **explicit route metric(edgeDurations)ある時のみ**・無→suggestion 無 |
| `lexicographic_nodeId` | 【ADV-fix LOW】**内部決定論 disambiguator・suggestion として surface しない**（ordering choice の唯一 tie-break が lexicographic の時は **provisionalDefault を UNSET**・bare のまま）| — |
| `anchor_first` | 【ADV-fix MED】**NOT YET GROUNDED**（composition に `anchor` field 無）— grounded field 出現まで suggestion 無・S4 が anchor signal を**合成しない** | （未 ground） |
| `soft_preference_count` | 【ADV-fix MED】**NOT YET GROUNDED**（soft-preference store 無）— 同上・合成禁止 | （未 ground） |
規則: ①suggestion は `tieBreaksApplied` に記録（"applied"=computed-as-suggestion・force-pin でない）②**hard 制約を override しない**（suggestion は必ず shared feasibleRange/Options 内）③**shared 由来 range のみ**（private narrow で suggestion を着地させない・§10）④precondition 不成立→suggestion 無。

---

## §7 S4 出力（proposed・既存型再利用）
既存再利用: `ScheduleChoicePoint`/`PlacedNode`/`EventRegion`/`ScheduleProvenance`/`SharedScheduleProvenance`/`ViewerScopedRationale`/`AssemblyInput`/`NodeInterval`/`SolverInfeasibility`/`SolverInputGap`/`AssemblyGap`/`buildClosedStn`/computeShared*。envelope(outcome+authoritative:false+draft:true+candidateId)は既存規約に一致。
```ts
// 【ADV-fix HIGH-1/3】handoff gap は 2 enum 跨ぎ（AssemblyGapKind ⊄ SolverInputGapKind・overlap は route_duration_missing/day_assignment_missing/price_unknown のみ）
export type S4HandoffGap = AssemblyGap | SolverInputGap; // proposed

export interface ChoiceSelection {                 // proposed・1 明示選択
  selectionId: string;
  kind: "ordering_choice" | "time_window_choice";  // ★ day_assignment_choice は reserved-for-future（§4）
  ref: string;                                     // ScheduleChoicePoint.ref を echo（shared-safe）
  selected:
    | { mode: "ordering"; option: string }         // binary: option ∈ feasibleOptions（"a→b"）
    | { mode: "ordering_pair"; from: string; to: string } // ★【ADV-fix MED】composite(size≥3): cluster member の有向 pair・compile=1 precedence edge→smaller residual
    | { mode: "time"; startMin: number };          // startMin ∈ [feasibleRange.lo, hi]
  origin: "user_explicit" | "upstream_explicit" | "accept_default"; // ★ accept_default は S4 が合成しない
}
export interface S4ResolutionInput { base: SolverScheduleInput; sequencing: SequencingFeasibilityResult; ledger: ChoiceSelection[]; } // proposed
export type HandoffBasis = "forced_by_constraint" | "explicit_choice" | "accepted_default" | "cascade_of_choice"; // proposed・private member 無
export interface HandoffProvenanceEntry { ref: string; basis: HandoffBasis; selectionId?: string; } // proposed
export interface UnresolvedChoiceReport {          // proposed
  outcome: "unresolved_choices"; authoritative: false; draft: true; candidateId: string;
  placed: PlacedNode[];
  residualChoicePoints: ScheduleChoicePoint[];     // shared 再計算・各々 provisionalDefault SUGGESTION を持ち得る
  missingForHandoff: S4HandoffGap[];               // ★ AssemblyGap|SolverInputGap（fail-closed・default しない）
  sharedProvenance: SharedScheduleProvenance;
}
export interface SelectionRejection { selectionId: string; reason: "selection_infeasible"; } // proposed・single neutral reason
export interface AssemblyInputCandidate {          // proposed・完全解決時の非権限 payload（itinerary でない）
  outcome: "assembly_input_candidate"; authoritative: false; draft: true; candidateId: string;
  assemblyInput: AssemblyInput;                    // 全 field が forced-or-selected
  handoffProvenance: HandoffProvenanceEntry[];
  resolutionTrace: Record<string, "forced" | "explicit_selection">; // 【ADV-fix LOW】値は exhaustively この 2 値・private-forced は "forced" に写す
}
export type S4ResolutionResult =                   // proposed
  | AssemblyInputCandidate | UnresolvedChoiceReport
  | { outcome: "selection_rejected"; authoritative: false; draft: true; candidateId: string; rejections: SelectionRejection[] }
  | { outcome: "infeasible"; authoritative: false; draft: true; candidateId: string; infeasibility: SolverInfeasibility }
  | { outcome: "needs_input"; authoritative: false; draft: true; candidateId: string; missingForSchedule: SolverInputGap[] };
// function applySelectionLedger(input: S4ResolutionInput): S4ResolutionResult  // proposed・pure・決定論
```
**【ADV-fix HIGH-2】★time_window_choice を materialize する named helper（phantom carrier 解消）**: S2 は EventRegion を、S3 は ordering_choice **のみ**を産む。slack ある interval の agency surface は**存在しない**。→ proposed pure helper `deriveTimeWindowChoicePoints(sharedEvents): ScheduleChoicePoint[]` が、**shared** EventRegion で `startLatest − startEarliest ≥ MATERIAL_SLACK_THRESHOLD_MIN` の各 node に `time_window_choice`(`feasibleRange={lo:startEarliest, hi:startLatest}`・shared region のみ・**provisionalDefault は §6 precondition 成立時のみ・既定 UNSET**)を産む。**これは機械的(decision でない)**。**materialize された choice は covering `ChoiceSelection` まで handoff を block**（§9 gate(2)）。
**再伝播 + cascade（buildClosedStn 再利用）**: ①shared surface 再計算 ②各 selection を edge 化（ordering/ordering_pair→precedence pair・time→`SolverTimeBoundInput` no_earlier+no_later で startMin pin・`constraintId="selection:<id>"`）③`buildClosedStn(augmented,{includePrivate:false})` 再閉路→新 forced = `cascade_of_choice`(originating selectionId 引用・再 surface しない)④`computeSharedSequencingFeasibility` 再実行→residualChoicePoints（composite に 1 binary 選択→**smaller residual**・auto-complete しない）。**Floyd-Warshall edge 追加は可換**ゆえ出力は selection の**集合**の pure 関数（順序は provenance 表示のみ）。

---

## §8 S4 が出さないもの
`ScheduledTravelItineraryDraft`/`TravelItinerary`/`TravelCandidate` なし・**`assembleScheduledDraft` を呼ばない**・`TravelCorePlan.candidates` に入れない・booking/calendar/send/authority なし（全 authoritative:false/draft:true）・silent final order/day なし（provisionalDefault 値は matching 明示 selection 無しに AssemblyInput へ行かない）・shared choice に private reason なし（§10）・raw FitResult/ranking なし・外部/live/M2 なし・決定論。

---

## §9 AssemblyInput handoff 境界
全 ledger 適用 + STN 再閉路後、以下**全成立時のみ** `AssemblyInputCandidate` 構築:
1. **完全解決** — `residualChoicePoints` 空（slack≥15 の time_window_choice も feasibleOptions>1 の ordering_choice も未 cover で残らない）。
2. **全 interval forced-or-selected** — 各 node の再閉路 EventRegion が forced OR ledger `time_window_choice` が startMin を pin。**【ADV-fix LOW endMin】`endMin := startMin + nodeDurations[nodeId]`（nodeDurations 必須・無→`node_duration_missing` が block・default dwell 禁止）・`endMin > startMin` ∧ `≤1439`（違反→`invalid_interval`）**。tie-break/provisionalDefault に残さない。
3. **全 day forced-or-selected** — single_day→`dayIndex 0` / range→precedence・lock で forced OR explicit `nodeDayBindings`。**guess/列挙しない**（day_assignment_choice 経由でない・§4）。
4. **全 explicit source あり** — **【ADV-fix HIGH-1/3】`missingForHandoff: S4HandoffGap[]` 空**。gate は **AssemblyGapKind 全値を mirror**（node_interval_missing/invalid_interval/overlapping_interval/edge_transport_missing/edge_cost_missing/date_missing/lock_window_violation は **AssemblyGap**・route_duration_missing/day_assignment_missing/price_unknown は両 enum・split_day_required は SolverInputGap）。S4 は S3 no-overlap + `SCHEDULE_NODE_CAP_PER_DAY` を augmented 入力で再実行し `overlapping_interval`(AssemblyGap)/`split_day_required`(SolverInputGap) を `missingForHandoff` に出す（壊れた candidate を出さない）。
5. **private 再検証 pass** — authoritative STN `buildClosedStn(base+ledgerEdges,{includePrivate:true})` が consistent。shared feasible だが authoritative infeasible → `selection_rejected`（neutral・§10）。
**S4 が埋める vs caller 供給**: S4 が**所有**=`nodeIntervals`(forced/selected startMin/endMin)・`nodeDayBindings`(forced/selected dayIndex)。**caller 供給(S4 は検証のみ・発明しない)**=`draft`/`scope`/`edgeDurations`/`nodeBudgetBands`/`edgeTransports`/`edgeCosts`/`lockWindows`。`edgeDurations` は explicit input で route から導出しない。
(1)-(5) いずれか不成立→ `UnresolvedChoiceReport`(placed+residualChoicePoints+missingForHandoff) or `needs_input`(SolverInputGap[]) or `infeasible` or `selection_rejected`。**partial candidate に silent 値を埋めない**。
**discipline**: candidate は非権限 payload で**別後段 A-stage** に渡す。S4 は `assembleScheduledDraft` を呼ばず・`detectAssemblyReadiness` の結果を agency gate にしない（readiness ≠ agency）。A-stage `detectAssemblyReadiness`(assemblyReady ⊂ feasible) が**独立 second fail-closed gate**として走るので too-loose な S4 candidate も assembly で fail-closed（booking でない）。
**【ADV-fix LOW too-strict】batch-accept affordance（future/HOLD・予約直前まで到達のため）**: batch "accept all" は **choice point ごとに 1 つの明示 `accept_default` ChoiceSelection を emit**（各 override 可・各 handoffProvenance に accepted_default 記録）・**global flag で台帳を skip しない**（§5 不変条件を保持しつつ usable に）。

---

## §10 privacy（二層・fail-closed neutral 再検証）
**shared 再計算（user が見て選ぶ surface）**: 常に shared 投影（`buildClosedStn{includePrivate:false}` + computeSharedTemporalFeasibility + computeSharedSequencingFeasibility）。`ScheduleChoicePoint.ref/feasibleRange/feasibleOptions/provisionalDefault` は **shared-only 制約由来**。`rationale.shared` は private cause を含まず private 理由は `rationale.forParticipant[ownerId]` のみ。`SharedScheduleProvenance` は `forced_by_private_constraint→"constrained"`(projectSharedPlacementBasis)・`HandoffBasis` は **private member 無**ゆえ private bound forced 値は `forced_by_constraint` と見える。**【ADV-fix LOW resolutionTrace】`resolutionTrace` 値は exhaustively `{"forced"|"explicit_selection"}`・private-forced は必ず `"forced"`（private 区別 token を足さない）**。
**cascade 帰属 guard**: `cascade_of_choice` は **shared 再閉路からのみ**帰属。authoritative では forced だが shared+ledger では forced でない値は `forced_by_constraint`(neutral)・selectionId に紐付けない（"私の選択が隠れた制約を起こした"を推論させない）。
**authoritative 再検証（fail-closed・guard）**: 各 selection を authoritative STN にも適用。shared で valid(option ∈ shared feasibleOptions)でも private lock/time bound で authoritative infeasible なら **`SelectionRejection.reason="selection_infeasible"`（単一 neutral reason・制約/node/owner/private を名指さない）** で拒否。**【ADV-fix MED routing】top-level `needs_input.missingForSchedule` は SHARED pass の gap のみ運ぶ。authoritative pass の needs_input/infeasible で shared pass に無いものは `selection_rejected`(ref 無)に collapse**（private constraintId/ref を漏らさない）。private/red_line 由来に suggestedRelaxations を出さない。
**no-leak checklist**: provisionalDefault(shared 由来) / feasibleOptions(shared ids) / rationale.shared(neutral) / HandoffBasis(private member 無) / residualChoicePoints(shared 再計算) / SelectionRejection.reason(single neutral) / missingForHandoff(shared-safe ref) / resolutionTrace(2 値 only)。shared-feasible vs handoff-eligible の差分で private 存在を推論不能（rejection は neutral・shared surface を rejection 説明のため silent に狭めない）。

---

## §11 S5 との関係
S5(minimal-perturbation 再計画)は deferred。S4 は S5 が再利用する clean 構造（append-only `ChoiceSelection[]` ledger・`AssemblyInputCandidate`・`HandoffProvenanceEntry[]`)を産む。**S4 自体は correction memory を持たない**(過去選択 state/摂動 cost/objective 無)・pure 関数ゆえ reversibility(selection 除去で再計算・stale forced 値を引き継がない)が S5 を上に乗せやすくする。

## §12 Bundle 2 との関係
S4 の tie-break は **single candidate の feasibility 内**で動き proposal ranking を変えない。sequencing default は dominance 主張でない。`fitSummary` は advisory・**別 Bundle 2 track**。S4 は FitResult/ranking/dominance を出さず import もしない。

---

## §13 将来 golden test
1. forced point 自動充填（forced→PlacedNode・nodeIntervals copy・HandoffBasis forced_by_constraint）。
2. slack≥15 → time_window_choice が residual に出て handoff block（**materialize helper 経由**・auto-pin なし）。
3. ordering_choice(options>1) 未 ledger→open・block。
4. provisionalDefault は named tie-break 許可時のみ（feasibleRange 無 / metric 無 shortest_route → undefined・bare）。
5. **【ADV-fix MED】未 ground tie-break(anchor_first/soft_preference_count/metric 無 shortest_route)→ provisionalDefault undefined**（名指しで assert・signal 合成しない）。
6. private narrowing を provisionalDefault に漏らさない（shared feasibleRange 由来）。
7. shared choice は shared-only 再計算（private だけで forced な node は shared report で "more resolved" にならない）。
8. material residual 非空→ UnresolvedChoiceReport（AssemblyInputCandidate でない）。
9. 全 selected→ handoff-ready（完全 nodeIntervals/nodeDayBindings + handoffProvenance + resolutionTrace）。
10. 再伝播 cascade（"A→B" 選択で downstream EventRegion forced 化→cascade_of_choice・shared 再閉路からのみ帰属）。
11. shared-visible-violates-private→ selection_rejected(neutral)・private descriptor どこにも無。
12. **【ADV-fix MED】accept_default の選択値 ≠ provisionalDefault → 拒否**（§5 機械 check）・no-self-accept(accepted_default は user origin accept_default 無しに出ない)。
13. order-insensitivity（selection 集合の pure 関数）。
14. gate-on-outcome（UnresolvedChoiceReport 内 placed は assemble 不可・assembly_input_candidate のみ payload）。
15. **【ADV-fix HIGH-1/3】overlap/CAP false-negative block**（同日 overlap pin / CAP 超過 → `missingForHandoff` に `overlapping_interval`(AssemblyGap)/`split_day_required`(SolverInputGap)・壊れた candidate でない）。
16. **【ADV-fix MED composite】3-cluster で 1 pairwise(ordering_pair) 選択→残りは smaller open ordering_choice**（member を silent に並べない）。
17. **【ADV-fix MED routing】authoritative pass の private explicit_time_bound_missing が shared-feasible→ selection_rejected・どの出力にも constraintId 無**。
18. **【ADV-fix LOW】resolutionTrace は private-forced と shared-forced を区別しない**（両 "forced"）。
19. 境界 lock（assembleScheduledDraft 非呼出・itinerary/candidate/booking/authority/external/M2/app-UI 非・scheduled-draft-assembler 非 import）。
20. 既存 test green・tsc baseline 不変（additive proposed 型のみ）。

---

## §14 実装スライス（全 HOLD・各別 GO）
- **S4-A** docs（本書）。*narrow*
- **S4-B** finalization 型（ChoiceSelection/S4ResolutionInput/HandoffBasis/HandoffProvenanceEntry/UnresolvedChoiceReport/SelectionRejection/AssemblyInputCandidate/S4ResolutionResult/**S4HandoffGap**・新 `solver-finalization-types.ts`・types only unwired）。*narrow*
- **S4-C** forced interval/order classifier（buildClosedStn+computeSequencingFeasibility 再利用・各 axis FORCED/CHOICE・forced のみ PlacedNode）。
- **S4-D** **time_window_choice materializer**（`deriveTimeWindowChoicePoints`・shared region slack≥15→choice・provisionalDefault 既定 UNSET）+ provisional default policy helper（§5/§6・suggestion only・適用しない）。*narrow*
- **S4-E** handoff eligibility + selection 再伝播（ledger→augmented→再閉路→residual→gate §9 全 AssemblyGapKind mirror→AssemblyInputCandidate or UnresolvedChoiceReport・**assembleScheduledDraft 非呼出**）。
- **S4-F** privacy 投影 + 再検証 guard（shared 再計算 surface・authoritative includePrivate:true 再検証・private 違反→neutral selection_infeasible・cascade は shared からのみ・authoritative-pass gap を top-level に漏らさない）。*security-critical narrow*
- **S4-G** golden tests（§13）。
- **実 `assembleScheduledDraft` 呼出の前で STOP**（A-stage は別後段）。
**gating**: S4-E/S4-F が要・S4-B/C/D/G は narrow。

## §15 Stop
docs-only。S4 は HOLD。全 proposed。CEO 承認まで S4-B…G を実装しない。

---

## §16 Adversarial verification summary（適用済 15 補正）
workflow `wz4dc55aj` の 3 lens。
| # | sev | 検出 | 補正 |
|---|---|---|---|
| H1/H3 | field/premise | `missingForHandoff:SolverInputGap[]` が AssemblyGapKind-only 値(overlap/interval/lock 等)を運べず gate fail-open | **`S4HandoffGap = AssemblyGap｜SolverInputGap`**・gate は AssemblyGapKind 全 mirror・2 enum 重複は 3 値のみ明記 |
| H2 | premise | `time_window_choice`/`day_assignment_choice` が **producer 無の phantom**→slack interval が handoff 不能 or S4 が silent mint | **`deriveTimeWindowChoicePoints` で機械 materialize**(shared slack≥15)・block handoff・day は forced/explicit binding のみ(mode:"day" は reserved) |
| M | premise | anchor_first/soft_preference_count に shared data source 無→hidden objective 化リスク | **NOT YET GROUNDED**・signal 合成禁止・名指し test |
| M | premise | accept_default の不変条件が prose のみ・台帳 writer 境界が un-owned | **機械 check**(selected≠provisionalDefault の accept_default を拒否)+台帳 append 境界の責務明記 |
| M | premise | authoritative-pass の needs_input を top-level に出すと private ref 漏洩 | top-level は **shared pass gap のみ**・authoritative-only は neutral selection_rejected に collapse |
| M | premise | composite(size≥3) で mode:"ordering" option:string が ill-typed(member は nodeId) | **mode:"ordering_pair"{from,to}**・1 precedence edge→smaller residual・auto-complete しない |
| L | boundary | resolutionTrace 値 enum 未固定→private 区別 token 混入リスク | **exhaustively {"forced"｜"explicit_selection"}**・private-forced→"forced" |
| L | boundary | S3 が全 ordering に namedTieBreak=lexicographic を立てるため default が常時付き status-quo bias | **lexicographic-only の ordering は provisionalDefault UNSET**(内部 disambiguator・surface しない) |
| L | premise | endMin 導出が under-spec(default dwell リスク) | **endMin:=startMin+nodeDurations[nodeId]**・nodeDurations 必須(無→node_duration_missing)・endMin>startMin∧≤1439(違反→invalid_interval) |
| L | premise | 全 choice 明示解決要求が予約直前まで に対し too-strict | **batch-accept**=choice ごとに 1 明示 accept_default emit(global flag 禁止)・future/HOLD |
| L | premise | core 前提は健全(selection-ledger が正道) | spine 維持・H2/H1 を S4-B 前に解消 |

---

## §17 CEO 判断請求
1. S1+S2+S3 を**凍結点**として承認し、次フェーズを **S4 finalization/handoff 設計（本書）** として承認するか。
2. **★selection-ledger framing**（S4=default-deciding でなく selection-application+再伝播+handoff・**provisionalDefault は台帳外の SUGGESTION・自動適用しない**・accept_default のみ promotion）を正本として承認するか。
3. 出力契約（`ChoiceSelection`/`S4ResolutionInput`/`AssemblyInputCandidate`/`UnresolvedChoiceReport`/`SelectionRejection`/`S4HandoffGap`・既存 ScheduleChoicePoint/PlacedNode/AssemblyInput 再利用・**S4 は assembleScheduledDraft を呼ばない**）で良いか。
4. adversarial 15 補正（§16）を正本として受理するか（特に: time_window_choice を機械 materialize / missingForHandoff を S4HandoffGap / accept_default 機械 check / authoritative-pass gap 非漏洩 / composite は ordering_pair / lexicographic は suggestion 化しない）。
5. 実装順 = **S4-A→S4-B(型)→S4-C(classifier)→S4-D(materializer+default policy)→S4-E(handoff+再伝播)→S4-F(privacy+再検証)→S4-G(tests)・実 assemble 前 STOP** で良いか（各別途 GO・S4-E/F が要）。

**本書で停止**。S4 実装は CEO 承認まで着手しない。
