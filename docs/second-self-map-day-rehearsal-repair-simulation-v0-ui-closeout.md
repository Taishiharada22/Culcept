# Day Rehearsal — What-if / Draft Preview v0 UI 配線 closeout

> 2026-06-08 / Build Unit / CEO GO + smoke PASS
> pure layer: `…-repair-simulation-v0-closeout.md`。本書は **UI 配線**（最小・非冗長）の closeout。

---

## 1. 何を配線したか
`previewRepairSimulation`（予定変更なし counterfactual）の結果を、**「どうするとよさそう？」disclosure の候補文の下に小さく 1 行**で表示。
- `repairSimulationShortLine(result)`（pure・dayRepairSimulation.ts）: **leave_earlier の eases_conditionally のみ**短文を返す（他 kind / 弱根拠は null=非表示）。
  - local+day 改善 → 「試すと、この移動が和らいで、その日全体も少しゆとりが出そうです」
  - local のみ → 「試すと、この移動は和らぎそうですが、その日全体はまだ立て込みやすそうです」
  - day のみ → 「試すと、その日全体に少しゆとりが出そうです」
  - どちらも動かない → null（根拠が弱いなら出さない＝HARD GATE）
- `DayOutlookBanner`: `simulationLineByKind?: Map<kind, string>` prop。候補 `<li>` 下に `<span>` 1 行（read-only・slate-400・button/input なし）。
- `CalendarTab`: `rehearsalInput` を独立 memo 化 → `previewRepairSimulation(input, candidate)` を表示候補ごとに再実行 → `repairSimulationLineByKind` を banner へ。

## 2. ★記録（CEO 指定の確認事項）
- ✅ **leave_earlier のみ** simulation line 表示。
- ✅ **protect_buffer / use_recovery_window / confirm_uncertain / reduce_density は非表示**（候補文と重複 or 試算不可ゆえ null）。
- ✅ **read-only 維持**（表示テキストのみ・実行 UI なし）。
- ✅ **apply / save / 予定変更なし**。
- ✅ **UI 過多なし**（候補文の下に 1 行のみ・既存 disclosure 内・新 tap target なし）。
- ✅ **生数値 / confidence / raw evidence なし**（summary は質的のみ・level/outlook は internal）。
- ✅ **smoke PASS**（http://localhost:3002/plan・6/8 で leave_earlier に「和らぎそうですが、その日全体はまだ立て込みやすそう」表示・他候補は非表示・非破壊）。

## 3. ★非冗長性（Batch 4 NO-GO の教訓を解消）
- 候補文 = **action**（「出発を早める余地」）/ sim 行 = **effect**（「試すと…どうなるか」）。register が異なり**重複しない**。
- Batch 4 別 UI（preview.body）が NO-GO だったのは candidate-only の言い替えだったため。本 sim 行は **rehearsal 実データの before/after**（候補文にない新情報）を持つので非冗長。

## 4. 検証
- 新規: `repairSimulationShortLine` SIM15-19（4 ケース + 非表示分類 + HARD GATE 弱根拠 null + forbidden copy）。
- render contract WIF1-6（leave_earlier のみ行表示 / 他 kind 非表示 / read-only span / slate・禁止語なし / 0 件で非表示）。
- **plan suite 5116 PASS**・**tsc footprint 0（total 55 不変）**・main worktree で 46 PASS 再確認（zero-loss）。

## 5. HARD GATE（CEO 指定）全 PASS
| gate | 対応 |
|---|---|
| 候補文と重複するなら表示しない | leave_earlier は action vs effect で非冗長・他 kind は null（非表示） |
| 何が変わるか根拠が弱いなら表示しない | local も day も動かない leave_earlier は null（SIM18 で機械保証） |

## 6. 着地・ブランチ
- main 着地: **`e7b45272`**（zero-conflict=178+/12-・commit と一致・他セッション非接触）。
- code branch: `claude/dr-repair-sim`（HEAD `4fff9170`・保持）。

## 7. What-if / Draft Preview v0 の状態（task 8: 正確な整理）
- **pure layer**（`previewRepairSimulation` + 候補分類 + counterfactual・main `ad0c9ee7`）：完了。
- **UI 配線**（leave_earlier の「試すと…」1 行・main `e7b45272`）：完了・smoke PASS・live。
- **表示対象**: leave_earlier のみ。preserve/uncertain/ambiguous は非表示（設計通り）。
- **未実装（将来・gated）**: 定量 preview（「余白が方向として増えそう」を超える magnitude）＝数値露出 gate ゆえ慎重。protect/recovery の能動的 what-if（保全 → 悪化回避の inverse 試算）＝価値・安全性が要検証。other-party 等は範囲外。
