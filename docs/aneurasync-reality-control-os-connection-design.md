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

### 8.23 A1-5-4d-0/1 実装（landed）— Structured Capture Orchestrator Skeleton（DI・no-run・raw 端から端まで遮断）

**A1-5-4d-0 orchestration boundary**: [raw 発話] →(extractor: LLM/parse・別段階・未接続)→ [ExtractorStructuredOutput(structured・**untrusted**)] →(**本 orchestrator**: ①intake guard fail-closed → ②captureToDrafts pure → ③writeStructuredCapture DI atomic)→ [StructuredCapturePipelineResult(stage 付き・raw なし)]
- A1-5-4 の 3 部品（intake guard §8.22 / mapper §8.16 / write seam §8.16-17）を **1 本の no-run pipeline** に束ねる配線層。**A1-5-5 は本 orchestrator のロジックを変えず**、実抽出器の structured 出力と実 client（`createRpcCaptureWriteClient(実 Supabase)`）を注入するだけで runtime 化できる。

A1-5-4d-1（`lib/plan/reality/integration/structured-capture-orchestrator.ts`・新規・**barrel 非 export**・`server-only`）:
- **`runStructuredCapturePipeline(input, client) → StructuredCapturePipelineResult`**: untrusted structured output を intake guard→draft→write seam に通す。
  - input: `{seedId, userId, capturedAt, extracted: unknown}`。**extracted は untrusted structured output（raw 発話でない）**・seedId/userId/capturedAt は **caller/server 注入**。
  - client は **DI `CaptureWriteClient`**（fake/no-run のみ）。orchestrator 内で **実 client を構築しない**（createClient なし・実 RPC/実 DB write なし）。real client 注入は A1-5-5（別 GO）。
  - **fail-closed**: intake reject → **write を呼ばない**（raw/不正 structured → write 0）。
  - result（**stage 判別共用体・raw なし**）: ok:true(stage=write・`wroteEvidence` で duration 有無) / ok:false stage=write(no_run/write_failed/owner_mismatch/seed_link_mismatch) / ok:false stage=intake(raw_field_present 等・**write 未呼出**)。
- **owner/linkage は構造的に整合**: mapper が単一 input から seed/evidence 両 draft を導出 → orchestrator 経由で mismatch を**生成不能**（「mismatch→write 0」は vacuously 成立）。write seam の owner_mismatch/seed_link_mismatch guard は defense-in-depth（§8.16-17・A1-5-4b-1/4 実証済）。
- **raw firewall end-to-end**: raw 混入 → intake reject → write 0・raw 値が結果に出ない。valid path の RPC args JSON に raw field 名 0。source_ref は opaque のまま payload 保持。
- test(`realityStructuredCaptureOrchestrator.test.ts`・**19**): valid path(fake・write 1 回 / high→seed+evidence / none→seed のみ / low→evidence 化されず / server 注入で id·時刻偽装無視) / RPC-backed path(.rpc 1 回 structured-only・CAPTURE_RPC_NAME / no-run→no_run / error→write_failed) / fail-closed(raw 8 種→write 0・raw 値非漏出 / 不正 structured 8 例→write 0 / not_object→write 0) / raw firewall(RPC args raw 名 0 / source_ref opaque) / owner·linkage 構造的不変 / 静的(createClient·@supabase·.from·.rpc·.insert·.update·.delete·.upsert·service_role·openai·anthropic·completion 不在・server-only 宣言・barrel 非 export)。
- tsc 自ファイル **0 error**（**full tsc 0 ではない**・project baseline 1114）。reality **634 tests** PASS。**実 RPC 実行/実 DB write/createClient/LLM/runtime 0**。
- **しない（A1-5-4d-0/1 範囲外）**: 実 LLM 抽出 / prompt / 実 RPC 実行 / 実 DB INSERT / Supabase createClient / seed capture runtime / runtime·route·UI·PlanClient / RealityInput 搭載 / generateCandidates runtime / PRM·correction 実接続 / default duration / raw store / remote·PR / A1-5-5 runtime。

### 8.24 A1-5-4d-2 実装（完了）— staging real orchestrator smoke（orchestrator 経由 end-to-end 実 write・cleanup 済）

> **orchestrator 経由の初回 実 DB write**（別 GO・CEO 承認・untracked harness・実行後削除・committed code 変更なし）。runtime/LLM/capture 接続なし。A1-5-4b-5（RPC adapter 単体 smoke）に続き、**`runStructuredCapturePipeline` 経由でも実 staging で 1 本通ることを実証**。

- **ref authority 確定（CEO + canonical 一致）**: `aljavfujeqcwnqryjmhl`=**production** / `hjcrvndumgiovyfdacwc`=**culcept-staging**（`lib/plan/shift/devFixtureHost.ts`・`tests/unit/coalter/supabaseRefCanon.test.ts`・`.canary-trigger.json` と一致）。**migration integrity**: staging に reality 3 migration（plan_seeds/evidence/RPC）存在・production には不在（CEO dashboard 確認）。
- **harness 安全（コード強制）**: project ref **hjcr hard-pin**（URL は検証済 REF から構築・env 重複行非依存）＋ **aljav production hard-denylist**＋ anon に service_role 混入で fatal＋ account=**STAGING_USER_A**（**self-pin**: requested===signed-in id）。`scripts/reality-real-read-smoke.ts` は**使わない**（後述 denylist 反転バグ回避）。preflight guard 1 つでも失敗で write 前 abort。
- **orchestrator 実行**: `runStructuredCapturePipeline({seedId: fresh UUID, userId: signed-in id, capturedAt, extracted: synthetic structured（raw 0・duration 60 high・source_ref opaque）}, createRpcCaptureWriteClient(counting anon client))` → **RPC call=1** / result ok / code=ok / wroteEvidence=true。
- **read seam（allowed cols・source_ref/raw 非 select）**: plan_seeds **1** + evidence **1**（atomic 作成）→ 実 row → 実 pipeline（projectSeedRowsToPlacements + projectDurationEvidenceRowsToMap + enrich + generateComplete）→ **candidateCount>0**（durationMin=60/seed_explicit/grounding strong/candidate 1）。
- **cleanup（finally で必ず実行）**: seed owner delete → evidence FK **ON DELETE CASCADE** → **plan_seeds 0 / evidence 0** 確認。
- service_role 0 / raw·secret·UUID 出力 0 / production 接触 0 / db push·reset·SQL Editor·migration repair 0 / remote 0 / 複数 row write なし / committed code 変更 0。
- **A1-5-ref-fix（完了・2026-06-05・code-only）**: `scripts/reality-real-read-smoke.ts` の `PROD_REF_DENYLIST` 反転バグ（staging を production 誤ラベル・実 production aljav 素通し）を修正 — canonical 定数（`lib/plan/shift/devFixtureHost` の `PRODUCTION_PROJECT_REF`/`STAGING_PROJECT_REF`）に**単一ソース化**＋ staging allowlist の positive guard 追加（再反転を構造的に防止・回帰 test 9）。**残（別 GO）**: CLI link（`supabase/.temp/project-ref`=aljav=prod）の hazard（将来 bare `db push`/`reset` は production に当たる・要 re-link or `--project-ref` 明示）。

### 8.25 A1-5-5-0 設計（doc-only）— structured capture pipeline の runtime 接続設計（実 LLM/runtime/DB write なし）

完成した capture pipeline（intake guard §8.22 → mapper §8.16 → write seam §8.17 → RPC adapter §8.20 → orchestrator §8.23・staging 実証 §8.21/§8.24）を**将来どこに/どう runtime 接続するか**の設計。**本節は設計のみ**（実 LLM 接続/runtime 接続/route 変更/DB write なし）。既存資産を最大限再利用する: `evaluateSmokeGate`（§dev-runtime・多層 fail-closed gate）/ `PLAN_FLAGS`（`lib/plan/featureFlags.ts`・default false・server-side のみ・`canaryUserIds`・`realityCompleteShadow`）/ A1-5-ref-fix の canonical ref 定数（`devFixtureHost`: STAGING=hjcr / PRODUCTION=aljav）/ shift VLM 抽出パターン（`lib/plan/shift/shiftExtractionContract.ts` `validateExtractedCells` + `draftExtractionGeminiAdapterCore.ts` env-free adapter・raw 非保存）。

**8.25.0 全体境界（raw → 候補）**:
```
[raw 発話]（chat route・既存 stargazer_alter_dialogues に既保存）
  → [capture gate]（production hard block / staging-only / flag / canary / kill）         ← A1-5-5a
  → [extractor(LLM)] raw → ExtractorStructuredOutput | null（raw 破棄・raw 非保存）        ← A1-5-5d（実 LLM・別 GO）
  → [extractor contract validation] validateExtractorOutput（defensive・non-throwing）     ← A1-5-5b
  → [intake guard] buildStructuredCaptureInput（fail-closed・raw 8 field reject・allowlist 再構築） ← 既存 §8.22
  → [orchestrator] runStructuredCapturePipeline（intake→mapper→write seam→RPC・atomic）   ← 既存 §8.23
  → [RPC write] create_plan_seed_capture_bundle（SECURITY INVOKER・auth.uid===p_user_id・anon・atomic）← 既存 §8.18
  → [read seam] column-restricted（source_ref/raw 非 select）→ candidateCount             ← 既存 §8.11/§8.15
```
raw は extractor の入力でのみ存在。以降は structured-only。

**8.25.1 ① runtime 接続先 比較**:
| 接続先 | 特性 | risk | 接続順 |
|---|---|---|---|
| `app/api/alter-morning/plan/route.ts` | flag 済（`ALTER_MORNING_V2_ROUTE_ENABLED` default OFF）・`{utterance}` 入力・`runMorningPipeline` 委譲・plan 整合・低トラフィック | 中（最低） | **最初**（A1-5-5g・observe→write） |
| `app/api/stargazer/alter/route.ts` | 常時 live・高トラフィック・raw が自然に存在・user-facing | 高 | **最後**（A1-5-5h・広面・production guard） |
| shadow/dev runtime（`dev-runtime-smoke`） | dev-only・gated・redacted・**read 専用（raw 発話なし）** | 低 | 接続先でなく **staging smoke の vehicle**（A1-5-5e/f） |
| plan action route（/plan server actions） | 構造化操作（free-text 意図でない）＝ seed の producer でない（candidate consumer） | — | **非対象** |
→ 推奨: **alter-morning/plan を最初**（flag 済・utterance ベース・pipeline 構造・低リスク・意味整合「朝の意図＝seed」）。**observe mode 先行**。stargazer/alter は広面ゆえ最後。shadow/dev は smoke 用。

**8.25.2 ② feature flag / kill switch / production guard**:
- canonical home: `PLAN_FLAGS.realityCaptureLive`（env `REALITY_CAPTURE_LIVE`・**default false・server-side のみ・NEXT_PUBLIC なし**・`realityCompleteShadow` の sibling）。
- **production hard block**: `evaluateCaptureGate`（`evaluateSmokeGate` 同型）で **nodeEnv !== "production"** ∧ **SUPABASE_URL host ref === STAGING_PROJECT_REF(hjcr)** ∧ **∉ [PRODUCTION_PROJECT_REF(aljav)]**（A1-5-ref-fix canonical 定数再利用）。= flag + project-ref allowlist の二重。
- **staging only**: project-ref allowlist = `[STAGING_PROJECT_REF]`。
- **canary**: `PLAN_FLAGS.canaryUserIds`（既存 `PLAN_CANARY_USER_IDS`）。capture は allowlist user のみ。
- **emergency off**: flag を false（即時 fail-closed）+ `REALITY_CAPTURE_KILL === "true"` で live flag より優先して force off。
- 全条件未充足 → **no-op（write 0）**（fail-closed）。

**8.25.3 ③ raw boundary**:
- raw 発話は chat route + 既存 dialogues store のみ。capture は extractor 入力でのみ raw を受け、**抽出後 raw 破棄**。
- extractor output は **必ず intake guard を通す**（raw field reject・allowlist 再構築）。= 二段検証（extractor contract validation → intake guard）。
- source_ref は opaque（chat msg id・raw 本文でない）・read seam/Complete から firewall 済。
- raw を plan_seeds/evidence 列にも Complete projection にも入れない。**新 raw store（plan_seed_sources 等）を作らない**。

**8.25.4 ④ LLM extraction boundary**:
- shift VLM パターンを mirror: extractor = **env-free adapter core**（config DI・process.env 非依存）。`SeedExtractor { extract(input): Promise<ExtractorStructuredOutput | null> }`。
- `validateExtractorOutput(raw: unknown)`（defensive・**non-throwing**・raw response 非保存・safe error）→ validated → intake guard。
- 失敗（null / validation error / 意図検出なし）→ **no-op**（chat には fail-open＝chat 応答を壊さない / write には fail-closed＝書かない）。
- A1-5-5a/b/c は **fake extractor**。実 LLM は A1-5-5d（別 GO）。prompt/schema（`seedExtractionPrompt.ts`）も A1-5-5d。

**8.25.5 ⑤ write boundary**:
- RPC write は **orchestrator 経由のみ**（`runStructuredCapturePipeline` + `createRpcCaptureWriteClient`）。
- **direct `.from("plan_seeds").insert` 禁止**（runtime に存在しないことを static guard test で固定）。
- **service_role 禁止**（anon + user-RLS・RPC は SECURITY INVOKER・auth.uid===p_user_id）。atomic（seed+evidence or neither）。

**8.25.6 ⑥ observability**（redacted・raw なし・UUID マスク・secret なし）:
- outcome: `captured / intake_rejected / extraction_null / gate_blocked / write_failed`（+ gateCode / intakeReason / wroteEvidence / candidateWouldGenerate）。
- candidateCount: observe mode で「書いたら候補化するか」を **write せず**計算。
- write attempted/skipped: gate 判定 + write 試行有無。
- cleanup/rollback: RPC atomic（partial なし）。runtime capture は永続（auto-cleanup なし）。rollback = status/expires_at で stale seed を expire（hard delete でない）+ kill switch で新規停止。staging smoke は owner-delete + FK cascade（§8.24 実証）。`assertRedacted`（redaction-guard）を summary に適用。

**8.25.7 ⑦ staging smoke 方針**:
- runtime 接続前（fake/no-run・unit）: gate fail-closed（production/flag/staging/canary/kill）/ fake extractor → structured → intake → orchestrator(fake) → result / null → no-op / raw → intake reject / capture service end-to-end DI fake。
- 接続後の最初の staging smoke: **(1) observe mode**（実 extractor・**write OFF**）＝実 LLM が synthetic/dev utterance を抽出 → intake → 候補化するかを redacted 観測（write 0・extractor 品質を write 前に de-risk）。**(2) real capture**（実 extractor + 実 write・1 回・cleanup）＝§8.24 同型 + 実 extractor・staging-pin・canary user・single・read-back candidate・cleanup→0。

**8.25.8 ⑧ A1-5-5a 推奨 + phasing**:
- **推奨 A1-5-5a = Capture Gate skeleton（pure/no-run）**: `PLAN_FLAGS.realityCaptureLive` + `evaluateCaptureGate(g)`（`evaluateSmokeGate` 同型 + project-ref allowlist[STAGING] + canary allowlist + kill）。fail-closed・no-op・production hard block。**unit tests のみ**（extractor/service/route/LLM/DB なし）。
  - 理由: 最も narrow + **安全 primitive 先行**（production 誤 write / 常時 capture を構造的に封じる）。canonical 定数 + `evaluateSmokeGate` + `canaryUserIds` を再利用。以降の全 slice が **gated by construction**。
- phasing（各別 GO・LLM/runtime/実 write は必ず別 GO）: **A1-5-5a** Capture Gate（pure）→ **A1-5-5b** Extractor Contract（pure・`SeedExtractor`+`validateExtractorOutput`+fake・intake 必須）→ **A1-5-5c** Capture Service（no-run・DI: gate→extractor→intake→orchestrator・route 未接続・redacted obs）→ **A1-5-5d** 実 LLM extractor adapter（shift VLM mirror・env-free・fake-network test・route 未接続）→ **A1-5-5e** observe mode staging smoke（実 extractor・write OFF）→ **A1-5-5f** real capture staging smoke（実 extractor + 実 write・1 回・cleanup）→ **A1-5-5g** alter-morning/plan route 接続（flag+canary+staging・observe→write）→ **A1-5-5h** stargazer/alter chat route（広面・flag+canary+production guard）。

### 8.26 A1-5-5a 実装（landed）— Capture Live Gate（pure・no-run・fail-closed・barrel 非 export）

A1-5-5a（runtime 接続前の安全 primitive・**以降の全 capture slice が必ず通る gate**）:
- **flag**（`lib/plan/featureFlags.ts`・server-side のみ・default false）: `PLAN_FLAGS.realityCaptureLive`（env `REALITY_CAPTURE_LIVE`）+ `realityCaptureKill`（env `REALITY_CAPTURE_KILL`・kill switch）。
- **`lib/plan/reality/capture-gate.ts`**（新規・**pure**・barrel 非 export）:
  - `evaluateCaptureGate(input) → CaptureGateVerdict`（pure・**fail-closed**・9 層・reason code 付き）。`evaluateSmokeGate` 同型。入力は全注入（process.env 内部読取なし・Supabase client なし）。
  - `refFromSupabaseUrl(url)`: host から project ref（20 文字）抽出（`new URL`・**Supabase client でない**）・未設定/不正/非 supabase host → null。
  - canonical refs を **`devFixtureHost`（A1-5-ref-fix 単一ソース）** から import: `CAPTURE_STAGING_REF_ALLOWLIST=[hjcr]` / `CAPTURE_PROD_REF_DENYLIST=[aljav]`（**executable code に ref literal なし**）。
- **判定順（fail-closed・致命的を先に）**: ①`KILLED`（kill **最優先**・live flag 無視）→ ②`FLAG_OFF`（default false）→ ③`PRODUCTION_NODE_ENV` → ④`UNRESOLVED_PROJECT_REF`（曖昧→fail-closed）→ ⑤`PRODUCTION_PROJECT_REF`（aljav）→ ⑥`NON_STAGING_PROJECT_REF`（hjcr 以外）→ ⑦`NO_USER` → ⑧`NO_CANARY_ALLOWLIST`（空→fail-closed）→ ⑨`USER_NOT_CANARY` → **allow**。
- **allow 条件**: live on ∧ kill off ∧ nodeEnv≠production ∧ project ref=hjcr（∉aljav）∧ requestedUserId∈canary。
- test **21**（refFromSupabaseUrl / 各 block reason / allow / kill 優先 / fail-closed 曖昧 / canonical 一致 / 静的 Supabase·DB·service_role·LLM·server-only 不在・ref literal hard-code なし・barrel 非 export）+ reality **664 PASS**。
- tsc 自ファイル **0 error**（**full tsc 0 ではない**・baseline 1114）。**Supabase 0 / DB read·write 0 / runtime 0 / LLM 0 / production 挙動変更 0**（flag default false + nodeEnv=production block）。
- **しない（A1-5-5a 範囲外）**: env→input resolver / extractor / capture service / route·UI / 実 LLM / prompt / DB write / RPC / A1-5-5b 以降。

### 8.27 A1-5-5b 実装（landed）— Seed Extractor Contract（pure・no-run・barrel 非 export）

A1-5-5b（実 LLM 接続前に extractor の structured 出力契約 + validator + fake を固定）:
- **`lib/plan/reality/seed-extractor-contract.ts`**（新規・**pure**・barrel 非 export）:
  - `CaptureExtractionInput { utterance（**唯一の raw**・入力のみ・output に出さない）, nowIso, sourceRef? }`。
  - `ExtractorResult = { kind:"extracted"; raw:unknown } | { kind:"no_intent" }`（**no_intent を明示**・null 過負荷回避）。
  - `SeedExtractor { extract(input): Promise<ExtractorResult> }`（DI 契約・実 LLM は A1-5-5d）。
  - `ExtractorStructuredOutput` を intake から**再 export**（単一定義）。
  - `validateExtractorOutput(raw) → ExtractorOutputValidation`（**intake guard 単一ソース再利用**・placeholder id で field 検証流用・**non-throwing**・reason code=IntakeRejectReason・**raw 本文を出力に含めない**・allowlist 再構築で未知 key 破棄）。`ValidatedExtractorOutput = Omit<StructuredCaptureInput, seedId|userId|capturedAt|expiresAt>`。
  - fake: `createExtractedFakeExtractor(raw)` / `createNoIntentExtractor()`。
- **重要判断**: 検証ルールを**再実装せず intake を単一ソース再利用**（A1-5-ref-fix の drift 教訓）。「二段検証」は**同一 canonical ルールの 2 箇所呼び出し**（producer pre-check + orchestrator firewall）で実現＝独立 2 実装でない。
- **no-op 条件**: no_intent / validation reject / null·invalid raw → 呼び出し側（A1-5-5c）が no-op。
- test **17**（valid validate / raw 8 reject / invalid date·time_hint·action_shape·confidence·source·source_ref / explicitDuration 1<min≤1440 / non-throwing null·string·number·array / allowlist 再構築で未知 key 破棄 / fake valid·no_intent·invalid / intake fixture candidateCount>0·low→0·none→0 / 静的 LLM SDK·Supabase·DB·server-only 不在・barrel 非 export・再 export）+ reality **681 PASS**。
- tsc 自ファイル **0 error**（**full tsc 0 ではない**・baseline 1114）。**LLM SDK 0 / Supabase 0 / DB read·write 0 / runtime 0 / production 挙動変更 0**。
- **しない（A1-5-5b 範囲外）**: 実 LLM / prompt / adapter / capture service（5c）/ route·UI / DB write / RPC / A1-5-5c 以降。

### 8.28 A1-5-5c 実装（landed）— Capture Service Skeleton（server-only・DI・no-run・barrel 非 export）

A1-5-5c（capture の配線層・gate→extractor→validate→orchestrator を 1 本に束ねる）:
- **`lib/plan/reality/integration/capture-service.ts`**（新規・**server-only**・barrel 非 export）:
  - `runCaptureService(input, deps) → CaptureServiceResult`。
  - input: `{ gate: CaptureGateInput, extraction: CaptureExtractionInput（utterance=唯一の raw）, seedId（server UUID）, capturedAt（server 時刻） }`。userId = `gate.requestedUserId`（単一ソース）。
  - deps（DI・fake/no-run のみ）: `extractor: SeedExtractor` + `writeClient: CaptureWriteClient`。
- **呼び出し順（安全の要）**: ①`evaluateCaptureGate`（**最初**・blocked → extractor 未呼出・write 0）→ ②`extractor.extract`（gate allow 後のみ）→ ③`validateExtractorOutput`（producer pre-check・invalid → write 0）→ ④`runStructuredCapturePipeline`（intake firewall + mapper + write seam・DI client）。
- **分岐（redacted discriminated union・raw なし）**: `gate_blocked`(reason) / `no_intent` / `invalid_extraction`(reason・**field 名出さない**) / `captured`(wroteEvidence) / `intake_rejected`(reason・pre-validated ゆえ通常起きない drift signal) / `write_failed`(code)。
- **raw 非漏洩**: result は outcome + reason code + wroteEvidence のみ。raw utterance / raw field 名（signal/desiredAction/prompt/transcript）/ seedId/userId を含まない。
- test **20**（gate block 6 種 → extractor call 0 + write 0 / no_intent → write 0 / invalid → write 0 / raw field → write 0 + field 名非出力 / valid high → write 1 + wroteEvidence true / none·low → write 1 + wroteEvidence false / no-run client → write_failed(no_run) / raw 非漏洩 sentinel / captured result は {outcome,wroteEvidence} のみ / 静的 LLM SDK·Supabase·DB·service_role 不在・server-only 宣言・barrel 非 export）+ reality **701 PASS**。
- tsc 自ファイル **0 error**（**full tsc 0 ではない**・baseline 1114）。**LLM SDK 0 / Supabase 0 / DB read·write 0 / runtime 0 / production 挙動変更 0**。
- **5d は SeedExtractor を実 LLM adapter に、writeClient を実 RPC client に差すだけで runtime 化可能**（本ロジック不変）。
- **しない（A1-5-5c 範囲外）**: 実 LLM / prompt / 実 client / route·UI / DB write / RPC / A1-5-5d 以降。

### 8.29 A1-5-5d-0 設計（doc-only）— LLM Extractor Adapter Design（実 LLM/SDK/prompt/API なし）

`SeedExtractor`（§8.27）の **実 LLM 実装**の境界・prompt 方針・schema・validation・failure handling・observability を設計。**本節は設計のみ**（実 LLM/SDK import/prompt code/API call/runtime/DB なし）。mirror: shift VLM adapter（`lib/plan/shift/draftExtractionGeminiAdapterCore.ts` env-free core + `shiftExtractionPrompt.ts` pure prompt builder + schema const）。**重要差分**: shift は失敗時 **throw**（user-initiated）だが、**capture は chat と並走する background ゆえ throw 禁止 → no_intent fail-safe**（chat を壊さない）。

**8.29.1 adapter 入力**:
- `CaptureExtractionInput { utterance（**唯一の raw・adapter 入力のみ**）, nowIso（相対日付の基準）, sourceRef?（opaque chat msg id・raw 本文でない） }`（§8.27 既定）。
- **userId/seedId/capturedAt は adapter に渡さない**（capture service §8.28 が server 注入）。adapter は「何が意図されたか」のみ抽出。
- **env-free**: apiKey/model/timeoutMs/maxRetry/retryBackoffMs/fetchImpl/sleep は **config 引数**（process.env 非依存・shift mirror）。env 読取は server host（A1-5-5g）の責務。

**8.29.2 adapter 出力**:
- `ExtractorResult = { kind:"extracted"; raw } | { kind:"no_intent" }`（§8.27 既定）。
- **extracted.raw も raw 本文を返さない**: contract フィールド（confidence/source/desiredDate/desiredTimeHint/actionShape/explicitDuration）のみ。utterance/prompt/response 本文を含めない。
- **sourceRef は adapter が input から注入**（LLM 出力でなく opaque id を透過）。userId/seedId/capturedAt 非含有（server 注入）。

**8.29.3 prompt 方針**:
- prompt は **transient**（LLM 送信のみ・**永続化しない**）。LLM **response raw も永続化しない**（parse→構造化→ExtractorResult、response 本文破棄）。
- **raw を DB に保存しない**（utterance/prompt/response いずれも）。API key は header（URL/log に出さない・shift mirror）。
- prompt 構造（pure string builder・5d-1）: system 指示（発話→予定意図の構造化抽出・意図なし→no_intent）+ JSON schema（responseMimeType=application/json）+ utterance + nowIso。**prompt code は 5d-1+**。
- **failure → no_intent or invalid_extraction**: LLM error/timeout/parse-fail/空 → **no_intent**（fail-safe・throw しない）。LLM が garbage structured → extracted → service の validateExtractorOutput が reject → invalid_extraction。
- **extraction confidence 低 → no capture**: 全体 confidence < 閾値（config・例 0.5）→ adapter が **no_intent**。

**8.29.4 validation 方針**:
- LLM output は **必ず validateExtractorOutput**（§8.28 service が producer pre-check）+ **orchestrator intake が firewall**（§8.23・常時）= 二段。
- adapter 自身は validate しない（raw を返すのみ）→ **service が単一検証点**（§8.27 単一ソース方針・二重実装しない）。validator は throw しない。

**8.29.5 safety — hallucinated / explicit vs inferred duration（核心）**:
- **リスク**: LLM が duration を hallucinate（「たぶん 1 時間」）し explicit high として混入 → 誤 evidence 化 → 誤候補。
- **対策（LLM schema に durationKind）**: LLM は `duration: { durationMin, kind:"explicit"|"inferred" } | null` を返す。adapter が map:
  - `explicit`（user 明示）→ `explicitDuration:{durationMin, confidence:"high"}` → seed_explicit → **evidence（候補化）**。
  - `inferred`（LLM 推測）→ `explicitDuration:{durationMin, confidence:"low"}` → mapper が **evidence 化しない（weak）**。
  - `null` → 省略。
- adapter は **`durationKind` を strip**（contract 外・intake allowlist が落とす）= **inferred は最初から evidence 化しない**（既存 low→non-evidence 経路再利用・intake/mapper 変更不要）。
- defense-in-depth: explicit でも range（1<min≤1440）違反は validateExtractorOutput が reject。raw field 混入は reject。default duration は置かない。
- 将来（別 slice・今はしない）: inferred を別フィールドで観測保持する拡張（intake/mapper 拡張要）。

**8.29.6 observability**:
- **raw なし**: outcome（extracted/no_intent）+ reason code（ok/llm_error/timeout/parse_fail/low_confidence/no_intent）+ token usage（usageMetadata.totalTokenCount 等・任意）+ latencyMs。
- **prompt/response 本文を出さない**（log/DB/return）。
- observability は **DI callback `onObservation(obs)`**（adapter が emit・ExtractorResult contract を汚さない）。obs は raw-free（redaction-guard 適用可）。

**8.29.7 adapter 構造（5d-1+ 実装方針）**:
- env-free core `createLlmSeedExtractorAdapterCore(config): SeedExtractor`（shift mirror・fetchImpl DI）。
- `extract(input)`: ①buildSeedExtractionPrompt（pure）→ ②fetchImpl(LLM)（DI・fake で network 0）→ ③parse（fail→no_intent）→ ④map（durationKind→confidence・sourceRef 注入・durationKind strip）→ ⑤confidence 閾値（低→no_intent）→ ⑥`{kind:"extracted",raw}` | `{kind:"no_intent"}`。**throw しない**（全 error catch→no_intent）。
- server host（A1-5-5g）が env を読み core に渡し、capture service の SeedExtractor として DI 注入。

**8.29.8 A1-5-5d-1 推奨**:
- **推奨 A1-5-5d-1 = SDK-free / network-free adapter core**（`createLlmSeedExtractorAdapterCore` + DI `fetchImpl` + pure `buildSeedExtractionPrompt` + `SEED_EXTRACTION_JSON_SCHEMA` + parse/map/downgrade/no_intent ロジック + **fake fetch** tests）。
  - **SDK import 0 / API call 0 / network 0**（fetchImpl を fake で注入・canned JSON）。
  - tests: sample JSON→extracted / no-intent JSON→no_intent / malformed→no_intent / inferred→low(evidence なし) / explicit→high / 低 confidence→no_intent / raw field 混入 LLM 出力→service validateExtractorOutput reject / **throw しない**（error fetch→no_intent）/ token usage 観測 / prompt·response 本文 非永続。
  - 理由: 実 SDK/network なしで adapter の**全分岐（parse/map/downgrade/no_intent/fail-safe）**を固定。**5d-2 で実 SDK fetchImpl を差すだけ**。
- phasing（各別 GO）: **5d-1**（SDK-free core + fake）→ **5d-2**（実 SDK fetchImpl host・実 LLM・別 GO）→ 5e observe smoke → 5f real capture smoke → 5g·5h route 接続。

### 8.30 A1-5-5d-1 実装（landed）— LLM Seed Extractor Adapter Core（SDK-free・network-free・barrel 非 export）

A1-5-5d-1（`SeedExtractor` の env-free / SDK-free core・実 network なしで全分岐を固定）:
- **`lib/plan/reality/llm-seed-extractor-adapter-core.ts`**（新規・**非 server-only=テスト可能 core**・barrel 非 export・shift `draftExtractionGeminiAdapterCore` mirror）:
  - `createLlmSeedExtractorAdapterCore(config): SeedExtractor`。config = {apiKey, model, timeoutMs?, maxRetry?, retryBackoffMs?, confidenceThreshold?, endpointBase?, **fetchImpl?**, **sleep?**, **now?**, **onObservation?**}（**全 DI・process.env 非依存**）。
  - `extract(input)`: buildSeedExtractionPrompt（pure）→ fetchImpl(Gemini REST・**SDK 非 import**)→ parse → map → ExtractorResult。**throw しない**（全 error catch→no_intent）。
  - **pure prompt builder** `buildSeedExtractionPrompt({utterance, nowIso})` + **`SEED_EXTRACTION_JSON_SCHEMA` const**（schema を prompt 埋め込み・raw を値に含めない指示）。
  - **map**: hasActionableIntent≠true→no_intent / confidence<閾値(0.5)→no_intent / **durationKind 保守 map**（explicit→{durationMin,high}=evidence / inferred·欠落·不明→{durationMin,low}=weak non-evidence・durationKind strip）/ sourceRef は input から注入 / **contract フィールドのみ明示構築**（LLM 余剰 drop）。range は validateExtractorOutput に委譲。
  - **fail-safe**: auth_missing / config_error / network_error / timeout(AbortError) / rate_limited(429 retry 枯渇) / model_error(5xx) / invalid_response / parse_fail / no_actionable_intent / low_confidence → 全て **no_intent**。timeout=AbortController+clearTimeout（全 path）。retry=429/503 backoff（sleep DI）。API key は header（URL/log に出さない）。
  - **redacted observation** `onObservation({outcome, reason, attempts, tokenUsage?, latencyMs?})`（**prompt/response/raw 非含有**）。
- test **27**（valid→extracted / no_intent / low confidence / malformed JSON / empty / json throw / network error / timeout / 5xx / explicit→high / inferred→low / kind 欠落→low / invalid duration→validateExtractorOutput reject / 余剰 raw field 非混入 / output が validateExtractorOutput 通過 / utterance 非漏洩(result·observation) / observation token·latency / 429 retry→extracted / 429 枯渇→no_intent / auth missing→fetch 0 / prompt builder pure / 静的 SDK·Supabase·DB 不在・fetchImpl DI・barrel 非 export）+ reality **728 PASS**。
- tsc 自ファイル **0 error**（**full tsc 0 ではない**・baseline 1114）。**実 SDK import 0 / 実 API call 0 / real network 0（fake fetch のみ）/ DB read·write 0 / runtime 0 / production 挙動変更 0**。
- **5d-2 は `fetchImpl=globalThis.fetch` + env を `.server` host で差すだけ**（本 core 不変）。
- **しない（A1-5-5d-1 範囲外）**: 実 SDK / 実 network / `.server` host（5d-2）/ runtime·route·UI / DB write / A1-5-5d-2 以降。

### 8.31 A1-5-5d-2a 実装（landed）— LLM Host / Env Resolver（server-only・no-call・barrel 非 export）

A1-5-5d-2a（SDK-free core §8.30 に env 境界を付ける server-only host・**実 LLM call なし=組むだけ**）:
- **`lib/plan/reality/llm-seed-extractor-adapter.server.ts`**（新規・**server-only**・barrel 非 export・**core 本体は不変**）:
  - `CAPTURE_LLM_ENV`（env 名・server-side のみ）: `REALITY_CAPTURE_LLM_API_KEY` / `_MODEL` / `_TIMEOUT_MS` / `_MAX_RETRY` / `_CONFIDENCE_THRESHOLD`。
  - `resolveCaptureLlmConfig(env) → CaptureLlmResolvedConfig | null`（**pure・fail-closed**）: apiKey/model 無し → **null**。optional は妥当なら反映・不正は core 既定（fail-soft）。throw しない・apiKey を log しない。
  - `createUnavailableSeedExtractor() → SeedExtractor`（**fail-closed no-op**・常に no_intent・**fetch しない・secret なし**）。
  - `buildServerLlmSeedExtractor(env, fetchImpl, onObservation?) → SeedExtractor`（**pure-ish**）: resolve → 不備なら no-op / 揃えば `createLlmSeedExtractorAdapterCore({...cfg, fetchImpl, onObservation})`。**extract は呼ばない**（組むだけ）。
  - `createServerLlmSeedExtractor(onObservation?) → SeedExtractor`（**server-only thin** = `buildServerLlmSeedExtractor(process.env, globalThis.fetch, onObservation)`）。
- **fetchImpl 注入**: host が `globalThis.fetch` を core に注入（実 network の唯一の配線点・**5d-2a では extract 未呼出ゆえ未発火**）。
- **secret 非漏洩**: result/observation は redacted（apiKey フィールド無し・§8.30 既定）・extractor object は `{extract}` のみ（JSON 化で secret 非出）・host は console/throw に apiKey を出さない。
- test **20**（resolver: 欠落→null / 空白→null / 揃う→config / optional 反映 / 不正 optional→既定 / config key は apiKey·model のみ / build: missing→no-op(extract→no_intent・**fetch 未呼出**) / present→組むだけ(extract 未呼出・**throwing spy fetch 未発火**) / unavailable→no_intent / secret 非漏洩 / env 名 / 静的 server-only·globalThis.fetch·SDK·Supabase·route·UI 不在・barrel 非 export・core import）+ reality **748 PASS**。
- tsc 自ファイル **0 error**（**full tsc 0 ではない**・baseline 1114・**core 本体不変**）。**実 LLM API call 0 / real network 0（throwing spy 未発火）/ SDK import 0 / DB read·write 0 / runtime importer 0 / route·UI import 0 / production 挙動変更 0**。
- **しない（A1-5-5d-2a 範囲外）**: 実 LLM API call / real network / route·UI·runtime 接続 / DB write / prompt 本番運用 / A1-5-5d-2b 以降。

### 8.32 A1-5-5d-2b 試行（env 未設定 → fail-closed no-op 確認・実 LLM call 0・doc-only 記録）

A1-5-5d-2b（初回 実 LLM API call 境界・別 GO・untracked harness・実行後削除・committed code 変更なし）:
- **env presence（read-only・値非出）**: `REALITY_CAPTURE_LLM_API_KEY` / `REALITY_CAPTURE_LLM_MODEL` = **未設定**（`.env.local`/`.env.staging.local`）。`GEMINI_API_KEY` は `.env.local` に存在（別名・host は読まない）。
- harness で `createServerLlmSeedExtractor()`（**実 process.env 経由**・`maxRetry=0` 強制・short timeout・counting fetch wrap）→ `extract(synthetic 「明日の朝9時から1時間…」)` 1 回 → **API call 0 / outcome=no_intent**（fail-closed no-op・network 接触なし・154ms）。
- redacted report: API_KEY=missing / MODEL=missing / model=null / api_call_count=0 / outcome=no_intent / validation=n/a / extracted_fields={}。**utterance/prompt/response body/apiKey 非出**。
- → **host の fail-closed を実 entry（createServerLlmSeedExtractor + 実 process.env）で確認**（5d-2a は buildServerLlmSeedExtractor を fake env でテスト・本試行が server-only thin + 実 process.env を実証）。**実 LLM call は env 設定後に deferred**（CEO が `REALITY_CAPTURE_LLM_API_KEY`（既存 GEMINI_API_KEY 値を再利用可）+ `REALITY_CAPTURE_LLM_MODEL`（Gemini model）設定 → 5d-2b 再実行）。
- DB write 0 / runtime 0 / capture service·orchestrator·RPC 非接続 / committed code 変更 0 / remote 0。

**A1-5-5d-2b-retry（env 設定後・初回 実 LLM call 成功）**: CEO が `.env.local` に `REALITY_CAPTURE_LLM_API_KEY`（GEMINI 値）+ `REALITY_CAPTURE_LLM_MODEL="gemini-2.5-pro"`（+ MAX_RETRY/TIMEOUT/CONFIDENCE）設定 → 同 harness（`maxRetry=0` 強制・counting fetch wrap・network 許可 run）で `createServerLlmSeedExtractor().extract(synthetic「明日の朝9時から1時間…」)` 1 回 → **実 Gemini call（model gemini-2.5-pro）**:
  - **api_call_count=1 / outcome=extracted / reason=ok / token_usage=1108 / latency≈6.8s / validation=ok**。
  - extracted_fields（**構造化・raw でない**）: hasDesiredDate=true / desiredTimeHint=morning / actionShape=full_go / confidence=1 / **explicitDuration={durationMin:60, confidence:high}**（「1時間」→ explicit→high＝evidence 化可）/ source=chat。
  - → **実 LLM が `validateExtractorOutput` を通る structured output を返すことを実証**（host→core→Gemini→parse→map→validate の実経路 1 回成功）。raw/prompt/response body/apiKey 非出（redacted report のみ）。DB write 0 / RPC 0 / capture service·orchestrator 非接続 / runtime 0 / committed code 0 / remote 0 / 複数 call なし。

### 8.33 A1-5-5e 実装（landed）— Observe-Mode Summary + observe smoke（実 LLM + capture service・write OFF）

A1-5-5e（観測層・実 extractor + capture service を no-run で組み合わせ would-capture を観測）:
- **`lib/plan/reality/integration/capture-observe.ts`**（新規・**pure**・barrel 非 export）: `summarizeWouldCapture(result: CaptureServiceResult) → WouldCaptureSummary`（**redacted projection**・captured→wouldCapture=true/wouldEvidence=wroteEvidence・他 false・reason は **code のみ**・exhaustive 6 outcome）。smoke + 将来 runtime observe（5g）が同一 canonical projection を共有（drift なし）。
- test(`realityCaptureObserve.test.ts`・**10**): 全 6 outcome の projection / reason code のみ（raw なし）/ 静的（Supabase·DB·LLM·server-only·fetch 不在・barrel 非 export）。
- **observe smoke（untracked harness・実行後削除・committed なし）**: `createServerLlmSeedExtractor`（実 Gemini **gemini-2.5-pro**）+ `runCaptureService`（gate=staging hjcr + canary + nodeEnv≠production / **fake write client=DB write 0** / maxRetry=0=1 call / counting fetch wrap）→ would-capture:
  - **api_call_count=1 / outcome=captured / wouldCapture=true / wouldEvidence=true / validation=ok / token 1113 / latency 6.07s / db_write=0 / fake_write_records=1（would-be payload）/ would_payload_has_evidence=true**。
  - **raw 非漏洩実測**: would-be payload（fake.writes）にも result/summary にも utterance「歯医者…」/raw field 名（signal/desiredAction/raw_text/transcript/prompt）が**出ない**（raw_leak_in_payload=false / raw_leak_in_result=false）。
  - → **実 LLM → capture service（gate→extractor→validate→intake→mapper→write seam）→ would-capture が write OFF で end-to-end 成立**。explicitDuration high → wouldEvidence=true（候補化可能な構造）。production hard block 維持（gate=hjcr staging・aljav なら block）。
- tsc 自ファイル **0 error**（**full tsc 0 ではない**・baseline 1114）。reality **758 PASS**。**DB write 0 / RPC 0 / Supabase 実接続 0 / real write client 0 / runtime·route·UI 0 / production 挙動変更 0 / API call 1 / committed code = pure helper + test のみ**。
- **しない（A1-5-5e 範囲外）**: DB write / RPC / 実 write client / orchestrator real write / runtime·route·UI / RealityInput 搭載 / A1-5-5f 以降。

### 8.34 A1-5-5f 実装（完了）— real capture smoke（capture pipeline 全段の実 staging write・cleanup 済）

> **capture pipeline 全段の実 DB write 境界**（別 GO・CEO 承認・untracked harness・実行後削除・committed code 変更なし）。A1-5-4d-2（orchestrator 実 write）+ A1-5-5d-2b-retry（実 LLM）+ A1-5-5e（observe）の合流。runtime/route/UI 非接続。
- **厚い preflight（write 前 abort）**: REF===hjcr ∧ ∉[aljav] / env URL host ref===hjcr / sign-in(USER_A)→uid / **self-pin requested===uid** / anon に service_role なし / LLM env 存在 / **pre-write に plan_seeds·evidence を allowed-col SELECT で存在確認** / cleanup 構造保証（owner DELETE + FK CASCADE・認証済 client）。
- **実行**: 実 LLM（Gemini gemini-2.5-pro・**maxRetry=0**）+ `runCaptureService`（gate=staging hjcr+canary+nodeEnv≠production / **real RPC write client** `createRpcCaptureWriteClient`（USER_A anon・service_role 0）） → synthetic「明日の朝9時…1時間…」:
  - **llm_api_call_count=1**（generativelanguage URL 計数）/ **rpc_call_count=1**（supabase.rpc 計数）/ outcome=**captured** / wroteEvidence=**true** / validation=**ok** / token 1086 / latency 6.34s。
  - **実 atomic write**: plan_seeds **seed_inserted=1** + plan_seed_duration_evidences **evidence_inserted=1**。
  - **read seam（allowed col のみ・source_ref/raw 非 select）→ candidateCount=1**（実 row → projectSeedRowsToPlacements + projectDurationEvidenceRowsToMap + enrich + generateComplete・durationMin=60/seed_explicit/strong）。**read_raw_clean=true**（utterance「歯医者」/source_ref/raw 非出）。
  - **cleanup（finally 必ず）**: seed owner delete → evidence FK cascade → **seed_rows_after=0 / evidence_rows_after=0**（cleanup_error=null）。staging 復元。
- service_role 0 / raw·prompt·response body·apiKey·UUID 出力 0（redacted report）/ API call 1 / RPC call 1 / 複数 row write なし / db reset·SQL Editor·migration repair 0 / production 接触 0 / `.temp/project-ref`=aljav は **anon client を hjcr URL に hard-pin ゆえ無関係** / remote 0 / committed code 変更 0。
- → **capture pipeline 全段（実 Gemini→capture service→real RPC atomic write→read seam→candidate→cleanup）が実 staging で end-to-end 実証完了**（chat route 抽出入口を除く全配線）。

### 8.35 A1-5-5g-0/1 実装（landed）— Route Activation Audit + Capture Route Runner Skeleton（server-only・no-runtime）

**A1-5-5g-0 route audit（read-only）— `app/api/alter-morning/plan/route.ts`**:
- runtime=nodejs / flag=`ALTER_MORNING_V2_ROUTE_ENABLED`(default OFF→404) / auth=Supabase `getUser()`→user.id(401) / **入力=`{utterance:string(必須・raw), targetDateHint?, phenotype?, partyBaseline?, weatherContext?}`** / 委譲=`runMorningPipeline`(唯一の配線点・route は薄い) / **response=`{ok:true,data:result}`|`{ok:false,error}`** / 副作用=route 自体は薄い(auth+parse+delegate+return)。
- → **第一接続先に最適**: utterance 入力（capture 向き）・flag 済・user.id あり・**fire-and-forget で observer を並走させれば response 不変**。接続先比較（§8.25 再確認）: alter-morning/plan(第一) / stargazer/alter(最後・広面) / shadow-dev(smoke 用) / plan action route(seed producer でなく非対象)。

**A1-5-5g-1 runner skeleton**:
- **flag**: `PLAN_FLAGS.realityCaptureObserve`（env `REALITY_CAPTURE_OBSERVE`・default false・server-side のみ）— **write の `realityCaptureLive` とは別**。observe を write 有効化前に回せる。kill は両者最優先・gate の production/staging/canary block は両者適用。
- **`lib/plan/reality/integration/capture-route-runner.ts`**（新規・**server-only**・barrel 非 export）: `runCaptureRouteObserver(input, deps:CaptureServiceDeps) → CaptureRouteRunnerResult`。
  - **mode 分離（runner で固定）**: **observe** → gate → extractor → `runCaptureService`（DI: **dry-run fake write client・実 DB 0**）→ `summarizeWouldCapture` / **write** → **fail-closed（未接続・extract/write しない・note=write_mode_not_connected）**。
  - **throw しない**（全 error catch→redacted `{observed:false, note:"observer_error"}`）= **route response 不変**（fire-and-forget が user response を壊さない）。
  - result=`{mode, observed, summary(WouldCaptureSummary|null・redacted), note}` — raw なし。gate.liveEnabled は caller(5g-2 route)が mode の flag で解決（observe→REALITY_CAPTURE_OBSERVE / write→REALITY_CAPTURE_LIVE）。
- **方針確定**: observe=write OFF(dry-run fake・実 DB 0) / write=未接続 fail-closed / observe flag は live と別 / response 不変(fire-and-forget・never-throw) / raw は extraction.utterance のみ・result は reason code のみ / production hard block 維持(gate)・kill 最優先・staging/canary 以外 no-op。
- test **13**（write mode fail-closed(extract 0/write 0) / gate block(flag off・non-staging ref)→extractor 0/write 0/wouldCapture false / valid high→wouldCapture·wouldEvidence true·dry-run write 1 / valid なし→wouldEvidence false / no_intent→write 0 / raw 混入→invalid_extraction·write 0 / never-throw(observer_error·raw 非含有) / result raw 非漏洩 / 静的 server-only·SDK·Supabase·DB·fetch·process.env·route·UI 不在·barrel 非 export）+ reality **771 PASS**。
- tsc 自ファイル **0 error**（**full tsc 0 ではない**・baseline 1114）。**route.ts 不変 / runtime importer 0 / DB read·write 0 / RPC 0 / Supabase import 0 / 実 LLM call 0 / production 挙動変更 0**。
- **しない（A1-5-5g-0/1 範囲外）**: route.ts 変更 / runtime 接続 / DB write / 実 LLM runtime / UI / production / A1-5-5g-2 以降。

### 8.36 A1-5-5g-2 実装（landed）— Alter-Morning Route Capture Observe Wiring（observe-only・fire-and-forget・response 不変）

A1-5-5g-2（capture observer を実 route に接続・**observe-only・write OFF・route response 不変**・runtime 接続境界）:
- **route 変更（最小）**: `app/api/alter-morning/plan/route.ts` に `import { fireMorningCaptureObserve }` + auth/parse 後に `try { fireMorningCaptureObserve(body.utterance, user.id) } catch {}`（**fire-and-forget・二重防御**）。**response body / success·error contract / delegate（runMorningPipeline）不変**（route は薄いまま）。
- **`lib/plan/reality/integration/alter-morning-capture-observe.ts`**（新規・**server-only**・barrel 非 export）:
  - `fireMorningCaptureObserve(utterance, userId): void`（route entry・**fire-and-forget・void 同期返却・never-throw**）。**cheap guard**（observe flag off / kill → 即 return・real extractor 構築なし）→ gate 解決（PLAN_FLAGS+env+userId）→ deps（real extractor + **dry-run fake write client・実 DB 0**）→ `void runMorningCaptureObserve(...).then().catch()`。sync/async とも例外握りつぶし。
  - `runMorningCaptureObserve(utterance, gate, deps, opts?)`（**DI core**・morning extraction 組成→`runCaptureRouteObserver`(observe)）。`resolveMorningObserveGate(opts)`（pure・liveEnabled=observe flag）。
- **方針**: observe-only（write は 5g-3+）/ observe flag=`REALITY_CAPTURE_OBSERVE`（live と別）/ kill 最優先 / **production hard block**（NEXT_PUBLIC_SUPABASE_URL が aljav / 非 staging / 非 canary / nodeEnv=production → gate block → observer 0）/ response 不変（fire-and-forget + helper never-throw + route 二重 try/catch）/ raw は utterance のみ・result redacted。
- test: helper **16**（resolveMorningObserveGate pure / runMorningCaptureObserve DI: observe+canary+staging→wouldCapture·wouldEvidence true·dry-run write 1·extractor 1 / flag off·production ref·canary 外·kill→extractor 0·write 0·wouldCapture false / no_intent·raw 混入→write 0 / never-throw·raw 非漏洩 / 静的）+ route **9**（既存 6 + 新 3: 200 で observe を fire-and-forget 呼出·response 不変 / 404·401·400 で observe 呼ばない / observer throw でも response 不変）+ reality 787 PASS。
- tsc 自ファイル **0 error**（**full tsc 0 ではない**・baseline 1114）。**実 DB/RPC 到達経路 0（dry-run fake write のみ）/ Supabase 実接続 0（capture）/ 実 LLM API call 0（テスト・fake）/ write mode 0 / runtime visible behavior 変更 0（response 不変）/ production 挙動変更 0（flag default off）**。
- → **capture observer が alter-morning/plan route に observe-only で接続済**（runtime path 存在・ただし dry-run fake write・実 LLM は gate で default off）。
- **しない（A1-5-5g-2 範囲外）**: DB write / RPC / 実 write client / write mode / REALITY_CAPTURE_LIVE 有効化 / UI / production / A1-5-5g-3 以降。

### 8.37 A1-5-5g-3 実装 + observe staging smoke（landed）— redacted observation sink + 実 route 経由 observe 実証

A1-5-5g-3（fire-and-forget observer の redacted 観測点を追加 + staging-gated で実 route 経由の observe を実証）:
- **redacted observation sink（committed・helper 追加）**: `lib/plan/reality/integration/alter-morning-capture-observe.ts` に `CaptureObserveSink` 型 + module-level sink（既定=redacted console.log `[reality.capture.observe]`・**raw/prompt/response/apiKey なし・safe field projection のみ**）+ `setCaptureObserveSink`/`resetCaptureObserveSink`/`emitCaptureObserve`（never-throw）。`fireMorningCaptureObserve` の `.then((result) => emitCaptureObserve(result))`。**route response に混ぜない**（観測は sink 経由のみ）。production は既定 redacted log で監視・test/smoke は sink 差し替えで deterministic 捕捉。
- **observe staging smoke（untracked harness・実行後削除・committed code 変更 0）**: alter-morning/plan route を実 POST。preflight: URL ref===hjcr / aljav denylist / service_role 削除（0）/ LIVE 未使用 / 実 STAGING_USER_A sign-in（anon・signOut・write なし）で uid → canary=uid・route auth=uid（**requested===signed-in===canary self-pin**）/ PLAN_FLAGS env-timing 確認（resetModules+dynamic import で realityCaptureObserve=true・canary∋uid）。morning provider stub（pipeline LLM 0）→ 実 LLM は observer の 1 回のみ。fetch wrap で generativelanguage 計数。
- **smoke 結果（redacted）**: route 200 / `{ok:true,data:{annotations,comprehension,gapResolution,grounded,hints,narration,status,timeline}}`（**observer 非混入＝response 不変**）/ observerStarted=true / observed=true / **outcome=captured** / **wouldCapture=true・wouldEvidence=true**（実 LLM が explicit duration high 抽出→candidate 到達）/ **llmCallCount=1** / dry-run fake write（**DB write 0・RPC 0・Supabase write 0**）/ raw・prompt・apiKey 非含有。
- **安全**: staging(hjcr) のみ / production(aljav) 非接触 / service_role 0 / 実 write client 不使用 / LIVE 未使用 / DB write 0 / RPC 0 / Supabase write 0（sign-in は anon auth のみ）/ cleanup 不要（write 0）/ runtime visible behavior 変更 0（response 不変）/ remote 0。
- test: helper sink **4**（set→capture / reset→既定 log / 既定 payload redacted / sink throw でも never-throw）。helper 計 **20** + route 9 + reality **791** PASS（787→+4）・自ファイル tsc 0（full tsc 0 ではない・baseline 1114）。
- → **実 route 経由の observe が staging-gate で wouldCapture/wouldEvidence まで到達・response 不変・write 0 を実証**。observe-mode 運用（write 有効化前の監視）の基盤確立。
- **しない（A1-5-5g-3 範囲外）**: DB write / RPC / 実 write client / write mode / REALITY_CAPTURE_LIVE 有効化 / production / UI / A1-5-5g-4 以降。

### 8.38 A1-5-5g-4 実装 + route write-mode staging smoke（landed）— capture observer の write-mode 接続 + 実 route 経由 atomic write 実証

A1-5-5g-4（capture observer に write-mode を接続・実 route 経由で staging に atomic write・read seam で candidateCount>0・cleanup）:
- **runner write-mode 接続（committed）**: `capture-route-runner.ts` の write mode を実接続（observe/write 両モードとも `runCaptureService`・**差は注入 writeClient のみ**: observe=dry-run fake / write=real RPC）。`runCaptureService` が gate を最初に通す（production/staging/canary block・kill 最優先）。fail-closed の "write_mode_not_connected" 廃止。
- **helper mode 分離（committed）**: `alter-morning-capture-observe.ts` に `decideCaptureMode(flags)`（pure・**kill 最優先 → LIVE=write → OBSERVE=observe → none**）。`runMorningCaptureObserve` に `mode` opt 追加。`fireMorningCaptureObserve` → **`fireMorningCapture(utterance, userId, rpcClient)`**: mode 決定 → write は `createRpcCaptureWriteClient(rpcClient)`（user-RLS・SECURITY INVOKER・service_role 不要）/ observe は dry-run fake / null は即 return（**default 両 flag off → no-op・production 挙動変更ゼロ**）。fire-and-forget・never-throw 維持。
- **route 変更（最小）**: `fireMorningCapture(body.utterance, user.id, supabase as unknown as RpcCapableClient)`（認証済 client を write の RPC 先に）。**response body / success·error contract 不変**・二重 try/catch。
- **observe/write 分離**: observe=既存挙動維持（dry-run・実 DB 0）/ write=`REALITY_CAPTURE_LIVE`=true のときのみ（real RPC・実 DB write）/ kill 最優先 / production·kill·canary外·non-staging で extractor 0·write 0 / response 不変・observer は response 非混入。
- **route write-mode staging smoke（untracked harness・実行後削除・committed code 変更 0）**: route を LIVE=true で POST。厚い preflight: URL ref===hjcr / aljav denylist / service_role 削除（0）/ 実 STAGING_USER_A sign-in（anon・self-pin requested===signed-in===canary）/ **pre-write delete capability 確認（不能なら write しない）** / tables 存在確認 / rpc wrapper で seedId 捕捉（CAPTURE_RPC_NAME 計数）/ fetch wrap で LLM 計数 / **finally で必ず cleanup**。
- **smoke 結果（redacted）**: route 200 / response shape 不変（observer 非混入）/ observerMode=write / **outcome=captured / seedInserted=1 / evidenceInserted=1 / candidateCount=1**（read seam→enrich→generateComplete・durationMin/strong）/ **llmCallCount=1 / rpcCallCount=1** / wroteEvidence=true / readRawClean=true（読んだ row に raw/source_ref なし）/ **cleanupError=null / seedRowsAfter=0 / evidenceRowsAfter=0** / 別途 read-only verify で USER_A reality rows 総数=0。
- **raw発話保存なし**: `PlanSeedInsertDraft` は structured-only（raw 列なし）・extractor 出力も structured。RPC は signal/desired_action(raw) を書かない・source_ref は opaque。
- **安全**: staging(hjcr) のみ / production(aljav) 非接触 / service_role 0 / 実 write client は write-mode gate 内のみ / DB write=seed1+evidence1 のみ（cleanup→0）/ raw·prompt·response本文·apiKey·seedId(UUID) 出力 0 / runtime visible behavior 変更 0 / UI·PlanClient 0 / remote 0。
- test: runner write-mode 3（captured/RPC 1・gate block・flag off）+ helper decideCaptureMode 5 + write-mode 3 + reality **801 PASS**（791→+10）・自ファイル tsc 0（full tsc 0 ではない・baseline 1114）。
- → **capture pipeline 全段が実 route 経由で staging に end-to-end 実証**（実 LLM→route→write-mode→real atomic RPC→seed+evidence→read seam→candidate→cleanup）。observe/write は flag で安全に切替。
- **しない（A1-5-5g-4 範囲外）**: UI / PlanClient 接続 / production / PRM·correction 実接続 / RealityInput 搭載 / generateCandidates runtime 接続 / remote / A1-5-5h 以降。

### 8.39 A1-5-6-0/1 実装（landed）— Captured Seed Consumption Shadow Runner（pure・DI・no-write・no-visible）

A1-5-6-0/1（書いた seed/evidence を candidate へ安全に消費する入口を固める shadow runner・runtime visible behavior 変更 0）:
- **`lib/plan/reality/integration/captured-seed-consumption.ts`**（新規・server-only・barrel 非 export）: `runCapturedSeedConsumptionShadow(input): CapturedSeedConsumptionSummary`。
  - pipeline: captured row（**DI**・allowed column DTO）→ **sanitize（`pickAllowed*`・allowlist 再構築・raw/source_ref 列 drop・ignore fail-closed）** → `projectSeedRowsToPlacements` + `projectDurationEvidenceRowsToMap`（read seam・adoptable evidence は high のみ surface）→ `enrichSeedPlacementsFromEvidences`（既存規則）→ `generateComplete`（結合条件）→ candidateCount(0/1)。
  - summary（**redacted**）: `{ seedCount, adoptableEvidenceCount, candidateCount, wouldCandidate, reason("candidate"/"no_seed"/"no_candidate") }`。**id / source_ref / raw なし**。
- **evidence 規則（既存 enrich 再利用・新ロジックなし）**: high seed_explicit/correction → strong → 候補化可 / **prm_typical → grounding=weak → 候補化不可** / low → map 非 surface / 範囲外・不正 source → 除外。generateComplete は **grounding=strong のみ候補化**（不変）。
- **consumption は write path と分離**: row は DI（**実 DB read なし**）/ route response・UI・PlanClient・RealityInput 本接続・generateCandidates runtime に触れない / **DB write 0・Supabase 実接続 0**。
- test 21: high seed_explicit→候補 / high correction→候補 / **prm_typical→0** / no evidence→0 / **low→0** / 範囲外→0 / no_seed / 非active除外 / weak seed conf→0 / skip disposition→0 / date不一致→0 / **contamination(raw列)→ignore fail-closed（候補は構造化値で成立・raw 非漏洩）** / **`collectStringValues` で summary 全 string=reason code のみ（UUID/source_ref/raw 非surface）** / sanitize allowlist / deterministic / 静的（server-only・DB/route/UI/process.env 0・barrel 非export）。reality **822 PASS**（801→+21）・自ファイル tsc 0（full tsc 0 ではない・baseline 1114）。
- → **captured seed/evidence → candidate を canonical 1 経路に固定**（drift 防止）+ 消費境界で raw/source_ref を構造的に遮断。runtime visible behavior 変更 0。
- **しない（A1-5-6-0/1 範囲外）**: real DB read smoke / route response 反映 / UI·PlanClient 接続 / RealityInput 本接続 / generateCandidates runtime 本接続 / PRM·correction 実接続 / production / remote / A1-5-6 以降の visible integration。

### 8.40 A1-5-6-2 real consumption smoke（landed・doc-only）— controlled write + real DB read seam + consumption runner + cleanup

A1-5-6-2（staging で実 DB の captured seed/evidence を read seam で読み consumption runner を通し candidateCount>0 を実証・controlled one-row write + cleanup・runtime visible behavior 変更 0）:
- **untracked harness・実行後削除・committed code 変更 0・doc-only 記録・file capture・1 回実行**（CEO 補正反映）。
- 厚い preflight: URL ref===hjcr / aljav denylist / service_role 削除(0) / 実 STAGING_USER_A sign-in(anon・**self-pin requested===signed-in===canary**) / tables 存在確認 / **pre-write delete capability 確認（不能なら write しない）** / file capture を最初から設計。
- **controlled write（`runCaptureService` 直叩き**・gate input 直接構築=PLAN_FLAGS 非依存・real extractor + real RPC・maxRetry=0）→ synthetic utterance → captured（seed1+evidence1）。
- **real DB read（allowed col のみ SELECT**: SEED_COLUMNS_SQL / DURATION_EVIDENCE_COLUMNS_SQL・**source_ref/raw 非 select**）→ rows。
- **consumption（`runCapturedSeedConsumptionShadow`** で real rows → sanitize → read seam → enrich → generateComplete）→ summary。
- **cleanup（finally・seed owner delete → evidence FK cascade）→ rows=0**。
- **redacted report（file capture・/tmp・1回）**: writeOutcome=captured / **llmCallCount=1 / rpcCallCount=1 / seedInserted=1 / evidenceInserted=1** / allowedColumnsOnly=true / readRawClean=true / **candidateCount=1 / wouldCandidate=true / summaryReason=candidate** / summaryRedacted=true / cleanupError=null / **seedRowsAfter=0 / evidenceRowsAfter=0 / userTotalReality=0**。
- **安全**: staging(hjcr) のみ / production(aljav) 非接触 / service_role 0 / **raw発話保存なし（structured-only）** / raw·prompt·response本文·apiKey·source_ref·UUID 出力 0 / 複数 API/RPC/row write なし / route response 変更 0 / UI·PlanClient 0 / runtime visible behavior 変更 0 / remote 0。
- → **consumption runner が実 staging の実 row を read seam 経由で消費し candidate 化することを end-to-end 実証**（書く→読む→候補化→cleanup の全周・実 row）。
- **しない（A1-5-6-2 範囲外）**: route response 反映 / UI·PlanClient 接続 / RealityInput 本接続 / generateCandidates runtime 本接続 / PRM·correction 実接続 / production / remote / A1-5-6 以降の visible integration。

### 8.41 A1-5-7-0/1 実装（landed）— Candidate Surface Contract（pure presenter・no-DB・no-visible・route 未変更）

A1-5-7-0/1（候補を UI/route response に出してよい安全 DTO へ変換する presentation contract を candidate path の末端に固定・runtime visible behavior 変更 0）:
- **`lib/plan/reality/integration/candidate-surface.ts`**（新規・**pure**・barrel 非 export・未配線）: `presentCandidateSurface({ summary, candidatePlacements? }): CandidateSurfaceDTO`。
  - DTO: `{ hasCandidate, candidateCount, status("has_candidate"/"none"), items[] }`。item: `{ durationMin, evidenceSource("seed_explicit"/"correction"), date(YYYY-MM-DD|null), band(morning/afternoon/evening|null), confidenceBand("high"/"medium"/"low") }`。
  - **redaction 境界（最強）**: **CandidateDraft は surface 入力にしない**（id/itemId/sourceTraces.ref が **seedRef(UUID)** を持つため）。surface は **summary(counts・既 redacted) + enriched placement(seedRef drop・safe field)** のみ。**raw/source_ref/UUID/prompt/response/apiKey を絶対 surface しない**。confidence は **band 化**（raw 0..1 非出力）。
  - **fail-closed**: `isSurfaceableCandidate`（duration>0 ∧ grounding=strong ∧ source∈{seed_explicit,correction} ∧ disposition=place）で **prm_typical/weak/unknown/tentative/skip を除外**。
  - **断定は "候補があります" まで**（status=has_candidate/none・**prose/UI 文言を生成しない**）。
- test 18: candidateCount=1→DTO(item) / count-level(placements 未提供) / candidateCount=0→empty / **seed_explicit·correction 区別** / **prm_typical→non-surface(2 経路)** / raw列·source_ref·**seedRef(UUID)→DTO 非出** / 全 string=安全語彙(enum/date)·UUID/prompt/apiKey 非含有 / confidenceBand / isSurfaceableCandidate / deterministic / 静的(pure・DB/route/UI 0・**CandidateDraft 非 import**・import type のみ・barrel 非export)。reality **840 PASS**（822→+18）・自ファイル tsc 0（full tsc 0 ではない・baseline 1114）。
- **route response contract（docs 案のみ・既存 body 不変）**: 現状 `{ ok:true, data:MorningPipelineResult }`（status/comprehension/timeline/grounded/gapResolution/annotations/narration/hints）。surface DTO を載せる**非破壊案**: `data` に optional `captureCandidate?: CandidateSurfaceDTO` を **additive** 追加（既存 consumer=MorningPlanCard 等は unknown field を無視ゆえ非破壊）。**本 slice では実装しない**（visible route integration は別 GO）。
- → **candidate path の末端に redaction 境界を固定**（UUID 源の CandidateDraft を境界に入れない）+ presentation contract 確定。**route response 変更 0・UI/PlanClient 接続 0・runtime visible behavior 変更 0**。
- **しない（A1-5-7-0/1 範囲外）**: route response 変更 / UI·PlanClient 接続 / RealityInput 本接続 / generateCandidates runtime 本接続 / PRM·correction 実接続 / production / remote / A1-5-7 visible route integration。

### 8.42 A1-5-7-2 実装（landed）— Route Surface Integration Plan + Candidate Response Assembler（pure・additive・no-DB・no-visible・route 未変更）

A1-5-7-2（candidate surface を response に載せる前に、response contract と合成方法を固定。fire-and-forget observer ↔ response surface の矛盾を解く）:
- **fire-and-forget observer ↔ response surface の矛盾（核心整理）**:
  - capture observer は **fire-and-forget**（response 返却**後**に async write）→ **今回 utterance の candidate は response 構築時に未完**。consumption（candidate）は**書かれた seed の DB read**を要する。
  - **A案**: response に載せず redacted observation 継続（candidate は別機構で後 surface）。
  - **B案**: explicit surface mode で capture+consumption 全体を **await**（実 LLM ~7s latency）→ `captureCandidate` 返す。latency / error 伝播 / fire-and-forget 違反のコスト。
  - **C案（推奨）**: response は `captureCandidate` を **pending seed の read-only consumption（高速 DB read・fail-open）**から載せる。**fire-and-forget の capture write は不変**。今回 utterance の capture は**後続 read で surface**。→ capture の意味論（latent 意図を後で surface）と整合・**LLM await 不要**・fail-open・additive。
  - **推奨理由**: B の LLM await を避けつつ response に載せられる。capture(write)/surface(read) を分離し各々最適化。assembler が fail-open（read 失敗→元 result）ゆえ response 安全。
- **`lib/plan/reality/integration/candidate-response-assembler.ts`**（新規・**pure**・generic・barrel 非 export・**route 未接続**）:
  - `appendCaptureCandidateToMorningResult<T>(result, surface): T | (T & {captureCandidate})`（**pure・fail-open・additive**）。candidate 無（surface null / hasCandidate=false）→ **元 result 完全一致**（key 足さない）。candidate 有 → `{...result, captureCandidate: redactCaptureCandidateSurface(surface)}`（既存 keys 維持・1 key 追加）。
  - `redactCaptureCandidateSurface(s)`（response boundary の**最終 redaction**・allowlist 再構築・extra key drop）。generic `<T>`＝MorningPipelineResult 非 import（decoupled）。
- **additive contract（docs 案・実装は別 GO）**: route response は将来 `data.captureCandidate?: CandidateSurfaceDTO`（additive optional）。既存 consumer（legacyAdapter→MorningPlanCard は特定 key のみ読む）は unknown field を無視ゆえ**非破壊**。**本 slice では route.ts を変更しない**。
- test 17: surface null/undefined/hasCandidate=false→元 result deep-equal（fail-open）/ hasCandidate=true→captureCandidate 1 key additive / 既存 keys 維持 / 追加 key は captureCandidate のみ / ok·data envelope 不変 / item·DTO 直下の raw·source_ref·seedRef(UUID) 混入→最終 redaction で response 非出 / collectStringValues clean / **redactCaptureCandidateSurface clean→deep-equal(drift 検出)・汚染→sanitized** / deterministic / 静的(pure・DB/route/UI/MorningPipelineResult 0・import type のみ・barrel 非export)。reality **857 PASS**（840→+17）・自ファイル tsc 0（full tsc 0 ではない・baseline 1114）。
- → **response surface integration 方針を C案 に固定（決定材料 + pure assembler）**・**fail-open additive contract 確定**。**route.ts 変更 0・route response 実変更 0・UI 接続 0・DB 0・runtime visible behavior 変更 0**。
- **しない（A1-5-7-2 範囲外）**: route.ts 変更 / route response 実変更 / UI·PlanClient 接続 / DB read·write / pending seed read 実装 / RealityInput 本接続 / generateCandidates runtime / PRM·correction 実接続 / production / remote / visible route integration 本実装。

### 8.43 A1-5-7-3 Surface Assembly Smoke（landed・doc-only）— synthetic write → real read → consumption → surface DTO → response assembler → cleanup

A1-5-7-3（staging の実 row で capture pipeline 全段 + surface presenter + response assembler を end-to-end 実証・controlled one-row write + cleanup・runtime visible behavior 変更 0）:
- **untracked harness・実行後削除・committed code 変更 0・doc-only 記録・file capture・1 回実行・実 LLM 不使用**（CEO 推奨どおり synthetic structured input）。
- 厚い preflight: URL ref===hjcr / aljav denylist / service_role 削除(0) / 実 STAGING_USER_A sign-in(anon・self-pin) / tables 存在確認 / **pre-write delete capability 確認** / file capture を最初から設計。
- **controlled write（synthetic structured input → `createExtractedFakeExtractor` → `runCaptureService` → real RPC・LLM 0**）→ captured（seed1+evidence1）。
- **real DB read（allowed col のみ・source_ref/raw 非 select）→ consumption runner（candidateCount=1）→ `presentCandidateSurface`（CandidateSurfaceDTO）→ `appendCaptureCandidateToMorningResult`（fake MorningPipelineResult への additive merge）→ cleanup（rows=0）**。
- **redacted report（file capture・1回）**: writeOutcome=captured / **llmCallCount=0** / rpcCallCount=1 / seedInserted=1 / evidenceInserted=1 / allowedColumnsOnly=true / readRawClean=true / **candidateCount=1 / wouldCandidate=true** / summaryRedacted=true / **surfaceHasCandidate=true / surfaceCandidateCount=1 / surfaceItemCount=1 / surfaceEvidenceSource=seed_explicit / surfaceRedacted=true** / **assemblerCaptureCandidatePresent=true / assemblerExistingKeysIntact=true / assemblerNoCandidateDeepEqual=true / assemblerEnvelopeOk=true** / cleanupError=null / **seedRowsAfter=0 / evidenceRowsAfter=0 / userTotalReality=0**。
- **ギャップ発見（次 slice 向け）**: consumption runner（`runCapturedSeedConsumptionShadow`）は **summary のみ返す**ため、surface items 用の enriched placements は smoke 内で read seam 関数（`projectSeedRowsToPlacements`+`projectDurationEvidenceRowsToMap`+`enrichSeedPlacementsFromEvidences`）を直接再利用して算出（runner と同経路）。**visible integration では consumption runner が enriched placements を露出する slice が必要**。
- **安全**: staging(hjcr) のみ / production(aljav) 非接触 / service_role 0 / **raw発話保存なし（synthetic structured・PlanSeedInsertDraft structured-only）** / raw·prompt·response本文·apiKey·source_ref·UUID 出力 0 / 複数 RPC/row write なし / route.ts 変更 0 / route response 実変更 0 / UI·PlanClient 0 / runtime visible behavior 変更 0 / production 接触 0 / remote 0。
- → **capture pipeline 全段（write→read→consumption→surface DTO→response assembler→cleanup）が実 staging row で end-to-end 実証**。visible route integration の手前まで全配線が成立。
- **しない（A1-5-7-3 範囲外）**: route.ts 変更 / route response 実変更 / UI·PlanClient 接続 / RealityInput 本接続 / generateCandidates runtime 本接続 / PRM·correction 実接続 / production / remote / visible route integration 本実装。

### 8.44 A1-5-7-4 実装（landed）— Consumption Surface Bridge（gap 解消・canonical 単一計算・pure・no-DB・no-visible）

A1-5-7-4（A1-5-7-3 で発見した「surface items 用 enriched placements を harness 側で再算出＝drift risk」を canonical module 側で解消）:
- **gap 解消方針**: candidateCount（summary）と surface items を **同一 canonical 計算**から出す。`captured-seed-consumption.ts` から **canonical core `computeCapturedSeedConsumption(input): {summary, enrichedCandidatePlacements}`** を抽出（1 計算で summary + 候補 placements）。
  - 既存 `runCapturedSeedConsumptionShadow`（summary-only）は **core に委譲**（**public API/出力 不変・21 tests PASS**）。
- **`lib/plan/reality/integration/consumption-surface-bridge.ts`**（新規・server-only・barrel 非 export・**未配線**）: `runCapturedSeedConsumptionWithSurface(input): {summary, surface}` = `computeCapturedSeedConsumption` → `presentCandidateSurface`。**summary.candidateCount と surface(items/candidateCount) が同一 core 由来**（再算出 drift なし）。
- **redaction は `presentCandidateSurface` 1 箇所**: core の `enrichedCandidatePlacements`（**seedRef を持つ内部値**・server-only・surface 境界を越えない）を bridge 内で redact → 出力 `surface` は **seedRef/source_ref/UUID/raw を持たない**。**CandidateDraft は不使用**（UUID 源を境界に入れない）。
- **循環なし**: candidate-surface の `import type CapturedSeedConsumptionSummary` は erased（runtime edge なし）→ bridge → 両 module の単方向のみ。bridge は別 module（consumption/presentation は独立維持）。
- test bridge **15**: seed_explicit/correction→candidateCount=1+surface.hasCandidate=true / **summary.candidateCount===surface.candidateCount（drift 防止）** / prm_typical・no evidence・low・inactive・skip→candidateCount=0+surface なし / raw·source_ref·seedRef(UUID)→surface 非出 / collectStringValues clean / **appendCaptureCandidateToMorningResult で captureCandidate additive・no candidate→original deep-equal** / **bridge.summary===既存 summary-only runner（core 共有・既存不変）** / deterministic / 静的(server-only・DB/route/UI 0・CandidateDraft 非 import・barrel 非export)。既存 consumption **21 tests 不変** + reality **872 PASS**（857→+15）・自ファイル tsc 0（full tsc 0 ではない・baseline 1114）。
- → **candidateCount と surface items を canonical 単一計算に固定（再算出 drift 解消）+ redaction 1 箇所**。visible route integration はこの bridge.surface を `appendCaptureCandidateToMorningResult` に渡せばよい（再算出なし）。**route.ts 変更 0・DB 0・runtime visible behavior 変更 0**。
- **しない（A1-5-7-4 範囲外）**: route.ts 変更 / route response 実変更 / UI·PlanClient 接続 / DB read·write / RealityInput 本接続 / generateCandidates runtime 本接続 / PRM·correction 実接続 / production / remote / visible route integration 本実装。

### 8.45 A1-5-7-5 実装（landed）— Visible Route Surface Integration（C案・additive `data.captureCandidate?`・read-only・fail-open・gated・後方互換）

A1-5-7-5（alter-morning/plan route response に `captureCandidate?: CandidateSurfaceDTO` を additive 追加・**本 arc 初の route.ts 実変更**・UI 非接続・production hard block）:
- **新 flag `realityCaptureSurface`**（env `REALITY_CAPTURE_SURFACE`・**default false**・server-side のみ）。capture write(Live)/observe とは独立。**default OFF → route response 完全不変**（後方互換最優先）。
- **`lib/plan/reality/integration/morning-capture-surface.server.ts`**（新規・server-only・**read-only**・barrel 非 export）: `buildMorningCaptureSurface(client, userId, targetDate): Promise<CandidateSurfaceDTO|null>`（production glue・never-throw）。cheap guard（flag off/kill→null・read 0）→ `evaluateCaptureGate`（liveEnabled=surface flag・production/staging/canary block）→ `loadPendingProjected`（**canonical read source 委譲**）→ `runConsumptionSurfaceFromProjected`（bridge）→ surface。DI core `buildCaptureSurfaceFromProjected`（gate block→read 0・fail-open）+ `resolveSurfaceGate`(pure)。
- **single-read-source 遵守（重要修正）**: 初版は本 module で直接 `.from("plan_seeds")` した→**guardrail test 違反**（reality tree で plan_seeds read は seed-source.ts のみ / evidence は duration-evidence-source.ts のみ）。修正: **`createColumnRestrictedSeedSource`(placements) + `createColumnRestrictedDurationEvidenceSource`(evidence map) へ委譲**（本 module に `.from` なし）。projected data からの consumption は新 core `computeConsumptionFromProjected`（captured-seed-consumption.ts・enrich/generateComplete/summary を row 経路と共有=drift なし）+ bridge `runConsumptionSurfaceFromProjected`。
- **route.ts（最小 additive・fail-open）**: `runMorningPipeline` 成功後に `data = appendCaptureCandidateToMorningResult(result, await buildMorningCaptureSurface(supabase, user.id, result.comprehension?.targetDate))` を try/catch（**fail-open: surface 失敗→data=result**）。**error path(500)/404/401/400 不変・既存 keys/envelope 不変・実 LLM await なし**。
- **fail-open 多層**: cheap guard(flag off→null) + gate block(→null・read 0) + read null + bridge error + buildMorningCaptureSurface never-throw + route try/catch + assembler(null→元 result)。null → captureCandidate を付けない＝既存 response 完全一致。
- **staging smoke（untracked・実行後削除・file capture・1回・LLM 0）**: synthetic structured→fake extractor→real RPC で seed1+evidence1 setup → REALITY_CAPTURE_SURFACE=true+canary+staging で実 route POST → `data.captureCandidate`(hasCandidate=true・candidateCount=1・itemCount=1・evidenceSource=seed_explicit) + 既存 8 keys 全維持 + source_ref/UUID 非含有 → cleanup rows=0/userTotalReality=0。setupRpcCalls=1・setupLlmCalls=0・routeStatus=200。
- test surface module **17**（resolveSurfaceGate / loadPendingProjected(canonical 委譲・fail-open) / buildCaptureSurfaceFromProjected(gate block→read 0・seed_explicit→hasCandidate・prm_typical/no-evidence→false・read null/throw→null・redaction) / 静的(`.from`/write/createClient 不在=single-read-source 遵守)）+ route **17**（既存 13 + 新 4: surface null→captureCandidate 無・既存 data 完全一致 / candidate present→additive・envelope 不変 / surface throw→fail-open 200 / 404·401·400 で surface 呼ばない）+ 既存 consumption 21 + bridge 15 不変 + **guardrail test 復帰** + reality **889 PASS**・自ファイル tsc 0（full tsc 0 ではない・baseline 1114）。
- → **C案 visible route integration 成立**: route response に `captureCandidate?` を additive・read-only consumption・fail-open・後方互換・production gated。**UI/PlanClient 非接続**。
- **しない（A1-5-7-5 範囲外）**: UI·PlanClient 接続 / production flag ON / RealityInput 本接続 / generateCandidates runtime / PRM·correction 実接続 / remote。

### 8.46 A1-5-7-6 実装（landed）— Capture Candidate UI Surface（控えめ banner・additive・absent→既存 UI 完全不変・no-DB・no-production）

A1-5-7-6（route response の `data.captureCandidate?` を UI で控えめに表示・UI-only・既存 UI 後方互換最優先）:
- **read-only audit**: `/api/alter-morning/plan` V2 route は**未配線**（fetch なし・default OFF）。MorningPlanCard は `plan: MorningPlan`（legacyAdapter 経由）を受け、captureCandidate は届かない。AskHero が MorningPlanCard を render。→ **最小・外科的**: pure presenter + 控えめ banner + MorningPlanCard **optional prop** additive（prop 未提供＝既存 UI 完全不変・V2 route 消費は将来 slice）。
- **`components/home/morning/captureCandidatePresenter.ts`**（新規・pure）: `presentCaptureCandidate(dto): CaptureCandidateDisplay | null`。absent/hasCandidate=false → null。**evidenceSource の技術名（seed_explicit/correction）を友好ラベル**（「あなたが話した内容から」/「これまでの調整から」）へ写す・band→「朝/昼/夕方」・duration→「約N分」。**source_ref/UUID/raw を出さない**。
- **`components/home/morning/CaptureCandidateBanner.tsx`**（新規・pure presentational）: presenter → null（absent）or 控えめ banner（「候補があります（候補）」+ note + items）。**断定しない**（「確定」でなく「候補」）。design 整合（subtle purple tint）。
- **MorningPlanCard 配線（最小 4 箇所）**: import + optional `captureCandidate?: CandidateSurfaceDTO` prop + destructure + motion.div 直下に `<CaptureCandidateBanner candidate={captureCandidate} />`。**prop 未提供（現状 AskHero 未変更）→ banner null → 既存 UI 完全不変**。
- test 19: presenter（absent→null / present→控えめ・友好ラベル / 技術名 enum 非露出 / UUID·source_ref 非露出）+ banner（renderToStaticMarkup: absent→空 markup / present→「候補があります」「約60分」友好ラベル / enum·source_ref·UUID·hasCandidate が DOM 非出）+ MorningPlanCard 静的配線（optional prop + banner render + 既存 prop 維持）。reality **908 PASS**（889→+19）・自ファイル tsc 0（full tsc 0 ではない・baseline 1114）・既存 plan test pattern（renderToStaticMarkup・env=node）踏襲。
- → **captureCandidate を UI で控えめに表示する banner + MorningPlanCard 配線確立**。**absent→既存 UI 完全不変・evidenceSource 技術名 非露出・source_ref/UUID/raw が DOM 非到達・DB/network 0**。現状 live では未表示（V2 route 未消費ゆえ prop dormant）。
- **しない（A1-5-7-6 範囲外）**: production 接続 / PlanClient の実 DB/API 接続変更 / V2 route 消費配線（AskHero→fetch） / PRM·correction 実接続 / production flag ON / remote。

### 8.47 A1-5-7-7 実装（landed）— V2 Route Consumer Bridge（client・dormant・no-real-network・flag default off・既存 UI 不変）

A1-5-7-7（V2 route response の `data.captureCandidate?` を client で抽出し MorningPlanCard へ流す bridge・**dormant**・本番挙動不変）:
- **read-only audit**: AskHero は `morningPlan` を **prop で受け取る**（自身 fetch しない・data 源は親）。captureCandidate も同様に親→AskHero→MorningPlanCard で流す形。AskHero は `"use client"`・client flag は `NEXT_PUBLIC_`。
- **新 client flag `realityCaptureSurfaceClient`**（env `NEXT_PUBLIC_REALITY_CAPTURE_SURFACE_CLIENT`・**default false**）。**default OFF → fetch 0・captureCandidate undefined・既存 UI 完全不変**（dormant）。
- **`components/home/morning/captureCandidateClient.ts`**（新規・client bridge・no-DB）:
  - `selectCaptureCandidate(responseJson): CandidateSurfaceDTO | undefined`（pure adapter）。ok!==true / data なし / captureCandidate なし / hasCandidate!==true → undefined。有効時は **`redactCaptureCandidateSurface`（A1-5-7-2・client boundary 最終 redaction）で再構築**（source_ref/UUID/raw を保持しない）。
  - `fetchCaptureCandidate({enabled, body, fetchImpl?}): Promise<...>`（**gated fetch・DI fetchImpl・fail-open**）。`enabled=false` → **fetchImpl を呼ばず undefined（fetch 0・real network なし）**。enabled → POST → selectCaptureCandidate。失敗 → undefined。
- **AskHero 配線（最小 4 箇所・dormant）**: import + optional `morningCaptureCandidate?: CandidateSurfaceDTO|null` prop + destructure + MorningPlanCard へ `captureCandidate={morningCaptureCandidate}`。**親未供給（現状）→ undefined → banner null → 既存 UI 完全不変**。親の live fetch は別 GO。
- test 15: selectCaptureCandidate（非object/ok!==true/data なし/captureCandidate なし/hasCandidate=false→undefined / candidate→DTO / **汚染(source_ref/seedRef)→client boundary で drop**）+ fetchCaptureCandidate（**enabled=false→fetchImpl 未呼出=fetch 0** / enabled+fake candidate→DTO(POST /api/alter-morning/plan) / no candidate→undefined / throw/ok:false→undefined fail-open）+ propagation（bridge→banner「候補があります」/ flag off→banner 空 markup / 汚染 response 経由でも DOM に source_ref/UUID/enum 非出）+ AskHero 静的配線（morningCaptureCandidate prop + MorningPlanCard へ pass + 既存 props 維持）。reality **923 PASS**（908→+15）・自ファイル tsc 0（full tsc 0 ではない・baseline 1114）。real network 0（fake fetchImpl）。
- → **V2 route response → MorningPlanCard.captureCandidate の client bridge + AskHero 配線確立（dormant・flag default off・fetch 0・既存 UI 完全不変）**。live 表示は親の fetch 配線（別 GO）で完成。
- **しない（A1-5-7-7 範囲外）**: 親の live fetch（AskHero parent→V2 route）/ real network / 実 route call / route.ts·route response 変更 / DB / production / production flag ON / PRM·correction / remote。

### 8.48 A1-5-7-8 実装（landed）— Consumer Wiring Audit + Inert Submit Bridge（audit + dormant bridge・live fetch 延期）

A1-5-7-8（V2 route fetch の接続点を audit で確定 + inert submit bridge・**live fetch は audit 結果で延期**・production 不変）:
- **重大な audit 発見**: production morning flow は **`useAlterChat.sendMessage(text)` → `/api/stargazer/alter`**（AneurasyncHome が useAlterChat 経由で morningPlan を得る・`setMorningPlan(data.morningProtocol.plan)`）。**V2 route `/api/alter-morning/plan` は UI から一切呼ばれていない**（Wave 3・`ALTER_MORNING_V2_ROUTE_ENABLED` default OFF・未消費）。
  → **capture pipeline（write+surface）は V2 route に配線されているが、production morning は別 route（/api/stargazer/alter）**。captureCandidate（V2 response）は production flow に存在しない。
- **判断: live fetch は実行しない（条件曖昧）**。CEO 条件「route bodyが既存submitから自然に作れる」が**曖昧**: 既存 submit は /api/stargazer/alter へ送る。V2 を別途呼ぶのは**重複 call**（runMorningPipeline の追加 LLM + fire-and-forget capture write 発火 + surface read）。CEO 指示「1つでも曖昧なら inert で止める」に従い **inert bridge + tests + docs で停止**。
- **正道（別 GO）**: ① V2 route を production morning route 化（Wave 3 migration）→ UI が V2 を fetch すれば captureCandidate も来る / ② capture surface を /api/stargazer/alter（production route）側へ移す。いずれも大規模・別 GO。
- **inert submit bridge（dormant・`captureCandidateClient.ts` 追加）**:
  - `buildCaptureCandidateRequestBody(submit): { utterance, targetDateHint? }`（**pure・必要最小限 body**・utterance のみ + 任意 targetDateHint・phenotype/weather 等載せない・raw を余計に持ち込まない）。
  - `submitForCaptureCandidate(submit, {enabled, fetchImpl?})`（**inert・gated・fail-open**）= buildBody → `fetchCaptureCandidate`。enabled=false → fetch 0 → undefined。**AneurasyncHome/useAlterChat は変更しない**（重複 call 配線を入れない＝production flow 完全不変）。
- test +7（buildCaptureCandidateRequestBody: utterance のみ / targetDateHint 付き = 最小 body / submitForCaptureCandidate: enabled=false→fetch 0 / fake candidate→DTO・body は utterance のみ / no candidate→undefined / error→undefined fail-open / propagation submit→banner）。capture client bridge **22 tests**・reality **930 PASS**（923→+7）・自ファイル tsc 0（full tsc 0 ではない・baseline 1114）。**real network 0（fake fetchImpl）**。
- → **V2 route fetch の接続点を audit で確定（production morning は別 route ゆえ live は重複・延期）+ inert submit bridge（最小 body helper + gated submit）確立**。**flag OFF→fetch 0・既存 UI/production flow 完全不変**。
- **しない（A1-5-7-8 範囲外）**: live fetch / 実 route call / AneurasyncHome·useAlterChat wiring / route.ts·route response 変更 / DB / Supabase / production / production flag ON / PRM·correction / remote。

### 8.49 A1-5-8-0/1 実装（landed・audit + decision + pure skeleton）— Production Morning Route Alignment（route mismatch 解消方針=B案・`morningProtocol.captureCandidate`・route 未変更・production 完全不変）

A1-5-8-0/1（capture pipeline と production morning flow の **route mismatch** をどう解消するか方針決定 + B案 pure contract skeleton・**route.ts 実変更 0 / production 接続 0 / DB 0 / 実 LLM 0 / UI 配線 0**）:
- **mismatch（A1-5-7-8 audit 確定の再掲）**: capture pipeline（write + surface）は **V2 route `/api/alter-morning/plan`** に配線。だが production morning flow は **`useAlterChat.sendMessage(text)` → `/api/stargazer/alter`**（`runMorningPipeline` を内部呼出し・`{ morningProtocol: { phase, sessionId, plan, ... } }` を返す）。**V2 route は UI 未消費**＝capture surface は production response に存在しない。
- **A案（V2 route を production morning route へ昇格）**: AneurasyncHome/useAlterChat を /api/stargazer/alter → /api/alter-morning/plan へ載せ替え（Wave 3 migration）。
  - 長所: capture が初めから配線済みの route が production になる。
  - 短所: /api/stargazer/alter は 10500 行・morning 以外の chat phase も担う巨大 route。morning だけ別 route に分離するのは **dual-route**（morning は V2・他は alter）化＝二重 flow。response 形（morningProtocol envelope）も異なり UI 全面改修。**production flow を壊すリスク最大**。CEO 既存方針「dual-route 回避・production flow を壊さない」に反する。
- **B案（capture surface を /api/stargazer/alter へ統合）★推奨**: production route（/api/stargazer/alter）の morning path に、A1-5-7-5 で確立済みの **read-only surface（`buildMorningCaptureSurface` + `appendCaptureCandidateToMorningResult`）を additive 適用**し、`morningProtocol.captureCandidate?` として返す。
  - 長所: **single route**（既存 production flow をそのまま使う）。response は **additive optional**（既存 morningProtocol keys 不変＝後方互換最優先）。client は既に `data.morningProtocol.plan` を読む → captureCandidate も同じ morningProtocol 直下が自然（最小配線）。A1-5-7-5 の surface module（canonical 委譲・fail-open・gated）をそのまま再利用。**dual-route を作らない**。
  - 短所: 10500 行 route の morning 応答組立て箇所に 1 点だけ additive を足す必要（別 GO・route 実変更）。
  - **判断: B案推奨**（CEO 仮説と一致・audit でも覆らず）。理由: ①production flow を壊さない（single route・additive） ②後方互換（既存 keys 不変・flag OFF で完全 no-op） ③capture write と surface read を分離できる（surface read=fail-open additive / capture write=別 gate・別 GO） ④UI は morningProtocol を既に読むため最小配線。A案は dual-route 化＋全面改修で「今はやらないこと」に反する。
- **contract 確定（B案）**: capture surface は **`morningProtocol.captureCandidate?: CandidateSurfaceDTO`**（A1-5-7-5 の redacted DTO・seedRef/source_ref/UUID 非含有）。
  - **server 側**: 既存 **汎用 `appendCaptureCandidateToMorningResult<T extends object>(result, surface)`**（A1-5-7-2・pure・generic・additive・fail-open）を **morningProtocol object にそのまま適用**（V2 route と同一 assembler を再利用＝drift なし）。新規 server コードは route 実変更（別 GO）まで書かない。
  - **client 側**: **`selectMorningProtocolCaptureCandidate(responseJson)`**（新規・pure・`captureCandidateClient.ts`）。`morningProtocol.captureCandidate` を抽出し **`redactCaptureCandidateSurface` で client boundary 最終 redaction**。morningProtocol なし / captureCandidate なし / hasCandidate!==true → undefined（既存 UI 不変・fail-open）。既存 `selectCaptureCandidate`（V2 contract `data.captureCandidate`）は `toRedactedCaptureCandidate` 共有 helper に refactor（**挙動不変**・両 contract が同一 redaction core）。
- **pure skeleton のみ（本 slice）**: contract extractor + 汎用 assembler 再利用の **型・redaction 境界を確定するテストのみ**。route 実変更・surface read 配線・UI 配線は **別 GO**。
- test +9: `selectMorningProtocolCaptureCandidate`（morningProtocol なし/captureCandidate なし/hasCandidate=false→undefined / present→DTO / 汚染(source_ref/seedRef/UUID)→client boundary で drop / **V2 contract `data.captureCandidate` には反応しない**（B案 extractor は morningProtocol を読む）/ 既存 morningProtocol keys を壊さない=read-only）+ server reuse（`appendCaptureCandidateToMorningResult` を morningProtocol 形 object へ: no candidate→deep-equal・既存 keys 不変 / candidate→captureCandidate のみ additive）。capture client bridge **29 tests**（22→+7）・reality **937 PASS**（930→+7）・自ファイル tsc 0（full tsc 0 ではない・baseline 1114）。
- → **route alignment 方針を B案に確定**（single route・additive `morningProtocol.captureCandidate?`・後方互換最優先・dual-route 回避）+ **B案 pure contract skeleton（extractor + 汎用 assembler 再利用）確立**。**route 未変更・production 完全不変**。
- **次の最小 slice（別 GO・B案 step 1）**: /api/stargazer/alter の morning 応答組立てに **surface read を additive 適用**（`appendCaptureCandidateToMorningResult(morningProtocol, await buildMorningCaptureSurface(...))`・**flag gated・fail-open・既存 keys 不変**）。**capture write（fire-and-forget）はこの slice に含めない＝別 gate・別 GO**（surface read GO ≠ capture write GO）。
- **しない（A1-5-8-0/1 範囲外）**: route.ts 実変更 / /api/stargazer/alter·/api/alter-morning/plan 実変更 / production 接続 / live fetch / real network / DB read/write / Supabase 実接続 / RPC / 実 LLM / UI·PlanClient 接続 / production flag ON / capture write 配線 / remote。

### 8.50 A1-5-8-2 実装（landed）— Stargazer Surface Read Additive Integration（B案 step 1・本流 `/api/stargazer/alter` に `morningProtocol.captureCandidate?` を additive・read-only・fail-open・gated・後方互換・production 不変）

A1-5-8-2（B案 step 1・本 arc 初の **production 本流 route 実変更**・surface read のみ・**capture write 非接続**・**実 LLM await なし**）:
- **read-only audit（10500 行 route）**: `morningProtocol` の組立ては **単一 return point（成功パス `return NextResponse.json({...})`）の inline object** のみ（assembly 1 箇所）。emit 条件 `morningResponse && morningResponse.phase !== "skipped"`。error path（`catch → 500`）/ 401 / envelope は別経路。`userId`/`supabase`（tierCheck/supabaseServer 由来）・`shadowLlmTargetDate: string|null`（LLM 解決済 morning 対象日）は return 直前で in scope。→ **接続点は 1 つ**（inline morningProtocol へ 1 行 spread）。
- **接続設計（最小・外科的）**: inline object を**再配置せず**、pre-return で fragment を算出 →（emit と同一 gate）→ morningProtocol 内に **`...captureCandidateFragment` 1 行 spread**。
  - pre-return: `const captureCandidateFragment = (morningResponse && phase!=="skipped") ? await resolveMorningProtocolCaptureFragment(() => buildMorningCaptureSurface(supabase as unknown as PendingCapturedRowsReadClient, userId, shadowLlmTargetDate ?? undefined)) : {}`。
  - inline 末尾: `...captureCandidateFragment,`（候補有→`captureCandidate` 1 key・無→`{}`＝no-op）。
- **新規 pure helper 2 つ（既存 module へ最小追加）**:
  - `morningProtocolCaptureCandidateFragment(surface)`（**`candidate-response-assembler.ts`・pure**）: 候補無→`{}` / 候補有→`{ captureCandidate: redactCaptureCandidateSurface(surface) }`。`appendCaptureCandidateToMorningResult` の **spread 版**（merge 後 object でなく fragment を返す・**同一 redaction core 共有**）。inline object へ 1 行 spread する用途。
  - `resolveMorningProtocolCaptureFragment(loader)`（**`morning-capture-surface.server.ts`・server・DI fail-open seam**）: `try loader()` → throw/null → `{}`（read 失敗でも response 成功を壊さない）→ fragment。route の fail-open 経路を**テスト可能化**。
- **surface read 設計（A1-5-7-5 再利用・read 経路不変）**: `buildMorningCaptureSurface`（cheap guard→gate→canonical column-restricted read→bridge→DTO・**never-throw・read-only・実 LLM なし・single-read-source 遵守**）。route は read 実装を持たず helper に委譲。
- **flag / gate / production hard block**: **既存 `realityCaptureSurface`（env `REALITY_CAPTURE_SURFACE`・default OFF）を再利用**（新 flag 追加なし）。gate=`evaluateCaptureGate`（**多層 production hard block**: ① kill 最優先 ② flag off ③ `nodeEnv==="production"` ④ ref 未解決 ⑤ production ref(aljav) ⑥ 非 staging(hjcr) ⑦ no user ⑧ canary 空=fail-closed ⑨ 非 canary）。→ **production(aljav) では gate が必ず block**＝captureCandidate は出ない。**staging(hjcr)+canary user でのみ surface**。**default OFF → 全環境で完全 no-op（read 0・production 挙動変更 0）**。production 有効化は gate 変更を伴う**別 GO**。
- **response contract（後方互換最優先）**: additive optional のみ。候補無/flag off/gate block/read 失敗 → fragment=`{}` → **morningProtocol 完全不変**（plan / dialogState / planStateV2 / rawInputs / parsedIntent / sufficiency / pendingClarify / persistedEvents / sessionId / phase / pipelineVersion / personalizeHints / clarifyQuestion / _debug を消さない）。候補有 → `captureCandidate` 1 key のみ追加。**top-level envelope（ok/sessionId/response/...）不変・error path(500) 不変**（spread は morningProtocol 内のみ）。
- **fail-open 多層**: cheap guard(flag/kill)→gate block→read null→bridge error→`buildMorningCaptureSurface` never-throw→`resolveMorningProtocolCaptureFragment` try/catch→fragment `{}`→spread no-op。
- **capture write 分離**: 本 slice は **surface read のみ**。fire-and-forget capture write は **非接続**（別 gate・別 GO）。
- test +15（fake/no-run・DB write 0・RPC 0・Supabase 実接続 0・実 LLM 0）:
  - `morningProtocolCaptureCandidateFragment`（null/undefined/hasCandidate=false→`{}` / 候補有→`{captureCandidate:redacted}` / realistic morningProtocol へ spread: 候補無→deep-equal no-op・候補有→plan/dialogState/planStateV2/rawInputs/parsedIntent 維持+1 key / top-level envelope 不変 / 汚染(source_ref/seedRef/UUID/raw)→leak なし / collectStringValues 安全）。
  - `resolveMorningProtocolCaptureFragment`（loader→候補→fragment / null→`{}` / **throw→`{}` fail-open** / hasCandidate=false→`{}` / 汚染→leak なし / loader 1 回 await / 静的 write 不在）。
  - capture bridge/surface 既存不変。reality **952 PASS**（937→+15）。
- **tsc baseline 分離**: 自変更（route 3 接続点 + assembler fragment + surface seam + 2 test）**新規 error 0**。route.ts の既存 error 15 件は **pre-existing baseline**（perspectiveEngine 型 / ModeDecisionReason / TrustLevel 等・本変更行と無関係）。project 全体 **1114（baseline 不変）**＝full tsc 0 ではない。
- **staging smoke 非実施（判断）**: 新規コードは pure/DI orchestration（fragment + resolve seam）で fake 完全網羅。**read 経路は A1-5-7-5 から不変**（staging smoke で real seed→candidateCount=1→cleanup 実証済）。route wiring は tested fragment の 1 行 spread。alter route 全体の E2E smoke は auth+LLM+pipeline の全 mock を要し 10500 行 handler に対し非現実的＋同一 read 経路の再検証ゆえ、**staging を不要に触らない**保守判断で skip。
- → **production 本流 `/api/stargazer/alter` が `morningProtocol.captureCandidate?` を additive 返却可能に（read-only・fail-open・gated・後方互換）**。**default OFF で production 挙動変更 0**。capture write・UI live・production 有効化は別 GO。
- **しない（A1-5-8-2 範囲外）**: capture write 接続 / DB write / RPC / real write client / 実 LLM 追加 call / route response のための 実 LLM await / production 接続 / production flag ON / service_role / UI·PlanClient 追加接続 / raw·prompt·response 本文·source_ref·UUID·apiKey 出力 / PRM·correction 実接続 / generateCandidates runtime 本接続 / remote。

### 8.51 A1-5-8-3 実装（landed）— Stargazer Client Consumption Wiring（B案 step 2・`morningProtocol.captureCandidate` を `useAlterChat → AneurasyncHome → AskHero → MorningPlanCard` に流す・client-consumption・no-DB・no-production・既存 UI 不変・route 未変更）

A1-5-8-3（B案 step 2・client consumption・**route.ts 未変更・DB 0・production 0・capture write 非接続**・既存 production morning flow の state 更新を壊さないことを最優先）:
- **read-only audit**: 下流（AskHero `morningCaptureCandidate?` prop → MorningPlanCard `captureCandidate?` → `CaptureCandidateBanner`）は **A1-5-7-6/7 で既に配線済**。欠落リンクは **2 箇所のみ**: ① `useAlterChat` が response から captureCandidate を抽出し state 公開 ② `AneurasyncHome` が AskHero へ 1 prop 供給。production morning flow は `useAlterChat.sendMessage → /api/stargazer/alter`（`data.morningProtocol`）・place selection は別経路（`data.morningSession`・captureCandidate 非搬送）。
- **`useAlterChat`（4 箇所・最小）**:
  - import `selectMorningProtocolCaptureCandidate`（A1-5-8-0/1・client boundary 最終 redaction）+ type `CandidateSurfaceDTO`。
  - state `morningCaptureCandidate`（**transient**・`useState<CandidateSurfaceDTO | undefined>(undefined)`・**永続化しない**・`restoredSession` 非依存）。
  - response handler の **`if (data.morningProtocol)` ブロック末尾**（既存 morning setter 群の後）に `setMorningCaptureCandidate(selectMorningProtocolCaptureCandidate(data))` を **read-only 追加**（既存 `setMorningPlan(data.morningProtocol.plan)` 等は不変）。captureCandidate absent → undefined（毎 turn 再導出＝候補消滅時クリア）。
  - return に `morningCaptureCandidate` を公開（return 型は推論・既存 field 不変）。
- **`AneurasyncHome`（1 prop）**: `<AskHero morningCaptureCandidate={alterChat.morningCaptureCandidate} />`（既存 morning props の隣・additive）。
- **redaction / 後方互換**: `selectMorningProtocolCaptureCandidate` が `morningProtocol.captureCandidate` のみ読み **redacted DTO** を返す（source_ref/UUID/raw drop）。**raw response を state に持たない**。absent / **flag OFF（production default）→ server が captureCandidate を emit しない → state 常に undefined → banner 非表示 → 既存 UI 完全不変**。
- test +16（fake/no-run・DB 0・Supabase 0・real network 0・実 LLM 0）:
  - consumption（**`/api/stargazer/alter` 形 response**: top-level ok/sessionId/response + 完全 morningProtocol）: captureCandidate 無→state undefined・**既存 plan/dialogState/planStateV2/rawInputs 不変（read-only）** / present→redacted DTO / hasCandidate=false→undefined / **error response（{error}/{ok:false}）→undefined（既存挙動不変）** / extraction は response を mutate しない。
  - banner: present→「候補があります」/ absent→空 markup（UI 既存同等）/ error→空 markup。
  - non-surface: 汚染 captureCandidate→state（抽出値）leak なし / banner DOM leak なし（enum 技術名も非表示）/ state は raw response 本文・plan text・他 morningProtocol field を保持しない。
  - 静的 wiring: AneurasyncHome が `morningCaptureCandidate={alterChat.morningCaptureCandidate}` を渡す / useAlterChat が `setMorningCaptureCandidate(selectMorningProtocolCaptureCandidate(data))` + return / **既存 `setMorningPlan(data.morningProtocol.plan)` を壊していない**。
  - reality **968 PASS**（952→+16）。
- **テスト哲学**: `declinedRecovery.test.ts` 同様、hook を renderHook せず **pure 抽出（`selectMorningProtocolCaptureCandidate`）を realistic response 形でテスト + 静的 wiring + 型 + diff** で固定（codebase の確立パターン・no-run）。
- **tsc baseline 分離**: 自変更（useAlterChat / AneurasyncHome / test）**新規 error 0**。project 全体 **1114（baseline 不変）**＝full tsc 0 ではない。
- → **`/api/stargazer/alter` の `morningProtocol.captureCandidate?` が client（useAlterChat state）→ AskHero → MorningPlanCard → banner まで貫通**。**flag OFF（production default）で state 常に undefined・既存 UI 完全不変**。live 表示は staging+canary（A1-5-8-2 gate）でのみ。
- **しない（A1-5-8-3 範囲外）**: route.ts 追加変更 / /api/alter-morning/plan 変更 / DB read·write / Supabase 実接続 / RPC / capture write 接続 / 実 LLM 追加 call / production 接続 / production flag ON / service_role / raw·prompt·response 本文·source_ref·UUID·apiKey を state·DOM に出す / PRM·correction 実接続 / generateCandidates runtime 本接続 / remote。

### 8.52 A1-5-8-4 副作用 audit（landed・doc-only）— Stargazer Surface E2E Staging Smoke：**実 route call SKIP 判定**（10500 行本流 route の副作用 audit 結果 UNSAFE）＋安全な代替案

A1-5-8-4（条件付き GO・「10500 行本流 route を実行する前に副作用を必ず audit し、安全条件が曖昧なら実 route call をしない判断を優先」・**前提を疑い audit で決定**）:
- **preflight**: main HEAD=4ef28e0d / staging pin=`hjcrvndumgiovyfdacwc` / production denylist=`aljavfujeqcwnqryjmhl`（参照のみ・接続なし）。
- **route 副作用 audit 結果（`/api/stargazer/alter`・read-only grep）**:
  - **DB write = 80 操作 / 13+ テーブル**: `stargazer_analytics`(23 insert+2 delete) / `stargazer_alter_patterns`(6 update+5 insert) / `stargazer_alter_hypotheses`(4 update+2 insert) / `stargazer_alter_context`(3+3) / **`stargazer_alter_dialogues`(2 insert)** / `stargazer_alter_consent`(2 upsert) / `stargazer_alter_causal_map`(2 update) / `stargazer_mi_convergence_state`(1) / `stargazer_implicit_signals`(1) / `stargazer_alter_reactions`(1) / `stargazer_alter_person_map`(2) / `stargazer_alter_narratives`(1) + `alter_morning_plan_history`(`upsertPlanHistory` helper)。**全て条件付き**（会話 path 依存・どれが発火するか request 前に列挙不能＝副作用範囲不明確）。
  - **raw発話保存**: `stargazer_alter_dialogues.insert` が **`message`=ユーザー raw 発話 + `emotional_context.question`=raw 質問 + alter `message`=応答本文** を DB 永続化 → GO の **「raw発話保存 0」を直接違反**。
  - **実 LLM call（追加発生）**: `runMorningPipeline`(comprehension+narration provider×3 site) / `generateAlterResponse`(main) / **`runPerspectiveEngine`(web 検索+LLM)** / Gemini utterance reading。非決定的・課金・cleanup 不能。
  - **capture write は本 route で非発火**（`fireMorningCapture` 不在）→ route は **reality rows(plan_seeds/evidence) を write しない**・代わりに上記 13+ の **非 reality テーブル**へ write。
- **cleanup スコープ不整合（決定的）**: GO の cleanup＝「reality rows(plan_seeds+evidence)=0」。だが route の write は **13+ の非 reality テーブル + plan_history + dialogues(raw発話)**。これらは reality cleanup スコープ**外** → **cleanup 不能（DB 汚染が残る）**。
- **判定: 実 route call は決定的に UNSAFE → SKIP**（route call 0・controlled setup 0・DB write 0）。GO の複数 STOP 条件成立: ①route副作用が不明確（80 条件付き write） ②cleanup 不能な write（13+ 非 reality テーブル + raw発話 dialogues） ③raw発話保存 ④実 LLM 追加 call。GO「1つでも曖昧なら route call は実行せず停止」「安全条件が曖昧なら実 route call をしない判断を優先」に従う。
- **E2E は既に piecewise 実証済（安全な代替案 1）**: 全鎖は分割検証済 — ① **read→surface DTO（実 staging）**＝§8.40/§8.45 **A1-5-7-5 staging smoke**（real seed+evidence→`buildMorningCaptureSurface`→captureCandidate hasCandidate=true/candidateCount=1/redacted→cleanup→reality rows=0。route は同一 `buildMorningCaptureSurface` を使用） ② **DTO→morningProtocol fragment**＝§8.50 A1-5-8-2 fake（`resolveMorningProtocolCaptureFragment`+`morningProtocolCaptureCandidateFragment`・pure） ③ **morningProtocol.captureCandidate→client DTO**＝§8.49/§8.51 A1-5-8-0/1+A1-5-8-3 fake（`selectMorningProtocolCaptureCandidate`・pure） ④ **client DTO→banner**＝§8.46/§8.51 A1-5-7-6+A1-5-8-3 fake（`CaptureCandidateBanner`・pure）。pure 変換は固定 DTO 形上で決定的ゆえ、real-read(①実証)＋pure 合成(②③④fake 実証)で全鎖が成立。
- **安全な代替案 2（将来別 GO・単一 real-data E2E pass が欲しい場合）**: **route shell を呼ばず surface 関数を直接呼ぶ reality-only smoke**。write は **seed+evidence のみ（RPC・STAGING_USER_A・hjcr-pin・aljav-denylist・service_role 0）→ cleanup は reality rows のみで完結（route と違い cleanup 可能）**。`buildMorningCaptureSurface`→`resolveMorningProtocolCaptureFragment`→fragment を morningProtocol 形へ spread→`selectMorningProtocolCaptureCandidate`→`CaptureCandidateBanner` render→cleanup(seed delete・evidence FK cascade)→reality rows=0。route の LLM/非 reality write/raw発話保存を一切伴わず E2E を実証できる。file capture/redacted report は最初から設計する。
- **doc-only**: コード変更 0・smoke 実行 0・**DB write 0・DB 汚染 0**・controlled setup 0・route call 0・実 LLM 0・production 接触 0・capture write 0・route.ts 変更 0・UI 変更 0・service_role 0・raw/source_ref/UUID/apiKey 出力 0・remote 0。
- **しない（A1-5-8-4 範囲外）**: 実 route call / controlled DB write / production 接続 / production flag ON / capture write 接続 / 実 LLM call / route.ts·UI 変更 / PRM·correction 実接続 / generateCandidates runtime 本接続 / remote。

### 8.53 A1-5-8-5 preflight BLOCKED（landed・doc-only）— Stargazer Surface Direct E2E Smoke：**実 staging write 不可（資格情報不在 + CLI が production link）→ smoke 非実行（write 0）**＋安全 harness 設計

A1-5-8-5（reality-only / controlled-write / no-route-shell / no-production・**route shell を叩かず surface read chain だけを実 staging row で検証する安全代替 E2E**・file capture 設計・**前提を疑い preflight で決定**）:
- **preflight 結果（read-only・秘密値は一切出力せず presence のみ）— 実 staging write 不可**:
  - **staging 資格情報が全て UNSET**: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `STAGING_USER_A_EMAIL` / `STAGING_USER_A_PASSWORD` / `STAGING_SUPABASE_PROJECT_REF` / `REALITY_CAPTURE_SURFACE` = いずれも UNSET。`.env` / `.env.local` / `.env.staging` 不在（`.env.example` のみ）。→ **anon + signInWithPassword（既存 `scripts/staging-smoke/a2-rls-api-smoke.ts` の認証パターン）が成立しない＝staging へ認証不能＝準拠 write 不可能**。
  - **⚠ 重大な安全所見: Supabase CLI が PRODUCTION(aljav) に link**（`supabase/.temp/project-ref = aljavfujeqcwnqryjmhl`）。**この環境の既定 DB パスは production**。資格情報無しで write しようとすれば、唯一接続可能な CLI 経由＝aljav(production) へ向かうリスク。GO STOP 条件「**aljavに向きそう**」が現実に成立。
- **判定: smoke 非実行（write 0・DB 接続 0・RPC 0）**。GO 複数 STOP 条件成立: ①**staging pin 不一致**（URL UNSET で hjcr に pin 不能） ②**aljavに向きそう**（CLI が production link） ③**signed-in user id 検証不能**（sign-in 不可） ④**cleanup 不能**（staging に接続できず write→cleanup が成立しない）。GO「URL host ref===hjcr」preflight FAIL・「cleanup 不能なら write しない」「1つでも曖昧なら停止」に従う。**秘密値（anon key/password/service_role）は一切出力していない**。
- **E2E は既に piecewise 実証済（§8.52 と同一論拠）**: ①read→surface DTO（実 staging）=A1-5-7-5 staging smoke ②③④ DTO→fragment→client DTO→banner=A1-5-8-2/0/1/3・A1-5-7-6 pure fake。**gap は単一 real-data E2E pass のみ・それも env（staging 資格情報不在 + CLI が production link）が原因でありコードは完成・検証済**。
- **安全 harness 設計（staging 資格情報が供給され CLI を hjcr へ re-pin/bypass した環境で原則1回で実行可能）**:
  - env: `NEXT_PUBLIC_SUPABASE_URL`(hjcr) / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `STAGING_USER_A_EMAIL` / `STAGING_USER_A_PASSWORD` / `STAGING_SUPABASE_PROJECT_REF=hjcr` / `REALITY_CAPTURE_SURFACE=true` / canary allowlist=USER_A。
  - guards（write 前必須）: URL host ref===hjcr else fatal / anon key に "service_role" 非含有 / aljav denylist / signed-in user id===USER_A。
  - setup（RPC ≤1・実 LLM 0）: synthetic structured → `createExtractedFakeExtractor`（LLM 0）→ `runCaptureService` → `createRpcCaptureWriteClient` → `create_plan_seed_capture_bundle`（RPC ×1）→ seed1+evidence1（raw発話保存なし）。
  - chain（surface 関数直呼び・route shell 非実行）: `buildMorningCaptureSurface(authedClient, USER_A, targetDate)` → surface(hasCandidate=true/candidateCount=1/redacted) → `resolveMorningProtocolCaptureFragment(()=>surface)` → fragment → **fake `morningProtocol`（plan/dialogState/… を持つ）へ spread**（既存 keys 不変）→ `selectMorningProtocolCaptureCandidate({morningProtocol})` → redacted DTO → `renderToStaticMarkup(<CaptureCandidateBanner candidate={dto}/>)` →「候補があります」。
  - cleanup: `plan_seeds` を id=seedId ∧ user_id=USER_A で delete → evidence FK cascade → seed rows=0 / evidence rows=0 / USER_A reality 総数=0 を確認。
  - redacted report（file capture・最初から設計）: setupRpcCalls/setupLlmCalls/surfaceHasCandidate/surfaceCandidateCount/surfaceRedacted/fragmentHasCaptureCandidate/morningProtocolKeysPreserved/clientDtoRedacted/bannerShowsCandidate/cleanupError/seedRowsAfter/evidenceRowsAfter/userTotalReality — **raw/source_ref/UUID/prompt/response 本文/apiKey は出さない**。
- **doc-only**: smoke 実行 0・**DB write 0・DB 接続 0・RPC 0・実 LLM 0**・controlled setup 0・route shell 実行 0・production 接触 0・capture write 0・route.ts 変更 0・UI 変更 0・service_role 0・秘密値出力 0・remote 0。
- **しない（A1-5-8-5 範囲外）**: 実 staging write / staging·production 接続 / route shell 実行 / capture write 接続 / 実 LLM / route.ts·UI 変更 / 秘密値・raw・source_ref・UUID 出力 / PRM·correction 実接続 / remote。

### 8.54 A1-5-ENV-1 環境安全性 audit（landed・doc-only）— Staging Environment Safety Recovery：**CLI が production link + smoke env 不在 → 安全 runbook 作成**（write 0・CLI re-link 0・smoke 0）

A1-5-ENV-1（A1-5-8-5 で検出した「CLI が production link」への対応・**production 汚染防止を最優先**・read-only / runbook / doc-only・**CLI re-link は CEO 明示許可なしゆえ非実施**）:
- **現状 audit（read-only・秘密値は presence のみ・値出力 0）**:
  - **⚠⚠ Supabase CLI が production(aljav) link**: `supabase/.temp/project-ref = aljavfujeqcwnqryjmhl` → 既定 DB パスが production → 不用意な `supabase db push`/`db reset`/`migration repair` は production 汚染リスク。
  - **smoke 必要 env key 7 つ全 MISSING**: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `STAGING_SUPABASE_PROJECT_REF` / `STAGING_USER_A_EMAIL` / `STAGING_USER_A_PASSWORD` / `REALITY_CAPTURE_SURFACE` / `PLAN_CANARY_USER_IDS`。`REALITY_CAPTURE_KILL` MISSING(=OK・false 既定)・`NODE_ENV` UNSET(=OK・≠production)。
- **重要な区別**: A1-5-8-5 smoke は **app runtime path**（`NEXT_PUBLIC_SUPABASE_URL`+anon+`signInWithPassword`）で動き **CLI を使わない**。ゆえに「CLI=aljav link」と「smoke env 不在」は**別の懸念**で、両方を解消する必要。
- **gate 要件（再確認・capture-gate.ts）**: `buildMorningCaptureSurface` が候補を返すには ①kill false ②`REALITY_CAPTURE_SURFACE=true` ③`NODE_ENV`≠production ④URL ref 解決 ⑤ref≠aljav ⑥ref===hjcr ⑦user id 非空 ⑧`PLAN_CANARY_USER_IDS` 非空 ⑨USER_A UUID ∈ canary。production guard（a2-rls-api-smoke.ts）: URL→ref regex 厳格照合===hjcr else fatal / anon key に `service_role` 非含有 else fatal。
- **成果物（CEO 手動用 runbook 新規作成）**: **`docs/staging-environment-safety-runbook.md`** — ① canonical mapping(hjcr/aljav) ② 現状 audit ③ CEO が `.env.local` に設定すべき env key 一覧（値は CEO のみ・hjcr URL/ref は記載・anon key/password は「CEO 提供」） ④ CLI を hjcr へ向ける安全手順（`supabase link --project-ref hjcr`+検証・read-only `migration list` のみ・`db push`/`reset`/`repair` 禁止） ⑤ A1-5-8-5 smoke 再開 GO 条件 12 項 ⑥ production 事故防止 STOP 条件＋絶対禁止コマンド。
- **doc-only**: **DB write 0・DB 接続 0・CLI re-link 0・smoke 実行 0・production 接触 0・秘密値出力 0**・route.ts 変更 0・UI 変更 0・remote 0。CLI re-link / env provision / smoke 再開は **CEO 手動 + 別 GO**。
- **しない（A1-5-ENV-1 範囲外）**: CLI re-link（CEO 明示許可なし）/ 実 staging·production write / smoke 実行 / `supabase db push`·`reset`·`repair` / 秘密値出力 / route·UI 変更 / remote。

### 8.55 A1-5-8-5 実行成功（landed・smoke EXECUTED & PASSED）— Stargazer Surface Direct E2E Smoke（実 staging row・main worktree・原則1回・全項目 PASS）

A1-5-8-5（A1-5-ENV-1 で env 整備後・CEO 再開 GO・**route shell を叩かず surface read chain を実 staging row で検証**・main worktree のみ実行・file capture・原則1回）:
- **実行直前 preflight（main worktree）**: main HEAD=4d2ede9d / `supabase/.temp/project-ref`=hjcr / env presence・分類 全 PASS（URL ref=hjcr・anon に service_role 非含有・REALITY_CAPTURE_SURFACE=true・NODE_ENV≠production）。**reality-candgen-a1 では実行しない**（CLI=aljav ゆえ）。
- **infra（one-shot harness・untracked・実行後削除）**: tsx + CJS `-r` hook は **ESM `import "server-only"` を intercept 不可**（Node v22）→ **vitest を採用**（vitest.config の `server-only` alias `tests/stubs/server-only.ts` + react-dom/server render が env=node で動作）。`.env.local` は dotenv で読み、reality modules は `it()` 内 **dynamic import**（PLAN_FLAGS が env 読込後に評価される順序保証）。harness は `tests/unit/` 配下に置き（include `tests/unit/**` 一致）、**実行後に削除**（commit しない）。
- **harness guards（write 前・production 事故防止）**: URL host→ref regex 厳格照合===hjcr else throw / anon に `service_role` 非含有 else throw / NODE_ENV≠production / sign-in user id===requested(self-pin・p_user_id=signed-in id)。auth=anon+`signInWithPassword`（**service_role 0**）。
- **redacted report（全項目 PASS・UUID/source_ref/secret 非出力）**: preWrite USER_A seed rows=**0**（clean start）/ setupRpcCalls=**1** / setupLlmCalls=**0** / seed1+evidence1 / surface.hasCandidate=**true** / surface.candidateCount=**1** / evidenceSource=`seed_explicit` / surfaceRedacted=**true** / fragmentHasCaptureCandidate=**true** / morningProtocolKeysPreserved=**true**（plan/dialogState/planStateV2/rawInputs 不変）/ clientDtoPresent=true・count=1・clientDtoRedacted=**true** / bannerShowsCandidate=**true**（「候補」）/ bannerNoLeak=**true**（UUID/source_ref/seedRef/`seed_explicit` 非出）/ seedRowsAfter=**0** / evidenceRowsAfter=**0** / userTotalRealityAfter=**0** / cleanupError=**null**。
- **チェーン（実 staging row で全鎖実証）**: controlled write(RPC×1: `create_plan_seed_capture_bundle`・seed active full_go + seed_explicit high 60min)→`buildMorningCaptureSurface`(実 read・gated・candidateCount=1)→`resolveMorningProtocolCaptureFragment`→fake `morningProtocol` へ additive(既存 keys 不変)→`selectMorningProtocolCaptureCandidate`(redacted DTO)→`CaptureCandidateBanner` render(「候補」)→cleanup(evidence 明示 delete→seed delete→**rows=0**)。
- → **§8.52/§8.53 で piecewise だった E2E が、今回 実 staging row で全鎖 PASS**（A1-5-8-2 fragment + A1-5-8-3 client + A1-5-7-6 banner が real surface DTO 上で動作確認）。**DB 汚染 0**（USER_A reality total=0）・**service_role 0**・**実 LLM 0**・**production 接触 0**（hjcr のみ・aljav denylist 維持）・route shell 実行 0・raw/source_ref/UUID 非 surface（surface/DTO/banner/report 全 clean）・harness untracked+削除・doc-only commit。
- **しない（A1-5-8-5 範囲外）**: capture write integration / route shell 実行 / production 接続 / production flag ON / 2 回目以降の smoke / 実 LLM / route·UI 変更 / PRM·correction 実接続 / remote。

### 8.56 A1-5-9-0/1 実装（landed）— Stargazer Capture Write Integration（本流 `/api/stargazer/alter` に fire-and-forget capture write・structured-only・flag gated・production hard block・response 不変）

A1-5-9-0/1（capture write 側を本流 route に接続＝seed/evidence を本流から作る・**今回の発話で write→次回/後続 read で surface**・V2 route と同型・最小外科）:
- **read-only audit**: `fireMorningCapture(utterance, userId, rpcClient): void`（`alter-morning-capture-observe.ts`）= **fire-and-forget・void 同期返却・never-throw**。`decideCaptureMode`（kill 最優先→LIVE=write(real RPC)→OBSERVE=observe(dry-run・実 DB 0)→**両 flag off→null=no-op**）。gate=`evaluateCaptureGate`（production/aljav/非 canary/nodeEnv=production→block→extractor 0/write 0）。**実 LLM(extractor=`createServerLlmSeedExtractor`) は fire-and-forget の async 内**（response 前に await しない）。V2 route(`/api/alter-morning/plan`)が同関数を `try{ fireMorningCapture(body.utterance, user.id, supabase as unknown as RpcCapableClient) }catch{}` で配線済（proven pattern）。
- **変更（最小・V2 と同型）**: import `fireMorningCapture` + type `RpcCapableClient`。pre-return（surface read の直後）に **morning turn gate（surface read と同条件 `morningResponse && phase!=="skipped"`）で fire-and-forget 呼出 + 二重防御 try/catch**: `fireMorningCapture(message, userId, supabase as unknown as RpcCapableClient)`。**surface を先に算出 → 今回 capture した seed は当該 response に混ざらない**（surface=prior read / capture=current write）。
- **CEO 方針の充足**: ① response を待たせない（**fire-and-forget**・await しない） ② route response を壊さない（**void 同期返却 + never-throw + 二重防御 try/catch**・envelope/error 不変） ③ **flag gated**（default 両 flag off→no-op） ④ **production hard block**（gate: nodeEnv=production/aljav/canary 空→block） ⑤ **staging/canary 限定** ⑥ **structured-only**（extractor が raw を破棄・**raw を plan_seeds に保存しない**・raw は extraction.utterance のみ・source_ref opaque） ⑦ **失敗しても既存 response に影響させない**（never-throw）。**今回の発話で即同レスポンス表示は狙わない**（実 LLM を route response 前に await しない＝重くしない）。
- **default OFF → production 挙動変更ゼロ**（decideCaptureMode が両 flag off で null→即 return・extractor 構築なし・write 0）。
- test +13（静的 wiring・handler は 10500 行で unit-test 不可ゆえ route source を静的検証）: import(fireMorningCapture/RpcCapableClient) / 呼出形(`fireMorningCapture(message, userId, supabase as unknown as RpcCapableClient)`) / fire-and-forget(await しない) / 二重防御 try/catch / morning turn gate / surface→capture の順(prior read→current write) / 既存 surface read·morningProtocol assembly 不変 / fireMorningCapture 契約(void 返却・default off no-op・never-throw・gate) を OBS source で確認。reality **981 PASS**（968→+13）・V2 route+capture observe 既存 41 PASS 不変。自変更 tsc 新規 error 0（route 既存 15 は pre-existing baseline・project 1114）。
- → **本流 `/api/stargazer/alter` が今回の発話から structured-only seed/evidence を fire-and-forget capture（次回/後続 surface read で候補化）**。**default OFF で production 不変**・write は staging+canary でのみ（A1-5-8-2 surface read と同 gate）。
- **しない（A1-5-9-0/1 範囲外）**: production 接続 / production flag ON / 実 LLM を response 前に await / route response 形変更 / 即同レスポンス候補表示 / DB 直 write（fireMorningCapture 経由のみ）/ source_ref 精緻化 / PRM·correction 実接続 / remote。

### 8.57 A1-5-10 実行成功（landed・smoke EXECUTED & PASSED）— Direct Runtime Write→Read→UI Smoke（実 capture write runtime path・実 LLM 1 + 実 RPC 1・staging row・全項目 PASS）

A1-5-10（A1-5-9 が接続した capture write runtime path を route shell を叩かず直接実行・**実 LLM extractor 1 + 実 RPC write 1**・main worktree・原則1回・全項目 PASS）:
- **実行直前 preflight**: main HEAD=4a26e6ec / `.temp/project-ref`=hjcr / cwd=main worktree。**route shell 非実行**。
- **infra**: vitest one-shot harness（untracked・実行後削除）。`.env.local`(dotenv) + **`process.env.REALITY_CAPTURE_LIVE="true"` を harness-local に設定**（PLAN_FLAGS 評価前・write mode 化）。REALITY_CAPTURE_SURFACE=true は env 既設。reality modules は dynamic import。
- **capture write path（fireMorningCapture と同等・seedId 固定で cleanup 可）**: `runMorningCaptureObserve(utterance, gate, deps, { seedId, mode:"write" })`（fireMorningCapture が内部で呼ぶ core）。`deps={ extractor: createServerLlmSeedExtractor()(実 Gemini LLM), writeClient: createRpcCaptureWriteClient(authedSupabase)(実 RPC) }`。gate=resolveMorningObserveGate(flagEnabled=realityCaptureLive・hjcr・canary)。utterance=「ジムで1時間トレーニングする」（explicit duration 1時間=60min→seed_explicit high / placeable action / undated）。
- **redacted report（全項目 PASS・UUID/source_ref/secret/raw発話 非出力）**: guards(urlRef=hjcr/anon!service_role/NODE_ENV≠prod) / preWrite USER_A=**0** / flagLive=true・flagSurface=true / captureMode=write・captureObserved=true・**captureOutcome="captured"** / **llmCallCount=1・rpcCallCount=1** / **seedInserted=1・evidenceInserted=1**（実 LLM 抽出→実 RPC write）/ surface.hasCandidate=**true**・candidateCount=**1**・evidenceSource=seed_explicit・**redacted** / fragmentHasCaptureCandidate=true / morningProtocolKeysPreserved=true / clientDto present・count=1・**redacted** / banner**「候補」**・**no-leak**(UUID/source_ref/seed_explicit 非出) / cleanup seed=**0**・evidence=**0**・USER_A total=**0** / cleanupError=null。
- **チェーン（実 LLM runtime で全鎖実証）**: real LLM extractor(「ジムで1時間」→seed_explicit high evidence) → real RPC write(create_plan_seed_capture_bundle・atomic) → `buildMorningCaptureSurface`(実 read・gated・candidateCount=1) → `resolveMorningProtocolCaptureFragment` → fake morningProtocol additive(既存 keys 不変) → `selectMorningProtocolCaptureCandidate`(redacted DTO) → `CaptureCandidateBanner`(「候補」) → cleanup(rows=0)。
- → **A1-5-9 で接続した capture write runtime path が、実 LLM + 実 RPC で write→read→UI まで E2E 動作確認**（A1-5-8-5 は synthetic structured write・今回は **実 LLM extractor 経由**の structured-only write）。**raw を plan_seeds に保存しない**（extractor が raw 破棄・structured-only）・**route shell 非実行**・**DB 汚染 0**（USER_A total=0）・service_role 0・production 接触 0（hjcr のみ）・harness untracked+削除・doc-only。
- **しない（A1-5-10 範囲外）**: route shell 実行 / production 接続 / production flag ON / 2 回目 smoke / capture write の production ON / PRM·correction 実接続 / remote。

### 8.58 A1-5-11 実装（landed）— Candidate Lifecycle / Duplicate / Stale Guard（pure guard skeleton + fake tests・production 前の運用安全・no-DB・no-write・no-production）

A1-5-11（production/canary 前に captured seed の蓄積・duplicate・stale・再提示を塞ぐ・**pure design + guard skeleton + fake/no-run tests に限定**・schema 変更が要るものは design only）:
- **lifecycle audit（read-only schema）**: `PlanSeedStatus` = **active / consumed / expired / rejected**。plan_seeds 列: status(CHECK 4 値)・**captured_at**(NOT NULL DEFAULT NOW)・**expires_at**(nullable)・source_ref。index: (user_id,status)・(user_id,expires_at WHERE active)。read(`ALLOWED_SEED_COLUMNS`)= id/user_id/desired_date/desired_time_hint/action_shape/confidence/status（**captured_at/expires_at は未 expose**）・FORBIDDEN= signal/desired_action(raw)。read は `status='active'` のみ → **consumed/expired/rejected は既に surface 除外**。
- **既存 filter（上流・本 guard の前提）**: `isSurfaceableCandidate`（candidate-surface.ts）= duration>0 ∧ grounding=strong ∧ durationSource ∈ {seed_explicit,correction} ∧ dispositionHint=place（**prm_typical/weak/low/no-duration を fail-closed 除外**）。→ GO の「low evidence / prm_typical → no candidate」は**既存挙動**（本 slice では isSurfaceableCandidate を参照テストで確認）。
- **運用ギャップ（read だけでは塞げない・本 guard が塞ぐ）**: ① **active だが expires_at 経過**（status 未 flip）→ surface されてしまう ② **stale**（capture 古い・freshness 窓が無い）③ **duplicate**（同構造 seed が複数）→ candidateCount が積み上がる。
- **pure guard skeleton（新規 `candidate-lifecycle-guard.ts`・pure・no-DB・barrel 非 export）**:
  - `CandidateLifecycleEntry`（構造化 + lifecycle メタのみ・**raw/source_ref なし**・seedRef は内部 tie-break で surface 非出）= { seedRef, status, capturedAtMs, expiresAtMs, actionShape, desiredDate, desiredTimeHint, durationMin, confidence }。
  - `selectSurfaceableCandidates(entries, {nowMs, freshnessMs?})` → `{ surfaceable, droppedCounts:{not_active,expired,stale,duplicate} }`。**① status!=active→drop ② expiresAt 経過→drop ③ freshness 窓超→drop ④ 同 dedup 構造キー→1 件抑制（最新 capture を残す）**。`Date.now()` を持たず now は注入（deterministic）。
  - **dedup key** = `actionShape|desiredDate|desiredTimeHint|durationMin`（構造のみ・raw なし）。structured-only ゆえ「活動の主語（場所/内容）」を持たず、同 shape・同 duration の別活動は同キーに畳まれ得る（surface dedup の許容限界）。
  - **freshness 窓** = `CANDIDATE_FRESHNESS_DAYS_DEFAULT=14`（policy・ctx で上書き可）。
  - **dropped は件数のみ**（seedRef を載せない＝observability も redacted）。surfaceable の seedRef は内部（**presentCandidateSurface が drop**）。
- test +20（fake/no-run・DB 0・network 0・Date.now 0）: active fresh→surfaceable / 空→0 / **duplicate→1 抑制(最新残す)** / duration 違い→別候補 / **stale→drop** / 窓境界 / **expired→drop** / expiresAt null·未来→非 expired / **consumed·rejected·expired status→drop(not_active)** / 複合(active+dup+stale+expired+consumed→surfaceable 1・各 drop 1) / 上流 isSurfaceableCandidate(prm_typical/low/weak/no-duration→false・seed_explicit strong place→true) / **dropped 出力に UUID/source_ref/raw なし** / surfaceable に signal/desired_action/source_ref なし / deterministic / pure 静的(createClient/.from("/.rpc/fetch/Date.now/next/react/process.env 不在・Array.from は legit) / barrel 非 export。reality **1001 PASS**（981→+20）・自ファイル tsc 0（full tsc 0 ではない・baseline 1114）。
- **design only / deferred（schema or write が要る・本 slice では実装しない）**:
  - **wiring（次 slice・実装）**: `captured_at`/`expires_at` を `ALLOWED_SEED_COLUMNS` に expose（**schema 変更でなく read 列追加**・no-write）→ seed-row lifecycle + enriched placement(durationMin) を join し `CandidateLifecycleEntry` 構築 → consumption pipeline で `selectSurfaceableCandidates` 適用。
  - **surfacedAt（再表示抑制）**: 「一度出した候補を cooldown 中は再提示しない」は **surfacedAt 列が必要＝schema 変更ゆえ design only**。現状は dedup 済 active 候補が consumed/dismissed/expired まで pending nudge として持続（dedup で N→1 に有界）。
  - **write-side 蓄積**: surface dedup は **surface を有界化**するが DB の seed 行は積み上がる。行数削減は **dedup-on-write（直近 duplicate は insert しない）or TTL cleanup job（古い active を expired/delete）**＝write/schema ゆえ design only（別 slice）。
  - **status 遷移（consume/dismiss/expire flip）**: write ゆえ別 slice。
- → **production 前の lifecycle 安全（active/fresh/非 expired/非 duplicate のみ surface）を pure guard で確立**。**no candidate 時は既存 response/UI 不変**・raw/source_ref/UUID 非 surface。**DB read/write 0・Supabase 0・route.ts 0・production 0・schema 変更 0**。
- **しない（A1-5-11 範囲外）**: read 列 expose / pipeline wiring / surfacedAt schema 追加 / dedup-on-write / TTL cleanup / status 遷移 write / migration apply / production 接続 / PRM·correction 実接続 / remote。

### 8.59 A1-5-11-2 実装（landed）— Lifecycle Guard Wiring（A1-5-11 の pure guard を surface read path に外科的に通す・read 列 expose・no-write・no-migration・no-production・既存 UI 不変）

A1-5-11-2（A1-5-11 の `selectSurfaceableCandidates` を実 surface read path に wiring・**captured_at/expires_at を read 列に追加（schema 変更なし）**・stale/expired/duplicate を surface 直前で除外・no-write/no-migration/no-production）:
- **read 列 expose（schema 変更不要・既存列）**: `ALLOWED_SEED_COLUMNS` に **captured_at/expires_at を追加**（既存 plan_seeds 列・structured・raw でない）。`ColumnRestrictedSeedRow` に optional 追加（real read は SELECT で常に取得・fixture は欠落許容で fail-safe）。`buildSeedLifecycleMeta(rows)` → `seedRef→{actionShape, capturedAtMs, expiresAtMs}`（ISO→ms は **Date.parse 決定的**・Date.now でない）。
- **lifecycle metadata DTO**: `SeedLifecycleMeta`（actionShape/capturedAtMs/expiresAtMs・**raw/source_ref なし**）。`seed-source.ts` に `loadActiveWithLifecycle(userId)→{placements, lifecycleBySeedRef}`（同一 read から projection + meta・loadActivePlacements は loadRows を共有して不変）。
- **guard 適用位置（drift-free）**: **bridge `runConsumptionSurfaceFromProjected` に optional `lifecycleGuard`**。`enrich → applyLifecycleGuardToEnriched → guarded` → `computeConsumptionFromProjected(guarded, …)`（**core は guarded を再 enrich・idempotent＝durationMin 上書きなし**）。→ **candidateCount(summary) と surface items は同一 guarded 集合由来**（再算出 drift なし）。**core(computeConsumptionFromProjected) は不変**。
  - **post-enrich dedup の正しさ**: enrich 後の durationMin を dedup 構造キーに含むため、surfaceable(durationMin=60) と non-surfaceable(durationMin=null) は別キー＝**誤って surfaceable を non-surfaceable duplicate に潰さない**（pre-enrich dedup の罠を回避）。
- **threading**: `buildMorningCaptureSurface` が **`Date.now()` を注入**（server glue・pure core/bridge は now 注入で決定的維持）→ `buildCaptureSurfaceFromProjected(…, nowMs)` → lifecycle map + nowMs 揃う時のみ guard 構築 → bridge。どちらか欠落（既存 DI test）→ guard なし＝**既存挙動不変**。`loadPendingProjected` は `loadActiveWithLifecycle` で lifecycle を additive 同伴。
- test +9 wiring（fake/no-run・DB 0・network 0）: active fresh+high evidence→candidate(**candidateCount と items 整合**) / **duplicate fresh→1 抑制(items 1)** / **expired active→no candidate** / **stale active→no candidate** / **guard 不在→既存挙動不変** / low·prm_typical·no evidence→no candidate(上流 isSurfaceableCandidate 維持) / 非 surface(UUID/source_ref/seedRef/raw 非出) / deterministic / 静的(bridge は Date.now 不在=now 注入)。既存 contract test 更新(ALLOWED_SEED_COLUMNS 9 列 / SEED_COLUMNS_SQL / expires_at は SELECT にも載る(旧:WHERE のみ) / loadPendingProjected seed 0 lifecycle additive)。reality **1010 PASS**（1001→+9）・seed/source 系 148 不変。
- **tsc baseline 分離**: 自変更（5 module + 4 test）**新規 error 0**（tsc は reality tree 到達済＝reality に pre-existing error あり・自 module 0 を確認）。project 全体 **144**（**A1-5-11 の 1114 から rebase で別セッションの型 cleanup を継承し減少**・full tsc 0 ではない）。
- → **A1-5-11 の guard が実 surface read path に通り、stale/expired/duplicate が runtime で surface 除外される**。**no candidate 時は既存 response/UI 不変（fail-open）**・raw/source_ref/UUID 非 surface・candidateCount と items 同一 canonical path 由来。**DB write 0・Supabase 実接続 0(read seam の fake test のみ)・route shell 0・route.ts 0・UI 0・production 0・schema 変更 0・migration 0**。
- **しない（A1-5-11-2 範囲外）**: DB write / migration 作成·apply / schema 変更 / surfacedAt 追加 / dedup-on-write / TTL cleanup / status 遷移 write / production 接続 / production flag ON / PRM·correction 実接続 / remote。

### 8.60 A1-5-11-3 実装（landed）— Write-side Accumulation Guard / TTL Policy（pure policy skeleton + fake tests・既存 schema 可能範囲を切り分け・no-write・no-migration・no-production）

A1-5-11-3（production/canary 前に seed/evidence **DB 行の蓄積**を防ぐ方針を固める・**pure design + no-run skeleton + fake tests に限定**・write/migration/production なし）:
- **核心の区別（明記）**: **surface dedup（A1-5-11-2）は表示を 1 件に抑えるが DB 行は増える**。capture write は毎回 INSERT ゆえ同構造 seed が積み上がる。read-only audit: plan_seeds に **構造重複の UNIQUE なし**（index は perf 用のみ）/ RPC `create_plan_seed_capture_bundle` は **ON CONFLICT なし＝無条件 INSERT** / captureToDrafts は `expires_at = input.expiresAt ?? null`＝**undated は never-expire**。→ 蓄積問題は実在。
- **既存 schema で可能な範囲（本 module）**: ① **read-before-write dedup**（`decideCaptureWrite`・既存 active seeds を read→同構造の active fresh 非 expired があれば **suppress**（書かない＝reuse）・**read-side dedup と同一キー/fresh/expired 判定を再利用**・read seam は A1-5-11-2 `loadActiveWithLifecycle`+enrich 流用）。 ② **TTL/expires_at**（`computeCaptureExpiry`・既存列・write 時に初期値計算→経過で expired→surface guard が除外）。
- **migration 必要（design only）**: 原子的な **partial unique index**（`(user_id, action_shape, desired_date, desired_time_hint) WHERE status='active'`）。**duration は evidence 表ゆえ seed 一意キーに含められず read-side dedup（duration 込み）より粗い**＝granularity mismatch（"gym 1hr" と "gym 2hr" を誤って衝突させ得る）。race-safe だが coarse のトレードオフ。
- **別 slice（write・本 slice 非実装）**: stale duplicate の **replace（旧を expired に flip）** / consumed·rejected·expired への **status 遷移** / 古い行の **cleanup delete（TTL job）**。
- **pure policy skeleton（新規 `capture-write-policy.ts`・pure・no-DB・barrel 非 export）**:
  - `decideCaptureWrite(candidate, existingActive, ctx)→{decision:"insert"|"suppress", reason:"no_duplicate"|"duplicate_active_fresh"|"duplicate_stale_or_expired"}`。**race-prone**（read↔write 非原子・逐次 best-effort・完全防止は DB 一意制約）を明記。出力は decision/reason のみ（**raw/source_ref/UUID なし**）。
  - `computeCaptureExpiry(input, nowMs, ttlDays?)→ms|null`。明示尊重 / **undated→now+14 日**（=read-side freshness 窓と整合）/ **dated→その日の終端**（経過で expired）/ 不正日付→TTL fallback。Date.parse は決定的（Date.now なし・now 注入）。
- test +18（fake/no-run・DB 0・network 0）: no existing→insert / same active fresh→suppress / stale→insert / expired→insert / rejected·consumed·expired status→insert（status filter）/ different date·time·duration·shape→insert / 複数(fresh 含む→suppress・全 stale→insert) / 出力に raw/source_ref/UUID なし / deterministic / TTL(undated=now+14d・dated=日終端・明示尊重・不正→fallback・override) / 静的 pure(Date.now/.from("/.rpc/createClient/fetch/process.env 不在・Date.parse は可) / barrel 非 export。reality **1028 PASS**（1010→+18）。
- **tsc baseline 分離**: 自変更（新 policy module + 新 test）**新規 error 0**（純 additive・既存 module 無変更）。project 全体 **〜138**（A1-5-11-2 から ±・tsc count は run 間で多少変動するが**自ファイル 0 は一貫**・full tsc 0 ではない）。
- → **write-side 蓄積対策の pure policy を確立**（read-before-write dedup + TTL expiry・既存 schema 可能）。**production 挙動変更 0**（policy は未配線・wiring は別 slice）。raw/source_ref/UUID を policy 出力に出さない。**DB read/write 0・Supabase 0・route shell 0・route.ts 0・UI 0・production 0・migration 0・schema 0**。
- **しない（A1-5-11-3 範囲外）**: capture write path への wiring（read-before-write + expiry 適用＝write path 変更・別 slice）/ DB write / migration 作成·apply / schema 変更 / unique index 追加 / status 遷移 write / cleanup delete / production 接続 / PRM·correction 実接続 / remote。

### 8.61 A1-5-11-4 実装（landed）— Capture Write Policy Wiring（A1-5-11-3 の pure policy を capture write runtime path に外科的に通す・optional DI・fake/no-run tests・no-write・no-migration・no-production）

A1-5-11-4（A1-5-11-3 の write-side policy を **実 capture write runtime path** へ外科的に配線・**optional DI・fake/no-run tests に限定**・write/migration/production なし）:
- **配線方針**: `decideCaptureWrite` / `computeCaptureExpiry` を **capture write runtime path の核 = orchestrator `runStructuredCapturePipeline` + service `runCaptureService`** へ **optional DI（`CaptureWritePolicyDeps`）** で通す。**policy 未指定なら既存挙動不変**（dedup なし・TTL 注入なし）。指定時のみ read-before-write dedup + TTL を適用。
- **`CaptureWritePolicyDeps`（capture-write-policy.ts に追加）**: `{ existingActive: ()→Promise<CandidateLifecycleEntry[]>（DI provider・本番は read seam・テストは fake）, nowMs（server 注入・pure を決定的に保つ）, freshnessMs?, ttlDays? }`。provider error は orchestrator が握り潰し existing=[] 扱い。
- **orchestrator `runStructuredCapturePipeline(input, client, policy?)`**: intake guard 後 → policy 指定時 `withCaptureExpiry`（明示 expiresAt 尊重・undated/dated に TTL 注入）→ `captureToDrafts` → **write 直前に** `draftToCandidateEntry` + `decideCaptureWrite`（既存 active と同構造比較・active fresh 非 expired あれば **suppress＝writeClient を呼ばない**）→ 非 suppress なら `writeStructuredCapture`。新 result variant `{ok:true, stage:"suppressed", wroteEvidence:false}`。provider error は try/catch で **fail-open**（existing=[]→write 継続・data loss 回避・best-effort）。
- **service `runCaptureService`**: `deps.policy?` を orchestrator に透過・`pipeline.stage==="suppressed"`→`{outcome:"suppressed"}`。`CaptureServiceResult` に新 outcome `"suppressed"`。`summarizeWouldCapture` に suppressed case 追加（wouldCapture/Evidence=false・outcome=suppressed・reason="duplicate_active_fresh"）。
- **live entry（fireMorningCapture）は本 slice では未活性化（重要・意図的停止）**: `fireMorningCapture` は `RpcCapableClient`（**.rpc() のみ・read 不可**）しか受け取らず、dedup の read-before-write には read client（`SeedUserContextClient & DurationEvidenceUserContextClient`）が要る。それを entry に通すには **route.ts 変更が必須**＝GO 制約「**route.ts変更0**」で禁止。型安全でないキャスト（`as unknown as`）は最高級品質に反する。→ **policy を write runtime path へ通し切り、live 活性化（fireMorningCapture が read-backed policy を構築）は read client plumbing を要する次境界として停止**。alter-morning-capture-observe は policy を一切 import せず＝**production 挙動変更 0**（policy 未指定で既存挙動）。`loadActiveCandidateEntries`（provider helper）は消費する活性化 slice と一体で入れるべきゆえ本 slice では非追加。
- **race 限界（A1-5-11-3 から継続）**: read-before-write は非原子（read↔write 間に並行 write 可）。逐次 best-effort で蓄積を減らすが完全防止は DB partial unique index（migration・別 GO・duration は evidence 表ゆえ seed 一意キーに含められず粗い）。
- test +24（fake/no-run・DB 0・network 0・deterministic）: **dedup**(policy 未指定→既存挙動 write1/no existing→write1/same active fresh→**write0 suppress**/stale→write1/expired→write1/consumed·rejected·expired status→write1/different duration·shape·date·timeHint→write1/複数 fresh 含む→suppress·全 stale→write1/**provider error→fail-open write1**/deterministic) + **TTL**(dated→日終端/undated→now+14d=undated にも TTL/ttlDays override/policy 未指定→expires_at=null=既存挙動/他フィールド非破壊) + **suppress redaction**(UUID/source_ref/seedRef/raw なし・keys=ok/stage/wroteEvidence) + **service**(policy=blocking→suppressed·write0·redacted keys=outcome/policy=[]→captured write1/policy 未指定→captured write1/summarizeWouldCapture(suppressed)) + **静的**(observe が write policy 非参照=live 未活性化=production 挙動変更0/route.ts 非参照/orchestrator·service に createClient·@supabase·.from("·.rpc·.insert·Date.now 不在)。reality **442 PASS**（418→+24）。
- **tsc baseline 分離**: 自変更（4 module edit: capture-write-policy/orchestrator/service/observe + 1 新 test）**新規 error 0**・**reality lib tree 0**。project 全体 102（A1-5-11-3 の 〜138 から別セッション cleanup 継承で減少・**自ファイル 0 は一貫**・full tsc 0 ではない）。
- → **write-side policy を実 capture write runtime path（orchestrator + service）へ通し切る**（policy 指定で dedup+TTL・未指定で既存挙動不変）。**production 挙動変更 0**（live entry 未活性化・default 未配線）。raw/source_ref/UUID を policy/result 出力に出さない。**DB read/write 0・Supabase 0・実 RPC 0・route shell 0・route.ts 0・UI 0・production 0・migration 0・schema 0**。
- **しない（A1-5-11-4 範囲外）**: fireMorningCapture の live 活性化（read client plumbing + route.ts 変更・別 GO）/ `loadActiveCandidateEntries` provider 追加（活性化 slice と一体・別 GO）/ 実 DB read·write / 実 RPC / migration 作成·apply / schema 変更 / unique index / status 遷移·cleanup write / production 接続 / PRM·correction 実接続 / remote。

> A1-5-0…§8.60 / **A1-5-11-4 Capture Write Policy Wiring（landed・§8.61・**配線 + fake/no-run tests**・A1-5-11-3 の pure policy を実 capture write runtime path へ外科的に通す）。配線: decideCaptureWrite/computeCaptureExpiry を orchestrator runStructuredCapturePipeline + service runCaptureService へ **optional DI(CaptureWritePolicyDeps={existingActive provider, nowMs 注入, freshnessMs?, ttlDays?})** で通す。policy 未指定→既存挙動不変。orchestrator: intake→withCaptureExpiry(明示尊重·undated/dated TTL 注入)→captureToDrafts→**write 直前 decideCaptureWrite(同構造 active fresh→suppress=writeClient 0 回)**→非 suppress なら write。新 result stage="suppressed"。service: deps.policy? 透過·stage suppressed→outcome "suppressed"·summarizeWouldCapture に suppressed(reason duplicate_active_fresh)。provider error→fail-open(existing=[]→write 継続)。race 非原子は限界継続(完全防止は migration unique・別 GO)。**live entry(fireMorningCapture)未活性化(意図的)**: fireMorningCapture は RpcCapableClient(.rpc のみ·read 不可)しか持たず dedup read に read client 要·entry へ通すは route.ts 変更必須=GO「route.ts変更0」で禁止·型安全でないキャスト不可→policy を write runtime path へ通し切り live 活性化(read client plumbing)は次境界で停止·observe は policy 非 import=**production 挙動変更 0**。+24 fake tests(dedup/TTL/suppress redaction/service suppressed/provider error fail-open/静的 live 未活性化)·reality 442。自変更 tsc 新規 error 0(reality lib tree 0·project 102)。DB read/write 0/Supabase 0/実 RPC 0/route.ts 0/UI 0/production 0/migration 0/schema 0/remote 0）**。**write-side policy を実 capture write runtime path へ通し切る(policy 指定で dedup+TTL·未指定で既存挙動)。live entry 未活性化で production 不変**。次は **live 活性化(fireMorningCapture が read-backed policy 構築=read client plumbing + route.ts 変更·別 GO) / partial unique index(migration·別 GO) / status 遷移·cleanup(write·別 GO) / A1-5-12 production canary 準備**。**fireMorningCapture 活性化 / 実 DB read·write / 実 RPC / migration apply / production 接続 / PRM·correction 実接続 / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.59 / **A1-5-11-3 Write-side Accumulation Guard / TTL Policy（landed・§8.60・**pure policy skeleton + fake tests**・production 前の DB 行蓄積対策方針）。核心: surface dedup(A1-5-11-2)は表示を 1 件に抑えるが DB 行は増える(capture は毎回 INSERT・plan_seeds に構造 UNIQUE なし・RPC は ON CONFLICT なし・undated は expires_at=null で never-expire)。既存 schema で可能=①read-before-write dedup(decideCaptureWrite・同構造 active fresh 非 expired あれば suppress・read-side dedup と同一キー/判定再利用・loadActiveWithLifecycle 流用・race-prone 明記)②TTL(computeCaptureExpiry・undated→now+14d=freshness 窓整合/dated→日終端/明示尊重)。migration 必要(design only)=partial unique index(user_id+action_shape+date+time_hint WHERE active)だが duration は evidence 表ゆえ含められず read-side dedup より粗い(granularity mismatch・race-safe だが coarse)。別 slice(write)=replace(status flip)/status 遷移/cleanup delete。新規 pure capture-write-policy.ts・出力に raw/source_ref/UUID なし・Date.now なし(now 注入)。+18 fake tests(insert/suppress/stale/expired/status filter/different structure/TTL/非 surface/deterministic/静的 pure)・reality 1028。自変更 tsc 新規 error 0(純 additive・project 〜138)。DB read/write 0/Supabase 0/route.ts 0/UI 0/production 0/migration 0/schema 0/remote 0）**。**write-side 蓄積対策 pure policy 確立(read-before-write dedup + TTL・既存 schema 可能・race 限界明記・unique は migration design only)。policy 未配線で production 不変**。次は **wiring(capture write path に read-before-write+expiry 適用・write path 変更・別 GO) / partial unique index(migration・別 GO) / status 遷移·cleanup(write・別 GO) / A1-5-12 production canary 準備**。**capture write path 変更 / migration apply / DB write / production 接続 / PRM·correction 実接続 / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.58 / **A1-5-11-2 Lifecycle Guard Wiring（landed・§8.59・A1-5-11 の pure guard を実 surface read path に外科的に wiring）。read 列 expose: ALLOWED_SEED_COLUMNS に captured_at/expires_at 追加(既存列・schema 変更なし・structured)。loadActiveWithLifecycle→{placements, lifecycleBySeedRef(seedRef→actionShape/capturedAtMs/expiresAtMs・raw なし)}。guard 適用=bridge runConsumptionSurfaceFromProjected に optional lifecycleGuard・enrich→applyLifecycleGuardToEnriched→guarded→core(再 enrich idempotent)＝candidateCount と items は同一 guarded 集合由来(drift なし)・core 不変。post-enrich dedup ゆえ surfaceable を non-surfaceable duplicate に潰さない。buildMorningCaptureSurface が Date.now 注入(server glue・pure core/bridge は now 注入で決定的)・lifecycle+nowMs 揃う時のみ guard・欠落時は既存挙動不変。+9 wiring tests(active fresh→候補/dup→1/expired→0/stale→0/guard 不在→不変/上流 prm_typical·low→0/非 surface/deterministic)・既存 contract test 更新(列 9・expires_at は SELECT にも載る)・reality 1010。tsc 自変更 新規 error 0・project 144(A1-5-11 の 1114 から別セッション cleanup 継承で減少)。DB write 0/migration 0/schema 0/route.ts 0/UI 0/production 0/remote 0）**。**guard が実 surface read path に通り stale/expired/duplicate を runtime 除外・既存 UI 不変・candidateCount と items 同一 path 由来。schema 変更なし**。次は **A1-5-11-3/別トラック**: surfacedAt 再表示抑制(schema・別 GO) / write-side 蓄積 dedup-on-write or TTL cleanup(write/schema・別 GO) / status 遷移 write / **A1-5-12 production canary 準備**。**migration apply / DB write / production 接続 / PRM·correction 実接続 / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.57 / **A1-5-11 Candidate Lifecycle / Duplicate / Stale Guard（landed・§8.58・**pure guard skeleton + fake tests**・production 前運用安全）。lifecycle audit: PlanSeedStatus=active/consumed/expired/rejected・plan_seeds に captured_at/expires_at 在り・read は status=active のみ(consumed/expired/rejected 既に除外)・read 列は captured_at/expires_at 未 expose。既存 isSurfaceableCandidate が prm_typical/low/weak/no-duration を fail-closed 除外(上流)。運用ギャップ=① active だが expires_at 経過 ② stale(freshness 窓なし) ③ duplicate(同構造 seed 複数)。新規 pure `candidate-lifecycle-guard.ts`: `selectSurfaceableCandidates(entries,{nowMs,freshnessMs})`→status!=active/expired/stale を drop+同 dedup 構造キー(actionShape|date|timeHint|durationMin)を 1 件抑制(最新 capture 残す)・freshness 既定 14 日・now 注入(Date.now なし=deterministic)・dropped は件数のみ(seedRef 非載)・raw/source_ref なし。+20 fake tests(active fresh→候補/dup→1 抑制/stale→drop/expired→drop/consumed·rejected→not_active/上流 prm_typical·low→false/非 surface/deterministic/pure 静的)・reality 1001・自 tsc 0(project 1114)。design only(schema/write 要): captured_at/expires_at の read expose+pipeline wiring(次 slice・read 列追加で no-schema-change)/surfacedAt 再表示抑制(schema 追加)/write-side 蓄積(dedup-on-write or TTL cleanup)/status 遷移 write。DB read/write 0・Supabase 0・route.ts 0・production 0・schema 変更 0・remote 0）**。**production 前の lifecycle 安全を pure guard で確立(active/fresh/非 expired/非 duplicate のみ surface)・既存 UI 不変・schema 変更なし。wiring と write-side 蓄積対策は別 slice**。次は **A1-5-11 wiring（read 列 expose + guard 適用・別 GO）→ surfacedAt/dedup-on-write/TTL cleanup（schema・別 GO）→ A1-5-12 production canary 準備**。**read 列 expose / pipeline wiring / migration apply / production 接続 / PRM·correction 実接続 / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.56 / **A1-5-10 Direct Runtime Write→Read→UI Smoke（landed・§8.57・**EXECUTED & PASSED**・実 capture write runtime path・実 LLM 1+実 RPC 1・main worktree・原則1回）。A1-5-9 接続の capture write runtime path を route shell を叩かず直接実行。infra=vitest one-shot harness(untracked・実行後削除・REALITY_CAPTURE_LIVE=true を harness-local に設定=write mode・dotenv .env.local+dynamic import)。path=runMorningCaptureObserve(utterance, gate, deps{実 Gemini extractor + 実 RPC writeClient}, {seedId 固定, mode:write})=fireMorningCapture の core。utterance「ジムで1時間トレーニングする」(explicit 60min→seed_explicit high/placeable/undated)。redacted report 全 PASS: preWrite USER_A=0・flagLive=true・captureOutcome="captured"・**llmCallCount=1・rpcCallCount=1**・seedInserted=1・evidenceInserted=1・surface hasCandidate=true/candidateCount=1/seed_explicit/redacted・fragment captureCandidate・morningProtocol keys preserved・clientDto redacted count=1・banner「候補」no-leak・cleanup seed=0/evidence=0/USER_A total=0/cleanupError null。実 LLM extractor 経由の structured-only write→surface→banner まで E2E。raw を plan_seeds 非保存・route shell 非実行・DB 汚染 0・service_role 0・production 接触 0・harness 削除・remote 0）**。**capture write runtime path が実 LLM+実 RPC で write→read→UI E2E 成功・DB 汚染 0。write→read→UI loop が実 runtime で実証完了**。次は **A1-5-11**: 表示 UX polish / duplicate 防止 / stale seed 整理（別 GO）→ A1-5-12 production canary 準備 → production 限定 ON。**production 接続 / production flag ON / capture write の production ON / PRM·correction 実接続 / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.55 / **A1-5-9-0/1 Stargazer Capture Write Integration（landed・§8.56・本流 `/api/stargazer/alter` に **fire-and-forget capture write** を接続＝seed/evidence を本流から作る側。audit: `fireMorningCapture(utterance, userId, rpcClient):void`(fire-and-forget・never-throw・decideCaptureMode 両 flag off→no-op・gate production hard block・実 LLM extractor は async 内で response 前 await なし)・V2 route が同型配線済(proven)。変更=import + pre-return に morning turn gate(`morningResponse && phase!=="skipped"`・surface read と同条件)で `try{ fireMorningCapture(message, userId, supabase as unknown as RpcCapableClient) }catch{}`・surface を先に算出ゆえ今回 seed は当該 response 非混入。CEO 方針充足: response 待たせない(fire-and-forget)/response 壊さない(void+never-throw+二重 try/catch)/flag gated(default off no-op)/production hard block(gate)/staging·canary 限定/structured-only(raw を plan_seeds 非保存)/失敗しても response 不変。default OFF→production 挙動変更ゼロ。+13 静的 wiring tests(handler 10500 行で unit-test 不可ゆえ source 静的検証)・reality 981・V2+observe 41 不変・自変更 tsc 新規 0(project 1114)。route response 形 0/UI 0/production 0/remote 0）**。**capture write が本流に接続(fire-and-forget・default off・staging+canary のみ)・surface read と同 gate。write→read→UI の loop がコード上で完成**。次は **A1-5-10**: staging/canary で write→read→UI 表示の実動作確認（A1-5-9 の write を ON にして実 staging で 1 turn 目 capture→2 turn 目 surface→banner を確認・別 GO）。**production 接続 / production flag ON / 実 LLM response 前 await / PRM·correction 実接続 / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.54 / **A1-5-8-5 Stargazer Surface Direct E2E Smoke（landed・§8.55・**EXECUTED & PASSED**・実 staging row・main worktree・原則1回）。env 整備(A1-5-ENV-1)後に CEO 再開 GO で route shell を叩かず surface chain を実 staging row 検証。実行直前 preflight: main HEAD=4d2ede9d・.temp/project-ref=hjcr・env 分類 全 PASS。infra=vitest one-shot harness(untracked・実行後削除・server-only alias+react render+dotenv .env.local+dynamic import で PLAN_FLAGS を env 後評価。tsx+CJS -r は ESM server-only 不可ゆえ vitest 採用)。guards=URL ref===hjcr/anon!service_role/NODE_ENV≠prod/self-pin・auth=anon+signInWithPassword(service_role 0)。redacted report 全 PASS: preWrite USER_A=0・setupRpcCalls=1・setupLlmCalls=0・seed1+evidence1・surface hasCandidate=true/candidateCount=1/evidenceSource=seed_explicit/redacted・fragmentHasCaptureCandidate=true・morningProtocolKeysPreserved=true・clientDto redacted count=1・banner「候補」no-leak(UUID/source_ref/seed_explicit 非出)・cleanup seed=0/evidence=0/USER_A total=0/cleanupError null。チェーン=RPC×1 write(create_plan_seed_capture_bundle)→buildMorningCaptureSurface(実 read gated)→resolveMorningProtocolCaptureFragment→fake morningProtocol additive→selectMorningProtocolCaptureCandidate→CaptureCandidateBanner→cleanup rows=0。piecewise だった E2E が実 staging row で全鎖 PASS。DB 汚染 0/service_role 0/実 LLM 0/production 接触 0/route shell 0/raw·source_ref·UUID 非 surface/harness 削除/remote 0）**。**surface read chain が実 staging row で E2E 成功・DB 汚染 0 で cleanup 完結。次は capture write 側（seed/evidence を本流 route から作る）**。次は **A1-5-9-0/1 Stargazer Capture Write Integration**: 本流 `/api/stargazer/alter` の発話→capture extractor→structured-only seed/evidence→**fire-and-forget write**(response を待たせない・route response を壊さない・flag gated・production hard block・staging/canary 限定・raw を plan_seeds に保存しない・失敗しても既存 response に影響させない)。**今回の発話で seed/evidence を作り、次回/後続 read で surface** する形（実 LLM を route response 前に await しない）。**capture write 接続 / production 接続 / PRM·correction 実接続 / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.53 / **A1-5-ENV-1 Staging Environment Safety Recovery（landed・§8.54・**doc-only・read-only audit + runbook**・production 汚染防止最優先）。A1-5-8-5 検出の「CLI が production link」へ対応。現状 audit: **⚠⚠ Supabase CLI が production(aljav) link**（`supabase/.temp/project-ref=aljav`・既定 DB パスが production・`supabase db push/reset/repair` は production 汚染リスク）＋ **smoke 必要 env key 7 つ全 MISSING**（URL/anon/STAGING_USER_A_*/STAGING_SUPABASE_PROJECT_REF/REALITY_CAPTURE_SURFACE/PLAN_CANARY_USER_IDS）。重要区別=smoke は app runtime path(anon+signInWithPassword・CLI 不使用) で CLI link とは別懸念。成果物=`docs/staging-environment-safety-runbook.md`（env key 一覧/CEO 設定内容/CLI hjcr re-link 安全手順/smoke 再開 GO 条件 12 項/production 事故 STOP 条件/絶対禁止コマンド `db push`·`reset`·`repair`）。**CLI re-link は CEO 明示許可なしゆえ非実施**・env provision/re-link/smoke 再開は CEO 手動+別 GO。秘密値は presence のみで値出力 0。DB write 0/DB 接続 0/CLI re-link 0/smoke 0/production 0/remote 0）**。**CLI=production link を強い警告として記録・env 不在を網羅・安全 runbook を提示。A1-5-8-5 smoke は未再開（env 整備後に別 GO で1回実行）**。次は **CEO 手動**: ① `.env.local` に staging env を provision ② `supabase link --project-ref hjcr` で CLI を staging へ（検証 `cat supabase/.temp/project-ref`===hjcr）→ その後 **A1-5-8-5 再開 GO** で smoke を原則1回。**CLI re-link / env provision / 実 staging write / smoke 実行 / production 接続 / remote は CEO 手動 or 別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.52 / **A1-5-8-5 Stargazer Surface Direct E2E Smoke（landed・§8.53・**doc-only・preflight BLOCKED で smoke 非実行（write 0）**）。route shell を叩かず surface read chain を実 staging row で検証する安全代替 E2E だが、**preflight で実 staging write 不可と判定**: ①staging 資格情報全 UNSET（NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY/STAGING_USER_A_EMAIL/_PASSWORD・`.env*` 不在）→ anon+signInWithPassword 認証不能 ②**⚠ Supabase CLI が production(aljav) link**（`supabase/.temp/project-ref=aljav`）＝既定 DB パスが production＝GO STOP「aljavに向きそう」成立。→ GO「URL host ref===hjcr」FAIL・「cleanup 不能なら write しない」「曖昧なら停止」に従い **smoke 非実行・DB write 0・DB 接続 0・秘密値出力 0**。E2E は piecewise 実証済（A1-5-7-5 real read + A1-5-8-2/0/1/3·A1-5-7-6 fake）・gap は単一 real-data pass のみで原因は env（資格情報不在+CLI production link）でありコードは完成。安全 harness 設計（env/guards/RPC×1/surface 直呼び chain/cleanup/redacted file capture）を記録＝staging 資格情報供給+CLI を hjcr re-pin した環境で原則1回実行可能。**⚠ CEO 注意: 本環境の Supabase CLI は production(aljav) link ゆえ、不用意な `supabase db`/CLI write は production を汚染し得る**。route.ts 0/UI 0/DB write 0/DB 接続 0/実 LLM 0/production 0/remote 0）**。**preflight で staging 資格情報不在+CLI production link を検出し smoke を安全に非実行・harness 設計を提示。surface chain はコード完成・piecewise 検証済で gap は env のみ**。次は **別トラック**: ① staging 資格情報供給+CLI hjcr re-pin 後に本 harness を実行（別 GO・env 整備が前提） ② capture write integration（別 gate・別 GO・未着手） ③ production 有効化（別 GO・未着手） ④ PRM·correction 実接続（別 GO・未着手）。**実 staging write / capture write 接続 / production 接続 / PRM·correction 実接続 / 実 route call / remote は必ず別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.51 / **A1-5-8-4 Stargazer Surface E2E Staging Smoke（landed・§8.52・**doc-only・実 route call SKIP 判定**・条件付き GO の off-ramp）。10500 行本流 `/api/stargazer/alter` の副作用 audit→**決定的に UNSAFE**: DB write 80 操作/13+ 非 reality テーブル(analytics/patterns/hypotheses/context/dialogues/consent/causal_map/convergence/implicit_signals/reactions/person_map/narratives+plan_history・全て条件付き=副作用範囲不明確) ＋ **`stargazer_alter_dialogues` が raw発話+応答本文を DB 保存(raw発話保存 0 違反)** ＋ 実 LLM(comprehension/narration/main/PE web検索/Gemini) ＋ capture write は非発火(route は reality rows を write せず非 reality 13+ テーブルへ write)。GO cleanup スコープ=reality rows のみゆえ **cleanup 不能** → GO「1つでも曖昧なら route call せず停止」「曖昧なら実行しない優先」に従い **route call SKIP・controlled write 0・DB 汚染 0**。E2E は piecewise 実証済(A1-5-7-5 real read→DTO + A1-5-8-0/1/2/3·A1-5-7-6 pure fake で DTO→fragment→extraction→banner)。安全な代替案=route shell を呼ばず surface 関数を直接呼ぶ reality-only smoke(write は seed+evidence のみ=cleanup 完結・別 GO)。route.ts 0/UI 0/DB write 0/実 LLM 0/production 0/remote 0）**。**audit で route 副作用 UNSAFE と判定し実 route call を SKIP・安全代替案を提示。E2E 契約は server→client→UI 全鎖が piecewise 実証済**。次は **別トラック**: ① capture write integration（別 gate・別 GO・未着手） ② production 有効化（gate 変更・canary・別 GO・未着手） ③ PRM·correction 実接続（別 GO・未着手） ④（任意）reality-only E2E smoke（surface 関数直呼び・別 GO）。**capture write 接続 / production 接続 / PRM·correction 実接続 / 実 route call / remote は必ず別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.50 / **A1-5-8-3 Stargazer Client Consumption Wiring（landed・§8.51・B案 step 2・`morningProtocol.captureCandidate` を client 貫通=`useAlterChat`(抽出+transient state+return)→`AneurasyncHome`(1 prop)→AskHero→MorningPlanCard→banner。下流(AskHero/MorningPlanCard/Banner)は A1-5-7-6/7 で配線済ゆえ欠落 2 箇所のみ。useAlterChat: `selectMorningProtocolCaptureCandidate(data)`(client boundary redaction・redacted DTO のみ・raw 非保持)を `if(data.morningProtocol)` 末尾に read-only 追加(既存 `setMorningPlan(data.morningProtocol.plan)` 不変)・state は transient(永続化しない)。absent/flag OFF(production default)→state undefined→banner 非表示→**既存 UI 完全不変**。+16 tests(consumption: /api/stargazer/alter 形 response・read-only・error→undefined・present→DTO / banner present・absent / leak state+DOM / 静的 wiring・fake/no-run)・reality 968・自変更 tsc 新規 error 0(project 1114)。テスト哲学=declinedRecovery 同様 renderHook せず pure 抽出+静的 wiring+型+diff。route.ts 0/DB 0/Supabase 0/capture write 0/実 LLM 0/production 0/remote 0）**。**client consumption 貫通・flag OFF で既存 UI 不変・live は staging+canary のみ**。次は **別トラック**: ① capture write integration（fire-and-forget・別 gate・別 GO・未着手） ② production 有効化（gate 変更・canary・別 GO・未着手） ③ PRM·correction 実接続（別 GO・未着手）。**capture write 接続 / production 接続 / PRM·correction 実接続 / remote は必ず別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.49 / **A1-5-8-2 Stargazer Surface Read Additive Integration（landed・§8.50・B案 step 1・**本 arc 初の production 本流 `/api/stargazer/alter` 実変更**=morningProtocol（単一 inline assembly）に `captureCandidate?` を 1 行 spread で additive。read-only audit: 接続点 1 箇所・error/envelope 別経路・`userId`/`supabase`/`shadowLlmTargetDate` in scope。新規 pure helper 2: `morningProtocolCaptureCandidateFragment`(assembler・spread 版・redaction core 共有)+`resolveMorningProtocolCaptureFragment`(surface.server・DI fail-open seam・throw/null→`{}`)。surface read=`buildMorningCaptureSurface`(A1-5-7-5・read-only・never-throw・実 LLM なし)再利用。flag=既存 `realityCaptureSurface` 再利用(新 flag なし)・gate 多層 production hard block(nodeEnv=production / aljav ref / canary 空)→**production(aljav) では surface 出ず staging+canary のみ**・default OFF で完全 no-op。後方互換: 候補無/flag off/gate block/read 失敗→fragment `{}`→morningProtocol 完全不変(plan/dialogState/planStateV2/rawInputs 維持)・top-level envelope 不変・error path(500) 不変。**capture write 非接続(別 gate・別 GO)・実 LLM await なし**。+15 tests(fragment + resolve seam + assembled shape・fake/no-run)・reality 952・自変更 tsc 新規 error 0(route 既存 15 は pre-existing baseline・project 1114)。staging smoke 非実施(read 経路 A1-5-7-5 不変・E2E は 10500 行 handler に非現実的)）**。**production 本流が captureCandidate? を additive 返却可能に・default OFF で production 不変・surface read と capture write を分離**。次は **別トラック**: ① capture write integration（fire-and-forget・別 gate・別 GO） ② UI live verification（PlanClient/AskHero 親で `selectMorningProtocolCaptureCandidate` 消費・別 GO） ③ production 有効化（gate 変更・canary・別 GO）。**capture write 接続 / UI 追加接続 / production 接続 / PRM·correction 実接続 / remote は必ず別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。audit+decision: route mismatch=capture は V2 route `/api/alter-morning/plan`・production morning は `/api/stargazer/alter`(useAlterChat.sendMessage→morningProtocol) ゆえ **B案 推奨**=capture surface を /api/stargazer/alter の `morningProtocol.captureCandidate?` に additive 統合(single route・既存 keys 不変=後方互換最優先・dual-route 回避・A1-5-7-5 surface module 再利用)。A案(V2 を production 化)は dual-route+UI 全面改修で production flow 破壊リスク最大ゆえ却下。pure contract skeleton: client `selectMorningProtocolCaptureCandidate`(B案 extractor・morningProtocol.captureCandidate→redacted・既存 `selectCaptureCandidate` は共有 `toRedactedCaptureCandidate` へ refactor・挙動不変)+server は汎用 `appendCaptureCandidateToMorningResult` 再利用(drift なし)。+9 tests・capture bridge 29・reality 937・**route 未変更・production 完全不変**）**。**route alignment=B案 確定 + pure skeleton。capture write と surface read を分離(surface read=fail-open additive / capture write=別 gate)**。次は **B案 step 1（別 GO）**: /api/stargazer/alter morning 応答に surface read を additive(flag gated・fail-open・既存 keys 不変)。**route 実変更 / production 接続 / UI·PlanClient 接続 / DB write / 実 LLM 接続 / capture write 配線 / remote は必ず別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration を全段で維持する。
