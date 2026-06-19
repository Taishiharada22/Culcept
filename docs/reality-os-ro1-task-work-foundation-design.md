# RO-1 — Task & Work 基盤 設計（docs-only・実装は RO-1 GO 後）

- **status**: 設計 v0.1（docs-only）。**code 変更ゼロ・DB write なし・migration なし・production gate 未通過**
- **CEO GO**: RO-1 設計着手（2026-06-20・RO-0 完了に続けて）
- **v0.1 レビュー反映（CEO 2026-06-20）**: ①永続化境界を確定（RO-1=pure+injected のみ・永続は別 gate）②D3 に `emotionalReserve` 追加 ③`completionStatus`/`TaskOutcomeKind` に `blocked` 追加 ④`riskFactors` を閉じた union 化
- **lineage**: RJ0 §2（TaskRealityNode placeholder）→ **RJ0.1 §1（master/block 分離の自己訂正）** → RO-0（scope reset）→ 本書（実装可能化 + CEO 強化定義）
- **継承の要点**: 「task が時刻枠を確定したら anchor 化して一本化」（RJ0 §2）は **RJ0.1 §1 で訂正済み**。本書は訂正後を正本とする = **TaskRealityNode は消えない master / ScheduledWorkBlock が配置（anchor/ern 化可）/ 1 task : N blocks**。
- **CEO 強化定義（2026-06-20）**: RO-1 は「単なる Task 型追加」では弱い。下記 5 構成を完了条件に含め、**Plan / Energy / Risk / Memory を繋ぐ基盤**にする。
- **設計の粒度**: 大枠（RO-1）の中で D1〜D5 に小さく割る。**実装は RO-1 単位**（micro-phase に割らない＝今回の轍を断つ）。

---

## 0. GOAL（北極星・/goal）

> 「deadline があり時刻未確定で、分割・移動できる作業」を Reality Graph の**第一級ノード**として持ち、**Plan（締切・空き）・Energy（成立性）・Risk（崩れ）・Memory（補正）・Proposal（3案）の入力基盤**にする。これ無しに「明日の夜作業は崩れそう / 会議後 30 分なら守れる / 明後日午前なら楽」は構造上生成できない。

**到達定義（RO-1 完了 = これら全てが ③）**:
1. TaskRealityNode 実体（7 属性）が Reality Graph に乗る
2. 1 task : N ScheduledWorkBlock の分割配置が表現できる
3. TaskPlacementFeasibility seam で Energy 部署が task×window の成立性に参加できる
4. TaskOutcome seam が completed/partial/skipped/carried_over/progressed を捕捉し RJ6/RO-3 に渡す口を持つ
5. task→block / task→deadline / block→calendar window / task→carryOver / task→proposal の関係が**将来 typed edge にできる join 鍵**を各ノードが保持する

---

## 1. CEO 強化定義（5 構成）

| # | 構成 | 役割 | 参加部署 |
|---|---|---|---|
| 1 | TaskRealityNode | 作業の正本（deadline/見積/負荷/分割/移動/最小前進/完了状態） | Plan |
| 2 | ScheduledWorkBlock | task を時間帯に置いた配置（task 本体は消さない） | Plan / Mobility |
| 3 | TaskPlacementFeasibility seam | task×candidateWindow の成立性評価の入口 | **Energy** |
| 4 | TaskOutcome seam | completed/partial/skipped/carried_over/progressed を後で RJ6/RO-3 へ | Memory / Risk |
| 5 | Edge 準備 | task→block / →deadline / block→window / task→carryOver / →proposal を将来 typed edge に | （L0 基盤） |

---

## 2. 設計スライス

### D1 — TaskRealityNode（実装可能型）

RJ0 §2 の placeholder を、CEO の `completionStatus` 追加込みで実装可能型に確定。**新 enum を最小化**し、既存 `RealityAttribute<T>` 規約（value+confidence+source+evidenceRefs+status+displayPolicy）に合流。

```ts
TaskRealityNodeV0 = {
  schemaVersion: 0,
  taskRealityNodeId: string,              // "trn:<taskId>"（日に縛られない・deadline 駆動）。採番は実装 seam（乱数禁止・注入）
  title: string,                          // boundary で NFC 正規化（raw PII は redaction 対象＝leak guard 継承）
  // ── CEO 強化 7 属性 ──
  deadline: RealityAttribute<string>,         // ISO。user 入力→status:confirmed / 推測→inferred。§D-Deadline
  estimatedDuration: RealityAttribute<number>,// 分。初期 heuristic（status:heuristic・confidence≤0.35）
  cognitiveLoad: RealityAttribute<number>,    // 0-1。ern.energyCost と同形の数値 heuristic（新 enum 作らない）
  canSplit: RealityAttribute<boolean>,
  canMove: RealityAttribute<boolean>,
  minimalProgress: RealityAttribute<string> | null, // 「最低限の前進」。RJ5 で LLM 生成・Engine 採用判定（v0 は null）
  completionStatus: RealityAttribute<TaskCompletionStatus>, // ← CEO 追加。下記
  // ── 配置・派生 ──
  placements: ReadonlyArray<string>,          // ScheduledWorkBlock id（task→block edge の join 鍵・1:N）
  sourceRefs: { anchorId?: string, seedId?: string }, // 供給源（手動 UI 将来 / A1 seeds）
  changeEligibility: RealityAttribute<ChangeEligibilityValue>, // ern と同 derive 規約（eventRealityNode.ts:49）
  permissionLevel: RealityAttribute<PermissionLevel>,          // 同上・v0 max 2
}

// CEO v0.1: blocked を追加。「できなかった」を分ける — dropped(本人がやらなかった) と
//   blocked(他人待ち/情報不足/外部条件/予定衝突で止まった) は別物。Risk/Memory/Proposal の学習精度が上がる。
TaskCompletionStatus = "not_started" | "in_progress" | "partially_done" | "done" | "blocked" | "dropped"
```

不変条件:
- **status=unknown → value=null ∧ confidence=0**（INV-RC1 継承・`realityAttribute.ts:99`）
- **deadline 推測時は status:inferred かつ evidenceRefs≥1**（捏造禁止・「締切らしい」を確定に見せない）
- estimatedDuration/cognitiveLoad は **debugOnly〜heuristic**（強い判断・hard line に使わない・RJ4/Energy が confidence で重み付け）
- **completionStatus と TaskOutcome（D4）は二重正本にしない**: completionStatus = task の現在状態（master）/ TaskOutcome = 状態遷移イベント（D4 が completionStatus を更新する単一写像）

### D2 — ScheduledWorkBlock（配置・1 task : N）

RJ0.1 §1 を実装可能型に。**task を消さず時間帯に置く**。

```ts
ScheduledWorkBlockV0 = {
  schemaVersion: 0,
  blockId: string,                        // "swb:<date>:<n>"
  sourceRefs: {
    taskId: string,                       // ← task→block edge の join 鍵（block 側が taskRef を持つ）
    calendarWindowRef?: string,           // ← block→calendar window edge の join 鍵
    anchorId?: string,                    // 本人選択で anchor 化した場合のみ（配置の実体化・task 変換でない）
  },
  date: string,
  plannedWindow: { startHHMM: string, endHHMM: string },
  placementKind: "tentative" | "anchored",// anchored = ern 化済み（external_anchors への write は別 gate＝本 RO で書かない）
  durationMin: number,                    // window 由来（task.estimatedDuration を超えない＝分割の単位）
}
```

不変条件:
- **1 task : N blocks**（分割配置）。task.placements[] と block.sourceRefs.taskId が相互参照（どちらかが正本でなく、join で結ぶ）
- **block は deadline/見積/分解を持たない**（task が正本・block は参照のみ＝二重正本回避）
- **placementKind=anchored でも本 RO は external_anchors に write しない**（配置の computation のみ・実 write は別 write gate＝A-4-d 系と同列に閉）
- 完了時: task.completionStatus が更新され block は履歴になる（D4）

### D3 — TaskPlacementFeasibility seam（Energy 参加の入口）

CEO「Energy 部署がここで参加する」。**既存 DayStateEstimates（推定層 ③）を読み**、task×window の成立性を評価する pure seam。Energy の「測れるが判断できない」を「判断できる」に変える入口。

```ts
// 入力 seam（既存推定を注入・新規観測しない）
TaskPlacementFeasibilityInputV0 = {
  task: TaskRealityNodeV0,
  candidateWindow: { startHHMM: string, endHHMM: string, timeBucket: TimeBucket },
  energy: {                               // ← DayStateEstimates から注入（dayStateTypes.ts:79）
    energyLevel: ConfidentValue<EnergyLevelValue>,    // 体バッテリー
    focusReserve: ConfidentValue<ReserveLevel>,       // 脳バッテリー
    emotionalReserve: ConfidentValue<ReserveLevel>,   // ← CEO v0.1: 心バッテリー。人と会う/連絡/交渉/返信の余力
    recoveryNeed: ConfidentValue<RecoveryNeedLevel>,
  },
  momentState: MomentStateV0,             // timePressure / eveningSlackRemainingMin 等（既存 ③）
}

// 出力（全て RealityAttribute・確信度付き・断定しない）
TaskPlacementFeasibilityV0 = {
  energyFit: RealityAttribute<FitLevel>,        // 体/脳の余力 × cognitiveLoad
  cognitiveLoadFit: RealityAttribute<FitLevel>, // 時間帯 × 認知負荷（夜の高負荷は fit 低）
  emotionalFit: RealityAttribute<FitLevel>,     // ← CEO v0.1: 心の余力 × 対人/連絡負荷（「体力はあるが人と話す余力がない」を判断可能に）
  deadlineFit: RealityAttribute<FitLevel>,      // window が deadline に間に合うか
  splitFit: RealityAttribute<FitLevel>,         // canSplit × window 長 × 最小前進
  riskFactors: ReadonlyArray<TaskPlacementRiskFactor>, // ← CEO v0.1: 閉じた union（下記・string 禁止）
}
FitLevel = "low" | "medium" | "high" | "unknown"

// CEO v0.1: string でなく最初から閉じた union（実装時の自由文混入を型で防ぐ・leak guard 整合）
TaskPlacementRiskFactor =
  | "evening_high_load"
  | "low_focus_reserve"
  | "low_emotional_reserve"   // ← emotionalReserve 追加に伴い
  | "deadline_tight"
  | "window_too_short"
  | "cannot_split"
  | "high_cognitive_load"
  | "recovery_need_high"
  | "missing_duration"
  | "missing_deadline"
```

設計判断:
- v0 は **seam + heuristic 評価器**（推定値を読み FitLevel を導出・confidence は入力 confidence の下限以下）。学術的最適化はしない（過剰実装回避）
- **新規 energy 観測はしない**（既存 estimates を消費）。Energy 推定層は既に ③ なので、RO-1 は「判断の入口」だけ足す
- **emotionalReserve を入れる理由（CEO v0.1）**: 対人作業（連絡/交渉/返信）は体力でなく心の余力が効く。これ無しに Communication/Context 系の成立性が判断できない
- riskFactors は**型レベルで閉じた union**（自由文禁止・leak guard 整合）

### D4 — TaskOutcome seam（→ RJ6 / RO-3）

CEO「completed/partial/skipped/carried_over/progressed を後で RJ6/RO-3 に繋げる」。**捕捉の口**を作る（接続実体は RJ6/RO-3 の所管）。

```ts
TaskOutcomeV0 = {
  taskRealityNodeId: string,
  blockId?: string,                       // どの配置の結果か
  outcome: TaskOutcomeKind,
  observedAt: string,                     // 注入（pure・now は caller）
  evidenceRefs: ReadonlyArray<string>,
}
// CEO v0.1: blocked を追加。「skip(本人がやらなかった)」と「blocked(外部要因で止まった)」を混ぜない。
TaskOutcomeKind = "completed" | "partial" | "skipped" | "carried_over" | "progressed" | "blocked"

// seam: outcome → completionStatus 更新（単一写像）+ 下流口
applyTaskOutcome(task, outcome) → { task: TaskRealityNodeV0, carryOverSignal?: …, ledgerSignal?: … }
```

設計判断:
- **既存 driftSelections（skipped/delayed/time_changed・`gradeNightCheck.ts`）と語彙整合**: task の outcome は anchor の drift より広い（partial/progressed/carried_over）。**二重正本にしない** = task outcome は task の completionStatus を更新、anchor drift は anchor 用、両者は別ノードの別事実
- **carried_over → CarryOverOut（dayStateTypes.ts:130・`unfinishedAnchor:boolean`）への合流口**を seam として用意（CarryOverOut への task 拡張は **RO-3/RJ6 所管・本 RO は口だけ**）
- **RJ6 Ledger 接続・answer-check 採点は RO-3/RJ6 の所管**（本 RO は捕捉のみ・予測採点の構造禁止＝PredictionLedger 規律継承）

### D5 — Edge 準備（typed edge にできる join 鍵）

Reality Graph は現在 **typed edge を持たない（L0 ①）**。RO-1 は edge を**作らない**が、RO-3 が materialize できるよう **5 edge kind の契約 + 各ノードの join 鍵**を確定する。

| edge kind | from → to | join 鍵（RO-1 が保証） |
|---|---|---|
| task→block | TaskRealityNode → ScheduledWorkBlock | `task.placements[]` ↔ `block.sourceRefs.taskId` |
| task→deadline | TaskRealityNode → （時間軸） | `task.deadline`（RealityAttribute・暗黙 edge） |
| block→calendar window | ScheduledWorkBlock → DayGraph window | `block.sourceRefs.calendarWindowRef` |
| task→carryOver | TaskRealityNode → CarryOverOut | `applyTaskOutcome` の carryOverSignal 口（D4） |
| task→proposal | TaskRealityNode → Proposal（RJ4） | `task.taskRealityNodeId`（RJ4 が参照・RO-4 所管） |

不変条件:
- **本 RO は typed `RealityGraphEdgeV0` を定義/実装しない**（RO-3 所管）。join 鍵を各ノードに持たせるだけ
- join 鍵は **id 参照のみ**（array index を identity に使わない・`realityGraphSnapshot.ts:29` 規律継承）

---

## 3. 供給源・永続化（境界確定・CEO v0.1）

**CEO 裁定（2026-06-20）**: 「RO 単位で完璧に実装」方針のため、RO-1 実装中に永続化議論を挟むと再びズレる。境界を明確に固定する。

- **RO-1 実装 = pure kernel + injected fixtures まで**。task 行は caller が供給（duration_confirmation reader と同パターン・`createSupabaseOperatorDurationSeedReader` 類型）。pure kernel は IO/RNG/now を持たない
- **RO-1 では localStorage / Supabase / migration / DB write を一切やらない**（実装中盤の裁定も**しない**）
- **永続化は RO-1 完了後の別 gate で裁定**（localStorage か Supabase table か。後者は migration＝CEO 承認案件）。設計は seam（interface）まで・どちらにも差せる形を保持
- これにより RO-1 は**安全に完了できる**（write 0・migration 0・production 不接触）

---

## 4. 不変条件（RO-1 全体）

1. **二重実体禁止の正しい意味**（RJ0.1 §1）: 同じ事実を二箇所で正本化しない（deadline は task のみ・block は参照）。master を消さない
2. **捏造禁止**: 供給源が無い属性は status:unknown→value:null（INV-RC1）。heuristic は confidence≤0.35・hard line に使わない
3. **write 0 / migration 0 / production 不接触**（本 RO は computation のみ）
4. **leak guard 継承**: raw title/PII を内部 ref に echo しない（既存 REAL_LEAK_TOKENS 整合）
5. **MovementReality/Feasibility/Risk/Permission の既存正本を変更しない**（task は新ノード・既存 ern 不変）

---

## 5. 受け入れ基準 / 監査計画（/goal → /loop）

**受け入れ基準（RO-1 完了 = 全 PASS）**:
- [ ] TaskRealityNodeV0 7 属性 + completionStatus（**blocked 含む 6 値**）が型・invariant・test で成立（D1）
- [ ] 1 task : N ScheduledWorkBlock が join で表現でき、block が deadline を正本化しない（D2）
- [ ] TaskPlacementFeasibility seam が **4 energy 入力（emotionalReserve 含む）** を読み energyFit/cognitiveLoadFit/**emotionalFit**/deadlineFit/splitFit + **閉じた union riskFactors** を返す（D3）
- [ ] TaskOutcome seam が completionStatus を単一写像で更新し（**blocked 含む 6 outcome**）carryOver/Ledger 口を持つ（D4）
- [ ] 5 edge kind の join 鍵が各ノードに存在（D5）
- [ ] write 0 / migration 0 / tsc footprint 0 / 既存 test 不破壊

**監査計画（/loop）**:
- `contract-audit`: TaskRealityNode/ScheduledWorkBlock の型契約・invariant 網羅
- `coverage-audit`: defined→stored(seam)→returned→consumed の層横断（task が Energy/Risk/Proposal にどう供給されるか）
- `signal-trace`: `completionStatus` を D1→D4→carryOver まで単一写像で追跡
- 各監査 → 指摘修正 → 再監査の loop で「完璧」を担保

---

## 6. 実装スコープ境界（RO-1 でやらないこと）

- typed `RealityGraphEdgeV0` の定義/実装（**RO-3**）
- RealityDiff / snapshot 永続化（**RO-3**）
- Proposal 守る/楽/攻める の 3-route 生成（**RO-4**・task を入力として使うのは RO-4）
- leaveBy 二段化 / Intervention Ladder（**RO-2**）
- task 入力 UI / product 接続 / Alter 本線接続 / notification（**別 gate・⊘**）
- external_anchors への write（**別 write gate・閉**）

---

## 7. CEO 裁定済み / 残未決定

**v0.1 で裁定済み（CEO 2026-06-20）**:
- **永続化**: RO-1=pure+injected のみ・永続は RO-1 完了後の別 gate（§3 確定）
- **emotionalReserve**: D3 入力・出力・riskFactor に追加（§D3 確定）
- **blocked**: completionStatus / TaskOutcomeKind 双方に追加（§D1/§D4 確定）
- **riskFactors**: 閉じた union `TaskPlacementRiskFactor`（§D3 確定）

**残未決定（実装 GO 前・軽微・私の推奨で進めて可）**:
1. **taskId 採番**: 独立採番（deadline 駆動で日に縛られない）を推奨。seam で注入（乱数を pure kernel に入れない）
2. **completionStatus と driftSelections の統合度**: 別ノード別事実として並存を推奨（task outcome は anchor drift より広い・二重正本回避）

---

## 8. 決定

- RO-1 を上記 D1〜D5 の**設計 v0.1** として確定（docs-only・CEO レビュー 5 点反映済み）。
- 継承: RJ0.1 §1（master/block 分離）を正本・RJ0 §2 の「一本化」は訂正後に従う。
- **永続化境界確定**: RO-1=pure+injected のみ・write/migration/localStorage/Supabase は RO-1 でやらない・永続は別 gate。
- **実装は RO-1 単位**（D1〜D5 を 1 RO として・micro-phase に割らない）。実装 GO は CEO 判断。
- コード 0・write 0・migration 0。
