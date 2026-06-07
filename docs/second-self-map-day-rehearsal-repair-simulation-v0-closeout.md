# Day Rehearsal — What-if / Draft Preview v0（previewRepairSimulation）closeout

> 2026-06-08 / Build Unit / CEO GO（audit-first → safe → pure layer 実装）
> audit: `…-repair-simulation-v0-audit.md`。前段: Batch 4 別 UI NO-GO（candidate↔preview 重複）。
> 本 v0 は **rehearsal の実データを使う本格 counterfactual simulation**（candidate-only の旧 preview とは別物）。

---

## 1. 何を作ったか
`lib/plan/dayRehearsal/dayRepairSimulation.ts` の **`previewRepairSimulation(input, candidate, config?)`**（+ 一括 `previewRepairSimulations`）。
「候補を**仮に採用したら** 1 日の見通しがどう変わるか」を、**予定を一切書き換えず** counterfactual re-simulation（rehearseDay 再実行）で試算する pure layer。**未配線（UI なし・production 不変）**。

## 2. 候補分類（audit 確定・実コード根拠）
| kind | status | simulatable | 試算内容 |
|---|---|---|---|
| **leave_earlier** | `eases_conditionally` | ✅ | 対象 transition を `bufferStatus="sufficient" + slackMin/shortfallMin=null`（**数値を作らず**「解消できれば」）に置換し rehearseDay 再実行。before/after の convergence・outlook を質的比較 |
| **protect_buffer** | `preserves` | ✅(保全) | 余白は確保済・convergence は strain/friction 由来ゆえ守っても delta なし → diff=null（改善を捏造しない） |
| **use_recovery_window** | `preserves` | ✅(保全) | 一息は確保済 → 守る＝現状維持・diff=null |
| **confirm_uncertain** | `uncertain` | ❌ | 移動の余白が未確定 → 捏造不可 |
| **reduce_density** | `ambiguous_target` | ❌ | 対象 step が無い（targetStepIndex null）→ 不可 |

## 3. ★honest 設計（捏造しない）
- leave_earlier の counterfactual を実エンジン repro で検証: 単一不足を解消 → 対象 step の marker 消滅 + outlook 改善（breaks→tight）。複数不足のうち 1 つ解消 → 対象 step は和らぐが **outlook は据置**（他に不足が残る）。
- → **local（対象区間が和らぐ）と day（1日全体）を別々に報告**。「この区間は和らぐが、ほかにも不足があり、その日全体ではまだゆとりは出にくいかも」と過剰主張しない。
- 長距離移動で strain も高い区間は、buffer 解消後も strain+friction で marker が残る → `localEased=false`「大きくは変わらないかも」と正直に出す（これも捏造でない honest ケース）。
- `slackMin=null` 置換ゆえ recovery は 0（恩恵を盛らない・保守的）。

## 4. 検証（SIM1-14・全 PASS）
- 分類: SIM1 ambiguous_target / SIM2 uncertain / SIM3-4 preserves（diff=null）。
- leave_earlier: SIM5 単一→localEased+outlookEased / SIM6 複数→localEased ∧ ¬outlookEased（「ほかにも」but節） / SIM7 factorsResolved に buffer_short / SIM8 HARD GATE 防御（不整合→uncertain）。
- 安全: SIM9 生数値なし / SIM10 level・outlook 名なし / SIM11 警告/断定語なし・仮説トーン / SIM12 **read-only（入力 RehearsalInput 不変）** / SIM13 決定的 / SIM14 一括順序保持。
- **dayRehearsal suite 168 PASS**・**tsc footprint 0（total 55 baseline 不変）**・main worktree で 14 PASS 再確認（zero-loss）。

## 5. HARD GATE（CEO 指定）全 PASS
| gate | 対応 |
|---|---|
| 対象 step が無いなら停止 | reduce_density（target null）→ ambiguous_target に分類（試算しない） |
| before/after を捏造するなら停止 | 実エンジン再実行のみ・preserves/不可 は diff=null・slack/shortfall=null（数値を作らない） |
| 根拠なき数値改善を出すなら停止 | summary 質的のみ・magnitude は unknown 明記・SIM9/10 で機械保証 |
| pure simulation できない候補は不可分類 | confirm_uncertain=uncertain・reduce_density=ambiguous_target |
| UI に進む前に止める | **本 v0 は pure layer のみ・UI 配線せず** |

## 6. 禁止事項の遵守
実予定変更なし / apply なし / DB write なし / Google API なし / production・Vercel・GitHub・push・PR なし / **新 UI なし** / tsc cleanup なし / Reality action なし。pure 関数・READ のみ・Date 不使用。

## 7. 着地・ブランチ
- main 着地: **`ad0c9ee7`**（additive・新規 2 ファイル・zero-conflict・未配線=production 不変）。
- code branch: `claude/dr-repair-sim`（HEAD `08bf0796`・保持）。

## 8. 状態と次
- **What-if/Draft Preview v0 pure layer 完了**（実装 + test + tsc footprint 0 + closeout）。
- 次（CEO 判断）: **UI 配線**（previewRepairSimulation を「もしやるなら？」second-level disclosure 等に出すか）。
  - ★Batch 4 別 UI NO-GO の教訓: candidate.suggestion と重複しない出し方が必須。本 simulation は **before/after の変化（candidate にない新情報）**を持つので、重複回避の余地がある（leave_earlier の「その日全体はまだ…」等）。UI 配線時は重複・UI 過多を再 audit。
- 将来拡張: 定量 preview（「余白が方向として増えそう」を超えた magnitude）は数値露出 gate ゆえ慎重に。
