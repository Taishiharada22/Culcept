# RO-4 — Proposal 3案（protect/easy/push）設計（docs-only・実装は本書と同時着地）

- **status**: 設計 v0.1（docs-only → 実装）。**14-agent リサーチ Workflow + 敵対的検証 4 次元（17 mustFix・全 CONCERN/PASS・FAIL 0）反映**。code 変更は新規 1 ファイル + test のみ・**既存型改変ゼロ・write 0・migration 0・production 不接触**
- **CEO GO**: RO-4 実装 GO（2026-06-20・RO-3 完了に続けて・裁定 6 点）
- **lineage**: RO-0（scope reset）→ RO-1（TaskRealityNode / task_proposal join 鍵）→ RO-2（leaveByLines）→ RO-3（RealityLearningSignalV0）→ 本書。RO-1 `taskEdgePrep.ts:57` の `task_proposal`（コメント「RJ4 が参照・**RO-4 所管**」）に着地する。
- **方法**: premise を実コード検証（Ground 6 並列）→ 3 設計 spine → 統合 → 敵対的検証 4 次元（honesty / **二重正本化** / boundary / 非破壊）。17 mustFix を §8 で反映（本文は反映後の正本）。
- **核心**: RO-4 = **`RealityLearningSignalV0` → stance 付き proposal 候補（protect/easy/push）への pure 後段変換層**。実行でなく**候補生成まで**。既存 `empty-day-generator`（空白日 3案）とは「**兄弟レーン**」（入力源・出力意味・正本型・生成主体の 4 軸直交で二重正本化を構造回避）。

---

## 0. GOAL（北極星）

> RO-3 が作った学習シグナル（edges / diff / changes / gradients / ledgerCandidates / unresolved）を読み、その日の現実が動いた後の task / event に対して「**どう構えるか**」の 3案 — **protect（守る）/ easy（楽に）/ push（攻める）** — を pure に生成する。これは「実行」でも「日のブロック配置」でもなく、**signal の物理量に接地した『向き合い方の候補』**。

到達定義（RO-4 完了 = 全達成）: `buildProposalRoutes(signal, frame)` が、各 `task_proposal` edge target ごとに常に 3 route を持つ `ProposalRouteSetV0` を pure に返す。各 route の根拠は signal 由来の実 evidence のみ（捏造禁止）。**PredictionLedger に書かない**・RO-1/2/3 + empty-day 型を 1 バイトも改変しない・全 pure。

---

## 1. premise 検証結果（Ground・実コード接地）

| premise | 検証 | 証拠 |
|---|---|---|
| protect/easy/push の 3案 vocab は既に正本として存在 | **confirmed** | `EmptyDayTier = "protect"\|"easy"\|"push"`（empty-day-generator.ts:23）+ `EmptyDayIntent`（empty-day-input.ts:38）。重複定義は無くこの 1 系統のみ |
| empty-day-generator は RealityLearningSignalV0 を読まない・別入力 | **confirmed** | `RealityLearningSignal` の grep が lib/ で 0 hit。empty-day は `EmptyDayInput`（空き window budget + energy + memoryUsableContexts・empty-day-input.ts:49-60）を読む |
| empty-day-generator は production 非接続の dormant | **refuted（要注意）** | `generateEmptyDay` は `reality-pipeline.ts:79` 経由で稼働。ただし caller は **dev preview route（dev-reality-pipeline/page.tsx:90）+ smoke scripts + tests のみ**で production route/api/cron は 0 → **実質 dev/smoke 接続**（production dormant・但し dead code ではない） |
| reality-pipeline は production/route/cron 接続 | **refuted** | caller は dev preview + scripts/reality-* + tests のみ |
| RealityLearningSignalV0 は RO-4 が読む自然な単一入力 | **confirmed** | realityLearningSignal.ts:46-53 の 6 bucket が stance 根拠に写像可能。`buildRealityLearningSignal` の caller=0 → **RO-4 が初の reader** |
| day-level proposal の単一正本型は確立 | **refuted** | `PlanCandidate` は grep 0 hit。day-level proposal 正本は `EmptyDayProposal` 1 本のみ。`ProposalCard/ProposalCandidate`（coalter/types.ts）は **Rendezvous 用 LLM 提案**で別ドメイン |
| protect/easy/push と DailyGuidance 6 モードは同軸 | **refuted（別軸）** | DailyGuidance（recover/reset/advance/maintenance/social/explore）は activity-mode、protect/easy/push は reaction-stance。直交 |
| realityCore は reality/ を import していない（cross-lineage 0） | **refuted（重要訂正）** | realityCore は **既に reality/ から 8 箇所 type-only import**（correctionGradient.ts:19 `CorrectionVerdict` 含む・commitmentSignal.ts:34 / interventionLadder.ts:17 / compileEventRealityNodes.ts:20-21 / taskRealityNode.ts:22 / eventRealityNode.ts:29-30）。**0 なのは `reality/empty-day` サブディレクトリのみ** |

**核心の含意**: (1) 3案 vocab は既存だが、RO-4 と empty-day は**入力・出力・正本・生成主体が直交**するため、vocab を重複させても「2 つの 3案 composer」にはならない設計が可能（§2）。(2) cross-lineage import は既に存在するので「初の結合を避ける」は誤った根拠。`RealityProposalStance` を独立 re-define する正しい根拠は **semantics-bleed 回避**（`EmptyDayTier` は day-skeleton 含意を carry する runtime const）+ `CorrectionDirection` 先例（§3）。

---

## 2. positioningDecision — empty-day-generator との「兄弟レーン」棲み分け（二重正本化回避）

empty-day-generator(R2-2) と RO-4 は**同じ 3 語 vocab を使う別系統**であり「親子 / 代替」ではない。二重正本化を **4 軸直交**で構造回避する：

1. **入力源直交**: empty-day は `EmptyDayInput`（空き window budget + energy + memory）を読み、`RealityLearningSignal` を一切読まない（grep 0・confirmed）。RO-4 は `RealityLearningSignalV0` のみ読み、空き window / WorldState / energy を読まない。**grep レベルで入力が交わらない**。
2. **出力意味直交**: empty-day 出力 `EmptyDayProposal` は「日の時間ブロックをどう詰めるか」の **day skeleton**（活動充填度・`LOAD_FRACTION` easy0.25/protect0.5/push0.8）。RO-4 出力 `ProposalRouteV0` は「現実が動いた後どう構えるか」の **reaction stance**で、時間ブロックも skeleton も持たない（stance + reasons + confidence のみ）。
3. **正本型を新設しない**: day-level proposal 正本は `EmptyDayProposal` 1 本のみ（`PlanCandidate` 不在・confirmed）。RO-4 は `EmptyDayProposal` を再生成も変換もしない。`ProposalRouteV0` は signal bucket への stance タグ付き参照であって新 day-builder ではない。empty-day→ChangeSet 経路（`changeset-draft.ts` `proposalToChangeSetDraft`）は empty-day 専用で touch しない。
4. **生成主体を新設しない**: RO-4 は新 edge/snapshot を発明せず、RO-3 が materialize 済みの `task_proposal` edge（realityGraphEdge.ts:128-130・from=task / to=`attrRef('proposal',…)`）の口に着地する。`taskProposalJoinKey`（taskEdgePrep.ts:57-60・コメント「**RJ4 が参照・RO-4 所管**」）が proposal endpoint を宣言済み（**RO-4 は RJ4 と参照を共有**・単独 owner ではない）。

---

## 3. stanceDecision — `RealityProposalStance` 独立 re-define（import せず）

**採択**: RO-4 内（`proposalRoute.ts`・realityCore lineage）に `RealityProposalStance = "protect" | "easy" | "push"` を**独立 re-define**。既存 `EmptyDayTier` の import でも中立抽出でもない。

**根拠**:
1. **semantics-bleed 回避**（主根拠）: `EmptyDayTier` は empty-day の day-skeleton 含意（充填度 budget）を carry する runtime const。RO-4 の stance（制約グラフ route の reaction）と意味文脈が異なる。値同形でも import すると「この stance は empty-day 由来」の誤読 + empty-day 変更の波及が生じる。
2. **`CorrectionDirection` 先例の正しい適用**: RO-3 は `CorrectionDirection`（correctionGradient.ts:38-39）を「値空間は `UserCorrection.direction` と同形だが、結合を避けるため lineage 内で独立定義」とした。`RealityProposalStance` はこのパターンの完全な踏襲。
   - ※ `RealityEdgeKind = TaskEdgeKind | …`（realityGraphEdge.ts:34）は**同 lineage 内（realityCore→realityCore）継承**であり cross-lineage import の根拠にならない。先例として引くのは `CorrectionDirection`。
3. **訂正（mustFix M1）**: 「cross-lineage 結合ゼロを維持」は**誤り** — realityCore は既に reality/ から 8 箇所 import 済み（correctionGradient.ts:19 含む）。正しい狭い事実は「`reality/empty-day` サブディレクトリからの import は 0」のみ。独立 re-define の判断は「初結合回避」ではなく semantics-bleed 回避に置く。
4. **中立抽出を採らない**: 中立 location 新設は empty-day-generator.ts:23 の re-export 改変 + **既存 4 importer**（empty-day-generator / empty-day-reasoning / reality-pipeline / trigger-content・実 grep 検証）への影響検証を要し、CEO の change-footprint 最小哲学に反する。将来 system-wide stance 統合の余地は注釈で保持。

**過渡注釈**（proposalRoute.ts header + 本書）: 「この protect/easy/push は `EmptyDayTier`（空き window 充填度）と**値同形・別意味**（制約グラフ route の reaction stance）。値空間共有・意味文脈分離・import 結合ゼロ。将来 central 統合の余地あり」。`EmptyDayIntent`（empty-day-input.ts:38）も touch しない。

---

## 4. inputMapping — RealityLearningSignalV0 6 bucket → 3 stance の honest 写像

加点方式（該当 bucket 非空なら対応 route に reason を 1 件加点・薄撒き禁止・実 evidence のみ転記）。

### protect ← `diff.collapsed`（anchorId lineage 橋渡し・mustFix M2 構造修正）
`CollapsedRefV0{ref, field, fromGap, toGap}`（realityDiff.ts:42-48）。collapsed が満ちるのは ern.leaveByLines.bandGapMin 減少時のみ（v0 で発火可能な唯一の縮小・realityDiff.ts:213-216）= 出発線の余地が物理的に縮んだ=自由度低下の数値証拠 → protect。
- **構造課題**: `collapsed.ref` は **event 宇宙**（`{universe:'snapshot', kind:'event', id:'ern:<date>:<anchorId>'}`）、forTarget は **task 宇宙**（`trn:`）。別宇宙・別 id namespace のため**素の id 一致では永久に非マッチ**（v0 dead）。
- **修正（M2 案 b 採用）**: task ノード本体（`frame.workLane.tasks`）の `task.sourceRefs.anchorId`（optional・taskRealityNode.ts:63）と、collapsed の ern id から parse した anchorId を突合。一致した collapsed のみ protect reason。**task が anchorId を持たない / 一致 collapsed が無い → protect reasons 空（honest）**。これで protect は「event-anchored task では working、非 anchored task では honest 空」となり一律 dead を解消。
- evidenceRefs = `[gap_<fromGap>_to_<toGap>, anchor_<anchorId>]`（新数値を作らない）。

### push ← `changes[lane='task' && sourceVocab='task_outcome' && 前進系]`
`RealityChangeV0{target, lane, classifiedAs, sourceVocab, evidenceRefs}`（realityChange.ts:35-41）。completionStatus changed → `completionStatusToOutcome`（realityChange.ts:44-58）→ classifiedAs。
- **前進系のみ**: `PUSH_OUTCOMES = {completed, partial, progressed}`（taskOutcome.ts:21-27 の前進 outcome）。`carried_over / blocked / skipped` は push にしない（honest）。
- **carryOver 由来除外**: `classifyChange`（realityChange.ts:93-102）は carryOverSignals から `classifiedAs=carried_over/blocked` の task-lane change も出すが、これらは `PUSH_OUTCOMES` に無いのでフィルタで除外される（同 `sourceVocab='task_outcome'` を共有するため acceptance test で明示確認・M9）。
- `target.id === task.taskRealityNodeId`（node-scoped）。evidenceRefs（realityChange.ts:78）転記。

### easy ← `gradients[axis 別 burden-reducing direction]`（mustFix M3 構造修正）
`CorrectionGradientV0{axis, contextKey, direction, confidenceDelta, verdict, basis}`（correctionGradient.ts:45-57）。`LEVEL_AXES = {duration, energy, cognitiveLoad, prep}`（correctionGradient.ts:**42**）。
- **訂正（M3）**: 旧設計の「`direction='match'||'lower'` 一律 easy」は **energy で意味反転**するため撤回。`energy` 軸で `direction='lower'` は「余力が見立てより低い＝しんどい日」であり **easy ではない**（dayStateTypes.ts:98-99 値空間）。
- **axis 別 burden-reducing 写像**:
  - **負荷系** `{duration, cognitiveLoad, prep}`: `direction='lower'`（負荷が見立てより低い＝楽）→ easy。
  - **energy**: `direction='higher'`（余力が見立てより高い＝楽）→ easy。
  - `'match'`（見立て通り）は easy の根拠にしない（中立・無い物を作らない）。accept/reject 系（route/deadline）の `verdict='trust_more'` は v0 保留（§9 openDecision）。
- **写像粒度**: gradient は axis+contextKey scoped で **per-task ref を持たない**（injected・mustFix M8: task field 由来でない）→ easy は「その日どの軸が楽か」の **day-level 根拠**で、全 set で共有（軸の楽さは task を跨ぐ）。basis（correctionGradient.ts:56・空不可保証）転記。

### unresolved ← honest gap（全 route confidence cap）
`unresolved: EdgeJoinReadinessV0[]`（taskEdgePrep.ts:62-66）。`unresolved.length>0` ⇒ graph resolution 不完全 → **全 route confidence を tentative に頭打ち** + `unresolvedCount`/`unresolvedNotes` に missing 転記（phantom=0 の証跡）。

### ledgerCandidates ← read-only / edges ← 母集合 anchor / added·removed·resolved ← 読まない
- `ledgerCandidates`: `targetNodeId` を read-only 転記（`ledgerRefsObserved`）。`targetNodeKind='task_untypeable_v0'` を改変せず **PredictionLedger に一切 write しない**。
- `edges`: `kind='task_proposal' && resolvable=true` が「proposal を出せる task」の母集合（realityGraphEdge.ts:128-130）。phantom（resolvable=false）を route 化しない。
- `diff.nodes.added/removed`・`diff.resolved`: 方針シグナルでない（中立・読まない宣言）。

---

## 5. components（proposalRoute.ts・realityCore lineage・新規 1 ファイル）

### ① 型群

```ts
export const PROPOSAL_ROUTE_VERSION = 0;
// EmptyDayTier と値同形・import 結合せず独立 re-define（CorrectionDirection 先例・semantics-bleed 回避）
export type RealityProposalStance = "protect" | "easy" | "push";
export type RouteConfidence = "low" | "tentative"; // 断定しない（empty-day-reasoning.ts:99-100 同水準）
export type RouteBasisBucket = "diff_collapsed" | "change_task" | "gradient_axis";

export interface ProposalRouteReasonV0 {
  readonly stance: RealityProposalStance;
  readonly basisBucket: RouteBasisBucket;
  readonly evidenceRefs: readonly string[]; // signal 由来のみ（捏造禁止・空 source は skip）
}
export interface ProposalRouteV0 {
  readonly stance: RealityProposalStance;
  readonly reasons: readonly ProposalRouteReasonV0[]; // 空可（evidence 無し route は空+tentative で honest）
  readonly confidence: RouteConfidence;
}
export interface ProposalRouteSetV0 {
  readonly schemaVersion: 0;
  readonly routeSetId: string;            // injected seed から deterministic（乱数/now なし）
  readonly forTarget: RealityNodeRef;     // task_proposal edge の from（task・universe=workLane）に固定
  readonly routes: readonly ProposalRouteV0[]; // 常に 3（protect/easy/push 順）
  readonly recommended: RealityProposalStance | null; // 根拠最多・同点/不足/incomplete は null
  readonly unresolvedCount: number;
  readonly unresolvedNotes: readonly string[];
  readonly ledgerRefsObserved: readonly string[]; // read-only 転記（write しない）
}
```

**invariants**: `EmptyDayProposal/Block/Set/Tier/Intent` を import も借用もしない。RO-1/2/3 + empty-day 型を改変ゼロ（`import type` のみ）。routes は常に 3 stance 網羅（evidence 無し route も reasons 空+tentative で出す・黙らせない）。confidence は low|tentative のみ。`forTarget` は **task に一本化**（`universe='workLane' && kind='task'`・mustFix M4: `to`=proposal endpoint は universe='attribute' で不採用）。全 readonly。

### ② `buildProposalRoutes`（pure 変換関数・RO-4 の心臓部・signal の初 reader）

```ts
export interface BuildProposalRoutesInputV0 {
  readonly signal: RealityLearningSignalV0; // read-only
  readonly frame: RealityFrameV0;           // task ノード（anchorId）解決用・read-only・改変なし
  readonly routeSetIdSeed: string;          // injected・deterministic（caller 責務）
}
export function buildProposalRoutes(input: BuildProposalRoutesInputV0): readonly ProposalRouteSetV0[];
```
骨子: (1) `signal.edges.filter(kind='task_proposal' && resolvable)` の from.id を target 母集合に。(2) 各 target を `frame.workLane.tasks` で task ノードに解決（anchorId 取得）。(3) `deriveStanceEvidence(signal, task)` で 3 stance の reasons。(4) `unresolved` 非空 → 全 route tentative + notes 転記。(5) `recommended = pickRecommended(ev, unresolvedCount)`。(6) `ledgerRefsObserved` = 当該 target 一致 ledgerCandidates の targetNodeId を read-only 転記。**戻り値のみ**（write 0）。

**invariants**: pure（IO/Date/RNG/DB/write なし）。signal/frame を read-only consume・改変ゼロ。`routeSetId` は seed から deterministic。task_proposal edge が無ければ空配列（route を発明しない）。phantom edge を route 化しない。

### ③ `deriveStanceEvidence`（pure helper・bucket→stance 写像の本体）
§4 の 3 写像を実装。protect = anchorId 橋渡し（task.sourceRefs.anchorId ↔ collapsed ern の anchorId）。push = node-scoped 前進系。easy = day-level burden-reducing gradient。各 bucket の実 evidence がある stance にのみ reason を載せる（過剰帰属禁止）。

### ④ `pickRecommended` + `proposalRouteViolations`（pure・推薦 + INV 検証）
- `pickRecommended(ev, unresolvedCount)`: 各 stance の reasons 数で比較・最多を推薦。**同点 / 全空 / (unresolvedCount>0 かつ push 最多) は null**（不完全データで「攻めろ」を推さない）。`recommendByEnergy`/`LOAD_FRACTION`/`TIERS` を一切呼ばない（semantics-bleed 防止）。
- `proposalRouteViolations(set): string[]`（throw しない・空=適合）: routes.length===3 ∧ protect/easy/push を 1 つずつ網羅 ∧ unresolvedNotes 非空時 confidence=tentative ∧ reasons 存在時 evidenceRefs 非空 ∧ `forTarget.universe==='workLane' && kind==='task'`（M4） ∧ reasons[].stance===route.stance ∧ recommended は根拠不足で null。

---

## 6. boundaries

1. DB/migration/Supabase/localStorage/production route/api/cron/UI/notification に一切触れない（全 pure・戻り値のみ）。
2. Date/now/Math.random/RNG を持たない（now は signal 側注入済みを使う・routeSetId は injected seed）。
3. PredictionLedger に一切 write しない（ledgerCandidates は read-only・`task_untypeable_v0` を改変しない・B1/RJ6 所管）。
4. RO-1/2/3 + empty-day + reality-pipeline の既存型を破壊的変更しない（全 `import type`）。`EmptyDayTier/Intent/Proposal` を import も借用もしない。
5. empty-day-generator の runtime（`generateEmptyDay/recommendByEnergy/LOAD_FRACTION/TIERS`）を呼ばない（semantics-bleed 防止）。
6. apply 接続（ProposalRoute→実 plan/ChangeSet）・reasoning 層（理由文生成）・UI 併存設計は B1/RJ6/UI stop gate の先（本フェーズ非対象）。RO-4 は「signal を読む pure kernel」止まり。

---

## 7. acceptanceCriteria

1. `npx tsc --max-old-space-size=8192` が RO-4 新規導入後も baseline を増やさない（新規 error 0・型改変ゼロ）。
2. `buildProposalRoutes` が pure（同一入力→同一出力・IO/Date/RNG/write grep 0・signal/frame を mutate しない）。
3. `RealityProposalStance` が `EmptyDayTier` と値同形だが import 結合ゼロ（proposalRoute.ts が empty-day を import しない・grep 確認）。
4. 各 set が常に 3 route（protect/easy/push 各 1）・evidence 無し route は reasons 空+confidence=tentative で honest に出る（欠落させない）。
5. reasons[].evidenceRefs が全て signal 由来（collapsed の fromGap/toGap・changes の evidenceRefs・gradients の basis）・捏造ゼロ。
6. **push route が前進系（completed/partial/progressed）のみ**・`carried_over/blocked/skipped` を push に含めない（同 `sourceVocab='task_outcome'` を共有する carryOver 由来 change が push reason を生まないことを明示テスト・M9）。
7. **easy が axis 別 burden-reducing のみ**（負荷系 duration/cognitiveLoad/prep は `direction='lower'`・energy は `direction='higher'`・`match` は easy 不採用・M3）。
8. **protect が anchorId lineage 橋渡し**（task.sourceRefs.anchorId ↔ collapsed ern の anchorId 一致時のみ・非 anchored task は protect 空・M2）。
9. `unresolved.length>0` で全 route confidence=tentative・unresolvedCount/Notes に missing 転記。
10. signal.edges に task_proposal が無い/空 signal で空配列（route を発明しない）。
11. ledgerCandidates 参照時に PredictionLedger write が発生しない（read-only・grep 0）。
12. `proposalRouteViolations` が適合 set で空・不適合で非空・throw しない。
13. **honest dormancy 開示**: `crossDay=true` で protect/push は suppressed（realityDiff が collapsed/changed を空に）・easy は gradients 注入時のみ出現（`decomposeCorrection` caller=0 ＝ gradients は実質 injected-only）。「常に 3 案揃う UX」は約束しない（producer 未配線 route は dormant・M7）。

---

## 8. 敵対的検証 — 17 mustFix（FAIL 0・CONCERN×3/PASS×1）反映

設計の核心（4 軸直交による二重正本回避・signal→stance honest 写像・全 pure read-only）は**健全（FAIL 0）**。17 mustFix を実質 10 系統に整理し反映（§2〜§7 は反映後の正本）。

### 構造修正 2 件（実装ロジックを変更）
- **M2 protect の v0 dead 解消**（honesty/double-canonical/non-destructive 3 次元指摘）: collapsed は event 宇宙・forTarget は task 宇宙で素の id 一致が永久非マッチ → **task.sourceRefs.anchorId ↔ collapsed ern の anchorId 橋渡し**を実装（§4 protect）。非 anchored task は honest 空。
- **M3 easy の axis 横断意味反転**（honesty 指摘）: `energy×lower` は「しんどい」で easy ではない → **axis 別 burden-reducing**（負荷系=lower / energy=higher / match 不採用）に修正（§4 easy）。

### 精度修正 8 系統
- **M1 cross-lineage 事実誤認**（3 次元指摘）: 「realityCore→reality import 0」は誤り（8 箇所実在・correctionGradient.ts:19 含む）。正=`reality/empty-day` のみ 0。独立 re-define 根拠を semantics-bleed 回避に訂正（§3）。
- **M4 proposalRouteViolations 自己矛盾**（4 次元指摘）: `to`=proposal endpoint は universe='attribute' → `forTarget` を `from`(task・universe='workLane') に一本化・INV から `or proposal` 削除（§5①④）。
- **M5 off-by-one 引用**: LEVEL_AXES :43→**:42**・RealityEdgeKind :33→:34・task_proposal :127-129→**:128-130**・RealityChangeV0 :34→:35-41・completionStatusToOutcome :39-53→**:44-58**・CorrectionDirection :38-39→**:36-39**。本文で訂正済み。
- **M6 taskEdgePrep.ts:57 引用**: 全文「**RJ4 が参照・RO-4 所管**」で示し RO-4 単独 owner と誤読させない（§2-4）。
- **M7 easy dormancy 過少開示**: gradients は injected-only（`decomposeCorrection` caller=0）→ easy も実質 dormant。crossDay 基準を「protect/push suppressed・easy は gradients 注入時のみ」に訂正（§7-13）。
- **M8 prep は task field でない**: easy は injected `CorrectionGradientV0.{axis,direction,basis}` のみ由来（task field 不参照・§4 easy）。
- **M9 carryOver 由来 push 除外**: `carried_over/blocked` は `sourceVocab='task_outcome'` を前進系と共有 → push に混入しないことを明示テスト（§7-6）。
- **M10 EmptyDayTier importer 数**: 実 grep で **4**（empty-day-generator/reasoning/reality-pipeline/trigger-content）。中立抽出を採らない根拠に反映（§3-4）。

### PASS（健全と確認された点）
boundary 次元 = **pass**（全 pure・write 0・PredictionLedger 不接触・proposalShape は DTO のみ）。push 写像（前進系のみ）・collapsed の bandGapMin 縮小根拠・unresolved confidence cap・`task_untypeable_v0` read-only・PlanCandidate 不在・「常に 3 route + recommended null」は honest と確認。

---

## 9. openDecisions（CEO 判断）

1. **easy に accept/reject 系 verdict を含めるか**: route/deadline 軸の `verdict='trust_more'`（memory-correction.ts:27）を easy 根拠に含めるか。v0 は level 系 burden-reducing のみ。「信頼を上げてよい」と「修正が楽」の意味差検証要。
2. **protect の event↔task lineage 精密化**: v0 は task.sourceRefs.anchorId 一致のみ。1 task : N event や間接波及の写像は RO-1/RO-2 の task-event 関係正本に依存（owning session 文脈要）。
3. **stance 写像の心理的妥当性**: 「task 前進→push」だが前進直後こそ休むべき（protect）場合がある。v0 は機械写像 + confidence low/tentative で honest 化。心理妥当性検証（本人反応観測・reasoning 層）は別フェーズ。
4. **RealityProposalStance の値 duplicate**: protect/easy/push が EmptyDayTier と RO-4 の 2 箇所に。将来 system-wide stance vocab の中立統合の時期。v0 は注釈 + 将来余地保持で過渡対応。
5. **UI 併存**: empty-day 3案 と RO-4 ProposalRoute 3案 が同 vocab で 2 系統表示される混乱の解消（別画面/別ラベル/統合）。世界観整合上 CEO 方針要・本設計 scope 外。
6. **consumer 配線時期**: RO-4（producer）も `buildRealityLearningSignal`（signal producer）も caller=0。本線接続（R5-4/B1 stop gate）のタイミング → CEO stop gate 判断。RO-4 が永久 dormant 化するリスクを明示。

---

## 10. 実装

本書と同時に `lib/plan/realityCore/proposalRoute.ts`（pure kernel）+ `tests/unit/proposalRoute.test.ts` を着地。RO-1/2/3 と同じ規律: pure のみ・write 0・migration 0・production 不接触・既存型改変ゼロ・大枠 RO-4 単位。openDecisions のうち実装阻害なし（全て将来フェーズ）。
