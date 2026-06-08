# R1–R5 + Orchestration — Deep Audit + Hardening（証拠付き・read-only→hardening）

> 2026-06-09 / Build Unit / CEO 指示「実接続前に壊れにくくする。defined→consumed→returned 漏れ・redaction・安全契約・境界違反・orphan・過剰推論を徹底監査」。
> pure/read-only audit + pure hardening + contract tests。route/DB/PlanClient/apply/notification/native/production 不接触。

## 0. 結論
**7 監査項目すべて PASS（証拠付き）。契約破壊なし・境界違反なし・過剰推論なし。** hardening として dead code 1 件除去・安全契約 test 8 件追加・orphan 1 件 flag。reality 79 files **1022 PASS**・tsc 55（baseline 不変）。

## 1. 監査結果（項目別・証拠）
| # | 項目 | 検証（証拠） | 判定 |
|---|---|---|---|
| 1 | R1 memory | synthesize の usableContexts は ready∧非suppressed のみ（suppressed/emerging/insufficient は除外・contract test）。correction 優先(suppress>adjust>narrow>trust)。**certainty high をどの adapter も生成しない**（grep 0 + capCertainty + contract test: high 入力でも ≤tentative）。trait/liked-disliked は memoryObservationHasViolation guard | ✅ |
| 2 | R2 empty-day | available windows のみ埋める(hard constraints 優先)。active+rest=全空き枠(overpacking なし・contract)。memory は重み付けのみ。PlanCandidate/LifeOps 正本型なし。block は抽象ラベル(具体行動なし) | ✅ |
| 3 | R3 WorldState | ContextSnapshot/WeatherKind は **import type のみ**(runtime 非結合・grep 0)。DayGraph/mobility 再実装なし(caller 渡し)。readiness 欠損を捏造せず flag | ✅ |
| 4 | R4 trigger | silence-by-default(閾値+cap1)。位置ベース(departure/linger/off_route)は deferred で**評価しない**(出力に出ない・test)。通知配送/route/push なし | ✅ |
| 5 | R5 permission | **高リスクは全 level で auto-allowed にならない**(contract: 4 action × 6 level × 8 flag)。ChangeSet は **add op のみ**(既存 item を mutate しない)。apply なし。insufficient_context 適切返却。reason redacted | ✅ |
| 6 | Orchestration | envelope は raw/seedRef/PII/personality/具体行動を出さない(**redaction contract: energy×weather×memory matrix**)。stopReasons 正出。missing signal 捏造なし。allowed でも apply 呼ばない(envelope は要約のみ) | ✅ |
| 7 | Cross-boundary | Plan/MAP/LifeOps 正本 runtime を import しない(pipeline は R1-R5 pure のみ)。canonical schema 作らず(R5 Level は内部)。**Date.now/Math.random/supabase/fetch/server-only が pure 層に 0 件**。server-only/client 混線なし | ✅ |

## 2. hardening（実施）
- **dead code 除去**: `reality-pipeline.ts` の no-op `FIT` 関数を除去（外科的）。
- **安全契約 test 追加**: `realityPipelineContract.test.ts`（8）= ①redaction matrix(energy×weather×memory) ②高リスク never auto-allowed(action×level×flag) ③no-high-certainty(adapter+envelope) ④suppressed 不使用 ⑤insufficient 捏造なし(draft null/stopReasons) ⑥silence-by-default。→ **契約を恒久ロック**。

## 3. orphan / dead-path 監査
- `FIT`（pipeline・no-op）→ **除去済**。
- `totalAvailableMinutes`（empty-day-input・export+test のみ・pipeline 未消費）→ **orphan flag**。削除せず保持（下流 coherence の公開 helper 候補・正しく動作・低リスク）。明示記録。
- 他の export は全て consumer あり（adapter→synthesis→derive→generate→reasoning→trigger→gate→draft→pipeline の連鎖で defined→consumed→returned が繋がる）。

## 4. 過剰推論チェック
- certainty high 生成 0・断定 copy 0（regex guard）・捏造 0（不明は null/insufficient）・偽数値 0（strain は粗い 3 段）・leaveBy は coarse flag。→ 過剰推論なし。
