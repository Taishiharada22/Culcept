# GapRecoveryAssertion → Reality protectedGaps — integration mini design（設計のみ・実装しない）

> 2026-06-07 / **設計のみ・実装しない** / 両端は main live: Day Rehearsal `GapRecoveryAssertion`（`repairGapResolver`・`d5596e24`）/ Reality `CompleteInput.protectedGaps`（`12727e43`・additive・default 空）。本書は**両者を繋ぐ配線設計**。

---

## 0. 結論（先に）
- 配線チェーン: **`GapRecoveryAssertion[]` →（map: HH:MM→Interval 分）→ `CompleteDispatchInput.protectedGaps` → `CompleteInput.protectedGaps` → `generateComplete` busy 除外**。
- 必要な additive plumbing は **1 箇所**: Reality `CompleteDispatchInput.protectedGaps?: Interval[]` + `generateCompleteFromContext` の pass-through（complete-generator は既に protectedGaps 対応済）。+ pure map 関数。
- ★**最後の 1 マイル（実際に protectedGaps を渡す caller）は Reality が production route 未配線ゆえ存在しない**。→ 配線は **準備（map + plumbing）はできるが activate（実注入）は Reality wiring 待ち**。flag 裏（OFF default）。
- **GO（限定）**: pure map + Reality plumbing（additive）。**NO-GO**: 実注入 caller（Reality 未配線）・常時 ON・evaluator gate。

## 1. 現状の両端（main live）
- Day Rehearsal: `resolveProtectSignalsToGapMeaning(signals, dayGraph) → GapRecoveryAssertion[]`。`GapRecoveryAssertion = { kind, gapNodeId, startTime, endTime("HH:MM"), meaning:"recovery", evidence }`。
- Reality: `CompleteInput.protectedGaps?: readonly Interval[]`（`Interval = { startMin, endMin }`・分単位）。`generateComplete` が busy に merge 済。
- ギャップ: **型差**（HH:MM ↔ 分）+ **届ける経路**（candidate-generator の dispatch input）+ **caller 不在**（Reality 未配線）。

## 2. 配線チェーン（grounded）
```
GapRecoveryAssertion[]            （Day Rehearsal・HH:MM）
  │  map: parseHHMM→Interval(分)   ← ★pure map（新規・小）
  ▼
Interval[]
  │  set                          ← ★integration caller（将来・Reality 配線後）
  ▼
GenerationContext.completeInput.protectedGaps   ← ★CompleteDispatchInput に additive（Reality plumbing）
  │  generateCompleteFromContext pass-through    ← ★1 行 additive（Reality plumbing）
  ▼
CompleteInput.protectedGaps      （main live・実装済）
  │  busy merge → freeGaps 除外    （main live・実装済）
  ▼
generateComplete: recovery gap を add しない
```

## 3. 必要な変更（実装 GO 時・最小）
| # | 変更 | 所有 | 状態 |
|---|---|---|---|
| 1 | pure map `gapAssertionsToIntervals(assertions) → Interval[]`（startTime/endTime "HH:MM"→分・無効/逆転は除外） | Day Rehearsal/shared | 新規・小 |
| 2 | `CompleteDispatchInput.protectedGaps?: Interval[]`（additive） | Reality | 新規・小 |
| 3 | `generateCompleteFromContext`: `protectedGaps: ci.protectedGaps` を CompleteInput へ pass-through（1 行） | Reality | 新規・小 |
| 4 | integration caller: rehearsal の GapRecoveryAssertion を map→`GenerationContext.completeInput.protectedGaps` に注入（**flag 裏 OFF default**） | 統合（Reality 配線後） | ★**caller 不在＝blocked** |
| 5 | complete-generator protectedGaps + busy merge | Reality | ✅ **実装済**（`12727e43`） |

## 4. map の仕様（pure・実装しない）
- `gapAssertionsToIntervals(assertions: readonly GapRecoveryAssertion[]) → readonly Interval[]`
  - 各 assertion: `parseHHMM(startTime)`/`parseHHMM(endTime)` → `{ startMin, endMin }`。
  - **fail-safe**: parse 失敗 / `endMin<=startMin` は **除外**（不正区間を作らない）。
  - meaning は v0 では recovery のみ（全件対象）。gapNodeId/evidence は protectedGaps(Interval) に乗らない（trace は別途・Reality が richer 型を望めば拡張）。
  - 前提: GapRecoveryAssertion の時刻も Reality の Interval も **同日・minute-of-day(local)**（dayGraph 由来で一致）。
- 純粋・Date 不使用・Reality enum 非 import。

## 5. ★blocker と段取り
- **Reality kernel は production route 未配線**（app/ 未 import・実反映は別 slice live path）→ #4 の caller（GenerationContext を実際に組んで generateComplete を回す production 経路）が存在しない。
- ∴ 段取り: ①map + plumbing（#1-3・additive・低リスク）を準備 → ②**Reality が production route に配線される**まで #4 は保留 → ③配線時に rehearsal assertion を map→注入（flag OFF default）→ ④flag ON で canary。
- 現実的には **Reality wiring（別大トラック）に追随**する話。今 #1-3 を先行準備するか、Reality wiring まで待つかは CEO 判断。

## 6. flag / 安全
- flag は **注入側（#4 caller）**に置く（OFF=protectedGaps 渡さない=従来挙動）。kernel/plumbing は additive ゆえ flag 不要。
- restrict-only / additive / reversible / fail-safe（map で不正区間除外・過剰保護でも add 減のみ）。
- read-only（apply しない・予定変更しない）。

## 7. GO / NO-GO + CEO 判断点
- **GO（準備・限定）**: pure map（#1）+ Reality plumbing（#2-3・additive・default 不変）を先行実装（low risk・未注入）。
- **NO-GO**: ①#4 caller の実注入（Reality 未配線＝接続先なし）②flag なし常時 ON ③evaluator gate（move/optimize 未実装）④Day Rehearsal kernel への apply。
- **CEO 判断点**:
  1. **map + plumbing（#1-3）を今 先行準備**するか / **Reality wiring まで全保留**するか。
  2. #2-3（Reality plumbing）も本セッションが触るか（INV-17 v0 と同様の CEO 判断）/ Reality セッション所有か。
  3. map（#1）の所有（Day Rehearsal 側 / shared util）。
  4. 実注入（#4）は **Reality production wiring 完了後**で良いか（前提合意）。
