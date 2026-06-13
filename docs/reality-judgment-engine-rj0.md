# RJ0: Reality Judgment Engine — 契約定義（docs-only・実装なし）

- 日付: 2026-06-13 / 作成: 契約管理セッション（CEO 方針 4 点 2026-06-13 + GPT 監査の独立裁定）
- 位置づけ: **RJ = Reality Graph（RC）の上に立つ上位判断層**。RC の追補ではなく、ユーザー価値を出す判断エンジンとして独立トラック化（CEO 方針 4）
- 優先順位: 本書 → RC2a-1c → RG0.6b → RG0.6a → RG0.6 → addendum
- 停止位置: RJ0 完了で停止。実装 GO（RC2a-2 / RJ1+）は CEO 判断

---

## 0. トラック構造の確定（CEO 方針 4）

```
RC      = Reality Graph Core（状態の compile・identity・provenance）… RC2a-1c まで完了
RJ      = Reality Judgment Engine（成立判定・出発線・介入計画・3案・判断台帳）… 本書が RJ0
B1      = Correction Memory 消費 / personalization（観測 ≥14 日 gate）
B2/R6   = Notification / delivery（配信・push・位置 trigger）
```

順序の訂正: GPT 監査は「RC2a-1c で締めてから RJ0」としたが、**RC2a-1c は完了済み**（`ef455f30`）。よって本書が次工程であり、RJ0 確認後に **RC2a-2（MovementReality v0 — RJ2/RJ1 の入力供給）** へ進む。

## 1. GPT 監査の裁定（鵜呑みにしない — 独立検証の結果）

**採用**: bucket の再定義（「契約・kernel があるか」でなく「**Reality Judgment として製品価値に接続されているか**」で測る）。この基準では、私が「完璧」とした Feedback Loop / Intervention Policy / Constraint Graph / Reality State / Correction Memory / PRM は**ベースあり・進化必要が正しい**。私の旧表は「契約・実装の存在」基準では事実どおりだが、ゴール逆算（CEO ルール⑤）の基準を正とする。

**訂正 2 件（GPT の過大判定）**:
1. **Event/Task Outcome Capture「完全に未実装」→ 誤り**。Night Check の `driftSelections`（anchorId 単位の skipped / delayed / time_changed・`gradeNightCheck.ts` 実装済み・followup UI 実機到達済み）が per-event outcome の v0。欠けているのは「間に合った/遅刻/完了」等の outcome 語彙拡張と event-horizon Ledger 接続 → **ベースあり・進化必要**（RJ6）
2. **Feasibility Evaluator「完全に未実装」→ 半分誤り**。day-level proxy（dayFeasibility: likely_steady/mixed/likely_fragile）は実装・実 UI 到達・Night Check 採点まで動いている。欠けているのは **per-event/task** 判定 → day=進化必要 / event=未実装（RJ1）

**確認 1 件**: PRM「実在するらしい」→ **実在を確認済み**（R0 で file/flag 単位検証: prm_learning_events / M2/M3 / second-self・A1 レーン flag 運用中）。ただし「Plan の判断に接続されていない」は正しい — 接続は B1。

## 2. TaskRealityNode（CEO 方針 1 — placeholder 契約・実装は専用 gate）

**現行系最大の構造的欠落**。anchor（時刻確定イベント）と直交する「deadline があり時刻未確定で、分割・移動できる作業」を Reality Graph の第一級ノードに追加する:

```ts
TaskRealityNodeV0（placeholder・UI/保存/localStorage 実装はしない）= {
  taskRealityNodeId: "trn:<taskId>",          // 日に縛られない（deadline 駆動）。乱数禁止・採番は実装 gate で確定
  title: string,                               // boundary で NFC 正規化（RC2a-1b §4 — revision に入れる場合）
  deadline: RealityAttribute<string>,          // ISO。§3 Deadline Model
  estimatedDuration: RealityAttribute<number>, // 分。初期 heuristic（status: heuristic・≤0.35）
  cognitiveLoadHeuristic: RealityAttribute<number>, // 0-1。新 enum を作らない（ern.energyCost と同形の数値 heuristic）
  canSplit / canMove: RealityAttribute<boolean>,
  minimalProgress: RealityAttribute<string> | null,  // 「最低限の前進」定義（RJ5 で LLM 生成・Engine 採用判定）
  plannedWindow: { startHHMM, endHHMM } | null,      // 柔配置（時刻枠を得たら anchor 化 → ern へ — 二重実体禁止）
  sourceRefs: { anchorId?: string, seedId?: string },// 供給源: 手動入力 UI（将来）/ A1 seeds（RC5）
  changeEligibility / permissionLevel / commitmentSignal: ern と同じ derive 規約を適用
}
```

不変条件: ①task が時刻枠を確定したら **anchor 化して ern に一本化**（task と event の二重実体を作らない）②v0 は供給源が無いため **常に空集合**（型と Graph 配置だけ確定 — 捏造しない）③decisionDebt の candidateDebt/timeDebt が task の未決を数える。

## 3. Deadline Model

- **task**: `deadline` を第一級属性として持つ（§2）。遅延許容（latencyTolerance 再利用）・carryover 影響（締切超過 → carryOverOut.unfinishedAnchor 系へ合流）
- **event（anchor）**: 別 field を新設しない — 開始時刻が事実上の deadline（rigidity hard = 厳格）。「この予定までに必要な準備・移動」が deadline 性を運ぶ（leaveBy/prep が担う）
- collapse risk / 3 案 / carryover の全てが deadline を参照する（RJ1/RJ4 の入力）

## 4. PrepTimeModel v0（CEO 方針 2 — heuristic・強い判断に使わない）

```
prepTimeMin = base(verb×時間帯: 朝の外出系 30-45 / 在宅系 10-15)
            + sleepShortPenalty(+10: sleepQuality short/shallow)
            + rainPenalty(+5: weather rainy/snowy)
            + eventTypePenalty(+5: 対人/フォーマル系 verb)
            + personalAdjust(B1 — Correction Calibration が校正)
```

- 全体を `RealityAttribute<number>`・**status: heuristic・confidence ≤0.35・displayPolicy: debugOnly**（参考値バッジへの昇格は別 gate）
- **強い出発判断（hard line・「今出ないと」系文言）には使わない**（CEO 指示）。wakeAt/prepareAt の参考算出のみ
- 本人補正（「朝はそんなに要らない」）= SSC user_correction → B1 で personalAdjust に反映（context: verb×時間帯×weather）
- **PrepState 観測**（未着手/準備中/出発可能）は位置・センサー前提のため**契約保留** — v0 は本人申告チップ候補とだけ記録（placeholder 語彙も作らない）

## 5. leaveBy 二段化（RC1 契約の改訂）

ern.leaveBy を単一値から二段 + 派生時刻に改訂:

```ts
leaveBy: {
  recommended: RealityAttribute<string>,  // 安全側（LSAT 高 percentile）
  hard:        RealityAttribute<string>,  // 最終ライン（LSAT 低 percentile・Safety Floor 下限）
  wakeAt:      RealityAttribute<string>,  // = recommended − prepTime（両方が解決して初めて非 null）
  prepareAt:   RealityAttribute<string>,  // = recommended − prep 残量バッファ
  whyUnresolved: LeaveByUnresolvedReason[],  // 既存規約（先頭=主理由・eta_source_missing を落とさない）
}
```

- **数理は新設しない**: recommended/hard = 既存 LSAT の percentile 2 点読み（critical-fractile + Safety Floor INV-3 がそのまま正本）
- **偽 deadline 禁止は不変**: ETA 分布供給（RC4）まで全段 null。**prep heuristic 単独から出発線を生成することを禁止**（prep は ETA 解決後の wakeAt 派生にのみ使う — CEO 方針 2 と整合）

## 6. Intervention Ladder Plan（pure・配信しない）

```ts
planInterventionLadder(ern, leaveLines, prepTime) → InterventionStep[]
InterventionStep = {
  at: string,                          // "HH:MM"
  deliveryModeCeiling: DeliveryMode,   // 既存語彙再利用（silent/on_open/push/urgent_push/permission_prompt）
                                       // — 新 strength enum を作らない。実配信は ceiling 以下で receptivity-gate が最終判定
  messageType: "wake" | "prepare" | "leave_now" | "question" | "three_options",  // RJ 診断語彙（wrapper 語彙クラス）
  reasonCodes: string[],               // EvidenceTag + RJ 診断コード
  targetNodeId: string,
}
```

- **配信しない**（B2/R6 gate）。表示も別判断（ALTER タブに「予定された介入計画」を見せるかは UI gate）
- leaveLines が null の間は ladder も生成されない（dormant — 偽計画を出さない）。fixture は合成 lines で検証
- no-action step 禁止（INV-1 継承: 各 step は必ず行動導線 messageType を持つ）

## 7. OriginInference（CEO 方針 3 — 位置は非解禁のまま）

```ts
originInference: {
  origin: RealityAttribute<{ kind: "previous_event" | "home" | "work", anchorRef?: string }>,
  // 推定規則 v0: 直前 event があれば previous_event（高確信）/ 朝一は home 仮定（低-中確信）
  confirmationNeeded: boolean,   // originConfidence < 閾値（0.6 目安・RJ1 設計で確定）
  confirmationQuestion: string | null,  // 「明日の朝は自宅から出発で見ていい？」— 既存 clarify 文化（Alter の clarify 設計）へ合流。
                                        // N-3 準拠の確認形・指示形禁止
}
```

- **currentLocation は使わない**（位置解禁は RC4/ETA gate 以降に再判断 — CEO 指示）。home/work の座標解決も場所解決 gate に従属
- 確認質問の回答 = user_confirmed evidence として origin に焼き込み（SSC user_correction 系）

## 8. OverrunRisk（事前の超過リスク — 確率禁止）

collapse risk（RG0.6 §4）と同じ規律: **factors 先行・確率/断定スコア禁止**:

```ts
overrunRisk: RealityAttribute<{
  level: "low" | "elevated" | "high",   // RG0.6 §4 と同一語彙（新 enum なし）
  factors: string[],     // 例: duration_assumed_default / high_cognitive_load_heuristic / past_overrun_pattern
  missingInputs: string[],
}>
```

- 材料: durationSource "assumed_default"（実装済み）/ cognitiveLoadHeuristic / **過去の超過 = driftSelections の delayed 蓄積**（実装済みの per-event outcome v0）+ PredictionLedger horizon "event"（将来）
- データ不足時は unknown 正直（recentOverrunPattern は dogfood 蓄積後にのみ立つ）

## 9. Feasibility Evaluator（per-event/task）

- **day-level**: 既存 dayFeasibility proxy（実装済み）+ 旧 RC2b の collapse factors を **RJ1 に吸収**（重複実装しない）
- **event/task-level（新規）**: `eventFeasibility: RealityAttribute<{ level: "low"|"elevated"|"high", factors, missingInputs }>` — リスク表現で統一（"safe/danger" の断定形 enum を新造しない。UI 表示語への写像は derived 層）
- v0 の判定材料（ETA なしで正直に出せるもの）: movement unresolved / place missing / hasOverlap（実装済み）/ strict 予定直前の大 gap / commitmentSignal（他人・予約系は崩れの痛み大）。**時間マージン判定（available vs required）は ETA+prep 解決後**に factors へ追加 — それまで missingInputs に明示

## 10. Reality Judgment Trace（判断台帳 — RJ を「偽物の賢さ」にしない背骨）

全 RJ 判断は trace を持つ。derive 揮発（store slow）・永続化は SSC/Ledger gate 経由のみ:

```ts
RealityJudgmentTrace = {
  judgmentId: "rj:<graphBaseId>:<judgmentKind>:<targetNodeId>",  // 決定的（乱数・時刻禁止）
  judgmentKind: "feasibility" | "departure_lines" | "intervention_ladder" | "proposal" | "origin_inference" | "overrun_risk",
  targetNodeId: string,
  usedInputs: { inputRevisionSet, nodeRefs: string[] },   // どの入力から出した判断か
  reasonCodes: string[],
  confidence: number,
  safetyGates: { gate: string, passed: boolean }[],       // best-action「Gate first」の記録（不通過も理由付きで残す — INV-12）
  output: 判断別 payload,
  derivationVersions: DerivationVersionSet,
  meta: { computedAt: RealityInstant },                    // identity 対象外（RG0.6b §2）
}
```

## 11. 語彙規律の審査記録（new enum ゼロの維持）

| 候補 | 裁定 |
|---|---|
| cognitiveLoad enum | **作らない** — number 0-1 heuristic（ern.energyCost と同形） |
| ladder strength（soft/medium/strong） | **作らない** — 既存 DeliveryMode を ceiling として再利用 |
| feasibility の safe/warning/danger | **作らない** — RG0.6 §4 の low/elevated/high を再利用（断定形を避ける副次効果） |
| messageType / judgmentKind | RJ 診断語彙（RG0.6b §1 の wrapper 語彙クラス = provenance/diagnostic 例外）として許容 — 予定意味論の正本ではない |
| PrepState（未着手/準備中/出発可能） | **保留** — 観測手段が無い段階で語彙だけ作らない |

## 12. ロードマップ再配置（旧 RC 段の移管）

| 段 | 内容 | 旧割当からの移動 | gate |
|---|---|---|---|
| **RJ0** ✅ | 本書（契約のみ） | — | 完了 |
| RC2a-2 | MovementReality v0 compile | 変更なし（**RJ1/RJ2 の入力供給** — RJ0 直後に実施が GPT/CEO 合意） | GO 待ち |
| RC2a-3〜7 | commitmentSignal / decisionDebt / deriveMomentSnapshot / assembler / invariants | 変更なし | 順次 |
| **RJ1** | Feasibility Evaluator（event/task + day collapse factors を吸収） | ← 旧 RC2b | pure |
| **RJ2** | PrepTime v0 + Departure Lines（leaveBy 二段・LSAT 2 点読み） | 新規（値は RC4 後に生きる — 契約と fixture 先行） | pure |
| **RJ3** | Intervention Ladder plan（pure・配信なし） | 新規 | pure・表示は UI gate |
| **RJ4** | Proposal Composer（守る/楽/攻める = ChangeSet 3 並置） | ← 旧 RC3b。**前提 = RC3a intentionMass + TaskRealityNode placeholder** | N-3 文言監査 |
| **RJ5** | Task Decomposition 契約（LLM 分解 → Engine 採用判定の境界） | 新規 | LLM 契約設計 |
| **RJ6** | Outcome Capture v1（driftSelections 拡張 + PredictionLedger event horizon） | 新規（既存 v0 の進化） | 保存形式 = SSC gate |
| RC4 | ETA/場所解決供給 → RJ2 の線が非 null 化 | 変更なし | **外部 API = CEO 承認** |
| RC5 | RequestRealityFrame（A1 合流）/ PlaceCandidateReality | 変更なし | A1 調整 |
| B1 | **Correction Calibration Engine**（prep/route/energy/task estimate への反映 — GPT 表の同名項は B1 そのもの） | 反映先 7 点表（RG0.6a §14）に prep/task を追加 | 観測 ≥14 日 |
| B2/R6 | State-triggered Notification + 配信 | 変更なし（位置解禁も同 gate 系） | CEO |

## 13. 完了と次

RJ0 = 契約のみ・コード変更ゼロ。次は CEO 判断: **RC2a-2（MovementReality v0 compile）GO** が既定路線（GPT/CEO 合意の順序）。RJ1+ の実装 GO は RC2a-2 以降に個別判断。
