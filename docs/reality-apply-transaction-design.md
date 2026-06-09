# Reality Control OS — A-3 Apply Transaction / Undo / Idempotency Design（**docs-only / read-only design**）

> 2026-06-09 / Build Unit / CEO 指示「A-4 server apply writer に進む前に、実 write の取引境界・undo・idempotency・post-write verification を設計で固定する」。
> **docs-only**。DB write / route / PlanClient / apply / migration apply / notification / production / enable には**一切**進まない。
> 前提: A-1 apply precondition checker（`de93e21b`）+ A-2 draft→real-id + provenance（`6e9427d7`）完了。本設計は read-only 調査（既存 infra 精査）に基づく。

---

## 0. 結論（最重要・前提を疑った結果）

A-3 を設計するために「**apply は一体どこに書くのか**」を read-only で深く調査した結果、**当初の前提（新規 server apply writer + 新規 migration が必要）は誤りである可能性が高い**ことが判明した。

### 0.1 三つの発見
1. **apply 先 `external_anchors` は既に「誤設計」として排除済み**。`external_anchors` は **確定した外部予定**（`confirmed_at NOT NULL`＝未確認は永続化禁止・Invariant 2.1）であり、alter 由来の tentative 提案ブロックの受け皿ではない。並行トラック（A1-6-5d）が「誤設計(external_anchor)を排し status-only に修正」と明記。
2. **production-proven な apply 経路が既に存在する**（並行 A1-5/A1-6/A1-7 トラック）:
   - **書き込み先 = `plan_seeds`**（status: active→consumed/rejected）。migration は **staging(hjcr) 適用済**（production 未・CEO gate）。
   - **書き込み primitive = `lib/plan/reality/integration/plan-seed-status-executor.ts`**：`applyStatusTransition(seedRef, from, to)` = 条件付き UPDATE `plan_seeds SET status=to WHERE id=seedRef AND status=from`。**`from=active` guard が idempotency と並行安全の両方を担保**（0 rows→ok=false で fail-closed）。
   - **atomic 複数表 write = RPC `create_plan_seed_capture_bundle`**（SECURITY INVOKER + auth.uid() assert + single transaction + JSONB structured-only）。
   - **A1-6-5d で real staging DB write smoke 済**（create→accept(active→consumed)→DraftPlan reflect→dismiss(active→rejected)→later(no write)→cleanup rows=0 PASS）。
3. **「提案を見せる」段階は DB write を必要としない**。`lib/plan/reality/consumed-seed-merge.ts` は consumed seed を **DraftPlan に additive merge する computation**（DB write なし）。同パターンで **empty-day ChangeSet を DraftPlanItem に reflect すれば、書かずに提案を可視化できる**。

### 0.2 結論として A-4 はこう設計すべき
**apply を 2 段に分離する**:
- **A-4 第1段 = Display-apply（DB write ゼロ）**: empty-day ChangeSet を **DraftPlan computation に reflect**（DraftPlanItem origin=alter_generated・rigidity=suggestion）。`consumed-seed-merge` と同型の **pure additive merge**。**migration 不要・writer 不要・idempotency 不要**（書かないため）。undo = merge しない（trivial）。**これが最小・最安全の最初の apply**。
- **A-4 第2段 = Commit-apply（DB write・user accept 時のみ）**: ユーザーが提案を受理したとき **既存の plan_seeds status-only 経路を再利用**（新規 writer/table を作らない）。idempotency=from-guard・atomic=既存 RPC・undo=逆 status 遷移。**plan_seeds は staging 適用済ゆえ migration 追加は原則不要**（dedup 用 partial unique index のみ design-only の選択肢）。

→ **本設計の核心**: 新規 apply writer / 新規 migration を作る前に、**(a) 提案の reflect は no-write computation で足りる**、**(b) 永続化が要る段でも既存の staging-proven な plan_seeds status 経路を再利用できる**。これにより A-4 のリスク・工数・gate 数が大幅に減る。**ただし既存経路は並行トラック所管ゆえ、再利用は CEO + cross-track 調整 gate**。

---

## 1. Transaction boundary（取引境界）

| 段 | 書き込み | 取引境界 | partial apply | failure rollback |
|---|---|---|---|---|
| **Display-apply** | **なし**（computation） | 不要（pure merge・例外時は merge 結果を捨てるだけ） | 起こらない（書かない） | 不要（state 不変） |
| **Commit-apply（単一 seed）** | plan_seeds 1 行の status UPDATE | **単一行 UPDATE = それ自体 atomic**（Postgres row-level） | 起こらない（1 文 1 行） | from-guard で 0 rows→no-op（壊さない） |
| **Commit-apply（複数 = bulk）** | 複数 seed status / capture bundle | **RPC（plpgsql function）= single transaction**（`create_plan_seed_capture_bundle` 型・all-or-nothing） | **禁止**（RPC が全成功か全 rollback） | RPC 内 RAISE→自動 rollback |

- **apply 対象と undo entry を同一 transaction にするか**: Commit-apply では **不要**。理由: 単一行 status UPDATE は自己完結で逆操作が決定的（consumed→active）。undo entry を別表に書くより、**逆遷移を再実行する方が単純**（既存 executor をそのまま使える）。bulk は RPC 内で undo メタ（適用前 status）を返り値に含め、caller が保持（DB ledger 不要）。
- **post-write read-back を取引に含めるか**: **含めない**（取引後の別 step）。理由: read-back は検証であり書き込みではない。commit 後に status を select し直し、期待（consumed）と一致を確認。不一致なら逆遷移で compensate。

## 2. Apply writer contract（A-4-a で実装する interface・docs で固定）

```ts
// 第1段 Display-apply（pure・no-write）— consumed-seed-merge と同型
reflectChangeSetIntoDraftPlan(prepared: ChangeSet, draftPlan: DraftPlan, opts): DraftPlan
//  add op → DraftPlanItem(origin: "alter_generated", rigidity: "suggestion", id=real itemId)
//  additive・date filter・duplicate guard（既存 handle 再追加なし）・元 DraftPlan 不変。書かない。

// 第2段 Commit-apply（write・user accept 時）— 既存 executor を wrap
applyPreparedChangeSet(input: {
  prepared: ChangeSet;                  // A-2 出力（real id + provenance）
  precondition: ApplyPreconditionResult; // A-1 出力（**can_apply 必須**）
  confirmation: { confirmed: boolean };  // user 明示確認
  idempotencyKey: string;               // = prepared.id（deterministic）
  nowMs: number;
  executorPort: CandidateActionExecutor; // 既存 plan-seed-status-executor 注入
}): ApplyResult

interface ApplyResult {                  // **redacted summary のみ**
  status: "applied" | "skipped" | "failed" | "rolled_back";
  appliedOpCount?: number;               // count のみ（raw なし）
  undo?: { undoableUntilMs: number; sessionRestorable: boolean };
  reason: string;                        // redacted 短文（raw/PII なし）
}
```
- input は prepared ChangeSet + A-1 result + confirmation + idempotency key。**output は redacted summary のみ**（raw/title/seedRef/PII を返さない）。
- writer は **書く直前に A-1 を再実行**（§5）。`can_apply` 以外なら `skipped`（書かない）。

## 3. Idempotency

- **既存メカニズムを再利用**: `applyStatusTransition` の **`WHERE status=from` = 条件付き UPDATE**。同じ apply を二回投げても、2 回目は既に consumed ゆえ **0 rows→ok=false→`skipped`**。**DB の row-count が idempotency と並行制御の両方**を担保（A1-6-5d で「並行 consume / duplicate / non-active を fail-closed」と実証済）。
- **deterministic ChangeSet.id の扱い**: A-2 が ChangeSet.id を据え置く（idempotency key）。Commit-apply では seedRef（plan_seeds.id）と ChangeSet.id の対応を **caller が保持**（A-1 の `appliedSnapshot.appliedChangeSetIds` がこの判定 interface）。
- **ledger table / 新規 idempotency column は不要**（既存 from-guard で足りる）。**任意の強化**: `plan_seeds` に partial unique index `(user_id, action_shape, date, time_hint) WHERE status='active'`（A1-5-11-3 で design-only 提案済）。**migration ゆえ別 gate・必須ではない**。
- **retry 挙動**: from-guard ゆえ安全に retry 可（成功後の retry は no-op）。fire-once + 失敗時のみ retry を推奨（A1-7-13 と整合）。
- **concurrent apply**: 同一 seed への並行 accept は条件付き UPDATE で **片方のみ成功**（もう片方 0 rows）。DB が直列化。

## 4. Undo design

- **`invertChangeSet` / `makeUndoEntry`（既存 pure lib）を中核に**:
  - `invertChangeSet(prepared)` = add↔remove・update swap（real id 保持・A-2 で検証済）。
  - `makeUndoEntry(cs, committedAtMin)` = 単一 5 分 / bulk session 窓（720 分）+ `sessionRestorable`。
- **undo entry の保存先**: **新規 table を作らない**。
  - **Display-apply**: undo = DraftPlan から該当 item を除く computation（保存不要）。
  - **Commit-apply 単一**: undo = **逆 status 遷移**（consumed→active を `applyStatusTransition` で実行）。保存するのは「window 期限」のみ（client/session state・既存 localStorage `aneurasync.plan.proposalUndo.v1` パターン）。
  - **Commit-apply bulk**: 逆 ChangeSet を session state に保持（DB 不要）。
- **undo 可能期限**: 単一 5 分・bulk session（既存 `DEFAULT_MIN_UNDO_WINDOW_MIN=5` / `DEFAULT_SESSION_WINDOW_MIN=720`）。`isUndoable(entry, nowMin)` で判定。
- **rollback と user-initiated undo の違い**:
  - **rollback**（system）= apply 失敗 / post-write 不一致時の compensate（自動・逆遷移）。
  - **user-initiated undo** = 成功後にユーザーが「元に戻す」（窓内・逆遷移）。
  - 機構は同一（逆 status 遷移）だが trigger と期限が異なる。
- **undo 失敗時の扱い**: 逆遷移も from-guard ゆえ、既に他要因で状態が動いていれば 0 rows→ok=false。**fail-closed で「undo できなかった」を redacted に報告**し、状態を捏造しない（二重補正しない）。

## 5. Invariant / conflict / stale recheck

- **apply 直前に A-1 を再実行**（**writer が信頼するのは渡された precondition ではなく、書く瞬間に再取得した live state**）:
  1. **WorldState 再取得**（live anchors + memory を read・既存 reader 再利用）。
  2. `worldStateApplySignature(live)` と prepared の `baseVersion` を照合（**stale**）。
  3. `detectConflicts`（対象 window が固定予定と重なる / 消えた = **conflict**）。
  4. `evaluatePermission(applyAction…)`（**propose ではない**・§6）。
  5. `validateUndoability` / idempotency snapshot / confirmation。
  - いずれか NG → **書かずに `skipped`**（verdict を redacted に報告）。
- **post-write read-back verification**: commit 後に書いた seed の status を read し直し、`applyChangeSet`（既存 pure simulation・`candidate-evaluator.ts`）で計算した期待 end-state と一致を確認。**不一致 → 逆遷移で compensate → `rolled_back`**。
- **hard constraints / immovable**: `detectConflicts` が hard_external 重なりを `conflict_immovable` として検出（A-1 既実装）。

## 6. Permission / confirmation

- **propose allowed は apply allowed ではない**（A-1 で証明済・本設計の不変前提）。
- **apply ActionKind で再評価**: Display-apply（見せるだけ）は `propose`/`draft` 相当だが書かないため低リスク。Commit-apply（status を確定）は `adjust_plan`/`book` 相当で **floor が高い**→ level 不足なら `confirm_required`/`blocked`。writer が `evaluatePermission` を apply ActionKind で再実行。
- **confirm_required の承認状態**: `ApplyPreconditionResult.requiredConfirmation` が true かつ `confirmation.confirmed!==true` → 書かない。Commit-apply は **常に user 明示確認を要求**（accept ボタン = 確認）。
- **high risk / other person / booking / purchase / personal info**: A-1 が **never auto can_apply**（confirmed でも自動承認しない）。empty-day ブロックの commit は本来 low/elevated だが、外部連絡/予約を含む将来 action は high→必ず confirm/block。

## 7. RLS / security

- **owner-RLS**: plan_seeds は owner select/insert/update/delete 全 present（auth.uid()=user_id）。executor は **user-RLS client 注入**（service_role なし）。
- **service_role 禁止**: 既存 executor / RPC は SECURITY INVOKER + anon+auth client。**service_role を使わない**（A1-6-5d 実証）。
- **column-restricted**: status 列のみ UPDATE（generateComplete/anchor を書かない）。read は SEED_COLUMNS_SQL（raw/source_ref なし）。
- **raw / title / location / PII / seedRef / personality / trait を保存・返却しない**: plan_seeds は structured-only（raw を保存しない）。A-2 が provenance の raw を fail-loud で弾く。ApplyResult は count/boolean/redacted reason のみ。
- **logs に出してよいもの**: status 遷移の ok/count・verdict・undo 窓・redacted reason。**出してはいけないもの**: seedRef・UUID・raw・source_ref・title・location・PII。

## 8. DB schema / migration 要否

| 項目 | 要否 | 根拠 |
|---|---|---|
| **idempotency ledger table** | **不要** | from=active guard（条件付き UPDATE row-count）が idempotency+並行制御を担保（A1-6-5d 実証） |
| **undo entries table** | **不要** | undo = 逆 status 遷移（既存 executor）+ window は session/localStorage（既存パターン） |
| **plan_seeds 本体** | **追加不要**（既存・staging 適用済） | A1-5-2-2-2b で staging(hjcr) apply 済。production apply は別 CEO gate |
| **partial unique index（dedup 強化）** | **任意（design-only）** | A1-5-11-3 提案。必須でない。採用するなら **A-4 前の別 migration gate** |
| **新規 alter_plan_blocks table** | **非推奨** | DraftPlan reflection（computation）で足り、external_anchor は誤設計排除済。新 table は重複概念 |

→ **Display-apply（第1段）は migration ゼロ**。Commit-apply（第2段）も **既存 plan_seeds 再利用で原則 migration ゼロ**。唯一の任意 migration は dedup 用 partial unique index（design-only・別 gate・必須でない）。
→ **production への plan_seeds migration apply は独立した CEO gate**（staging では適用済）。

## 9. A-4 implementation slices（安全な分割）

| slice | 内容 | write | gate |
|---|---|---|---|
| **A-4-0** | **apply target 最終決定**（Display-apply 先行 + Commit は plan_seeds 再利用 / 新 table 不採用）+ **cross-track 調整**（既存 executor/merge 所管トラックとの整合） | なし | 🔒 **CEO 決定 + cross-track 調整 gate**（最初に必須） |
| **A-4-a** | writer interface + fake adapter tests（`reflectChangeSetIntoDraftPlan` pure + `applyPreparedChangeSet` を fake executor で）。**実 DB 不接触** | なし | pure・自律可（CEO GO 後） |
| **A-4-b** | （任意）dedup 用 partial unique index の migration SQL 作成（**apply しない**） | なし | 🔒 migration gate（任意・必須でない） |
| **A-4-c** | **Display-apply の staging 検証**（reflect→DraftPlan 表示・**書かない**） | なし | 🔒 staging render gate |
| **A-4-d** | **Commit-apply の controlled staging write smoke**（既存 executor で active→consumed→read-back→逆遷移 undo→cleanup rows=0） | **plan_seeds status のみ** | 🔒 **CEO write gate（初の write）** |
| **A-4-e** | PlanClient / UI 接続 + confirmation UI + production | route/UI | 🔒 後続 gate（production まで段階） |

---

## 10. 報告（CEO 判断用）

### A-3 設計要点
- **apply を Display-apply（no-write computation）/ Commit-apply（write）に 2 分割**。最初の apply は **DB write ゼロの DraftPlan reflection**（consumed-seed-merge と同型）。
- **既存の plan_seeds status-only 経路（from=active guard・RPC・staging-proven）を再利用**し、新規 writer/ledger/undo table を作らない。
- transaction=単一行 UPDATE or RPC（atomic）/ idempotency=from-guard / undo=逆 status 遷移 + 既存 pure lib / post-write=read-back + applyChangeSet simulation / permission=apply ActionKind 再評価 / RLS=owner + service_role なし + structured-only。

### A-4 に進む前に必要な未解決事項
1. **【最重要】apply target の最終決定**（A-4-0）: Display-apply 先行 + Commit は plan_seeds 再利用、で確定してよいか。新 table を作らない方針の承認。
2. **cross-track 調整**: `plan-seed-status-executor.ts` / `consumed-seed-merge.ts` は **並行トラック所管**。再利用には所管トラックとの整合確認（重複実装・責務境界）が必要。
3. **empty-day ChangeSet（時刻ブロック）↔ plan_seeds（band-level seed）の粒度ギャップ**: Commit 時に時刻情報が seed では粗くなる。Display-apply は時刻を保持（DraftPlanItem は HH:MM）。**Commit で時刻ブロックをどう保持するか**は未解決（plan_seeds に時刻列を足すか / Display 止まりにするか）。
4. **plan_seeds production migration**: staging 適用済・production 未。Commit-apply の production には別 gate。

### migration が必要か
- **Display-apply: 不要（migration ゼロ）**。
- **Commit-apply: 原則不要**（plan_seeds staging 適用済を再利用）。**任意**で dedup 用 partial unique index（design-only・別 gate）。時刻保持が必要なら plan_seeds への列追加 migration（未解決事項 #3 次第・別 gate）。
- **plan_seeds の production apply は独立 CEO gate**。

### A-4 最小実装 scope
- **A-4-0（決定・no-code）→ A-4-a（`reflectChangeSetIntoDraftPlan` pure + fake tests・no-write）** が最小。Display-apply の pure reflect を fake で固め、書かずに「提案が DraftPlan に見える」ことを検証する。

### A-4 で必ず止める gate
- 🔒 **実 DB write**（A-4-d・初の write・CEO gate）
- 🔒 **migration apply**（任意 index / 時刻列 / production plan_seeds）
- 🔒 **PlanClient / UI 接続・confirmation UI**（A-4-e）
- 🔒 **production / notification / native / REALITY_ALTER_BRIDGE_LIVE enable / user-facing**
- 🔒 **cross-track の既存 executor/merge への実配線**（所管調整なしに触らない）

→ A-3 完了。**A-4 server apply writer / DB write の前で停止**する。
