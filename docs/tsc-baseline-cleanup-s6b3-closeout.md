# tsc baseline cleanup — S6 batch3 closeout（test fixture・厳格 audit）

> 2026-06-07 / **実装・main 着地完了**（CEO 承認） / 前提: S1〜S6b2（1114→87）。CEO 指示=より厳格な audit。

---

## 0. 状態
- **ローカル main 着地済**（squash・main HEAD `8eeec516`・親 `08ff945d`）。code branch `claude/tsc-s6b3`（HEAD `396d8012`）保持。
- push/PR/GitHub/Vercel/DB/Google **未接触**。**厳格 audit で test-only・無判断で安全なものだけ**。production source 不接触・cast 不使用。
- ★ディスク満杯（100%）に遭遇→着地済 worktree 6 本削除（branch 全保持）+ Culcept/.next 削除で 15Gi 解放後に実施。

## 1. 厳格 audit（CEO 必須 5 観点）
| 観点 | 判定 |
|---|---|
| 1. postSelectionFlow null→string | **STOP**: JSON schema(structuredSchema:274)は `["string","null"]` 許容だが TS 型(eventSchema:113)は `activity: string`＝**production 型の不整合**。解消は型を string\|null にする production 仕様判断。 |
| 2. urgentLayerDismiss mock 必須 field 欠落 | **SAFE**: `UrgentDecision.reason` はテストで未 assert＝型のみ required。placeholder 追加で安全。 |
| 3. Mock→fn cast | **SAFE（cast でなく clean 化）**: `ReturnType<typeof vi.fn>`(=broad Mock)→`Mock<() => void>` + `vi.fn<() => void>()`。typed generic で mock method 保持 + `()=>void` 代入可。cast ゼロ。 |
| 4. phaseC isWeekday/timeOfDay | **STOP（保守）**: production 参照ゼロ・DayConditions に無し＝removed-old-spec dead field。assertion 不在で機械的除去は可だが、test の weekday/timeOfDay 意図が**元々未配線**＝この test が何を検証すべきか spec review 要。CEO の phaseC HARD GATE に鑑み停止。 |
| 5. misc test errors | 一部 SAFE（implicit any 注釈）/ 大半は multi-field stale shape or 個別 spec で STOP。 |

## 2. 修正（13件・test-only・挙動不変・cast 不使用）
1. **urgentLayerDismiss (12)**: makeDecision factory に `reason: "test"`（型必須・未 assert placeholder）+ dismissMock を `Mock<() => void>` 宣言 + `vi.fn<() => void>()`（typed generic）。`type Mock` を vitest から import。
2. **journeyOriginDebugLog (1)**: `infoSpy.mock.calls.map((c: unknown[]) => c[0] as string)`（implicit any 解消・非 any・既存 cast 維持）。

## 3. production 挙動変更の有無
- **なし**。test 2 ファイルのみ・assertion 不変・cast 不使用（typed vi.fn generic は cast でない）。

## 4. before / after（main 計測）
| | before | after | 差 |
|---|---|---|---|
| 総 error TS | 87 | **74** | −13 |
| test | 56 | 43 | −13 |
| source | 31 | **31** | ±0 |
| 累計 S0→現在 | 1114 | **74** | **−1040（93%）** |

## 5. 変更ファイル（2・全て test）
- `tests/unit/coalter/urgentLayerDismiss.test.ts` / `tests/unit/alter-morning/journey/journeyOriginDebugLog.test.ts`

## 6. 検証
- tsc 87→74（−13）・source 31 不変・対象解消・OOM なし。
- relevant vitest: coalter + alter-morning **432 files / 9171 PASS**（1 skip 既存・exit 0）。
- zero-loss: branch `396d8012` 一致・scope外/temp/node_modules 混入 0。

## 7. 残 74 = source 31（S5 stargazer/alter 15 + 残置 source 16）+ test 43
### 残置（全て judgment 要・これ以上の無判断 test-only safe batch はほぼ尽きた）
- **postSelectionFlow null(13)**: production 型 string vs JSON schema null（仕様判断）
- **phaseC isWeekday/timeOfDay(5)**: removed-old-spec dead field・weekday 意図未配線（spec review）
- **b3bFoundation/placeResolver/planHistory/planHistoryRoundTrip/morningPipeline**: mock の multi-field stale shape（複数 rename・required default 値判断）
- **ceoScenario(MorningSession 名前空間/normalizeLLMOutput 衝突)・planIntakeGate(missingFields)・presenceExecutorTelemetry(prod export 要)・realityCandidate(readonly index 変異)・domainRouter("schedule")・sceneWeighting(arithmetic)・planner(arg 数)・b3c2(mock fn)**: 個別 spec/型判断
- **stargazer(7)**: S5 core path

## 8. 次の推奨
- **test-only かつ無判断で安全な残りはほぼ尽きた**。残 test 43 は (a) production 型整合（postSelectionFlow）(b) spec review（phaseC・各 mock の現行型 default 値）(c) S5、のいずれかを要する。
- 次は CEO 判断で: ① mock multi-field stale shape 群（placeResolver/planHistory/b3bFoundation 等）を「現行型への mock 補正」として GO するか（default 値の妥当性確認込み）② postSelectionFlow の production 型を string\|null にするか ③ S5（owning session 文脈）④ baseline をこの水準（74・93%減）で一旦据え置き別作業へ。
- いずれも CEO GO 待ち（S6 batch3 完了で停止）。
