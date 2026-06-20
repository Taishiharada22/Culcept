# Second Self Map — v0 closeout（smoke 結果記録）

> 2026-06-05 / code branch `claude/second-self-map-v0`（HEAD `1f768ca6`）/ main 未着地
> v0-A〜F 実装完 + smoke 実施。本書は smoke 結果と closeout 判断の記録。
> **結論: 自立（logic/wiring/render・mobility 84 test）+ CEO 手動 live（A〜D + 視覚 5 点）ともに完全 PASS・closeout 可能。**

## 1. 自立 smoke の方針（なぜこの形か）
実機 `/plan` は **auth-gated**（未認証 → `/login` へ HTTP 307）、かつ Claude in Chrome に**ブラウザ未接続**のため、Claude が実機 /plan を直接ロードできない（認証情報の入力は禁止行為）。
→ A〜I の**ループロジックを実モジュール経由の integration test で決定的に検証**（`tests/unit/plan/mobility/v0LoopIntegration.test.ts`・mock localStorage で `saveSelectedMode`/`saveHypothesisFeedback`/`loadWeightedModeBelief`/`resolveMobilityGuidance` を round-trip）。
→ MapTab の React 配線は **read-only コード監査**。描画（MobilityLegCard）は **v0-D smoke PASS 済 + v0-E/v0-F 無変更**。

## 2. A〜I PASS/FAIL（CEO「必ず確認」項目）
| 項目 | 期待 | 結果 | 根拠（integration） |
|---|---|---|---|
| A surface | train 履歴で「いつもは電車」 | ✅ PASS | headline に "電車"+"いつもは"・surfacedMode=train・recall 抑止 |
| B 訂正記録 | 徒歩選択で explicitCorrection 保存 | ✅ PASS | `{explicitCorrection, surfacedMode:train, chosenMode:walk}` |
| C 拮抗沈黙 | train/walk 拮抗で沈黙 | ✅ PASS | counts `{train3,walk4}`・topShare 0.57<0.6・hypothesis null |
| D 逆転 | correction 積もり「いつもは徒歩」 | ✅ PASS | counts `{train3,walk6}`・0.67・surfacedMode=walk・headline "徒歩" |
| E confirmation 非増幅 | 記録されるが増幅しない | ✅ PASS | kind=confirmation・counts `{train3}`（plain 選択と同値） |
| F cold-start 沈黙 | 履歴ゼロで沈黙 | ✅ PASS | hypothesis null・surfacedMode null |
| G sensitive 沈黙非記録 | 沈黙 + feedback 記録なし | ✅ PASS | hypothesis null・buildFeedbackEntry→null |
| H readOnly 沈黙非記録 | done 沈黙 + 記録なし | ✅ PASS | hypothesis null・readOnly→null |
| I stale 非加重 | chosenMode≠最終mode は重みに使わない | ✅ PASS | bus=weight1（not 2） |

→ **A〜I 全 PASS（ロジック層・決定的）**。mobility unit 計 **84 test PASS**。

## 3. 既存 UI 確認（視覚）
| 項目 | 状態 |
|---|---|
| MobilityLegCard 開閉 | v0-D PASS 済・以降**無変更** |
| mode chip 選択 | v0-D PASS 済・onSelect を handleLegSelectWithFeedback に差替（既存 save path 不変・追加のみ） |
| 所要時間目安 | v0-D PASS 済・無変更 |
| ガラス線/オーラ/ルート表示 | v0-D PASS 済・無変更 |
| recall と hypothesis 非重複 | ロジック保証（guidance が surface 時 recallMode=null）+ v0-D PASS |

→ 描画ロジックは v0-D 以降**無変更**。**2026-06-05 CEO 手動 live smoke（実機 localhost:3012）で A〜D + 視覚 5 点すべて PASS**。

## 4. MapTab 配線監査（read-only・統合点 5/5 整合）
| 統合点 | 行 | 状態 |
|---|---|---|
| `belief = loadWeightedModeBelief(openLeg.legKey)` | 328 | ✅ |
| `surfacedMode = guidance.surfacedMode` | 341 | ✅ |
| `handleLegSelectWithFeedback`（feedback 記録） | 349–357 | ✅ |
| `hypothesisCopy={mobilityCardData.hypothesisCopy}` | 472 | ✅ |
| `onSelect={handleLegSelectWithFeedback}` | 474 | ✅ |

## 5. localStorage 状態（integration が実証）
- `aneurasync.plan.map.selectedMode.v1` … 現在選択の正本（version 1・`byDay[day][leg]=mode`）。**v0 で破壊なし**。
- `aneurasync.plan.map.hypothesisFeedback.v1` … 文脈注釈（version 1=schemaVersion・`byDay[day][leg]={kind,surfacedMode,chosenMode}`）。confirmation/explicitCorrection のみ・selected は非記録。

## 6. production 挙動変更
- **v0-E**: mode 選択時、**仮説表示時のみ** feedback を別 store に記録（UI 不変・silent）。
- **v0-F**: belief が precision 加重に（correction が topMode/strength に weight2 で効く）。仮説 surface 条件が変わる（train→沈黙→walk の滑らかな遷移）。
- `selectedModeStore` は不変。downstream（gate/copy/card）はコード変更なし。

## 7. closeout 判断
- **v0 smoke 完全 PASS**: 自立（A〜I logic + 配線監査 + 描画無変更・mobility 84 test）+ **CEO 手動 live（A〜D + 視覚 5 点・実機 localhost:3012・2026-06-05 all pass）**。
- → **closeout 完了**。Wave 0（仮説→選択→feedback→belief 反映のループ）完成。
- **main 着地完了（2026-06-05・CEO 承認）**: branch `claude/second-self-map-v0` → ローカル main に **squash 着地**（main HEAD `5f05391f`）。**zero-loss 検証 ✅**（v0 17 ファイル完全一致）・**main tsc footprint 0**（total 1114 維持）・衝突なし・temp 混入なし。**push / PR / GitHub は未実施（禁止遵守）**。

## 8. 参照
- smoke 手順: `docs/second-self-map-v0-smoke-plan.md`
- 実装計画: `docs/second-self-map-implementation-plan.md`
- v0-F 設計: `docs/second-self-map-v0f-mini-design.md`
- integration test: `tests/unit/plan/mobility/v0LoopIntegration.test.ts`（code branch）
