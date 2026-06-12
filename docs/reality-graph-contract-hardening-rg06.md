# RG0.6: Reality Graph Contract Hardening（docs-only・実装なし）

- 日付: 2026-06-13 / 作成: 契約管理セッション（CEO/GPT 監査 12 点への応答）
- 目的: addendum のノード一覧を **Graph の契約**（接続・更新・伝播・失効・凍結・採点・permission・per-viewer）に昇格させる。
  これがないと Reality Graph は「型の集合」で止まる
- 優先順位: 本書 → addendum → R0.5 → 設計書 v0.4（矛盾時は新しいものが優先）
- 停止位置: 本書の CEO/GPT 確認まで。**RC2a GO はまだ無い**（GO 条件は §12）

---

## 1. RealityGraphSnapshot — Graph root の正本

**思想**: Snapshot は**保存される blob ではなく、毎回 derive される編成結果**（store slow / derive fast を root にも適用）。保存されるのは台帳（DayStateRecord）・台帳化された予測（PredictionLedger）・SignificantStateChange のみで、Snapshot 自体は揮発。

```ts
RealityGraphSnapshot v0（derive 出力・保存しない）= {
  graphId: string,            // 決定的: `rg:<subjectiveDate>:<viewerId>:<dayGraphSnapshotId>:<recordRevision>`
                              //（DayGraph.snapshotId の決定性規約を継承。乱数・時刻生成 ID 禁止）
  schemaVersion: 0,
  builtAt: RealityInstant,    // §3 の時刻契約（builtAt すら裸の文字列にしない）
  calendarDate: string,
  subjectiveDate: string,
  viewerId: string,           // §11（v0 は本人固定。型として最初から持つ）

  // ノード集合（全て参照 or derive 結果。所有しない）
  dayStateRecordRef: { date: string, frozenAt: string },   // 台帳は localStorage/将来 DB が正本
  userStateProjection: …,     // record.estimates の瞬間投影（§3 snapshot 内）
  momentSnapshot: MomentStateSnapshot,
  eventRealityNodes: EventRealityNodeV0[],
  movementRealityNodes: MovementRealityV0[],               // §6
  requestFrames: RequestRealityFrameRef[],                 // §8（v0 は常に []）
  placeCandidates: PlaceCandidateRealityRef[],             // §8（v0 は常に []）
  realityDiffs: ChangeSetRef[],                            // RC3 まで []
  predictionLedgerRefs: PredictionRef[],                   // §9

  // Graph レベルの正直さ・安全
  missingInputs: string[],     // 例: ["eta_source", "place_resolution", "weather(resolved)", "companions"]
  safetyFlags: string[],       // 例: ["external_communication_blocked", "auto_execution_blocked"]
  sourceRefs: { anchorsFetchedAt?: string, dayGraphSnapshotId: string },
  evidenceRefs: string[],
}
```

規律: ノード集合の要素は **id で相互参照**（ern:… / mv:… / pred:…）。配列 index を参照に使うことを Graph 全体で禁止（RC1 の stable id 規律の昇格）。

## 2. Graph edges — 依存・失効・再 derive・永続化の契約

**これが Graph の本体**。各 edge は `source → target / derived fields / invalidation trigger / recompute scope / persistence` を持つ:

| # | edge | derived fields | invalidation trigger | recompute scope | persistence |
|---|---|---|---|---|---|
| E1 | anchors+sources → DayGraph | nodes/edges/transitions/attributes | anchor add・edit・delete・(re)fetch | 影響日の graph のみ | なし（derive） |
| E2 | DayGraph → EventRealityNode[] | RC1 の 10 属性 | dayGraphSnapshotId 変化 | 当日 ern 全量（pure・安価） | なし |
| E3 | DayGraph.transitions → MovementReality[] | §6 v0 8 field | E2 と同じ + 場所/route/ETA の供給 | 影響 transition のみ | なし |
| E4 | DayStateRecord → MomentStateSnapshot | energy/recovery/todayMode の瞬間投影 + debt 成分 | 補正・manualLevels・sleep/mood・NightCheck 回答 | snapshot のみ（ern 再 compile 不要） | なし |
| E5 | ern[]+MovementReality[] → MomentStateSnapshot | nextFixedEvent 精密化・departureStatus・place/timeDebt | E2/E3 の出力変化 | snapshot のみ | なし |
| E6 | RealityInstant（1 分 tick）→ MomentStateSnapshot | 時間圧・窓・currentMode | 毎分（§3） | **snapshot のみ**（毎分 ern/graph を再 compile しない — 性能境界を契約化） | なし |
| E7 | ern[]+commitmentSignal+MovementReality+record → CollapseRisk(RC2b) | factors/failureModes/missingInputs | E2-E5 の出力変化 | risk のみ | なし（表示）。SSC 化は別 GO |
| E8 | RequestRealityFrame → PlaceCandidateReality[] | 候補集合 | frame 編集・失効（§8 expiry） | 当該 frame の候補のみ | A1 lane（plan_seeds）に従属 |
| E9 | PlaceCandidateReality → RealityDiff | ChangeSet+影響注釈 | 候補集合変化・当日 graph 変化 | 当該候補の diff のみ | なし（提示のみ） |
| E10 | RealityDiff →（**本人選択**）→ anchor 化 → E1 へ環流 | — | 本人の明示操作のみ | — | **既存 anchor write 経路のみ**（Graph からの自動 write 禁止） |
| E11 | 初回 build → estimatesFrozen → PredictionLedger | 予測の凍結 entry | その日の初回 derive（1 回だけ） | — | ✅ 台帳（現行: record 内 + W4 キー） |
| E12 | NightCheck 回答 → PredictionLedger.actual/verdict | 採点・carryOver・adjustments | 回答イベント | ledger entry のみ | ✅ plan_night_check_v0 |
| E13 | PredictionLedger → CorrectionMemory → 翌日 prior | verdict→trust_more/suppress 等（kernel memory-correction 合流） | 新規採点 entry | 翌日 build 時の prior のみ | **B1 gate** |
| E14 | record+snapshot → AlterConditionViewModel | 既存 VM チェーン | E4-E6 と同じ | VM のみ | なし |

**凍結点**: E11（朝の見立て凍結・1 日 1 回）+ 予測 entry 作成時（§9）。**採点点**: E12 のみ（v0）。
**提案してよい境界**: InterventionEligibility 通過 ∧ best-action gates 通過（RC3 以降）∧ 表示は N-3/displayPolicy 準拠。
**絶対に止める境界**（safetyFlags に常設）: 対外送信・予約/購入/連絡の自動実行・push 配信（B2/R6 gate）・Graph からの自動 anchor write（E10 は本人選択のみ）・production write。

## 3. MomentStateSnapshot の時刻契約（RealityInstant）

Night Check の時刻ソース分裂（W6-smoke-fix の root cause）の再発を**契約で**封じる。`nowHHMM: string` 単独入力を禁止し、入口で 1 回だけ組む:

```ts
RealityInstant = {
  nowInstant: string,            // ISO 8601（唯一の源）
  timezone: "Asia/Tokyo",        // 製品正本は JST 固定（明示 field — 暗黙ブラウザ TZ 禁止）
  wallClockHHMM: string,         // toJstWallClock 由来（実装済み: lib/plan/alterTab/adapter.ts）
  calendarDate: string,          // JST 暦日
  subjectiveDate: string,        // 05:00 境界（実装済み: subjectiveDateFor）
  minuteOfSubjectiveDay: number, // 0-1439（実装済み: toSubjectiveMin）
}
```

- 規律: **RealityInstant を組めるのは境界 1 箇所のみ**（client なら mount/tick、テストなら fixture）。pure 層は RealityInstant を受け取るだけで、内部で Date/getHours を呼ばない（既存の now 注入規律の強化版）
- `deriveMomentSnapshot(record, ernNodes, movementNodes, instant: RealityInstant)` — 旧 RC2a 案の `nowHHMM` 引数を**廃止**
- fixture 必須: 非 JST ブラウザ TZ 相当・05:00 境界・深夜イベント・日跨ぎ（W6 の実バグを永続再現テスト化）

## 4. SignificantStateChange の具体契約

「意味のある変化」を未定義のまま残さない。**v0 では実装しない（保存トリガ拡張 = 「新規データ保存」gate）が、契約を固定**:

```ts
SignificantStateChange = {
  changeId: string,                  // 決定的: `ssc:<subjectiveDate>:<targetNodeId>:<changeKind>:<occurredAtMinute>`
  changeKind:                        // 閉じた列挙（v0 候補 — 追加は契約改訂）
    | "estimate_frozen"              // E11（既存の凍結 — 遡及的に SSC と再解釈）
    | "user_correction"              // 補正・manualLevels・sleep/mood（既存保存 — 同上）
    | "night_check_answered"         // E12（既存）
    | "mode_transition"              // currentMode 遷移（新規・保存は別 GO）
    | "intervention_window_closing"  // open→closing 遷移（新規・同上）
    | "departure_resolved",          // RC4 以降
  targetNodeId: string,              // ern:… / record date / snapshot 系
  previousValue / nextValue: RealityAttribute<unknown> | ConfidentValue<unknown>,  // 裸値禁止
  thresholdCrossed: string | null,
  source: EvidenceSource, confidence: number, evidenceRefs: string[],
  occurredAt: RealityInstant,
  shouldPersist: boolean,            // 保存可否（既存 3 種は true・新規 2 種は GO まで false）
  shouldGradeLater: boolean,         // PredictionLedger 採点対象か
  dedupeKey: string,                 // 例: `<targetNodeId>:<changeKind>:<subjectiveDate>`（mode_transition は +時間帯）
}
```

整合修正の記録: 既存の保存（凍結・補正・NightCheck）は **SSC の先行実装**と再解釈する（独立概念を増やさない）。既知 gap: manualLevels に per-change timestamp が無い（record 上書きのため）— SSC 実装時に付与。

## 5. decisionDebt — 成分分解（単一スコア禁止）

介入方法が成分ごとに違うため、合成値だけでは介入できない。**成分 + evidence を正本、合成は表示用 derived**:

```ts
DecisionDebtV0 = {
  components: {
    placeDebt:        RealityAttribute<number>,  // ern.placeCertainty unknown な予定数（RC1 で供給済み）
    timeDebt:         RealityAttribute<number>,  // durationSource "assumed_default" / 時刻未確定数（DayGraph 実装済み）
    confirmationDebt: RealityAttribute<number>,  // requiresConfirmation ∧ 保留中の提案（RC3 以降に実値）
    candidateDebt:    RealityAttribute<number>,  // pending candidate selection（A1 capture / RC5）
    followupDebt:     RealityAttribute<number>,  // NightCheck followup 未回答（実装済み信号）
    changeDebt:       RealityAttribute<number>,  // unconfirmed plan change（Stage 2 drift 後）
    snoozeDebt:       RealityAttribute<number>,  // repeated snooze（通知系 B2/R6 後）
  },
  composite: RealityAttribute<number>,  // 0-1。derived・成分の存在しない領域を混ぜない
                                        //（供給済み成分のみで合成し missingInputs に残りを明示）
}
```

RC2a で実値が入るのは placeDebt / timeDebt / followupDebt の 3 成分。残り 4 成分は**構造だけ先に持ち unknown 正直**（捏造禁止）。

## 6. MovementReality v0 — RC4 を待たない（前倒し裁定を採用）

ETA なしでも「移動が未解決である現実」は今すぐ Graph で扱える。**RC2a の compile 対象に追加**:

```ts
MovementRealityV0 = {
  movementRealityId: string,   // `mv:<date>:<fromAnchorId>:<toAnchorId>`（stable・index 禁止）
  sourceRefs: { fromNodeId, toNodeId, dayGraphSnapshotId },
  // 8 field — 全て RealityAttribute（unknown 正直）
  movementRequired:  RealityAttribute<boolean>,   // transition 存在 = true
  samePlacePossible: RealityAttribute<boolean>,   // from/to の locationText 同一性から（不明は unknown）
  placeKnown:        RealityAttribute<boolean>,   // 両端の locationText 有無
  routeKnown:        RealityAttribute<boolean>,   // v0 常に false（route 源なし）
  etaKnown:          RealityAttribute<boolean>,   // v0 常に false
  leaveByKnown:      RealityAttribute<boolean>,   // v0 常に false（ern.leaveBy と整合必須）
  mobilityStatus:    RealityAttribute<MovementResolutionStatus>,  // 既存語彙・v0 "unresolved"
  missingInputs:     LeaveByUnresolvedReason[],   // ern.whyUnresolved と同一語彙・同一規約（先頭=主理由）
}
```

これで RC2b の collapse factors が「移動未解決」を Graph 上のノード参照（mv:…）で読める。RC4 は本ノードの resolved 化（値の供給）であり、形の変更ではない。

## 7. commitmentSignal — RC2b の前提（完全版 intentionMass は RC3a のまま）

collapse risk が「崩れると痛い予定」を区別するための**最小集合**。新スコアではなく既存 evidence の束:

```ts
CommitmentSignalV0（ern v0.1 への additive 属性・RealityAttribute<CommitmentSignalValue>）= {
  rigidity: AnchorRigidity,                       // hard/soft（実装済み）
  protectionReasons: ProtectionReason[],          // authority.ts（実装済み・v0 は通常空）
  otherPeoplePossible: boolean,                   // verb social/work ∨ sensitive ∨ companions【承認後】
  workShiftContext: boolean,                      // shift 文脈（dayState facts / shift source）
  reservationPaymentPossible: boolean,            // sourceType/sensitiveCategory 由来（不明は true 側に倒さず unknown）
  explicitPriority: null,                         // 本人タップ UI まで null（捏造しない）
  repeatedBehavior: boolean | null,               // anchor 反復（computeProposals の検出資産。v0 null 可）
}
```

割当: **RC2a で compile に追加**（材料は全て既存）→ RC2b が消費。intentionMass/commitmentGravity（0-1 合成・補正/NightCheck 履歴込み）は RC3a のまま。

## 8. RequestRealityFrame / PlaceCandidateReality — placeholder 契約（実装 RC5・契約は今固定）

```ts
RequestRealityFrameRef（placeholder）= {
  frameId: string,                       // A1 seed と 1:1（`rrf:<seedId>` — plan_seeds が正本）
  desiredAction / dateHint / areaHint / placeBrandHint,
  candidatePlaceNeeded: boolean,
  locationAmbiguity: "low"|"medium"|"high",
  requiredConditions: string[], unresolvedQuestions: string[],
  permissionBoundary: "user_select_place" 等（PermissionLevel 既存 0-5 への写像で表現）,
  expiry: { date: string },              // 失効（古い意図を現実に押し付けない）
}
PlaceCandidateRealityRef（placeholder）= {
  candidateId, frameId, placeName,
  // 評価軸は全て RealityAttribute: travelTime/mobilityFriction/workFit/scheduleFit/recoveryFit/fallbackEase
  realityDiffRef: ChangeSetRef | null,
}
```

**境界の固定**: ①発話→構造化は **A1 capture lane（seed-extractor-contract / plan_seeds）が正本**。RC は平行実装せず frameId で参照 ②**不変条件「すぐ予定化しない」**: RequestRealityFrame から anchor 化できるのは PlaceCandidate → RealityDiff → **本人選択**（E10）を通った後のみ。frame からの直接予定化を契約で禁止 ③input slit は frame の入口の 1 つ（構造抽出は Stage 1.5/A1 の LLM 契約）。

## 9. PredictionLedger の厳密化（NightCheck は部分集合）

```ts
PredictionEntry = {
  predictionId: string,            // `pred:<subjectiveDate>:<targetNodeId>:<field>:<horizon>`
  targetNodeId: string,            // record date / ern:… / mv:…（予定単位予測は RC2b 以降）
  predictedAt: RealityInstant,
  horizon: "day" | "evening" | "event",   // v0 は "day" のみ
  predictedValue: ConfidentValue<unknown> | RealityAttribute<unknown>,  // 裸値禁止
  evidenceRefs: string[],
  actualValue: … | null, observedAt: RealityInstant | null,
  gradingFunction: string,         // 例: "gradeEnergyLevel@v0"（採点規約のバージョン参照 — 再現性）
  verdict: GradeVerdict | null,
  learningCandidate: boolean,      // B1 で CorrectionMemory に流す候補か
}
```

**既存実装との対応（v0 = 部分集合と明記）**: predictedAt/predictedValue = estimatesFrozen / horizon=day 固定 / actualValue·observedAt = NightCheck dayFelt·answeredAt / gradingFunction = gradeNightCheck（gradeEnergyLevel 20 セル等）/ verdict = verdicts / learningCandidate = nextDayPriorAdjustments。**欠けているもの** = predictionId・targetNodeId の明示・event 単位 horizon・gradingFunction のバージョン参照。→ ledger 形への正規化は **SSC 実装と同じ gate**（保存形式の変更）で行い、それまで既存 2 キーを「v0 部分実装」として扱う。

## 10. provenance 規律の Graph 全体拡張（裸スコア禁止の昇格）

RC1 の INV-RC1 を Graph 規律に昇格:
- 対象: UserState 投影 / MomentStateSnapshot / MovementReality / RequestRealityFrame / PlaceCandidateReality / RealityDiff 注釈 / PredictionLedger / CorrectionMemory / decisionDebt 成分 — **数値・判定は全て RealityAttribute か ConfidentValue**
- unknown を 0 にしない（既に visual-contract §0.1 で UI 側は確立 — Graph 内部にも適用）
- 機械検証: `realityAttributeViolations` を共通 walker 化し、各ノードの violations 関数（ern は実装済み）を RC2a 以降の全ノードに義務付け（fixture で「裸 number の field が 1 つでもあれば FAIL」）

## 11. per-viewer / multi-user（CoAlter・2 人モード）

原則を先に固定（実装は将来 gate）:
- **同一 event が viewer ごとに異なる state を生む**: RealityGraphSnapshot は viewerId を v0 から持ち（§1）、将来 per-viewer projection（`projectForViewer(graph, viewerId)`）を生やす
- 既存の縫い目を正本に: **DayGraphView（"user_self" | "shared_view"・dayGraphTypes 実装済み）** + EventNode の sensitive redaction（displayLabel generic 化）が per-viewer 可視性の最初の実装。Graph はこれを拡張する（再発明しない）
- viewer 別に変わるもの: visible evidence（sensitive/private の redaction）/ permission（PlanItemGovernance ⊕ viewer 関係）/ suggested action（他人の予定への提案は常に強 gate）
- shared event / private event の分離: anchor 所有者と viewer の関係で changeEligibility を再評価（他人所有 → canSuggest* 全 false + requiresExternalCommunication true）
- Rendezvous の絶対原則（片想い非表示・追跡的情報非表示）を Graph 投影にも適用 — **他 viewer の存在を推測させる evidence を漏らさない**

## 12. RC2a GO 条件（再定義）

RC2a でやってよい範囲（全て pure・保存ゼロ・UI ゼロ・新規 read ゼロ）:
1. `RealityInstant` 型 + 境界 1 箇所の生成規約（§3）— 既存 toJstWallClock/subjectiveDateFor/toSubjectiveMin の編成
2. `MovementRealityV0` compile（§6 — DayGraph.transitions から）
3. `CommitmentSignalV0` を ern compile に additive 追加（§7）
4. `deriveMomentSnapshot(record, ernNodes, movementNodes, instant)`（§3 — CEO 指定 11 field + decisionDebt 成分 v0）
5. `decisionDebt` components v0（§5 — placeDebt/timeDebt/followupDebt 実値・他 4 成分 unknown）
6. `RealityGraphSnapshot` v0 assembler（§1 — derive のみ・保存しない・graphId 決定的）
7. fixtures: 時刻契約（TZ 非依存・05:00 境界・日跨ぎ）/ provenance walker（裸値 FAIL）/ debt 成分 evidence / mv 8 field unknown 正直 / commitmentSignal の blocked 側規律

RC2a でやってはいけないこと: collapse risk 実装（RC2b）/ SSC の新規保存トリガ / PredictionLedger の保存形式変更 / RequestRealityFrame 実装 / UI・debug variant 接続 / localStorage 変更 / 新規 read / fake ETA・leave-by。

**完了条件**: tsc 55・全 fixture PASS・既存ファイル不接触（compile 追補は realityCore 内のみ）・tree clean・本書との契約一致。

— RG0.6 完了で停止。RC2a GO は本書の CEO/GPT 確認後。
