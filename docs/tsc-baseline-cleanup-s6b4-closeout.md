# tsc baseline cleanup — S6 batch4 closeout（test fixture・厳格 audit）

> 2026-06-07 / **実装・main 着地完了**（CEO 承認） / 前提: S1〜postSelectionFlow（1114→62）。

---

## 0. 状態
- **ローカル main 着地済**（squash・main HEAD `60ee0a9e`・親 `d2f3b64d`）。code branch `claude/tsc-s6b4`（HEAD `a9b5c9ef`）保持。
- push/PR/GitHub/Vercel/DB/Google **未接触**。test-only・production source/型/schema/export 不変・cast 不使用。

## 1. 厳格 audit（残 test 24・S5 7 除外）
| cluster | 判定 |
|---|---|
| **phaseC isWeekday/timeOfDay (5)** | **SAFE**: production 参照ゼロ・DayConditions に無し・**現行 field への置換なし=removed-old-spec dead field**。assertion 不参照・残 field(mainTransport)有効 |
| **realityCandidate Generator/Evaluator (2)** | **SAFE**: test 入力構築の局所変数が Readonly 型で write 不可。mutable 局所型に変えるだけ（同一 record・cast なし） |
| b3bFoundation (1) | **STOP**: NormalizedPlaceCandidate mock が 3 rename + 2 余剰(rating/rawTypes) + 2 missing(chainToken/**rawRef=複合型構築要**)＝多 field overhaul |
| postSelectionFlow rawRef (1) | **STOP**: PlacesRawRef（複合型）構築要 |
| placeResolver (2) / planHistory (1) / planHistoryRoundTrip (1) | **STOP**: HardAnchor の order/anchorScore・PlanItem の fixedStart 等＝**semantic 値判断**（resolver/serialize に影響しうる） |
| ceoScenario (3) | **STOP**: MorningSession 名前空間除去/normalizeLLMOutput 衝突=spec・混在 |
| planIntakeGate (1) | **STOP（保守）**: assertion 式中の `response.missingFields`(型に無し)。runtime 不変だが assertion 編集 |
| domainRouter (1) | **STOP**: alternates の "schedule"(DailyDomain に無し)・削除は test 意図変更リスク |
| presenceTelemetry (1) | **STOP**: production export 追加要 |
| sceneWeighting (1) / planner (1) / morningPipeline (2) / b3c2 (1) | **STOP**: 個別 spec/型判断 |
| stargazer (7) | **除外**: S5/perspectiveEngine |

## 2. 修正（7件・test-only・cast 不使用・挙動不変）
1. **phaseC-integration (5)**: DayConditions literal から `isWeekday`/`timeOfDay`（dead fixture）を除去（5 literal × 2 field = 10 行削除）。残 `{ mainTransport }` 有効。
2. **realityCandidate Generator/Evaluator (2)**: `const anchors: RealityInput["anchors"](Readonly) = {}` → `Record<string, RealityInput["anchors"][string]>`（mutable・同値型・cast/新 import なし）。

## 3. production 挙動変更の有無
- **なし**。test 3 ファイルのみ・assertion 不変・cast 不使用。phaseC は buildDayPlan が元々 isWeekday/timeOfDay を読まない（DayConditions に無い）ため挙動不変。realityCandidate は同一 record を構築。

## 4. before / after（main 計測）
| | before | after | 差 |
|---|---|---|---|
| 総 error TS | 62 | **55** | −7 |
| source | 31 | **31** | ±0 |
| 累計 S0→現在 | 1114 | **55** | **−1059（95%）** |

## 5. 変更ファイル（3・全て test）
- `tests/unit/alter-morning/phaseC-integration.test.ts` / `tests/unit/realityCandidateGenerator.test.ts` / `tests/unit/realityCandidateEvaluator.test.ts`

## 6. 検証
- tsc 62→55（−7）・source 不増・対象解消・OOM なし。
- vitest: phaseC + realityCandidate **3 files / 82 PASS** + alter-morning **199 files / 4501 PASS**（exit 0）→ 挙動不変。
- zero-loss: branch `a9b5c9ef` 一致・変更は test 3 ファイルのみ。

## 7. 残 55 = source 31（S5 stargazer/alter 15 + 残置 source 16）+ test 24
### 残 test 24（全て judgment 要・無判断 test-only safe は尽きた）
- rawRef 系 mock 構築（b3bFoundation/postSelectionFlow rawRef）・semantic 値 mock（placeResolver/planHistory）・ceoScenario(spec)・planIntakeGate/domainRouter(assertion/enum 意図)・presenceTelemetry(prod export)・sceneWeighting/planner/morningPipeline/b3c2(個別)・stargazer 7(S5)。

## 8. 次の推奨
- **test-only かつ無判断 safe はほぼ尽きた**（5 batch + postSelectionFlow で 1114→55、95%減）。残 55 は (a) production export/型整合 (b) mock の semantic 値・複合型構築 (c) spec review (d) S5、のいずれかを要する。
- 次は CEO 判断: ① baseline をこの水準（55・95%減）で据え置き別作業へ ② 残置クラスタの個別 spec GO ③ S5（owning session 文脈）。
- CEO GO 待ち（S6 batch4 完了で停止）。
