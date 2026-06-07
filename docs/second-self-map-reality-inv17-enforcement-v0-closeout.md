# Reality INV-17 enforcement v0 — closeout（Complete protectedGaps・additive・main 着地済・未注入）

> 2026-06-07 / **最小 enforcement 実装 → branch commit → main 着地 完了。** CEO 判断で本セッションが Reality kernel を additive 変更。

---

## 0. 状態
- **main 着地済**（squash・main HEAD `12727e43`・親 `4d61990b`）。code branch `claude/reality-inv17-protectedgaps`（HEAD `030d6d50`）保持。
- ★Day Rehearsal からの**実注入なし**（CompleteInput optional・default 空＝既存挙動完全不変）。ChangeSet/apply/UI/予定変更/DB なし。
- ★**所有メモ**: CEO 判断で本セッション（Day Rehearsal 系）が Reality kernel を変更。complete-generator は A1-4-2b 以降安定 + 純 additive + zero-conflict 確認済で in-flight 干渉を緩和。**Reality セッションへ周知要**（complete-generator に protectedGaps が増えたこと）。

## 1. 実装（additive・pure・restrict-only）
- `lib/plan/reality/complete-generator.ts`:
  - `CompleteInput.protectedGaps?: readonly Interval[]`（additive optional・add 禁止区間・分単位）。
  - `generateComplete`: `busy = [...existing.map(...), ...(protectedGaps ?? [])]`。既存 `freeGaps(region, busy)` がそのまま除外 → Complete(add) が protectedGaps 区間を埋めない。
- INV-17（空白は埋めない・意味づけ）の最小 enforcement。recovery/free_time gap を add 対象から外す。

## 2. 設計判断
- **default 空＝挙動完全不変**（additive・既存 caller/test 不変）。
- restrict-only（add 候補を狭めるのみ・過剰保護でも add 減のみ＝fail-safe）・reversible・pure。
- 現 Reality は **trim-only + Complete のみ**（move/optimize 未実装）＝gap を脅かすのは add だけ → これで十分。
- evaluator `gapMeaningRespected` gate（update が protected gap を侵食→reject）は **move/optimize 実装時**（別 slice）。

## 3. production 挙動変更の有無
- **なし**。Reality kernel 全体が production route 未配線 + protectedGaps default 空 + 注入 caller なし。

## 4. 検証
- unit: 新規 **PG0-PG6**（baseline 配置 / 唯一 gap 保護→null / 空=undefined と同一 / region 外無効果 / 2 gap 曖昧を片塞ぎで解消 / duration 未満→null / existing∪protected merge）。
- realityCompleteGenerator **34** + reality 全 **563 PASS**（回帰なし）。
- **tsc footprint 0**（total 55 baseline 不変）・zero-loss（main↔branch diff 空・complete-generator は base から無変化＝他セッション無競合・明示パス commit）。

## 5. HARD GATE / 禁止事項 照合
- Day Rehearsal からの注入 / ChangeSet 生成 / applyChangeSet / UI 配線 / 予定変更 / DB / tsc cleanup / push **すべてなし**。

## 6. 次（CEO 指示）
- **GapRecoveryAssertion → protectedGaps integration mini design**（実装なし・別 doc）: Day Rehearsal の GapRecoveryAssertion を Reality CompleteInput.protectedGaps に届ける配線設計。
- 実注入 / evaluator gate / move・optimize は更に先（coordination + CEO GO 後）。
