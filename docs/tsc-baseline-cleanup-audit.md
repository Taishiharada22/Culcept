# tsc baseline cleanup — 監査 + mini plan（read-only audit・実装は CEO GO 待ち）

> 2026-06-07 / **read-only 監査のみ・実装未着手** / main HEAD `ea3556c2` 時点で `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` = **1114 errors**。
> 背景: per-marker/Day Rehearsal スライス着地中に発見した baseline debt。CEO 指示「大きな機能判断の前に baseline 解消方針を出す」。chip: task_d50a2f2c。

---

## 0. 結論（先に）
- **1114 件のうち 971 件（87%）は単一 root cause**: vitest globals（describe/it/expect/beforeAll/test）が tsc に未認識。**tsconfig に 1 箇所追加で一括解消可能**。
- 残り **143 件（13%）が実際の型不一致**（source 37 + test 106）。subsystem ごとに小 slice 化。
- **per-marker / Day Rehearsal 由来は 0 件**（私の着地ファイルにエラーなし・確認済）。
- ⚠ これらは型エラーのみ。vitest は SWC で型を剥がして実行するため**多くのテストは runtime では PASS**（plan suite 4973 PASS）。型安全性 (CI/IDE) の問題であり runtime 障害とは限らない。

## 1. 全体分類（error code 別）
| code | 件数 | 意味 |
|---|---|---|
| TS2304 | 622 | Cannot find name（'expect'/'beforeAll' 等 globals） |
| TS2582 | 349 | Cannot find name 'describe'/'test'（@types/jest? の提案付き＝globals） |
| TS2322 | 41 | 型代入不可 |
| TS2339 | 36 | プロパティ不存在 |
| TS2353 | 25 | object literal 未知プロパティ |
| TS2352/2345/2741/その他 | 41 | 変換/引数/必須プロパティ等 |

- **TS2304 + TS2582 = 971 = vitest globals 未認識**（source/test 比: test 1077 / source 37）。

## 2. root cause 調査（由来）
### A. globals 971 件 — 構造的ギャップ（単一 commit 由来でない）
- `vitest.config` は `globals: true`（テストは describe/it/expect を import 不要）。
- だが **`tsconfig.json` に `compilerOptions.types` フィールドが存在しない** → `vitest/globals` の型が tsc scope に入らない → globals 依存テストが全て「Cannot find name」。
- tsconfig.json 変更履歴は `init` + `Pre-production release` の 2 commit のみ＝**vitest/globals は一度も設定されていない**。globals-style テスト（alter-morning / calendar / coalter 等）が各セッションで増えるたびに件数が累積した。
- ★私の plan/dayRehearsal テストは `import { describe, it, expect } from "vitest"` を**明示 import** するためエラーなし（コードベースに 2 つのテスト記法が混在）。

### B. 実型エラー 143 件 — subsystem 別・一部は recent debt
- `app/api/stargazer/alter/route.ts`（~15）: **最近の A1-5-8/9 セッション**（Capture Write / Surface Read Integration）が perspectiveEngine に**存在しないメンバ**（`SearchTaskClassification` の import / `PerspectiveEngineResult.searchTaskClassification` / `SearchTask.explicit/confidence` / `personalityCtx` / `TrustLevel` / `ModeDecisionReason`）を参照。perspectiveEngine.ts に該当 export なし＝**route が未完成/旧 API 参照**。
- `app/(culcept)/ceo` + `app/api/ceo/dashboard` + `lib/ceo/skillTelemetry`（~6）: `SkillSummary`/`SkillSummaryResult` に `autoCloseCount` 欠落・skillTelemetry 引数型不一致。
- `app/(culcept)/origin/OriginPageClient`（1）: `onStartExploration` prop 欠落。
- `app/(immersive)/baseline/BaselineCollectionClient`（3）: readonly tuple 代入・`unknown` j・`label` 不存在。
- `lib/tour/tourState`（4）: `TourStates | null` の非 null 化漏れ。
- `lib/rendezvous/phase0/generatePairInsight`（2）: `AlterGrowthSummary.coreValues` 不存在。
- `lib/alter-morning/*`（~5）: intentParser `fixedStart` / llmPlanExtractor 比較 / morningPipeline SynthesisSource / journeyOriginPromotionTelemetry StargazerEvent。
- その他 source（MorningMapView google 型重複・useMemoryItems implicit any）。
- **test の実型エラー ~106**: alter-morning/journey(20)・extract(17)・post(13)・coalter/urgent(12)・plan/anchor(9・CreateExternalAnchorInput→Record 変換)・stargazer/conversation(5) 等。fixture/signature の陳腐化。

## 3. per-marker / Day Rehearsal 由来でない再確認
- 私の着地ファイル（`lib/plan/dayRehearsal/*` / `DayOutlookBanner` / `DayGraphTimeline` / `CalendarTab` / per-marker tests）に tsc エラー **0 件**。
- grep で `tests/unit/plan/` に出るのは **anchor 系**（anchorInputForm/anchorUpdateValidation/anchorPrefillIntegration/externalAnchorSupabaseRepository・TS2352）= **pre-existing・私の作業外**。

## 4. mini plan（修正順序・小 slice・各 slice は read-only 診断→最小修正→footprint 検証→着地。1 回で全部直さない）
| # | slice | 件数 | 内容 | リスク | 依存 |
|---|---|---|---|---|---|
| **S1 ✅ DONE** | **vitest globals 認識** | **−970** | `types/vitest-globals.d.ts`（`/// <reference types="vitest/globals" />`・additive）で解消。**main `a8eb7a04` 着地済**（1114→144・TS2304 622→1・TS2582 349→0）。runtime 不変（型のみ・9796 tests PASS）。closeout: `tsc-baseline-cleanup-s1-closeout.md`。 | 低 | 完了 |
| **S2** | ceo dashboard | ~6 | `SkillSummary`/`SkillSummaryResult` に `autoCloseCount` 追加 or 使用側削除。skillTelemetry 引数型整合。 | 低〜中 | S1 後 |
| **S3** | origin / baseline | ~4 | OriginPageClient `onStartExploration` prop 整合・BaselineCollectionClient tuple/unknown 修正。 | 低〜中 | S1 後 |
| **S4** | lib misc | ~13 | tourState null 化・generatePairInsight coreValues・alter-morning lib・MorningMapView・useMemoryItems。scattered な小修正を個別に。 | 低 | S1 後 |
| **S5** | stargazer/alter ↔ perspectiveEngine | ~15 | **要 owning-session 文脈**: A1-5-8/9 の searchTaskClassification 等が「未完配線」か「perspectiveEngine 側に追加すべき API」かを判定してから修正。core path のため慎重。 | **中** | S1 後・単独 slice |
| **S6** | test 型エラー（実型） | ~106 | alter-morning/journey・extract・post・coalter・plan-anchor の fixture/signature 陳腐化を subsystem 別に分割修正。runtime 影響なし。 | 低 | S1 後（最後） |

- **順序の根拠**: S1 が 87% を 1 ファイルで解消し baseline を tractable にする → 残り 143 の本当の形が見える。次に shipping code の型安全に効く source slice（S2-S5）。S5 は core path で文脈依存のため単独・慎重。test 型エラー（S6）は runtime 影響なしで最後。
- 各 slice 着地後に `--max-old-space-size=8192 npx tsc` で件数減を確認・footprint 0・該当 suite PASS を gate にする。

## 5. 制約 / 次アクション
- **実装は CEO GO 待ち**（slice ごとに承認 → 着手）。read-only 監査はここまで。
- push / PR / GitHub / Vercel / DB / Google API 不接触。git add 個別指定・stash/reset 禁止。
- 推奨: まず **S1（vitest globals）** を GO 候補に。1 ファイル additive・87%解消・runtime 不変で最も費用対効果が高い。S5 は owning session（A1-5-x）の意図確認を挟む。
- `npx tsc` は default ~2GB で OOM（exit 134）。計測は必ず `NODE_OPTIONS=--max-old-space-size=8192`。
