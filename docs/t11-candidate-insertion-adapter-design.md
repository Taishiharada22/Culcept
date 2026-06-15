# C4 — Candidate Insertion Adapter Design（docs-only）

> 設計フェーズ。**コード変更なし**（docs/decision-log のみ）。実装は CEO 承認後に別 slice。
> 上位文脈: `docs/t11-candidate-insertion-preflight.md`（二段 gate）/ C2 conversion types / C3 converter helper の次段。
> 原則: ①前提を疑う ②自立推論+grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等推論 ⑦人間超え革新 ⑧世界トップシェア。

---

## 0. grounding（前提を固定する事実）

| 事実 | 出典 | 含意 |
|---|---|---|
| `TravelCorePlan` は pure type・**未配線・consumer ゼロ** | core-types.ts:279 | insert する器が runtime に無く、読む層も無い |
| `candidates[]` の唯一の比較器 Pareto は **別型 `RankedCandidate[]`** を取る・未配線 | lib/coalter/travel/pareto.ts | 「insert→自動 ranking」は現状起きないが将来繋ぐと起きる |
| **`TravelCandidate` 2 種**（core-types vs CoAlter） | core-types.ts:243 / lib/coalter/travel/types.ts:346 | insert 先は **core-types 版のみ**。CoAlter 版（rationale=perUserA/synthesis 等）は拒否 |
| C3 が **core-types TravelCandidate を構築済み** | travel-candidate-conversion.ts | `Converted.candidate` が初めて「rich/rankable/insertable」な実体になった |

→ **insertion は「初めて実体化した rich candidate を、保管/表示の集合に置く」越境**。器も consumer も無い今、**adapter は『プラン状態でない保管ドラフト』を作るに留め、実 TravelCorePlan 反映は HOLD**。

---

## 1. まず前提を疑う — 次は本当に insertion adapter か？

| 候補 | いま着手すべきか |
|---|---|
| **A. insertion adapter design**（本書） | **docs-only として推奨**。境界 chain（envelope→converter→adapter→collection）を閉じる。ただし実 insert は HOLD |
| B. Bundle 2 ranking design | **後**。ranking は collection を読む層。器/consumer 未配線で時期尚早 |
| C. S5 replanning design | **後**。入力は受理/保存 candidate。collection 境界未確定なら入口が浮く |
| D. scheduled draft candidate **display preview** | **product 価値は最有力**。実体化した candidate/draft を「ユーザーが見る」方がゴール（予約直前まで・agency）に直結 |

**推奨: A を docs-only で実施（境界 chain を閉じる）。ただし次の BUILD は D が有力で、CEO 選択。**
根拠（①⑤）:
- C3 で rich candidate が実体化した今、「どこに・どんな順で・何を拒否して置くか」を**先に固定**するのは firewall-first の一貫方針。adapter 設計は docs-only で安価。
- だが grounding 上 **collection を読む consumer が無い**。insert 自体は「読み手が現れるまで」価値が出ない。よって **adapter の実装は最小（CandidateCollectionDraft 生成のみ・TravelCorePlan 非変更）に留め**、multi-candidate UX か Bundle 2 が来るまで実 plan 反映は HOLD。
- **D（display preview）は「実体化した成果をユーザーに見せる」= ゴール直結の次 BUILD** として強く推す。A の設計を終えた上で、CEO が「次は D」を選ぶのが自然。

---

## 2. Closeout summary（完成 / HOLD）

| 部品 | 状態 |
|---|---|
| `ScheduledDraftCandidateEnvelope` (A+B) | ✅ 非挿入 envelope・server-only |
| `TravelCandidateConversionInput` / types (C2) | ✅ factual/interpretive 分離契約・構築しない |
| `convertScheduledDraftEnvelopeToTravelCandidate` (C3) | ✅ 完全明示入力 → core-types TravelCandidate 構築（`Converted`・**未挿入**・捏造禁止） |
| **candidate insertion adapter** | 🔴 **HOLD**（本書で gate 設計のみ） |
| TravelCorePlan への実反映 | 🔴 **HOLD** |
| ranking/dominance（Bundle 2）/ acceptance / persistence / booking / production `/plan` | 🔴 **HOLD** |

**完成 = 「envelope → 明示 converter → core-types TravelCandidate 構築」まで（未挿入）。**

---

## 3. insertion risk の定義

- C3 は now **core-types TravelCandidate** を産める。
- TravelCandidate は **rich/rankable/insertable**。
- `TravelCorePlan.candidates[]` への投入は**新しい越境**。
- insert は **ranking を含意しない**。
- insert は **acceptance を含意しない**。
- insert は **persistence を含意しない**。
- insert は **booking/calendar/action 権限を含意しない**。

---

## 4. 許可される insertion 入力

- **完成 core-types `TravelCandidate` のみ**。
- 次は**不可**:
  - `ScheduledDraftCandidateEnvelope`
  - `TravelCandidateConversionInput`
  - `TravelCandidateConversionResult` / `…Outcome`（**ただし `outcome:"converted"` から server-side で `.candidate` を抽出済みの場合のみ可**）
  - `DisplayScheduledItinerary`
  - raw `ScheduledTravelItineraryDraft`
  - **CoAlter `TravelCandidate`**
  - raw `FitResult`

## 5. 禁止される insertion 入力

- `no_candidate`
- `conversion_rejected`
- `conversion_ready`（candidate 未構築）
- `ScheduledDraftCandidateEnvelope`
- `DisplayScheduledItinerary`
- CoAlter `TravelCandidate`
- raw `FitResult`
- private diagnostics
- booking/calendar 結果
- live route/weather/place 結果

---

## 6. insertion adapter 出力オプション（§6）

| 案 | 内容 | 評価 |
|---|---|---|
| A. pure insertion **plan** のみ | 「何を append するか」の記述だけ（集合を作らない） | 単独だと薄い。C と併用なら可 |
| B. in-memory **TravelCorePlan copy** に append | 入力を非変更で新 TravelCorePlan を返す | **後**。TravelCorePlan は consumer 向け本番状態に近い → firewall が緩む |
| **C. `CandidateCollectionDraft` envelope** | server-only・非権威・**非 ranked** の保管ドラフトに候補を保持 | ◎ **採用**。TravelCorePlan でない holding area。firewall 維持 |
| D. **直接 TravelCorePlan mutation** | 入力を破壊的に変更 | ✗ 副作用・却下 |

**推奨: C（CandidateCollectionDraft）。** 必要なら A（insertion plan）を C の付随情報として返す。
- **C を B より優先**する理由: B は「本番プラン状態」に一歩踏み込む。C は**明示的に TravelCorePlan でない**保管ドラフト（`outcome` discriminant・`ranked:false`・`authoritative:false`・`serverOnly`）。`CandidateCollectionDraft → TravelCorePlan.candidates[]` の写しは**別の承認ステップ**（C4-D）に隔離。
- **D（mutation）は却下**（pure 原則・変更消失防止）。

### 設計スケッチ（未実装）
```
interface CandidateCollectionDraft {
  outcome: "candidate_collection_draft";
  serverOnly: true;
  authoritative: false;
  ranked: false;                 // ★ 配列順 = 保管/表示順であって ranking でない
  candidates: TravelCandidate[];  // core-types のみ・storage/display order
  // 非所持: dominatedBy/paretoOptimal/rank/accepted/executionAuthority/booking/calendar/planState
}
type CandidateInsertionResult =
  | { outcome: "inserted_into_draft"; serverOnly: true; collection: CandidateCollectionDraft }
  | { outcome: "insertion_rejected"; serverOnly: true; reason: InsertionRejectionReason };
type InsertionRejectionReason =
  | "not_core_types_candidate" | "duplicate_candidate_id" | "empty_candidate_id"
  | "forbidden_input_kind" | "invalid_input";
// helper（pure・immutable append）:
//   insertTravelCandidateIntoCollectionDraft(prev: CandidateCollectionDraft | null, candidate: TravelCandidate): CandidateInsertionResult
```

---

## 7. candidate collection 境界

- **insertion order = 保管/表示順のみ**（≠ ranking）。
- **dominance/pareto なし**。
- **decision-core 消費 HOLD**。
- **重複 candidateId は fail closed**（reject）。
- candidate 型は **core-types TravelCandidate** のみ。
- **CoAlter TravelCandidate は拒否**。

## 8. privacy

- 投入 candidate は **shared rationale が既に安全な場合のみ**含む。
- private viewer rationale（`rationale.forParticipant`）は**スコープ維持**（leak しない）。
- raw private diagnostics なし。**client-only filtering 禁止**（filtering は server 完了）。

## 9. authority

- insert ≠ accepted / ≠ confirmed / ≠ booked。
- insert は `executionAuthority` を**付与しない**。
- booking/calendar は**別 GO**。

## 10. persistence

- **pure insertion plan / CandidateCollectionDraft は DB persistence でない**（in-memory）。
- DB/persistence **HOLD**・migration なし・production `/plan` **HOLD**。

---

## 11. 実装オプション（設計後・CEO 承認で着手）

| 案 | 内容 | 評価 |
|---|---|---|
| **C4-A. insertion adapter types only** | `CandidateCollectionDraft` / `CandidateInsertionResult` / `InsertionRejectionReason` | 推奨バンドル要素 |
| **C4-B. pure insertion-plan helper** | `insertTravelCandidateIntoCollectionDraft`（immutable append・重複/型 fail-closed・TravelCorePlan 非変更） | 推奨バンドル要素 |
| **C4-C. tests** | §12 | 推奨バンドル要素 |
| C4-D. 実 TravelCorePlan copy append | CandidateCollectionDraft → TravelCorePlan.candidates[] 写し | **別承認時のみ・HOLD** |
| Bundle 2 ranking | dominance/pareto | **別・HOLD** |

**推奨次バンドル: C4-A + C4-B + C4-C を 1 slice。** 出力は **CandidateCollectionDraft のみ**（TravelCorePlan 非変更・immutable・重複 fail-closed）。
**ただし** product 価値では **display preview（D, §1）** が次 BUILD として有力 → **どちらを先にやるかは CEO 判断**。

---

## 12. 将来 test（C4-A/B/C 着手時）

- 完成 core-types `TravelCandidate` は受理される。
- `ScheduledDraftCandidateEnvelope` は拒否。
- `conversion_ready`（candidate 未構築）は拒否。
- `conversion_rejected` は拒否。
- `DisplayScheduledItinerary` は拒否。
- **CoAlter `TravelCandidate` は拒否**（型 firewall）。
- raw `FitResult` は拒否。
- **重複 candidateId は fail closed**。
- insertion order は ranking でない（順序を入れ替えても dominance/score を産まない）。
- dominance/pareto フィールドを作らない。
- acceptance/final state を作らない。
- `executionAuthority` なし・booking/calendar/action 権限なし。
- DB/API/fetch/Supabase import なし・pure なら app/UI import なし。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 13. Stop

- 本書（C4 Candidate Insertion Adapter Design）で**停止**。
- insertion adapter 実装は **CEO 承認まで行わない**。

---

## 出力サマリ

- **gate の核**: 完成 core-types `TravelCandidate` のみを受理し、**TravelCorePlan でない `CandidateCollectionDraft`**（server-only・`authoritative:false`・`ranked:false`）へ **immutable に append**。重複 candidateId / 非 core-types / envelope / conversion 中間 / display / CoAlter / FitResult は **fail-closed 拒否**。insertion order ≠ ranking。
- **前提確認**: `TravelCorePlan`/`candidates[]` は**未配線・consumer ゼロ** → adapter は **CandidateCollectionDraft 生成に留め、実 TravelCorePlan 反映（C4-D）と ranking（Bundle 2）は HOLD**。
- **推奨次バンドル**: **C4-A + C4-B + C4-C**（types + pure CandidateCollectionDraft 挿入 helper + tests）。**または** product 直結の **display preview（D）** を先行 — CEO 判断。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。insertion 実装は CEO 承認まで着手しない。
