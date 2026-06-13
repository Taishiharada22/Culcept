# Reality Judgment Department Matrix（docs 責務契約・runtime object なし）

- 日付: 2026-06-13 / 作成: 契約管理セッション（CEO 方針 2026-06-13 — 部署を第一級の責務契約に）
- 位置づけ: 「何を作るか」（RC/RJ 工程）と直交する「**誰が何を判断するか**」の責務正本
- 規律（CEO 指示）: **runtime Department object は作らない**。docs 上の RACI 契約として owning/consulted/blocking/outputs/missingInputs/traceRefs を明記し、必要なら JudgmentTrace の diagnostic metadata としてのみ持つ。部署 enum を runtime 正本にしない（語彙乱立・判断二重正本の回避）
- 各 slice 完了報告は本表の該当行（Department Responsibility Matrix）を必ず含める（RC2a-2 以降）

---

## 1. 8 部署の責務（CEO 構想）

| 部署 | 見るもの | 主な出力（既存材料への写像） |
|---|---|---|
| **Plan** | 予定・締切・優先度・空き時間・task/block 関係 | schedulePressure / deadlinePressure / openSlotCandidates / taskPlacementNeed ← DayGraph / TaskRealityNode / dayFeasibility |
| **Mobility** | 移動・出発線・origin・route・天気影響 | movementRequired / originInference / departureLines / routeBurden ← **MovementReality（RC2a-2 実体化）** / LSAT / leaveBy 二段 |
| **Energy** | 睡眠・疲労・集中力・時間帯適性・作業負荷 | energyFit / cognitiveLoadFit / eveningCollapseRisk / taskPlacementFeasibility ← dayState estimates / PrepTime / overrunRisk |
| **Context** | 誰と・何のため・重要度・社会的約束・予定の意味 | commitmentSignal / socialWeight / purposeConfidence / contextMissingInputs ← commitmentSignal（RC2a-3）/ verb / governance |
| **Memory** | 過去の遅刻・準備時間・補正・通知反応・見積もり | correctionProfile / prepAdjustment / routeAdjustment / taskEstimateAdjustment ← CorrectionMemory / PRM / driftSelections（B1 消費） |
| **Risk** | 破綻可能性・他人迷惑・不可逆性・締切超過・衝突 | feasibilityRisk / overrunRisk / socialRisk / irreversibilityRisk / blockingReasons ← Feasibility / collapse factors / safetyGates |
| **Permission** | 自動可否・確認必須・表示のみ・下書き・外部送信禁止 | actionBoundary / permissionRequired / blockedReason ← PermissionLevel 0-5 / Action Boundary 8 段 / INV-5 |
| **Communication** | 通知文・提案文・確認質問・相手連絡下書き | userMessage / confirmationQuestion / proposalCopy / externalDraft（外部送信は Permission gate 必須・自動禁止） ← messageType / Proposal Composer |

## 2. RACI の最小契約（各 slice が埋める表の形）

| 項目 | 内容 |
|---|---|
| owningDepartment | 主担当部署（その slice の出力を所有） |
| consultedDepartments | 判断材料を提供する部署 |
| blockingDepartments | 拒否権を持つ部署（特に Permission） |
| outputs | RJ/Graph に渡す RealityAttribute 出力 |
| missingInputs | 部署として不足している入力 |
| safetyGate | permission / redaction / unknown / external のどの gate を通すか |
| traceRefs | JudgmentTrace に残す根拠 |

## 3. 既弱部署の進化先（CEO/GPT 指摘 — backlog として記録）

- **Energy**: `TaskPlacementFeasibility`（task × candidateWindow の energyFit/cognitiveLoadFit/deadlineFit/splitFit/riskFactors）→ RJ4/Task slice。3 案生成の前提
- **Context**: 「同じ 19:00 渋谷でも飲み/商談/病院で判断が変わる」独立判断が弱い → RJ/Context 拡張。当面は commitmentSignal の社会的重みで近似
- **Communication**: 相手への連絡は **draft_only** まで（自動送信永久禁止・Action 境界の強 gate）

## 4. RJ backlog（owning slice 固定・RC2a-2 のブロッカーではない）

CEO/GPT 裁定どおり、以下は RC2a-2 では実装せず owning slice の完了条件に入れる:

| # | backlog item | owning slice | RC2a-2 blocker? |
|---|---|---|---|
| 1 | RealityJudgmentInput（入力束の統一） | RJ1 開始前 | No |
| 2 | MovementOptionComparison（route/eta/reliability/weatherFit/cost） | RC4 / RJ2（fake route/ETA 禁止） | No |
| 3 | PrepReadinessSignal（manual chip / sensor / unknown seam） | RJ2 / RJ3（UI なし・断定しない） | No |
| 4 | TaskPlacementFeasibility | RJ4 / Task slice | No |
| 5 | Proposal Objective（守る=保護 / 楽=回復 / 攻める=前倒し・破綻ライン超過禁止・制約グラフ上の別ルート） | RJ4 必須 | No |
| 6 | Correction Context Schema（origin/destination/transport/route/weather/eventType/timeBand/socialCommitment） | B1 必須 | No |
| 7 | Intervention Reaction Outcome（shown/opened/ignored/dismissed/acted_after/snoozed/corrected/disabled） | B2/R6 + Ledger（うるさい通知化の防止） | No |
| 8 | CrossDayJudgment（tomorrowGraph × todayCarryOver × fatigue/sleep projection） | RJ1/RJ6/B1（明日の成立を明日の graph だけで出さない） | No |

## 5. 適用記録

- **RC2a-2（MovementReality v0）= Mobility 部署の最初の実体化**（本 commit）。Department Matrix の行は完了報告に記載済み。
- 以降の各 slice は §2 の RACI 表を完了報告に含める。
