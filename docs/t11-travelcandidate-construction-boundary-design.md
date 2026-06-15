# TravelCandidate Construction Boundary Design（docs-only）

> 設計フェーズ。**コード変更なし**。実装は CEO 承認後に別 slice で行う。
> 上位文脈: `docs/t11-pipeline-closeout-display-preview-preflight.md`（AB bridge / display projection / dev preview）の次段。
> 原則: ①前提を疑う ②自立推論+grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算。

---

## 1. まず前提を疑う — 次にやるべきは本当にこれか？

CEO 指定は「TravelCandidate construction boundary」。だが先に S5 / Bundle 2 / auth smoke の可能性も比較する。

| 候補 | 内容 | いま着手すべきか |
|---|---|---|
| **A. TravelCandidate construction boundary**（本書） | scheduled draft → candidate 化の「境界線」を定義（構築ロジックそのものではない） | **推奨・先行**。理由↓ |
| B. S5 minimal-perturbation replanning | 受理済み draft の再計画 | **後**。S5 の入力は「受理/保存された candidate」。candidate 境界が未定義なら S5 の入口が浮く |
| C. Bundle 2 fit dominance/ranking | fit を ranking に昇格 | **後**。ranking が candidate を消費する以上、何が candidate になり得るかの境界が先 |
| D. auth-gated live visual smoke | local session で目視 | **直交・retriable**。CEO 既決で Travel 進行を block しない |

**推奨: A を先行（docs-only）。** 根拠 = grounding で判明した危険:
`TravelCandidate`(core-types.ts:243) は **ranking/dominance/decision が消費する rich 型**で、`TravelCorePlan.candidates[]` に入る。
つまり「draft を candidate にする」を**ロジック先行で作ると、ranking/insertion に静かに接続するリスク**がある。
S5 も Bundle 2 も「candidate とは何か／どこまでが構築でどこからが昇格か」に依存する。
→ **境界（firewall）を先に確定**するのが最も de-risk になる。CEO 指定に同意。

---

## 2. Closeout summary（いま完成しているもの）

| 部品 | 状態 | 正本 |
|---|---|---|
| `ScheduledTravelItineraryDraft` | ✅ pure・`authoritative:false`/`draft:true`・候補でない | assembly-types.ts:33 |
| AB bridge (`bridgeAssemblyCandidate`) | ✅ pure・server-only envelope（4 gate）→ `AssemblyBridgeResult` | solver-assembly-bridge.ts |
| display projection (`projectDisplayScheduledItinerary`) | ✅ pure・`status:"draft_proposal"`・内部 flag/provenance/placeRefId 非露出・externalId inert | scheduled-draft-display.ts |
| dev preview (`/plan/dev-travel-scheduled-draft`) | ✅ flag-gated・read-only・unit/render/source-contract green | DP3 9 + PV2 11 |
| live visual smoke | 🟡 **HOLD**（auth gate・retriable・regression なし） | 本セッション報告 |

**完成 = 「server-only scheduled draft envelope を作り、安全に draft_proposal として表示投影できる」ところまで。**

---

## 3. 現在の gap

- bridge は server-only scheduled draft envelope を**産出できる**。
- display projection は draft proposal を**安全に render できる**。
- **しかし**:
  - TravelCandidate 構築 = **HOLD**（draft は candidate でない）
  - `TravelCorePlan.candidates` への insertion = **HOLD**
  - ranking / dominance = **HOLD**（`ProposalComparisonEntry.dominatedBy/paretoOptimal` に未接続）

gap の本質: scheduled draft と `TravelCandidate` の間に**型・権限・接続の段差**がある。本書はその段差を**明示的境界**として定義する（埋めるロジックは作らない）。

---

## 4. TravelCandidate construction problem の定義

守るべき不変:

1. **`ScheduledTravelItineraryDraft` は `TravelCandidate` ではない。** 別物として扱う（構造的にも代入不可にする）。
2. **draft proposal は受理済み plan ではない。** 提示であって採用でない。
3. candidate は **booking/action 権限を含意してはならない**（`executionAuthority`/booking/calendar フィールドを持たない）。
4. candidate construction は **暗黙に rank/promote してはならない**（dominance/pareto/順位を産出しない）。
5. candidate construction は **plan state に insert してはならない**（`candidates[]` を触らない）。

→ ゴール（⑤）「予約直前まで・agency 保全」と整合: candidate 化は「ユーザーの選択を rankable な序列に勝手に流し込む」行為であってはならない。

---

## 5. 許可される入力（allowed input）

- **server-side `ScheduledTravelItineraryDraft` bridge envelope**（`AssemblyBridgeResult` の `outcome:"scheduled_draft"` 側）。**唯一の正本入力**。
- 既知の **proposal id / candidate id**（draft 内 `candidateId` を踏襲）。
- **bounded な advisory summary のみ**（既に shared-safe に縮約済みの場合に限る）:
  - `fitSummary`（= 既存 `ProposalFitSummary` 相当の advisory・raw でない）
  - `readinessSummary`（state/actionKind の縮約のみ・raw `ReadinessResult` でない）
- display-safe projection は **UI 用途のみ**。candidate 構築の入力にはしない。

## 6. 禁止される入力（forbidden input）

- raw client display packet
- `DisplayScheduledItinerary` を**権威入力にすること**（client view は source of truth でない）
- `no_draft` 結果（→ candidate にできない）
- 未解決 S4 結果（`AssemblyInputCandidate` 以前の中途）
- rejected selection
- **raw `FitResult`**（fit-types.ts:702・内部 components/hardBlocks/perParticipant を持つ）
- private diagnostics（solver reason / private narrowing / `forced_by_private_constraint`）
- live route/weather/place data
- booking/calendar 結果

---

## 7. candidate output 境界（output boundary）

新規の**server-only 中間型**を 1 つだけ定義する（実装は後）。`TravelCandidate` とは**別の discriminant** を持たせ、構造的に区別する。

```
// 設計スケッチ（未実装）
interface ScheduledDraftCandidate {
  outcome: "scheduled_draft_candidate";   // ★ TravelCandidate にない discriminant → 構造的に別物
  serverOnly: true;                        // ★ client/shared payload でない
  authoritative: false;                    // ★ 実行権限でない
  draft: true;                             // ★ 受理済みでない
  candidateId: string;                     // draft の candidateId を踏襲
  draftEnvelope: ScheduledTravelItineraryDraft;  // bridge envelope をそのまま保持
  fitSummary?: ProposalFitSummary;         // 任意・advisory のみ（bounded・raw FitResult でない）
  readinessSummary?: ScheduledReadinessSummary;  // 任意・state/actionKind の縮約のみ
  // ★ 持たない: title/tags/tradeoff/constraints/rationale/uncertainty/reversal
  // ★ 持たない: dominatedBy/paretoOptimal/順位（ranking position）
  // ★ 持たない: executionAuthority/booking/calendar/acceptance/final plan state
}
type ScheduledDraftCandidateResult =
  | ScheduledDraftCandidate
  | { outcome: "no_candidate"; serverOnly: true; reason: NoCandidateReason };
```

境界の明示:
- **`candidates[]` への insertion なし**（このフェーズで `TravelCorePlan.candidates` を touch しない）。
- **ranking position なし** / **dominance/pareto 変化なし**。
- **`executionAuthority` なし** / **booking/calendar/action 権限なし**。
- **acceptance state なし** / **final plan state なし**。

**型 firewall（②③）**: `ScheduledDraftCandidate` は `TravelCandidate` の必須フィールド（`title`/`tags`/`tradeoff`/`constraints`/`rationale`/`uncertainty`）を**持たない**ため、`candidates: TravelCandidate[]` に代入すると TS が弾く。discriminant `outcome` も加え、二重に別物化する。

---

## 8. 分離し続けるもの（must remain separate）

各々が**別フェーズ・別 gate**。1 つの関数に束ねない:

1. candidate construction（本書が境界定義）
2. candidate insertion（→ `candidates[]`・**HOLD**）
3. candidate ranking（dominance/pareto・**HOLD**）
4. user acceptance（受理状態・**HOLD**）
5. booking/calendar（**HOLD**・Tier1 gate）
6. S5 replanning（**HOLD**）
7. production `/plan`（**非接触**）
8. persistence（DB/Supabase・**HOLD**）

---

## 9. プライバシー

- `ScheduledDraftCandidate` は **server-side でよい**（`serverOnly:true`）。
- **shared/client 投影は別物**（必要時は display projection 経由＝既存 `DisplayScheduledItinerary` のみが client-safe view）。
- private fit/readiness/solver reason を**漏らさない**:
  - `fitSummary`/`readinessSummary` は **shared-safe に縮約済みのものだけ**を carry（raw 不可）。
  - `forced_by_private_constraint` 等は server-only のまま、shared では `"constrained"` 等に写す（既存規約踏襲）。
- **client-only privacy filtering は禁止**（filtering は server 側で済ませる）。
- 現時点で **client-safe view は display projection のみ**。`ScheduledDraftCandidate` をそのまま client に出さない。

---

## 10. Bundle 2 との関係

- Bundle 2 は将来 fit/ranking influence を許可し得る（`plan-intelligence-projection-types.ts:102` の `fitAdvisory` は現状 **advisory のみ・ranking/execution 不使用**）。
- **TravelCandidate construction はまだ ranking を変えてはならない。**
- `fitSummary` は **advisory のまま**。candidate に carry しても順位・dominance には**接続しない**。

## 11. S5 との関係

- S5 は将来「受理/保存された scheduled draft または candidate」を消費し得る。
- **S5 は HOLD。**
- candidate construction の中で **replanning しない**（最小摂動再計画は別エンジン）。

---

## 12. 実装オプション（設計後・CEO 承認で着手）

| 案 | 内容 | 評価 |
|---|---|---|
| **A. pure types only** | `ScheduledDraftCandidate` / `*Result` / `NoCandidateReason` / `ScheduledReadinessSummary` 型のみ追加 | firewall を型で固定。だが型だけでは「no_draft→不可」等の挙動を test できない |
| **B. pure construction helper（insertion なし）** | `buildScheduledDraftCandidate(bridge, opts?): ScheduledDraftCandidateResult`。bridge envelope 検証 → 包む。`candidates[]` 非接触・ranking 非産出 | firewall 挙動を test 可能（§13）。pure・未配線 |
| C. candidate insertion preflight（docs-only） | `candidates[]` へ入れる際の前提設計 | **後**（§8-2 HOLD） |
| D. Bundle 2 ranking design（docs-only） | fit→ranking 昇格設計 | **後**（§8-3 / §10 HOLD） |

**推奨バンド: A + B を 1 slice。** 根拠:
- A だけだと firewall の**振る舞い**（no_draft 不可・display 不可・raw FitResult 混入なし）が verify できない。B の pure helper まで入れて初めて test で固定できる。
- B は insertion/ranking/persistence に**一切触れない**ため、scope が外科的（④）で安全。
- C/D は HOLD のまま docs に留置。

---

## 13. 将来実装の test（A+B 着手時に満たす）

- `ScheduledTravelItineraryDraft`（bridge `scheduled_draft`）→ `ScheduledDraftCandidate` に**包めるだけ**（rank/insert しない）。
- `no_draft` → candidate に**できない**（`no_candidate` を返す）。
- `DisplayScheduledItinerary` → candidate の**入力にできない**（型で拒否・source-contract で確認）。
- candidate output に **raw `FitResult` を含まない**（`fitSummary` advisory のみ）。
- candidate output に **ranking/dominance フィールド**（`dominatedBy`/`paretoOptimal`/順位）を**追加しない**。
- **`candidates[]` insertion なし**（`TravelCorePlan` を touch しない）。
- **booking/calendar/action 権限なし**（`executionAuthority`/booking/calendar フィールド不在）。
- **production `/plan` 非接触**。
- **fetch/API/DB/Supabase import なし**。
- pure なら **app/UI import なし**。
- **tsc baseline 不変（55）**。
- **既存 travel tests green 維持。**

---

## 14. Stop

- 本書（TravelCandidate construction boundary design）で**停止**。
- candidate construction の**実装は CEO 承認まで行わない**。

---

## 出力サマリ

- **境界の核**: scheduled draft は `TravelCandidate` でない。両者の間に server-only 中間型 `ScheduledDraftCandidate`（discriminant + 型 firewall）を置き、**construction / insertion / ranking / acceptance / booking / S5 / persistence を全分離**する。
- **推奨実装バンド（CEO 承認後）**: **A（pure types）+ B（pure construction helper・insertion なし）を 1 slice**。C（insertion preflight）/ D（Bundle 2 ranking）は docs-only HOLD。
- **前提確認の結論**: CEO 指定の「境界先行」に同意（S5・Bundle 2 が依存する firewall を先に固定するのが最も de-risk）。
- 本フェーズは **docs-only**。コード/型/テスト変更なし・tsc 55・push なし・production 非接触。
