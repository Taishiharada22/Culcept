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

- **RC2a-2（MovementReality v0）= Mobility 部署の最初の実体化**（`75826356`/`83cd3764`）。
- **RC2a-3（CommitmentSignal v0）= Context 部署の最初の実体化**（`8ea2cbda`/`44720f1d`）。
- **RC2a-4（decisionDebt components + Moment integration）= Risk/Plan joint の最初の集約**（`624003cc`/`d5393ca7`）。
- **RC2a-5（deriveMomentSnapshot 完全版）= 全部署材料の束ね（判断入力・判断結果でない）**（本 commit）。
- 以降の各 slice は §2 の RACI 表を完了報告に含める。

### RC2a-5 Department Responsibility Matrix（全部署 joint・判断入力の地面）

| 項目 | 内容 |
|---|---|
| owningDepartment | Plan/Risk joint（瞬間の判断入力を束ねる。Feasibility は出さない＝RJ1 の責務） |
| consultedDepartments | Plan・Mobility・Energy・Context・Memory・Permission（全部署の compile 済み材料を参照束ね） |
| blockingDepartments | Permission（snapshot は判断しないが、消費する RJ で permission が拒否権） |
| outputs | MomentStateSnapshotV0（RealityInstant carry + relevantNodes[active/next/past/upcoming/unresolvedMovement] + nodeRefs[ern/mv/cs join] + decisionDebt + 統合 missingInputs + derivationVersions） |
| missingInputs | 各ノードのものを失わず集約（place_resolution_pending / eta_source_missing / origin_inference_pending / change_candidate_pending 等） |
| safetyGate | **判断結果を出さない（Feasibility/CollapseRisk/3案/出発線なし）**・unknown 非 0・single score 化しない・permission 非緩和・knownComponentSummary は RJ 正本入力にしない・mv absence≠移動不要・LLM 不使用・browser TZ 非依存（JST 強制） |
| traceRefs | RJ1 が RealityJudgmentInput としてこの snapshot を消費（JudgmentTrace.usedInputs に snapshot id） |
| 実装した責務 | deriveMomentSnapshot（RealityInstant carry・relevant nodes 整理・全ノード参照束ね・missingInputs 集約） |
| 実装しなかった backlog | **RJ1 Feasibility（次 GO）**・RealityJudgmentInput の正式型（RG0.6 backlog #1）・cross-day/carryover/fatigue projection（B1/将来） |

### RC2a-4 Department Responsibility Matrix（Risk / Plan joint）

| 項目 | 内容 |
|---|---|
| owningDepartment | Risk / Plan joint（未決の集約を Risk が統合・Plan が予定材料を提供） |
| consultedDepartments | Plan・Mobility・Context・Memory・Permission |
| blockingDepartments | Permission（debt 高でも自動介入は permission が拒否） |
| outputs | decisionDebt 8 components（placeDebt/timeDebt/mobilityDebt/confirmationDebt/candidateDebt/followupDebt/changeDebt/snoozeDebt）+ knownComponentSummary（debugOnly）+ MomentDecisionContext（RealityInstant carry + activeWindow + nextRelevantNodeIds + missingInputs） |
| missingInputs | origin_inference_pending・request_frame_pending・place_candidate_pending・communication_followup_pending・intervention_reaction_pending・eta_source_missing・drift_tracking_pending |
| safetyGate | **unknown を 0 にしない**・**single score に潰さない**・**permission 非緩和（permission field 無し）**・**mv absence を mobilityDebt 0 と読まない**・LLM 不使用 |
| traceRefs | （RJ 接続時）JudgmentTrace.usedInputs に decisionDebt components・MomentDecisionContext |
| 実装した責務 | decisionDebt の成分分解（**3 成分 derivable**: place/time/mobility / **5 成分 unknown**: confirmation/candidate/followup/**change**/snooze）+ RealityInstant を carry する Moment 統合。RC2a-4A で changeDebt を unknown に修正（commitment は debt source でなく severity modifier） |
| 実装しなかった backlog | RJ1 Feasibility（別 GO）/ confirmationDebt 実値（OriginInference 後）/ candidate/followup/snooze 実値（Request/Communication/Reaction source 後）/ changeDebt 実値（変更候補/drift tracking = Stage 2 後）/ placeResolutionDebt（RC4 場所解決後） |

### RC2a-3 Department Responsibility Matrix（Context）

| 項目 | 内容 |
|---|---|
| owningDepartment | Context |
| consultedDepartments | Plan（予定列）・Memory（補正履歴・将来 B1） |
| blockingDepartments | Permission（commitment 高でも自動変更は permission が拒否） |
| outputs | rigidity（RealityAttribute・動かしにくさ判断・RC2a-3A で裸値→RealityAttribute 化）/ protectionReasons / otherPeoplePossible / workOrShiftPossible / reservationOrPaymentPossible / fixedStart / deadlineOrCarryoverImpact / socialWeight / changeCost（全て RealityAttribute・fixedStart/rigidity/socialWeight/changeCost/permission は各々分離） |
| missingInputs | other_people_unknown / reservation_payment_unknown / deadline_model_pending（task/Deadline 未実装）/ commitment_signal_weak |
| safetyGate | unknown を low 扱いしない・title だけで断定しない・**commitment ≠ permission（permission field を持たない）** |
| traceRefs | （RJ 接続時）JudgmentTrace.usedInputs に cs node refs（targetNodeId=ern で join） |
| 実装した責務 | commitmentSignal compile（守る理由・他人/予約/勤務の可能性・固定度・社会的重み）。Context 部署の最初の実体化 |
| 実装しなかった backlog | 予定の「意味/目的」独立判断（同じ 19:00 渋谷でも飲み/商談/病院で変わる）→ 将来 Context 拡張 / deadlineOrCarryoverImpact 実値（TaskRealityNode・Deadline Model 後） |
