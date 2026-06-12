# R0.5: Reality Core Guardrail / R1 Pre-design（docs-only・実装なし）

- 日付: 2026-06-13 / 作成: 契約管理セッション（CEO + GPT の R0 監査差し戻しに対する再監査）
- 目的: R1（EventRealityNode v0）を「賢そうな予定メタデータ」「偽物の leave-by」にしないための**契約の先行凍結**
- 停止位置: 本書の CEO/GPT 確認まで。**R1 GO はまだ無い**

## 0. R0 からの最重要訂正 — kernel の再精読で前提が変わった

R0 の Explore 精査は kernel を「型 + fixture の孤立」と要約したが、**ファイル単位の再精読で過小評価と判明**。GPT が R0.5 で要求した契約の多くは、`lib/plan/reality` に **pure 実装として既に存在する**:

| GPT 要求 | 既存実装 | file |
|---|---|---|
| leave-by の数理 | **LSAT (Latest Safe Action Time)** — 移動時間「分布」の上側 percentile で出発限界を予算（critical-fractile p*・Safety Floor INV-3・低 confidence は σ 膨張で保守化） | `lib/plan/reality/lsat.ts` |
| permission level | **PermissionLevel 0-5**（自律度勾配・高リスクは必ず confirm/blocked）+ AuthorityLevel 0-5 + PlanItemGovernance（origin/authority/flexibility/protectionReasons・INV-5/7） | `permission/permission-model.ts` / `authority-escalation.ts:13` / `authority.ts:27-49` |
| 介入可否 | PlanItemFlexibility（locked/movable/shortenable/droppable）+ `changeSetRequiresConfirmation`（他人/予約/支払い/hard は確認必須） | `authority.ts:31` / `change-set.ts:96` |
| delay impact | `recomputeAfterDrift`（超過/早期終了の後続波及・hard/important 破壊検出 → repair 行き） | `post-event-recompute.ts:31` |
| RealityDiff | **ChangeSet**（before/after・invert で atomic undo・影響範囲・source trace・permission boundary） | `change-set.ts:43` |
| 候補選別 | **Gate first, score second**（safety/permission/traceability/reversibility 不通過はスコア無関係に不採用・rejected を理由付き保持） | `best-action.ts:64` |
| 配信判断 | DeliveryMode 5 値 + 純関数 `evaluateReceptivityGate`（no-action push 禁止 INV-1） | `receptivity-gate.ts` |
| RealityState の器 | **WorldState**（「今の現実」統合契約。既存正本 consume・捏造しない・不明 null） | `world-state/world-state.ts` |
| correction memory 消費 | **memory-correction**（本人補正 → trust_more/suppress/adjust_direction/narrow_context の実行可能 verdict 化・directly-observed > inferred） | `learning/memory-correction.ts` |
| 起動判断 | TriggerKind（preflight/empty_day/gap_opportunity/wind_down・位置 trigger は deferred 明示） | `triggers/trigger-model.ts` |

**結論を更新する**: 欠けているのは「型・数理」ではなく、①day-state レーン（実 UI で動いている）と kernel（pure で眠っている）の**接続**、②LSAT に食わせる**移動時間分布の供給源（ETA）**、③EventRealityNode という**予定単位の編成（compile）層**。したがって R1 の定義は「新しい属性エンジンを作る」ではなく「**既存語彙を予定単位に編成する薄い compile 層**」になる。**新型の発明はほぼゼロであるべき**。

### 命名衝突の注意（事故防止）
kernel 内部 docs は reality-secretary-os roadmap として **R1-R5**（R1=memory/R2=empty-day/R3=world-state/R4=trigger/R5=permission）を既に使っている。本トラックの R1/R2/R3 と衝突するため、以後本トラックは **RC1/RC2/RC3…（Reality-Core）** と表記する（旧 R1 案 = RC1）。

## 1. 裁定: leave-by v0 の再裁定（GPT 指摘を全面採用 + 上方修正）

- **RC1 で出してよいもの**: `movementRequired: true|false|unknown` / `departureStatus: "unresolved"`（既存 `MovementResolutionStatus`＝`lib/plan/transport/transportTypes.ts:42` を再利用） / `whyUnresolved: "place_missing"|"route_missing"|"eta_source_missing"` / `departureDeadline: null`
- **禁止**: 徒歩仮定・固定リード等のヒューリスティック値を deadline として持つ・見せること。R0 の「leave-by v0 = 保守的徒歩/固定リード仮定」案は**撤回**
- どうしても heuristic を持つ場合: `status: "heuristic"` + `displayPolicy: "notActionable"`（既定は持たない）。UI に「出発期限」「までに出る」等の期限語彙で出すことを禁止（N-3 と同列の表示禁止則として固定）
- **正道**: leave-by は新規実装しない。**LSAT が既に正しい数理**（分布 + percentile + Safety Floor）。RC で必要なのは LSAT への入力 = 移動時間分布の供給（場所解決 + ETA 源 = 旧 R4 案・外部 API gate）。供給が来た日に `departureStatus: "resolved"` + LSAT 値が `departureDeadline` に入り、MomentState の `departureDeadlineHHMM` が初めて非 null になる — **この契約だけ RC1 で固定し、値は出さない**

## 2. 裁定: EventRealityNode の field-level provenance 必須化

全フィールドを裸の数値にしない。既存 `ConfidentValue`（value/confidence/source=EvidenceSource）を**単一の基底**として additive 拡張する（第三の語彙体系を作らない）:

```ts
// RC1 契約（型名仮・RC1a で確定）: ConfidentValue の additive 拡張 — 並行体系ではない
RealityAttribute<T> = ConfidentValue<T | null> & {
  evidenceRefs: EvidenceTag[] | SourceTraceRef[];   // 既存 closed union / kernel SourceTrace を参照
  status: "confirmed" | "inferred" | "heuristic" | "unknown" | "blocked";
  displayPolicy: "visible" | "hidden" | "debugOnly" | "notActionable";
}
```

対象 10 フィールドと**値の出自（全て既存語彙へ写像 — 新 enum 禁止）**:

| field | 値域の正本 | RC1 時点の典型 status |
|---|---|---|
| fixedness | `ExternalAnchor.rigidity` + `LatencyTolerance` + `PlanItemFlexibility`(authority.ts) | confirmed/inferred |
| placeCertainty | 値は当面 `unknown`・source="no_place_signal"・confidence 0（**枠だけ・捏造しない**） | unknown |
| movementRequired | DayGraph transitions の有無 | inferred |
| departureStatus | `MovementResolutionStatus` | unresolved 固定 |
| leaveBy | LSAT 出力（供給まで null） | unknown（§1） |
| delayImpact | `recomputeAfterDrift` の RecomputeResult 写像 | inferred |
| energyCost | duration×verb ヒューリスティック等 | **heuristic・confidence ≤0.35・displayPolicy: debugOnly から開始** |
| interpersonalLoad | 構造化供給まで unknown（withWhom 自由文から推測しない — R0 §1-18 踏襲） | unknown |
| permissionLevel | `PermissionLevel 0-5` + `PlanItemGovernance` | confirmed/inferred |
| changeEligibility | `PlanItemFlexibility` + `changeSetRequiresConfirmation` 由来（§5） | confirmed/inferred |

unknown/blocked の field は **UI に数値で出さない**（visual-contract §0.1 の出自 5 分類と同一規律）。

## 3. 裁定: fatigue/recovery の精密化（R0 表現の訂正）

R0 の「fatigue/recovery 実装済み・到達」は **day-state level に限る**と明記し直す:
- ✅ 実装済み: **day-level** の疲労/回復見立て（energyLevel/recoveryNeed/carryOver/recoveryQuality — `lib/plan/dayState/buildDayStateRecord.ts`）
- ❌ 未実装: **event 単位** energy cost / 予定別の疲労影響 / 後続予定への疲労波及（post-event-recompute は**時間**波及のみで疲労波及ではない）
- RC1 の energyCost は heuristic + debugOnly で導入し（§2）、**day-level 見立てと混ぜない**（合成は RC2 の明示ステップ）

## 4. 裁定: collapse risk の初期形（probability 禁止）

RC2 の初期形は確率・断定スコアにしない。**理由リストが先・数値化は後**:

```ts
CollapseRisk v0 = {
  level: "low" | "elevated" | "high" | "unknown",   // 値域は SlackStatus 系の既存トーンに合わせ RC2a で確定
  factors: EvidenceTag/既存信号の参照列,             // 例: movement unresolved / recoveryNeed high / strict event after large gap
  failureModes: 既存語彙の参照列,                    // 例: hard 予定への波及（RecomputeResult.breaksHardOrImportant）
  evidenceTrace: SourceTraceRef[],
  actionable: boolean,
  confidence: number,
  missingInputs: string[],                           // 例: eta_source_missing
}
```

- **禁止**: 「今日が 72% 崩れる」等の確率表現・断定（N-3 系の表示禁止に追加）
- factors の供給源は既存に揃っている: `SlackStatus`（feasibilityTypes.ts:51）/ `RecomputeResult` / `carryOverOut` / recoveryNeed / movement unresolved

## 5. 裁定: 3 案（守る/楽/攻める）の前提 = Intervention Eligibility

**新しい boolean 群を正本として発明しない**。正本は既存 governance、view として導出する:

```ts
InterventionEligibility（導出 view・保存しない）= {
  canSuggestMove / canSuggestShorten / canSuggestSkip   // = PlanItemFlexibility（locked/movable/shortenable/droppable）の写像
  canSuggestDelegate: false 固定（v0 — 委任は対外コミュニケーションを含むため）
  requiresConfirmation                                   // = changeSetRequiresConfirmation（INV-5: 他人/予約/支払い/hard）
  requiresExternalCommunication                          // = ChangeOp の対象が他者性 anchor（hard_external 系）か
  blockedReason                                          // = ProtectionReason（recovery_core / cascade_guard 等）
  permissionLevel                                        // = PermissionLevel 0-5
}
```

- 対象分類（userOnly/otherPeople/reservation/work/travel）は `PlanItemGovernance.origin/authority` + anchor 属性から導出。**判別できないものは blocked 側に倒す**（軽率提案の構造的禁止）
- RC3（3 案）は eligibility を**通過した予定のみ**に候補を生成し、生成後も best-action の **Gate first** を通す（スコアが高くても gate 不通過は不採用）

## 6. 裁定: 既存 `lib/plan/reality` kernel の扱い（file 単位）

| 対象 | 裁定 | 理由 |
|---|---|---|
| `authority.ts` / `authority-escalation.ts` | **reuse**（RC1 の permissionLevel/changeEligibility の正本） | §5。同義の新型禁止 |
| `permission/permission-model.ts`・`permission-gate.ts` | **reuse**（Level 0-5 正本）。canonical 化は kernel docs の「後続合流 gate」に従う | R5 レーンの内部契約 — RC は consume のみ |
| `receptivity-gate.ts` | **reuse・ただし RC1-RC3 では呼ばない**（配信は B2/R6 push gate と束ね） | DECIDE/DELIVER 分離を保つ |
| `change-set.ts` | **reuse**（RealityDiff の正本。RC3 の 3 案 = ChangeSet 3 並置） | 新 diff 型禁止 |
| `best-action.ts` | **reuse**（RC3 の gate/score。生成は RC3 が担い、選別はこれ） | |
| `post-event-recompute.ts` | **wrap**（minimal DayNode 入力 ↔ 実 DayGraph の薄い変換を RC1b adapter 側に置く。本体不変更） | synthetic 入力契約のまま活かす |
| `lsat.ts` | **reuse・供給待ち**（分布ソースが来るまで呼ばない。heuristic 分布を捏造してまで呼ぶこと禁止 — §1） | |
| `world-state/*` | **触らない（consume 候補）**。RC2 の入力に使えるか RC2a で判断。R3 レーンの内部契約を RC 側から書き換えない | barrel 非 export の規律を尊重 |
| `triggers/*` | **触らない**（起動判断は RC スコープ外・B2/R6 系） | |
| `learning/*`（memory-correction 含む） | **触らない（将来 reuse）**。day-state の nextDayPriorAdjustments 消費（B1）の設計時に、この verdict 体系へ**合流**させる（独自消費ロジックを書かない） | A1-7-35 レーン所有 |
| `integration/*`・seed/capture/candidate 系・`orchestration/*` | **触らない**（A1 レーン所有・flag 運用中） | 静的安全テストの期待リスト問題も A1 側 |
| `empty-day/*` | **触らない**（R2 レーン。RC3 の「攻める」案で将来 consume 検討） | |
| `golden-scenario.ts`・`invariant-check.ts` | **reuse（検証資産）**: RC1c の fixture は INV 番号を参照する | |
| `proposal/computeProposals.ts` | **触らない・supersede しない**（空き日 pattern_repeat は別ユースケースとして併存。RC3 は既存予定の代替案で重複しない） | |
| `lib/plan/dayState/*`（本トラック成果） | **reuse**（UserState/MomentState/PredictionLedger の正本） | |

既存の語彙重複 1 件を記録: `ConfidenceLevel` が 2 定義（alterHomeAdapter 3 値 / transportTypes 4 値）で併存。RC では**どちらも使わず** ConfidentValue.confidence（number）に統一し、重複解消は別件として CEO 判断へ。

## 7. Reality Core 全体パイプラインと RC1 の担当境界

```
DayGraph（時間構造・実装済）
  → [RC1] EventRealityNode compile（既存語彙の予定単位編成 + provenance）
  → [RC2] RealityState / DayRealitySummary（WorldState consume 検討）+ CollapseRisk v0（factors 形式）
  → [RC3] InterventionEligibility（§5 導出）→ ChangeSet 3 並置（守る/楽/攻める・提示のみ）
  → [既存 kernel・後続 gate] best-action gates → PermissionGate → receptivity（B2/R6）
  → [実装済] PredictionLedger = NightCheck / MorningReveal（plan_night_check_v0）
  → [B1 gate] Correction Memory 消費（memory-correction の verdict 体系へ合流）
```

- **RC1 が担当**: compile 層のみ（DayGraph EventNode + day-state 信号 + governance → EventRealityNode）。値の新規推定はほぼしない（energyCost heuristic のみ・debugOnly）
- **RC1 が担当しない**: collapse risk（RC2）・3 案生成（RC3）・ETA 供給（外部 API gate）・配信（B2/R6）・学習消費（B1）

## 8. RC1 実装境界案（GO 時の分割）

| slice | 内容 | 不変条件 |
|---|---|---|
| **RC1a** | schema/types only: `RealityAttribute<T>`（ConfidentValue 拡張）+ `EventRealityNodeV0`（§2 の 10 field・全て既存語彙参照）。runtime ゼロ | 新 enum ゼロ・契約 docs 追補は CEO 裁定後 |
| **RC1b** | DayGraph → EventRealityNode の pure compile adapter（authority/change-set/post-event-recompute の wrap 含む）。leave-by は §1 の unresolved 契約のみ | 新規 read ゼロ・保存ゼロ・既存 kernel 不変更 |
| **RC1c** | fixture tests（golden-scenario の INV 参照・provenance 必須の機械検証: 裸数値 field が 1 つでもあれば FAIL） | |
| **RC1d** | Alter タブへの接続判断: **推奨 = 製品 UI に出さない**。dev-alter-tab に `?v=reality` debug variant（displayPolicy: debugOnly の可視化）のみ。製品表面への露出は RC2/RC3 の価値が乗ってから別 GO | 既存 ALTER タブ表示は不変 |

## 9. CEO 提示の userState 形との写像（語彙の二重化防止の確認）

| CEO 案 field | 既存正本 | 備考 |
|---|---|---|
| energyLevel | `estimates.energyLevel`（ConfidentValue）✅ | 実装済み |
| scheduleDensity | `facts.density` + `bookedMin`（数値 0-1 は derived 層で計算可） | 新フィールド不要 |
| mobilityFriction | `travelChainMin`/`hasUnresolvedTravel` + transport 語彙 → RC1 movementRequired/delayImpact | 0-1 スコア化は供給（ETA）後 |
| recoveryNeed | `estimates.recoveryNeed` ✅ | 実装済み |
| **decisionDebt** | **不在**（唯一の新概念）。RC では発明せず、open loops / 未回答 followup / 補正回数等の **evidence が貯まってから** CEO 裁定で導入判断 | 安易な新語彙を入れない |
| todayMode | `estimates.dailyMode` ✅ | 実装済み |
| locationCertainty | user-level でなく **event-level**（RC1 placeCertainty・当面 unknown） | §2 |
| interventionWindow | `MomentState.interventionWindow` ✅ | 実装済み |
| UI 用 alterConditionView | **既存 AlterBatteryViewModel + screenViewModel が既にこの役**（head/body/heart/mode/reason 相当） | 第三の VM を作らない |

— 以上。**R0.5 完了で停止**。RC1 GO（RC1a-1d の範囲確定）は CEO/GPT の本書確認後。
