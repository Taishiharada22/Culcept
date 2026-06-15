# Travel Solver/Assembly Pure Pipeline Closeout + Scheduled-Draft Display Projection + Dev Preview Preflight（docs-only・HOLD）

**作成日**: 2026-06-14 / **ステータス**: docs-only・実装なし・display projection / dev preview は HOLD（別 GO）・stop after report。
**スコープ**: Travel 専属。**禁止**: 実装・solver/assembler 変更・外部/route/weather/place/Maps API・fetch/DB/M2 runtime・booking/calendar/action authority・本番 `/plan` 変更・送信・staging/production・push。

**★目的**: ①Travel solver→assembly の **pure pipeline 完成**を凍結点として総括。②bridge 設計で deferred した **display-safe projection**（server-only `ScheduledTravelItineraryDraft` → client 表示用）の契約設計。③既存 dev-* preview 規約に倣う **dev preview preflight**（fixture・flag-gated・no production）。

---

## §1 前提を疑う — これが次か
- **vs S5（再計画）**: S5 は accepted draft を摂動。摂動対象 draft は完成したが、**それを安全に観測（表示）する手段が無い**。display projection + dev preview が無いと S5 の検証も UI も進められない。**closeout+display+preview が先**。
- **vs Bundle 2 / TravelCandidate 構築**: candidate 競争/構築は別軸・直交。
- **vs 実配線（本番 /plan）**: 本番は外部/real data/CEO 承認を要し早い。**まず pure を安全に観測可能化**（fixture dev preview）。
**推奨 = closeout + display projection + dev preview preflight**。pure pipeline を**本番に触れず安全に可視化**し、display の privacy/authority 境界を固める唯一の次手。

---

## §2 Closeout（Travel solver→assembly pure pipeline）
| 層 | 成果（committed） | 状態 |
|---|---|---|
| composition (T11-B) | buildCompositionDraft → CompositionDraft / CompositionFailure | 完成 |
| solver-boundary report (T11-C) | classifyFeasibility / SolverFeasibilityReport | 完成 |
| assembly (A1-A4) | detectAssemblyReadiness・assembleScheduledDraft(copy-only)・ScheduledTravelItineraryDraft | 完成 |
| **solver S1** | 型壁（PlacementBasis 二層/ScheduleChoicePoint/SolverScheduleInput 等） | 完成 |
| **solver S2** | STN feasibility-region（buildClosedStn・Floyd-Warshall・region） | 完成 |
| **solver S3** | sequencing/no-overlap feasibility（半順序 P・O(n²) flip-and-test・coupled choice） | 完成 |
| **solver S4** | selection-ledger → server-only AssemblyInputCandidate（provisionalDefault は SUGGESTION・自動適用なし・stale 防止） | 完成 |
| **bridge AB** | bridgeAssemblyCandidate（second 独立 gate → 唯一の assembleScheduledDraft 呼出 → server-only scheduled_draft envelope） | 完成 |

**今完成（全 pure・未配線）**: `intake → composition → solver(S1 型/S2 region/S3 sequencing/S4 finalization) → bridge → assembleScheduledDraft → ScheduledTravelItineraryDraft`。捏造ゼロ・agency 保持・privacy 二層・no authority・決定論。
**HOLD のまま**: **display projection**（本書設計）・**dev preview**（本書 preflight）・S5 再計画・TravelCandidate 構築/candidates 挿入・Bundle 2 ranking・実 solver 配線（本番 /plan）・外部 retrieval/Tier links/booking/M2 runtime。

---

## §3 display projection 問題
- bridge の成功出力 `{outcome:"scheduled_draft", serverOnly:true, draft:ScheduledTravelItineraryDraft}` は **server-only**。
- UI/client に出すには **display-safe projection** が要る（bridge 設計 §9 で deferred＝別 gate）。
- 危険: (a) server-only/audit/private を client に漏らす、(b) display が **booking/execution authority** を含意する、(c) raw FitResult/内部 id の過剰露出。
- `ScheduledTravelItineraryDraft` は既に shared-safe 寄り（authoritative:false・private なし）だが、**serverOnly envelope の剥離・audit provenance の除外・authority/booking の非含意**を明示する projection が必要。

---

## §4 display projection 契約（proposed `DisplayScheduledItinerary`）
```ts
// proposed (未実装・DP1)
export interface DisplayScheduledItinerary {
  status: "draft_proposal";        // ★ 予約済でない・authoritative でない（draft 提案であることを表示で明示）
  candidateId: string;
  days: DisplayDay[];
  // ★ executionAuthority/booking/calendar/action field なし・serverOnly marker なし・raw provenance なし
}
export interface DisplayDay {
  dayIndex: number;
  date: string;                    // ISO（scope 由来・caller 注入）
  nodes: DisplayNode[];            // ★ startMin 昇順（display order・assembler の copy 順を反映）
  transitions: DisplayTransition[];
}
export interface DisplayNode {
  nodeId: string;                  // React key 用（内部 id・private でない）
  startMin: number; endMin: number;
  startLabel: string; endLabel: string; // ★ "HH:MM"（startMin の決定論フォーマット・捏造でない）
  place: { label?: string; externalId?: string }; // ★ 表示 label + place_id（内部 placeRefId は出さない）
  activityKind: string; budgetBand: BudgetBand; fatigueLoad: number; nodeConfidence: string;
}
export interface DisplayTransition {
  fromNodeId: string; toNodeId: string; transport: string; durationMin: number; cost: BudgetBand;
}
// function projectDisplayScheduledItinerary(bridge: AssemblyBridgeResult): DisplayScheduledItinerary | null  // proposed・pure
```
**projection ロジック（DP2・骨子）**: 入力は **bridge 結果**（`AssemblyBridgeResult`）。`outcome !== "scheduled_draft"` → `null`（表示なし）。`draft.itinerary.days` を DisplayDay/Node/Transition に写像（startMin→"HH:MM" フォーマット・place.label/externalId のみ・budgetBand/fatigueLoad/nodeConfidence/transport/durationMin/cost を copy）。**serverOnly marker・`authoritative`/`draft` 内部 flag・`ScheduledDraftProvenance`(audit) を出力に含めない**。`status:"draft_proposal"` で「提案・未予約」を表示。

---

## §5 display projection 規則
- **read-only**: 値の copy + 決定論フォーマット（HH:MM）のみ。solve/再計算/推論しない。
- **no authority / no booking**: executionAuthority/booking/calendar/action field を持たない。**予約 button/外部 link を含めない**（予約直前化＝Tier1 safe links は別 HOLD gate・display は旅程の可視化のみ）。
- **no private**: ScheduledTravelItineraryDraft は既に private なし。projection は audit provenance(ScheduledDraftProvenance) を**除外**・内部 placeRefId を出さない（nodeId のみ key 用）・raw FitResult なし。
- **決定論**: 同 draft → 同 display（HH:MM は `Math.floor(startMin/60):pad(startMin%60)` 等の純フォーマット）。
- **no external/live**: place.externalId は **carry のみ**（projection は Maps/place を呼ばない）。

---

## §6 dev preview preflight
既存 dev-* preview 規約（`app/(culcept)/plan/dev-travel-projection` / `dev-travel-engine-projection` / `dev-coalter-projection-cues`・flag `PLAN_FLAGS.travelProjectionPreview`=`PLAN_TRAVEL_PROJECTION_PREVIEW`・server-side のみ評価・default OFF）に倣う。
- **route（proposed・PV1）**: `app/(culcept)/plan/dev-travel-scheduled-draft/page.tsx`（server component）。
- **flag**: ★**既存 `PLAN_FLAGS.travelProjectionPreview` を再利用**（CEO の「既存 plan-scoped preview flag を先に再利用」方針）。flag false → 表示しない（notFound/null）。**server-side のみ評価・NEXT_PUBLIC なし・default OFF**。（option B: 専用 `PLAN_TRAVEL_SCHEDULED_DRAFT_PREVIEW` 追加。）
- **fixture**: **手組み fixture から** pure pipeline を通す（fixture CompositionDraft + explicit numeric inputs + 明示 ChoiceSelection → applySelectionLedger → bridgeAssemblyCandidate → projectDisplayScheduledItinerary）or 手組み ScheduledTravelItineraryDraft → projection。**real data なし・DB/API/外部なし・決定論**。
- **render**: `DisplayScheduledItinerary` を簡易 component で表示（既存 dev preview の render パターン・renderToStaticMarkup test 可）。**予約 link/外部 link なし**。
- **preflight ゆえ実装しない**（route/flag/fixture/projection を提案するのみ）。

---

## §7 してはならない
本番 `/plan` 変更なし・実 solver を本番で走らせない・preview に real user data を入れない・外部/route/weather/place/Maps API なし・fetch/DB/migration/persistence なし・M2 runtime なし・booking/calendar/送信なし・display に authority/予約 affordance を含めない・TravelCandidate 構築/candidates 挿入なし・projection で solve/reorder/placement しない。

## §8 privacy
- display projection は **bridge の server-only 結果から client-safe payload を作る境界**。serverOnly marker を剥離・audit provenance を除外・private なし（draft は既に shared-safe）。
- dev preview は **fixture のみ**（real data 経路なし）ゆえ privacy 露出ゼロ。flag OFF default で本番非表示。
- client-only filtering なし（projection が server で client-safe を確定）。

## §9 実装スライス（全 HOLD・各別 GO）
- **DP1** display projection 型（`DisplayScheduledItinerary`/`DisplayDay`/`DisplayNode`/`DisplayTransition`・proposed・types only）。*narrow*
- **DP2** pure projection helper（`projectDisplayScheduledItinerary(AssemblyBridgeResult)`・copy + HH:MM フォーマット・audit/marker 除外・no authority/booking）。*narrow*
- **DP3** projection golden tests（draft→display・serverOnly/provenance 非露出・authority/booking なし・HH:MM 決定論・no-draft→null・source-contract）。
- **PV1** dev preview route（`dev-travel-scheduled-draft/page.tsx`・flag gate・fixture→pipeline→projection→render・real data/外部/booking なし）。
- **PV2** preview render test（flag ON で fixture 表示・renderToStaticMarkup・source-contract: no fetch/DB/外部/booking link）。
- **本番配線/実 solver/外部 link の前で STOP**。
**gating**: DP1-DP3 は pure・narrow。PV1/PV2 は app route だが **flag-gated・fixture-only・default OFF**（本番非表示）。

## §10 将来 golden test
- scheduled_draft envelope → DisplayScheduledItinerary（status:draft_proposal・days/nodes/transitions）。
- no_draft → null（表示なし）。
- display に serverOnly marker / ScheduledDraftProvenance(audit) / authoritative/draft 内部 flag / 内部 placeRefId が**出ない**。
- display に executionAuthority/booking/calendar/予約 link が**ない**。
- HH:MM ラベルは startMin の決定論フォーマット（540→"09:00"）。
- projection は solve/reorder/推論しない・runTravelPlanEngine/evaluateFit 非呼出。
- dev preview: flag OFF→非表示・flag ON→fixture 表示・real data 経路なし・外部 fetch/DB/Supabase/Maps/booking import なし。
- 既存 travel test green・tsc baseline 不変。

## §11 Stop
本 closeout + preflight report で停止。**display projection / dev preview を CEO 承認まで実装しない**。

---

## §12 CEO 判断請求
1. Travel solver→assembly **pure pipeline 完成**を凍結点として承認するか（§2）。
2. 次 = **display projection 設計 + dev preview preflight（本書）** を承認するか（§1 推奨）。
3. **display projection 契約**（`DisplayScheduledItinerary`・status:draft_proposal・serverOnly/audit/private/authority/booking を出さない・HH:MM 決定論フォーマット・place は label/externalId のみ）で良いか。
4. dev preview = **既存 `PLAN_FLAGS.travelProjectionPreview` 再利用・fixture-only・server-side default OFF・本番非表示**（vs option B 専用 flag）で良いか。
5. 実装順 = **DP1(型)→DP2(projection)→DP3(tests)→PV1(dev route・flag-gated fixture)→PV2(render test)・本番配線/外部 link 前 STOP** で良いか（各別途 GO）。

**本書で停止**。実装は CEO 承認まで着手しない。
