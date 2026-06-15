# A: Solver Boundary Closeout + ScheduledTravelItineraryDraft Design（境界凍結 + 出力契約・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: docs-only・実装なし・**solver は HOLD**・stop after report。
**目的**: ①T11-C solver 境界（report 層）を凍結点として総括し、②`ScheduledTravelItineraryDraft` の**契約を固める** — 「eligible なら何を出してよいか」の設計。**まだ solver ではない**（時刻/順序を計算しない）。
**スコープ**: 本セッション = Travel 専属。**禁止**: 実装・solver/scheduler/optimizer・順序付け/時刻計算/packing/route search・外部 API・fetch/DB/Supabase/M2 runtime・booking/calendar/action authority・`TravelCandidate` emission・本番 `/plan`・push。

---

## Part 1 — Solver Boundary Closeout（T11-C 凍結点）
**完成（T11-C1..C5・`418f93a3`）= solver 境界の report 層**:
- C1 `solver-boundary-types.ts`: `SolverBoundaryState`(9)・`SolverInputGapKind`(10)・`SolverFeasibilityInput`(result + explicit nodeDurations/edgeDurations/lockWindows/nodeDayBindings/scope)・`SolverFeasibilityReport`(authoritative:false/draft:true)・`ScheduledDraftEligibility`(boolean+unmet のみ)。
- C2 `classifyFeasibility`: failure/draft → state。relaxable-only `ordering_cycle` は非hard。時刻/日割/順序を割らない・engine/evaluateFit 非呼出。
- C3 `detectScheduleGaps`: node/route duration・trip window・多日 node→day binding・lock window 欠落を検出（捏造なし）。
- C4-narrow `checkScheduledDraftEligibility`: **boolean + 不足要件のみ**・draft を構築しない。
- assembler `buildSolverFeasibilityReport` + `projectSharedFeasibilityReport`(private strip)。
- C5 18 golden tests。検証: travel 524・tsc 55・full 21228 green。

**今できること**: `CompositionResult` を「feasible か / 何が不足か / scheduled draft の適格か」へ**報告**する。
**HOLD のまま**: 実 solver（時刻/順序/日割の計算）と、**`ScheduledTravelItineraryDraft` の中身**。本書は後者の**契約**を固める（前者は別 GO）。

---

## Part 2 — 核心: 「eligible(feasible)」≠「assembly-ready」
**grounding（実ソース確認・`core-types.ts:154-188`）— 既存 `TravelNode`/`TravelEdge`/`TravelDay` は全フィールド非optional**:
- `TravelNode`{nodeId, **startMin:number**, **endMin:number**, place, activityKind, **budgetBand:BudgetBand**, fatigueLoad, nodeConfidence}
- `TravelEdge`{fromNodeId, toNodeId, **transport:TransportMode**, **durationMin:number**, **cost:BudgetBand**}
- `TravelDay`{**dayIndex:number**, **date:string**, nodes, edges} / `TravelItinerary`{days}

**ここに契約の分岐がある**:
- `PreSolverNode` は `startMin`/`endMin` を持たない。C3/C4 は **node duration**（dwell 分）の有無を見る。だが `TravelNode` が要るのは **startMin/endMin（絶対配置）**。**duration だけでは配置が決まらない** — 複数 node を 1 日の中に並べて重ならないよう置くのは **packing/sequencing = solver の仕事**。
- `TravelNode.budgetBand` は**非optional**だが `PreSolverNode.budgetBand` は**optional**（price 不明なら省略）。
- `TravelEdge.transport`/`cost` は**非optional**だが `PreSolverEdge.transport`/`cost` は**optional**・`durationMin` は持たない。

→ **結論**: C4 の `feasible_scheduled_draft`（duration 等が揃った "schedule できる見込み"）は **scheduled draft を pure copy で組める保証ではない**。`ScheduledTravelItineraryDraft` を **solver なしで** 出してよいのは、**全 non-optional 対象フィールドに explicit source がある時＝特に node の explicit interval（startMin+endMin）が供給されている時**に限る。さもなくば配置計算（solver・HOLD）が要る。

本書はこの **「assembly-ready（pure copy で組める）」** という、feasible より厳しい状態を定義し、`ScheduledTravelItineraryDraft` の契約をそこに紐づける。

---

## Part 3 — `ScheduledTravelItineraryDraft` 契約（出力の形）
```jsonc
// PROPOSED — 本フェーズ未実装（契約のみ）
ScheduledTravelItineraryDraft {
  outcome: "scheduled_draft",   // proposed literal
  authoritative: false,         // ★ 実行権限でない（CompositionDraft/Report と同規律）
  draft: true,                  // ★ planning draft・readiness が別途 action を gate
  candidateId: string,          // CompositionDraft.candidateId を echo（新 candidate を作らない）
  itinerary: TravelItinerary,   // 既存型・**全フィールドが explicit source から copy された時のみ**
  // ★ 由来監査用（proposed・任意）: 各 scheduled 値が explicit 由来であることの trace
  provenance?: ScheduledDraftProvenance
}
```
- **`TravelCandidate` ではない**・`TravelCorePlan.candidates` に入れない（candidate 構築は別 GO）。
- `authoritative:false`/`draft:true` 固定・executionAuthority/booking/calendar 権限なし（readiness が別 gate・Part 8）。
- `ScheduledDraftProvenance`（proposed・任意）: 各 `startMin`/`endMin`/`durationMin`/`dayIndex`/`transport`/`cost`/`budgetBand` が **どの explicit input 由来か**を記録（捏造でないことの監査・shared-safe）。

---

## Part 4 — assembly input 契約（各 non-optional フィールドの explicit source）
`ScheduledTravelItineraryDraft` を **solver なしの pure copy** で組むのに必要な explicit source を、対象フィールド単位で定義する（**どれも境界が計算/推論しない**）。
```jsonc
// PROPOSED — 本フェーズ未実装（契約のみ）
AssemblyInput {
  draft: CompositionDraft,                       // 既存: candidateNodes/edges を骨格に
  scope: TravelPlanScope,                         // 既存: date を供給（window.single_day.date / range.startDate+nights）
  nodeIntervals: Record<nodeId, { startMin: number; endMin: number }>, // ★net-new・per-node explicit 配置（duration でなく絶対）
  nodeDayBindings: Record<nodeId, number>,        // 既存(C): per-node dayIndex（single_day は 0 自明・range は explicit 必須）
  nodeBudgetBands?: Record<nodeId, BudgetBand>,   // proposed: PreSolverNode.budgetBand が無い node の explicit budget
  edgeDurations: Record<edgeKey, number>,         // 既存(C): per-edge explicit durationMin
  edgeTransports?: Record<edgeKey, TransportMode>,// proposed: PreSolverEdge.transport が無い edge の explicit transport
  edgeCosts?: Record<edgeKey, BudgetBand>         // proposed: PreSolverEdge.cost が無い edge の explicit cost
}
```
**対象フィールド → explicit source 写像（境界は copy のみ・計算しない）**:
| `TravelNode`/`Edge`/`Day` field（非optional） | explicit source | 欠落時 |
|---|---|---|
| `TravelNode.nodeId`/`place`/`activityKind`/`fatigueLoad`/`nodeConfidence` | `PreSolverNode`（既に確定） | — |
| `TravelNode.startMin`/`endMin` | **`AssemblyInput.nodeIntervals[nodeId]`（explicit・duration でない）** | `node_interval_missing`（net-new） |
| `TravelNode.budgetBand` | `PreSolverNode.budgetBand` ?? `nodeBudgetBands[nodeId]` | `price_unknown`（既存・assembly では blocking） |
| `TravelEdge.fromNodeId`/`toNodeId` | `PreSolverEdge`（確定） | — |
| `TravelEdge.durationMin` | `edgeDurations[edgeKey]` | `route_duration_missing`（既存） |
| `TravelEdge.transport` | `PreSolverEdge.transport` ?? `edgeTransports[edgeKey]` | `edge_transport_missing`（net-new） |
| `TravelEdge.cost` | `PreSolverEdge.cost` ?? `edgeCosts[edgeKey]` | `edge_cost_missing`（net-new） |
| `TravelDay.dayIndex` | `nodeDayBindings[nodeId]`（range）/ 0（single_day） | `day_assignment_missing`（既存） |
| `TravelDay.date` | `scope.window`（single_day.date / range.startDate+offset） | `date_missing`（net-new・scope 欠落） |

**禁止（再掲・境界）**: live route/weather/place/Maps/OTA で transport/cost/duration を埋めない・price を source popularity/URL から推論しない・interval を duration から packing しない・date を guess しない。欠落は gap で報告し draft を出さない。

---

## Part 5 — assembly readiness（C4 eligibility より厳しい・proposed）
C4 の `eligibleForScheduledDraft`（= feasible_scheduled_draft: schedule の見込み）と、本書の **assembly-ready（pure copy 可）** を **明確に区別**する。
```jsonc
// PROPOSED — 本フェーズ未実装（契約のみ）
AssemblyGapKind =
  | "node_interval_missing"   // ★net-new: explicit startMin/endMin 欠落（duration だけでは不可）
  | "edge_transport_missing"  // ★net-new
  | "edge_cost_missing"       // ★net-new
  | "date_missing"            // ★net-new
  | "route_duration_missing"  // 既存(C3) を再利用
  | "day_assignment_missing"  // 既存(C3)
  | "price_unknown"           // 既存(C3) — assembly では budgetBand を blocking にする
AssemblyReadiness { assemblyReady: boolean; missingAssemblyInputs: { kind: AssemblyGapKind; ref?: string }[] }
```
- **包含関係**: `assemblyReady ⊂ feasible_scheduled_draft`。assembly は feasible より **厳しい**（interval/transport/cost/budget の explicit が追加で必要）。逆は成立しない（duration はあるが interval が無い ⇒ feasible だが not assembly-ready ⇒ solver が配置計算・HOLD）。
- **`ScheduledTravelItineraryDraft` は `assemblyReady === true` の時のみ emit 可**。`feasible_scheduled_draft` だが not assembly-ready ⇒ **report-only 継続**（solver HOLD が interval を計算するまで draft は出ない）。
- C4 の `ScheduledDraftEligibility`（schedule 見込み）はそのまま維持。assembly-ready は **その上位の追加 gate**（proposed・A2 で実装）。

---

## Part 6 — assembly 規則（pure copy・solver でない）
assembler（proposed・A3）は **explicit 値の field copy に限定**。以下を**しない**:
- **startMin/endMin を計算しない**（`nodeIntervals` から copy のみ・duration から packing しない）。
- **node を順序決定（sequencing）しない**: `TravelDay.nodes` は explicit `dayIndex` で grouping し、各日内は **explicit `startMin` の昇順（決定的・stable）** で並べる ＝ explicit データの反映であって選択でない（同 startMin は caller 入力順で安定）。**solver が順序を"選ぶ"ことはしない**。
- **durationMin/transport/cost を導出しない**（explicit source から copy）。
- **date を guess しない**（scope window から決定的に算出: single_day=その date / range=startDate に dayIndex offset を加算した ISO・**caller 注入の date 規律**）。
- **overlap を解決しない**: explicit interval が重複/矛盾（endMin≤startMin・0..1439 外・同日同 node 重複）→ **fail-closed diagnostic**（auto-fix/再配置しない）。これは整合 **検査**であって scheduling ではない。
- **lock 窓に対する配置検証**（explicit interval が lock 窓内か）も **検査のみ**（窓を計算/緩和しない・違反は diagnostic）。
- いずれかの assembly source 欠落 → `assemblyReady=false` → **draft を出さない**（report-only）。

**solver との線引き**: 「explicit interval を copy」＝ assembly（本契約）。「duration+window から interval を計算（packing/topo-sort/optimization）」＝ **solver（HOLD・別 GO）**。

---

## Part 7 — HOLD のまま（実 solver）
- duration+window から **startMin/endMin を計算**（interval が explicit でない経路）。
- node の **順序選択 / day-assignment 計算**（explicit binding が無い経路）。
- route 探索 / live data / 最適化 / fallback selection。
- `TravelCandidate` 構築 / `TravelCorePlan.candidates` 投入 / ranking。
- booking/calendar/送信/realtime。

---

## Part 8 — 不変（draft に対して再掲）
- **authority**: `ScheduledTravelItineraryDraft` は `authoritative:false`/`draft:true`・実行権限なし・book/reserve/calendar/send/accept をしない。readiness（`ReadinessResult.authoritative`/`ReadinessState`）が別途 action を gate。booking は別 GO。
- **no fabrication**: 全 scheduled 値は explicit source 由来（`provenance?` で監査可）。default 60分/duration/interval/transport/cost/date/dayIndex を作らない。
- **fit advisory / ranking 不変**: assembly は feasibility/fit を変えない。`TravelCandidate` を出さない。
- **privacy 二層**: private blocker は assembly-readiness を server-side で変えてよいが、shared 投影で reason/owner を漏らさない（`projectSharedFeasibilityReport` と同規律）。draft の provenance も shared-safe（private descriptor を含まない）。

---

## Part 9 — 将来 test（assembly slice 用・未実行）
- interval 欠落（duration のみ）→ assemblyReady=false・`node_interval_missing`・**draft を出さない**（feasible でも）。
- budgetBand 欠落 → `price_unknown` で assemblyReady=false。
- edge transport/cost 欠落 → `edge_transport_missing`/`edge_cost_missing`。
- range で node→day binding 欠落 → `day_assignment_missing`・single_day は不要。
- 全 explicit（interval+budget+duration+transport+cost+dayIndex+date）→ assemblyReady=true・`ScheduledTravelItineraryDraft` を **pure copy** で構築・各値が explicit source に一致（provenance）。
- explicit interval が endMin≤startMin / 0..1439 外 / 重複 → fail-closed diagnostic・draft を出さない・**再配置しない**。
- node 並びは explicit startMin 昇順（決定的・solver が選ばない）。
- lock 窓違反の explicit interval → diagnostic（窓を緩和/再計算しない）。
- assembler は startMin/endMin を**計算しない**（nodeIntervals 以外から導出しない・source-contract）。
- `TravelCandidate` を emit しない・`runTravelPlanEngine`/`evaluateFit`/route search/fetch/DB/M2/app/UI 非依存。
- 既存 travel test green・tsc baseline 不変。

---

## Part 10 — 実装スライス（CEO 承認後・solver 前 STOP）
- **A1 — assembly 契約型**: `ScheduledTravelItineraryDraft`・`AssemblyInput`・`AssemblyGapKind`・`AssemblyReadiness`・`ScheduledDraftProvenance`（proposed types only・logic なし）。*touch*: 既存 TravelNode/Edge/Day/Itinerary/TravelPlanScope/BudgetBand/TransportMode・C1 型（read-only・field 追加なし）。
- **A2 — assembly-readiness detector**: pure 関数で各 non-optional source の有無を検査し `AssemblyReadiness` を返す（C3/C4 の上位 gate）。*fail-closed*: 欠落→報告・default しない。
- **A3 — pure assembler（copy-only・NARROW）**: assemblyReady の時のみ explicit 値を `TravelItinerary` に **copy** し `ScheduledTravelItineraryDraft` を返す。*厳守*: startMin/endMin を計算しない・順序を選ばない（explicit startMin 昇順の決定的反映のみ）・overlap を解決しない・duration/transport/cost/date を導出しない。**packing/topo-sort/optimization/route search が要るなら STOP して solver GO に分割**。
- **A4 — golden tests**: Part 9 を encode。
- **STOP — 実 solver の前**（interval 計算/順序選択/day-assignment 計算は別 CEO-gated GO）。

---

## Part 11 — 次分岐の判断
| 案 | 内容 | 評価 |
|---|---|---|
| **A1-A4（本契約の実装）** | assembly-ready 検査 + copy-only assembler | 契約を固めた直後の自然な実装・solver 不要・現実的に「explicit に並べた旅程」を出せる |
| 実 solver（scheduling search） | duration+window→interval 計算・順序/day 選択 | **最重要だが最大の境界越え**・別 CEO-gated GO・本契約が前段 |
| Bundle 2 ranking | feasible/assembly 後の候補順位 | assembly/solver の後 |
| Tier1 safe links | 予約直前化 | 旅程確定後 |

**推奨**: 本書（契約凍結）を承認後、**A1-A4（assembly-ready + copy-only assembler）を実装**。これで「ユーザー/上流が explicit に時刻を与えた旅程」を solver なしで `ScheduledTravelItineraryDraft` として出せる（＝ "eligible なら何を出してよいか" の実体）。**実 solver（interval 計算）は A1-A4 の後の別 GO**。

---

## CEO 判断請求
1. T11-C solver 境界（report 層）を**凍結点**として承認するか。
2. **★核心**（feasible[duration] ≠ assembly-ready[explicit interval]・既存 TravelNode/Edge/Day は全 non-optional ゆえ interval/budget/transport/cost/date も explicit 必須）を認めるか。
3. **`ScheduledTravelItineraryDraft` 契約**（Part 3）+ **AssemblyInput / AssemblyReadiness**（Part 4-5・assemblyReady ⊂ feasible・draft は assemblyReady の時のみ）で固めて良いか。
4. assembly 規則（Part 6: pure copy・startMin/endMin 計算なし・順序は explicit startMin 昇順の決定的反映・overlap 再配置なし・solver との線引き）で良いか。
5. 次 = **A1-A4（assembly-ready detector + copy-only assembler + tests）・solver 前 STOP**（Part 10-11）で良いか。各別途 implementation GO を求める。

**本書で停止**。実装（A1〜）は CEO 承認まで着手しない。
