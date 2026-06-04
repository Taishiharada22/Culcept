# Reality Control OS — Connection Design / Integration Contract Audit

> 起草: Build Unit / 2026-06-02 / **設計のみ・実装未着手・CEO 承認待ち**
> 目的: Reality 判断 OS 純粋核（`lib/plan/reality/` 14 module・157 tests・24/24 INV 自動検証カバレッジ）を、既存 Plan/DayGraph へ *どう* 接続するかの契約設計。
> 表現訂正: 純粋核は「formally proven」ではなく「**24 INV・35 シナリオに対する自動検証カバレッジが揃った**」状態。
> **本書では一切実装しない**（DB マイグレーション実行 / PRM 実保存 / 実 push / 通知 queue 接続 / 既存 Plan UI 接続 / 自動予定変更 / native SDK / Routes 課金 は全て禁止）。

---

## 0. 接続の全体像

```
既存 Plan/DayGraph（real）
   │  ① read-only input adapter（既存挙動不変）
   ▼
Reality kernel（pure）: region 検出 → best-action(Gate first→score) → receptivity-gate → invariant-check
   │  ② output 契約
   ▼
DraftPlan / change-set / SourceTrace / PrmEvent / DeliveryDecision（提案・差分・根拠・学習・配信）
   │  ③ 段階適用（shadow → dev-only → on-open → gated push → native）
   ▼
既存 UI / plan_drift_events / web-push（本番・要 CEO 承認）
```

---

## 1. 入出力契約（既存型 ↔ Reality kernel）

### 1.1 既存 → kernel input（実在型に接地）

| 既存型（file） | → kernel input | 写像 |
|---|---|---|
| `ExternalAnchor`（external-anchor.ts: id/title/startTime/endTime/rigidity/sensitiveCategory/sourceId/anchorKind…） | `DayNode`(post-event-recompute) / 候補制約 / `PlanItemSnapshot`.governance | **rigidity hard→flexibility=locked＋protectionReason 候補、soft→movable**。origin=`imported`, authority=`import_locked`。sensitiveCategory(medical/legal/exam)→protectionReason=hard_external＋privacy redaction |
| `DayGraph`（dayGraphTypes.ts: nodes start/event/gap/end, edges, transitions） | region 検出（empty/gap/transition-at-risk）＋`DayNode[]` | EventNode→DayNode、GapNode→gap-meaning 入力、空→Build、余白→Complete |
| `MovementTransition.slackAnalysis`（availableMin/durationMin/utilization） | `TravelTimeStats`(lsat) ＋ leave-by | durationMin→travel.meanMin、unresolved→σ拡大＋conf 低下 |
| `PlanSeed`（plan-seed.ts: signal/desiredAction/desiredTimeHint/actionShape） | `SourceTrace`(kind=seed) ＋ Build/Complete の goal | seed=意図。goalAttainment の素 |
| Genome（personalModelStargazerAdapter: judgmentMode/timePreference, Stage B） | `SourceTrace`(kind=prm) ＋ ImportanceTier prior ＋ 遅刻回避 λ prior | **prior のみ**（PRM=evidence が主） |
| 状態（aneurasyncIntegration: mood/energy） | CandidateMetrics.rhythmFit / gap-meaning.energy / recoveryNeed | — |

### 1.2 kernel output → 既存

| kernel output | → 既存型 | 写像 |
|---|---|---|
| 採用 `BestActionCandidate.changeSet` | `DraftPlan`（basedOn{anchorIds,seedIds,rhythmSnapshot}）＋`DraftPlanItem` | change-set ops(add/move/update)→DraftPlanItem。governance.origin→DraftPlanItem.origin(anchor/seed/rhythm_inferred) |
| `SourceTrace[]` ＋ explainScore | `DraftPlanItem.reason`＋UI の「なぜ」 | summarizeReasons→reason |
| `PrmEvent` | `plan_drift_events`（§3） | kind→drift_type、sourceTraces→evidence_source/strength、snapshot→target_snapshot |
| `DeliveryDecision` | 通知 payload / in-app card（§4） | mode→channel |
| `RankResult.rejected`（理由付き） | dev-only log（透明性） | silent に捨てない |

---

## 2. 最初の安全な接続先（read-only / shadow / dry-run / dev-only）

**本番動作にいきなり入らない。** 既存 UX を 1mm も変えずに、kernel を実データで走らせる。

| Stage | 内容 | 既存挙動 |
|---|---|---|
| **2-a read-only input adapter** | PlanClient が既に持つ anchors＋DayGraph（[PlanClient.tsx:412](../app/(culcept)/plan/PlanClient.tsx)）から kernel input を構築。**出力を一切適用しない** | 不変 |
| **2-b shadow run** | kernel（rank/gate/receptivity/invariant）を実データで実行、結果を **dev-only log / 隠し debug panel / test fixture** のみへ | 不変 |
| **2-c dev-only report** | shadow 結果（best/rejected/gate/delivery/invariant 違反）を開発用に集計。**残り 6 INV の runtime auto 検証はここ**（live risk→hysteresis/monitoring に流し flap しないか等を実データで確認） | 不変 |

- 全体を **feature flag（PLAN_FLAGS、dev/canary 限定）** で gate（既存 `enhanceAlterNotes` の canary パターン流用）。
- ユーザー体験・既存 DayGraph・既存通知は触らない。

---

## 3. PRM 永続化設計（設計のみ・migration 実行禁止）

**既存 `plan_drift_events`（append-only・RLS・改竄防止・raw 抑制が設計済）を中核に再利用/拡張。**
既存列：`user_id / target_type / target_id / drift_type / predicted(JSONB) / actual(JSONB) / evidence_source / evidence_strength / pattern_key / repetition_count / target_snapshot(JSONB) / created_at`。

| PrmEvent | → plan_drift_events | 備考 |
|---|---|---|
| kind（16 種） | drift_type（マッピング表）or 新列 `event_kind` | proposal_*/undo/plan_item_*/deviation… |
| occurredAt | created_at | — |
| itemId / changeSetId | target_id ＋ target_snapshot | — |
| sourceTraces | evidence_source ＋ evidence_strength | strongest→source、traceConfidence→strength |
| signalPolarity / ignoredReason / dedupeKey | target_snapshot(JSONB) or 新列 | dedupeKey は idempotency に必須 |
| predicted vs actual（影の一日） | predicted / actual | drift 学習 |

- **privacy 境界**：raw location/user text/通知本文/第三者名 を保存しない（target_snapshot は **field 名・分類・差分のみ**、値を入れない）。PrmEvent 契約が既にこれを保証。
- **dedupeKey**：過学習防止（同一通知/proposal/undo を二重記録しない）。
- **retention**：drift は append-only、派生 `personal_reality_model`（rollup snapshot）で要約。元 event の保持期間は CEO 判断。
- **未永続物**：`plan_seeds` / `draft_plan` テーブルは未作成（純粋核は未永続）。Seed/Draft 永続が要るなら別 migration を **後でドラフト**（CEO 承認）。
- 🔴 **migration 実行は禁止**。本書は列マッピングの設計まで。

---

## 4. Push 配信設計（設計のみ・実 push 禁止）

`DeliveryDecision.mode` → channel：

| mode | channel | 既存資産 |
|---|---|---|
| `push` / `urgent_push` | web-push（時刻トリガーは queue 経由） | `sendPushToUser`（[sendPush.ts:37](../lib/notifications/sendPush.ts)）＋ queue（notification_type/scheduled_for） |
| `on_open` | in-app card（push しない） | 既存 Plan UI に「開いた時」surface |
| `permission_prompt` | in-app 権限要請（乱発禁止 gate 済） | — |
| `silent` | dev-only log のみ | — |

- **no-action 通知禁止**：receptivity-gate が構造保証（push は必ず allowedActions）。payload に行動 deep-link を必須化。
- **permission_prompt**：予算/受容性 gate 済（Slice 2D 硬化）。
- 🔴 **実 push 送信・queue 接続は禁止**。本書は mode→channel と payload 契約まで。

---

## 5. Native-first 設計（PWA に縮めない）

最終前提は Native-first。kernel は **trigger-source 非依存**（`RealityEvent` を入力とし出所を問わない）。

| trigger source | native | PWA 先行 | 備考 |
|---|---|---|---|
| Time（scheduled push） | ✓ | ✓ | leave-by/朝/post-event。今の web-push で先行可 |
| Geofence/Activity（到着/滞留） | ✓ | ✗ | **iOS 20 / Android 100 上限 → 動的管理**（近接・高 stakes 順に入替）。Transistorsoft 想定 |
| External（天気/遅延） | ✓ | ✓ | server cron。Routes/GTFS-RT |

- **degradation**（no_location/no_network/no_push/low_battery）→ 既に `monitoring.ts`＋`receptivity-gate` が処理。位置縮退でも時刻ベースで継続、silent にしない。
- **PWA = trigger-source の一部が欠ける adapter**。契約（kernel input/output）は縮めない。geofence/activity は native shell 着地で snap-in。

---

## 6. 接続順序（段階・各 stage は flag gate・可逆）

```
① read-only input adapter   既存→kernel input（出力適用なし）
② shadow run                kernel を実データで実行、結果は dev-only
③ dev-only report           shadow 集計＋残り 6 INV の runtime auto 検証
④ PRM dry-run event         PrmEvent を構築・validate するが永続しない（保存なし）
⑤ on-open proposal          提案を UI に surface（flag・opt-in、ユーザーは無視可）
⑥ gated push                時刻トリガーの受容性ゲート付き push（opt-in）
⑦ native trigger            geofence/activity（native shell 後）
```

- ①〜④は **既存挙動ゼロ変更**（自律で設計→実装可、ただし④の「保存しない」を厳守）。
- ⑤以降は **UX 変更・push・DB を伴う → CEO 承認必須**（DB マイグレーション・push 送信・課金）。
- 各 stage は feature flag で独立 on/off、いつでも revert。

**実装状況（pure・runtime-unconnected）**:
- ✅ ① `integration/input-adapter.ts`：既存型→RealityInput の純粋変換（軸分離済）。
- ✅ ② `integration/shadow-runner.ts`：adapter 出力→kernel(rank→receptivity→invariant)→**redacted summary** の純関数 skeleton。候補は fixture 由来（generator 未実装）。実 runtime/route/PlanClient/実データ/raw log なし。
- **importance/catastrophic は構造化シグナルのみ**（`deriveImportance`：**userDeclared（本人宣言）最優先**＋reservation/payment/deadline/external/cascade。**raw title 推測を型レベルで禁止**）。
- ✅ ③ `integration/dev-report.ts`：`aggregateShadowReport(ShadowSummary[])→DevReportRedacted`（**ref を一切持たない counts/distributions のみ**＝mode/delivery/gate-failure/invariant-violation/risk の分布、totals）。redacted ref は report-local ephemeral に限定。**画面表示・console・file 出力は未着手**。
- ④ PRM 保存・⑤+（実 runtime 呼出・push・native）は未着手（要 CEO 承認）。

---

## 7. CEO 判断ポイント
1. 本 Connection Design を Phase 1 接続の設計確定としてよいか
2. **最初の実装許可範囲**：①read-only input adapter ＋ ②shadow run ＋ ③dev-only report は **既存挙動ゼロ変更・本番未接続** ゆえ自律実装してよいか（DB/push/native なし、flag gate、純 adapter＋テスト）
3. ④以降（PRM 保存・on-open・push・native）は段階ごとに別途承認

> 本書は設計提案。実装は CEO 承認後。次成果物（許可が出れば）＝ Stage ①②③ の read-only adapter ＋ shadow runner ＋ dev-only report（additive/可逆/flag gate、既存挙動不変）。

---

## 8. A1-5: Complete 候補生成器の shadow/dev 接続（2026-06-05 audit・**設計のみ**）

> A1-5-0 Pipeline Runtime Connection Design / Read-only Audit の記録。**実装ゼロ・flag 未追加・runtime 未接続**。read-only 調査に基づく。

### 8.0 状況更新 — 欠けていた候補生成器が完成
§6 ② shadow-runner は「**候補は fixture 由来（generator 未実装）**」だった（line 139）。**A1-4 系で実 generator が完成**したため、shadow に**実候補**を流せる状態になった:
- A1-3 Repair trim-only / **A1-4-2a/b** Complete fill-only(multi-)add `generateComplete` / A1-4-1 `SeedPlacement` / A1-4-3a/b duration enrichment + provenance resolver / **A1-4-4a Complete dispatcher**（`generateCandidates` の Complete 分岐・第3引数 `CompleteDispatchInput`）。
- ＝ §0 の `①adapter → ②kernel → ③出力` のうち **②の候補生成が pure に揃った**。残るは「実候補を shadow 足場に差し込む配線」のみ。

### 8.1 接続方針（A1-5-0 採用判断）
- **新経路を作らない**: 既存 `shadow-runner`/`dev-runtime`(column-restricted)/`redaction-guard` を再利用（最も安全な初接続点・seed/raw を読まない・flag off・production no-op）。
- **RealityInput に seedPlacements/evidence を直載せしない**（禁止）。**`CompleteDispatchInput` を別 channel** とし **server-only orchestration** で組む（A1-4-4a の第3引数経路）。RealityInput は日構造入力のまま不変。
- **PlanClient / route / live production 経路には触れない**（§2 の 2-a〜2-c の範囲・⑤以降は別 GO）。

### 8.2 raw surface 監査（A1-5 全段の必須条件）
- **raw surface は upstream に存在**: `EventNode.title?`/`locationText?`(dayGraphTypes) / `DraftPlanItem.title`(input-adapter `draftItemToSnapshot` L161) / `PlanSeed.signal`/`desiredAction`(`seedToSourceTrace.reason` L143)。
- **しかし Complete 経路は構造的に raw-free**: `eventNodeToDayNode` が title/location を落とす(L97-103)／`RealityInput` 型に title/location 無し／`dev-runtime-adapter` は **column-restricted**(raw 列を「そもそも読まない」)／Complete は `seedTraces`(desiredAction reason) を使わず `buildSeedPlacements`(構造化のみ)→`generateComplete`(title 無 snapshot)→evaluator が title drop／`redaction-guard` allowlist で出力 raw 非含有を表明。
- **必須条件**: **column-restricted projection + 構造化 SeedPlacement 経路 + redaction-guard + fail-closed** を使い、`buildDayGraph`(raw)・`seedToSourceTrace.reason`・`draftItemToSnapshot.title` を Complete 経路に**持ち込まない**。

### 8.3 段階分離（seed read / PRM evidence / UI surface は別承認 gate）
| 段 | 内容 | seed | PRM evidence | UI | production 挙動 |
|---|---|---|---|---|---|
| **A1-5-1** | shadow wiring（実候補を runShadow へ） | **`[]`** | **`[]`** | なし | **ゼロ**（候補0・redacted summary のみ） |
| A1-5-2 | column-restricted seed read | 非空 | `[]` | なし | ゼロ（duration null→候補0） |
| A1-5-3 | PRM/correction → DurationEvidence | 非空 | 非空 | なし | ゼロ（shadow 内で初候補・UI なし） |
| A1-5-N | UI surface（提案を画面へ） | — | — | **あり** | **ここで初めて変わる**（遠い別 GO） |

### 8.4 A1-5-1 最小実装案（次 GO 候補・まだ実装しない）
- **server-only shadow orchestration**（新 1 ファイル・**barrel 非 export**・dev-runtime 隣接・依存注入で実 Supabase/route/UI/PRM を import しない）:
  - flag off（既定）→ **no-op**（fail-closed code を返す）。
  - flag on（dev のみ）→ `CompleteDispatchInput`(seedPlacements=`[]`・durationEvidences なし・activeWindow=日境界) を組み → `generateCandidates(input, goals, completeInput)` → `evaluateCandidate` → `runShadow` → `assertRedacted` → **redacted ShadowSummary**（`candidateCount=0` を確認）。
  - test: flag-off→no-op / 空入力→candidateCount=0 / redaction pass / raw 非出力。
- ＝ 新規は「A1-4 候補を `runShadow` へ流す assembly」のみ（従来 fixture だった所）。`shadow-runner`/`dev-runtime`/`redaction-guard` を再利用。

### 8.5 flag / no-op / fail-closed / rollback
- **flag**: `PLAN_FLAGS` に追加（CEO 承認案件・例 `process.env.REALITY_COMPLETE_SHADOW === "true"`・**default false・server-side only**）。
- **no-op**: flag off（既定）/ production / capability 無 / 入力欠落 / redaction fail → **即時 no-op**（kernel 呼ばず・読まず）。
- **fail-closed**: 不明/error → 破棄し **raw を含まない error code のみ**。
- **rollback**: **env flag を off に戻すだけ**（即時・コード revert 不要・DB 書込ゼロゆえ undo 不要）。

### 8.6 A1-5-1a 実装（landed）— shadow orchestration skeleton（server-only・no call-site）
`lib/plan/reality/integration/complete-shadow-orchestration.ts`（新規 server-only・**barrel 非 export・no call-site**）。§8.4 の最小案を **空入力 skeleton** で実装。**route/UI/PlanClient/runtime から呼ばない**。
- `runCompleteShadow(deps)`: flag off→`{ok:false, code:"flag_off"}` / flag on→**空 `CompleteDispatchInput`(seedPlacements=[]/durationEvidences=[])** で `generateCandidates`→`evaluateCandidate`→`runShadow`→redaction gate → `{ok:true, summary}`（**candidateCount=0**）。redaction 失敗→**fail-closed** `{ok:false, code:"redaction_failed"}`。
- **依存注入**: `flag`(注入 boolean・**PLAN_FLAGS 追加せず**) / `realityInput`(注入・実データ読まない) / `redactionCheck`(DI・既定 `assertShadowSummaryRedacted`)。helper `isCompleteShadowEnabled` / `emptyCompleteDispatchInput`。
- **raw なし**: 入力 raw(seedTrace.reason 自由文)も summary に漏れない（Complete は seedTraces 未使用・候補 0）。default duration なし・PRM/DB/runtime 読まない。
- test(`realityCompleteShadow.test.ts`・**8**): flag-off→no-op / 空入力→candidateCount=0 redacted / summary redaction clean / **dev-report contract(aggregateShadowReport→assertDevReportRedacted) clean** / 入力 raw 非漏洩 / fail-closed(DI) / pure helpers。
- **しない（A1-5-1a 範囲外＝A1-5-1b 以降）**: 実 call-site(route/UI/PlanClient/runtime) / RealityInput 搭載 / 実データ・seed read / PRM・correction 実接続 / DB / push / flag 追加 / UI surface / barrel。

### 8.7 A1-5-1b 実装（landed）— real-read smoke manual entry（server-only・no auto call-site・**実 read 未実行**）
`lib/plan/reality/integration/complete-shadow-real-smoke.ts`（新規 server-only・**barrel 非 export・no auto call-site**）+ `PLAN_FLAGS.realityCompleteShadow`（**default false**）。CEO の **手動 dev smoke** 用 entry。既存 `runRealReadSmoke` + `createDatedColumnRestrictedAnchorSource` を合成。**実 read は committed code では実行しない**（user-RLS client は CEO harness が注入・`createClient`/`createServerClient`/service_role を本 module に書かない）。
- `runCompleteShadowRealSmoke(deps)`: gate(4 層) → column-restricted **external_anchors** read（許可列 `id,start_time,end_time,rigidity,sensitive_category` のみ・`select("*")`/forbidden 列なし・user_id+date eq・limit≤50）→ seed-strip → runShadow(**candidates=[]**) → redaction gate → `RealSmokeReport`(counts/enum/bool)。**candidateCount=0**。
- `buildCompleteShadowGate`: `PLAN_FLAGS.realityCompleteShadow`(default false) + 注入(nodeEnv/capability/requestedUserId/allowedDevUserId) から `SmokeGate`。
- **fail-closed**: production/flag-off/no-capability/out-of-scope-user → **load 0**(from() 不発火) / service_role → SERVICE_ROLE_REFUSED / load 失敗 → ADAPTER_DEGRADED·NO_INPUT / redaction 失敗 → REDACTION_BLOCKED。
- **seed read 0 / PRM なし / DB write なし / push なし / raw 非出力 / 自動 call-site なし**。rollback は flag off のみ。
- test(`realityCompleteShadowRealSmoke.test.ts`・**14**): gate 4 noop(load 0) / service_role 拒否 / pass で SELECT 1 回・許可列のみ・'*' なし・forbidden 非含有・user_id+date eq / table=external_anchors(seed 不可) / limit≤50 / candidateCount=0 / RealSmokeReport counts/enum/bool·redaction clean / raw 非出力 / NO_INPUT / ADAPTER_DEGRADED(raw 非含有) / flag default false。
- **しない（A1-5-1b 範囲外＝A1-5-2 以降）**: **実 read 実行**（CEO 手動 smoke のみ）/ createClient committed / 実 call-site(route/UI/cron) / seed read / PRM·correction 実接続 / DB write / UI surface / barrel。

> A1-5-0 design / A1-5-1a no-call-site skeleton（§8.6）/ **A1-5-1b real-read smoke manual entry（landed・§8.7・実 read は CEO 手動 smoke のみ・committed code は実 read しない）**。次は seed read(A1-5-2)/PRM evidence(A1-5-3)/UI surface(A1-5-N) を各別 GO。raw を持ち込まない・column-restricted・redaction guard・fail-closed・flag off default・no DB・no push を全段で維持する。
