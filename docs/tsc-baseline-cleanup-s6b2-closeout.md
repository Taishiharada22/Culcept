# tsc baseline cleanup — S6 batch2 closeout（test fixture）

> 2026-06-07 / **実装・main 着地完了**（CEO 承認） / 前提: S1(1114→144)・S2-S4(144→138)・S6 batch1(138→101)。

---

## 0. 状態
- **ローカル main 着地済**（squash・main HEAD `08ff945d`・親 `888b1c5a`）。code branch `claude/tsc-s6b2`（HEAD `0f375134`）保持。
- push/PR/GitHub/Vercel/DB/Google **未接触**。test fixture の明確安全 cluster のみ。production source 不接触・cast は意図的 inspection の 10 件限定。

## 1. 修正（14件・test-only・挙動不変）
| cluster | 件数 | 内容 |
|---|---|---|
| anchor cast | 10 | `(X as Record<string, unknown>).field).toBeUndefined()` → `as unknown as Record`（TS 推奨形）。**削除/非存在 field の不在確認＝意図的 inspection**（CEO 限定許可）。anchorUpdateValidation 6 / anchorInputForm 2 / anchorPrefillIntegration 1（全 as Record が対象=file replace_all）+ externalAnchorSupabaseRepository 1（3 中 line126 のみ per-line・他 2 は不変） |
| @ts-expect-error 除去 | 2 | declinedRecovery / locationOptInState の TS2578（unused directive=stale）除去 |
| planHistory mode | 1 | transportSegments.mode `"walking"→"walk"`（alter-morning TransportMode は walk・lib/plan の walking を誤用した stale 値） |
| previousDayInheritance | 1 | `result?.source` の JourneyAnchorState union を type-guard helper `labelOf()`（cast でなく `"label" in r`・assertion 不変）で narrow |

## 2. HARD GATE 遵守
- blanket sed なし（Edit tool・対象限定の file replace_all は全 occurrence が確認 inspection 対象のみ）。
- cast 計 **10 件ちょうど**（>10 で停止のところを限定）。全て削除/非存在 field の意図的 inspection（型黙らせでない）。
- production source 変更なし。test 期待値の意味変更なし。S5/perspectiveEngine 不関与。

## 3. before / after（main 計測）
| | before | after | 差 |
|---|---|---|---|
| 総 error TS | 101 | **87** | −14 |
| test | 70 | 56 | −14 |
| source | 31 | **31** | ±0 |
| 累計 S0→現在 | 1114 | **87** | **−1027（92%）** |

## 4. production 挙動変更の有無
- **なし**（test ファイルのみ・assertion 不変・cast は inspection・narrowing は type guard）。

## 5. 変更ファイル（8・全て test）
- plan: anchorUpdateValidation / anchorInputForm / anchorPrefillIntegration / externalAnchorSupabaseRepository
- alter-morning: declinedRecovery / locationOptInState / planHistory / previousDayInheritance

## 6. 検証
- tsc 101→87（−14）・source 31 不変・対象解消（planHistory 101 は別原因 missing field で意図的残置）・OOM なし。
- relevant vitest: plan + alter-morning **463 files / 9474 tests PASS**（exit 0）。
- zero-loss: branch `0f375134` 一致・scope外/temp/node_modules 混入 0・変更は test 8 ファイルのみ。

## 7. 残 87 = source 31（S5 stargazer/alter 15 + 残置 source 16）+ test 56
### 残置（CEO GO/仕様判断/別 slice）
- **postSelectionFlow null(13)**: prod 型 string vs test null（型変更/意味リスク）
- **urgentLayerDismiss(12)**: mock 必須欠落 + Mock→fn cast（仕様/Mock 判断）
- **stargazer(7)**: S5 core path
- **phaseC isWeekday(5)**: DayConditions に isWeekday/timeOfDay なし＝複数 stale field（test 意図が現モデル非対応の疑い）
- planHistory missing field / placeResolver HardAnchor / morningPipeline MorningPlan の mock 不足（要 default 値判断）・ceoScenario(MorningSession/normalizeLLMOutput)・planIntakeGate(missingFields)・presenceExecutorTelemetry(prod export 要)・realityCandidate(readonly 変異)・domainRouter("schedule")・sceneWeighting(arithmetic)・b3c2/b3b/planner 等 misc 個別原因

## 8. 次の cleanup slice 推奨
- 残置は各々 **prod 型/仕様判断/Mock 仕様/S5** を要するため、これ以上の test-only 安全 batch は限定的。次は CEO 判断で: postSelectionFlow/urgentLayerDismiss の仕様確認 / S5（owning session 文脈）/ source 残置の個別 GO。
- いずれも **CEO GO 待ち**（S6 batch2 完了で停止）。
