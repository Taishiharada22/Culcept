# RO-5 — Proposal Surface Contract / UI 併存解消 設計（docs + pure view-model・実 UI 接続なし）

- **status**: 設計 v0.1 + 実装（docs-first + 薄い pure view-model）。**14-agent リサーチ Workflow + 敵対的検証 4 次元（10 mustFix・honesty PASS / double-canonical CONCERN / boundary PASS / non-destructive PASS・FAIL 0）反映**。code 変更は新規 1 ファイル + test のみ・**既存型改変ゼロ・write 0・実 UI/route/page/pipeline 配線なし**
- **CEO GO**: RO-5 GO（2026-06-20・RO-4 着地に続けて・裁定 6 点）
- **lineage**: RO-3（RealityLearningSignalV0）→ RO-4（ProposalRouteSetV0・pure kernel・caller=0）→ 本書。RO-4 decision-log openDecision⑤「UI 併存（empty-day 3案 vs RO-4 3案 同 vocab 2 系統表示）」への構造的回答。
- **核心**: RO-5 = **RO-4 ProposalRouteSetV0 の初の surface consumer**。docs contract + 薄い pure view-model（label adapter）で、(A) 二重正本化回避（copySurface RJ2e / empty-day-reasoning のどちらも改変せず新正本型を作らない）+ (B) **empty-day(組み方) と RO-4(構え) の画面混同防止**（conceptKind を DTO に焼き親分離）を構造達成。

---

## 0. GOAL（北極星）

> 値同形の protect/easy/push が **2 系統**存在する（empty-day = 今日の組み方 / RO-4 = 現実への構え）。consumer 接続前に、両者をユーザー画面で混同させない **surface contract** を確定する。RO-4 を caller=0 のまま永久 dormant にしないための前段。実 UI 実装ではなく **pure view-model + display contract + docs** まで。

到達定義（RO-5 完了 = 全達成）: `buildProposalSurface(set)` が `ProposalRouteSetV0` を読み、internal trace（evidenceRefs/raw id）を一切露出せず、`conceptKind='reaction_stance'` を焼いた表示用 DTO を pure に返す。empty-day/RO-4 の表示意味対照表 + consumer wiring 方針を docs で確定。**RO-5 完了 ≠ 表示完了**（画面に出ていることを意味しない）。

---

## 1. premise 検証結果（Ground・実コード接地）

| premise | 検証 | 証拠 |
|---|---|---|
| RJ2 surface chain は judgment 専用で proposal/3案 を扱わない | **confirmed** | copySurface.ts:16「**no proposal / 3案 / departure**」明示除外。judgmentSurfacePlan.ts:22 proposalCandidateRefs/departureLineRefs は v0 常に []・:254-255 `supp("proposal_hold_v0", "three_option", …)` |
| empty-day は既に protect/easy/push の表示文言を持つ（組み方 framing） | **confirmed** | empty-day-reasoning.ts:42-44 TIER_INTENT_LINE「予定を詰めすぎず余白を残す**組み方**です」等 |
| empty-day と RO-4 は表示 framing が異なる（組み方 vs 構え） | **confirmed** | empty-day=day skeleton 充填度・RO-4=reaction stance（時間ブロックなし・proposalRoute.ts:9「兄弟レーン」） |
| ProposalRouteSetV0 は internal evidenceRefs を含み生表示は不適切 | **confirmed** | proposalRoute.ts:127 `gap_${fromGap}_to_${toGap}`/`anchor_${anchorId}`・:220 routeSetId=`proute:${seed}:${forTarget.id}`（forTarget.id=`trn:<taskId>`・raw node id 包含） |
| RO-5 view-model が RO-4 の初の surface consumer | **confirmed** | buildProposalRoutes/ProposalRouteSetV0 の production caller=0（test のみ） |
| stance→日本語ラベルの写像は RO-5 が新設 | **confirmed** | 既存になし（empty-day の組み方文言は別 framing） |
| pure view-model を realityCore に置く前例 | **confirmed** | dogfoodPreview.ts / operatorDayPreview.ts（safe-DTO + token leak guard 先例） |
| dev-reality-pipeline は dev-gate なしの実 route | **refuted（verifier 誇張の訂正）** | page.tsx:10-11,50-60 で **三重ガード**（REALITY_CANDIDATE_ACTIONS_DEV_HOST + staging ref + 非production→notFound + operator auth + flag `REALITY_PIPELINE_PREVIEW` default OFF）。production で構造的不可視。ただし RO-5 は不接触を維持 |

**核心の含意**: (1) RJ2 chain は proposal を構造除外 → RO-5 は RJ2 の段を増やさず**別レーン**で copySurface の三層防御を**パターンとして mirror**（code 借用でなく規律継承）。(2) empty-day と RO-4 は値同形 protect/easy/push だが framing が異なる → conceptKind で親分離。

---

## 2. positioningDecision — 第3の surface 系統を新設しない別レーン

RO-5 proposalSurface は既存 2 正本が触らない空隙（RO-4 出力の表示化）だけを埋める consumer view。3 正本との棲み分けを構造で確定：

1. **copySurface(RJ2e)との棲み分け = 入力型が直交**。copySurface 入力=`SurfaceProjectionConsumerViewV0`（judgment claim/question）・RO-5 入力=`ProposalRouteSetV0`（proposal stance）。copySurface.ts:16 が「no proposal / 3案」を明示除外。RO-5 は copySurface/surfaceProjection/RJ2a-d を **import も改変もしない**。ただし copySurface の三層防御（exact catalog 固定 lookup / FORBIDDEN_LEXICON walker / serialization backstop）を **pattern として mirror**（proposalSurface 専用 catalog + walker を新設）。
2. **empty-day-reasoning(R2-3)との棲み分け = 出力意味が直交**。empty-day=「組み方（day skeleton 充填度）」・RO-5=「構え（reaction stance・時間ブロックなし）」。RO-5 は `EmptyDayTier/EmptyDayReasoning/TIER_INTENT_LINE` を **import type すらせず**（proposalRoute.ts:17 の独立 re-define discipline 踏襲）、empty-day 文言を複製しない。
3. **RJ2 chain との棲み分け = RJ2 外**。RJ2 は L4 proposal_candidate / L5 three_option を HOLD。RO-4/RO-5 は RJ2 外の独立レーン。RJ2 6 段にも copySurface にも段を追加しない。

**stance 型の正本は一意（mustFix #2）**: RO-5 は `RealityProposalStance`（proposalRoute.ts:35・**RO-4 正本**）を `import type` のみで取り込む。**`RealityProposalStanceV0` 等を新規 re-define しない**（stance vocab の三重化を防ぐ）。

---

## 3. contrastTable — 表示意味対照（empty-day 組み方 vs RO-4 構え）

| 観点 | empty-day（組み方レーン・R2-3・**改変禁止**） | RO-4 ProposalRoute（構えレーン・RO-5 表示化） |
|---|---|---|
| conceptKind（DTO field・親キー） | `day_arrangement`（empty-day 側・RO-5 は持たない） | **`reaction_stance`** |
| concept ラベル（画面見出し） | 「今日の組み方」 | **「今の現実への構え」** |
| 軸の意味 | day skeleton 充填度（時間ブロックをどう詰めるか） | reaction stance（現実が動いた後どう応じるか・ブロックなし） |
| 正本型 | EmptyDayProposal / EmptyDayReasoning | ProposalRouteSetV0（RO-5 は新正本型を作らず DTO へ薄写像） |
| protect | 「予定を詰めすぎず、余白を残す組み方です」 | **「守る構え」** |
| easy | 「回復を優先する、軽めの組み方です」 | **「楽にいく構え」** |
| push | 「前に進めたいこと向けの、動きの多い組み方です」 | **「進める構え」**（mustFix #1: empty-day「前に進めたいこと」と 4-gram 非共有に修正・「攻める」も hedged 化） |
| 入力源 | EmptyDayInput（空き window/energy/weather） | RealityLearningSignalV0（diff/changes/gradients・RO-3 由来） |
| 信頼度 | low\|tentative（high なし） | low\|tentative（high/visible なし・同水準） |
| 推薦 | recommendByEnergy（empty-day 内部） | recommended=null を「推薦なし」と honest（偽推薦なし） |
| 画面位置（将来接続時） | 既存「ALTER で見る ›」内 modal/section | **別 section/別 card**（同一 envelope に co-mingle 禁止） |

**混同防止の核（3 重）**: ①`conceptKind` を DTO に焼く（型名分離だけでは画面 homonym を防げない）②3 stance を別日本語句に写像し語尾「〜構え」で「組み方」と語感分離 ③画面位置を別 section に置き同一 envelope に co-mingle しない。

---

## 4. labelDecision — exact catalog（hedged・FORBIDDEN_LEXICON 非抵触・mustFix #1 反映）

全句 exact catalog 固定 lookup（dynamic interpolation/LLM なし）。copySurface.ts:101-113 の FORBIDDEN_LEXICON に部分一致しないことを機械検証（敵対的検証で 0 collision 確認済み）。**最終文言は CEO 文面承認 gate 通過まで draft**。

```
CONCEPT_LABEL.reaction_stance = "今の現実への構え"        // empty-day「今日の組み方」と親分離
STANCE_LABEL  protect="守る構え" / easy="楽にいく構え" / push="進める構え"   // ★push は「前に進める」を撤回（empty-day echo 回避）
STANCE_INTENT protect="動いた現実を、まず守る向きです"
              easy="負荷が下がった分を、軽く使う向きです"
              push="進める方向に、寄せていく向きです"     // ★empty-day push intent と 4-gram 非共有
BASIS_SUMMARY diff_collapsed="直前に動いた予定と関連があります"
              change_task="この用事に進んだ記録があります"
              gradient_axis="見立てより負荷が下がっている兆しがあります"
CONFIDENCE_LABEL low="参考程度の見立てです" / tentative="暫定の見立てです"
ABSENCE recommendationAbsent="いまは特に推す構えは見当たりません"
        hasNoBasis="この構えの根拠は、いまは見当たりません"
```

**push の「攻める」→「進める構え」** : stance 値は `"push"` のまま保持し**表示ラベルのみ中立化**（値と表示の分離）。**empty-day TIER_INTENT_LINE.push「前に進めたいこと向けの…組み方」との 4-gram 重複ゼロ**（mustFix #1）。

**cross-catalog 4-gram 検証**（mustFix #1）: RO-5 全句 × empty-day TIER_INTENT_LINE 全句の 4-gram 重複ゼロを CEO 文面承認 gate + test の cross-catalog scan で恒常担保（RO-5 walker は自前 whitelist 照合のみで empty-day 衝突を検出しないため別 scan）。

---

## 5. components（proposalSurface.ts・realityCore lineage・新規 1 ファイル）

### ① 型群

```ts
export const PROPOSAL_SURFACE_VERSION = 0;
export type SurfaceConceptKind = "reaction_stance"; // RO-5 は構え固定（組み方=empty-day 側）
export type StanceLabelKey = "protect_label" | "easy_label" | "push_label"; // raw stance 値非露出（homonym 遮断）

export interface ProposalRouteReasonViewV0 {
  readonly basisSummary: string; // basisBucket→BASIS_SUMMARY のみ・evidenceRefs は drop（生表示しない）
}
export interface ProposalRouteCardV0 {
  readonly stanceLabelKey: StanceLabelKey; // raw 'protect'/'easy'/'push' を露出しない
  readonly stanceLabel: string;            // STANCE_LABEL 固定
  readonly intentLine: string;             // STANCE_INTENT 固定 hedged
  readonly reasons: ReadonlyArray<ProposalRouteReasonViewV0>;
  readonly hasNoBasis: boolean;            // reasons 空=true（黙らせない・上位で不在句）
  // ★mustFix #4: card-level confidenceLabel は持たない（RO-4 confidence は route 横断一律＝set-level に集約）
}
export interface ProposalSurfaceViewV0 {
  readonly schemaVersion: 0;
  readonly conceptKind: SurfaceConceptKind;     // ★混同防止の核・必須
  readonly conceptLabel: string;                // CONCEPT_LABEL 固定
  readonly display: "render" | "suppress";
  readonly cards: ReadonlyArray<ProposalRouteCardV0>; // render 時常に 3（protect/easy/push 順）/ suppress 時 []
  readonly recommendedStanceLabelKey: StanceLabelKey | null; // raw stance でなく label key・null=偽推薦なし
  readonly recommendationAbsent: boolean;       // recommended=null を honest に表す
  readonly confidenceLabel: string;             // set 全体 hedged（unresolved 頭打ち反映）
}
```

DTO は **internal-only field を一切含まない**（mustFix #6）: `evidenceRefs / forTarget / routeSetId / unresolvedNotes / ledgerRefsObserved / unresolvedCount`（数値品質指標）を載せない。

### ② exact catalog（const・§4）
`CONCEPT_LABEL / STANCE_LABEL / STANCE_INTENT / BASIS_SUMMARY / CONFIDENCE_LABEL / ABSENCE`。copySurface CLAIM_TEMPLATE 同様の固定 lookup discipline。

### ③ `buildProposalSurface`（pure・初の RO-4 surface consumer）

```ts
export function buildProposalSurface(set: ProposalRouteSetV0): ProposalSurfaceViewV0;
```
- `import type` のみ（`ProposalRouteSetV0/ProposalRouteV0/ProposalRouteReasonV0/RealityProposalStance/RouteConfidence/RouteBasisBucket` from `./proposalRoute`）。
- **`set.routes` を直接 iterate**（mustFix #9: RO-4 が proposalRoute.ts:209 で常に 3・protect/easy/push 順を保証 → `PROPOSAL_STANCES` runtime const を import せず順序を信頼。walker で順序検証）。
- 各 route → card: stance→stanceLabelKey/stanceLabel/intentLine（exact lookup）・reasons→basisBucket→BASIS_SUMMARY（**evidenceRefs を一切読まない**）・空 reasons→hasNoBasis=true。
- recommended→recommendedStanceLabelKey（null は偽推薦なし）・recommendationAbsent。
- confidence（route 横断一律）→ set-level confidenceLabel（'high'/'visible' は型に存在せず断定不能）。
- pure（IO/Date/RNG/write なし・戻り値のみ）。

### ④ `deriveReasonSummaries` / `recommendedLabelKeyOf`（pure helper）
basisBucket→BASIS_SUMMARY（distinct・1 句圧縮・evidenceRefs 非参照）。recommended→label key（null 写像）。

### ⑤ `proposalSurfaceViolations`（walker・空=適合・throw しない）
copySurface 三層防御を mirror（**RO-5 専用 catalog**）:
1. render 時 cards 常に 3（protect/easy/push 順）・suppress 時 []。
2. stanceLabel/conceptLabel/intentLine/basisSummary/confidenceLabel が **exact whitelist 一致**（dynamic 生成検出）。
3. **RO-5 専用 FORBIDDEN_LEXICON**（copySurface と共有 import しない・mustFix #3）+ **RO-5 専用 RAW_ID_TOKENS = `["proute:","trn:","anchor_","gap_","ern:","cl:","q:","rdiff:","redge:"]`**（copySurface の token list は `trn:/proute:/anchor_/gap_` を欠くため流用不可・mustFix #3）。
4. **禁止 field キー走査**（recursive key check・mustFix #6）: `evidenceRefs/forTarget/routeSetId/unresolvedNotes/ledgerRefsObserved/unresolvedCount/notify/notification/dispatch/action/write/send/book/pay/sourceRefs` が DTO に存在しない。※ copySurface の FORBIDDEN_FIELDS は `"push"` を含むが、RO-5 の push は正当な stance 値ゆえ **field キー走査で実施**（値 substring scan を使わず誤検出回避）。
5. JSON serialization backstop（RAW_ID_TOKEN 非出現）。

---

## 6. boundaries

1. RO-5 は **docs + pure view-model（型 + builder + walker）まで**。実 route/page/client/dev-reality-pipeline 配線・production 導線・RealityPipelineEnvelope 混載は範囲外。
2. DB/migration/Supabase/localStorage/notification/PredictionLedger write を一切行わない。pure（IO/Date/RNG なし）。
3. proposalRoute.ts/copySurface.ts/surfaceProjection.ts/RJ2a-f/empty-day-reasoning.ts/empty-day-generator.ts/RO-1/2/3 の runtime と型を改変しない（`import type` のみ・`EmptyDayTier` は import すらしない）。
4. 新正本型を作らない。`ProposalRouteSetV0` を read-only consume し DTO へ薄写像のみ。RO-5 は signal/frame を読まない（`ProposalRouteSetV0` のみ入力）。`RealityProposalStance` を re-define しない（mustFix #2）。
5. protect/easy/push の system-wide 中立 vocab 統合はしない（proposalRoute.ts:33 過渡対応踏襲）。
6. copySurface を拡張/改変しない（「no proposal」のまま不接触）。三層防御は **pattern 借用**（code 借用でない・RO-5 専用 catalog/walker 新設）。
7. **dev-reality-pipeline / reality-pipeline.ts / page.tsx を触らない（HARD GATE・mustFix #7）**。RO-5 着地 commit でこれらの git diff = 0。
8. barrel 非 export（dogfoodPreview/copySurface 同様の慎重 lane）。
9. 最終文言は CEO 文面承認 gate を通過するまで draft。

---

## 7. acceptanceCriteria

1. `proposalSurface.ts` が新設され `buildProposalSurface(set): ProposalSurfaceViewV0` が pure（IO/Date/RNG/write なし）。
2. DTO に `evidenceRefs/unresolvedNotes/ledgerRefsObserved/unresolvedCount/routeSetId/forTarget` が一切含まれない（型 + walker 二重保証・mustFix #6）。
3. `conceptKind='reaction_stance'` と `conceptLabel='今の現実への構え'` が DTO 必須 field で empty-day「今日の組み方」と親分離。
4. DTO は raw stance 値（'protect'/'easy'/'push'）を持たず `stanceLabelKey` 経由。
5. render 時 cards 常に 3（protect/easy/push 順）・recommended=null 時 recommendationAbsent=true かつ recommendedStanceLabelKey=null・reasons 空 route で hasNoBasis=true。
6. 全ラベルが exact catalog 固定 lookup で copySurface FORBIDDEN_LEXICON 部分一致 scan を通過。
7. **RO-5 全句 × empty-day TIER_INTENT_LINE 全句の 4-gram 重複ゼロ**（mustFix #1・cross-catalog scan）。
8. `proposalSurfaceViolations` が exact whitelist + RO-5 専用 FORBIDDEN_LEXICON + RO-5 専用 RAW_ID_TOKENS（proute:/trn:/anchor_/gap_ 含む）+ 禁止 field キー + JSON backstop の三層防御。正常 DTO で空配列。
9. DTO を JSON 化して `proute:/trn:/anchor_/gap_/ern:/cl:/q:` の RAW_ID_TOKEN が出現しない（leak guard PASS）。
10. proposalRoute.ts/copySurface.ts/empty-day-reasoning.ts/empty-day-generator.ts/RJ2a-f/**dev-reality-pipeline/page.tsx/reality-pipeline.ts** の git diff がゼロ（mustFix #7）。
11. tsc が新規エラーを増やさない（import type のみ）。
12. decision-log に RO-5 着地と「**surface 化済 ≠ 画面に出ている**」の区別を記録。

---

## 8. consumerWiring（将来の実 UI 接続・本 RO-5 範囲外・docs 規約のみ）

データフロー（server 層で連結・RO-5 builder 自身は signal/frame を読まない）:
1. server: `buildProposalRoutes({signal, frame, routeSetIdSeed})` → `ProposalRouteSetV0[]`（RO-4 caller=0 を RO-5 が初解除）
2. server: 各 set に `proposalRouteViolations(set)` → 非空なら skip
3. server: `buildProposalSurface(set)` → `ProposalSurfaceViewV0`（internal-safe DTO）
4. server: `proposalSurfaceViolations(view)` → 非空なら render 中止（fail-closed）
5. client: DTO を props で presentational に描画（plan 書き換えない/通知しない/fetch しない）

**画面配置 HARD 規約（mustFix #5）**:
- empty-day 系統 = 既存「ALTER で見る ›」内 modal/section（conceptKind=day_arrangement・見出し「今日の組み方」）
- RO-4 系統 = **別 section/別 card**（conceptKind=reaction_stance・見出し「今の現実への構え」**必須**）
- **RealityPipelineEnvelope への RO-5 DTO 混載禁止**。同一画面で empty-day TIER_INTENT_LINE 文（組み方）と RO-5 cards（構え）を同時 render する場合は **conceptLabel header 必須 + 別 section 必須**。
- 接続先候補（CEO 判断待ち・本設計で未確定）: (a) dev-reality-pipeline 別 section 観測接続（envelope と別 payload）, (b) 将来本番 /plan 構え card。いずれも別 GO。**RO-5 完了は「pure view-model + contract 確定」までで「画面に出ている」を意味しない**。

---

## 9. auditPlan

- **contract-audit**: proposalSurface.ts と本 doc の型 shape 整合・禁止 field の doc 宣言と型一致。
- **coverage-audit**: ProposalRouteSetV0 の各 field が DTO で defined→surfaced(display-safe) / dropped(internal-only) のどちらに分類されたか Coverage Matrix。internal-only が 1 つも漏れていないこと。
- **FORBIDDEN_LEXICON + cross-catalog scan**: 全 RO-5 ラベルを FORBIDDEN_LEXICON/RAW_ID_TOKENS に部分一致 scan（0 hit）+ empty-day TIER_INTENT_LINE と 4-gram 重複ゼロ。
- **leak-guard serialization test**: 代表 fixture（全空/同点/unresolved/evidence 豊富/recommended=null/reasons 空）で JSON RAW_ID_TOKEN scan が全 clean。
- **orphan-audit**: buildProposalSurface の caller=0（RO-5 範囲で正・consumer wiring は docs 規約のみ）。
- **git diff 検証**: proposalRoute/copySurface/empty-day-reasoning/empty-day-generator/RJ2a-f/**dev-reality-pipeline** の diff = 0。

---

## 10. openDecisions（CEO 判断）

1. push 表示ラベル「進める構え」/ intent が世界観 tone 上適切か（「攻める」を避けたが残余）。CEO 文面承認 gate で最終確認（technical safe ≠ 文面 safe）。**empty-day push intent「前に進めたいこと向けの…」との句頭近接**も gate 確認項目（mustFix non-destructive #1）。
2. STANCE_INTENT（intentLine）を v0 で出すか（stance 1 行ラベルのみに留めるか）。情報密度 vs シンプルさ。
3. RO-5 専用 FORBIDDEN_LEXICON を copySurface と共有 import するか独立保持するか（独立隔離を採用・mustFix #3 で hard 化）。
4. RO-4→RO-5 の server orchestration 主体（誰が buildProposalRoutes を呼び RO-5 に渡すか・caller=0 解除層）。別 GO。
5. buildProposalSurface が入力前に proposalRouteViolations を自前で呼ぶ（failure-loud）か呼び元前提の純変換か。v0 は純変換（呼び元検証）。
6. basisBucket→honest 要約が薄い根拠でも「関連あります」と過剰帰属に見えるリスク。reasons 空時 hasNoBasis 不在句で足りるか further hedge か。
7. 実 UI 接続先（dev-reality-pipeline 別 section vs 本番 /plan 構え card）と接続タイミング。別 GO・CEO 判断待ち。

---

## 11. 実装

本書と同時に `lib/plan/realityCore/proposalSurface.ts`（pure view-model）+ `tests/unit/proposalSurface.test.ts` を着地。RO-1〜4 と同じ規律: pure のみ・write 0・実 UI/pipeline 配線なし・既存型改変ゼロ。**surface 化済 ≠ 画面に出ている**（consumer wiring は別 GO）。
