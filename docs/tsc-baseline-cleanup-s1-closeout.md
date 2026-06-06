# tsc baseline cleanup — S1 closeout（vitest globals 認識）

> 2026-06-07 / **実装・main 着地完了**（CEO 承認） / 前提: 監査 `docs/tsc-baseline-cleanup-audit.md`（1114 errors・S1=globals ~971）。

---

## 0. 状態
- **ローカル main 着地済**（squash・main HEAD `a8eb7a04`・親 `a13448bb`）。code branch `claude/tsc-s1-vitest-globals`（HEAD `f88b4848`）保持。
- push / PR / GitHub / Vercel / DB / Google API **未接触**。**S1 のみ**（S2 以降は CEO GO 待ち・未着手）。

## 1. 何をしたか
- `types/vitest-globals.d.ts`（**13 行・additive**）を追加: `/// <reference types="vitest/globals" />` + 背景コメント。
- `tsconfig.json` の `include: **/*.ts` で tsc に取り込まれ、`vitest/globals`（node_modules/vitest/globals.d.ts の `declare global { let describe/it/expect/test/... }`）を global scope に持ち込む。
- ★`tsconfig.json` は**変更していない**（additive d.ts のみで解決＝types フィールド restrict の副作用を回避）。

## 2. before / after（main 計測・`--max-old-space-size=8192 npx tsc --noEmit`）
| 指標 | before | after | 差 |
|---|---|---|---|
| 総 error TS | 1114 | **144** | **−970** |
| TS2304（Cannot find name） | 622 | 1 | −621 |
| TS2582（describe/test globals） | 349 | 0 | −349 |
| OOM | 0 | 0 | — |
| d.ts 自体のエラー | — | 0 | — |

- 残 TS2304 1 件 = `tests/unit/alter-morning/travelTimeEngine.test.ts: Cannot find name 'fail'`（vitest は jest の `fail()` を持たない＝S6 のテスト修正対象・S1 範囲外）。

## 3. production 挙動変更の有無
- **なし**。d.ts は型のみ（runtime emit なし）。Next.js は SWC で bundle（d.ts を runtime に含めない）。app source 不変。vitest 実行環境（globals:true）は元々 runtime で globals を提供しており不変。

## 4. 変更ファイル
- `types/vitest-globals.d.ts`（新規・additive・13 行）のみ。既存テストファイル・tsconfig・production source は無変更。

## 5. 検証
- tsc: 1114→144（§2）・d.ts 自体エラー 0。
- runtime test 非影響: globals エラーがあった `tests/unit/alter-morning/` + `tests/unit/calendar/` + `tests/unit/plan/` = **479 files / 9796 tests PASS**（exit 0）。globals は元々 runtime 提供・tsc だけが盲目だったことを実証。
- zero-loss: branch `f88b4848` と byte 一致。scope外/temp/node_modules 混入 0。

## 6. 残 144 件（S2 以降・CEO GO 待ち・実装未着手）
| slice | 件数 | 内容 |
|---|---|---|
| S2 ceo dashboard | ~6 | SkillSummary/SkillSummaryResult autoCloseCount・skillTelemetry 引数型 |
| S3 origin / baseline | ~4 | OriginPageClient onStartExploration・BaselineCollectionClient tuple/unknown |
| S4 lib misc | ~13 | tourState null 化・generatePairInsight coreValues・alter-morning lib 等 |
| S5 stargazer/alter ↔ perspectiveEngine | ~15 | searchTaskClassification 等（core path・owning session 文脈要・中リスク） |
| S6 test 型エラー | ~106 | alter-morning/journey/extract/post・coalter・plan-anchor の fixture 陳腐化・`fail()` 含む |

## 7. 次の cleanup slice 推奨
- **S2（ceo dashboard・~6・低〜中リスク・source）** または **S6 の最小 sub-slice** から。S5（stargazer/alter）は A1-5-x owning session の意図確認を挟む。いずれも **CEO GO 待ち**（S1 完了で停止）。
