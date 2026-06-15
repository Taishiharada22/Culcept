# Candidate Collection Display Projection + Dev Preview Preflight（docs-only）

> 設計フェーズ。**コード変更なし**。実装は CEO 承認後に別 slice。
> 上位文脈: C4-A/B/C `CandidateCollectionDraft` の次段。先行事例 = `docs/t11-pipeline-closeout-display-preview-preflight.md`（scheduled-draft DP+PV）。
> 原則: ①前提を疑う ②自立推論+grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等推論 ⑦人間超え革新 ⑧世界トップシェア。

---

## 0. grounding（再利用できる先行資産）

| 資産 | 出典 | 再利用 |
|---|---|---|
| `DisplayScheduledItinerary` / `DisplayDay` / `DisplayNode` / `DisplayTransition`（client-safe・placeRefId 非露出・externalId inert・内部 flag なし） | scheduled-draft-display-types.ts | ★ candidate card の itinerary summary に**再利用**（重複型を作らない） |
| `projectDisplayScheduledItinerary`（bridge→display・HH:MM 決定論・serverOnly/provenance 非露出） | scheduled-draft-display.ts | projection 純度の規約を踏襲 |
| dev preview `/plan/dev-travel-scheduled-draft`（flag `PLAN_FLAGS.travelProjectionPreview`・fixture・read-only・default OFF） | page.tsx / featureFlags.ts | ★ flag/route 規約を**再利用**（新 flag を足さない） |
| `CandidateCollectionDraft`（serverOnly・authoritative:false・ranked:false・candidates: core-types TravelCandidate[]） | candidate-collection-draft-types.ts | projection の唯一入力 |
| `TravelCandidate.rationale: ViewerScopedRationale{shared, forParticipant}` | core-types.ts:233 | ★ **shared のみ表示・forParticipant は private** |

---

## 1. まず前提を疑う — 次は本当に display projection + dev preview か？

| 候補 | いま着手すべきか |
|---|---|
| **A. Candidate Collection display projection + dev preview**（本書） | **推奨**。C4 で「D=display が product 価値最有力」と既に判断。ユーザーが候補を**見る**= agency 直結 |
| B. C4-D TravelCorePlan copy append | **HOLD**。consumer ゼロ・plan 状態へ踏み込む。display は C4-D を要しない |
| C. Bundle 2 ranking design | **後**。display は ranking を出さない方針。先に出すと「順位 UI」と誤認 |
| D. S5 replanning design | **後**。受理/保存 candidate が前提 |

**推奨: A。** 根拠（①⑤）:
- C4 まででサーバ側に「安全な保管ドラフト」が完成。次の自然な前進は**それを安全に見せる**こと。**plan 状態にも ranking にも踏み込まず**、成果をユーザー可視化できる唯一の道。
- 先行 scheduled-draft DP+PV と**同型**（projection + flag-gated fixture preview）。実証済みパターンの一段上（単一旅程 → 候補集合）。低リスク。
- ★ 留意（①）: 現状 upstream は 1 resolution=1 draft なので collection は当面 **0..1 card** になり得る。projection は **0..N を一様に扱い**、**順位/おすすめを含意しない**こと。複数候補が来た時の正本表示面になる。

---

## 2. Closeout summary（完成 / HOLD）

| 部品 | 状態 |
|---|---|
| `ScheduledDraftCandidateEnvelope`（A+B） | ✅ 非挿入 envelope |
| C2 converter types | ✅ factual/interpretive 分離契約 |
| C3 `convertScheduledDraftEnvelopeToTravelCandidate` | ✅ core-types TravelCandidate 構築（未挿入・捏造禁止） |
| C4 `CandidateCollectionDraft` + `addTravelCandidateToCollectionDraft` | ✅ server-only 保管・immutable・非 ranked・TravelCorePlan 非変更 |
| **collection display projection** | 🔴 **HOLD**（本書で設計のみ） |
| dev preview route | 🔴 **HOLD** |
| C4-D TravelCorePlan 反映 / Bundle 2 / acceptance / persistence / production `/plan` | 🔴 **HOLD** |

**完成 = 「core-types TravelCandidate を server-only 保管ドラフトへ安全に追加」まで（client 表示はまだ）。**

---

## 3. display problem の定義

- `CandidateCollectionDraft` は **server-only**（そのまま client に出せない）。
- `TravelCandidate` は rich（rationale/uncertainty/tags/tradeoff を含む）。
- collection 配列順は **保管/表示順**であって **ranking でない**。
- client 表示は **ranking/acceptance/booking/final plan state を含意してはならない**。
- client 表示は **serverOnly/private diagnostics を露出してはならない**。

---

## 4. display-safe 出力契約

```
// 設計スケッチ（未実装）
interface DisplayCandidateCollection {
  status: "candidate_draft_collection";   // ★ draft 提案集合（受理/確定でない）
  cards: DisplayCandidateCard[];           // ★ 配列順 = 表示順・rank でない（rank 番号/badge を持たない）
}
interface DisplayCandidateCard {
  candidateId: string;
  title: string;
  tags: string[];
  rationaleShared: string;                 // ★ ViewerScopedRationale.shared のみ（forParticipant 非露出）
  uncertaintyLabel?: string;               // shared-safe（"high"|"medium"|"low" の表示語）
  tradeoffSummary?: DisplayTradeoffSummary; // shared-safe（cost/distance/fatigue/variety の表示要約）
  reversalNote?: string;                   // shared-safe（cancellable/deadline/fee の表示語）
  itinerary: DisplayCandidateItinerary;     // ★ 既存 DisplayDay[]/DisplayNode を再利用（client-safe）
}
// 非所持: serverOnly / authoritative / ranked / dominatedBy / paretoOptimal / rank /
//   accepted / finalized / executionAuthority / booking / calendar / action /
//   raw FitResult / private diagnostics / TravelCorePlan identity / placeRefId
```

- **rank を可視化も含意もしない**（rank 番号・"おすすめ" badge・並べ替えスコアを出さない）。
- `DisplayCandidateItinerary` は既存 `DisplayDay[]`（HH:MM・place label・externalId inert・placeRefId 非露出）を**再利用**。

---

## 5. 表示してよいもの

- candidate title
- tags
- **shared rationale のみ**（`rationale.shared`）
- itinerary summary（既に display-safe な構造のみ・HH:MM/place label）
- uncertainty summary（shared-safe な表示語）
- tradeoff summary（shared-safe・factual 数値の要約）
- reversal/alternative note（shared-safe）
- draft/proposal wording（「提案・予約/確定/送信/実行は行いません」）

## 6. 表示してはいけないもの

- **private viewer rationale**（`rationale.forParticipant`）— viewer-safe projection が別途無い限り。
- raw solver diagnostics
- raw `FitResult`
- `serverOnly`
- authoritative / internal flag
- `TravelCorePlan.candidates` semantics
- ranking / dominance / pareto
- booking/calendar/action affordance（button/href）
- 外部 link（別 Tier1 safe-links gate 承認まで・externalId は inert）

---

## 7. dev preview preflight

- 隔離 dev route `/plan/dev-travel-candidate-collection`（**later 承認時のみ**）。
- **既存 flag `PLAN_FLAGS.travelProjectionPreview` を再利用**（新 flag を足さない）。
- **fixture のみ**・**default OFF**（OFF→Disabled・render しない）。
- **no production `/plan`**・real data なし・**no API/fetch/DB**。
- **booking/calendar/action button なし**・**no CoAlter/useCoAlter**・**no `/talk`**。

## 8. C4-D との関係

- display projection は **TravelCorePlan copy append を要しない**。
- **C4-D は HOLD**。`TravelCorePlan.candidates[]` は**触れない**。
- preview は **`CandidateCollectionDraft` または display projection のみ**を消費。

## 9. Bundle 2 との関係

- display projection に **ranking/dominance なし**。
- collection 順は **おすすめ順でない**。
- **Bundle 2 は別 GO**。

---

## 10. 将来 test（実装時）

- `CandidateCollectionDraft` → `DisplayCandidateCollection` に投影。
- `serverOnly` を表示しない。
- authoritative/internal flag を表示しない。
- `ranked` は **rank UI を生まない**（rank 番号/badge なし）。
- dominance/pareto フィールドが出ない。
- accepted/final state が出ない。
- `executionAuthority` が出ない。
- booking/calendar/action button なし。
- raw `FitResult` が出ない。
- **shared rationale は出る**。
- **private rationale（forParticipant）は出ない**（viewer-safe projection を明示追加しない限り）。
- fetch/API/DB/Supabase import なし・pure projection は app/UI import なし。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 11. 実装オプション（設計後・CEO 承認で着手）

| 案 | 内容 |
|---|---|
| **D1. pure display projection types** | `DisplayCandidateCollection` / `DisplayCandidateCard` / `DisplayTradeoffSummary`（DisplayDay 等は再利用） |
| **D2. pure projection helper** | `projectDisplayCandidateCollection(draft: CandidateCollectionDraft): DisplayCandidateCollection`（shared のみ・private/serverOnly 除去・rank 非生成） |
| **D3. projection tests** | golden + 非露出 + private 除去 + source-contract |
| **D4. fixture dev preview route** | `/plan/dev-travel-candidate-collection`（flag 再利用・fixture・read-only・OFF→Disabled） |
| **D5. render / source-contract tests** | renderToStaticMarkup・no button/href/external・disclaimer |
| C4-D TravelCorePlan copy append | **HOLD** |

**推奨次バンドル: D1+D2+D3+D4+D5 を 1 slice（split 許可）。** 先行 scheduled-draft DP+PV と同型で実証済み・低リスク（flag-gated/fixture/read-only）。projection（D1-3）が firewall の核なので、保守的にやるなら D1-3 先行 → D4-5 でも可。

---

## 12. Stop

- 本書（Candidate Collection Display Projection + Dev Preview Preflight）で**停止**。
- display projection / dev preview の実装は **CEO 承認まで行わない**。

---

## 出力サマリ

- **projection の核**: `CandidateCollectionDraft`（server-only）→ `DisplayCandidateCollection`（`status:"candidate_draft_collection"`・cards）。**shared rationale のみ**・**`forParticipant`（private）非露出**・serverOnly/authoritative/ranked/dominance/FitResult/placeRefId 非露出・**rank を可視化も含意もしない**・booking/href なし。itinerary は既存 `DisplayDay`/`DisplayNode` を**再利用**。
- **dev preview**: `/plan/dev-travel-candidate-collection`・**既存 flag 再利用**・fixture・default OFF・read-only・no API/DB/CoAlter/talk/booking。
- **前提確認**: C4-D（plan 反映）/ Bundle 2 / acceptance を待たず実施可。display は **CandidateCollectionDraft のみ**消費し plan 状態に踏み込まない。
- **推奨次バンドル**: **D1–D5 を 1 slice（split 許可）**。scheduled-draft DP+PV と同型・低リスク。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
