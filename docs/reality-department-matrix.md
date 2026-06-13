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
- **RC2a-5（deriveMomentSnapshot = RC2a-5 input-bundle snapshot）= available RC2a materials の束ね（判断入力・判断結果でない）**（`5996f642`）。RC2a-5A で "完全版"/"全部署" の過大表現を訂正。**RC2a-5B（closeout micro-fix）= unconnectedDepartments runtime field 廃止→pipeline_capability missingInputRefs / momentSnapshotId→momentSnapshotCacheKey（identity 強化・basis に schema/derive/derivation 版）/ missingInputRef 最小 field 固定（dedupeKey/displayPolicy/criticality:unknown）/ 全 node 種別 duplicate guard / 日跨ぎ unsupported trace 保持**（本 commit）。
- **RC2a-6（assembleRealityGraph = RealityGraphSnapshot v0 root assembler）= Plan/Risk joint の Graph root 編成**（`3e9f4bb6`）。compile 済み材料（ern/mv/cs/decisionDebt/momentSnapshot）を 1 つの graph root に束ね、2 層 identity（graphBaseId/snapshotId）・InputRevisionSet・derivationVersionSet・missingInputRefs・safetyFlags を完成。**判断結果（Feasibility/Proposal/Permission action）は出さない**。
  - **発見（前提を疑った結果）→ RC2a-6A で解消**: `dayGraphSnapshotId`（v1 `computeSnapshotId` = date + anchor ID 集合 + day 境界 + gap）は **anchor 内容（時刻/場所/companions/rigidity）を含まなかった**。同一 anchor ID 集合での内容変更が dayGraphRevision を変えず、RC2a 識別子チェーン全体（momentSnapshotCacheKey/graphBaseId/snapshotId）が collide していた。**root cause は DayGraph 層**（pre-existing・RC2a 由来でない）。**RC2a-6A で computeSnapshotId を content-aware 化（v2）して根で解消**（realityCore は無変更で継承）。
- **RC2a-6A（DG0: DayGraph Snapshot Identity Root Fix）= identity root の content-aware 化**（`d580d9d0`）。CEO 裁定で RJ1 前の必須修正。`computeSnapshotId` v1→v2: anchor 内容 revision（`computeAnchorContentRevision` = anchorKind/startTime/endTime/rigidity/locationCategory/locationText(hash)/title(hash)/sensitiveCategory/companions(hash)）を末尾 `:c<hash>` で追加。**snapshotId は永続化されていない**（in-memory cache/comparison key のみ・movementSegmentOverlay checkpoint は string 比較）→ migration 影響 0。fnv1a64Hex/canonicalSerialize を `lib/plan/canonicalHash.ts` に切り出し（dayGraph↔realityCore 循環参照回避・graphIdentity は後方互換 re-export）。privacy: 生 locationText/title/companions は NFC→fnv fingerprint 化し snapshotId に raw text を載せない。RC2a chain（momentSnapshotCacheKey/graphBaseId/snapshotId）全体が root 修正を自動継承。旧 [KNOWN GAP] pin test が CLOSED に flip。
- **DG0-A / RC2a-6B（identity privacy closeout micro-fix）= provenance・privacy 境界を締める**（`5659db50`）。CEO 監査: ①**FNV を privacy-safe と言い切らない**（非暗号 fingerprint・低エントロピー text は hash でも推測余地・pseudonymous/sensitive-derived material 扱い・snapshotId は private-derived cache key で debug/log/shared/per-viewer/external へ無制限露出しない・公開 id 化時は HMAC/salt 再裁定）。②**exclusion field の derive 影響を empirical 検証**: confidence/externalUid/userId/confirmedAt/recurrence は derive 読取 0（grep 確認）→除外正当。**sourceId は derive に効く**（commitmentSignal.ts:106 が `sourcesById.get(sourceId).sourceType==="manual"` で rigidity provenance を決める）→ **content revision に scoped hash で追加**（re-sourcing 捕捉）。③同一 sourceId のまま source RECORD の sourceType 編集は sources-map の変化で本 revision に乗らない（sources は buildDayGraph 入力でない・実質不変）= 別 slice 明記。④projection 最小仕様（canonical/key sort/anchor id sort/companions sort/NFC/no raw text/no volatile timestamp/no array index/hash≠proof）を docs+test に固定。
- **RJ1a（RealityJudgmentInput + Feasibility v0 pure evaluator）= Risk 部署の最初の判断器**（`d5027fc7`）。RealityGraphSnapshot を消費し、target（event / day）の成立性を純粋判定。**判断文・提案・出発線は出さない**。核は **4 バケット厳格分離**（confirmedBlocking[これのみ infeasible] / inferredBlocking[最大 feasible_with_risk] / unresolvedCriticalInputs[→unknown] / riskFactors[severity context]）。FeasibilityStatus = feasible/feasible_with_risk/infeasible/unknown、RiskLevel = low/elevated/high/unknown（factor 集約・**確率/%なし**）。v0 confirmed は hard 同士の時間 overlap のみ（aggressive に infeasible を出さない）。permission = action gate context（feasibility 不可でない）/ commitment = severity context（infeasible でない）/ missingInputs = 判断不能理由（失敗理由でない）。RealityJudgmentTrace（judgmentId[snapshotId+scope+kind+version・raw viewerId 不含]/graphBaseId/snapshotId/inputRevisionSet/usedInputRefs/missingInputRefs carry）。sources-map 未配線 = sourcesRevisionPending/sourceRecordRevisionPending 明示（sourceType は capture-time provenance fact = 実質不変・検証済）。FEASIBILITY_JUDGMENT_VERSION は graph manifest と独立（downstream 版で graph identity を揺らさない）。
- **RJ1a-A（confirmed-blocking closeout micro-fix）= confirmed 衝突の厳格化 + field-level trace**（`525e1dce`）。CEO 監査 5 点: ①confirmed hard 衝突を **explicit duration ∧ confirmed-hard fixedness 限定**に厳格化（assumed_default duration / 弱根拠は「重なって見える」止まり→inferred）。②**hard 判定の正本を cs.rigidity → ern.fixedness に修正**（cs.rigidity は Context の判断値=severity context で confirmed 根拠にしない・fixedness inferred/unknown は confirmed にしない）。③usedInputRefs / reason evidenceRefs を **field-level（node#field）**化（code だけで理由作文できない構造）。④feasible/feasible_with_risk path は **synthetic fixture 限定**（実 compile v0 は大半 unknown・aggressive feasible を出さない）と明記。⑤sourceType immutable caveat を trace に維持（capture-time provenance・re-sourcing は sourceId・同一 sourceId の sourceType mutation 未対応・sources-map revision は将来 InputRevisionSet 配線）。ern.timeWindow に durationSource を露出（explicit/assumed_default を判断器へ）。
- **RJ1b（day-scope aggregation + duplicate/equivalent safeguard + trace refinement）= Risk 判断器の day 集約と二重取り込み安全弁**（`de1b1fef`）。①day-scope は event-level judgments を merged buckets で集約（confirmed 1 つでも→day infeasible / unresolved→day unknown / inferred のみ→feasible_with_risk）。trace に **perEventContributions**（per-event status/risk）を追加し day→event→field を辿れる。②**duplicate/equivalent safeguard**: 同一現実イベントの二重取り込み候補（v0 signal = 同一 timeWindow）を **confirmedBlocking に直行させず unresolvedCriticalInput（duplicate_identity_unresolved）に倒す**（衝突か重複か未確定 → unknown）。LLM で同一判断しない。externalUid/title hash/location hash/source dedup は将来材料（ern 未露出・displayLabel は redaction で不可）。③sourceRecordRevisionPending/sourcesRevisionPending を day trace に維持。no proposal/出発線/intervention/通知/確率。
- **RJ1b-A（duplicate/equivalent semantics closeout micro-fix）= 「duplicate と断定しない」+ pairwise relation trace**（`c43f92da`）。CEO 監査: ①**identical timeWindow を duplicate 証拠として扱わない**。それは `exact_time_collision_ambiguous`（真の衝突か二重取り込みか未確定）であって duplicate ではない。reasonCode/helper/docs から `duplicate_identity_unresolved`/`possible_duplicate` 等の断定表現を除去（`duplicate_identity_unresolved` は future・identity evidence 露出後）。②**pairwise relation trace**（PairwiseTimeRelation: relationId[sorted・dedup]/from/to/relationKind[confirmed_time_conflict/inferred_time_tension/exact_time_collision_ambiguous]/relationBucket/evidenceRefs[両 event の #timeWindow/#fixedness/#durationSource]/missingInputRefs/sourceRefs）を trace.timeRelations に追加 → day→event pair→field。③**day-level precedence**: ambiguity downgrade は同 pair の confirmed 化を止めるだけで**別 pair の confirmedBlocking を消さない**（unrelated confirmed→day infeasible 維持）。④**non-identical confirmed overlap 維持**（10:00-11:00 × 10:30-11:30 explicit+confirmed-hard → confirmed・identical のみ ambiguous）。⑤**"same external" と言い切らない**（externalUid 未露出 → ambiguity relation の missingInputRefs に external_identity_evidence_unexposed を明示）。externalUid/source event id/title hash/location hash は将来 duplicate model 材料。
- **RC2b-1（CollapseRiskProfile v0 = failure mode / risk factor map）= Risk 部署の崩れ方の地図**（`88424a3b`）。FeasibilityJudgment + RealityGraphSnapshot を材料に「どこが崩れそうか」を整理。**Feasibility と別軸**（feasibilityStatus を読まない/コピーしない）。failure mode は feasibility の reasons/relations を再投影（time_conflict_confirmed/time_tension_inferred/exact_time_collision_ambiguous/place_unresolved/movement_unresolved/eta_unresolved/leave_by_unresolved/decision_unresolved/source_revision_pending/boundary_spanning_unsupported/high_commitment_if_disrupted/permission_action_gate）。各 mode に category（collapse_source / unresolved / **severity_modifier**[commitment=痛み・risk source でない] / **action_boundary**[permission=collapse source でない]）+ riskContribution + sourceRefs/evidenceRefs(field-level)/missingInputRefs/relationRefs。riskLevel = contribution の max（**確率/%なし**）: confirmed→high / inferred→elevated / 未解決(missing/ambiguity/decisionDebt)→unknown(high でない) / modifier・action_boundary→寄与なし。**missing/commitment/permission/decisionDebt だけで high にしない**。exact_time_collision_ambiguous=duplicate でない。CollapseRiskTrace（collapseRiskId/feasibilityJudgmentId/usedInputRefs/factorRefs/relationRefs/missingInputRefs carry）。COLLAPSE_RISK_VERSION は graph manifest と独立。
- **RC2b-1A（riskLevel semantics closeout micro-fix）= riskLevel(known severity) と completeness を 2 軸分離**（`e36121c4`）。CEO 監査: ①旧 `riskLevel = max(riskContribution)` は **unknown(completeness) を high/elevated/low(severity) と同軸 max** していた誤りを修正。**riskLevel = known severity（collapse_source 由来のみ）**、known severity 無 + risk-relevant 未解決 → unknown / それも無 → low。②**completeness 軸を新設**: riskCompleteness（complete/partial/unknown）+ hasUnresolvedRiskInputs + unresolvedRiskInputRefs。known high + 未解決 → riskLevel high + completeness partial（known severity を潰さない）。③**source_revision_pending** は riskLevel を上げず（none）completeness/confidence に効く。④**confidence = evidence completeness**（成功確率でない・source pending/未解決で high にしない）。⑤Feasibility 分離維持（feasibilityStatus 非コピー）。violations: completeness 不正 / confidence high なのに非 complete / 未解決あるのに low 断定 を検出。
- **RC2b-2（CollapsePropagationMap v0 = impact surface）= Risk 部署の波及範囲の地図**（`376bee89`）。CollapseRiskProfile + FeasibilityJudgment + RealityGraphSnapshot を材料に「崩れたらどこへ広がり得るか」を整理。**CollapseRisk とも別軸**（候補であって因果確定でない）。**directional edge**（earlier→later・時間前方のみ・backward なし）: time_relation_edge / adjacent_event_order_edge / unresolved_movement_edge（carryover/decision_dependency は v0 未実装）。**edgeId は directional（sorted 不使用）= `pedge:<kind>:<from>-><to>`**（対称 PairwiseTimeRelation の sorted relationId と混同しない）。propagationLevel（none/local/downstream/day_scope/unknown・**確率でない**）= **known surface（confirmed/inferred conflict 由来のみ）**: 後続なし→local / 後続 1→downstream / ≥2→day_scope。movement/ambiguous/decision は `unresolvedPropagationInputs`（別軸・known surface にしない）。**exact_time_collision_ambiguous は causality にしない（edge なし）/ movement unresolved は delay 確定にしない（resolved:false candidate）/ commitment・permission・missing だけで propagation 作らない**。CollapsePropagationTrace（collapsePropagationId/feasibilityJudgmentId/collapseRiskProfileId/failureModeRefs/relationRefs/affectedNodeRefs/missingInputRefs carry）。
- **RC2c-1（InterventionEligibility / ActionBoundary v0）= Permission 部署の最初の実体化（安全の背骨）**（`<this commit>`）。RealityGraphSnapshot + FeasibilityJudgment + CollapseRiskProfile + CollapsePropagationMap を材料に「どこまで介入してよいか」を整理。**提案生成ではなく** eligibility / action boundary 層。**現実を読んでも行動の許可ではない**（high risk/infeasible は実行許可でない）。eligibilityLevel（allowed/requires_confirmation/blocked/unknown・**default-deny**: unknown→allowed にしない）。actionBoundary（display_only/draft_only/ask_confirmation/write_anchor/send_message/book_pay/external_communication/blocked・**v0 天井=ask_confirmation**・write_anchor 以上は天井にしない）。**強 gate**: otherPeople/reservation/payment/work/sensitive → requires_confirmation 以上。**exact_time_collision_ambiguous → 自動 move/skip しない**（canSuggestMove/Skip false・ask_clarification/observe）。canSuggest{Move/Shorten/Skip/Delegate/AskClarification/Prepare/Observe}（change 系は blocked/unknown/ambiguity で停止・delegate は v0 false）。sourceRevisionPending → confidence(=evidence completeness) を下げるが permission を緩めない。display_only も redaction gate（displayRedactionRequired・evaluator は redact 済み label/id のみ参照）。ern に sensitive:boolean 露出（強 gate 用・boolean のみ）。EligibilityTrace（eligibilityId/feasibilityJudgmentId/collapseRiskProfileId/collapsePropagationId/usedInputRefs/missingInputRefs carry）。INTERVENTION_ELIGIBILITY_VERSION は graph manifest と独立。
- 以降の各 slice は §2 の RACI 表を完了報告に含める。

### RC2c-1 Department Responsibility Matrix（InterventionEligibility / ActionBoundary・許可の層）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Permission**（介入可否=action boundary を所有。提案文/実行は出さない＝RJ2+/Communication） |
| consultedDepartments | Risk（Feasibility/Collapse/Propagation）・Plan・Mobility・Context（commitment gate）・Communication（external draft 境界） |
| blockingDepartments | **Permission**（拒否権の正本） |
| outputs | InterventionEligibilityV0（eligibilityLevel + canSuggest{7} + requiresConfirmation/ExternalCommunication + actionBoundary + blockedReasons/confirmationReasons + displayRedactionRequired + confidence + EligibilityTrace） |
| missingInputs | permission origin / otherPeople / reservation / payment / work / external communication / redaction visibility / sourceRevisionPending を blockedReasons/confirmationReasons + missingInputRefs carry で保持 |
| safetyGate | **現実 read は行動許可でない**・**default-deny（unknown→allowed にしない）**・otherPeople/reservation/payment/work/sensitive 強 gate→requires_confirmation 以上・exact_time_collision_ambiguous は自動 move/skip にしない・high risk/infeasible は実行許可でない・**v0 で write_anchor/send_message/book_pay/external_communication を天井にしない**・sourceRevisionPending は permission を緩めない・display も redaction gate・memory/correction で confirmation を消さない・no action/proposal・LLM 不使用 |
| traceRefs | EligibilityTrace.usedInputRefs（field-level）+ evidenceRefs + missingInputRefs + feasibilityJudgmentId/collapseRiskProfileId/collapsePropagationId |
| 実装した責務 | evaluateInterventionEligibility（gate 集約[最 restrictive]・default-deny precedence・canSuggest 面・actionBoundary 天井制御・integrity guard 6 段[snapshotId×3 + chain×2 + scope]）。ern に sensitive:boolean 露出 |
| 実装しなかった backlog | **RJ2+ 判断文/提案/3案/出発線/intervention ladder（別 GO）**・permission origin の実供給（v0 は ern.permissionLevel）・external communication draft（Communication 部署・draft_only 永続禁止）・sensitiveCategory 別 gate（v0 は boolean）・memory/correction gate（B1 配線後） |

### RC2b-2 Department Responsibility Matrix（CollapsePropagation impact surface・波及の層）

| 項目 | 内容 |
|---|---|
| owningDepartment | Risk（波及範囲=impact surface の整理を所有。判断文/提案/出発線は出さない＝RJ2+） |
| consultedDepartments | Plan・Mobility・Context（event order/relation/movement）。Permission は action boundary（propagation source にしない） |
| blockingDepartments | Permission |
| outputs | CollapsePropagationMapV0（propagationLevel + propagationEdges[directional・from/to/resolved] + affectedNodeRefs + downstreamImpactCandidates + carryoverCandidates[v0 []] + unresolvedPropagationInputs + trace） |
| missingInputs | route/ETA/leaveBy/place/source revision/exact-time identity/carryover model を unresolvedPropagationInputs + missingInputRefs carry で保持 |
| safetyGate | **CollapseRisk と別軸**・確率/%なし・**no causality 断定**（ambiguous は edge なし）・movement unresolved は delay 確定にしない（resolved:false）・**known surface は conflict 由来のみ**（commitment/permission/missing で surface 化しない）・**directional edge は sorted id 不使用**（from/to 保持・backward propagation なし）・no proposal/action・trace 必須・LLM 不使用 |
| traceRefs | CollapsePropagationTrace.usedInputRefs（field-level）+ relationRefs + failureModeRefs + affectedNodeRefs + feasibilityJudgmentId + collapseRiskProfileId |
| 実装した責務 | evaluateCollapsePropagation（conflict→known surface[earlier→later directional + adjacent downstream]・movement→候補 edge[resolved:false]・ambiguous→edge なし unknown・directional edgeId・integrity guard 3 段[snapshotId×2 + fjId]） |
| 実装しなかった backlog | **RJ2+ 判断文/提案/出発線（別 GO）**・same_day_carryover_candidate_edge（cross-day model 待ち）・decision_dependency_edge（dependency model 待ち）・directional relation の一般化（movement/causality/delay/responsibility） |

### RC2b-1 Department Responsibility Matrix（CollapseRisk failure mode map・崩れ方の層）

| 項目 | 内容 |
|---|---|
| owningDepartment | Risk（崩れ方=failure mode の整理を所有。判断文/提案/出発線は出さない＝RJ2+ の責務） |
| consultedDepartments | Plan・Mobility・Context（feasibility 経由の reasons/relations）。Permission は action boundary context（collapse source にしない） |
| blockingDepartments | Permission |
| outputs | CollapseRiskProfileV0（riskLevel[factor aggregation・%なし] + failureModes[category/riskContribution/evidenceRefs/missingInputRefs/relationRefs/sourceRefs] + riskFactors/unresolvedCriticalInputs carry + pairwiseRelationRefs + confidence + CollapseRiskTrace） |
| missingInputs | route/ETA/leaveBy/place/source revision/duplicate(exact-time) identity 等を failure mode の missingInputRefs + carry した snapshot missingInputRefs で保持 |
| safetyGate | **Feasibility と別軸（feasibilityStatus 非参照/非コピー）**・確率/%なし・proposal/出発線/intervention/通知/action/permission 緩和なし・**missing/commitment/permission/decisionDebt だけで high にしない**・exact_time_collision_ambiguous=duplicate でない・fake ETA/leaveBy/prep なし・knownComponentSummary 非参照・LLM 不使用・trace 必須 |
| traceRefs | CollapseRiskTrace.usedInputRefs（field-level）+ relationRefs（pairwise）+ feasibilityJudgmentId + missingInputRefs（source trace） |
| 実装した責務 | evaluateCollapseRisk（feasibility reasons/relations → failure mode 再投影・category 分離・contribution max で riskLevel・integrity guard[snapshotId 一致]） |
| 実装しなかった backlog | **RJ2+ 判断文/提案/出発線/intervention ladder（別 GO）**・collapse propagation（遅延波及）・duplicate model 本格化・per-viewer・directional relation（movement/causality 等は sorted-id 流用不可・directional id 要） |

### RJ1b Department Responsibility Matrix（day-scope 集約 + duplicate safeguard）

| 項目 | 内容 |
|---|---|
| owningDepartment | Risk（day-scope の成立性集約を所有。判断文/提案/出発線は出さない） |
| consultedDepartments | Plan・Mobility・Context（event-level 材料）。Permission は action gate context（feasibility を緩めない） |
| blockingDepartments | Permission |
| outputs | Day-level FeasibilityJudgmentV0（merged buckets 集約）+ RealityJudgmentTrace（**perEventContributions** で day→event）+ duplicate_identity_unresolved（safeguard） |
| missingInputs | duplicate/equivalent 未確定（duplicate_identity_unresolved）+ sourceRecordRevisionPending/sourcesRevisionPending + place/route/ETA/leaveBy + event-level unresolvedCriticalInputs |
| safetyGate | **confirmed 1 つでも→day infeasible / unresolved→day unknown**・unknown 非断定・**duplicate/equivalent 未確定で confirmedBlocking にしない**・no probability/% / no proposal/action・trace 必須・LLM で同一判断しない・permission は feasibility 不可にしない |
| traceRefs | perEventContributions（day→event status/risk）→ reason.targetNodeId（event）→ evidenceRefs（field-level node#field） |
| 実装した責務 | per-event 評価→merged 集約・isPossibleDuplicate（同一 timeWindow safeguard）・perEventContributions trace・source revision pending 維持 |
| 実装しなかった backlog | **RJ2+ 判断文/提案/出発線（別 GO）**・duplicate model 本格化（externalUid/title hash/location hash/source dedup・ern 露出後）・day-scope の時間軸精密 filter・CollapseRisk（RC2b） |

### RJ1a Department Responsibility Matrix（Feasibility 純粋判定器・判断の層）

| 項目 | 内容 |
|---|---|
| owningDepartment | Risk（成立性=破綻可能性の判断を所有。判断文/提案/出発線は出さない＝RJ2+/Communication の責務） |
| consultedDepartments | Plan・Mobility・Context（ern/cs/mv を読む）。**Energy・Memory は capability pending**（snapshot 経由）。Permission は action gate context として参照（feasibility を緩めない） |
| blockingDepartments | Permission（判断は出すが、action の可否は Permission が拒否権。feasibility ≠ action 許可） |
| outputs | FeasibilityJudgmentV0（feasibilityStatus + riskLevel + 4 バケット[confirmed/inferred/unresolvedCritical/riskFactors] + judgmentConfidence[質的・%なし] + displayPolicy + missingInputs/Refs carry + RealityJudgmentTrace） |
| missingInputs | unresolvedCriticalInputs（place_resolution_pending / movement_requirement_unknown / eta_source_missing / route_unresolved / leave_by_unresolved）+ snapshot missingInputRefs carry + sourcesRevisionPending / sourceRecordRevisionPending |
| safetyGate | **confirmed のみ infeasible**・unknown 非断定（feasible/infeasible どちらにも倒さない）・**確率/%なし**・proposal/出発線/intervention/permission 緩和を出さない・knownComponentSummary 非参照・LLM 不使用・commitment/permission/decisionDebt high を infeasible/late 確定にしない・trace 必須・id≠内容証明 |
| traceRefs | RealityJudgmentTrace.usedInputRefs（ern/cs/mv id）+ missingInputRefs（source trace 不失）+ graphBaseId/snapshotId/inputRevisionSet/derivationVersionSet |
| 実装した責務 | evaluateFeasibility（4 バケット分離・event/day scope・hard overlap = confirmed 構造衝突・soft overlap = inferred・movement/place/departure を unresolved vs inferred に分類・factor 集約 riskLevel・RealityJudgmentInput 単一正本） |
| 実装しなかった backlog | **RJ2+ 判断文/提案/3案/出発線/intervention ladder（別 GO）**・sources-map revision 配線（sourceType 実質不変で当面 pending）・moment_forward scope の精密 time フィルタ（v0 は構造 overlap）・CollapseRisk（RC2b）・per-viewer projection |

### RC2a-6 Department Responsibility Matrix（Graph root assembler・identity と編成の層）

| 項目 | 内容 |
|---|---|
| owningDepartment | Plan/Risk joint（compile 済み材料を graph root に編成。判断は出さない＝RJ1 の責務） |
| consultedDepartments | Mobility・Context（ern/mv/cs を full object で束ね）。**Energy・Memory は capability pending として missingInputRefs に表現**（pipeline_capability・runtime 部署名なし）。Permission は consumer 側 |
| blockingDepartments | Permission（graph は判断しないが、消費する RJ で permission が拒否権） |
| outputs | RealityGraphSnapshotV0（2 層 identity[graphBaseId day-level / snapshotId minute-level] + viewerScope[擬名化・raw viewerId なし] + builtAt[momentSnapshot.instant carry] + ern/mv/cs full[id canonical 整列] + decisionDebt[単一正本=momentSnapshot.decisionDebt] + momentSnapshot + inputRevisionSet + derivationVersionSet + pendingInputs + missingInputs/missingInputRefs[root まで失わず carry + graph-level pending refs] + safetyFlags + integrityViolations + sourceRefs[dayGraphSnapshotId + momentSnapshotCacheKey trace]） |
| missingInputs | momentSnapshot から carry（place/eta/origin/change 等）+ graph-level pending revisions（day_state_record/environment/hints/shift *_pending を pipeline_capability で） |
| safetyGate | **identity 規律**（2 層・momentSnapshotCacheKey を base に入れない[分依存→base が毎分変わる矛盾を回避]・id≠内容証明・raw viewerId 不混入・builtAt 秒/ms 非 identity・array index 非依存・duplicate id fail・材料整合性 guard）/ **判断結果を出さない**（Feasibility/Proposal/DepartureLines/Permission action 不在）/ unknown 非 0 / missingInput trace 保持 / runtime Department object なし / LLM・UI・IO 不接触 |
| traceRefs | RJ1 が RealityJudgmentInput として消費（JudgmentTrace.usedInputs に snapshotId + full inputRevisionSet + missingInputRefs。cacheKey 短縮 hash 単独で同一性を決めない） |
| 実装した責務 | assembleRealityGraph（2 層 identity 完成・既存 buildGraphBaseId/buildSnapshotId helper 再利用・InputRevisionSet 集約[real where available / 未供給は pending sentinel]・derivationVersionSet 可視化・missingInputRefs root carry + pending refs・safetyFlags[実データ検証 + 構造 tripwire]・canonical node 整列・全 node duplicate guard + 材料整合性 guard） |
| 実装しなかった backlog | **RJ1 Feasibility（次 GO）**・RealityJudgmentInput 正式型（RG0.6 backlog #1）・DayStateRecord/weather/hints/shift の実供給（pending sentinel）・per-viewer projection（RG0.6 §11）・~~dayGraphSnapshotId 内容完全化~~（**RC2a-6A で解消済**） |

### RC2a-5 Department Responsibility Matrix（input-bundle snapshot・判断入力の地面）

| 項目 | 内容 |
|---|---|
| owningDepartment | Plan/Risk joint（瞬間の判断入力を束ねる。Feasibility は出さない＝RJ1 の責務） |
| consultedDepartments | **Plan・Mobility・Context・Risk**（compile 済み材料 = ern/mv/cs/decisionDebt を参照束ね）。**Energy・Memory は未接続**だが **runtime に部署 enum を載せない**（RC2a-5B §1）— 上流 compile 材料の未供給を `missingInputRefs` の `pipeline_capability`（energy_projection_pending / fatigue_projection_pending / memory_profile_pending / correction_profile_pending）として表現。Permission は consumer 側 |
| blockingDepartments | Permission（snapshot は判断しないが、消費する RJ で permission が拒否権） |
| outputs | MomentStateSnapshotV0（schemaVersion + deriveMomentSnapshotVersion + **momentSnapshotCacheKey**[cache key・内容証明でない] + inputRevisionSetPending:true + RealityInstant carry + relevantNodes[active/next/past/upcoming/unresolvedMovement/boundarySpanning] + nodeRefs[ern/mv/cs **id join**] + decisionDebt + missingInputs codes + **missingInputRefs（source trace・部署名でなく node種別/pipeline_capability）** + derivationVersions）。**unconnectedDepartments runtime field は廃止**（RC2a-5B §1） |
| missingInputs | 各ノードのものを失わず集約（place_resolution_pending / eta_source_missing / origin_inference_pending / change_candidate_pending 等）＋上流未供給（energy/fatigue/memory/correction *_pending）。**missingInputRefs で source node/field + dedupeKey を保持**（dedup で trace を失わない・criticality は v0 unknown） |
| safetyGate | **判断結果を出さない（Feasibility/CollapseRisk/3案/出発線なし）**・unknown 非 0・single score 化しない・permission 非緩和・knownComponentSummary は RJ 正本入力にしない・mv absence≠移動不要・LLM 不使用・browser TZ 非依存（JST 強制）・id≠内容証明・**部署 enum を runtime 正本にしない**・全 node 種別 duplicate id guard |
| traceRefs | RJ1 が RealityJudgmentInput としてこの snapshot を消費（JudgmentTrace.usedInputs に momentSnapshotCacheKey + missingInputRefs） |
| 実装した責務 | deriveMomentSnapshot（RealityInstant carry・relevant nodes 整理[主観分 05:00 境界]・id join 束ね[ern/mv/cs 全 duplicate guard]・missingInputs source trace 保持[dedupeKey/criticality]・境界跨ぎ event 分離 + unsupported trace・上流未供給を pipeline_capability で表現） |
| 実装しなかった backlog | **RJ1 Feasibility（次 GO）**・RealityJudgmentInput の正式型（RG0.6 backlog #1）・**Energy/Memory compile 材料**・cross-day/carryover/fatigue projection（B1/将来）・日跨ぎ単一 event（DayGraph end_before_start で表現不可＝既知制約） |

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
