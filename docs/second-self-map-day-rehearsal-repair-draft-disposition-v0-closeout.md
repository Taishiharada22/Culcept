# Day Rehearsal Repair Draft Disposition v0 — closeout（pure 分類層・main 着地済・unwired）

> 2026-06-07 / **pure 実装 → branch commit → main 着地 完了。** 前提: Repair v1 + dedup main live・「予定変更の下書き」層は既存（Reality Control OS）。

---

## 0. 状態
- **main 着地済**（squash・main HEAD `3d12d26e`・親 `ba4cc6ca`）。code branch `claude/dr-repair-disposition`（HEAD `121c2951`）保持。
- ★新規 RepairDraft / ChangeSet **作らず**・Reality **非接続**・予定変更 / apply / repair 実行 / UI 配線 **一切なし**。candidate → disposition の **分類のみ**。

## 1. 実装（pure・unwired・read-only）
- `lib/plan/dayRehearsal/repairDraftDisposition.ts`:
  - `classifyRepairDisposition(candidate) → RepairDraftDisposition`
  - `classifyRepairDispositions(candidates) → RepairDraftDisposition[]`
  - `RepairDisposition = "adjust" | "confirm" | "protect" | "reduce"`
  - `RepairDraftDisposition = { kind, disposition, draftable, realityHint, blockers, suggestion, evidence }`
- kind → disposition（CEO 指定どおり）+ v0 は **全 draftable=false**:

| kind | disposition | draftable | realityHint（doc・Reality 非 import） | blockers |
|---|---|---|---|---|
| leave_earlier | adjust | false | update(move) | no_magnitude(option_d), reality_move_mode_unimplemented |
| confirm_uncertain | confirm | false | verify_travel | not_a_plan_change(verification_task) |
| use_recovery_window | protect | false | protection:recovery_core | not_a_plan_change(protection_signal) |
| protect_buffer | protect | false | protection:cascade_guard\|recovery_core | not_a_plan_change(protection_signal), dormant(option_d_unreachable) |
| reduce_density | reduce | false | optimize(remove\|shorten) | no_target, optimize_domain, v0_excluded(plan_change_appearance) |

- suggestion **無改変**（candidate のものを参照保持）。evidence 保持。Reality enum は import せず realityHint は **doc 文字列**のみ（couple 回避）。

## 2. 設計判断（CEO GO の反映）
- 「予定変更の下書き」層は既存（Reality `ChangeOp`/`ChangeSet`）→ 本層は **分類 spec のみ・再発明しない**。
- **v0 全 draftable=false**: leave_earlier は magnitude 無 + Reality move mode 未実装で二重ブロック・reduce_density は予定変更に見えやすく除外・confirm/protect はそもそも plan-change でない。
- 実 ChangeSet 生成は **full path（magnitude）+ Reality coordination 後**の別 slice。

## 3. production 挙動変更の有無
- **なし**。新 pure ファイル・consumer なし（test のみ）・UI 未配線・予定変更なし。

## 4. 検証
- unit **16**（DD1-DD16: kind→disposition / 全 draftable=false / blockers / realityHint 対応 / evidence・suggestion・kind 保持 / deterministic / pure 入力不破壊 / ChangeSet field 不在 / 配列順序 / 空）。
- dayRehearsal dir **110** + **plan suite 5040 PASS**。
- **tsc footprint 0**（total 55 baseline 不変）・zero-loss（main↔branch diff 空・明示パス commit で別セッション WIP 不接触）・additive（既存不接触）。
- 注: 初回 tsc で test の `as Record<string,unknown>` が TS2352（55→56）→ `as unknown as Record<...>` の double cast に修正し 0 化。

## 5. HARD GATE 照合
- ChangeSet 生成 / applyChangeSet / Reality 接続 / UI 配線 / 予定変更 / repair 実行 **すべてなし**。
- disposition は分類オブジェクトのみ（ops/before/after/itemId 等の変更 field を持たない・DD14 で assert）。

## 6. 次（CEO 指示）
- **Reality bridge mini design**（実装なし・別 doc）: disposition → Reality（governance/protection/ChangeOp）への橋渡し設計。coordination 含む。
- 実 ChangeSet / full path / apply は更に先（CEO GO 待ち）。
