# Repair Protect Signal v1 + Gap Resolver — closeout（pure・main 着地済・Reality 非接続）

> 2026-06-07 / **hint 補正 + GapNode 解決 adapter → branch commit → main 着地 完了。** 前提: Reality Bridge Contract Audit（gap-meaning `recovery` が正対応先・GapNode 共有キー）。

---

## 0. 状態
- **main 着地済**（squash・main HEAD `d5596e24`・親 `f91c7f44`）。code branch `claude/dr-gap-adapter`（HEAD `928b5554`）保持。
- ★Reality **非接続**・ChangeSet/apply なし・予定変更なし・unwired。

## 1. 実装
### (1) protect signal hint 補正（`repairProtectSignal.ts`）
- `RepairProtectionHint`: `"recovery_core"` → **`"recovery"`**（gap-meaning/INV-17）。`protectionHint` 値 + header/comment も補正。
- 理由（contract audit）: use_recovery_window は **gap**。node `recovery_core` は remove/update のみ弾き **add は無害扱い**（gap を埋めるのを止めない）→ 誤対応先。gap を「埋めない」保護は gap-meaning `recovery`。

### (2) Gap Resolver 新設（`repairGapResolver.ts`）
- `resolveProtectSignalsToGapMeaning(signals, dayGraph) → readonly GapRecoveryAssertion[]`
- `GapRecoveryAssertion = { kind, gapNodeId, startTime, endTime, meaning:"recovery", evidence }`（Reality enum 非 import）。
- **use_recovery_window のみ**（protect_buffer は defer・HARD GATE 遵守）。
- ★targetStepIndex i → `events[i]`・`events[i+1]`（rehearsal と同一 dayGraph 前提）→ **厳密 double time-match**（GapNode.startTime===events[i].endTime ∧ endTime===events[i+1].startTime）で **一意** GapNode を解決。
- ★**fail-safe**: 0 match(overlap/skip) / 2+ match(曖昧) / event 不在 → **skip**（誤マップ皆無）。

## 2. HARD GATE 照合（全 PASS）
- targetStepIndex↔GapNode は **厳密一致時のみ解決**（不確実は skip）→ 対応の不確実性に乗らない。
- DayGraph shape 検証済（GapNode は id + startTime/endTime・DEFAULT_MIN_GAP_MINUTES=30 < recovery gap≥60 ゆえ skip されない）。
- Reality import **なし**。protect_buffer は **解決しない**（無理に解決しない）。

## 3. production 挙動変更の有無
- **なし**。hint 値変更は consumer なし（test のみ）・gap resolver は新 pure ファイル・unwired・Reality 非接続。

## 4. 検証
- unit: 新規 **GR1-GR12**（解決 / protect_buffer skip / event 不在 skip / null skip / 区間不一致 skip / 隣接 gap なし skip / 曖昧 2 件 skip / 複数 signal 順序 / 空 / deterministic / pure / ChangeSet field 不在）+ 補正 **PS7**（recovery）。
- dayRehearsal dir **134** + **plan suite 5064 PASS**。
- **tsc footprint 0**（total 55 baseline 不変）・zero-loss（main↔branch diff 空・明示パス commit で別セッション WIP 不接触）。

## 5. 次（CEO 指示）
- **Reality INV-17 enforcement mini design**（実装なし・別 doc・Reality セッションへの coordination spec）: gap-meaning（classifyGap）+ GapRecoveryAssertion を Reality の Complete/Optimize 抑止に enforce する設計。
- 実注入 / Reality 側実装 / adjust・reduce bridge は更に先（coordination + CEO GO 後）。
