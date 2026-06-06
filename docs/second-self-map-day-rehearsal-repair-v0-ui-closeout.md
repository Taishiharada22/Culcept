# Day Rehearsal Repair Candidate v0 — UI 配線 closeout（day-level「どうするとよさそう？」）

> 2026-06-07 / **実装・実機 smoke PASS・ローカル main 着地完了**（CEO + 自己監査） / 前提: pure layer `generateDayRepairCandidates` main live + UI mini design 済。

---

## 0. 状態
- **ローカル main 着地済**（squash・main HEAD `98332f09`・親 `ed9aed7e`）。code branch `claude/dr-repair-ui`（HEAD `1be59ce4`）保持。
- 実機 smoke **PASS**（CEO + 自己監査 2026-06-07・localhost:3012）。
- 予定変更 / repair 実行 / optimize / DB / Google / push / PR / Vercel / MapTab **不接触**。

## 1. 何を出したか（live・read-only）
- day-level banner 下に native `<details>`「**どうするとよさそう？**」（default 閉・「なぜ?」と並ぶ）。
- Day Rehearsal の read-only 対処候補を **最大 3 件・優先度順**（leave_earlier>protect_buffer>confirm_uncertain>use_recovery_window>reduce_density）で **suggestion テキスト行**表示。
- 0 件なら disclosure を出さない。**ボタン/適用/保存/チェック等の実行 UI は一切なし**（表示のみ＝予定変更でない）。copy は pure layer の suggestion そのまま（ad-hoc copy なし）。evidence raw 非表示。

## 2. 実装（5 ファイル・additive）
- `lib/plan/dayRehearsal/dayRepairCandidates.ts`: `prioritizeRepairCandidates(candidates, limit=3)`（優先度 stable sort + cap）。
- `CalendarTab.tsx`: `repairCandidates` useMemo（`generateDayRepairCandidates(dayRehearsal, { recoverySteps })` → prioritize 3）→ banner に渡す。
- `DayOutlookBanner.tsx`: `repairCandidates?` prop + 「どうするとよさそう？」disclosure。
- tests: prioritize unit 5 + banner repair render 7。

## 3. production 挙動変更
- **Day Rehearsal banner 下に read-only の「どうするとよさそう？」が出る**（候補ありの選択日のみ・default 閉）。
- ボタン/保存/適用/予定変更 **なし**。banner outlook 行・「なぜ?」・marker・timeline は不変。

## 4. 実機 smoke 監査（CEO + 自己）
- 6/6(土)・tight 日で「どうするとよさそう？」展開→ `use_recovery_window`「ここで一息入れられそうです」表示。read-only・slate・「なぜ?」と共存・layout 非破壊を確認。
- ★透明性: この日は convergencePoints 空（なぜ?=「詰まりやすさ」）+ 余白不足なし → 候補は use_recovery_window 1 件のみが正しい挙動。他 kind（leave_earlier/protect_buffer/reduce_density）の copy・read-only・no-button は render contract test 7 本で機械保証。

## 5. 検証
- prioritize 5 + banner repair render 7 + dayRepairCandidates 18 + CalendarTab wiring/banner/DayGraphTimeline 101 + plan suite **4998 PASS**。
- **tsc footprint 0**（baseline 55 不変・私の起因 0）・zero-loss（branch 1be59ce4 一致）・banner/なぜ?/marker/timeline 非破壊。

## 6. 次（What-if Preview mini design・実装は別 GO）
- 候補を実行する前に「この候補で何が軽くなりそうか / 何はまだ未確定か」を read-only でプレビューする設計。mini design: `…-repair-v0-whatif-mini-design.md`。実装は CEO GO 後・予定変更/実行/保存なし。
