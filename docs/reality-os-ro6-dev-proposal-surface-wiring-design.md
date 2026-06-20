# RO-6 — Dev-only Proposal Surface Wiring 実装ノート

- **status**: 実装着地（dev-only wiring + presentational preview section）。**production route/API/cron/notification/apply/DB write/PredictionLedger write/B1/ETA・RC4 なし**。既存 lib 改変ゼロ（page.tsx に 14 行追加のみ）
- **CEO GO**: RO-6 GO（2026-06-20・RO-5 着地に続けて・裁定 7 点・文面 v0 承認）
- **lineage**: RO-3（RealityLearningSignalV0）→ RO-4（buildProposalRoutes）→ RO-5（buildProposalSurface）→ 本 RO-6。RO-4/5 が caller=0（dormant）だったのを **dev preview で初めて呼び出し dormant を脱する**。
- **目的**: RO-4/5 を永久 dormant にせず、`RealityLearningSignalV0 → ProposalRouteSetV0 → ProposalSurfaceViewV0` の chain を dev preview の**別 section**で観測可能にする。**実 UI 本番導線ではない**。

---

## 1. 着手前 blast radius（CEO 必須・実コード確認）

| 確認 | 結果 |
|---|---|
| dev-reality-pipeline の gate | **三重 dev-gate**（`REALITY_CANDIDATE_ACTIONS_DEV_HOST` + staging ref + 非 production→`notFound`）+ operator auth（owner-RLS）+ flag `REALITY_PIPELINE_PREVIEW`（server default OFF）。3 つ揃った時のみ read/run。production で構造的不可視 |
| dev-reality-pipeline の payload/render | 既存は **Secretary OS 系統**（`runRealityPipeline`→`RealityPipelineEnvelope`→`RealityPipelinePreviewClient`）。empty-day「今日の組み方」を表示 |
| RO-3/4/5 caller=0 接続点 | `buildRealityLearningSignal`/`buildProposalRoutes`/`buildProposalSurface` の production caller=0（test のみ）。RO-6 が初の caller |
| frame 供給源 | dev-reality-pipeline は **realityCore の `RealityFrameV0/Snapshot` を作らない**（別系統）。`dogfoodPreview` は real compile chain で snapshot を組むが **event-only（tasks なし）** で RO-4 task_proposal に不適 → RO-6 は **tasks を含む synthetic fixture** を別途構築 |
| 既存資産改変なしで別 section 可能か | 可能。`RealityPipelinePreviewClient`/envelope を触らず、別 component を別 prop で page に追加 |

**結論**: real anchor/DB を読む realityCore frame 供給は別トラック（real-data wiring）。RO-6 は **decisive synthetic fixture**（empty anchors の real compile chain・cast なし）で chain を観測可能にし、別 section で empty-day と棲み分ける。

---

## 2. 実装（pure orchestration + dev fixture + presentational section + 配線）

### ① `lib/plan/realityCore/proposalSurfacePreview.ts`（pure・caller=0 解除本体）
`previewProposalSurfaces(input)` が **fail-closed** で 5 関数を連結:
```
buildRealityLearningSignal → buildProposalRoutes → proposalRouteViolations(skip if 非空)
  → buildProposalSurface → proposalSurfaceViolations(skip if 非空) → safe DTO のみ返す
```
戻り値 = `{ surfaces: ProposalSurfaceViewV0[], diagnostics: {totalSets, skippedForRouteViolation, skippedForSurfaceViolation, rendered} }`（diagnostics は counts のみ・trace/raw なし）。pure（IO/Date/RNG/write なし）。RO-1〜5 改変なし（import のみ）。**route 非依存で testable**。

### ② `app/(culcept)/plan/dev-reality-pipeline/devProposalSurfaceFixture.ts`（dev-only synthetic fixture）
`buildDevProposalSurfaceInput(referenceInstantUtc)` が決定論的 synthetic frame を組む:
- **snapshot**: empty anchors の **real compile chain**（`buildDayGraph→compileEventRealityNodes→compileMovementReality→compileCommitmentSignals→deriveDecisionDebt→makeRealityInstantJst→deriveMomentState→deriveMomentSnapshot→assembleRealityGraph`）。**cast なし**・event なし。
- **workLane**: real builders（`buildTaskRealityNode`）で `ro6-demo` task。prior=not_started / current=done（**push 発火**）。
- **gradients**: `duration` direction=lower（**easy 発火**）。
- 結果: easy + push は根拠あり・**protect は event なしで honest 空**（collapsed event がないため）。
- `referenceInstantUtc` は server now 注入（builder は Date.now/乱数なし）。**synthetic 明示**（実データでない）。

### ③ `app/(culcept)/plan/dev-reality-pipeline/ProposalSurfaceSection.tsx`（presentational・別 component）
`ProposalSurfaceViewV0[]`（既に fail-closed 通過）を表示専用 render:
- **conceptLabel header「今の現実への構え」必須**（empty-day「今日の組み方」と親分離）。
- 3 card（守る/楽にいく/進める構え）+ intentLine + reasons（basisSummary）or honest 不在句 + confidenceLabel + recommended ハイライト。
- **dev fixture（synthetic）明示**。apply button なし・fetch なし・plan 書き換えなし・通知なし。
- honest 不在句（`recommendationAbsent`→「いまは特に推す構えは見当たりません」/ `hasNoBasis`→「この構えの根拠は、いまは見当たりません」）は presentation-side 固定句。

### ④ `page.tsx` 配線（14 行追加・envelope 不接触）
既存 return を fragment に包み、`RealityPipelinePreviewClient`(empty-day) の**下に別 section** `ProposalSurfaceSection` を追加。`previewProposalSurfaces(buildDevProposalSurfaceInput(now))` で safe DTO を生成し別 prop で渡す。三重 gate 通過後のみ render。

---

## 3. 表示規約（CEO 必須・実装で担保）

- empty-day（envelope）と **別 section**・別 payload（`surfaces` prop は envelope と無関係）。
- **`RealityPipelineEnvelope` に RO-5 DTO を混載しない**（page.tsx で envelope は不接触・section は別 component）。
- **conceptLabel header 必須**（section が「今の現実への構え」を表示）。
- **`proposalSurfaceViolations` が 1 件でも出たら表示しない**（`previewProposalSurfaces` が fail-closed で除外）。
- presentational only（plan 変更・通知・保存・実行なし）。
- empty-day: 「今日の組み方」/ RO-5: 「今の現実への構え」で画面上分離。

---

## 4. 検証

- **tests**: 5 orchestration（previewProposalSurfaces fail-closed/leak-free/counts）+ 1 dev fixture real-chain（empty snapshot を real compile chain で組み RO-3→4→5 が通る・easy/push 根拠あり・protect honest 空・leak-free）。+ RO-1〜5 回帰。
- **tsc footprint 0**（total 51 不変・RO-6 由来 0）。
- **既存 lib 改変ゼロ**（reality-pipeline.ts / RealityPipelinePreviewClient.tsx / empty-day-generator.ts / empty-day-reasoning.ts / copySurface.ts の git diff = 0）。改変 tracked は page.tsx のみ（14 行・envelope 不接触）。
- **write/Supabase/Date/randomness 0**（新規コード・コメントのみ）。fixture は referenceInstantUtc 注入（Date.now なし）。
- **gate**: page は三重 dev-gate + operator auth + flag default OFF（production hard block）。section は gate 通過後のみ render。
- **browser 検証**: page は operator-only/flag OFF gate ゆえローカル即時 render 不可（gate 通過には operator auth + flag + host 設定要）。section は **tested-safe DTO 上の presentational** で、data chain（real compile + fail-closed + leak-free）を unit で担保。

---

## 5. 禁止事項（CEO・全て遵守）

B1 gate / PredictionLedger write / ETA・RC4 接続 / 実 UI 本番表示 / production route・API・cron / empty-day-generator runtime 改変 / protect-easy-push の system-wide 中立統合 — **すべてなし**。

---

## 6. openDecisions（CEO 判断・別 GO）

1. **本番 /plan「構え」card への接続**: dev preview の次。real-data wiring（realityCore frame を real anchor から組む）+ 文面再承認 gate + 表示位置確定。
2. **real-data frame 供給**: synthetic fixture → real anchor 由来の RealityFrameV0（別トラック・RD0 real-data wiring 系）。
3. **RO-4→RO-5 server orchestration の本番主体**: dev preview は `previewProposalSurfaces` を page で呼ぶが、本番は別層。
4. **STANCE_INTENT 本番表示**: dev では表示（CEO v0 承認）。production copy は再承認 gate。
5. **protect の実 evidence**: synthetic fixture では event なしで honest 空。real event（collapsed leaveByLines）接続時に発火。
