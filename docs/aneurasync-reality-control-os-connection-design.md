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

### 8.8 A1-5-2-0 audit + A1-5-2-1 実装（landed）— column-restricted seed projection（pure・実 read なし）
> A1-5-2-0 read-only audit: **`plan_seeds` table / repository / loader / API は存在しない**（`plan_drift_events.sql` L181「… do not exist yet」）。＝**実 seed read は BLOCKED**（読むデータが無い）。PlanSeed の raw surface は **`signal` / `desiredAction` の 2 つ**。`buildSeedPlacements` が読むのは `id/desiredDate/desiredTimeHint/actionShape/confidence/status` の structured のみ。

A1-5-2-1（`lib/plan/reality/integration/seed-column-restricted.ts`・新規 **pure**・**barrel 非 export・DB source factory なし**）:
- **列契約**: `ALLOWED_SEED_COLUMNS`(id/user_id/desired_date/desired_time_hint/action_shape/confidence/status) / `FORBIDDEN_SEED_COLUMNS`(signal/desired_action) / `SEED_COLUMNS_SQL`("*"・raw 列なし) / `ColumnRestrictedSeedRow`(**raw を型に持たない**)。
- **`projectSeedRowsToPlacements(rows) → SeedPlacement[]`**: 注入 row[] を **`buildSeedPlacements` 再利用**で projection（同等 semantics・active のみ・**durationMin=null / durationSource=unknown**・raw 不持込）。**実 read しない**（row は注入。`.from("plan_seeds")`/Supabase client/createClient なし）。
- **帰結**: projection 結果は **isPlaceable=false**（duration なし）→ generateComplete に流しても **candidateCount=0**。実候補は **A1-5-3（PRM→DurationEvidence）後**にしか出ない。
- test(`realitySeedColumnRestricted.test.ts`・**11**): 許可列 structured-only / 禁止列に signal·desired_action / SQL に signal·desired_action·"*" なし / row 型に raw なし(ts-expect-error) / active のみ / durationMin null·durationSource unknown / raw 混入 row でも非出力 / 不正 enum は default / buildSeedPlacements 同等 / generateComplete→candidateCount=0。
- **しない（A1-5-2-1 範囲外）**: 実 seed read / DB source factory / Supabase client / `.from("plan_seeds")` / migration / plan_seeds table 作成 / seed capture·loader·repository / PRM·correction / RealityInput 搭載 / runtime·route·UI / barrel。

### 8.9 A1-5-2-2-0 design + A1-5-2-2-1 実装（landed）— plan_seeds structured-only migration draft（**未 apply**）
> A1-5-2-2-0 design: 既存 `external_anchor_sources`（raw を DB 列に置かず Storage 参照・破棄既定・短期失効・整合 CHECK・owner-only RLS）を手本に、**plan_seeds は structured-only**（「raw を同じ読み取り表面に置かない」）。raw が必要なら別層へ隔離し Complete/projection から到達不能に。

A1-5-2-2-1（`supabase/migrations/20260605100000_plan_seeds_structured_only.sql`・新規・**draft / 未 apply**）:
- **structured-only `plan_seeds`**: id/user_id/desired_date/desired_time_hint/action_shape/confidence/status/source/captured_at/expires_at/**source_ref(opaque)**/created_at/updated_at。**`signal`/`desired_action`/raw_text/title/location 列は無い**。
- **CHECK**: confidence 0..1 / status(active/consumed/expired/rejected) / action_shape(ActionShape 8 値) / desired_time_hint(morning/afternoon/evening/anytime) / source(chat/manual)。
- **RLS owner-only**（`auth.uid() = user_id`・select/insert/update/delete 各 policy・**service_role 非前提**）。indexes(user_id+status / user_id+desired_date / active 期限 partial)・updated_at trigger。
- **source_ref は opaque**（A1-5-2-1 `ALLOWED_SEED_COLUMNS` には含めない）。
- **apply しない**（`supabase db push/reset` 未実行・実 DB 変更ゼロ）。実 read / Supabase client / `.from("plan_seeds")` / DB source factory なし。
- test(`realityPlanSeedsMigration.test.ts`・**15**・static/schema): raw 列不在 / structured-only / ALLOWED_SEED_COLUMNS 整合 / FORBIDDEN に signal·desired_action / CHECK 各種 / RLS enabled・auth.uid()=user_id ×4・service_role なし / 追加のみ(DROP TABLE なし) / updated_at→trigger / anytime→projection no-window。
- **しない（A1-5-2-2-1 範囲外）**: migration apply / db push·reset / 実 DB read·write / Supabase client / DB source factory / `.from("plan_seeds")` / seed capture / plan_seed_sources raw table / PRM / runtime·route·UI / barrel。

### 8.10 A1-5-2-2-2a（landed・doc-only）— plan_seeds migration apply readiness / staging runbook（**未 apply**）

> migration apply は **別 GO（A1-5-2-2-2b・CEO 承認）**。本節は runbook のみで、`supabase db push`/`db reset`/実 apply/実 DB read を**実行しない**。対象は **culcept-staging のみ・本番 apply は禁止**。方向性（structured-only / raw 列禁止 / staging 限定 / apply 別 GO / db reset 禁止 / apply 後 SQL 確認 / RLS owner-only / capture 未実装ゆえ rows=0 正常）は確定。以下は CEO 4 補正を反映した正準 runbook。

**apply 先の決定（補正1・最重要）**: apply 先は **`supabase/config.toml` の root `project_id` ではない**（これは Supabase CLI の **local project 識別子**であり `db push` の適用先判定に使わない）。`db push` は **linked remote project** に対して実行される。apply 前確認を必須にする:
- `supabase link --project-ref <STAGING_REF>` 済み（`STAGING_SUPABASE_PROJECT_REF`）。
- `supabase migration list`（CLI 出力）で **linked project が staging**。
- `supabase db push --dry-run` で **pending migration** を確認。
- 出力に **production ref が一切出ない**。
- `supabase/.temp/project-ref` 等の linked ref が **staging と一致**。

**apply 方式（補正2・migration history 整合）**:
- **Option A（推奨・CLI）**: staging に link → `supabase db push --dry-run` → pending が `20260605100000_plan_seeds_structured_only.sql` **だけ**であることを確認 → その場合のみ `supabase db push`。→ **migration history（`supabase_migrations.schema_migrations`）に自然記録**。
- **Option B（例外・SQL Editor）**: staging Dashboard SQL Editor に migration SQL を手貼り。plan_seeds だけを外科的に apply できる利点はあるが、**`supabase_migrations.schema_migrations` に記録されない可能性**があり、後続 `supabase db push` が同 migration を再実行して**失敗**しうる。採用するなら **migration history の扱い（`supabase migration repair` 相当の要否）を別確認**にし、**後続 `db push` との整合確認を STOP 条件に入れる**。

**apply 後確認 SQL（read-only・staging）**: ① `SELECT to_regclass('public.plan_seeds')` 非 NULL / ② `information_schema.columns` で structured-only / ③ raw 列（signal/desired_action/raw_text/title/location）count=**0** / ④ `relrowsecurity = t` / ⑤ `pg_policies` が owner-only（`auth.uid()=user_id` ×4・service_role なし）/ ⑥ `pg_constraint` CHECK 整合 / ⑦ updated_at trigger 存在 / ⑧ `SELECT count(*) FROM plan_seeds` = **0**（capture 未実装ゆえ正常）。

**user-RLS 確認（補正3）**: SQL Editor は schema/RLS **定義**確認には有効だが、**管理者的文脈**ゆえ **user-RLS の実証には使わない**。user-RLS 検証は **CEO 本人の anon authenticated client / manual smoke harness** で別途行う（service_role 不可）。kernel 経由の seed read smoke は **column-restricted seed DB source（未構築）**が前提ゆえ **A1-5-2-2-2c+**（空 plan_seeds で **rowsRead=0・candidateCount=0** 期待）。

**rollback / recovery（補正4・staging 限定）**:
- **Option B（SQL Editor apply）**: `DROP TABLE IF EXISTS public.plan_seeds CASCADE; DROP FUNCTION IF EXISTS public.plan_seeds_set_updated_at();` で戻せる（空・FK 依存なし）。
- **Option A（CLI・migration history 記録済み）**: DROP **だけでは不十分**。実 DB と migration history がズレるため **history 整合（`supabase migration repair` 相当）も別確認**にする。
- **staging 以外では実施禁止**。**本番 rollback は本 runbook 対象外**。

**STOP 条件**: link 先が production / dry-run に production ref / pending が plan_seeds 以外を含む（意図せぬ apply）/ apply エラー（policy 重複＝plan_seeds 既存）/ ③ raw 列 ≠0 / ④ RLS 無効 / ⑤ owner-only でない・service_role policy / ⑥ CHECK 不一致 / ⑧ 行数 ≠0 / Option B 後に migration history 不整合。

**A1-5-2-2-2b 最小実行案（別 GO）**: `supabase migration list`（staging link 確認）→ `supabase db push --dry-run`（pending = plan_seeds のみ確認・production ref 不在確認）→ その場合のみ `supabase db push`（Option A）→ 上記確認 SQL（read-only）→ 異常なら rollback。`db reset` 禁止・本番禁止。kernel read smoke は A1-5-2-2-2c+。

**必ず明記**: migration apply は別 GO / `db push`・`db reset` は今回実行しない / **user-RLS 優先（service_role でない）** / plan_seeds は **structured-only** / signal·desired_action·raw_text·title·location は**存在してはいけない** / source_ref は **opaque**（Complete projection の allowed columns に載せない）/ capture 未実装ゆえ apply 直後 rowsRead=**0** が正常 / A1-5-2-2-2b smoke は candidateCount=**0** 期待 / capture·PRM·correction·UI は別段階。

- **しない（A1-5-2-2-2a 範囲外）**: migration apply / db push·reset / SQL Editor 実 apply / 実 DB read·write / seed DB source / seed capture / PRM·correction / runtime·route·UI·PlanClient / raw parse / default duration / remote·PR·GitHub / barrel。

### 8.11 A1-5-2-2-2b apply（staging 完了）+ A1-5-2-2-2c 実装（landed）— seed DB read seam（column-restricted）

> **A1-5-2-2-2b**: `20260605100000_plan_seeds_structured_only.sql` を **culcept-staging に CLI `db push` で apply 完了**（companions `20260602`＝Alter Plan 別ラインを先行 apply し plan_seeds を単独 pending 化してから）。検証: migration history（20260602+20260605）記録 / table exists / raw 列 0 / RLS owner-only / rows=0 / user-RLS smoke PASS。service_role·DB write·SQL Editor·db reset·production·remote すべて 0。

A1-5-2-2-2c（`lib/plan/reality/integration/seed-source.ts`・新規・**barrel 非 export**・`server-only`）:
- **`createColumnRestrictedSeedSource(client, bounds)`**: structured-only `plan_seeds` から **許可列のみ**読み `projectSeedRowsToPlacements`（A1-5-2-1）へ渡す read seam。
  - query: `from(SEED_TABLE).select(SEED_COLUMNS_SQL).eq("user_id",uid).eq("status","active")[.or(expires_at 境界)].limit(clampSeedLimit)`。
  - **column-restricted**（`SEED_COLUMNS_SQL` 固定・`"*"` なし・raw / `source_ref` を select も型も持たない）。table 固定（`SEED_TABLE`=plan_seeds・**本ファイルのみ**）。
  - **bounded**（user_id + status='active' + `MAX_SEED_LIMIT=50` clamp・population read 禁止）。expired は status + 任意 `activeAsOfIso` 境界注入（expires_at は WHERE のみ・SELECT しない）で除外。
  - 戻り値 `SeedPlacement[]`（durationMin=null → isPlaceable=false → **candidateCount=0**・A1-5-3 PRM まで）。
- **`loadGatedActivePlacements(gate, source)`**: `evaluateSmokeGate` 経由の fail-closed。production / flag off / capability なし / user mismatch で **load 0**。
- **DI**: `SeedUserContextClient`（from/select/eq/or/limit）。実 Supabase client が structural に満たす。**`createClient` / service_role を import しない**（user-RLS 前提）。
- test(`realitySeedSource.test.ts`・**22**): SELECT 許可列のみ / `"*"` なし / raw·source_ref 非 select / table plan_seeds / bounded(user_id·active·limit) / limit clamp / expired 境界 OR / active のみ projection / durationMin null·unknown·placeable=false / generateComplete→0 / 空→0 / gate fail×4→load 0 / 静的(service_role·createClient·DB write 不在) / `.from(SEED_TABLE)` は seed-source.ts のみ(reality tree 走査)。
- user-RLS empty smoke（untracked・1回・project-pin hjcr…wc・anon+user・SHIFT_SMOKE creds）: source の query 形で **rowsRead=0 / candidateCount=0 / service_role 0 / raw·secret·UUID 非出力**。
- tsc: 自ファイル **0 error**（project baseline 1114 は無関係既存ファイル）。reality **461 tests** PASS。
- **しない（A1-5-2-2-2c 範囲外）**: seed capture / INSERT·UPDATE·DELETE / DB write smoke / PRM·correction / runtime·route·UI·PlanClient / RealityInput 搭載 / generateCandidates 接続 / default duration / raw parse / source_ref を allowed columns に / A1-5-3 / barrel export。

### 8.12 A1-5-3a 実装（landed）— DurationEvidence adapter / assembler（pure・candidateCount>0 を fixture 実証）

A1-5-3a（`lib/plan/reality/duration-evidence-adapter.ts`・新規・pure・**barrel 非 export** / `seed-placement-enrich.ts` に検証器 +2 export・**非挙動**）:
- **producer / assembler**: PRM(typicalDuration) / correction / seed_explicit が将来出す**構造化 duration 入力**を `DurationEvidence` に整形し `seedRef→DurationEvidence[]` map（= CompleteDispatchInput.durationEvidences）を組む。
  - `seedExplicitToEvidence` / `correctionToEvidence` / `prmTypicalToEvidence`（prm_typical は typicalDuration の high/medium/low → DurationConfidence high/low に写像・**medium/low→low**）/ generic `toDurationEvidence` / `assembleDurationEvidenceMap`。
  - well-formed 検証（range 1<分≤1440 / source 妥当 / seedRef 非空）は enrich の検証器を**再利用**（単一権威）→ 不適は **null(reject)**。採用方針（confidence-high / priority / conflict / **prm_typical→grounding weak**）は enrich が決定。
  - **PRM/correction 実接続なし**（typicalDuration/correctionMemoryFrame 非 import・入力は構造化 fixture）。**raw parse なし・default duration なし・DB read/write なし・runtime 非接続**。
- **candidateCount 実証**（adapter→assemble→enrichSeedPlacementsFromEvidences→generateComplete）:
  - **seed_explicit / correction（high・strong 維持）+ fixture placement + gap → candidateCount>0**（pure pipeline が候補を出せることを初めて実証）。
  - **prm_typical（high）→ grounding weak → candidateCount=0**（安全床固定）。
  - low confidence / range外 / invalid source / seedRef mismatch / same-priority conflict → no enrich → candidateCount=0。priority seed_explicit>correction>prm_typical。
- test(`realityDurationEvidenceAdapter.test.ts`・**19**): 整形 / reject(null) / assembler / pipeline candidateCount>0・=0 / 静的(raw·DB·PRM·correction·default·server-only 不在 / barrel 非 export)。
- tsc: 自ファイル **0 error**（**full tsc 0 ではない**・project baseline 1114 は無関係な既存ファイル）。reality **480 tests** PASS（enrich +export 回帰なし）。
- **しない（A1-5-3a 範囲外）**: PRM/correction 実接続 / seed capture / DB read·write / INSERT·UPDATE·DELETE / runtime·route·UI·PlanClient / RealityInput 搭載 / generateCandidates 実配線 / default duration / raw parse / plan_seed_sources / evidence store migration / A1-5-4 / barrel export。

### 8.13 A1-5-3b 設計（doc-only）— DurationEvidence 永続 store（plan_seed_duration_evidences）

> **設計のみ。migration / table 作成 / DB apply / DB read·write はしない**（A1-5-3b-1 で migration draft）。duration の置き場を確定し、capture/PRM/correction/runtime 接続前に**永続境界と RLS**を固定する。
> **結論**: duration は **plan_seeds に列を足さず**、seedRef 別・source 別・confidence 別・priority 解決可能な**独立 store** `plan_seed_duration_evidences` に置く。

**1. 推奨 schema（design proposal・未 migration・未 apply）**:
```sql
-- ⚠ DESIGN DRAFT ONLY — migration ファイルではない・apply しない。
-- plan_seeds に composite FK 参照先要件: UNIQUE(id, user_id) を additive ALTER（id は PK ゆえ常に充足・冪等）
CREATE TABLE IF NOT EXISTS plan_seed_duration_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,                                                    -- owner（composite FK 経由で plan_seeds→auth.users）
  seed_id UUID NOT NULL,                                                    -- owner integrity は composite FK で担保（補正2）
  duration_min INTEGER NOT NULL CHECK (duration_min > 1 AND duration_min <= 1440),  -- 補正1: enrich isValidEvidenceDuration と一致（1<分<=1440）
  source TEXT NOT NULL CHECK (source IN ('seed_explicit', 'correction', 'prm_typical')),  -- DurationEvidenceSource
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'low')),           -- DurationConfidence
  source_ref TEXT,                                                          -- opaque 参照（raw 本文でない・read allowed columns 非搭載）
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                           -- evidence 観測/算出時刻
  expires_at TIMESTAMPTZ,                                                   -- retention
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seed_id, source),                                                 -- source ごと「現在の有効 evidence」1 行（upsert 置換）
  FOREIGN KEY (seed_id, user_id) REFERENCES plan_seeds(id, user_id) ON DELETE CASCADE  -- 補正2: owner integrity を DB 制約で担保
);
-- index (user_id, seed_id) 主検索 / partial (user_id, expires_at) WHERE expires_at IS NOT NULL 失効 sweep
-- updated_at trigger（plan_seeds と同型）/ RLS ENABLE + owner-only 4 policy（auth.uid()=user_id・service_role 非前提）
```
**raw 列なし**（signal/desired_action/raw_text/title/location 不在）。plan_seeds migration（A1-5-2-2-1）の規約を踏襲。

**2. plan_seeds と同 table に duration を置かない理由**: ① 1 seed→N evidence（複数 source）を単一列で表せない ② priority 解決（seed_explicit>correction>prm_typical）に複数行が要る ③ same-priority conflict 検出 ④ provenance（source/confidence 別）⑤ correction の時系列 ⑥ **prm_typical の弱推定を seed 同一性から分離**（grounding weak を混ぜない）。→ plan_seeds は **structured-only・duration-free のまま不変**（migration 設計意図を保持・plan_seeds 改変なし）。

**3. raw 禁止**: structured 列のみ（duration_min/source/confidence/seed_id/user_id/timestamps）。`source_ref` は **opaque**（不透明 ID・raw 本文でない）。**read path の allowed columns に source_ref を載せない**（DurationEvidence は `{seedRef,durationMin,source,confidence}` のみ・source_ref は audit 専用）→ Complete projection 到達不能。

**4. source 別 priority / conflict**: priority `seed_explicit(3) > correction(2) > prm_typical(1)`（enrich `DURATION_SOURCE_PRIORITY` と一致）。grounding: seed_explicit/correction=strong 維持→候補化可 / **prm_typical=weak→候補化しない（安全床）**。**`UNIQUE(seed_id, source)`** で同 source は 1 行（新観測 upsert で置換）→ seed_explicit「やっぱり 90 分」の stale 同 priority 衝突を構造的に防ぐ。enrich の `same_priority_conflict`（→ no enrich・保守）は defense-in-depth として残す。correction 履歴学習が要れば別 append-only log（本 store 範囲外・将来）。

**5. RLS**: owner-only（`auth.uid() = user_id`・select/insert/update/delete 各 policy）・**service_role 非前提**。seed_id FK（plan_seeds も owner-only）と二重防御。

**6. retention / expiry**: prm_typical=短命（弱推定・typicalDuration から再算出可・seed 失効 or 短 TTL で expire）/ correction=長命（明示 feedback）/ seed_explicit=seed 寿命に従属。seed DELETE→FK CASCADE で evidence 削除。consumed/rejected/expired seed の evidence は失効 sweep（cron・将来）で prune（`expires_at` + partial index）。

**7. indexes / constraints**: index `(user_id, seed_id)` / partial `(user_id, expires_at) WHERE expires_at IS NOT NULL`。CHECK: source / confidence / duration range。**UNIQUE(seed_id, source)**。updated_at trigger。

**8. migration 案（A1-5-3b-1・最小範囲・未実装）**: 単一追加 migration `<ts>_plan_seed_duration_evidences.sql`（`CREATE TABLE IF NOT EXISTS` + indexes + CHECK + UNIQUE + updated_at trigger + RLS ENABLE + owner-only 4 policy・raw 列なし・DROP なし）+ static/schema test（A1-5-2-2-1 と同型）。**apply は別 GO**（A1-5-3b-2・staging・A1-5-2-2-2b 同手順）。

**9. read path（design）**: A1-5-2-1/2-2-2c を踏襲。`ALLOWED_EVIDENCE_COLUMNS = [id, user_id, seed_id, duration_min, source, confidence]`（**source_ref/raw を select しない**）・`createColumnRestrictedEvidenceSource(client, bounds)`（user_id + seed_id 群 + limit clamp）→ row→DurationEvidence → A1-5-3a `assembleDurationEvidenceMap`/enrich へ。column restriction で source_ref を pipeline に持ち込まない。

**10. write path（design・未実装・A1-5-4+）**: seed_explicit=capture 時に user 明示 duration を INSERT（raw signal は capture で構造化後 **破棄**）/ prm_typical=capture 時 typicalDuration(signal)→evidence（弱）/ correction=runtime の placed seed 編集観測→evidence。各 write は **user-RLS（service_role でない）**・`UNIQUE(seed_id, source)` で upsert。

### 8.14 A1-5-3b-1 実装（landed）— plan_seed_duration_evidences migration draft（**未 apply**・CEO 2 補正反映）

A1-5-3b-1（`supabase/migrations/20260605110000_plan_seed_duration_evidences.sql`・新規・**draft / 未 apply**）:
- **§8.13 設計を migration draft 化** + **CEO 2 補正**を反映:
  - **補正1**: `duration_min` CHECK を **`> 1 AND <= 1440`**（`>=1` でなく enrich `isValidEvidenceDuration` と一致・un-adoptable 値を store しない）。
  - **補正2（owner integrity）**: **composite FK `(seed_id, user_id) REFERENCES plan_seeds(id, user_id) ON DELETE CASCADE`** で evidence.user_id≡seed.owner を **DB 制約**で強制（「自分 user_id で他人 seed 参照」を不能化）。そのため plan_seeds に **`UNIQUE(id, user_id)` を additive ALTER**（id は PK ゆえ常に充足・冪等 DO block）。
- structured-only（raw 列なし）/ source_ref opaque（read allowed columns 非搭載）/ `UNIQUE(seed_id, source)` / index `(user_id,seed_id)` + 失効 partial / updated_at trigger / RLS owner-only 4 policy（auth.uid()=user_id・**service_role 非前提**）。
- **plan_seeds（apply 済）に additive な UNIQUE 制約を ALTER で追加**する点に留意（id は PK ゆえ常に充足・非破壊）。apply は別 GO（A1-5-3b-2）。
- test(`realityPlanSeedDurationEvidencesMigration.test.ts`・**15**・static/schema): raw 列不在 / structured / duration_min `>1`(≠`>=1`) / source·confidence CHECK / UNIQUE(seed_id,source) / composite FK + plan_seeds UNIQUE(id,user_id) / RLS enabled・owner-only ×4・service_role なし / 追加のみ / trigger / source_ref opaque 固定（docs）。
- **apply / db push / reset / SQL Editor / DB read·write 0**。実 read / Supabase client / DB source factory なし。
- **しない（A1-5-3b-1 範囲外）**: migration apply / DB read·write / seed capture / PRM·correction 実接続 / runtime·UI / RealityInput 搭載 / raw parse / default duration / evidence read source / barrel export / A1-5-4。

### 8.15 A1-5-3b-2 staging apply（完了）+ A1-5-3b-3 実装（landed）— evidence DB read seam（column-restricted）

> **A1-5-3b-2**: `20260605110000_plan_seed_duration_evidences.sql` を **culcept-staging に CLI `db push` で apply 完了**（dry-run で pending=evidence migration 1 件確認後）。検証: migration history 記録 / table exists / raw 列 0 / duration_min>1 / composite FK owner integrity / RLS owner-only / plan_seeds に UNIQUE(id,user_id) 追加 / rows=0 / user-RLS smoke PASS。service_role·DB write·db reset·SQL Editor·production·remote 0。NOTICE は `DROP TRIGGER IF EXISTS` の冪等ガード正常。

A1-5-3b-3（`lib/plan/reality/integration/duration-evidence-source.ts`・新規・**barrel 非 export**・`server-only`）:
- **`createColumnRestrictedDurationEvidenceSource(client, bounds)`**: `plan_seed_duration_evidences` から **許可列のみ**読み `seedRef→DurationEvidence[]` map（= CompleteDispatchInput.durationEvidences）に変換する read seam。
  - query: `from(EVIDENCE_TABLE).select(DURATION_EVIDENCE_COLUMNS_SQL).eq("user_id",uid).in("seed_id",seedIds)[.or(expires_at 境界)].limit(clamp)`。
  - **column-restricted**（`ALLOWED_DURATION_EVIDENCE_COLUMNS=[id,user_id,seed_id,duration_min,source,confidence]`・`"*"` なし・**`source_ref`/raw を select も型も持たない**）。table 固定（`EVIDENCE_TABLE`・本ファイルのみ）。
  - **adoptable のみ surface**: `projectDurationEvidenceRowsToMap` が confidence=high ∧ range(1<分≤1440) ∧ source 妥当（A1-5-3a `toDurationEvidence`/`assembleDurationEvidenceMap` 再利用）→ low/invalid/範囲外 は **非 evidence 化**。**prm_typical(high) は map に入るが enrich で grounding=weak → 候補化しない**。
  - **bounded**（user_id + seedIds(.in) + 任意 expires_at 境界 + `MAX_DURATION_EVIDENCE_LIMIT=200` clamp・**seedIds 空→load 0**）。
- **`loadGatedDurationEvidenceMap(gate, source)`**: `evaluateSmokeGate` fail-closed（production/flag off/capability/user mismatch → {}）。
- **DI**: `DurationEvidenceUserContextClient`（from/select/eq/in/or/limit）・**createClient/service_role 非 import**（user-RLS）。
- test(`realityDurationEvidenceSource.test.ts`・**32**): column 契約 / query shape(allowed·"*"·source_ref·raw·table·bounded·clamp·expiry·seedIds空) / projection(high のみ·duration>1·invalid source·low conf·集約·raw 非出力) / pipeline(seed_explicit·correction→candidateCount>0 / prm_typical→weak→0 / 空→0) / gate×4→{} / 静的(service_role·createClient·DB write 不在·`.from(EVIDENCE_TABLE)` は本ファイルのみ·barrel 非 export)。
- user-RLS empty smoke（untracked・1回・project-pin hjcr…wc・anon+user）: source の query 形で **rowsRead=0 / mapKeys=0 / candidateCount=0 / service_role 0 / raw·secret·UUID 非出力**。
- tsc: 自ファイル **0 error**（**full tsc 0 ではない**・project baseline 1114 は無関係既存）。reality **527 tests** PASS。
- **しない（A1-5-3b-3 範囲外）**: seed capture / PRM·correction 実接続 / INSERT·UPDATE·DELETE / DB write smoke / runtime·route·UI·PlanClient / RealityInput 搭載 / generateCandidates 実配線 / raw parse / default duration / source_ref を allowed columns に / migration 追加 / barrel export / A1-5-4。

### 8.16 A1-5-4-0 capture boundary 設計 + A1-5-4a 実装（landed）— pure seed capture mapper

**A1-5-4-0 capture boundary**:
```
[raw 発話] --(抽出: LLM/parse・別段階・本 mapper の前)--> [StructuredCaptureInput（raw 破棄済・structured-only）]
   --(A1-5-4a mapper・pure)--> [PlanSeedInsertDraft + DurationEvidenceInsertDraft?]
   --(未実装 A1-5-4b: user-RLS client で atomic INSERT)--> [plan_seeds 行 + evidence 行]
```
- raw（signal/desiredAction/raw_text）は **抽出段（前）で構造化され破棄**。mapper の入力にも出力にも raw を持たない（「raw を同じ読み取り表面に置かない」を write 側でも保持）。
- source_ref は opaque（chat msg id 等・raw 本文でない）。write 後も read path allowed columns に載せない（§8.15）。
- write（INSERT）は A1-5-4b（user-RLS client・atomic seed+evidence・**要強い GO**）。

A1-5-4a（`lib/plan/reality/seed-capture-mapper.ts`・新規・pure・**barrel 非 export**）:
- **`captureToDrafts(StructuredCaptureInput) → { seedDraft, evidenceDraft }`**:
  - 入力 `StructuredCaptureInput`（seedId[caller 生成]/userId/desiredDate?/desiredTimeHint?/actionShape?/confidence/source/capturedAt/expiresAt?/sourceRef? opaque/**explicitDuration?{durationMin,confidence}**）。**raw を型に持たない**。
  - `PlanSeedInsertDraft`: plan_seeds structured-only 行（id/user_id/desired_date/desired_time_hint/action_shape/confidence/status='active'/source/captured_at/expires_at/source_ref）。**raw 列なし**。
  - `DurationEvidenceInsertDraft | null`: explicitDuration が **あり∧妥当(1<分≤1440)∧high** の時だけ seed_explicit 1 件（A1-5-3a `seedExplicitToEvidence` で range 検証）。なければ null（**default duration を置かない**・low/invalid/なし→なし）。prm_typical は **ここで作らない**。
- **DB INSERT/read 0・Supabase client/`.from`/service_role 0・raw parse/LLM 0・default duration 0**。id/時刻は caller 提供（pure・deterministic）。
- **candidateCount 実証**（既存 projection 再利用）: drafts → `projectSeedRowsToPlacements` / `projectDurationEvidenceRowsToMap`(§8.15) → enrich → generateComplete:
  - **seed_explicit（高・妥当）→ candidateCount>0**（capture→candidate を fixture で実証）/ **duration なし → candidateCount=0**。
- test(`realitySeedCaptureMapper.test.ts`・**17**): seed draft(structured-only/null 既定/raw 型不在@ts-expect-error) / evidence draft(seed_explicit のみ/なし/invalid/low→なし/schema 一致) / source_ref opaque 透過 / raw 非出力 / pipeline candidateCount>0・=0 / 静的(Supabase·`.from`·service_role·DB write·raw parse·default 不在·barrel 非 export)。
- tsc: 自ファイル **0 error**（**full tsc 0 ではない**・project baseline 1114 は無関係既存）。reality **544 tests** PASS。
- **しない（A1-5-4a 範囲外）**: 実 capture / DB INSERT / raw parse / LLM / Supabase client / PRM·correction 実接続 / runtime·route·UI·PlanClient / RealityInput 搭載 / generateCandidates 実配線 / default duration / evidence store migration / raw store / barrel export / A1-5-4b。

### 8.17 A1-5-4b-0/1 実装（landed）— structured capture write seam skeleton（fake/no-run・実 DB write なし）

**A1-5-4b-0 atomicity 設計**: plan_seeds + plan_seed_duration_evidences は **atomic（両方 or どちらも書かない）** に書く。
- composite FK が **orphan evidence を既に防ぐ**（evidence は seed 必須）→ 残る partial 危険は「seed 成功・evidence 失敗→明示 duration 喪失（degraded）」のみ。
- **推奨: atomic RPC**（既存 `create_external_anchor_bundle`〔20260519/companions〕同型・SECURITY INVOKER・owner 検証・1 transaction で seed→evidence INSERT）。real client は RPC を 1 回呼ぶ。**RPC 作成は A1-5-4b migration（未実装・別 GO）**。
- skeleton は **単一 `writeCapture(payload)` 契約**で atomicity を interface 強制（seed だけ/evidence だけの分割呼びを作らない）。

A1-5-4b-1（`lib/plan/reality/integration/capture-write-repository.ts`・新規・**barrel 非 export**・`server-only`）:
- **`writeStructuredCapture(drafts, client)`**: `CaptureDrafts`(A1-5-4a) → `CaptureWritePayload`{seed, evidence|null} を組み立て、**consistency 検証**（evidence あれば owner 一致 + seed linkage）→ 不整合は write 前 reject（owner_mismatch / seed_link_mismatch・composite FK 担保前の fail-fast）→ `client.writeCapture(payload)`（atomic）。
- **DI `CaptureWriteClient`**（`writeCapture(payload)→outcome`・real は A1-5-4b の RPC client）。`buildCaptureWritePayload`（draft→payload・raw なし）。
- **fake/no-run client**: `createFakeCaptureWriteClient`（payload 記録・**DB write 0**・shape 検証用）/ `createNoRunCaptureWriteClient`（no_run 返す・**実 DB 接続 0**）。
- payload は **structured-only**（plan_seeds 11 列 / evidence 6 列・**raw なし**・source_ref opaque）。**Supabase client/`.from().insert()`/service_role 0・実 DB INSERT 0**。
- test(`realityCaptureWriteRepository.test.ts`・**17**): payload shape(seed/evidence structured-only・raw 0・source_ref opaque) / evidence 有無(なし→seed のみ・あり→seed_explicit・invalid→なし) / user_id 一致・seed linkage / atomic(seed+evidence を 1 payload・fake DB write 0・no_run 実 DB 0・owner_mismatch/seed_link_mismatch は write されない) / 静的(Supabase·`.from`·`.insert`·service_role 不在・barrel 非 export)。
- tsc: 自ファイル **0 error**（**full tsc 0 ではない**・project baseline 1114 は無関係既存）。reality **561 tests** PASS。
- **しない（A1-5-4b-0/1 範囲外）**: 実 DB INSERT / staging write / Supabase client 実接続 / RPC 作成 migration / DB function / raw parse / seed capture runtime / route·UI·PlanClient / PRM·correction 実接続 / RealityInput 搭載 / generateCandidates / default duration / raw store / barrel export / A1-5-4b real write / A1-5-5+。

### 8.18 A1-5-4b-2 実装（landed）— atomic capture RPC migration draft（**未 apply**）

A1-5-4b-2（`supabase/migrations/20260605120000_create_plan_seed_capture_bundle.sql`・新規・**draft / 未 apply**）:
- **`create_plan_seed_capture_bundle(p_user_id UUID, p_seed JSONB, p_evidence JSONB DEFAULT NULL) RETURNS JSONB`**: A1-5-4b-1 write seam が将来呼ぶ DB 関数。**plpgsql=1 transaction** で plan_seeds 1 行 + 任意 evidence 1 行を **atomic INSERT**（evidence/guard 失敗で seed も rollback・partial write 防止）。`create_external_anchor_bundle` 同型。
- **SECURITY INVOKER**・認可 `auth.uid() IS NULL OR auth.uid() <> p_user_id → unauthorized`・**service_role 非前提**。
- **raw 引数なし**: p_seed/p_evidence の jsonb から **structured フィールドのみ抽出**（signal/desired_action/raw_text/title/location を引数にもテーブルにも入れない）。source_ref は opaque text 透過。
- evidence guard（既存 table CHECK と一致・関数内二重）: **duration_min > 1 AND <= 1440** / source IN(seed_explicit/correction/prm_typical) / confidence IN(high/low) / **owner 整合 evidence.user_id=p_user_id** / **seed linkage evidence.seed_id=挿入 seed id**。
- **REVOKE ALL FROM PUBLIC / GRANT EXECUTE TO authenticated**。CREATE OR REPLACE（冪等）・**DROP/destructive なし**。
- test(`realityCaptureBundleRpcMigration.test.ts`・**16**・static): raw 引数/列不在 / SECURITY INVOKER / auth.uid()・p_user_id=auth.uid() / INSERT plan_seeds + optional INSERT evidence（同一 function）/ duration_min>1≤1440 / source·confidence·owner·linkage guard / REVOKE PUBLIC・GRANT authenticated / DROP·destructive 不在。
- **apply / db push / reset / SQL Editor / 実 DB INSERT 0**。plan_seeds / plan_seed_duration_evidences は適用済前提。apply は別 GO（A1-5-4b real・staging）。
- **しない（A1-5-4b-2 範囲外）**: migration apply / 実 DB write / Supabase client 実接続 / raw parse / seed capture runtime / route·UI / PRM·correction 実接続 / RealityInput 搭載 / default duration / A1-5-4b real write / A1-5-5+。

### 8.19 A1-5-4b-2-fix 実装（landed）— capture RPC hardening（schema 修飾 + SET search_path・未 apply）

A1-5-4b-2-fix（`20260605120000_create_plan_seed_capture_bundle.sql` の最小 hardening・**未 apply**・§8.18 の 5-lens adversarial 検証で検出した非 blocking 2 件を apply 前に解消）:
- **`SET search_path = pg_catalog, public`** を SECURITY INVOKER に追加（解決を pin・Supabase `function_search_path_mutable` linter 解消・最新 RPC `sr_shift_import_rpc` 規約とパリティ）。
- **schema 修飾 `public.`**: `public.create_plan_seed_capture_bundle`（CREATE/REVOKE/GRANT/COMMENT 全署名）/ `public.plan_seeds`（%ROWTYPE + INSERT）/ `public.plan_seed_duration_evidences`（%ROWTYPE + INSERT）。
- **非挙動変更**（git diff で hardening 差分のみを検証）: auth/atomicity/raw-free/owner-linkage/guard ロジックは schema 修飾以外 byte 同一。built-in（gen_random_uuid/NOW/jsonb_*）は pg_catalog・auth.uid() は auth 修飾で pinned search_path 下も解決（config PG17 native）。object identity は pre-hardening と同一（plan_seeds/evidence は public 作成）。
- **adversarial 検証**: hardening 前 5-lens（security/atomicity/raw/constraint/apply）全 PASS・blocking 0 / hardening 後 2-lens 再検証（完全性·lint + 非退行）全 PASS・全 note・blocking/warning 0。
- test(`realityCaptureBundleRpcMigration.test.ts`・**18**・+2): SET search_path / function·table の public. 修飾を追加・INSERT assertion を public. 形に更新。
- tsc 自ファイル **0 error**（**full tsc 0 ではない**・project baseline 1114）。reality **579 tests** PASS。**apply/db push/RPC 実行/実 DB write 0**。
- **しない（A1-5-4b-2-fix 範囲外）**: staging apply / RPC 実行 / 実 DB write / confidence::real の NULLIF 追加（別判断）/ runtime / remote / A1-5-4b-3。

### 8.20 A1-5-4b-3 staging apply（完了）+ A1-5-4b-4 実装（landed）— RPC client adapter skeleton

> **A1-5-4b-3**: hardened `create_plan_seed_capture_bundle` を **culcept-staging に CLI `db push` で apply 完了**（dry-run pending=RPC migration 1 件確認後・NOTICE なし）。function exists / SECURITY INVOKER / SET search_path / public 修飾 / auth·owner check / raw 引数 0 / REVOKE PUBLIC·GRANT authenticated は static 18 tests + adversarial 5+2 lens + apply 成功で保証。RPC 実行 0 / 実 DB INSERT 0 / db reset 0 / SQL Editor 0 / production 0 / remote 0。

A1-5-4b-4（`lib/plan/reality/integration/capture-rpc-adapter.ts`・新規・**barrel 非 export**・`server-only`）:
- **`createRpcCaptureWriteClient(rpcClient) → CaptureWriteClient`**: A1-5-4b-1 の `CaptureWriteClient` 契約を staging 適用済 atomic RPC への **単一 `.rpc(CAPTURE_RPC_NAME, {p_user_id,p_seed,p_evidence})`** で実装。`writeStructuredCapture(drafts, client)` の **下**に合成（owner/linkage reject は seam が adapter 前に完了）。
  - `buildCaptureRpcArgs(payload)`: `{p_user_id=seed.user_id, p_seed=draft, p_evidence=draft|null}`（**structured-only・raw なし**・source_ref opaque）。
  - **seed + evidence を 1 回の RPC call** に集約（atomic・関数側 1 transaction）。失敗分類: error なし→ok / `error.code='no_run'`→no_run / それ以外→write_failed。
  - **DI `RpcCapableClient`**（`.rpc` のみ）・**createClient/@supabase 非 import**（注入）。real Supabase client は A1-5-4b real（別 GO）。
- **fake/no-run RPC client**: `createFakeRpcClient`（`.rpc` call 記録・**DB write 0**・失敗注入可）/ `createNoRunRpcClient`（no_run・**実 DB 接続 0・実 RPC 実行 0**）。
- test(`realityCaptureRpcAdapter.test.ts`・**15**): RPC 名 / args(p_user_id·p_seed·p_evidence) / p_seed·p_evidence structured-only / raw 0 / source_ref opaque / **seed+evidence を 1 call** / evidence なし→p_evidence null / owner·linkage mismatch は RPC 前 reject(call 0) / RPC error→write_failed / no-run→no_run / 静的(createClient·@supabase·.from·.insert·service_role 不在・barrel 非 export)。
- tsc 自ファイル **0 error**（**full tsc 0 ではない**・project baseline 1114）。reality **594 tests** PASS。**実 RPC 実行 / 実 DB write / createClient 0**。
- **しない（A1-5-4b-4 範囲外）**: 実 RPC 実行 / 実 DB INSERT / DB write smoke / Supabase createClient / staging write / seed capture runtime / runtime·route·UI / PRM·correction 実接続 / RealityInput 搭載 / raw parse / A1-5-4b real write / A1-5-5+。

### 8.21 A1-5-4b-5（完了）— staging real RPC write smoke（初回 実 DB write・cleanup 済）

> **初回の実 DB write 境界**（別 GO・CEO 承認）。runtime/capture/UI 接続なし。CEO user-RLS（anon+user・service_role なし）で synthetic structured input を **1 件だけ** RPC に通し、即 cleanup。
- preflight: main HEAD 4cd4f5d8 / staging pin(hjcr…wc) / **user.id === CEO id 検証**（不一致なら write 前 abort）/ cleanup 構造的保証（plan_seeds owner DELETE policy + evidence FK **ON DELETE CASCADE**）。
- no-run payload: p_seed structured-only(11) / p_evidence structured-only(6) / duration 60(>1≤1440) / source=seed_explicit / confidence=high / source_ref opaque(smoke id) / **raw_in_payload=false**。
- **real RPC write**: owner/linkage 検証 → `.rpc(create_plan_seed_capture_bundle, {p_user_id,p_seed,p_evidence})` を **1 回だけ**（rpcCallCount=1・atomic）→ rpcOk。fresh UUID seedId（衝突なし）。
- **read 確認**（read seam allowed cols・source_ref/raw 非搭載）: plan_seeds **rowsRead=1** + evidence **rowsRead=1**（atomic 作成）。
- **candidateCount>0 を実 DB row で実証**: 読んだ**実 row（fixture でない）**を実 pipeline（projectSeedRowsToPlacements + projectDurationEvidenceRowsToMap + enrich + generateComplete）に通し → durationMin=60 / durationSource=seed_explicit / grounding=strong / **candidate 1**。
- **cleanup**: seed を owner delete → evidence FK cascade → **plan_seeds 0 / evidence 0** 確認（cleanupOk）。staging 復元。
- **service_role 0 / raw·secret·UUID 出力 0 / committed code 0**（harness/vitest は untracked・実行後削除・痕跡なし）/ production 0 / db reset·SQL Editor 0 / remote 0 / 複数 row write なし。
- → **capture 全経路（mapper→write seam→RPC adapter→実 atomic RPC→実 atomic INSERT→read seam→enrich→candidate）が実 staging で end-to-end 実証**。runtime/capture 配線前の最終 de-risk 完了。

### 8.22 A1-5-4c-0/1 実装（landed）— Structured Capture Intake Guard（pure・fail-closed・raw 遮断）

**A1-5-4c-0 intake boundary**: [raw 発話] →(extractor: LLM/parse・別段階・未接続)→ [ExtractorStructuredOutput(structured・untrusted)] →(**intake guard・pure・fail-closed**)→ [StructuredCaptureInput] →(captureToDrafts A1-5-4a)→ ...
- raw 発話 / LLM 生出力が DB / Complete path に入らない **最後の防壁**。

A1-5-4c-1（`lib/plan/reality/seed-capture-intake.ts`・新規・pure・**barrel 非 export**）:
- **`buildStructuredCaptureInput(seedId, userId, capturedAt, extracted: unknown) → IntakeResult`**: extractor structured 出力（untrusted）を検証 → `StructuredCaptureInput`。**fail-closed**（reject・strip でない）。
  - **raw 遮断**: `FORBIDDEN_INTAKE_FIELDS`（signal/desiredAction/desired_action/raw_text/title/location/**prompt**/**transcript**）が 1 つでも在れば reject（hasOwnProperty・undefined 値でも catch）。
  - **explicit allowlist 再構築**（spread 不使用）→ 未知/raw/proto-pollution key は出力に**複写されない**。
  - **seedId/userId/capturedAt は caller/server 注入**（extracted 由来無視）。
  - validation: desiredDate(実在 YYYY-MM-DD) / desiredTimeHint(4) / actionShape(8・型付き set) / confidence(0..1 数値) / source(chat/manual) / **source_ref opaque(id 形 ≤64・空白/unicode/長文 reject)** / explicitDuration(`isValidEvidenceDuration` 1<分≤1440 + confidence high/low)。strict typeof（boxed/coercion 拒否）。
  - low confidence explicitDuration は通すが下流 mapper で evidence 化されない。
- **adversarial probe（2-lens・raw-bypass + validation-gap）**: 実 guard を tsx import + 46,662 date brute-force で検証 → **全 PASS・blocking 0**。raw に airtight（allowlist 再構築）。検出 note 2 件のうち source_ref 長さを **128→64 に tighten**（rawっぽい dashed 長文を reject）。source_ref は read seam/Complete projection から **firewall 済**（defense-in-depth）。
- **candidateCount 実証**（intake→captureToDrafts→projection→enrich→generateComplete）: valid+explicitDuration high → **candidateCount>0** / duration なし or low → **0**。
- test(`realitySeedCaptureIntake.test.ts`・**21**): valid build / 外部注入 / not_object / raw field×8 reject / date·time_hint·action_shape·confidence·source·source_ref·explicit reject / explicit 経路 / pipeline candidateCount>0·=0 / 静的(DB·RPC·Supabase·LLM·server-only 不在・barrel 非 export)。
- tsc 自ファイル **0 error**（**full tsc 0 ではない**・project baseline 1114）。reality **615 tests** PASS。**raw parse/LLM/DB read·write/runtime 0**。
- **しない（A1-5-4c-0/1 範囲外）**: raw 発話 parse / LLM 実接続 / prompt 実装 / DB INSERT / DB write smoke / Supabase client / runtime·route·UI / RealityInput 搭載 / generateCandidates runtime / PRM·correction 実接続 / default duration / raw store / A1-5-5 runtime。

> A1-5-0…§8.21 / **A1-5-4c-0/1 Structured Capture Intake Guard（landed・§8.22・pure・fail-closed・raw 8 field 遮断・allowlist 再構築・source_ref opaque ≤64・adversarial probe 全 PASS・21 tests）**。**capture 全経路（intake guard→mapper→write seam→RPC adapter→実 atomic RPC→atomic INSERT→read seam→enrich→candidate）が pure/fixture + 実 staging で実証済**。次は seed capture runtime（実 capture: chat→抽出 LLM→intake guard→`writeStructuredCapture` 接続）/ PRM·correction 実接続 / runtime·UI を各別 GO（**LLM/runtime/実 write 接続は必ず別 GO で停止**）。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration を全段で維持する。
