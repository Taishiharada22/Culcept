# tsc baseline — postSelectionFlow activity null→"" closeout

> 2026-06-07 / **実装・main 着地完了**（CEO GO・案A） / mini design: `…-postselectionflow-mini-design.md`。

---

## 0. 状態
- **ローカル main 着地済**（squash・main HEAD `d2f3b64d`・親 `8eeec516`）。code branch `claude/tsc-psf`（HEAD `1b6bfe94`）保持。
- push/PR/GitHub/Vercel/DB/Google **未接触**。test-only・production source/型/schema 不変。

## 1. 何をしたか（案A）
- `tests/unit/alter-morning/postSelectionFlow.test.ts` の `what.{activity, activityCanonical}: null → ""`（6 ペア=12 箇所）。
- 根拠: test fixture が「what 未指定」を `null` で表していたが、**production は `""`（空文字）で表す**（WhatSlot.activity は `string` 必須・production は null 不生成）。
- **全 consumer が null/"" を falsy 同一扱い**（answerBinder/provenanceChecker/operationDispatcher の `!activity`、eventSchema/reconcile/gapResolver の `?? ""`）→ runtime 挙動・test assertion **不変**。
- `missing_semantic_critical:["what"]` で「what 未指定」を表現＝test 意図不変。

## 2. production 挙動変更の有無
- **なし**。test 1 ファイルのみ。型/schema/production source 不変。null→"" は consumer が同一扱いのため挙動不変。

## 3. before / after（main 計測）
| | before | after | 差 |
|---|---|---|---|
| 総 error TS | 74 | **62** | −12 |
| source | 31 | **31** | ±0 |
| 累計 S0→現在 | 1114 | **62** | **−1052（94%）** |

## 4. 検証
- tsc 74→62（−12）・source 不増・activity-null 12 解消・OOM なし。
- vitest: postSelectionFlow **7 PASS** + alter-morning **199 files / 4501 PASS**（exit 0）→ null/"" 同一扱いを runtime で確認。
- zero-loss: branch `1b6bfe94` 一致・変更は test 1 ファイルのみ。

## 5. 残（postSelectionFlow 関連）
- line 154 `rawRef` missing（NormalizedPlaceCandidate mock の必須 field 欠落）= activity-null と別原因（mock-shape）。本 slice 対象外で残存。

## 6. 残 62 = source 31（S5 stargazer/alter 15 + 残置 source 16）+ test 31
- 残 test 31 = phaseC(5・spec)・mock multi-field stale(b3b/placeResolver/planHistory/postSelectionFlow rawRef 等)・ceoScenario/planIntakeGate/presenceTelemetry/realityCandidate/domainRouter/sceneWeighting/planner 個別。
- いずれも spec/prod/multi-field/S5 判断要。CEO GO 待ち。
