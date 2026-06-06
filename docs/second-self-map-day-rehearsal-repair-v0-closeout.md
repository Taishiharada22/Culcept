# Day Rehearsal — Repair Candidate v0 closeout（pure layer・read-only・未配線）

> 2026-06-07 / **W-Repair-1 audit + pure layer 実装・branch commit 完了。UI 配線前で停止**（CEO/GPT GO） / 前提: Day Rehearsal engine + Evidence/marker が main live。

---

## 0. 状態
- code branch `claude/dr-repair-v0`（HEAD `eeca4fcc`）。**main 着地・UI 配線は CEO 判断待ち**（原典 step4 pure layer と同様 branch → CEO GO の段階）。
- 予定変更 / repair 実行 / optimize / auto-reschedule / 保存 / DB / Google API / push / PR / Vercel / UI 配線 / PlanClient 変更 **一切なし**。

## 1. W-Repair-1 read-only audit（安全判定）
| 確認項目 | 結果 |
|---|---|
| Day Rehearsal 出力に必要シグナルが揃うか | ✅ viability.outlook / convergencePoints / steps[].bufferStatus(SlackStatus=sufficient\|insufficient\|not_applicable) / steps[].convergence.factors / recoveryWindows / density / coverage / evidence |
| Repair 候補を作る根拠が十分か | ✅ 各 kind に明確なシグナル（convergence/insufficient/not_applicable/recovery/packed） |
| 予定を動かさず候補だけ生成できるか | ✅ rehearsal 出力からの pure 導出のみ（mutation/scheduling/DB なし） |
| copy が断定・警告・命令にならないか | ✅ suggestion トーンに閉じ可（「〜するとよさそう」「〜かもしれません」） |
| UI 前に pure function で閉じられるか | ✅ `DayRepairCandidate[]` を返す純粋関数 |
- → **安全** と判断し pure layer 実装に進んだ（HARD GATE 全通過）。

## 2. 実装（pure・read-only）
- `lib/plan/dayRehearsal/dayRepairCandidates.ts`: `generateDayRepairCandidates(rehearsal, context?) → readonly DayRepairCandidate[]`
- `DayRepairCandidate = { kind, suggestion, targetStepIndex, evidence }`・`DayRepairContext = { recoverySteps? }`
- kinds と発火条件:
  | kind | 条件 | copy |
  |---|---|---|
  | leave_earlier | bufferStatus insufficient | 「ここは出発を少し早める余地があるかもしれません」 |
  | protect_buffer | convergence かつ insufficient でない（leave_earlier と排他） | 「この前後は余白を守ると、予定が重なりにくそうです」 |
  | confirm_uncertain | bufferStatus not_applicable かつ friction!=null（transition のみ） | 「未確定の移動の余白を確認できると安心かもしれません」 |
  | use_recovery_window | recoverySet（context.recoverySteps 優先・無ければ recoveryWindows） | 「ここで一息入れられそうです」 |
  | reduce_density | density packed（全体・targetStepIndex null） | 「予定が立て込む区間を少し軽くできると、ゆとりが生まれそうです」 |
- **viability unknown / シグナルなし → 候補 0**（根拠が弱い時は出さない）。各候補に evidence trace。

## 3. 不変原則の遵守
- read-only（予定変更/repair 実行/保存なし）・pure・Date 不使用・UI 未配線。
- copy: suggestion トーンのみ・**禁止語（危険/警告/失敗/疲れ/壊れ/絶対/すべき）なし**・生スコア/係数/内部点数なし・evidence trace あり。
- ★GPT 例文「壊れにくそう」は禁止語「壊れる」に抵触するため**不採用**→「重なりにくそう」に置換。

## 4. 検証
- unit **13**（R1 unknown→[] / R2 convergence→protect_buffer / R3 insufficient→leave_earlier / R4 排他 / R5 not_applicable→confirm_uncertain / R6 最終 event 除外 / R7 context.recoverySteps / R8 recoveryWindows fallback / R9 packed→reduce_density / R10 no-op→[] / R11 evidence trace / R12 禁止語・生スコアなし / R13 決定論順序）。
- dayRehearsal dir **63** + plan suite **4986 PASS**（exit 0）。
- **tsc footprint 0**（baseline 55 不変・dayRepairCandidates 起因 0・新 export の consumer は test のみ）。
- additive（既存ファイル不接触）・変更 2 ファイル（pure source + test）。

## 5. 次（UI 配線前で停止・CEO 判断待ち）
- main 着地（pure・production 不変＝inert なので原典 step4 同様 squash 可）。
- UI 配線（DayOutlookBanner/timeline への候補表示・marker 行 tap→候補 disclosure 等）は別 slice。配線設計は read-only audit 先行。
- context.recoverySteps を CalendarTab の recoverySteps（WPM-2b raw slack）で渡すかは配線時に決定。
- いずれも **CEO GO 待ち**（本 slice は pure layer + branch commit で停止）。
