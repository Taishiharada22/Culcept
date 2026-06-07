# Day Rehearsal Repair Protect Signal v0 — closeout（pure 橋渡し候補・main 着地済・unwired・Reality 非接続）

> 2026-06-07 / **pure 実装 → branch commit → main 着地 完了。** 前提: Repair Disposition v0 main live・Reality は別セッション進行中（非接続）。

---

## 0. 状態
- **main 着地済**（squash・main HEAD `a8fe73a7`・親 `3d12d26e`）。code branch `claude/dr-protect-signal`（HEAD `a8f9e5a1`）保持。
- ★Reality **非接続**・ChangeSet **作らず**・applyChangeSet **不使用**・予定変更/apply/UI **なし**。protect の **橋渡し候補を作るだけ**。

## 1. 実装（pure・unwired・read-only）
- `lib/plan/dayRehearsal/repairProtectSignal.ts`:
  - `exportRepairProtectSignals(candidates) → readonly RepairProtectSignal[]`
  - `RepairProtectSignal = { kind, targetStepIndex, protectionHint:"recovery_core", evidence }`
  - 対象 = **protect disposition のみ**（use_recovery_window / protect_buffer）。adjust(leave_earlier)/confirm(confirm_uncertain)/reduce(reduce_density) は除外。
  - protect 判定は `classifyRepairDisposition` を **single source of truth** に（kind 直書きしない）。
- ★**candidate-based 入力**を採用（独立判断）: 着地済 `RepairDraftDisposition` は **targetStepIndex を持たない**ため、targetStepIndex 保持要件を満たすには candidate 入力が必要。これにより **着地済 disposition 層を一切改変せず** additive のみで済む（surgical）。

## 2. 設計判断
- protectionHint = `"recovery_core"`（v0・両 protect kind 共通）。Reality enum を **import しない**（doc 文字列・decouple）。protect_buffer の cascade_guard 相当は dormant ゆえ defer。
- ★gap-vs-node 未解決: signal は **生の targetStepIndex + evidence のみ**保持（eventId/区間解決は coordination 後）。
- 注: protect_buffer は Option D dormant → 本番は実質 **use_recovery_window のみ emit**。

## 3. production 挙動変更の有無
- **なし**。新 pure ファイル・consumer なし（test のみ）・UI 未配線・Reality 非接続・予定変更なし。

## 4. 検証
- unit **12**（PS1-PS12: protect のみ signal 化 / non-protect 除外 / 混在抽出・順序保持 / targetStepIndex(数値・null)保持 / evidence 保持 / recovery_core hint / 空 / deterministic / pure 入力不破壊 / ChangeSet field 不在）。
- dayRehearsal dir **122** + **plan suite 5052 PASS**。
- **tsc footprint 0**（total 55 baseline 不変）・zero-loss（main↔branch diff 空・明示パス commit で別セッション WIP 不接触）・additive。

## 5. HARD GATE 照合
- ChangeSet 生成 / applyChangeSet / Reality 接続 / UI 配線 / 予定変更 / repair 実行 **すべてなし**。
- signal は橋渡し候補のみ（ops/before/after/itemId 等の変更 field を持たない・PS12 で assert）。

## 6. 次（CEO 指示）
- **Reality coordination checklist**（実装なし・別 doc）: protect signal を Reality `recovery_core` に注入する前に Reality セッションと合意すべき項目。
- 実注入 / gap-vs-node 解決 / adjust・reduce 橋渡し は更に先（CEO GO + coordination 後）。
