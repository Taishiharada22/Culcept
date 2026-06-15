# B2-D — Dominance Display Projection + Dev Preview Preflight（docs-only）

> 設計フェーズ。**コード変更なし**。実装は CEO 承認後に別 slice。
> 上位文脈: B2-A/B/C `CandidateDominanceOverlay`（Pareto advisory）+ D-phase `DisplayCandidateCollection` の次段。
> 原則: ①前提を疑う ②自立推論+grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等推論 ⑦人間超え革新 ⑧世界トップシェア。

---

## 0. grounding（再利用資産）

| 資産 | 出典 | 役割 |
|---|---|---|
| `DisplayCandidateCollection` / `DisplayCandidateCard`（client-safe・card 順 = 表示順・rank なし） | candidate-collection-display-types.ts | dominance note の貼付先（順序保持） |
| `CandidateDominanceOverlay`（server-only・advisory・`dominatedBy`/`paretoOptimal`/`axisDeltas`・入力順・scalar/rank なし） | candidate-dominance-types.ts | dominance の正本入力 |
| D-phase 補正方針（`ranked:false` を UI に出さず自然文・rank 番号/badge 禁止） | dev-travel-candidate-collection | wording 規約を踏襲 |
| 既存 flag `PLAN_FLAGS.travelProjectionPreview` | featureFlags.ts | dev preview 再利用 |

---

## 1. まず前提を疑う（①）

| 候補 | いま着手すべきか |
|---|---|
| **A. B2-D dominance display projection + dev preview**（本書） | **推奨**。advisory dominance を「順位でない比較メモ」として**安全に可視化**。agency 保全の総仕上げ |
| B. B2-E engine/decision-core wiring | **HOLD**（CEO 明示）。multi-candidate generation 不在 |
| C. C4-D TravelCorePlan reflection | **HOLD**（consumer ゼロ） |
| D. S5 replanning | **後**（受理/保存 candidate 前提） |

**推奨: A（docs-only 設計）。** 根拠（①⑤）:
- dominance overlay は計算できるが**まだ見えない**。B2-D は「frontier/dominated を**順位化せず**トレードオフ説明として見せる」= ゴール（自分の本当の選択肢を理解＝agency）に直結。display-only で低リスク。
- ★ 留意（①）: 現状 collection は **0..1 candidate** → 比較メモは当面「**比較対象がまだありません**」になり得る。projection は 0/1 を安全に扱い、複数時のみ意味を持つ。fixture preview は 2+ candidate の見え方を実証できる。
- B2-E/C4-D は CEO 明示 HOLD・依存先未成熟 → 後。

---

## 2. Closeout summary（完成 / HOLD）

| 部品 | 状態 |
|---|---|
| `CandidateCollectionDraft`（C4） | ✅ server-only 保管・ranked:false |
| `DisplayCandidateCollection`（D） | ✅ client-safe・card 順=表示順・rank なし |
| `CandidateDominanceOverlay`（B2-A/B/C） | ✅ Pareto advisory・reorder/scalar なし・private 非混入 |
| **dominance display projection** | 🔴 **HOLD**（本書で設計のみ） |
| dev preview（dominance note） | 🔴 **HOLD** |
| B2-E wiring / C4-D 反映 / acceptance / booking / persistence / production `/plan` | 🔴 **HOLD** |

**完成 = 「候補を client-safe に表示でき、dominance を server-only advisory として算出できる」まで（比較メモ表示はまだ）。**

---

## 3. display problem の定義

- `CandidateDominanceOverlay` は **server-only / advisory**。
- `dominatedBy`/`paretoOptimal` を**素朴に出すと ranking に見える**。
- collection 表示順を**変えてはならない**。
- frontier を **「best」と見せない**・dominated を **「bad」と見せない**。
- 表示は **agency を保つ**（決定・推奨・自動選択でない）。

---

## 4. 許可される表示意味

- 「比較メモ」
- 「この候補は比較上まだ検討に値します」
- 「他の候補に明確に優る/劣る軸があります」
- 「順番はおすすめ順位ではありません」
- 「これは自動決定ではありません」
- 「予約・確定・送信・実行は行いません」

## 5. 禁止される表示意味

- rank #1 / #2 ・ best / worst ・ winner / loser
- recommended order ・ score ・ total ranking
- auto-selected ・ accepted ・ bookable / schedulable / executable

---

## 6. display-safe 出力契約

```
// 設計スケッチ（未実装）
type DominanceNoteKind =
  | "no_clear_weakness"            // frontier: 比較上、明確に劣る軸なし
  | "has_clearly_stronger_alternative" // dominated: 他に明確に優る軸あり
  | "not_comparable_yet";          // 0/1 or 比較対象なし

interface DisplayCandidateDominanceNote {
  candidateId: string;
  kind: DominanceNoteKind;
  /** 自然文（best/worst/rank/score を含まない・「順位ではありません」を含む） */
  text: string;
  /** dominated 時のみ・劣る軸の自然文ラベル（shared-safe・id を出さない） */
  weakerAxes?: string[];           // 例 ["費用","疲労"]（"Pareto"/dominator id を出さない）
}

interface DisplayCandidateComparison {
  status: "candidate_comparison_memo";
  /** 「順番はおすすめ順位ではありません」「これは自動決定ではありません」 */
  orderDisclaimer: string;
  /** ★ card 順を保持した per-card note（対応 candidate 順） */
  notes: DisplayCandidateDominanceNote[];
}
// 非所持: score / rank 番号 / totalOrder / executionAuthority / booking / calendar /
//   accepted / finalized / serverOnly / private diagnostics / 生 dominatedBy id list / CoAlter Pareto field
```

- **生 `dominatedBy` id list を出さない**（ranking に見えるため）。代わりに **kind + 自然文 + weakerAxes（軸名）**。
- weakerAxes は overlay の `axisDeltas`（worse 軸）から **日本語軸名**へ写す（費用/移動距離/疲労/体験の幅）。dominator id・「Pareto」は出さない。

---

## 7. projection relationship

- 入力 = **`DisplayCandidateCollection` + `CandidateDominanceOverlay`**（candidateId で join）。
- 出力は **DisplayCandidateCollection の card 順を保持**（notes も同順）。
- per-card に comparison note を**付与してよい**。
- **card を sort しない**・**dominated card を除去しない**・**frontier/非frontier を rank で隠さない**。
- **`CandidateCollectionDraft` を mutate しない**（projection は read-only）。

---

## 8. wording strategy

- frontier: 「best」を避ける → **「比較上、明確に劣る軸はありません」**。
- dominated: 「bad」を避ける → **「他候補の方が明確に優る軸があります（◯◯）」** + **「ただし、これは順位ではありません」**。
- 0/1 candidate: note 無し or **「比較対象がまだありません」**（not_comparable_yet）。
- **「Pareto」は一般ユーザーに出さない**（コード/コメント/dev 内部のみ）。

---

## 9. dev preview preflight

- 隔離 dev route（later 承認時のみ）: **既存 `/plan/dev-travel-candidate-collection` を拡張** or 兄弟 route `/plan/dev-travel-candidate-comparison`。
- **既存 flag `PLAN_FLAGS.travelProjectionPreview` 再利用**（新 flag なし）。
- **fixture のみ・default OFF**・no production `/plan`・real data なし・**no API/fetch/DB**・**no CoAlter/useCoAlter**・**no `/talk`**・**booking/calendar/action button なし**。

## 10. B2-E との関係

- B2-D は **display-only**。**engine/decision-core 配線なし**。**B2-E は HOLD**。dominance overlay は **advisory のまま**。

## 11. C4-D との関係

- **TravelCorePlan reflection 不要**。**C4-D は HOLD**。preview は **display collection + overlay のみ**消費。

---

## 12. 将来 test（実装時）

- display notes は **入力 card 順を保持**。
- frontier candidate に **「best」を出さない**。
- dominated candidate に **「worst」を出さない**。
- rank 番号 / score / total order / 「recommended order」を出さない。
- **dominated card は表示され続ける**（除去しない）。
- 0 candidate → 比較 note 無し/空。
- 1 candidate → ranking note 無し（not_comparable_yet）。
- 自然文が「**比較は順位ではない**」と明示。
- executionAuthority なし・booking/calendar/action button なし。
- serverOnly/authoritative text なし・raw FitResult なし・private rationale なし。
- CoAlter Pareto field なし・生 dominatedBy id list を出さない。
- fetch/API/DB/Supabase import なし・pure projection は app/UI import なし。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 13. 実装オプション（設計後・CEO 承認で着手）

| 案 | 内容 |
|---|---|
| **B2-D1. pure display dominance note types** | `DisplayCandidateDominanceNote` / `DisplayCandidateComparison` / `DominanceNoteKind` |
| **B2-D2. pure projection helper** | `projectCandidateComparisonMemo(collection, overlay)`（card 順保持・kind→自然文・weakerAxes 軸名・生 id 非露出） |
| **B2-D3. tests** | 順序保持 / best・worst 不出 / rank・score なし / dominated 残存 / 0・1 / 自然文 / source-contract |
| **B2-D4. fixture dev preview integration** | 既存 route 拡張 or 兄弟 route（flag 再利用・fixture・OFF→Disabled） |
| **B2-D5. render / source-contract tests** | rank 非表示・best/worst なし・booking/href なし・private 非表示・順序保持 |
| B2-E engine/decision wiring | **HOLD** |

**推奨次バンドル: B2-D1 + B2-D2 + B2-D3（pure）を 1 slice、続けて B2-D4 + B2-D5（dev preview + render）。** split 許可。先行 D-phase と同型・低リスク。projection（D1-3）が firewall 核。

---

## 14. Stop

- 本書（B2-D Dominance Display Projection + Dev Preview Preflight）で**停止**。
- display projection / dev preview の実装は **CEO 承認まで行わない**。

---

## 出力サマリ

- **projection の核**: `DisplayCandidateCollection` + `CandidateDominanceOverlay` → `DisplayCandidateComparison`（per-card 自然文 note・**card 順保持・sort/除去なし**）。frontier=「劣る軸なし」/ dominated=「他に優る軸あり（◯◯）＋順位ではない」/ 0・1=「比較対象がまだありません」。**生 dominatedBy id・rank 番号・score・best/worst・「Pareto」（一般向け）を出さない**。
- **dev preview**: 既存 route 拡張 or 兄弟 route・**既存 flag 再利用**・fixture・default OFF・read-only・no API/DB/CoAlter/talk/booking。
- **前提確認**: B2-E / C4-D は HOLD（CEO 明示）。B2-D は display-only で advisory を安全に可視化。0..1 candidate ゆえ当面「比較対象なし」表示になり得るが、fixture で複数時を実証。
- **推奨次バンドル**: **B2-D1+D2+D3 → B2-D4+D5**（split 許可）。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
