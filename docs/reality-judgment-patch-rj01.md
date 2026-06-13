# RJ0.1: Reality Judgment Patch（docs-only・コード変更ゼロ）

- 日付: 2026-06-13 / 裁定サマリ: **採用 9 / 構造を整えて採用 1（§3）**。§1 は私の設計ミスを全面承認
- 優先順位: 本書 → RJ0 → RC2a-1c → RG0.6b 系（矛盾時は本書優先）
- 停止位置: RJ0.1 完了で停止。RC2a-2 GO は CEO 判断

---

## 1. Task master と ScheduledWorkBlock の分離（全面採用 — 自己訂正）

**RJ0 §2「task が時刻枠を確定したら anchor 化して ern に一本化」は設計ミス**。task を anchor 化で消すと deadline / estimatedDuration / cognitiveLoad / canSplit / minimalProgress / completionStatus / carryOverRisk / decompositionRef が失われる。修正後の正本:

```
TaskRealityNode        = 作業の正本（master）。deadline・見積・分解・進捗・carryover を保持し続ける
ScheduledWorkBlock     = task を時間帯に置いた「配置」。anchor/ern として扱ってよい
接続                    = block.sourceRefs.taskId ↔ task.placements[]（block 側が taskRef を持つ）
本人選択後の anchor 化   = 「配置」の実体化であって task 本体の変換ではない
完了時                  = task.completionStatus が更新され、block は履歴になる
```

「二重実体禁止」の意味の訂正: **同じ事実を二箇所で正本化しない**（task の deadline は task だけが持ち、block は参照する）であって、**master を消すことではない**。1 task : N blocks（分割配置）が自然に表現できる。

## 2. JudgmentTrace identity の強化（採用 — snapshot identity と同型の修正）

`rj:<graphBaseId>:<kind>:<target>` は分・revision 変化で「同 id 別判断」になり得る（RG0.6a §1 で snapshot に対して直した穴と同型 — 検出が遅れたのは私の落ち度）。修正:

```
judgmentId = rj:<snapshotId>:<judgmentKind>:<targetNodeId>:<judgmentSchemaVersion>
  …snapshotId は graphBaseId + minuteOfSubjectiveDay を既に内包（RG0.6a §1）→ 分・入力・版の変化で id が変わる
  …judgmentId は cache key（証明ではない — RC2a-1b §2 の FNV 境界規律を継承）
Trace 本体 = full inputRevisionSet / derivationVersions / snapshotId を必ず保持
  （RJ0 §10 で usedInputs.inputRevisionSet と derivationVersions は既に契約済み — id 側の欠落だけを本節で修正）
```

## 3. FeasibilityStatus と RiskLevel の分離（構造を整えて採用）

risk と成立判定は別物 — ただし**二重正本を作らない**ため、feasibilityStatus は riskLevel+blockingReasons+missingInputs からの**決定的 derived view** として定義する（独立に代入しない）:

```ts
riskLevel: "low" | "elevated" | "high"        // 内部正本（RG0.6 §4 語彙・factors 付き）
blockingReasons: string[]                       // 構造的に不成立の理由（例: 前予定と物理的に重複）
feasibilityStatus（derived・単一写像）=
  blockingReasons 非空                    → "infeasible"
  クリティカル入力欠落（missingInputs 該当） → "unknown"
  riskLevel high                          → "feasible_with_risk"（崩れやすいが構造的不成立ではない）
  riskLevel elevated                      → "feasible_with_risk"
  riskLevel low                           → "feasible"
displayLabel（成立/注意/危険/不明 等）= feasibilityStatus からの UI 写像（derived 層・N-3 準拠語彙）
```

feasible/feasible_with_risk/infeasible/unknown は **RJ 判断語彙クラス**（RG0.6b §1 の wrapper/diagnostic 例外）— 予定意味論の新正本ではなく、写像で完全決定される。

## 4. silent / observe の復権（採用 — RJ0 §6 の混同を訂正）

RJ0 の「no-action step 禁止」は **INV-1（no-action push 禁止）と「黙る判断」を混同していた**。沈黙は受容性哲学の第一級の判断結果（receptivity-gate の silent と同思想）:

```ts
interventionDecision（plan-level）= "silent" | "observe" | "plan_steps" | "ask" | "propose" | "block"
  silent  = 今回は何も出さない（判断として記録 — JudgmentTrace に残る）
  observe = 出さないが監視を継続（次の評価時点を持つ）
  block   = 介入自体が permission で禁止されている状態の明示
steps[] は decision = plan_steps / ask / propose の場合のみ存在（ユーザー接触がある場合のみ）
no-action **push** の禁止は不変（step には必ず行動導線 messageType）
```

## 5. interventionKind と DeliveryMode の分離（採用）

DeliveryMode は**配信上限**であって介入の意味ではない。step 構造を改訂:

```ts
InterventionStep = {
  at: string,
  interventionKind: "wake" | "prepare" | "final_decision" | "fallback" | "ask" | "three_options",  // 介入の意味論（RJ 診断語彙）
  messageType: …,                       // 文面型（kind に従属）
  deliveryModeCeiling: DeliveryMode,    // 配信上限（既存語彙・実配信は receptivity-gate が ceiling 以下で最終判定）
  permissionRequired: boolean,          // PermissionLevel/governance 由来
  triggerCondition: string,             // 例: "now >= prepareAt ∧ 準備未完"（位置系条件は位置 gate 後）
  reasonCodes: string[],
}
```

## 6. PrepTime の昇格条件（採用）

displayPolicy の昇格 ladder を定義（**数値は暫定 — B1 設計時に CEO 確定**）:

```
debugOnly → reference     : B1 calibration 適用済み ∧ 同 context（verb×時間帯×weather）の補正 ≥3 件
reference → visible       : evidence quality ≥ medium ∧ confidence ≥0.6 ∧ 直近 14 日の安定（補正の振れ幅小）
visible → actionable      : 上記継続 ∧ CEO gate（actionable = wakeAt/prepareAt の文言に使える）
不変条件                   : actionable 未満では hard departure line・強い文言（「今出ないと」系）に一切使わない
降格                       : 反証補正の連続 / context 不一致で 1 段階降格（learning 正負分離 RC2a-1b §11 準拠）
```

## 7. leaveBy percentile の意味論（採用）

```
recommended = safety-oriented line（移動時間分布の高 percentile で予算 → 早い出発時刻）
hard        = latest acceptable line（低 percentile。ただし Safety Floor（INV-3）percentile を下回らない）
不変条件     : recommended.time ≤ hard.time（順序）/ hard は「まだ間に合う保証」ではない（文言にも保証表現禁止）
            / ETA 分布なし → 全段 null / prep 単独生成禁止（いずれも RJ0 から不変）
percentile の初期値・critical-fractile（Cu/Co）の設定は LSAT 既存規約に従い、B1 学習で更新（Safety Floor は学習で下げない）
```

## 8. Outcome Capture の表現精密化（採用 — 相互収斂の記録）

経緯: GPT 初回「完全に未実装」→ 私の訂正「driftSelections = per-event outcome v0」→ GPT 再監査「v0 の一部とは認めるが『入った』とは言えない」。**双方の最終合意を正本化**:

- driftSelections = **self-reported event drift v0**（実装済み・実機到達済み）— full outcome capture ではない
- 欠落: arrived_on_time / late / completed / partial / skipped(語彙はあるが文脈拡張要) / carried_over / task_progress
- task outcome は完全未実装（task 実体が無いため）/ event-horizon PredictionLedger 接続は RJ6

## 9. Task Decomposition と TaskRealityNode の接続（採用）

TaskRealityNodeV0 placeholder に追加:

```ts
taskDecompositionRef: string | null,
decompositionStatus: "none" | "proposed" | "validated" | "accepted",   // RJ 診断語彙
generatedBy: PredictionPredictor 形（kind: model 等 — 既存型再利用）,
validatedByEngine: boolean,        // LLM 分解は Engine validation なしに採用しない（不変条件）
minimalProgressCandidates: RealityAttribute<string>[],
acceptedMinimalProgress: RealityAttribute<string> | null,  // 本人 or Engine 採用後のみ
```

validation の中身（時間整合・canSplit 整合・禁止語・分割粒度）は RJ5 設計で確定。**LLM 出力の直接採用禁止**だけを本 patch で不変条件化。

## 10. Action Layer 境界（採用 — HOLD のまま境界だけ定義）

```
actionBoundary = 
  display_only            … RJ 出力の表示（UI gate 内）            : PermissionLevel ≥1
  draft_only              … 下書き生成・適用しない                  : ≥3（draft）
  ask_confirmation        … 1 タップ確認を求める                    : ≥3
  write_anchor            … 予定作成/変更（**本人選択 E10 経由のみ**）: ≥4 ∧ changeSet 要確認規約
  send_message            … 相手への連絡                            : **強 gate**（confirm 必須・自動禁止）
  book_pay                … 予約・支払い                            : **強 gate**（INV-5・自動禁止）
  external_communication  … 対外送信全般                            : **強 gate**（絶対停止条件と同列）
  blocked                 … 禁止
```

- kernel の ActionKind（permission-model.ts: observe/notify/propose/draft/adjust_plan/book/purchase/contact/long_travel）と**写像で対応付け**（新正本を作らず RJ 側は boundary 名で参照）
- send/book/pay/external は learning で緩められない（RC2a-1b §11 safety override）・B2/R6 と Permission gate の二重管理

## 11. 完了条件の自己点検

- touched docs: 本書のみ（RJ0 は不変 — 本書が上書き層）
- **code 変更ゼロ** / UI・storage・API・DB・location・notification・external read 不接触
- §1 Task master 分離 ✅ / §2 Trace identity ✅ / §3 Status と Risk 分離（derived 単一写像）✅ / §4 silent・observe ✅ / §5 Kind と Ceiling 分離 ✅ / §6 Prep 昇格 ladder ✅ / §7 percentile 意味論 ✅ / §8 Outcome 表現精密化 ✅ / §9 Decomposition 接続 ✅ / §10 Action 境界 ✅

— RJ0.1 完了で停止。次 = RC2a-2（MovementReality v0 compile）GO 判断。
