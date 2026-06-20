# Day Rehearsal Repair Candidate — Draft v0 mini design（設計のみ・実装しない）

> 2026-06-07 / **設計のみ・実装しない** / 前提: Repair v1 + dedup main live（`db70d018`）・rehearsal は Option D（status-only）。

---

## 0. 結論（先に）— ★前提を覆す重要 finding
- **「予定変更の下書き」層は既に存在する**: `lib/plan/reality/`（**Reality Control OS**）が **`ChangeOp`（add/remove/update=move/shorten）・`ChangeSet`（ops+reason+sourceTraces）・`applyChangeSet`（純粋 apply・persist なし）・`invertOp`（undo）・`authority.ts`（governance=flexibility/protection の不可侵正本）** を持つ、純粋・reversible・governed な plan-change 層。
- ∴ **Repair Draft を新規 parallel な draft 型として作るのは redundant**（NO-GO）。正しい v0 は **Day Rehearsal Repair Candidate（診断/示唆）→ Reality 語彙への disposition 分類 bridge**。
- ★さらに重要: **Repair Candidate の大半は「予定変更」ではない**。leave_earlier だけが plan-change（Reality update/move）寄りで、しかも **Option D では magnitude（shortfall）が無く・Reality move mode も未実装で二重ブロック**。confirm_uncertain=確認タスク（変更でない）・use_recovery_window/protect_buffer=**Reality 保護シグナル**（recovery_core/cascade_guard・変更でない）・reduce_density=vague optimize（v0 除外）。
- **推奨 v0 = pure な「disposition 分類器」**（candidate→{disposition, isPlanChange, reality 対応, blockers}）。**ChangeSet は作らない・Reality コードに couple しない・unwired**。実 ChangeSet 生成は full path（magnitude）+ Reality coordination 後の別 slice。
- ★戦略判断（CEO）: 「Repair」概念が **2 つ**になった（Day Rehearsal Repair=診断 / Reality Repair=governed 変更）。両者の関係（feed するか独立か）は architecture 決定。

## 1. architectural finding（既存 plan-change 層）
| 層 | 役割 | 状態 |
|---|---|---|
| Day Rehearsal Repair Candidate（本系） | 1日先取りシミュレーションからの **read-only 診断/示唆** | main live |
| **Reality Control OS**（`lib/plan/reality/`・別セッション A1-x 進行中） | **governed な予定変更の生成・評価・apply シミュレート**（ChangeSet/applyChangeSet/authority） | 活発に構築中（main に A1-5-11/12/14） |
- Reality の道具立て: `ChangeOp{kind:add/remove/update, itemId, before/after: PlanItemSnapshot}` / `ChangeSet{id, ops, reason, sourceTraces}` / `applyChangeSet(nodes, cs)→ApplyResult`（純粋・persist なし）/ `invertOp`（reversibility）/ `authority.ts`（`PlanItemFlexibility`=locked/movable/shortenable/droppable, `ProtectionReason`=hard_external/user_declared/recovery_core/cascade_guard/tentative, **INV-7「Repair は flexibility 順・hard を無断で動かさない」**, fail-closed=immovable）。
- ∴ 「下書き」= Reality `ChangeSet`。reversibility/governance/pure-apply は **全て既存**。Repair Draft が再発明すべきでない。

## 2. ★kind 別 disposition（v0 の核心）
| kind | disposition | plan-change か | Reality 対応 | v0 で draft 化できるか |
|---|---|---|---|---|
| **leave_earlier** | `adjust` | △（唯一の変更寄り） | `update`(move=event を早める) | **不可**（Option D に magnitude[shortfall] 無し＋Reality move mode 未実装＝二重ブロック）。v0 は「方向=早める」のみ |
| **confirm_uncertain** | `confirm` | ✗ | 変更でない（INV-23 tentative/確認） | **draft でなく確認タスク**（移動/travel を確認する） |
| **use_recovery_window** | `protect` | ✗ | **`recovery_core` 保護**（governance シグナル） | **draft でなく保護/維持**（この余白を埋めない） |
| **protect_buffer**（dormant） | `protect` | ✗ | `cascade_guard`/`recovery_core` 保護 | 保護シグナル（Option D 不到達） |
| **reduce_density** | `reduce` | ○（最も変更寄り） | `remove`/`update`(shorten)=Optimize（droppable/shortenable 先） | **v0 除外**（target 無し・どの予定を削るか選ぶ＝最適化・予定変更に最も見える） |

→ **v0 で実 ChangeSet 化できる kind は実質ゼロ**（leave_earlier は二重ブロック）。残りは変更でない（confirm/protect）か除外（reduce）。よって v0 の正しい成果物は **disposition 分類**であって draft（ChangeSet）生成ではない。

## 3. CEO 9 問への回答
1. **各 kind が draft 化できるか** → 差別化が必要。plan-change 化できるのは leave_earlier のみ（かつ二重ブロックで v0 不可）。confirm=タスク・protect=保護シグナル・reduce=除外。→ **一律「draft 化」は誤り。disposition 分類が honest。**
2. **draft に必要な情報** → 実 ChangeSet（Reality）には `itemId`(=eventId)・`before/after PlanItemSnapshot`(start/end 時刻)・`reason`・`sourceTraces`・`governance` が要る。Option D が供給できるのは eventId（targetStepIndex→step.eventId）のみで、**after の時刻（=核心）が無い**（shortfall null）。→ **Option D では draft の必須情報が欠落。**
3. **leave_earlier は出発時刻候補にできるか** → **不可（v0）**。magnitude（shortfall=full path）も「出発」エンティティ（plan は event start/end のみ・departure を持たない）も無い。出せるのは**方向（早める）**のみ。具体時刻は full path + 「どの event を動かすか」の編集判断が要る。
4. **confirm_uncertain は確認タスク扱いにすべきか** → **YES**。予定変更でなく travel/移動の確認タスク（Reality ChangeSet の外）。
5. **use_recovery_window は保護/維持候補にすべきか** → **YES**。Reality `recovery_core` 保護に対応（この余白を守る governance シグナル）。変更でない。
6. **reduce_density は v0 で扱うべきか** → **NO（除外）**。target 無し・予定削除/短縮を選ぶ＝最適化＝予定変更に最も見える。Reality Optimize の領域。
7. **draft と suggestion の境界** → **3 層**: suggestion（prose 示唆・live）→ **disposition（構造化された「変更との関係」・v0 で作る）** → ChangeSet（実 reversible 変更・Reality 既存）。v0 は disposition 層のみ。ChangeSet は Reality。
8. **draft を UI に出す実行導線に見えない表現** → （v0 では出さない）将来出すなら Reality `applyChangeSet` で**変更を試算＝リハーサル**として見せる（「もしこう動かすなら（下書き・試算）」・reversible・**commit ボタンなし**）。Day Rehearsal の「試す」思想と一致。実行コントロール（適用/保存/この時刻に変更）は置かない。
9. **DB/Plan 変更なしで pure model で閉じられるか** → **YES**。disposition 分類器は純粋・Reality 非 import・DB なしで閉じる。実 ChangeSet/applyChangeSet も純粋（persist なし）だが、それは Reality の領域で別問題（coordination）。

## 4. draft object 案（v0 = disposition のみ）
```ts
// v0 で作る純粋層（unwired・Reality 非 import）
type RepairDisposition = "adjust" | "confirm" | "protect" | "reduce";

interface RepairDraftDisposition {
  readonly kind: DayRepairKind;
  readonly disposition: RepairDisposition;
  readonly isPlanChange: boolean;        // adjust/reduce=true・confirm/protect=false（「大半は変更でない」を明示）
  readonly targetStepIndex: number | null;
  // 将来 Reality へ橋渡すときの対応（v0 は文字列 doc・enum couple しない）:
  readonly realityHint: string;          // 例 "update(move)" / "protection:recovery_core" / "verify_travel" / "optimize(remove|shorten)"
  readonly magnitudeMin: number | null;  // 常に null（Option D・捏造しない。full path で shortfall から）
  readonly blockers: readonly string[];  // 例 ["no_magnitude(option_d)", "reality_move_mode_unimplemented"]
  readonly suggestion: string;           // 元 candidate prose（参照）
  readonly evidence: Evidence;           // trace
}
// classifyRepairDisposition(candidate) → RepairDraftDisposition | null（reduce_density は v0 では null=除外 or disposition="reduce" だが isPlanChange 明示）
```
- ★**実 draft（ChangeSet）は v0 で作らない**。それは Reality `ChangeSet`（既存）が正本。disposition は「将来どの Reality 概念に橋渡すか」の **spec/分類**であり、ChangeSet そのものではない。
- magnitudeMin は field として持つが Option D で常に null（full path で埋まる・forward 互換）。

## 5. 境界（suggestion / disposition / ChangeSet）
```
candidate ──prose──▶ suggestion        （現行・live・UI に出る read-only 文）
candidate ──class──▶ disposition        （★v0・pure・unwired・「変更との関係」の構造化）
disposition ─bridge▶ Reality ChangeSet  （将来・Reality 既存・governed reversible 変更・apply シミュレート）
ChangeSet ──gated──▶ 実 persist          （遥か将来・別 CEO 判断・実 予定変更）
```

## 6. GO / NO-GO + 最初の pure layer
- **GO（推奨）**: `lib/plan/dayRehearsal/repairDraftDisposition.ts`（dayRepairPreview.ts のパターンを踏襲）。`classifyRepairDisposition(candidate)`/`classifyRepairDispositions(candidates)`。純粋・unwired・Reality 非 import・ChangeSet なし・apply なし。test: kind→disposition / isPlanChange / magnitude null / reduce 除外 or 明示 / blockers / 禁止語なし。
- **NO-GO**: ①新規 RepairDraft/ChangeSet 型の再発明（Reality と redundant）②Option D で ChangeSet 生成（magnitude 無し）③in-flight な Reality candidate-generator/evaluator への couple ④reduce_density の plan-change 化 ⑤apply/save/UI/予定変更/full path 実装。
- **最初に実装するなら**: 上記 `repairDraftDisposition.ts`（disposition 分類器）**のみ**。これが draft への安全な第一歩（実 ChangeSet は Reality + full path + coordination 後）。

## 7. 戦略・哲学 + CEO 判断点
- **哲学整合**: Aneurasync は「自己理解（第二の自己）」が核で、Day Rehearsal は「最適化でなく試す」。「予定変更の下書き」は**最適化/タスク管理に寄るリスク**（「今はやらないこと」=最適化 隣接）。緩和策＝大半を非変更 disposition（confirm/protect）に分類・leave_earlier も方向のみ・reduce 除外・「試す（リハーサル）」として枠付け。→ disposition 層はこの緩和を**型で強制**する（isPlanChange=false が大半）。
- **architecture 判断（重要）**: 「Repair」が 2 系統に。**Day Rehearsal Repair（診断）→ Reality Repair（governed 変更）へ feed するか / 独立の示唆に留めるか** は CEO 決定。feed する場合、disposition 層がその接点になる。
- **coordination**: Reality は別セッション活発進行中。直接 couple は in-flight 干渉リスク → v0 は **authority.ts の安定 enum を doc 参照に留め code couple しない**。実橋渡しは Reality 側の安定後に coordinate。

### CEO 判断点
1. v0 を **disposition 分類器（pure・unwired）** として作る（推奨）か / draft v0 自体を見送り suggestion 止まりにするか。
2. 「Day Rehearsal Repair → Reality Repair へ feed」する architecture を採るか / **独立**（示唆のみ）に留めるか。
3. disposition は **3 分類（adjust/confirm/protect）+ reduce 除外** で良いか（reduce_density を null にするか disposition="reduce"・isPlanChange=true で持つか）。
4. magnitude/実 ChangeSet は **full path + Reality coordination 後**で良いか（v0 は方向のみ）。
5. 哲学整合（「試す」枠・非変更を型で明示）を v0 の不変条件に含めて良いか。
