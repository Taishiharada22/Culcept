# T11-B Itinerary Composition / Solver Boundary Preflight（旅程合成・solver 境界・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: docs-only preflight・実装なし・solver は HOLD・stop after report。
**スコープ**: 本セッション = **Travel Mode 専属**（Stargazer/平日 Plan は upstream/HOLD としてのみ参照）。
**目的**: fitted entity + 制約を、**既存** `TravelItinerary`/`TravelCandidate` 構造へ compose する **pure・fail-closed な合成境界**を設計する。実 solver/scheduler/optimizer は HOLD。
**禁止（再掲）**: 実装・コード・solver/optimizer・外部/route/weather/place/Maps/OTA API・fetch/DB/Supabase/M2 runtime・booking/calendar/action authority・ranking/dominance 変更・本番 `/plan`・push。

**設計根拠の出所**: workflow `w6zfpyb65`（16 agents）= 4 grounding（実ソース read-only）→ 4 design chunk → 8 adversarial verify（field-accuracy + boundary-safety）。grounding は実ソース行から採取（§2）。adversarial verify が **7 件の補正**（1 HIGH / 4 MED / 2 LOW）を検出し、本文に全て反映済み（§16 に一覧）。

---

## §1 前提を疑う — T11-B が最初に作るべきは何か（比較・推奨）
ゴールからの逆算: 旅行は **compose された旅程**（`TravelItinerary.days` の `TravelNode`/`TravelEdge`）であって、高 fit な entity の袋ではない。現パイプラインは `evaluateFit → ProposalFitInput/ProposalFitSummary` で止まり、`TravelProposal` は場所未確定（`areaPlaceholder`・`timeWindow` null）。fitted `EntityRetrievalCandidate.entity`(`TravelObjectState`) を `TravelNode` に、`OrderingConstraint`/`RouteChainState` を `TravelEdge`/`TravelConstraint` に写す **合成境界が無い** ＝ これが真の gap。

| 案 | 前進するもの | 今これを最初にやらない理由 |
|---|---|---|
| **(a) 合成 / solver 境界 preflight** | fitted entity + 制約 → **既存** DAG 型への pure 境界。solver は HOLD | — **（推奨）** |
| (b) Bundle 2 fit dominance/ranking | `ProposalFitSummary.grade` を候補間で順位化 | fit は本フェーズ advisory のみ。**順位化は entity を旅程に compose しない**。並べる旅程構造が無いのに並べるのは順序逆。 |
| (c) Tier1 safe links / Maps URL | deep-link 表面化 | 外部/Maps/URL は scope 外。link を貼る node がまだ無い（合成前）。 |
| (d) Tier2 official/Maps extraction | entity evidence 拡充 | 外部 fetch（scope 外）。retrieval 層は既に存在し、合成境界を作らない。 |
| (e) UI preview polish | plan 描画 | 描画する `TravelItinerary` がまだ無い。不在構造の見た目磨きは依存逆転。 |

**推奨 = (a) 合成 preflight**。監査済み gap（entity → DAG）を invariant 違反なく閉じる唯一の Travel-only step: **既存 DAG 型のみ触る**・fit は advisory 維持（`grade` 再順位なし）・solver/scheduler は HOLD・pure/fail-closed。(b) は compose 済み構造を前提とし、(c)/(d)/(e) は下流 or scope 外。**ただし (a) は境界で止まる**（型 + entity→node mapper + constraint collector + preflight check のみ）。`startMin`/`endMin` を置き scheduling/optimization する実 solver は HOLD で、合成は**捏造でなく fail-closed**（"needs solver"/"impossible lock" を発する）。

---

## §2 既存型の grounding（実ソース行・何が在り何が無いか）
**存在する（cite-verified・実行から採取）**:
- 旅程 DAG 語彙（`lib/shared/travel/core-types.ts`）: `TravelNode`(nodeId/startMin/endMin/place/activityKind/budgetBand/fatigueLoad/nodeConfidence)・`TravelEdge`(fromNodeId/toNodeId/transport/durationMin/cost)・`TravelDay`(dayIndex/date/nodes/edges)・`TravelItinerary`(days)・`TravelCandidate`(itinerary/tradeoff/constraints/rationale/uncertainty/reversal?)・`TravelCorePlan`(participants/scope/candidates/pace?)・`TravelConstraint`(constraintId/axis/severity/owner/visibility/descriptor)・`PlaceRef`(placeRefId/externalId?/label?)・`ViewerScopedRationale`(shared/forParticipant)。
- enum（verbatim・本文はこの値のみ引用）:
  - `ActivityKind` (core-types.ts:62-74) = `depart | arrive | meal | sightseeing | lodging_checkin | lodging_checkout | onsen | rest | activity | other`
  - `FatigueLoad` (core-types.ts:80-81) = **`1 | 2 | 3 | 4 | 5`（数値リテラル・文字列でない）**
  - `NodeConfidence` (core-types.ts:54-55) = `anchor | wander`
  - `TransportMode` (core-types.ts:58-59) = `walk | train | bus | car | domestic_flight | other`
  - `Visibility` (core-types.ts:84) = `shared | private`
  - `ConstraintSeverity` (core-types.ts:38-39) = `red_line | hard | soft | preference`
  - `TravelCategory` (fit-types.ts:135) = `lodging | place | food | transport | area | activity | support`
  - `OrderingKind` (fit-types.ts:388-402) = `must_precede | luggage_drop_enables | reorderable | derive_shortest_from_terminal | timed_entry_lock | last_departure_lock | open_hours_window_lock | checkin_window_lock | checkout_window_lock | meal_time_lock | reservation_window_lock`
  - `ReliefAxis` (fit-types.ts:543-544) = `luggage | physiological | supply | cash | connectivity | rest | information | medical`
  - `Observed<T>` (fit-types.ts:43-45) = `{ value:T; confidence; provenance:FitProvenance; visibility? } | { value:null; confidence:0; reason:"unobserved" }`
  - `TriState` (fit-types.ts:48) = `yes | no | unknown`
  - `ContingencyTrigger` (contingency-types.ts:22-32) = `delay | rain_or_weather | fatigue | closure | budget_shock | participant_unavailable | time_window_shrink | high_uncertainty`
  - `FallbackAction` (contingency-types.ts:34-35) = `keep_plan | ask_question | downgrade_to_easy | switch_proposal | defer | cancel`
  - `ReadinessState` (readiness-types.ts:22-23) = `ready_to_propose | needs_question | needs_confirmation | not_ready | blocked`
- entity/fit: `EntityRetrievalCandidate`(placeRefId/entity:TravelObjectState/timeLocks:EntityTimeLock[]/missingQuestions/confidence/freshness)・`EntityTimeLock`(ordering:OrderingConstraint/rawTime/ref)・`TravelObjectState`(placeRefId/category/priceBand:Observed&lt;BudgetBand&gt;/burden/recovery/hardProfile/rich)・`EntityHardProfile.accessibility`(`{stepFree?:TriState; wheelchair?:TriState; noSteepSlope?:TriState}`・fit-types.ts:441)・`SupportRich`(reliefAxis/necessity:`optional|recommended|required|trip_critical`/orderingAnchor:boolean)・`OnsenState`(facet)・`OrderingConstraint`(kind/subjectRef/objectRef/relaxable)・`RouteChainState`(connection:ConnectionState/ordering)・`ConnectionState`(fromRef/toRef/legs:AccessLeg[]/terminals/reliability/dropAffordance/baggageState)・`ArrivalFreshnessState`(residualEnergy/cumulativeRouteFatigue)・`FitHardBlock`(reason ∈ `red_line_violation|intended_role_unsupported|budget_over_hard_ceiling|hard_constraint_violation|support_unavailable|season_or_weather_unavailable|safety_escalation`・visibility/ownerParticipantId)・`FitResult`(authoritative:false/fitLabel/hardBlocks/mismatchReasons/confidence/components/perParticipantFit)・`ProposalFitInput`(candidateId/fit)・`ProposalFitSummary`(grade/labelCap/labelStability/confidenceBand/mismatchCount/riskCodes/missingFields)・`ProposalFitComposition`+`FitJoinDiagnostics`(unknownIds/duplicateIds)・`ContingencyBranch`/`ContingencyPlan`(authoritative)・`TravelProposal`(candidateId/angle/timeWindow/areaPlaceholder/budgetBand/paceFit/mobilityFit/missingInputs/uncertainty/rationale)・`ProposalSetOutput`(proposals/rejected:RejectedAngle[]/missingQuestions/inputError)・`DecisionBlocker`(input_error|no_viable_proposals|required_inputs_missing|all_high_uncertainty|tie_no_dominance)。

**存在しない / 訂正（honest）**:
- `routeChainBurden` は**型でない** — `fit-core.ts:205` の `RouteDerivedIndicators` 内フィールド（`{doorToDoorTotalNorm: RouteDerivedObservation}`・provenance `derived_from_connection_state`・**derived であって live route でない**）。
- `fit-constructs-types.ts` は**存在しない**（型は `fit-types.ts` から）。
- `ActivityKind` に **`support` 値は無い**（support entity は `other` に写す or 専用 kind を B1 で提案）。
- `FitHardBlock` に **`accessibility_unknown` reason は無い**（既存 7 reason で最も近いのは `safety_escalation`/`hard_constraint_violation`）。
- `TravelNode.startMin/endMin` は**非 optional `number`**（"未解決" を表現できない）→ §5 で proposed `PreSolverNode` を導入し時刻を持たせない。
- `TravelEdge.durationMin` は**非 optional `number`** → 同様に proposed `PreSolverEdge` で omit。
- `TravelEdge` に **burden field は無い** → door-to-door burden は node 側 `fatigueLoad` 繰越 or proposed `PreSolverEdge.burden`。

---

## §3 現在の gap
- **合成層が無い**: fitted entity(`EntityRetrievalCandidate[]`) + 制約(`OrderingConstraint[]`/`EntityTimeLock[]`) + 骨格(`TravelProposal`) → `TravelNode`/`TravelEdge`/`TravelDay` を産む pure mapper が不在。`TravelProposal.areaPlaceholder` → `TravelNode.place:PlaceRef` の写像も無い。
- **solver 境界が無い**: `OrderingKind`（must_precede / luggage_drop_enables / *_lock）と `EntityTimeLock.rawTime` は scheduling intent を述べるが、それを `startMin`/`endMin`/`dayIndex` の順序に変える consumer が居ない（retrieval は schedule しない＝消費側不在）。
- **fail-closed 合成規則が無い**: `FitHardBlock` を持つ entity が node 化されない保証も、impossible lock が node でなく合成失敗を返す保証も無い。
- **privacy-scoped node 適格が無い**: private fit signal（`FitHardBlock.visibility="private"` 等）が node 適格を server-side で変えつつ shared に漏れない経路が未定義。

**HOLD**: 実 solver/optimizer/scheduler は HOLD。本フェーズは**合成境界**（pure I/O 契約・fail-closed）のみを設計。

---

## §4 Input 契約（CompositionInput・proposed）
pure・決定論・server-side。**live route/weather/place/Maps/OTA は入らない。fetch/DB なし。**
```ts
// proposed (未実装・B1 target)
interface CompositionInput {
  proposal: TravelProposal;            // 既存: candidateId/angle/timeWindow/areaPlaceholder/budgetBand/…
  scope: TravelPlanScope;              // 既存: mode + window(single_day | range{nights:1|2})
  pace?: Pace;                          // 既存: 助言用 pacing

  entities: EntityRetrievalCandidate[]; // 既存: placeRefId/entity/timeLocks/confidence/freshness。配列順は rank でない
  entityBindings: CompositionEntityBinding[]; // proposed: caller 供給 placeRefId→intendedActivityKind（join は caller 責務）

  fitInputs: ProposalFitInput[];       // 既存: candidateId + fit:FitResult。★server-side のみ。
                                       //   用途=(a) hardBlocks による node 適格 gate (b) advisory label。ranking/dominance を変えない
  orderingConstraints: OrderingConstraint[]; // 既存: kind/subjectRef/objectRef/relaxable
  timeLocks: EntityTimeLock[];         // 既存: ordering + rawTime + ref

  supportEntities: EntityRetrievalCandidate[]; // proposed slot/既存要素型: category="support"(SupportRich)
  fallbackEntities?: EntityRetrievalCandidate[]; // proposed: wander 代替

  fitContext?: FitContext;             // 既存: season/weatherSeverity 等は caller 供給 scalar・live lookup でない
  readinessSummary?: ReadinessState;   // 既存: 情報 gate hint。合成は実行/予約しない
  contingencySummary?: { triggers: ContingencyTrigger[] }; // proposed wrapper/既存要素。private branch は渡さない

  // 【ADV-fix MED-2】route 系は ordering のみ消費・ConnectionState payload は構造的に捨てる
  routeOrderingPlaceholders?: OrderingConstraint[]; // proposed: route-chain の ordering サブセットのみ
}
interface CompositionEntityBinding { // proposed
  placeRefId: string;                  // EntityRetrievalCandidate.placeRefId と一致必須
  intendedActivityKind: ActivityKind;  // 既存 union
  nodeConfidenceHint?: NodeConfidence; // 既存 union: anchor | wander
}
```
**Input invariant**:
- **外部データ非流入**。`FitContext.weatherSeverity` 等は caller scalar/placeholder で fetch しない。`PlaceRef.externalId` を解決しない。
- 【ADV-fix MED-2】`RouteChainState` を直接受けない。受ける場合でも **`ConnectionState.legs/.reliability/leg durationMin` は IGNORE され消費されない**（route 由来 payload は trust でなく構造的に drop）。合成が読むのは `RouteChainState.ordering`（= `OrderingConstraint`）のみ。
- **caller join・fail-closed**: `entityBindings[].placeRefId` / `fitInputs[].candidateId` は caller 責務（`ProposalFitInput` と同規律）。重複/未知 id は surface（`FitJoinDiagnostics.duplicateIds`/`.unknownIds` に倣う）し**棄却**（黙ってマージしない）。
- **fit advisory のみ**: node 適格(hard-block gate) + 助言 label のみ。順位/選別をしない。
- **source は confidence のみに効く**（raw `priceBand`/trait 値を変えない）。

---

## §5 Output 契約（CompositionDraft・proposed）
pure・決定論。**DRAFT であって最終最適旅程でない**。booking/calendar/action authority なし。raw `FitResult` なし。ranking/dominance なし。

**【ADV-fix MED-3 / LOW-7】solver 所有フィールドを型で締め出す**: `TravelNode.startMin/endMin`・`TravelEdge.durationMin`・`TravelDay.dayIndex` は **solver 所有**。preflight はこれらを omit した proposed `PreSolverNode`/`PreSolverEdge` を**フラットに**産み（day 分割しない）、既存 `TravelNode/TravelEdge/TravelDay/TravelItinerary` は **solver 出力に予約**する。これで「未placed」を prose でなく**型**で表現し、合成が時刻/順序/日割を決めないことを構造的に保証する。
```ts
// proposed (未実装・B1 target)
interface PreSolverNode {              // = TravelNode から solver 所有を除いた前段
  nodeId: string;                      // 決定論 id（例 node:${placeRefId}:${activityKind}）
  place: PlaceRef;                     // placeRefId = entity.placeRefId（外部 lookup なし）
  activityKind: ActivityKind;          // §6 の category 表
  budgetBand: BudgetBand;              // priceBand.value!==null の時のみ。null は wide/low-conf or 質問
  fatigueLoad: FatigueLoad;            // 【ADV-fix MED-4】数値 1|2|3|4|5（文字列でない）
  nodeConfidence: NodeConfidence;      // anchor | wander（fit/observation confidence 由来・派生値のみ）
  // ★ startMin/endMin/dayIndex は持たない＝solver が割る（未placed を型で表現）
}
interface PreSolverEdge {              // = TravelEdge から solver 所有を除いた前段
  fromNodeId: string; toNodeId: string;
  transport: TransportMode;            // legs 由来 or "other"(low conf)
  // ★ durationMin は持たない（route API なし）。cost も供給 fare 証拠がある時のみ
  cost?: BudgetBand;
  burden?: RouteBurdenMeta;            // proposed: derived（door-to-door 繰越）・observed でない
  precedenceKind: "must_precede" | "luggage_drop_enables" | "lock_implied"; // 【ADV-fix HIGH-1】方向を持つ kind のみ
}

interface CompositionDraft {           // proposed
  authoritative: false;                // 既存規律(FitResult/ContingencyPlan/ReadinessResult)に倣う
  draft: true;                         // pre-solver DRAFT 標識（解決済 TravelItinerary でない）
  candidateId: string;                 // TravelProposal.candidateId をecho

  candidateNodes: PreSolverNode[];     // ★フラット集合・day 分割しない（dayIndex 未割当=solver HOLD）
  candidateEdges: PreSolverEdge[];     // 【ADV-fix HIGH-1】方向を持つ ordering からのみ。reorderable は edge にしない
  reorderableHints: ReorderableHint[]; // 【ADV-fix HIGH-1】proposed: reorderable pair は無向 hint（順序を選ばない）

  constraints: TravelConstraint[];     // 既存。ordering+timeLocks+budgetRedLine から正規化。private は shared 投影前に mask
  unsatisfiedConstraints: UnsatisfiedConstraint[]; // proposed: 置けない制約（impossible lock 等）。private は shared で strip
  missingCompositionQuestions: CompositionMissingQuestion[]; // proposed: field のみ・private reason 非搭載
  hardBlockers: CompositionHardBlocker[]; // proposed: fail-closed。severe FitHardBlock で node 化しなかった entity
}
interface UnsatisfiedConstraint {      // proposed
  constraintId: string;
  reason: "impossible_time_lock" | "ordering_cycle" | "budget_red_line_exceeded" | "no_feasible_placement";
  visibility: Visibility; ownerParticipantId: string | null;
}
interface CompositionMissingQuestion { field: string; reason: "entity_unbound" | "lock_unplaceable" | "low_confidence" | "area_unresolved" | "route_duration_missing"; } // proposed: reason は shared-safe code のみ
interface CompositionHardBlocker { placeRefId: string; reasonCode: string; visibility: Visibility; ownerParticipantId: string | null; } // proposed: reasonCode は FitHardBlock.reason 由来の bounded code・raw FitResult なし
```
**Output invariant**:
- **最終でない**: `draft:true` + `authoritative:false`。`PreSolverNode` は時刻を持たず、`dayIndex` 未割当。**>1 の populated `TravelDay` を出すには solver authority が要り、それは HOLD**。
- **authority なし**: `TravelCandidate` を emit しない・booking/calendar/`ReadinessResult` action なし。構造を計算するのみ・実行しない。
- **raw `FitResult` 非漏洩**: advisory fit は `fitInputs` で server-side のみ。出力は bounded code（`CompositionHardBlocker.reasonCode`/`unsatisfiedConstraints[].reason`）のみ。`FitResult.components/.mismatchReasons/.perParticipantFit/.confidence` を出さない（`ProposalFitSummary` 規律）。
- **ranking/dominance なし**: `candidateId` ごとに 1 draft。順位/score/選別しない。配列順は構造であって rank でない。
- 【ADV-fix HIGH-1】**reorderable に順序を付けない**: `candidateEdges` は方向内在 kind（`must_precede` / `luggage_drop_enables` / precedence を含意する `*_lock`）からのみ導出。`reorderable` pair は `reorderableHints`（無向）に置き、**合成は順序を選ばない**（順序選択は solver HOLD）。
- 【ADV-fix LOW-6】**`ordering_cycle` は検出のみ**: must_precede/lock グラフの cycle を fail-closed の unsatisfiable signal として **report-and-stop** してよいが、**resolve/relax/reorder で cycle を壊さない**（解消は solver HOLD）。
- **fail-closed**: hard-blocked entity は node 化不可→`CompositionHardBlocker`。impossible lock→`unsatisfiedConstraints(reason="impossible_time_lock")` + draft 失敗/代替必要 signal（黙った不正 node を作らない）。
- **privacy 二層**: `visibility="private"` の constraint/unsatisfied/hardBlocker は server-side で node 集合を形作ってよいが、shared/client 投影では mask。private fit reason は `missingCompositionQuestions` に出さない（逆推論漏れ防止）。

---

## §6 Node mapping — entity → `PreSolverNode`
occupying-category entity を node に写す pure・fail-closed 投影。`startMin`/`endMin`/`dayIndex` は持たせない（solver HOLD）。fit は advisory のみ（`fitLabel` で reorder/drop しない・`nodeConfidence` と server-side 適格のみ modulate）。

**category(`TravelCategory`) → `activityKind`(`ActivityKind`)**:
| entity（category/facet） | `activityKind` 値 | 備考 |
|---|---|---|
| `lodging` | `lodging_checkin` / `lodging_checkout`、滞在中休息は `rest` | 1 lodging が ≥1 node（check-in/out/rest）。split 最終化は solver・preflight は別 node shape として carry |
| `food` | `meal` | |
| `place` | `sightseeing`（既定）/ `activity` | 受動景観→sightseeing、能動→activity。既定 heuristic は **proposed(B1)** |
| `activity` | `activity` | |
| `area` | **node 化しない** → context/anchor（onsen facet/時間占有時のみ node） |
| `support` | `rest`（時間占有）/ `other`（摩擦低減） | `ActivityKind.support` は**無い**。occupy しない support は ordering/edge anchor（§8） |
| `transport` | **node 化しない** → edge placeholder（§7） |

**Onsen facet**(`OnsenState`・host-agnostic facet・category でない): `activityKind:"onsen"`。同 `placeRefId` の lodging に属せば lodging-facet node（同 place・`onsen`）、独立 place/area onsen なら独立 `onsen` node。facet vs standalone は **proposed(B1)**。

**Support object**(`SupportRich`): `necessity`(`optional|recommended|required|trip_critical`) と `orderingAnchor:boolean` で扱い決定。`orderingAnchor===true`→ordering anchor(§8)で node 化必須でない。`reliefAxis==="rest"`→`rest` node。`reliefAxis==="luggage"`→ edge/ordering enabler（§7/§8）。

**Area entity**: context/anchor（候補 `areaPlaceholder` を seed）。co-location を scope するが `TravelDay.nodes` に入らない（onsen facet/時間占有時を除く）。

**Hard-blocked entity → node 化しない（fail-closed）**: server-side `FitResult.hardBlocks` が非空かつ severe なら node 化不可・omit。`FitHardBlock.reason`（7 値）が gate だが**理由テキストは shared に漏れない**。`FitHardBlock.visibility="private"` は server-side で node を消すが原因を shared `TravelDay`/質問に出さない。

**state → `PreSolverNode` field（grounded 名 exact）**:
- `nodeId`: proposed 決定論 id（`node:${placeRefId}:${activityKind}`）。`TravelNode` に provenance field 無→source は `place.placeRefId` のみで保持。
- `place`(`PlaceRef`): `place.placeRefId = entity.placeRefId`。`externalId`/`label` は PII-free 表示のみ。外部 lookup なし。
- `activityKind`: 上表。
- `budgetBand`(`BudgetBand`): `TravelObjectState.priceBand`(`Observed<BudgetBand>`)。`priceBand.value!==null` の時のみ写し、`confidence`/`provenance` は `budgetBand.confidence` に効く。unobserved(`{value:null}`)→ wide/low-conf or `missingCompositionQuestion`（点推定を捏造しない）。**source は confidence のみ**。
- `fatigueLoad`(`FatigueLoad`・**数値 `1 | 2 | 3 | 4 | 5`**【ADV-fix MED-4】): `TravelObjectState.burden`(`Partial<Record<EntityBurdenAxis,Observed<number>>>`)+`recovery`(`{restValue?,energyRequired?}`) から導出。連続 burden→5段 量子化は **proposed(B1)** で結果は**数値**（例 `3`、`"3"` でない）。unobserved→保守 mid 段 + low `nodeConfidence`。
- `nodeConfidence`(`NodeConfidence`・`anchor|wander`): fit/observation confidence 由来の**派生値のみ** shared に出る。firm 観測 + 安定 fit + firm lock→`anchor`、soft/substitutable/`relaxable===true`→`wander`。raw `confidence`/`FitResult` を出さない。
- **`startMin`/`endMin`/`dayIndex`: 持たない**【ADV-fix LOW-7/MED-3】。`TravelNode.startMin/endMin` は非 optional number で「未解決」を表現できないため、preflight は **proposed `PreSolverNode`**（時刻なし）で carry し、solver が `TravelNode` 化して時刻/日割を**上書き必須**。`NodeConfidence.wander` + `TravelCandidate.uncertainty` が「未placed」の正直な carrier。preflight は ordering/route 計算から `startMin`/`endMin` を導出しない（§14 source-contract test で保証）。

---

## §7 Edge / transition mapping — `RouteChainState` → `PreSolverEdge` placeholder
**transport entity / route-chain は edge であって node でない**。preflight は **live route/timetable/duration を主張しない**（明示供給された証拠を除く）。
- `fromNodeId`/`toNodeId`: `RouteChainState.connection.fromRef`/`toRef`（`ConnectionState.fromRef`/`toRef`）に一致する node draft から解決。端点に node が無い（hard-blocked/area anchor）→ edge を fail-closed で drop。
- `transport`(`TransportMode`): `ConnectionState.legs`(`AccessLeg[]`) の主 leg mode。legs 不在→`"other"`(low conf)。mode を当て推量しない。
- **`durationMin`: 持たない**。`PreSolverEdge` は duration を omit（route API なし）。供給された明示 duration があれば solver が `TravelEdge.durationMin` を埋める。無ければ `missingCompositionQuestion(reason="route_duration_missing")`（数値捏造しない）。
- `cost`(`BudgetBand`・optional): 明示 fare 証拠がある時のみ range で。無ければ wide/low-conf or 質問。**source は confidence のみ**。
- **`routeChainBurden`（=型でなく `RouteDerivedIndicators` 内 derived field・`fit-core.ts`）**→ `TravelEdge` に burden field が無いため、(a) 下流 node の `fatigueLoad` 繰越（`ArrivalFreshnessState.residualEnergy`/`cumulativeRouteFatigue` で modulate）or (b) proposed `PreSolverEdge.burden`。いずれも **derived 標識**（observed でない）。
- **first/last mile**: `ConnectionState.legs`/`terminals`(`TerminalBurdenSpec[]`)/airport/station burden は **leg data が実在する時のみ** burden meta に写す。不在→low conf + 質問（mile を推論しない）。`RoutePurposeModifier` は説明用のみで route 主張に読まない。
- **invariant**: 全 edge 値は「明示供給」か「low-conf/missing」。欠落 route→`missingCompositionQuestion` or low conf・**捏造しない**。fetch/Maps/OTA/timetable なし。

---

## §8 Ordering / time locks — `OrderingConstraint` → 制約（schedule を解かない）
`EntityTimeLock.ordering`(`OrderingConstraint`) + `rawTime`(未parse窓文字列) を**制約として carry**・`startMin`/`endMin` を解かない。`relaxable`(`false`=hard/`true`=soft) は `nodeConfidence`（true→wander寄り）に効く。各 `OrderingKind`:
- **`must_precede`** → 方向内在 precedence（subject→object）。【ADV-fix HIGH-1】方向を持つので `PreSolverEdge`(precedenceKind=`must_precede`) に写してよい。時刻は solver。
- **`reorderable`** → 【ADV-fix HIGH-1】**precedence でない・無向**。`reorderableHints` に置き `nodeConfidence`→wander 寄り。**directed edge にしない**（順序選択は solver）。
- **`luggage_drop_enables`** → 条件 enable precedence（drop 後に object が軽くなる）。`PreSolverEdge`(precedenceKind=`luggage_drop_enables`) + 下流 `fatigueLoad`/baggage 低下注記。`ConnectionState.dropAffordance`/`baggageState` と対。時刻なし。
- **`derive_shortest_from_terminal`** → **solver への指示**（preflight でない）。未解決 hint として verbatim carry・route/距離計算しない。
- **`timed_entry_lock`** → object node の固定入場窓（`rawTime` 未parse）。窓制約として carry・`relaxable:false`→`anchor`。
- **`last_departure_lock`** → 最遅出発窓（`depart` node/edge）。上限制約として carry。
- **`open_hours_window_lock`** → 開館窓（place/food/activity）。許容窓のみ carry。
- **`checkin_window_lock`/`checkout_window_lock`** → lodging check-in/out node の窓。
- **`meal_time_lock`** → `meal` node の窓（予約/着席）。
- **`reservation_window_lock`** → 予約窓（`SupportRich.reservationDifficulty`/`ReversalCost.deadline` と関連）。**予約 authority は scope 外**。

**impossible lock → 合成失敗/代替必要（fail-closed）**: 2 つの非 `relaxable` 窓/precedence が**構造的に**矛盾（scheduling なしで検出可・例 同日に `checkin_window_lock` が `last_departure_lock` より後）なら、黙って node を作らず合成失敗を mark し代替必要を signal（proposed `CompositionFailure`/`missingCompositionQuestion`、or 候補境界で `UncertaintyLevel.high`→既存 `ProposalSetOutput.rejected`/`DecisionBlocker`）。**矛盾を検出するのみ・schedule で"直さない"**。
**lock の privacy**: private 由来 lock は server-side で適格/窓を変えてよいが descriptor/reason を shared に出さない。
**severity bridge（既存）**: candidate 級 `TravelConstraint` 化時、`severity`(`red_line|hard|soft|preference`) は `relaxable`(false→hard/red_line・true→soft/preference)・`axis=time`。preflight は populate のみで時間順に並べない。

---

## §9 Fallback / rest / support
合成は **fallback branch** をグラフ package の一部として用意（既存 pure contingency 層を再利用）・再スケジュール/実行しない。carrier=`ContingencyBranch`、action 語彙=`FALLBACK_ACTIONS`（**cite-exact**: `keep_plan | ask_question | downgrade_to_easy | switch_proposal | defer | cancel`、他文字列禁止）。
- **rain fallback** — `trigger=rain_or_weather`。action ∈ {`switch_proposal`,`downgrade_to_easy`,`keep_plan`}・`switchToProposalId` で屋内代替。`ContingencyScenario.severity>=triggerThreshold` で発火。severity は `FitContext.weatherSeverity`(0..1) と同尺だが**明示 `ContingencyScenario` を消費・live weather lookup でない**。
- **fatigue fallback** — `trigger=fatigue`。`downgrade_to_easy`（重 node を落とし rest 重み増）/`defer`（後日 `TravelDay` へ）/`keep_plan`。source は `FitContext.todayFatigueSpike`(0..1)。
- **defer/cancel/downgrade_to_easy** — branch 形のみで命令でない。`cancel` は `TravelCandidate.reversal`(`cancellable`/`deadline`/`fee`) と併読すべきだが、合成は branch を**記録するのみ**で deadline に action しない。

**rest node** — `activityKind=rest`（温泉回復なら `onsen`）の通常 node。`fatigueLoad` は低（**`1`/`2`**【ADV-fix MED-4 数値】）・`nodeConfidence` は通常 `wander`。rest の**必要を導出**（エネルギーを捏造しない）:
- recovery: `TravelObjectState.recovery.restValue`/`energyRequired`(共 `Observed<number>`) + `FitUserState.recoveryStyle`(`rest_to_recover|stimulation_to_recover|mixed`)。
- arrival fatigue 繰越: `ArrivalFreshnessState.residualEnergy`/`cumulativeRouteFatigue`（低残量→次 heavy 前に rest を挿入/維持）。`ArrivalFreshnessState` は arrivalFreshness construct builder の入力であって node でない（合成は rest 配置の判断に読む）。

**luggage drop support** — ordering 関係としてモデル化（自由命令でない）。`OrderingKind.luggage_drop_enables`（subject=drop 点・object=軽くなる node）。drop affordance は `ConnectionState.dropAffordance`(locker/hotel/delivery)/`baggageState`。drop を可能にする check-in は `checkin_window_lock` で anchor。

**locker/restroom/pharmacy/convenience support** — `category="support"` + `SupportRich`: `reliefAxis` ∈ `ReliefAxis`（locker=`luggage`/restroom=`physiological`/pharmacy=`medical`/convenience=`supply`/`cash`/`connectivity`）。`necessity` が attach 強度を段階化、`orderingAnchor=true` は ordering を pin。`necessity="trip_critical"` で unavailable→`FitHardBlock(reason="support_unavailable")`（§10）。

**authority 規則（binding）**: fallback branch は**合成 branch であって命令でない**・action authority にならない。既存二層で担保: `ContingencyPlan.authoritative` のみが実行 authority source で、shared/display 投影は `false`。`keep_plan` 風 branch でも private mask 後も何も authorize できない。readiness authority は `ReadinessResult.authoritative`/`ReadinessState` で別途。合成は branch の `readinessImpact` を**記録するのみ**で付与しない。

---

## §10 Hard blocker propagation
gate=`FitHardBlock`（cite-exact）: `reason` ∈ {`red_line_violation`,`intended_role_unsupported`,`budget_over_hard_ceiling`,`hard_constraint_violation`,`support_unavailable`,`season_or_weather_unavailable`,`safety_escalation`} + `visibility`(`shared|private`) + `ownerParticipantId`(`string|null`)。hard block は `FitResult.hardBlocks`（server-side のみ・`FitResult` 自体は shared に出ない）。

**規則（fail-closed）: hard-blocked entity は `TravelNode` 化不可**:
- **red_line** → `reason="red_line_violation"`（`ConstraintSeverity.red_line` に対応）。無条件除外。
- **allergy/diet unsafe** → `reason="hard_constraint_violation"`（`FitUserState.hardConstraints` 由来）。node 不適格。
- **accessibility-unknown-where-safety-relevant**【ADV-fix MED-5・型訂正】→ accessibility は **`Observed<>` でない**。正本は `TravelObjectState.hardProfile.accessibility.{stepFree,wheelchair,noSteepSlope}: TriState`（`yes|no|unknown`・fit-types.ts:441）で、入力 `EntityFact(kind=accessibilityStepFree).value` も `TriState`。**fail-closed trigger = 安全関連軸が `TriState==="unknown"`（or 欠落）**。`accessibility_unknown` reason は**無い**ので `safety_escalation`（or `hard_constraint_violation`）に写す（細粒度 reason は proposed B1）。※「安全関連の genuinely `Observed<>` field が unobserved（例 burden/recovery）なら block」という規則は**別文**として保持し、accessibility(TriState) と混同しない。
- **safety_escalation** → `reason="safety_escalation"`。hard 除外。
- **impossible time lock** → 非 `relaxable` lock（`OrderingKind` の窓族）に対し node 配置不能→fail-closed（node を置けない）。

**blocked-branch 帰結（fail-closed）**: *合成失敗*（node 集合を形成不能・例 `trip_critical` anchor block／非 relaxable lock 矛盾）= `DecisionBlocker` 族の合成版（proposed `CompositionFailure{reason; needsAlternative}`）/ *代替必要*（block が 1 entity 局所）= §9 fallback（`switch_proposal`/`downgrade_to_easy` + `switchToProposalId`）。private block は server-side で効くが reason は shared で mask（§13）。hard block は advisory grade の**前**に gate（"score around" させない）。

---

## §11 Solver 境界
preflight の仕事は**グラフ + 制約の準備**で終わり、解かない。準備物: `PreSolverNode[]`（時刻なし）・`PreSolverEdge[]`（duration なし・方向 kind のみ）・`reorderableHints[]`・`TravelConstraint[]`/`OrderingConstraint[]`・fallback `ContingencyBranch[]`。**`TravelNode/TravelEdge/TravelDay/TravelItinerary` の生成（時刻/日割/順序つき）は solver 出力**。

**solver は HOLD**:
- **最適化アルゴリズムなし** — final `startMin`/`endMin` 選択・node 順序・候補選別をしない。solver が後で `OrderingConstraint`/`TravelConstraint` に対し order/schedule/select する（今は scope 外）。
- **route 探索なし** — duration/transport/legs は carrier のみ・pathfinding/Maps/OTA/route API なし。
- **live data なし** — weather/place/crowd lookup なし。`weatherSeverity`/`expectedCrowdLevel`/`ContingencyScenario.severity` は明示 pure 入力。
- **booking/calendar なし** — 予約/hold/calendar write なし。`ReversalCost.deadline`/lock 族は記録のみ。
- **"final" 主張なし** — 合成物は preflight package で final/scheduled と断じない。`uncertainty`/`wander` が未placed を正直に保つ。
- 【ADV-fix LOW-7】**startMin/endMin/dayIndex は solver が上書き必須**。preflight はこれらを ordering/route 計算から導出しない（§14 source-contract test で grep 保証）。
- gating: 合成 + 将来 solver 配線は server-side flag（`PLAN_FLAGS` as-const + `process.env.X==="true"`・default OFF）の後ろ。flag 名は **proposed(B1)**（例 `PLAN_FLAGS.travelCompositionPreflight`）。

---

## §12 ranking / dominance との関係
**本フェーズに Bundle 2 ranking なし**。合成は順位/勝者選別をしない。
- **fitSummary は advisory 維持**: 合成に届く fit 表面は `ProposalFitSummary`(+`ProposalFitComposition`) のみ（`grade`/`labelCap`/`labelStability`/`confidenceBand`/`mismatchCount`/`riskCodes`/`missingFields`・全 bounded/shared-safe/advisory）。adapter 契約上 fit は `executionAuthority` 非参加・`FitResult.authoritative` は構造的 `false`。fit は ranking/dominance を変えない。
- **合成は FEASIBILITY 診断を出してよい**（fit と別）: feasibility=「node 集合を形成できるか」（§10 hard block/不能 lock/trip-critical support 欠落）。carrier=既存 `FitJoinDiagnostics.unknownIds`/`duplicateIds` + `DecisionBlocker` 族。専用 proposed `CompositionFeasibilityDiagnostics{feasible; blockedNodeIds; needsAlternative}` は B1。
- **feasibility は dominance を変えない** — 候補の昇降格をしない（Bundle 2/solver GO まで）。候補を infeasible と marking すると**候補資格**から外す（fail-closed）が、生存 advisory grade を並べ替えない。**いかなる action authority も流れない**（合成は診断のみ・authority は `ReadinessResult.authoritative`/`ContingencyPlan.authoritative` のみ）。

---

## §13 Privacy
合成は二層を端から端まで遵守: **server-only authoritative**（全証拠・private 可）vs **display/shared**（`authoritative:false`/`executionAuthority:false`・mask）。
- **private fit reason は node 適格を server-side のみ変える**: `FitHardBlock.visibility="private"`（`ownerParticipantId` で所有）は authoritative 合成で entity を node 資格から外す（`ContingencyBranch.visibility="private"` と同様）。適格効果は real・**理由は private**。
- **shared view は private 制約を漏らさない**: private `ContingencyBranch`/`SoftPreferenceMatch`/`HardConstraintViolation`(`visibility="private"`) を完全除去、`ViewerScopedRationale.shared` のみ露出（`.forParticipant` を出さない）。node が shared から**消える**が**なぜ**を述べない（descriptor/owner なし）。
- **`missingCompositionQuestions` は private reason を出さない**: adapter 先例に倣い **field のみ・reason テキストなし**（`ProposalFitSummary.missingFields`=「shared-safe field・no reason・sorted/dedup」）。`MissingDataQuestion.reason`(label_unstable/safety_unknown/low_confidence) を露出しない。
- **client-only filtering なし**: mask は server 投影境界で行い、client は full data を受け取らない（既存 source-contract test と同規律）。
- **raw `FitResult` を合成出力に入れない**: bounded `ProposalFitSummary`/`ProposalFitComposition` のみ流入。`FitResult.components`/`mismatchReasons`/`perParticipantFit`/raw `confidence` なし（confidence は `confidenceBand` に banding）。§12 advisory 規則と §13 privacy 規則が同じ境界で交わる: shared 合成 view は構造上 bounded・非 authoritative・private-clean。
- **二層 tie**: authoritative 合成（server）は private hard block で真の適格を計算、display 合成（`authoritative:false`/`executionAuthority:false`）は mask 投影。private 理由で block された node は両 view で不在だが、理由を知るのは authoritative 層のみで shared 層/質問/packet に渡らない。

---

## §14 将来実装の golden test（今は実行しない）
B1–B4 pure 層の意図挙動。**本フェーズ未実行**。既存 grounded 型 verbatim + B1 proposed 型に対し assert。
**正 entity→node（fail-closed・決定論）**:
1. **fitted lodging → lodging node** — `entity.category==="lodging"` ∧ `ProposalFitSummary.grade!=="blocked"` → `activityKind==="lodging_checkin"`(or checkout)。`budgetBand`←`priceBand`(`Observed<BudgetBand>`)・`fatigueLoad`←`burden`（**数値**）・`checkin_window_lock` あれば `nodeConfidence==="anchor"`。
2. **hard-blocked lodging → node 0** — 非空 `FitResult.hardBlocks`（例 `red_line_violation`）→ `PreSolverNode` 0。private block(`visibility==="private"`) は server-side で抑止するが shared に出ない。
3. **restaurant → meal** — `category==="food"` → `activityKind==="meal"`。
4. **support → support node** — `category==="support"`（例 `reliefAxis==="luggage"`）→ `activityKind==="other"`（`ActivityKind` に `support` 無）+ `TravelCandidate.tags` で tag。
5. **route-chain → edge placeholder** — `RouteChainState`(`connection.fromRef`/`toRef`)→ `PreSolverEdge`（`transport`←`legs`・`durationMin` を**持たない**・捏造 duration なし）。
**制約収集（carry・schedule しない）**:
6. **checkin/open-hours/meal lock → constraint** — `EntityTimeLock.ordering.kind ∈ {checkin_window_lock,open_hours_window_lock,meal_time_lock}` → `TravelConstraint`(`axis==="time"`・`severity`←`relaxable`(false→hard/true→soft)・`descriptor`←`rawTime` 正規化キーのみ・`visibility` 保持)。
7. **`luggage_drop_enables` は順序を制約するが解かない** — `OrderingConstraint.kind==="luggage_drop_enables"`（subject `orderingAnchor===true`）→ `TravelConstraint`/ordering carrier。**node 並べ替えなし・`startMin`/`endMin` 割当なし**を assert（solver 責務 HOLD）。
8. **`last_departure_lock` → constraint/risk・live timetable でない** — → `TravelConstraint`(`axis==="time"`/`severity==="hard"`)。**timetable/route fetch なし・絶対時刻なし**・lock descriptor のみ。
**contingency carry（branch・live signal でない）**:
9. **rain fallback → branch・live weather でない** — `ContingencyBranch`(`trigger==="rain_or_weather"`・`fallbackAction==="switch_proposal"` or `keep_plan`)。**weather API/fetch なし**・shared 投影で `ContingencyPlan.authoritative===false`。
10. **fatigue fallback → rest/downgrade branch** — `trigger==="fatigue"`・`fallbackAction==="downgrade_to_easy"`(or defer)・`readinessImpact` は妥当 `ReadinessState`。live energy probe なし。
11. **欠落 route → 質問** — leg 用 `RouteChainState`/`ConnectionState` 不在→ missing-question（shared-safe field key のみ）・捏造 edge でない。private fit reason(`visibility==="private"`) を質問に漏らさない。
**hard scope guard（全て成立必須）**:
12. **solver 実行なし** — `startMin`/`endMin`/`dayIndex` 順序を割らない・node を sequence しない。classify/carry のみ。schedule field は持たない(`PreSolverNode`) or 合成失敗 mark。【ADV-fix LOW-7】preflight が ordering/route 計算から `startMin`/`endMin` を導出しないことを source-contract で assert。
13. **booking/calendar/action authority なし** — 出力は `authoritative:false`・reserve/book/schedule を呼ばない。
14. **外部 fetch/API/DB/Supabase import なし** — B1–B4 を strip-comments 後 grep（`fetch(`/`supabase`/`createClient`/`http`）= 0。
15. **M2 runtime なし** — M2 runtime import なし・pure-types + pure-mapper のみ。
16. **app/UI import なし** — `app/`/`components/`/`react`/`next/` grep = 0（shared/pure のみ）。
17. **shared 出力に raw `FitResult` なし** — `ProposalFitSummary` 消費のみ・合成 view に `components`/`mismatchReasons`/raw `confidence` 無。
18. **fit advisory 維持・ranking 不変** — `ProposalFitSummary.grade` の有無/値が `TravelCorePlan.candidates` を並べ替えず dominance を変えない。server-side で node *適格*(block/allow)のみ変える。
19. **impossible lock → 合成失敗/代替必要** — 同日に矛盾する 2 hard lock（例 `checkout_window_lock` が `checkin_window_lock` 前）→ proposed `CompositionFailure` signal・黙った不正 `TravelDay` でない。【ADV-fix LOW-6】cycle は検出のみで resolve/reorder しないことを assert。
20. **既存 travel test green + tsc baseline 55 不変** — additive 型/flag のみ・新 `PLAN_FLAGS` key は OFF 既定。

---

## §15 CEO 承認後の実装スライス
各スライスは pure・additive・fail-closed・OFF 既定 flag 後ろ（`PLAN_FLAGS` + `process.env.X==="true"`・server-side）。**solver の前で STOP**。
- **B1 — pure 合成型**: 前段合成契約（proposed 型のみ・logic なし）。*touch*: 既存 `TravelNode/TravelEdge/TravelDay/TravelItinerary/TravelConstraint/TravelCandidate/TravelCorePlan` を再利用、`ProposalFitSummary`/`EntityRetrievalCandidate`/`OrderingConstraint` を consume。*proposed*: `PreSolverNode`(時刻なし)・`PreSolverEdge`(duration なし・方向 kind のみ)・`reorderableHints`・`CompositionInput`・`CompositionFailure{reason:"hard_blocked_all"|"impossible_time_lock"|"missing_route"}`。*fail-closed*: 未scheduled/blocked 状態を**型で表現可能**にし、未解決構造を完成 `TravelItinerary` と誤認させない。
- **B2 — pure entity→node mapper**: 決定論分類（category→`ActivityKind`・`priceBand`→`budgetBand`・`burden`→`fatigueLoad`(数値)・lock 有無→`nodeConfidence`）。*touch*: `TravelObjectState.category`・`Observed<BudgetBand>`・`EntityBurdenAxis`・`ActivityKind`・`FatigueLoad`・`NodeConfidence`・`ProposalFitSummary.grade`・`FitResult.hardBlocks`。*fail-closed*: `grade==="blocked"` or severe `FitHardBlock`→**node なし**（null/skip・partial node 作らない）。`food`→`meal`・`support`→`other`。source は confidence のみ。
- **B3 — pure constraint collector**: `EntityTimeLock.ordering`/`OrderingConstraint` + fit 由来上限を `TravelConstraint[]` に carry-only。*touch*: `OrderingKind`（checkin/open-hours/meal/last_departure/luggage_drop_enables 等）・`relaxable`・`rawTime`・`ConstraintAxis`/`ConstraintSeverity`/`ConstraintOwner`/`Visibility`/`descriptor`。*fail-closed*: schedule/reorder しない・`relaxable===false`→`hard`・private は server-side 保持し shared descriptor 除去・矛盾 hard lock を flag（B4 へ）。【ADV-fix HIGH-1】`reorderable` を `reorderableHints` に分離し directed edge にしない。
- **B4 — 合成 preflight helper**: B2+B3 を走らせ構造 feasibility を検証し pre-solver `CompositionInput` or `CompositionFailure` を返す pure 関数。route data 不在で shared-safe missing-question を出す。*touch*: B1 proposed 型・`RouteChainState.connection`・`ContingencyTrigger`/`FallbackAction`・`ReadinessState`。*fail-closed*: impossible lock/all-blocked→`CompositionFailure`（代替必要）・`authoritative:true` を作らない・solver/optimizer を呼ばない・private reason を missingQuestions に出さない。【ADV-fix LOW-6/7】cycle は検出のみ・`startMin/endMin/dayIndex` を導出しない。
- **B5 — golden tests**: §14 の 1–20 を B1–B4 に対し encode（決定論・fetch なし）。source-contract grep で禁止 import。*fail-closed*: solver/booking/外部 不在・fit-advisory 不変・raw `FitResult` 非漏洩・privacy 非漏洩・tsc 55・既存 travel test green を assert。
- **STOP — solver HOLD**: node 順序・`startMin`/`endMin`/`dayIndex` 割当・route timetable 解決・scheduler/optimizer を**実装しない**。別 CEO-gated phase。B1–B5 は境界の定義と検証のみ。

---

## §16 Adversarial verification summary（適用済み 7 補正）
workflow `w6zfpyb65` の 8 verifier（field-accuracy + boundary-safety × 4 chunk）が検出し、本文へ反映:
| # | severity | 場所 | 検出 | 補正 |
|---|---|---|---|---|
| HIGH-1 | boundary | §5/§8 candidateEdges | `reorderable` から directed edge を導くと「順序選択」= solver 越境 | 方向内在 kind（must_precede/luggage_drop_enables/precedence lock）のみ edge 化。reorderable は無向 `reorderableHints`。invariant 追記 |
| MED-2 | boundary | §4 route 入力 | `RouteChainState.connection` が legs/durations/reliability(route 由来)を構造的に admit | `routeOrderingPlaceholders`(ordering subset)に narrow + 「ConnectionState payload は IGNORE/構造 drop」invariant |
| MED-3 | boundary | §4/§5 多日 dayIndex | 多日 `TravelDay` の dayIndex 割当 = 日割 = solver 仕事 | `PreSolverNode` フラット集合・dayIndex 未割当・>1 populated `TravelDay` は solver HOLD |
| MED-4 | field | §6 fatigueLoad | `FatigueLoad` を文字列 `"1".."5"` と誤記 | 実型は**数値 `1|2|3|4|5`**(core-types.ts:80)。量子化結果も数値 |
| MED-5 | field | §10 accessibility | accessibility を `Observed<>` と誤記 | 実型は `hardProfile.accessibility.{stepFree,wheelchair,noSteepSlope}: TriState`(fit-types.ts:441)。trigger=`TriState==="unknown"`。Observed-unobserved 規則は burden/recovery 用に別文保持 |
| LOW-6 | boundary | §5 ordering_cycle | cycle 検出が解消(reorder)へ滑る恐れ | 「検出 report-and-stop のみ・resolve/relax/reorder 禁止」明記 |
| LOW-7 | boundary | §11 startMin/endMin | `TravelNode.startMin/endMin` は非 optional number で「未解決」を表せず concrete commit を強いる | `PreSolverNode` で時刻 omit・solver 上書き必須・ordering/route から導出しない source-contract test |

---

## §17 CEO 判断請求
1. 次フェーズを **T11-B Itinerary Composition / Solver Boundary Preflight（docs-only・本書）** として承認するか（§1 推奨 = 合成 preflight・vs A/C/D/E/F）。
2. **★合成境界の型戦略**（proposed `PreSolverNode`/`PreSolverEdge` で solver 所有 field=`startMin/endMin/durationMin/dayIndex` を**型で**締め出し、既存 `TravelNode/Itinerary` は solver 出力に予約）を承認するか。
3. §4-§13 の契約・mapping・fail-closed/privacy 規則で進めて良いか（特に: fit advisory 維持・ranking 不変・raw FitResult 非漏洩・reorderable に順序を付けない・impossible lock は検出のみ）。
4. adversarial 7 補正（§16）を正本として受理するか。
5. 承認時、実装は **B1→B2→B3→B4→B5・solver 前で STOP**（§15）の順で良いか。各スライスは別途 implementation GO を求める。

**本書で停止**。実装（B1〜）は CEO 承認まで着手しない。
