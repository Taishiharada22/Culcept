# Travel Candidate / Display Foundation Closeout + Bundle 2 Ranking/Dominance Design（docs-only）

> 設計 + closeout フェーズ。**コード変更なし**。実装は CEO 承認後に別 slice。
> 上位文脈: envelope(A+B) → C2 conversion types → C3 converter → C4 collection draft → D display projection。
> 原則: ①前提を疑う ②自立推論+grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等推論 ⑦人間超え革新 ⑧世界トップシェア。

---

## PART 1 — Travel Candidate / Display Foundation Closeout

### 1.1 完成したチェーン（全 pure・未配線）

```
ScheduledTravelItineraryDraft (assembly)
  └─ AB bridge → AssemblyBridgeResult(scheduled_draft, serverOnly)
       └─ A+B: ScheduledDraftCandidateEnvelope（非挿入 envelope・insertable:false）
            └─ C2: TravelCandidateConversionInput 契約（factual/interpretive 分離・構築しない）
                 └─ C3: convertScheduledDraftEnvelopeToTravelCandidate → core-types TravelCandidate（未挿入・捏造禁止）
                      └─ C4: CandidateCollectionDraft（server-only・ranked:false）+ addTravelCandidateToCollectionDraft（immutable・TravelCorePlan 非変更）
                           └─ D: DisplayCandidateCollection（client-safe・shared rationale のみ・rank 非表示）+ dev preview（flag-gated・fixture）
```

### 1.2 確立した不変条件（firewall 群）

| # | 不変条件 | 守る場所 |
|---|---|---|
| 1 | envelope は `TravelCandidate` でない・`candidates[]` に入らない | A+B（discriminant + 必須 field 欠落の型 firewall） |
| 2 | factual と interpretive を分離・**interpretive（title/tags/rationale/uncertainty/tradeoff/reversal）は明示供給必須・捏造禁止** | C2/C3 |
| 3 | target は **core-types TravelCandidate のみ**（CoAlter 版を import/構築しない） | C3 |
| 4 | 構築 ≠ 挿入（`Converted` は `insertable:false`）・`TravelCorePlan` 非変更 | C3/C4 |
| 5 | 保管は **ranked:false**・**配列順 ≠ ranking**・重複 candidateId fail-closed | C4 |
| 6 | 表示は **shared rationale のみ**・`forParticipant`(private) 非露出・serverOnly/rank/dominance/FitResult 非露出 | D |
| 7 | 全 slice **pure・未配線**・no booking/calendar/acceptance/persistence/production `/plan`・push なし | 全フェーズ |

### 1.3 完成 / HOLD

- **完成**: 「scheduled draft → 明示変換 → core-types TravelCandidate 構築 → server-only 保管 → client-safe 表示（dev preview）」まで。全 pure・未配線・tsc 55・full suite green。
- **HOLD**: C4-D（CandidateCollectionDraft → TravelCorePlan.candidates[] 実反映）/ **Bundle 2 ranking/dominance（PART 2）** / user acceptance / booking/calendar / persistence(DB) / production `/plan` 配線 / viewer-safe per-participant rationale / 外部 safe-links(Tier1) / live visual smoke（auth gate・retriable）。

---

## PART 2 — Bundle 2 Ranking / Dominance Design

### 2.0 grounding（既存 2 レーンの事実）

| レーン | 何 | 状態 | dominance |
|---|---|---|---|
| **proposal lane（WIRED）** | `compareProposals`(proposal-comparator.ts) → `ProposalComparison`(dominatedBy/paretoOptimal・softMatchCount↑/stretchCount↓) → `decide`(decision-core.ts) | `runTravelPlanEngine` に配線済 | proposal 品質軸の Pareto + fairness tie-break |
| **CoAlter pareto（TEST-ONLY）** | `compareTravelCandidatesPareto`(pareto.ts)・別型 `TravelRankedItineraryCandidate`(rank/scoreBreakdown) | 未配線 | 多軸（budget/fatigue/feasibility/pair/anchor/safety/novelty/uncertainty/timeBalance）front 層化 |
| **new candidate lane（PURE・本トラック）** | core-types `TravelCandidate`(tradeoff) を `CandidateCollectionDraft`(ranked:false) で保持 | 未配線・**ranking なし** | **無し（本 PART で設計）** |

`TradeoffProfile{cost,distance,fatigue,experienceVariety}` は **明示供給**（itinerary→tradeoff 計算は存在しない）。

### 2.1 まず前提を疑う（①）

**問: Bundle 2 ranking は今やるべきか？**
- new candidate lane は現状 **1 resolution = 1 draft** → collection は当面 **0..1 candidate**。**1 件に Pareto dominance は自明**（それが frontier）。
- ∴ **実 ranking の価値は「multi-candidate generation」が来るまで出ない**。Bundle 2 は **HOLD（docs 既定）が妥当**だが、本トラックの規律（pure・先行・advisory）に沿い「**advisory な dominance overlay 型 + helper を pure/未配線で用意**」までは安全に前進できる。

**問: scalar score（総順位）か Pareto（半順序）か？**
- CEO 哲学 = 「**汎用最適化器でない・ユーザー理解が強み・agency 保全**」。**scalar 総順位は「唯一の最適解」を押し付け agency を毀損**。
- → **Pareto 半順序（frontier + dominated + 各軸トレードオフ説明）を採用**。「どれが一番か」でなく「**どれが本当に検討に値する選択肢か（frontier）・各々が何を犠牲にするか**」を示す。⑥⑦: これは「第二の自己が"あなたの本当の選択肢"を見せる」体験。

**推奨**: PART 2 設計を確定し、実装は **B2-A/B/C（pure dominance overlay 型 + Pareto helper + tests・advisory・未配線・reorder/scalar なし）** を次スライス候補に。**wiring と display は後**。multi-candidate generation 不在を理由に「実装も HOLD」も妥当 → **CEO 判断**。

### 2.2 dominance problem の定義

- new candidate lane に「どれを優先的に見るべきか」の手掛かりが無い（全 candidate が並列）。
- だが **C4 の `ranked:false` firewall を壊してはならない**（silent ranking 禁止）。
- ∴ Bundle 2 は **collection を reorder せず**、**別の advisory overlay** として dominance を **計算・説明**する。総順位・scalar・「best」を作らない。

### 2.3 dominance model（Pareto・shared-safe tradeoff 軸）

**支配述語**（A が B を支配 ⟺ 全軸で A≥B かつ 1 軸以上で厳密に優）:
```
cost↓  distance↓  fatigue↓  experienceVariety↑
A dominates B ⟺
  A.cost ≤ B.cost ∧ A.distance ≤ B.distance ∧ A.fatigue ≤ B.fatigue ∧ A.experienceVariety ≥ B.experienceVariety
  ∧ (少なくとも 1 軸が厳密: A.cost<B.cost ∨ A.distance<B.distance ∨ A.fatigue<B.fatigue ∨ A.experienceVariety>B.experienceVariety)
paretoOptimal(X) ⟺ X を支配する候補が無い
```
- **半順序**（全順位でない）。同値（全軸等しい）は互いに非支配 → 双方 frontier。
- **客観的・説明可能**: 「B は A に支配される（A は安く・疲れにくく・変化も多い、距離は同じ）→ B を A より選ぶ理由が無い」= 人間レベルの剪定支援（決定はしない）。
- 軸は **shared-safe な factual tradeoff のみ**（private 制約を dominance 理由にしない）。

### 2.4 出力契約（server-only advisory overlay・reorder しない）

```
// 設計スケッチ（未実装）
interface CandidateDominanceOverlay {
  outcome: "candidate_dominance_overlay";
  serverOnly: true;
  authoritative: false;
  advisory: true;                 // ★ 推奨/決定でない・collection を変更しない
  // 入力 collection と **同じ id 集合・同順**（reorder しない）
  entries: CandidateDominanceEntry[];
  paretoOptimalIds: string[];     // frontier
}
interface CandidateDominanceEntry {
  candidateId: string;
  dominatedBy: string[];          // 自分を支配する candidateId（空=frontier）★ proposal lane と同語彙
  paretoOptimal: boolean;
  axisAdvantage?: TradeoffAxisDelta[];  // 任意・shared-safe な per-pair 軸差（説明用）
}
// helper（pure・no reorder・no scalar）:
//   computeCandidateDominance(draft: CandidateCollectionDraft): CandidateDominanceOverlay
```
- **`CandidateCollectionDraft.ranked:false` を反転しない**・collection を mutate/reorder しない（overlay は別物）。
- **scalar score・rank 番号・total order を持たない**。
- proposal lane の `dominatedBy/paretoOptimal` **語彙を再利用**（一貫）。ただし **述語は tradeoff 軸**（proposal lane の softMatch/stretch とは別）・**型は別**（候補レーン専用）。

### 2.5 既存 2 レーンとの関係（reconciliation）

- **CoAlter pareto を使わない**（別の candidate 型・test-only・C3 の "core-types only" 規律に反する）。
- **proposal lane の `decide` に流し込まない**（decide は proposal-set の推奨。候補レーンは **choice-preserving** を維持）。**Bundle 2 は decision-core に配線しない**。
- 候補レーン dominance は **独立 advisory overlay**。proposal lane / CoAlter pareto との統合は**より大きな別判断（HOLD）**。

### 2.6 advisory & agency（最重要）

Bundle 2 は **してはいけない**: auto-accept / auto-insert / auto-promote / collection の silent reorder / booking・executionAuthority 付与 / ユーザー選択の上書き / decision-core 配線。
**してよい**: Pareto frontier 計算 / dominated を **理由付きで** マーク / per-pair tradeoff 説明 / （将来）ユーザー優先軸での **filter/highlight**（決定でなく強調）。

### 2.7 privacy

- dominance は **shared-safe tradeoff 軸のみ**で計算。
- `forced_by_private_constraint` 等の private を **dominance 理由にしない**（shared rationale に漏らさない）。
- overlay は server-only。client へは **別の shared-safe display projection**（rank 番号/ladder でなく「比較メモ」自然文）でのみ出す。

### 2.8 display（B2-D・後続）

- D の `DisplayCandidateCard` に **任意の自然文ノート**を足す（例: 「比較上の弱点はありません」/「他に明確に優る候補があります」）。
- ★ **rank 番号/順位 badge/`ranked` machine text を出さない**（D の補正方針を踏襲）。frontier かどうかを **語**で控えめに示すに留める。
- dev preview は既存 flag 再利用・fixture・default OFF。

### 2.9 実装オプション（設計後・CEO 承認で着手）

| 案 | 内容 | 評価 |
|---|---|---|
| **B2-A. pure dominance overlay types** | `CandidateDominanceOverlay` / `CandidateDominanceEntry` / `TradeoffAxisDelta` | 推奨バンドル要素 |
| **B2-B. pure dominance helper** | `computeCandidateDominance`（Pareto 半順序・no reorder・no scalar・shared 軸） | 推奨バンドル要素 |
| **B2-C. tests** | Pareto 述語 golden / frontier / 同値 / reorder しない / scalar なし / private 非混入 / source-contract | 推奨バンドル要素 |
| B2-D. shared-safe dominance display + dev preview | 自然文ノート・rank 非表示 | 後 |
| B2-E. engine/decision-core wiring | decide への配線 | **HOLD** |

**推奨次スライス: B2-A + B2-B + B2-C（pure・advisory・未配線・reorder/scalar なし）。** または multi-candidate generation 不在を理由に **Bundle 2 全体を HOLD** のまま別領域（C4-D 等）へ — **CEO 判断**。

### 2.10 将来 test（B2-A/B/C 着手時）

- Pareto 述語: A が全軸≥かつ 1 軸>で B を支配 / 同値は互いに非支配 / frontier = 非支配集合。
- **collection を reorder しない**（entries は入力同順・`ranked:false` 不変）。
- **scalar score / rank 番号 / total order を持たない**（overlay に rank field なし）。
- private（forced_by_private_constraint 等）が dominance 理由に**混入しない**。
- decision-core / acceptance / booking / executionAuthority に**触れない**。
- CoAlter pareto を**呼ばない/ import しない**。
- 0..1 candidate でも安全（1 件 = frontier・空 = 空 overlay）。
- fetch/API/DB/Supabase import なし・pure。
- **tsc baseline 不変（55）**・既存 travel tests green。

### 2.11 Stop

- 本書（Closeout + Bundle 2 Design）で**停止**。
- Bundle 2 実装は **CEO 承認まで行わない**。

---

## 出力サマリ

- **Closeout**: envelope→C2→C3→C4→D の候補/表示 foundation 完成（全 pure・未配線・7 firewall 確立・tsc 55・full suite green）。HOLD = C4-D / Bundle 2 / acceptance / booking / persistence / production `/plan`。
- **Bundle 2 設計の核**: 候補レーンに **Pareto 半順序 dominance を advisory overlay として**導入（scalar/総順位/「best」を作らない＝汎用最適化器にしない・agency 保全）。`CandidateDominanceOverlay`(server-only・advisory・**reorder しない**・`dominatedBy`/`paretoOptimal` 語彙再利用・tradeoff 軸述語)。decision-core 非配線・CoAlter pareto 不使用・private 非混入・shared-safe display は rank 非表示の自然文ノート。
- **前提確認**: multi-candidate generation 不在ゆえ実 ranking 価値は限定 → 実装は **B2-A/B/C（pure advisory・未配線）** に留めるか **Bundle 2 全体 HOLD**（CEO 判断）。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
