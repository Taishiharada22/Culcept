# RJ0.2: Reality Judgment Minimal Patch（docs-only・コード変更ゼロ）

- 日付: 2026-06-13 / 裁定: GPT 監査 8 点 = **全採用**（独立検証で誤り検出ゼロ — 私の規律を未適用箇所に当てる正当な指摘）
- 優先順位: 本書 → RJ0.1 → RJ0 → RC2a-1c 系
- スコープ: GPT 指示どおり**最小**（穴を塞ぐだけ・再説明しない）。各節は契約 delta のみ
- 停止位置: RJ0.2 完了で停止。**§9 = 収束判断（CEO 向け）**

---

## 1. triggerCondition を typed predicate に（採用）

`triggerCondition: string` を廃止し structured condition + 自然文を分離:
```ts
triggerCondition: {
  kind: "time_reached" | "leave_line_resolved" | "prep_reference_available"
      | "origin_unconfirmed" | "permission_required"
      | "location_required_deferred"   // 位置前提は location gate まで inactive
      | "unsupported",                  // v0 未実装条件の明示
  active: boolean,                      // location_required_deferred / unsupported は常に false
}
displayReason: string                   // 文字列説明はここに分離（条件評価には使わない）
```

## 2. reasonCodes を閉じた語彙に（採用 — 自分の provenance 規律の未適用箇所）

`reasonCodes: string[]` → `reasonCodes: (EvidenceTag | RJDiagnosticCode)[]`:
- EvidenceTag（既存 closed 14-union）を優先
- `RJDiagnosticCode` = 閉じた union（**RG0.6b §1 の wrapper/diagnostic 語彙クラス** — domain enum ではない）。最小集合: `unknown_input` / `missing_critical_input` / `deferred` / `blocked_by_permission` / `inferred_only` / `confirmed_blocking`
- **LLM は reasonCodes を生成しない**（codes は Engine 由来）。LLM は trace 内 codes を自然文に変換するだけ

## 3. Feasibility の confirmed / inferred / missing 分離（採用 — 「不明なのに不成立断定」の禁止）

RJ0.1 §3 の写像を精密化（入力の確度を分ける）:
```ts
confirmedBlockingReasons: string[]    // 構造的・観測済みに不成立（例: 同時刻の物理的重複が確定）
inferredBlockingReasons: string[]     // 推定の不成立（未確認）
missingInputs / unresolvedCriticalInputs: string[]
feasibilityStatus（決定的 derived）=
  confirmedBlockingReasons 非空                        → "infeasible"
  unresolvedCriticalInputs 非空                        → "unknown"
  inferredBlockingReasons 非空 ∧ missingInputs 非空      → "unknown" 寄り（断定しない）/ それ以外は "feasible_with_risk"
  riskLevel high/elevated                              → "feasible_with_risk"
  else                                                → "feasible"
```
不変条件: **inferred だけでは infeasible にしない**（confirmed のみが不成立断定の根拠）。

## 4. silent / observe に再評価条件（採用）

```ts
interventionDecision = "silent" | "observe" | "plan_steps" | "ask" | "propose" | "block"
silent  = 完全に何もしない（次の評価予約なし）。判断として trace に残す
observe = {
  nextEvaluationAt: string,          // 次に再評価する時刻（HH:MM）
  reevaluationTrigger: triggerCondition,
  stopCondition / observeReason,
  maxObserveUntil: string,           // 無限観測の禁止（forgetting/decay — RC2a-1c §11 と整合）
}
block   = { permissionReason }       // permission で禁止されている状態の明示
```
silent と observe を混同しない（observe は必ず次の評価条件を持つ）。

## 5. ScheduledWorkBlock の progress allocation（採用 + 独立追加）

1 task : N blocks にした以上の進捗配分契約:
```
TaskRealityNode    owns: deadline / estimatedDuration / decomposition / completionStatus（正本）
ScheduledWorkBlock owns: scheduled start/end / actualSpent / blockOutcome / taskProgressDelta
roll-up            : task.progress = Σ block.taskProgressDelta（estimatedDuration で上限 clamp）
cancelled block    → task を消さない / completed block があっても task 全体完了とは限らない
task completion    は task 側が正本
```
**独立追加（CEO ルール⑦ — 全 task アプリが踏む失敗の回避）**: **「予定時間が経過した」だけで task を auto-complete しない**。completion は ①本人確認 ②完了 outcome の capture のいずれかでのみ立つ。時間経過は「未確認のまま carryover risk が上がる」signal であって完了ではない（カレンダーが「時間が過ぎたからやったことになる」失敗モードの構造的排除）。

## 6. display_only にも redaction gate（採用 — per-viewer 規律の Action Layer 適用）

`display_only ≠ always safe`:
- display_only も **per-viewer redaction / evidence visibility gate を通す**（RG0.6b §13 の 3 段 redaction を Action 出力にも適用）
- private / shared / otherPeople / reservation / work / payment は表示粒度を制御
- **raw evidenceRefs を UI に出さない**（redactedRefId 経由 — RC2a-1c §10）
- **display permission（見せてよいか）と action permission（やってよいか）を分ける**（別 gate）

## 7. PrepTime gate を policy gate 語に（採用）

RJ0.1 §6 の「CEO gate」を runtime 契約語に置換:
```
calibrationPromotionGate  : reference → visible（B1 calibration の品質条件）
actionablePrepPolicyGate  : visible → actionable（hard line・強い文言の解禁）
dogfoodApprovalGate / productionExposureGate : 段階公開
```
注: CEO 承認は**人間の意思決定**として残るが、runtime 契約は policy gate 名で記述する（役職名を runtime に焼かない）。

## 8. RC2a-2 MovementReality v0 の前提条件（採用 — 次スライスの境界確定）

```
- movement は anchor / ScheduledWorkBlock 間のみ（TaskRealityNode master 間は扱わない）
- task が block 化された場合のみ movement 対象
- place unknown / route unknown / ETA unknown / leaveBy unknown を保持（unknown 正直）
- samePlacePossible は text 一致で confirmed にしない（inferred・confidence ≤0.4 — RG0.6a §8）
- location / currentLocation は使わない（位置非解禁）
- ETA / route options / weather friction は RC4 まで未供給
- fake leave-by 禁止（全段 null・RJ0 §5 不変）
- mv id 一意性 guard test を fixture に含める（RC2a-1b §15 — 同一ペア複数 transition で FAIL）
```

## 9. 収束判断（CEO ルール①「前提を疑え」の上位適用 — GPT には出せない判断）

GPT の 8 点は全て正しく採用した。だが疑うべき前提は個々の点ではなく**「純 docs hardening をあと何ラウンド続けるか」**である。事実:

- **RC1 実装（`c16a1e28`）以降、realityCore は 5 ラウンド連続で docs/型のみ・新 runtime ロジックゼロ**（RG0.6b/RC2a-1, RC2a-1b, RC2a-1c, RJ0, RJ0.1, 本 RJ0.2）
- ALTER タブ（唯一の live 表面）は smoke-fix-2 以降、製品能力を 1 つも得ていない
- 構造的問題: **未実装ノードの契約レビューは自然な終端を持たない**。Task/Movement/Feasibility の実体が無い限り、GPT は常に「もう 1 field」を正当に見つけられる（reality test が無いため）。終端を与えるのは実装だけ
- 本プロジェクトの実証: 契約→実装に進んだ唯一の回（RC1 EventRealityNode）が、純 docs では出なかった事実（stable id 衝突条件・leaveBy の実形）を即座に surfaced した。**実装は契約レビューより速く教える**

**提言**: RJ0.2 を最後の純 docs ラウンドとし、次は **RC2a-2（MovementReality v0 compile）を実装に移す**。RC2a-2 は RC1 と同型の小さく境界明確な pure compile で、Task/Feasibility/Ladder の契約完成度に依存しない（DayGraph transitions → mv node の unknown 正直な写像のみ）。これが RealityAttribute/provenance/identity 契約を**第 2 のノードで検証**し、以降の RJ スライスに実体の地面を与える。**今後の GPT 契約指摘は、別の純 docs ラウンドにせず、該当スライスの実装時に fold する**（owning slice gate）。

CEO 成功条件（コア機能完成 / 初期ユーザー / 世界観 / デプロイ可能）は、RJ0.3 では進まない。RC2a-2 実装で進む。— GO は CEO 判断。

— RJ0.2 完了で停止。
