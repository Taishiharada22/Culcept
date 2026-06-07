# Reality INV-17 enforcement — audit + 最小実装案（read-only 監査・実装しない・Reality セッション向け）

> 2026-06-07 / **audit + 設計のみ・実装しない** / main HEAD `a24de790`（A1-6-2）。Day Rehearsal 側は `GapRecoveryAssertion`（`repairGapResolver`）main live（`d5596e24`・pure・unwired）。
> ★本書は **Reality Control OS（別セッション所有）への enforcement 提案**。実装は Reality セッションが coordination の上で行う（Day Rehearsal セッションは Reality コードを変更しない）。

---

## 0. 結論（先に）
- ★**INV-17（空白は埋めない・意味づけする）は現状ゼロ enforce**。`classifyGap`（gap-meaning）は純粋分類器だが **どこからも呼ばれていない**（complete-generator / evaluator 未配線）。evaluator の `recoveryProtected` は **node recovery_core の remove/update のみ**を弾き **add は無害扱い**（gap を埋めるのを止めない）。
- ★**Reality Control OS は全体が production route に未配線**（app/ から import なし・candidate-action は「決定のみ・実反映は別 slice の live path」）。→ enforcement 変更は **pure kernel への additive 変更＝production 影響ゼロ**。
- **最小 enforcement = `generateComplete` の `busy` に protected gap を merge**（`CompleteInput.protectedGaps?: Interval[]` を additive 追加）。`freeGaps(region, busy)` は既に busy を除外するので、recovery gap を busy 扱いすれば **Complete(add) が埋めない**。現 Reality は **trim-only + Complete のみ**（move/optimize 未実装）＝gap を脅かすのは add だけ → これで十分。
- Reality セッションは現在 **A1-6-x（Candidate Handle）**で gap-meaning に触れていない → INV-17 enforcement は **無競合**。
- **GO（設計確定）/ 実装は Reality セッション所有・pure・flag 裏（protectedGaps PASS を flag gate）**。NO-GO=本セッションが Reality コードを実装・evaluator gate 先行・wiring を coordination 前に。

## 1. enforcement 現状 audit（read-only）
| 要素 | 現状 | INV-17 enforce? |
|---|---|---|
| `gap-meaning.ts` `classifyGap` | 純粋分類器（recovery/free_time/…）。**呼ばれていない**（"live 実装前の契約"） | ✗ 未配線 |
| `complete-generator.ts` `generateComplete` | `busy = existing nodes の Interval` → `freeGaps(region, busy)` の空きに add。**gap-meaning 非参照** | ✗ recovery gap も add 対象 |
| `candidate-evaluator.ts` `recoveryProtected` | **node recovery_core の remove/update のみ** false→reject。**add は recovery を cut しない（無害扱い）** | ✗ gap fill を止めない |
| candidate-generator | trim-only（A1-3）+ Complete（A1-4・**未配線**）。move/cascade/remove/Optimize 未実装 | — |
| Reality kernel 全体 | **app/ 未配線**（production route から呼ばれない・実反映は別 slice live path） | — |
- ∴ gap を「埋めない/侵食しない」保護は **完全未実装**。`GapRecoveryAssertion` が実効を持つには本 enforcement が必要。

## 2. 最小実装案（Reality 所有・pure・flag 裏・実装はしない）
### 設計
- `CompleteInput` に **additive optional** 追加: `readonly protectedGaps?: readonly Interval[];`（add 禁止区間・分単位）。
- `generateComplete`: `const busy = [...input.existing.map((n) => ({ startMin: n.startMin, endMin: n.endMin })), ...(input.protectedGaps ?? [])];`
- 既存 `freeGaps(region, busy)` がそのまま protected gap を除外 → recovery gap に placement されない（全 placement が一意 gap に入らなければ all-or-nothing で null）。
- **default 空 → 挙動完全不変**（additive・既存 caller/test 不変）。

### コードスケッチ（提案・実装しない）
```ts
// complete-generator.ts CompleteInput に追加
readonly protectedGaps?: readonly Interval[]; // INV-17: add 禁止区間（recovery/free_time gap）

// generateComplete 内
const busy: Interval[] = [
  ...input.existing.map((n) => ({ startMin: n.startMin, endMin: n.endMin })),
  ...(input.protectedGaps ?? []), // ★recovery gap を busy 扱い → freeGaps が除外
];
```
- restrict-only（add 候補を狭めるのみ）・additive・reversible・pure。

## 3. 入力境界（GapRecoveryAssertion を将来受け取る場合）
- `GapRecoveryAssertion = { gapNodeId, startTime, endTime("HH:MM"), meaning:"recovery", evidence }`（Day Rehearsal 由来・main live）。
- `CompleteInput.protectedGaps: Interval[]`（分単位）。
- **map（integration 層・将来）**: `GapRecoveryAssertion.startTime/endTime ("HH:MM") → Interval { startMin, endMin }`（HH:MM→分 parse）。この map は coordination 後に作る（Day Rehearsal 側 or integration 側・pure・Reality kernel 非破壊）。
- ★**flag 裏**: 統合 caller が protectedGaps を渡すのを flag gate（OFF=空=従来挙動・ON=recovery gap 保護）。kernel 自体は additive なので flag は注入側に置く。

## 4. 触るファイル候補（実装 GO 時・Reality 所有）
| ファイル | 変更 | 段階 |
|---|---|---|
| `lib/plan/reality/complete-generator.ts` | CompleteInput に protectedGaps 追加 + busy merge（~2-3 行） | **最小・今** |
| `tests/unit/...completeGenerator*.test.ts`（該当 test） | protected gap には add しない / 非 protected は従来どおり / additive（既存不変） | 最小・今 |
| （integration 層・将来） | GapRecoveryAssertion → protectedGaps map + flag gate | coordination 後 |
| `lib/plan/reality/candidate-evaluator.ts` | `gapMeaningRespected` gate（update が protected gap を侵食→reject） | **move/optimize 実装時**（今は不要） |
- ★今 触るのは complete-generator + test のみ（最小）。

## 5. risk / rollback
- **risk: ほぼゼロ**。①Reality kernel は全体 **未配線**（production 影響なし）②protectedGaps は **additive optional・default 空＝挙動不変**③restrict-only（過剰保護でも add を減らすだけ＝fail-safe 方向）。
- **in-flight risk**: Reality は A1-6-x で進行中 → complete-generator が変わりうる。**実装時に現 HEAD で再 audit**。ただし A1-4-2b 以降 complete-generator は安定（gap-meaning に他セッションは触れていない＝無競合）。
- **rollback**: ①flag OFF（protectedGaps を渡さない）→ 即時従来挙動 ②field 自体を消す（additive なので除去容易）③kernel 未配線ゆえ production rollback は不要。
- **over-restriction**: protected gap が広すぎると Complete が候補を出せず null（add 提案が減る）。これは保護の意図どおり＝fail-safe。誤って予定を動かす方向には働かない。

## 6. pure / flag 裏 / Reality 所有 の進め方
1. **本 audit/spec を Reality セッションへ提案**（coordination）。
2. Reality セッションが complete-generator に protectedGaps を additive 実装（pure・test）。
3. integration 層で GapRecoveryAssertion → protectedGaps map + flag gate（OFF default）。
4. flag ON で canary（protected gap に Complete が add しないことを実機/test 確認）。
5. move/optimize 実装時に evaluator gate 追加。
- ★Day Rehearsal セッション（本系）は **Reality kernel を直接変更しない**（in-flight 干渉回避）。本系の役割は GapRecoveryAssertion 生成（済）+ map 提供（coordination 後）。

## 7. GO / NO-GO + CEO 判断点
- **GO（設計確定・推奨）**: 最小 enforcement = `CompleteInput.protectedGaps` + busy merge（additive・restrict-only・pure・未配線 kernel ゆえ低リスク）。
- **NO-GO**: ①本セッションが Reality kernel を実装（所有違反・in-flight）②evaluator gate を先行（move/optimize 未実装）③GapRecoveryAssertion→protectedGaps wiring を coordination 前に④flag なしで注入側を常時 ON。
- **CEO 判断点**:
  1. 最小案（complete-generator protectedGaps）を **Reality セッションへ正式提案**するか。
  2. 実装を **Reality セッション所有**で進めるか（本系は map 提供のみ）／本系がやるべきか（その場合 in-flight 干渉の許容判断）。
  3. flag（protectedGaps 注入の OFF default）+ canary で良いか。
  4. integration 層（GapRecoveryAssertion→protectedGaps map）の所有・時期。
