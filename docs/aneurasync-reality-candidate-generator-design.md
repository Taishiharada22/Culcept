# Reality Control OS — Candidate Generator / Evaluator 設計（A1 系）

> 起草: Build Unit / 2026-06-04 / 起点 main `499b6801` / branch `feat/reality-candidate-generator`
> 範囲: 判断 OS の中核臓器「候補生成器（何を提案するか）＋ 候補評価器（どれだけ安全/良いか）」。
> 本書は **pure 層のみ**。UI / DB / route / runtime / staging / production には接続しない。

---

## 0. なぜ慎重に分割するか
候補生成器は「何を動かしてよいか・何を不可侵にするか・何を drop/shorten/move してよいか」を扱う中核。
雑に作ると「AI が予定を勝手に動かす」方向へズレる。よって **1 slice / 1 GO** で外科的に積む。

## 1. 安全アーキテクチャ（中核原則）
- `best-action` の **Gate-first** は候補を採用前に弾く。だが Gate は候補の **metrics を信じる**
  （metrics は呼び出し側が事前計算）。→ 唯一の穴は「生成器が metrics を甘く自己申告する」こと。
- 対策（構造で）: **generator は metrics を *申告できない*** 型 `CandidateDraft`（= `Omit<BestActionCandidate, "metrics">`）を出す。
  **evaluator だけが metrics を産み** `BestActionCandidate` を組む。
- 表現（正確に）: unsupported / unknown / missing は必ず安全側(fail)に倒し、
  **不安全候補が安全扱いされる経路を構造的に *減らす***（絶対化はしない＝実装バグ/未対応 op は残りうる）。
- evaluator は raw `DayGraph` でなく **抽象 `GenerationContext`（redacted・governance 付）** を使い、raw を引き込まない。

```
generator(A1-3+) → CandidateDraft[]            // metrics を持てない
                 → evaluateCandidate(A1-2-2+)  // evaluator が独立に metrics を付与
                 → BestActionCandidate[]
                 → rankCandidates(Gate-first)  // evaluator metrics を信頼
```

## 2. 分割と状態
| slice | 内容 | 状態 |
|---|---|---|
| **A1-1** | 候補生成器の器: `generateCandidates→[]` no-op / `GenerationContext`（dayNode↔anchors.governance join）/ `isTouchableForGeneration`・`isPreservedForGeneration`（authority を *消費*）/ touchable=isRepairTouchable∧非recovery_core, preserved=immovable∪recovery_core | ✅ landed |
| **A1-2-1** | `CandidateDraft` 型（metrics 持てない）/ `applyChangeSet(nodes,cs)` 最小純関数（atomic・fail-closed・no mutation・raw 不持込） | ✅ landed |
| **A1-2-2** | `evaluateSafetyMetrics`（feasible/recoveryProtected/deadlineSatisfied/wholePartCoherent を独立・保守的に算出。one-sided conservative・unknown→false） | ✅ landed |
| **A1-2-2.5** | Deadline Gate Alignment: best-action に独立 `deadline` gate（deadlineSatisfied=false→hard reject）。GateKind を 3 箇所同期 | ✅ landed |
| **A1-2-3** | `evaluateCandidate`（draft→BestActionCandidate・safety=evaluator 由来・客観 instability のみ・主観中立 0・rank は test 検証のみ） | ✅ landed |
| A1-3〜6 | Build / Complete / Repair / Optimize 生成（各別 GO・context+evaluator 経由） | ⏳ 別 GO |

## 3. A1-1 実装（landed）
- `lib/plan/reality/candidate-generator.ts`: `generateCandidates` は safe no-op（`[]`）。`buildGenerationContext` が
  dayNode↔anchors.governance を join し、authority（`isImmovable`/`isRepairTouchable`/`repairTouchOrder`/`hasProtection`）を
  *消費* して touchable / preserved に分類。anchor governance 欠落は保守的 immovable（fail-closed）。
- contract test: import_locked / hard_external / recovery_core を勝手に touchable 化しない（movable でも preserved）。

## 4. A1-2-1 実装（landed）
- `lib/plan/reality/candidate-evaluator.ts`:
  - `CandidateDraft = Omit<BestActionCandidate, "metrics">`（metrics/score/gate を**構造的に持てない**）。
  - `PlanNode`（id/startMin/endMin/governance?。**raw title/location 無し**）。
  - `applyChangeSet(nodes, cs) → ApplyResult`（**atomic**・**入力 mutate なし**・**raw 不持込**・**safety 判定しない**）:
    supported(add/remove/update) のみ / unsupported は fail / unknown・missing node は fail /
    before・after 不整合(stale) は fail / 失敗時は入力不変。
- test: CandidateDraft の key 限定 / supported ops / fail-closed 各種 / atomic / no mutation / no raw（issues も含め raw なし）。

## 4b. A1-2-2 実装（landed）
`lib/plan/reality/candidate-evaluator.ts` に `evaluateSafetyMetrics(draft, context) → SafetyMetrics`（4 安全 metric のみ）。
- **独立**: 既存 node の governance は **context（権威的）** から引く（draft の自己申告 snapshot を信じない）。
- **保守（one-sided）**: apply 失敗 / unknown は **全 false**。
  - `feasible` = applyChangeSet 結果が幾何妥当（duration>0・日境界内・overlap なし）
  - `recoveryProtected` = remove/update が recovery_core を触れば false（add は無害）
  - `deadlineSatisfied` = remove/update が hard/locked/immovable/critical を壊せば false
  - `wholePartCoherent` = budget(総時間≤1日) ∧ 日境界 overflow なし
- **未実装（範囲外）**: score / goalAttainment / rhythmFit / 主観 metric / BestActionCandidate 化 / rank 接続 / mode 生成。
- test: 非空性（safe→全 true）/ apply 失敗→全 false / recovery_core 触る→false / critical 壊す→false / overlap・zero duration・日境界外→false。

## 4c. A1-2-2.5 実装（landed）— Deadline Gate Alignment
**発見**: best-action では `deadlineSatisfied` が gate でなく score 項だった ＝ 保護対象 deadline を壊す候補が
「低 score で候補に残る」状態。秘書 OS として弱い（飛行機/試験/面接/通院予約/支払い系）。
**対応（案 A・独立 gate）**:
- `best-action.ts`: `GateKind += "deadline"` ＋ evaluateGates に `deadline` gate（`pass: m.deadlineSatisfied`、
  reason="breaks a protected deadline"）。**保護対象 deadline 破壊を説明可能な理由つき hard reject**。
- GateKind 列挙 3 箇所同期: `redaction-guard.GATE_TOKENS` / `dev-report.GATES` / 既存 "all 6 gates" test→7。
- `deadlineSatisfied` は A1-2-2 の **保守的 proxy** ゆえ「すべての deadline 問題を完全捕捉」はしない
  （保護対象クラス hard/locked/immovable/critical のみ false。soft/movable は false にしない＝過剰 reject しない）。
- deadline **score 項は残す**（gate 通過後は定数化・harmless。削除/score 再設計は別フェーズ）。
- test: deadlineSatisfied=false→deadline gate fail / rankCandidates で deadline 破壊候補は **best にならない**
  （高 score でも score 救済されない）/ soft/movable update→deadlineSatisfied=true（過剰 reject なし）。

## 4d. A1-2-3 実装（landed）— evaluateCandidate（draft→BestActionCandidate の橋）
`candidate-evaluator.ts` に `evaluateCandidate(draft, context) → BestActionCandidate`：
- **safety metrics は必ず `evaluateSafetyMetrics` 由来**（CandidateDraft に metrics 場が無い＝generator 自己申告不能）。
- 客観 metric は **`instability`（move+remove 数）のみ**実算出。
- subjective（goalAttainment/rhythmFit/slackHealth/overpack/contextSwitches/correctionMisalignment）は
  **中立 default 0**（水増ししない・本実装は A1-2-4 以降）。
- best-action は不変 → 標準 BestActionCandidate を産むのみで **Gate-first がそのまま効く**。
- test: safety=evaluator 一致 / subjective=全 0 / instability=客観 count /
  **rankCandidates で feasible·recovery·deadline·wholePart の gate-false 候補は best にならない**（score 救済なし）。
- 未実装（範囲外）: subjective 本実装 / 客観 score 拡充(A1-2-4) / Build·Complete·Repair·Optimize / rank の production 接続。

## 5. 境界
- 🟢 pure（A1 全体・新規ファイル・barrel 未追加・非 test 参照ゼロ＝production 挙動変更ゼロ）
- 🔴 A1 外: UI / route / PlanClient / DB / Supabase / runtime 接続 / staging smoke / production / push / PR。

## 6. 次 GO 待ち
A1-2-4（客観 score 拡充: slackHealth/overpack/contextSwitches）。その後 A1-3+（Build/Complete/Repair/Optimize）。merge / 統合は CEO 判断待ち。
