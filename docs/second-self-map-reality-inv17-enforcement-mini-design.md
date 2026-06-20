# Reality Control OS — INV-17 gap-meaning enforcement mini design（設計のみ・Reality セッション向け coordination spec）

> 2026-06-07 / **設計のみ・実装しない** / Day Rehearsal 側は protect signal v1 + Gap Resolver（`GapRecoveryAssertion`）が main live（`d5596e24`・pure・unwired・Reality 非接続）。
> ★本書は **Reality Control OS（別セッション所有）への提案 spec**。実装は Reality セッションが coordination の上で行う（Day Rehearsal セッションは Reality コードを触らない）。

---

## 0. 結論（先に）
- ★**INV-17（「空白は埋めない・意味づけする」）は現状 enforce されていない**: `classifyGap`（gap-meaning）は contract だが complete-generator / candidate-evaluator に未配線。`recoveryProtected` gate は **node `recovery_core` の remove/update のみ**を弾き **add は無害扱い**＝gap を埋めるのを止めない。
- ∴ Day Rehearsal の `GapRecoveryAssertion`（「この GapNode は recovery」）が **実効を持つには Reality 側の INV-17 enforcement が必要**。
- **最小 enforcement = Complete(add) の freeGaps から recovery/free_time gap を除外**（現 Reality は trim-only + Complete のみ・move/optimize 未実装ゆえ、gap を脅かすのは add だけ）。move/optimize 実装時に evaluator gate を追加。
- protected gap の source = ①Reality 自身の `classifyGap` 導出（recovery/free_time）+ ②Day Rehearsal の `GapRecoveryAssertion`（外部 protect 表明）。**両者を union**（restrict-only・fail-safe）。

## 1. 現状 audit（read-only・Reality）
- `gap-meaning.ts`: `classifyGap(GapInput) → GapMeaning`（`recovery`/`free_time`/`travel_buffer`/…）。**純粋分類器・どこにも消費されていない**（"live 実装前の契約"）。
- `complete-generator.ts`: `freeGaps(region, busy)` で busy(既存 node)を除いた空き区間に placement を add。**gap-meaning を見ない**＝recovery gap も空きとして埋めうる。
- `candidate-evaluator.ts`: `recoveryProtected` = remove/update が **node recovery_core** を触れば false→reject。**add は recovery を cut しない（無害扱い）**。
- candidate-generator: trim-only（A1-3）+ Complete（A1-4）。move/cascade/remove/Optimize は **未実装**。preserved = immovable ∪ recovery_core(node)。
- ∴ **gap を「埋めない/eat しない」保護は未実装**。

## 2. enforcement の目的
- `recovery`/`free_time`（INV-17 で「意図的に残す」）と判定/表明された **gap を埋めない・縮めない・侵食しない**。
- restrict-only（ops の自由度を狭めるのみ）・fail-safe（不明は安全側）・reversible（既存 ChangeSet 機構のまま）。

## 3. enforcement の hook 点
| 脅威 op | hook | enforcement |
|---|---|---|
| **Complete (add)** ← 現 Reality で唯一の脅威 | `complete-generator.freeGaps` / placement | protected gap を **busy 相当に扱い freeGaps から除外**（add 候補にしない）。★最小・即効 |
| move/shorten/extend (future Optimize) | `candidate-evaluator` 新 gate `gapMeaningRespected` | protected gap を **侵食する update を reject**（隣接 node の延伸/移動が gap を食う場合）。move/optimize 実装時に追加 |
| remove は gap を増やすのみ | — | 脅威でない（対象外） |
- ★現段階は **Complete add-exclusion のみ**で十分（move/optimize 未実装）。gate は move/optimize と同時に。

## 4. protected gap の source（union）
- ①**Reality 自身**: `classifyGap` が `recovery`/`free_time` を返す GapNode（Reality 内の GapInput=gapLength/recoveryNeed/energy 由来）。
- ②**Day Rehearsal bridge**: `GapRecoveryAssertion[]`（`{ gapNodeId, startTime, endTime, meaning:"recovery", evidence }`）。**外部 protect 表明**として RealityInput に additive 注入。
- 両者を **union**（どちらかが recovery とみなせば保護）。conflict は restrict 優先（保護を強める方向＝fail-safe）。

## 5. contract（input shape / 不変条件）
- RealityInput に additive: `protectedGaps?: readonly { gapNodeId: string; startTime: string; endTime: string; source: "gap_meaning" | "day_rehearsal"; }[]`（仮）。Day Rehearsal の `GapRecoveryAssertion` から map（evidence は trace に格納可）。
- 不変条件: **additive / restrict-only / reversible**（既存 caller・既存挙動を壊さない・保護は触る範囲を狭めるのみ）。
- ★fail-safe: protected gap 判定が不明/未指定 → **保護しない**（過剰保護を避ける）か **保護する**（過剰保護でも安全）かは Reality の保守方針に合わせる（Reality は fail-closed=保守的なので、明示 protected のみ保護で十分）。

## 6. 現 Reality 段階での最小 enforcement（推奨スコープ）
1. RealityInput に `protectedGaps`（gapNodeId/区間）を additive 追加。
2. complete-generator の `freeGaps` で protected gap 区間を **busy に merge**（add 候補から除外）。
3. test: protected gap には Complete が placement しない / 非 protected gap には従来どおり placement する / additive（既存 Complete 挙動不変）。
4. move/optimize の `gapMeaningRespected` gate は **当該 mode 実装時**に追加（今は不要）。
- これで Day Rehearsal の「この recovery gap を残す」が Complete に対して実効を持つ。

## 7. 役割分担（coordination）
- **Day Rehearsal セッション（本系）**: `GapRecoveryAssertion` の生成（済）+ RealityInput 注入経路への map（coordination 後・pure・Reality 非破壊）。
- **Reality セッション（別所有）**: RealityInput.protectedGaps の受け口 + freeGaps 除外 + （将来）evaluator gate。**本 spec を提案として渡し、Reality 側で実装**。
- ★Day Rehearsal セッションは Reality コードを直接変更しない（in-flight 干渉回避）。

## 8. GO / NO-GO + CEO 判断点
- **GO（spec 確定・推奨）**: enforcement 設計 = Complete add-exclusion（最小）+ source union（classifyGap ∪ GapRecoveryAssertion）+ additive/restrict-only。
- **NO-GO**: ①Day Rehearsal セッションが Reality コードを実装（所有違反・in-flight）②move/optimize gate を先行実装（mode 未実装）③過剰保護で Complete を機能不全にする④実注入を coordination 前に行う。
- **CEO 判断点**:
  1. 本 spec（Complete add-exclusion 最小 + source union）を Reality セッションへ **正式提案**するか。
  2. RealityInput.protectedGaps の **受け口設計**を Reality セッションと coordinate する時期。
  3. source は classifyGap ∪ GapRecoveryAssertion の **union** で良いか（Day Rehearsal 由来を recovery とみなす閾値＝coordination checklist C1/C2）。
  4. Day Rehearsal 側の注入 map（GapRecoveryAssertion → RealityInput.protectedGaps）を **誰が・いつ**作るか（Reality 受け口確定後）。
