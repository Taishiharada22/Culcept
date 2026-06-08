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
- test +24（fake/no-run・DB 0・network 0・deterministic）: **dedup**(policy 未指定→既存挙動 write1/no existing→write1/same active fresh→**write0 suppress**/stale→write1/expired→write1/consumed·rejected·expired status→write1/different duration·shape·date·timeHint→write1/複数 fresh 含む→suppress·全 stale→write1/**provider error→fail-open write1**/deterministic) + **TTL**(dated→日終端/undated→now+14d=undated にも TTL/ttlDays override/policy 未指定→expires_at=null=既存挙動/他フィールド非破壊) + **suppress redaction**(UUID/source_ref/seedRef/raw なし・keys=ok/stage/wroteEvidence) + **service**(policy=blocking→suppressed·write0·redacted keys=outcome/policy=[]→captured write1/policy 未指定→captured write1/summarizeWouldCapture(suppressed)) + **静的**(observe が write policy 非参照=live 未活性化=production 挙動変更0/route.ts 非参照/orchestrator·service に createClient·@supabase·.from("·.rpc·.insert·Date.now 不在)。reality: **tests/unit/reality/ 418 PASS**（A1-5-11-4 の 24 tests 含む）／ **broad reality 1110 PASS**（A1-5-11-4 の 24 tests 含む）。
- **tsc baseline 分離**: 自変更（4 module edit: capture-write-policy/orchestrator/service/observe + 1 新 test）**新規 error 0**・**reality lib tree 0**。project 全体 102（A1-5-11-3 の 〜138 から別セッション cleanup 継承で減少・**自ファイル 0 は一貫**・full tsc 0 ではない）。
- → **write-side policy を実 capture write runtime path（orchestrator + service）へ通し切る**（policy 指定で dedup+TTL・未指定で既存挙動不変）。**production 挙動変更 0**（live entry 未活性化・default 未配線）。raw/source_ref/UUID を policy/result 出力に出さない。**DB read/write 0・Supabase 0・実 RPC 0・route shell 0・route.ts 0・UI 0・production 0・migration 0・schema 0**。
- **しない（A1-5-11-4 範囲外）**: fireMorningCapture の live 活性化（read client plumbing + route.ts 変更・別 GO）/ `loadActiveCandidateEntries` provider 追加（活性化 slice と一体・別 GO）/ 実 DB read·write / 実 RPC / migration 作成·apply / schema 変更 / unique index / status 遷移·cleanup write / production 接続 / PRM·correction 実接続 / remote。

### 8.62 A1-5-11-5 実装（landed）— Capture Write Policy Live Activation（A1-5-11-4 の core policy を本流 capture write path に活性化・read client plumbing・fake/no-run・実行なし）

A1-5-11-5（A1-5-11-4 で orchestrator+service core に入れた write policy を **本流 fireMorningCapture から実際に効かせる**・**read client plumbing 設計**・**fake/no-run tests 中心**・実 DB write / 実 RPC / production / migration なし）:
- **read client plumbing**: fireMorningCapture の client を `MorningCaptureClient = RpcCapableClient & PendingCapturedRowsReadClient`（write=RPC + read=dedup provider）に拡張。実 Supabase client が構造的に満たす。route 2 本（/api/stargazer/alter・/api/alter-morning/plan）の cast を `as unknown as MorningCaptureClient` に更新（RpcCapableClient import 廃止）。**runtime object 不変**（同じ supabase・flags off は no-op）。
- **read provider**: `loadActiveCandidateEntries(client, userId, nowMs)`（morning-capture-surface.server・**read-only・fail-open []**）= loadPendingProjected（active placements + evidence + lifecycle meta）→ enrich → `buildLifecycleEntryFromPlacement`。本 module は `.from` を持たず canonical read source 委譲。raw/source_ref 非搬送。
- **dedup キー drift 防止（共有 builder）**: `buildLifecycleEntryFromPlacement`（candidate-lifecycle-guard・pure・SeedPlacement+SeedLifecycleMeta→CandidateLifecycleEntry）を新設し、**surface guard（consumption-surface-bridge applyLifecycleGuardToEnriched）と read provider が同一構築**。さらに write 候補 `draftToCandidateEntry`（orchestrator）の `desiredTimeHint` を **raw → band 正規化（bandFromTimeHint）** に修正＝A1-5-11-4 の latent な anytime 取りこぼし（write 候補 raw "anytime" ↔ read 既存 band null の不一致）を解消。3 者（write 候補 / read 既存 / surface guard）が同一 band キー。
- **fireMorningCapture 配線**: mode != null（write/observe）時に `policy = { existingActive: () => loadActiveCandidateEntries(client, userId, nowMs), nowMs: Date.now() }` を deps に載せる。nowMs は server で 1 回注入（pure orchestrator/policy を決定的に保つ）。**write/observe 両 mode に適用**＝observe を write の忠実な dry-run にする（would-suppress / would-expiry を観測）。**flags off → mode null → policy 構築前に return**（production no-op 維持）。**gate block 時は runCaptureService が orchestrator 前に停止し provider を呼ばない**（production hard block で read 0）。provider error / read 0 は fail-open（write 継続）。
- test +21（fake/no-run・実 DB 0・実 RPC 0・Supabase 0・deterministic）: buildLifecycleEntryFromPlacement（band/meta fallback/deterministic）/ loadActiveCandidateEntries（active→entry・anytime→band null・seed0→[]・read error→[]・raw 非搬送）/ dedup キー一致（anytime suppress=band 正規化・morning suppress・band 不一致 insert・policy 未指定 既存挙動）/ fireMorningCapture·route 静的配線（policy 構築・existingActive・nowMs・MorningCaptureClient・mode null return が policy より前・DB 非接触 / route は MorningCaptureClient cast・RpcCapableClient cast 廃止）。reality **439 PASS**（418→+21・既存 A1-5-9/A1-5-11-4 静的 test を新配線に更新）。
- **tsc baseline 分離**: 自変更（5 lib + 2 route + 3 test）**新規 error 0**・reality lib tree 0・stargazer route は pre-existing 15 のまま（増加なし）・**full baseline 55（A1-5-11-4-cleanup と同値・自誘発 0）**。
- → **write policy が本流 capture write path に活性化**（fireMorningCapture が read-backed policy を runtime に渡す・duplicate suppress / TTL expires_at が write path に効く状態）。**実行はしない**（flags off no-op・実 DB write/実 RPC/production/migration なし）。**production 挙動変更 0**（flags off で fireMorningCapture no-op）。
- **しない（A1-5-11-5 範囲外）**: 実行（flag ON での実 DB write / 実 RPC / route shell 実行）/ production 接続 / migration / PRM·correction 実接続 / remote / feat 側同期。

### 8.63 A1-5-11-6 実装（landed）— Runtime Duplicate / TTL Smoke（**EXECUTED & PASSED**・実 staging(hjcr) DB・one-shot harness・原則1回・doc-only）

A1-5-11-6（A1-5-11-5 で活性化した write policy を **実 staging(hjcr) DB** で検証・**EXECUTED & PASSED**・route shell 非実行・production 非接触）:
- **infra**: vitest one-shot harness（**untracked・実行後削除**・dotenv .env.local + dynamic import で PLAN_FLAGS を env 後評価・runtime path 直呼び＝route shell 非実行）。**belt-and-suspenders guards（write 前に throw）**: URL host ref===hjcr ∧ !==aljav（hard denylist）/ anon key JWT decode ref===hjcr ∧ role==='anon'（service_role 禁止）/ NODE_ENV≠production / sign-in user id self-pin（UUID）/ **pre-write USER_A rows===0**（dirty なら write しない）。auth=anon + signInWithPassword（user-RLS・service_role 0）。
- **path**: runMorningCaptureObserve(mode:write, gate 明示, deps{fake extractor(undated/morning/full_go/60min high・実 LLM 0) + real RPC writeClient(create_plan_seed_capture_bundle・SECURITY INVOKER・atomic) + policy{existingActive:loadActiveCandidateEntries(実 read), nowMs 注入}})。同 policy を 2 回の capture で共有（provider が毎回 live read）。RPC call counter で計数。
- **redacted report 全 PASS**（/tmp・raw/UUID/secret 非出力）: preWrite seed0/ev0・**1回目 captured・RPC1・seed1・evidence1**・seedIsUndated・**expiresAtPresent・ttlMatchesUndated14d（expires_at=now+14d）**・**2回目 suppressed・RPC still 1・seed still 1・ev still 1**（duplicate suppress が実 runtime で効く）・**surface candidateCount=1**（buildMorningCaptureSurface・flag/gate ON）・banner「候補」rendered・no-leak・**cleanup seed0/ev0**。
- **cleanup**: plan_seeds delete（owner-RLS plan_seeds_owner_delete）→ evidence 複合 FK **ON DELETE CASCADE** → rows 0。**独立 fresh-connection re-verify harness（read-only・別セッション）でも seed0/ev0**（DB 汚染 0 の二重確証）。harness 2 本（smoke + verify）実行後削除（git 非混入）。
- → **A1-5-11-5 の活性化 policy が実 staging runtime で動作実証**: 1回目 write / 2回目 同構造 duplicate suppress（RPC 増えない・rows 増えない）/ undated TTL expires_at（now+14d）/ surface 1 件 / write→read→UI loop。**DB 汚染 0・service_role 0・production(aljav) 接触 0・実 LLM 0・remote 0**。doc-only commit（コード変更なし・harness untracked 削除）。
- **しない（A1-5-11-6 範囲外）**: production 接続 / production flag ON / migration / partial unique index / status 遷移·cleanup job / PRM·correction 実接続 / remote。

### 8.64 A1-5-12 Production Canary Readiness Bundle（planning/audit・no-production・no-write・doc-only）— readiness 判定 + 運用/安全/rollback/migration design-only

A1-5-12（production canary 前の運用・安全・rollback を固める・status transition / cleanup / partial unique を判断・**no-production / no-write / planning+pure 境界**・実装は design-only）:

**■ 中核所見（evidence-based）: capture/surface は構造的に staging-only**
`evaluateCaptureGate`（capture-gate.ts L87-108）は production を **3 重に block**: ① nodeEnv=production→PRODUCTION_NODE_ENV（L93）② project ref=aljav→PRODUCTION_PROJECT_REF（L98・denylist）③ ref ∉ CAPTURE_STAGING_REF_ALLOWLIST=[hjcr]→NON_STAGING_PROJECT_REF（L100・allowlist）。surface gate（resolveSurfaceGate→evaluateCaptureGate）も同一 gate を共有。→ **capture write も surface read も現コードでは production に到達不能**。**「production canary」= gate の staging allowlist に production ref を加える deliberate な code 変更が前提**（＝これが "production ON" の本体・別 GO）。この staging-only 性質は realityCaptureGate.test.ts（L71-84 の 3 block + L33-40 の allowlist/denylist + kill-first + fail-closed）で **test-locked**（regression tripwire 済）。

**■ readiness 各次元（audit 結果）**
1. **flags/gate/kill ✅**: 全 reality flag は default-off・**module-load const**（featureFlags.ts L211-243）。production-default = 完全 no-op（fireMorningCapture→mode null return / buildMorningCaptureSurface→null）。gate=kill 最優先・全段 fail-closed・staging-only・test-locked。
2. **canary 条件 ⚠ 結合**: PLAN_CANARY_USER_IDS（canaryUserIds）は **reality capture/surface と personalModelIntegration V2（enhanceAlterNotes.ts L83）で共有**。canary user 追加は両機能を同時に有効化し得る（両 flag on 時）。→ 決定: ①結合許容（canary user に両機能）or ②feature 別 canary list 導入（code・別 GO）。
3. **rollback / kill ⚠ latency**: rollback = flag off or REALITY_CAPTURE_KILL=true。但し PLAN_FLAGS は module-load 評価ゆえ **反映に redeploy が要る（instant でない）**。production の真の instant-kill には runtime flag（DB/edge-config）が要る。canary（低 stakes）は redeploy-latency 許容。**production に対しては gate の staging-only allowlist 自体が構造的 rollback**（flag に関係なく production write 不能）。
4. **logging/redaction ✅**: live path の log は redacted observe sink のみ（alter-morning-capture-observe.ts L51・console.log {mode,outcome,wouldCapture,wouldEvidence,reason,note}・**raw 非出力**・write mode でも発火＝production 監視）。raw utterance を log しない。production volume では structured logging/metrics が将来課題（canary は console.log 許容）。
5. **DB row accumulation ⚠ canary は bounded**: write-time dedup（A1-5-11-4/5・staging で A1-5-11-6 実証）が同構造重複を防ぐ。但し expired 行は残る（cleanup なし）。canary（1 user・少数の distinct seed・週単位）では蓄積は bounded/minimal → 許容。scale では cleanup 要。
6. **status transition ❌ 未実装（design-only）**: runtime で status を flip する code は **無い**（seed は永久に 'active'）。surface guard（A1-5-11-2）が expired/stale を **表示から除外**（UX 正）するが DB 行は active のまま。design: active+expired→'expired' / surfaced+acted→'consumed' / dismissed→'rejected'（owner-RLS update）。
7. **stale/expired cleanup ❌ 未実装（design-only）**: cleanup job 無し。schema に **idx_plan_seeds_active_expiry（user_id, expires_at WHERE status='active'）partial index** 在り（sweep 用・既存・20260605100000 L62-64）。cron infra 在り（vercel.json crons + app/api/cron/）。design: cron `app/api/cron/reality-seed-cleanup`（DELETE WHERE expires_at<now OR 古い consumed/rejected）。**canary には不要**（蓄積 bounded）。
8. **partial unique index ❌ canary 不要（design-only）**: plan_seeds に unique 制約 **無し**（perf index のみ・RPC は無条件 INSERT）。read-before-write dedup は race-prone（非原子）だが canary 低 volume では race 窓ほぼ nil → 許容。原子的 partial unique index は **granularity caveat**: duration は evidence 表ゆえ seed 一意キーに含められず read-side dedup（duration 込み）より粗い（"gym 1hr" と "gym 2hr" を誤衝突させ得る）。→ **canary 不要・scale 用 design-only（caveat 明記）**。

**■ migration design-only（apply しない）**: ① partial unique index（user_id+action_shape+desired_date+desired_time_hint WHERE active・granularity caveat 付き）② status transition（cron + owner-RLS update）③ cleanup cron（app/api/cron/・active_expiry index 利用）。いずれも **design-only / 未 apply**。

**■ production canary ON 前の残タスク（「進めるか」の答え）**
1. **【唯一の構造 BLOCKER】gate allowlist 変更**（production ref を canary 用に許可）= security-sensitive code・別 GO・**= production ON の本体**。
2. canary 結合の決定（feature 別 list で decouple or 結合許容）。
3. instant-kill 機構（runtime flag）or redeploy-latency 許容の決定。
4. cleanup cron + status transition（sustained 運用・design-only→実装は scale 前・別 GO）。
5. production env provision + 監視（structured logs/metrics）。

**■ verdict**: **STAGING canary = READY**（A1-5-11-6 実証済）。**PRODUCTION canary = NOT YET**（gate が staging-only・production 到達には deliberate gate 変更が前提＝production ON 本体・別 GO）。運用 3 項目（cleanup/status/partial unique）は **小規模 canary の blocker でない**（蓄積 bounded・race nil）が scale 用 design-only。**現スライスから production canary ON へは進まない**（gate 変更 = production ON は別 GO）。

**■ しない（A1-5-12 範囲外）**: production 接続 / production flag ON / gate allowlist 変更 / migration apply / status transition·cleanup の実装 / PRM·correction 実接続 / remote。doc-only（コード変更 0・新 test 不要＝gate safety は既 realityCaptureGate.test で test-locked）。

### 8.65 A1-5-13 実装（landed）— Production Canary Gate Scaffold（gate capability + flags + tests・**default-off / production挙動変更0**・runtime 配線は別 slice）

A1-5-13（production canary に必要な gate scaffold を **default-off** で用意・reality 専用 canary list を分離・production ref 許可を明示・多重に・**no-production ON / no-write / pure+fake tests 境界**）:
- **gate 2-lane 化（capture-gate.ts evaluateCaptureGate）**: kill/flag/ref を先に評価し、**PRODUCTION CANARY lane**（`productionCanaryEnabled` ∧ aljav ref のみ・reality 専用 canary list 必須・shared へ fallback しない）と **DEFAULT/STAGING lane**（既存挙動 EXACTLY）に分岐。production lane は env 未設定→productionCanaryEnabled false→入らず default lane（＝既存 staging-only）へ。
- **新 input（optional・default-off）**: `productionCanaryEnabled?` + `realityCanaryUserIds?`（CaptureGateInput）。既存 caller/resolver は未指定＝off ゆえ **既存挙動・既存 test 不変**。
- **canary 優先（結合解消）**: reality 専用 list 非空→staging/production とも優先使用（PLAN_CANARY_USER_IDS 依存を減らす）。空→staging のみ shared へ fallback（後方互換）。**production lane は reality list 必須**（shared へ fallback しない＝production への user 混入を防ぐ）。
- **新 flags（scaffold・featureFlags.ts）**: `realityCaptureProductionCanary`（REALITY_CAPTURE_PRODUCTION_CANARY）+ `realityCanaryUserIds`（REALITY_CAPTURE_CANARY_USER_IDS）。**runtime resolver（resolveMorningObserveGate/resolveSurfaceGate）へは未配線＝設定しても現時点で production capture は起きない（dead-safe scaffold）**。配線は別 slice（activation）。
- **多重 production allow 条件**（全て必須）: !killed ∧ liveEnabled ∧ productionCanaryEnabled ∧ aljav ref ∧ reality canary 該当。env 未設定→必ず block。
- **設計判断**: ① scope = gate + flags + tests（resolver 配線は activation 別 slice・A1-5-11-4 core→11-5 wiring と同型）② 新 reason code 無し（既存 reuse・aljav+not-armed→PRODUCTION_PROJECT_REF 既存維持）③ ref を nodeEnv より先に評価（lane 分岐に ref 要・fail-closed 不変・undefined url + prod nodeEnv は UNRESOLVED へ＝既存 test 不該当・両 block）。
- test +14（pure・DB 0・production 0）: default→production block / kill→block / canary flag missing→block / flag true + 該当 user→allow / non-canary→block / reality list 空→NO_CANARY_ALLOWLIST(no fallback) / production lane でも kill·flag-off 優先 / staging ref + prod flag→staging lane / reality 専用 > PLAN_CANARY_USER_IDS 優先 / reality 空→shared fallback / production 挙動変更0 / verdict に UUID 非出力。**既存 gate 11 test + service/observe/surface test 不変**。reality **452 PASS**（439→+13）。
- **tsc baseline 分離**: 自変更（capture-gate + featureFlags + gate test）**新規 error 0**・reality lib 0・**full baseline 55（不変）**。
- → **production canary の gate capability を default-off で確立**（明示・多重・reality 専用 list 分離）。**production 挙動変更 0**（env 未設定→production block・既存挙動 EXACTLY）。**production ON はしない**（runtime 未配線・env 未設定）。
- **しない（A1-5-13 範囲外）**: runtime resolver への配線（activation・別 slice）/ env 設定 / production ON / production 接続 / DB write / migration / PRM·correction 実接続 / remote。

### 8.66 A1-5-14 実装（landed）— Runtime Resolver Wiring（gate scaffold を runtime resolver に接続・**default-off / production挙動変更0**・production ON しない）

A1-5-14（A1-5-13 の gate scaffold を runtime resolver に最小配線・PLAN_FLAGS の production canary 新 flag を gate input へ渡す・**env 未設定なら production block 維持**・**no-production ON / no-production接続 / no-env変更 / no-write 境界**）:
- **resolver 配線（最小）**: `resolveMorningObserveGate`（capture write path）+ `resolveSurfaceGate`（surface read path）の opts に `productionCanaryEnabled?` + `realityCanaryUserIds?` を追加し output（CaptureGateInput）へ `?? false`/`?? []` で concrete 化。caller（fireMorningCapture / buildMorningCaptureSurface）が **PLAN_FLAGS.realityCaptureProductionCanary + realityCanaryUserIds** を渡す。
- **default-off（production挙動変更0）**: env 未設定→PLAN_FLAGS.realityCaptureProductionCanary false / realityCanaryUserIds [] → resolver output productionCanaryEnabled false → gate production lane 開かず → **production block（既存挙動 EXACTLY）**。staging/hjcr は既存通り（production flag は staging に影響しない）。
- **kill 最優先維持**: resolver は killed を透過・gate が kill を最初に評価。
- test +13（pure・DB 0・production 0）: resolver→evaluateCaptureGate composition（env 未設定 + production ref→block / production flag true + reality canary 該当→allow / non-canary→block / shared canaryUserIds だけ→block（reality list 必須・fallback しない）/ kill→block / staging→既存 allow）+ 既存 resolver toEqual 更新（productionCanaryEnabled:false / realityCanaryUserIds:[] 追加）+ static（caller が PLAN_FLAGS の production canary scaffold を配線）。**既存 service/observe/surface test 不変**。reality **465 PASS**（452→+13）。
- **tsc baseline 分離**: 自変更（2 resolver + 2 test）**新規 error 0**・reality lib 0・**full baseline 55（不変）**。
- → **gate scaffold が runtime に接続**（env 設定だけで production canary を armable に）。**production ON はしない**（env 未設定→production block・production 接続 0）。**production 挙動変更 0**。
- **しない（A1-5-14 範囲外）**: production ON / production 接続 / production env 変更 / env 設定 / DB write / RPC 実行 / 実 LLM / migration / route shell 実行 / UI 変更 / PRM·correction 実接続 / remote。
- → **次の production canary ON は purely env**（REALITY_CAPTURE_PRODUCTION_CANARY + REALITY_CAPTURE_CANARY_USER_IDS + REALITY_CAPTURE_LIVE/SURFACE 設定 + production deploy + 監視・security-reviewed 別 GO）。コード変更不要。

### 8.67 A1-5-15 実装（landed）— Production Canary Final Preflight（最終確認 + production canary runbook・planning/audit・no-production・no-write・doc-only）

A1-5-15（production env 設定前の最終確認・production canary ON 用の実行手順を確定・**no-production ON / no-production接続 / no-env変更 / no-write / planning 境界**）:
- **成果物**: `docs/reality-production-canary-runbook.md`（CEO/operator 用・env 一覧・canary user 指定・rollback・monitoring・DB 監視・STOP 条件・段階実行手順）。
- **最終確認（evidence-based）**: env→PLAN_FLAGS→resolver→gate の chain 整合確認。env 名: `REALITY_CAPTURE_PRODUCTION_CANARY`（production lane 中核）/ `REALITY_CAPTURE_CANARY_USER_IDS`（reality 専用 list・auth UUID）/ `REALITY_CAPTURE_LIVE`（write）/ `REALITY_CAPTURE_OBSERVE`（dry-run）/ `REALITY_CAPTURE_SURFACE`（surface）/ `REALITY_CAPTURE_KILL`（rollback）。env 未設定→production block（A1-5-13/14・test-locked）。
- **重要所見: client banner display は DORMANT**: `selectMorningProtocolCaptureCandidate` は未 call・`useAlterChat.morningCaptureCandidate` は未抽出（grep 確証）。AskHero/MorningPlanCard の prop + CaptureCandidateBanner render は配線済だが、client が response から captureCandidate を**抽出していない**ゆえ常に undefined→banner 非表示。→ **production canary は backend-only**（capture write + surface server-side + DB）・**user の UI 不変**（最も保守的な canary・banner は別 slice）。`NEXT_PUBLIC_REALITY_CAPTURE_SURFACE_CLIENT` は不要（dormant ゆえ無効果・V2 fetch path 専用で production morning 未使用）。
- **段階導入（runbook §1）**: Phase 1 observe（実 DB write 0・gate + extractor 検証・non-canary→gate_blocked）→ Phase 2 live write（実 RPC write・suppress/TTL 確認）→ Phase 3 surface（任意・user 不可視）。
- **rollback**: `REALITY_CAPTURE_KILL=true`（最優先・最速）or flag off。但し PLAN_FLAGS module-load ゆえ redeploy 要（instant でない・A1-5-12）。構造 backstop=productionCanaryEnabled 無ければ production 必ず block。
- **monitoring**: redacted observe sink（`[reality.capture.observe]`・raw/UUID 非出力）。**DB 監視**: canary user の plan_seeds/evidence 件数（dedup で増えない・expired は cleanup なしで残るが bounded）。
- **STOP 条件**: non-canary write / RPC error 多発 / row 急増 / log に secret / 意図せぬ allow / production 障害。
- → **production canary ON は purely env**（A1-5-14 でコード完了）。実行は A1-5-16（CEO 手動・runbook 準拠・security-reviewed）。
- **しない（A1-5-15 範囲外）**: production ON / production env 変更 / production 接続 / DB write / RPC 実行 / 実 LLM / migration / route shell 実行 / UI 変更 / remote。doc-only（コード変更 0）。

## 9. A1-6 Candidate → Plan Action Flow（captureCandidate を「表示」から「予定反映できる候補」へ）

### 9.0 A1-6-0 実装（landed）— Candidate → Plan Action Foundation（pure decision + 最小本流設計・no-production・no-write・fake tests）

A1-6-0（surfaced candidate への user 操作 accept/dismiss/later を seed status 遷移 + plan 反映意図に写す pure foundation + action flow の最小本流設計・**no-production / no-real-write / fake tests 境界**）:

**■ 本流設計（最小）: candidate → plan action flow**
- **flow**: A1-5 capture surface の `captureCandidate`（surfaced candidate）→ user 操作（accept/dismiss/later）→ **seed status 遷移 + plan 反映**。
- **operations**: **accept** → seed status `consumed`（DraftPlan に組み込み）+ **plan へ反映**（reflectsToPlan）/ **dismiss** → seed status `rejected`（ユーザー棄却）/ **later** → 変更なし（active のまま・deferred＝freshness/TTL 窓内で再 surface）。
- **status transition**（A1-5-12 で未実装と特定 → 本 arc で設計）: active→consumed（accept）/ active→rejected（dismiss）/ active 維持（later）。**idempotency**: 非 active（consumed/rejected/expired）→ no-op（二重操作防止）。実 update は owner-RLS update（plan_seeds_owner_update・**別 slice の live path**）。
- **plan 反映経路（accept）**: surfaced candidate → 対応 seed 解決 → SeedPlacement → **`generateComplete`（A1-4・SeedPlacement → CandidateDraft place op）** → **`create_external_anchor_bundle` RPC**（external_anchor write）。＝既存 plan engine（A1-4）+ anchor 書込（A1-5 capture write とは別 RPC）を再利用。**実反映は別 slice の live path**（DB write 境界）。
- **boundary（client ↔ server）**: client は **redacted candidate**（seedRef なし・A1-5-7-6/7）。action のため **opaque candidate handle**（seedRef を露出しない server 解決トークン）を surface DTO に付与し client が action 時に返す → server が seed に解決。**handle 設計 + 解決は別 slice**（本 slice は decision logic のみ・seedRef を client に出さない原則維持）。
- **UI/state**: CaptureCandidateBanner に accept/dismiss/later 操作を additive（banner は MorningPlanCard 内・**client display は現在 dormant〔A1-5-15〕**ゆえ banner live 化 + action UI は別 slice）。client state は optimistic + server 確定。

**■ pure foundation（本 slice 実装）**: `lib/plan/reality/candidate-action.ts`（pure・no-DB・barrel 非 export）:
- `decideCandidateAction(action, currentStatus) → { valid, reason, nextStatus, reflectsToPlan, deferred }`。active のみ作用（idempotency）・accept→consumed(reflect)/dismiss→rejected/later→null(deferred)・未知 action→unknown_action(fail-closed)。raw/seedRef/UUID を出力に持たない（enum + boolean のみ）。`isActionableStatus` / `isValidActionKind` / `CANDIDATE_ACTION_KINDS`。
- test +14（pure・DB 0）: active accept/dismiss/later の outcome / 非 active idempotency（consumed·rejected·expired × 3 action → not_active no-op・二重 accept 防止）/ 未知 action→unknown_action / helpers / redaction（UUID/seedRef 非出）/ deterministic / 静的 pure。reality **479 PASS**（465→+14）。自変更 tsc 新規 error 0・reality lib 0・full baseline 55（不変）。

**■ 別 slice（live path・危険境界）**: opaque candidate handle 設計+解決 / 実 status update（owner-RLS）/ 実 plan 反映（generateComplete→create_external_anchor_bundle write）/ action route / client display live 化 + action UI / snooze（later の再 surface 時刻）。

**■ しない（A1-6-0 範囲外）**: 実 DB write / 実 status update / 実 plan 反映 / route shell 実行 / UI 変更 / production / migration / remote。

### 9.1 A1-6-1 実装（landed）— Candidate Action Handle / Request Contract（opaque handle + 解決方針・pure・no-DB・fake tests）

A1-6-1（client に seedRef/UUID を出さず candidate 操作を成立させる仕組み・accept/dismiss/later の request contract + opaque handle + server 解決方針・**no-DB-write / no-route / no-UI / pure+fake tests 境界**）:

**■ opaque handle 設計（案比較）**
- **採用: 一方向 hash + 再導出**（`handle = "c1:" + sha256(seedRef)`）。**stateless・secretless・RLS-scoped・fail-closed**。client は seedRef を持たない→偽造不能。server は認証 user の surfaceable seed を再 read + 再導出で照合。userId 結合は RLS scope ゆえ不要（defense-in-depth で将来可）。version 前置（c1:）で方式変更に備える。
- 却下: ① **署名/暗号トークン**（seedRef を隠すなら暗号鍵=secret 必要・複雑）② **stateful mapping**（handle→seedRef を storage=DB write 必要・重い）。一方向 hash が最も単純で十分（secret/state 不要）。

**■ request contract + 解決方針**
- **contract（client→server）**: `{ handle, action }`（handle は opaque・seedRef なし）。
- **validate（fail-closed）**: object でない→not_object / handle 形式不正→invalid_handle / action 不正→invalid_action。
- **解決（surfaceable のみ・race-safe）**: handle → **現在 surfaceable** な candidate に照合（server が action 時に再 read + 再 guard した surfaceable 集合）。一致なし→**unresolved**（stale/expired/consumed/duplicate-suppressed/unknown＝現在 surface 不可＝操作不可）。表示〜操作間の race は再 guard で fail-closed。
- **decision 接続**: resolve → decideCandidateAction（A1-6-0・idempotency 防御）→ outcome。
- **redaction（厳守）**: resolved.seedRef は **server-side のみ**（live path の status update / plan 反映 用）。client response は `redactResolutionForClient` で **{accepted, reason, reflectsToPlan, deferred}** のみ（**seedRef / nextStatus を出さない**）。

**■ pure 実装（本 slice）**: `lib/plan/reality/integration/candidate-action-handle.ts`（**server-only・deterministic**・no-DB・barrel 非 export）:
- `deriveCandidateHandle`（sha256・一方向）/ `CANDIDATE_HANDLE_RE` / `validateActionRequest`（fail-closed）/ `resolveCandidateHandle`（surfaceable のみ）/ `resolveAndDecideAction`（validate→resolve→decide）/ `redactResolutionForClient`（seedRef/nextStatus 非出）。surfaceable 集合は **注入**（実 read は別 slice）。
- test +23（pure・DB 0）: handle 一方向/determinstic/seedRef 非含有 / validate fail-closed（not_object/invalid_handle/invalid_action）/ resolve（surfaceable 一致→解決・不在→fail-closed・空→null）/ resolveAndDecide（accept→consumed/dismiss→rejected/later→deferred/malformed/unresolved/not_actionable）/ redaction（seedRef・nextStatus 非出）/ 静的（server-only・sha256・no-DB-client・barrel 非 export）。reality **502 PASS**（479→+23）。自変更 tsc 新規 0・reality lib 0・full baseline 55（不変）。

**■ 別 slice（live path・危険境界）**: surface DTO への handle 付与（presentCandidateSurface・CandidateSurfaceItem に handle）/ action route（request 受け→surfaceable 再 read→resolveAndDecideAction→status update→plan 反映→redactResolutionForClient）/ 実 status update（owner-RLS）/ 実 plan 反映（generateComplete→create_external_anchor_bundle）/ UI（banner ボタン）。

**■ しない（A1-6-1 範囲外）**: DB write / RPC 実行 / route shell 実行 / UI 変更 / surface DTO 変更 / migration / production / service_role / remote。

### 9.2 A1-6-2 実装（landed）— Candidate Handle Surface Propagation（surface DTO → client へ handle を安全に流す・pure・no-UI・no-route・no-DB）

A1-6-2（A1-6-1 の opaque handle を **surface DTO → client request builder** まで安全に流す・**seedRef/UUID は出さない**・**UI 表示は変えない（banner dormant 維持）**・**action route / DB write はしない**）:

**■ 独立評価（GPT 判断を鵜呑みにせず）**
- GPT「handle を surface DTO → client state まで流す」の**方向性は妥当**（handle は後の action route で client が送り返すため client まで届ける必要）。
- ただし**緊張を発見**: client 抽出（`selectMorningProtocolCaptureCandidate`）は **dormant**（A1-5-15）。live 抽出を wiring すると banner が出現＝**UI 表示変更**＝GPT の「UI 表示はまだ変えない / existing banner 見た目不変」と矛盾。
- → 整合解: **DATA パイプライン**（server DTO に handle 付与 + redaction が handle 保持/seedRef drop + client extractor が handle 保持 + request builder）を構築し、**live wiring（useAlterChat→banner 出現）は UI slice に遅延**。「handle が client に届く」は **extractor 出力（client-state の形）が handle を運ぶ**ことで満たす（isolation test）。banner dormant 維持で「no UI change」を絶対遵守。

**■ 設計（純度境界が鍵）**
- **handle 導出は server-side のみ**（node:crypto）。client は seedRef を持たない→導出しない（handle を受け取るだけ）。
- `candidate-surface.ts`（**pure**）+ `candidate-response-assembler.ts`（**client-safe**・client redaction が delegate）は **crypto を import しない**。
  - presentCandidateSurface に **`deriveHandle` を注入**（pure 維持・crypto は外から）。server-only bridge（consumption-surface-bridge.ts）が `deriveCandidateHandle`（A1-6-1）を渡す。
  - redaction（redactCaptureCandidateSurface）は handle を **形式一致時のみ保持**（inline regex・server-only module を import しない・seedRef/UUID が紛れても drop）。

**■ 変更（surgical）**
- `candidate-surface.ts`: `CandidateSurfaceItem.handle?`（optional・**deriveHandle 未注入なら無＝既存不変**）。`toCandidateSurfaceItem(p, deriveHandle?)` / `presentCandidateSurface(input, deriveHandle?)` に注入。**crypto 非 import（pure 維持）**。
- `consumption-surface-bridge.ts`（server-only）: `deriveCandidateHandle` を presentCandidateSurface に注入 → **live surface が handle を運ぶ**（flag-gated・production 不可視）。
- `candidate-response-assembler.ts`（client-safe）: `redactSurfaceItem` が handle を **形式一致時のみ保持**（defense-in-depth）。client redaction も同一 core を delegate → server/client 両方が保持。
- `captureCandidateClient.ts`（client）: `buildCandidateActionRequest(handle, action)`（pure・`{ handle, action }`・seedRef なし）。

**■ 往復整合（後の action の前提）**: surface の handle = `deriveCandidateHandle(seedRef)` → A1-6-1 `resolveCandidateHandle` で元 seedRef に解決可能（test で検証）。client は handle を action request に載せ、server が surfaceable 集合で再解決。

**■ tests +15（pure・DB 0）**: presentCandidateSurface（deriveHandle 注入→handle/形式/seedRef 非搬送・未注入→handle 無＝既存不変）/ toCandidateSurfaceItem / 往復整合（resolveCandidateHandle で解決・別 seed→fail-closed）/ redaction（valid 保持・UUID 混入 drop・extra key drop・handle 無は key 足さない）/ buildCandidateActionRequest（{handle,action}・seedRef なし）/ 静的（candidate-surface・assembler が crypto/server-only/handle-module を持たない）。reality **517 PASS**（502→+15）。wave3PlanRoute 13 PASS（route 回帰 0）。自変更 tsc 新規 0・baseline 55（不変）。

**■ 別 slice（live path・危険境界）**: live useAlterChat wiring（banner 出現）/ action route（request→surfaceable 再 read→resolveAndDecideAction→status update→plan 反映→redact）/ UI ボタン（accept/dismiss/later）/ 実 status update / 実 plan 反映。

**■ しない（A1-6-2 範囲外）**: live wiring（banner 出現）/ UI 見た目変更 / action route / route.ts 変更 / DB write / RPC / migration / production / service_role / remote。

### 9.3 A1-6-3 実装（landed）— Candidate Action Server Orchestrator / No-write Plan（accept/dismiss/later の server 実行を pure に固める・no-DB・no-execution）

> ⚠️ **§9.5/§9.6（A1-6-5a）で `plan_reflection` op は誤設計と判明し削除（status-only に修正）**。以下の plan_reflection / 安全順序の記述は旧設計（accept は status→consumed のみが正・reflection は read/computation 側）。

A1-6-3（accept/dismiss/later を受けた時 server が何を実行すべきかを **operation plan** として pure に固める・**DB write も route 接続も UI 変更もしない**・実行は plan に留める）:

**■ 独立評価（GPT 判断を鵜呑みにせず）**
- GPT「server 実行を pure に固める（op plan）」の**方向性は妥当**。pure 決定（A1-6-0/1/2）と live 実行（route+DB write）の**継ぎ目**。ここを純粋・tested に固めれば live route は plan を読んで dispatch する**薄い executor** になる（DB-write 境界のロジック最小化・事前に最大テスト）。
- ceremony 懸念を自問→ op plan が ADD する価値: ①from-status guard（active→X・楽観的並行制御 `WHERE status=from`）②reflection の KIND 明示（route 推論不要）③順序付き op 列（fail-stop）④action→server ops を 1 つの pure・tested な場所に集約。→ 実行契約（ceremony でない）。
- **GPT の順序前提に疑義**: GPT は「status→reflection」順だが、**accept は reflection（anchor）を先・status（consume）を後**にすべき（anchor 失敗時に consume しない＝seed は active のまま retryable・「consume したのに plan に無反応」を防ぐ）。→ 安全順序を採用。

**■ 監査（op 構造の確定）**
- `create_external_anchor_bundle`（20260519100000）= external_anchor_sources/external_anchors のみ insert・**plan_seed を触らない** → anchor write と consume は**別 op**（二重 consume なし）。
- seed status update（active→consumed/rejected）は**未実装**（本 arc の設計）→ status_transition は route が実装する planned intent。
- `generateComplete`（A1-4）= CompleteInput→CandidateDraft|null（reflection は route が実行時に呼ぶ）。

**■ operation plan（pure・redacted）**
- `CandidateOperation` = status_transition{from,to}（enum・seedRef なし）| plan_reflection{reflection:"external_anchor"}（KIND のみ・**draft なし**＝draft の id="complete-{seedRef}" は seedRef を持つ→route が実行時生成）。
- `CandidateOperationPlan` = {accepted, reason, operations[], deferred}。
- `planCandidateActionOperations(outcome)`: valid→reflection を先 + status を後（安全順）/ invalid→fail-closed（accepted=false・operations=[]）。
- `planCandidateActionFromResolution(resolution)`: A1-6-1 resolution → plan（**resolution.seedRef は読まない**・unresolved→fail-closed）。
- 対応: accept→[reflection, status(active→consumed)]・deferred=false / dismiss→[status(active→rejected)] / later→[]・deferred=true / 非 active・unresolved→fail-closed。

**■ 実装**: `lib/plan/reality/candidate-action-orchestrator.ts`（pure・no-DB・no-execution・barrel 非 export・type-only import で server-only に依存しない）。

**■ tests +12（pure・DB 0）**: accept/dismiss/later の op plan（安全順）/ 非 active fail-closed(3×3)/ resolution→plan（resolved・unresolved・malformed・not_actionable）/ redaction（seedRef/UUID/raw/draft/complete- 非出）/ deterministic / 静的（generateComplete/anchor RPC/DB を持たない・barrel 非 export）。reality **529 PASS**（517→+12）。自変更 tsc 新規 0・baseline 55（不変）。

**■ しない（A1-6-3 範囲外）**: DB write / RPC 実行 / status update 実行 / reflection 実行（generateComplete 呼び+anchor write）/ route 接続 / route.ts 変更 / UI / migration / production / service_role / remote。

### 9.4 A1-6-4 実装（landed）— Candidate Action Executor / Route Contract Skeleton（operation plan の実行を executor 注入で no-write 検証・request/response contract）

> ⚠️ **§9.5/§9.6（A1-6-5a）で `applyPlanReflection` / reflection→status 順 / reflection_failed は削除（status-only に修正）**。以下の reflection 関連の記述は旧設計（executor は `applyStatusTransition` のみが正）。

A1-6-4（A1-6-3 の operation plan を **将来 route がどう実行するか** を no-write で固める・**executor を注入**して実行 semantics を fake で検証・**実 DB write も route 接続も UI もしない**）:

**■ 独立評価（GPT 判断を鵜呑みにせず）**
- GPT「executor interface + fake で order/fail-stop/redaction を検証」は妥当。executor を **DI 分離**すれば実行 semantics を DB なしに検証でき、live route は real executor 実装 + 配線だけの薄い層になる（DB-write 境界のロジック最小化）。
- **順序と atomicity を深く再検証**: reflection-first（A1-6-3）は非 atomic で「2 失敗モードの深刻度比較」→「consume したのに plan 無反応（intent 喪失・回復不能）」≫「重複 anchor（dismiss で回復可・並行 submit 稀）」ゆえ正しい。ただし重複 anchor を真に無くすには executor primitive の contract（**applyPlanReflection は seedRef で冪等**・**applyStatusTransition は from=active atomic**）が要る → 文書化し、真の atomicity は live executor（transaction/冪等 RPC）の責務とする。

**■ 監査**
- plan_seed status 更新 path は**未実装** → applyStatusTransition は live executor が実装する planned primitive。
- create_external_anchor_bundle(p_user_id, p_source, p_anchors)・auth.uid()==p_user_id guard → live applyPlanReflection は generateComplete→draft→this RPC。
- response envelope = `NextResponse.json({ ok: true, data })` → route が RedactedActionResponse を wrap。

**■ 実装（pure harness + 注入 executor）**: `lib/plan/reality/integration/candidate-action-executor.ts`（server-only・no-write・barrel 非 export）:
- `CandidateActionExecutor`（interface・DB primitive を注入）: applyPlanReflection(seedRef)・applyStatusTransition(seedRef, from, to)→{ok}。
- `executeCandidateOperationPlan(plan, seedRef, executor)`: plan.operations を順に実行・fail-stop・redacted response。reflection 失敗→reflection_failed（status しない）・status 0 rows→status_conflict（from=active guard）。
- `handleCandidateActionRequest(raw, surfaceable, executor)`（route skeleton）: resolveAndDecideAction（A1-6-1）→ planCandidateActionFromResolution（A1-6-3）→ executeCandidateOperationPlan。未解決→executor 呼ばず redacted fail。**seedRef は executor へのみ**（response 非搬送）。

**■ tests +12（fake executor・DB 0）**: accept（reflection→status の順・accepted）/ fail-stop（reflection 失敗→status 未 call・reflection_failed）/ status_conflict（status 0 rows・reflectsToPlan true）/ dismiss（status のみ）/ later（executor 呼ばない・deferred）/ fail-closed（unresolved・非 active consumed・malformed→executor 呼ばない）/ redaction（response に seedRef 非出・calls には seedRef あり=server-side）/ harness 単体（not accepted→fail-closed）/ 静的（server-only・DB/generateComplete/anchor RPC 非含有・barrel 非 export）。reality **541 PASS**（529→+12）。自変更 tsc 新規 0・baseline 55（不変）。

**■ しない（A1-6-4 範囲外）**: real executor（DB primitive）/ 実 DB write / 実 status update / 実 reflection（generateComplete 呼+anchor RPC）/ route 接続 / route.ts 変更 / UI / migration / production / service_role / remote。

### 9.5 A1-6-5R 設計（no-write）— Candidate → Plan Reflection 設計修正（accept reflection の正しい永続化）

A1-6-5（real executor + staging smoke）を **CEO 判断で保留**（DB write / real executor / smoke 未着手）。先に accept reflection の正しい永続化を **pure に設計**する。

**■ 監査で判明した misdesign（A1-6-3/A1-6-4 が design から引き継いだ誤前提）**
A1-6-3/A1-6-4 は accept = status→consumed + **plan_reflection（generateComplete→create_external_anchor_bundle）** と設計したが、監査で成立しないと判明:
1. **型/概念不一致**: generateComplete = gap-fitting で**可動 CandidateDraft**（proposed/movable）/ create_external_anchor_bundle = **固定 ExternalAnchor**（confirmed・hard/soft）。合成不能。
2. **title 源なし**: external_anchors は `title` 必須・seed は **column-restricted**（raw text 不持込）。
3. **時刻なし**: external_anchors は exact time 必須・candidate は **band のみ**。
4. **table 用途違い**: external_anchors = 確認済み外部スケジュール import（PDF/calendar/chat・`confirmed_at` 不変条件「未確認 AI 抽出は永続化禁止」）。

**■ 監査で判明したデータモデル（正しい reflection の鍵）**
- **plan は computed**（draft_plan/plan_item table なし。DraftPlan は計算型 `lib/plan/draft-plan.ts`）。
- **PlanSeedStatus**: active=「DraftPlan 配置候補」/ **consumed=「DraftPlan に組み込まれた」** / rejected / expired。
- **既存 read は active のみ**（consumed/rejected/expired は除外）。consumed 行を plan に組み込む read は**未実装**。
- status 遷移（active→consumed/rejected）の write も**未実装**（capture-write-policy が future slice と明記）。

**■ 正しい reflection モデル（修正案）**
→ **accept に「別 reflection write（anchor）」は不要**。reflection は **status→consumed + DraftPlan computation が consumed seed を組み込む**こと。
- **executor（write）= status のみ**: accept→consumed / dismiss→rejected / later→no-op。**generateComplete も anchor write も executor では呼ばない**。
- **reflection（read/computation）**: DraftPlan computation が **consumed seed を読み**、plan item として render（**generateComplete は computation 側で gap-fitting に使う**・executor ではない）。active seed=候補提案（surface）/ consumed seed=確定 plan item。
- **external_anchor は candidate reflection と無関係**（外部 import 専用）。

**■ A1-6-3/A1-6-4 への修正（executor resume 時に適用・本スライスでは code 変更しない）**
- op plan の **plan_reflection op を削除**。accept = [status_transition(active→consumed)] のみ / dismiss = [status_transition(active→rejected)] / later = []。
- A1-6-4 executor interface から **applyPlanReflection を削除**（applyStatusTransition のみ）。reflection_failed reason も不要。
- → executor が大幅に**単純化・安全化**（status UPDATE のみ・anchor write なし・並行性 = from=active guard のみで十分）。

**■ 未解決の product/privacy 判断（CEO へ surface）**
- **consumed seed の plan item label**: column-restricted で raw text を捨てたため render 時の活動名が無い。選択肢: (a) 構造由来の generic label / (b) capture 時に最小 label 保存（privacy trade-off）/ (c) accept 時に user が命名（richer accept UI）。
- **plan computation を consumed seed 読みに拡張**（現状 active のみ）+ band→time の placement semantics。
- **accept の UI 性質**: {handle, action} の one-click か、label/time を確認する richer flow か。

**■ 次**: product/privacy 判断 → reflection computation 設計（consumed seed → DraftPlan item）→ A1-6-3/A1-6-4 修正（plan_reflection 削除）→ A1-6-5 resume（**status-only** executor + staging smoke）。

**■ しない（本設計スライス）**: code 変更 / DB write / real executor / migration / production。

### 9.6 A1-6-5a 実装（landed）— Accept Reflection Correction（plan_reflection 削除・status-only）

A1-6-5a（CEO 暫定方針に基づき A1-6-3/A1-6-4 の誤った `plan_reflection` op を削除し **status-only** に修正・DB write/route/UI 不変）:

**■ CEO 暫定方針（status-only accept）**
accept = status=consumed のみ / external_anchor・create_external_anchor_bundle は使わない / generateComplete は executor で呼ばない / consumed seed は read/computation 側で DraftPlan 反映 / 初期 label は privacy-safe generic / raw・source_ref 保存しない / richer label・user naming は後続。

**■ 監査（外部消費者なし）**: PlanReflectionOperation / applyPlanReflection / plan_reflection / reflection_failed は本流 2 ファイル + その test のみ（外部 import なし）→ 安全に削除可能。

**■ 修正（surgical・2 source + 2 test）**
- `candidate-action-orchestrator.ts`（A1-6-3）: PlanReflectionOperation 削除・`CandidateOperation = StatusTransitionOperation`・CandidateOperationPlan に **reflectsToPlan** 追加（outcome から伝播・response フラグ）・planCandidateActionOperations は status_transition のみ push。→ accept→[status_transition(active→consumed)]+reflectsToPlan=true / dismiss→[status_transition(active→rejected)]+false / later→[]+deferred。
- `candidate-action-executor.ts`（A1-6-4）: CandidateActionExecutor から **applyPlanReflection 削除**（applyStatusTransition のみ）・executeCandidateOperationPlan は reflection 分岐削除・reflectsToPlan は plan から伝播・reflection_failed reason 廃止。→ executor 大幅単純化（status UPDATE のみ・anchor write なし・generateComplete 不在）。

**■ tests 修正**: A1-6-3 test（accept→status のみ・reflectsToPlan 検証・redaction に external_anchor/plan_reflection 非出追加）・A1-6-4 test（fakeExecutor から reflection 削除・fail-stop test 削除・status_conflict は status のみ call・reflectsToPlan plan 伝播）。reality **540 PASS**（541→-1=fail-stop test 削除・回帰 0）。自変更 tsc 新規 0・baseline 55（不変）。

**■ 必須充足**: accept は consumed のみ✓ / dismiss は rejected のみ✓ / later は no-op✓ / reflection・anchor・generateComplete を executor から完全除去✓ / response に seedRef/UUID/raw/source_ref 非出✓ / existing tests を新設計に整合✓。

**■ しない（A1-6-5a 範囲外）**: DB write / RPC / route / UI / migration / production / external_anchor / raw 保存 / remote。

**■ 次**: consumed seed → DraftPlan computation の pure 設計（reflection の read 側）。

### 9.7 A1-6-5b 実装（landed）— Consumed Seed → DraftPlan Reflection（pure 設計 + helper・no-DB・no-raw）

A1-6-5b（consumed seed を DraftPlan に反映する pure 設計 + helper・**raw 不使用・generic label**・二層モデル・DB write/route/UI 不変）:

**■ 二層モデル（active と consumed の分離）**
- **active seed** → candidate surface（A1-5「候補があります」）。**不変**（本 module は触らない・active は引き続き surface 側）。
- **consumed seed** → **確定 plan item**（本 module）。user が accept した intent ゆえ candidate より committed。

**■ generateComplete を使わない判断（独立推論）**
- generateComplete（A1-4・gap-fitting）は full day context（existing nodes/gaps/bandBounds）= live read が必要で pure にならず、governance も proposed/tentative（候補用）で確定 item に不適。
- → **consumed 専用 builder** で band 既定配置 + 確定。gap-fitting（既存 node 衝突回避）は live computation の後段 refinement に分離。

**■ 監査で固めた具体**
- TimeBand = morning/afternoon/evening（timeHint は anytime も）・TimeWindow={band} のみ（clock なし）→ band→time は設計値。time は分（0-1440）。
- ActionShape 8 値（full_go/bounded_go/prepare_then_go/trial_then_decide/observe_first/delegate_or_request/defer_with_trigger/skip）= **approach/commitment** の形で**活動内容を断定しない** → label の非断定修飾に安全。
- seed-source は status='active' 固定（L98）→ consumed reader は別経路（live・本 slice は contract のみ）。

**■ pure helper（`lib/plan/reality/consumed-seed-reflection.ts`・barrel 非 export）**
- `ConsumedSeedReflectInput`（display-relevant・**seedRef/raw を持たない**: status/durationMin/date/band/actionShape?）。
- `isConsumedReflectable`: **status='consumed' ∧ duration>0** のみ true（active/expired/rejected/duration 無 → false・fail-closed）。
- `bandDefaultStartMin`: morning=540/afternoon=780/evening=1080/anytime=720（pure default・live で PRM override 可）。
- `buildGenericPlanLabel`: 構造のみ「{帯}の予定（{分}{・非断定 commitment}）」。raw 不使用・活動内容を断定しない。
- `consumedSeedToPlanItem`: consumed → ConsumedPlanItem{label,startMin,endMin,date,band,confirmed:true}（**seedRef/id を出さない**）/ 非 reflectable → null。
- `selectConsumedPlanItems`: consumed のみ filter（二層分離）。

**■ tests +18（pure・DB 0）**: guard（consumed∧duration>0 のみ・active/expired/rejected/duration無→false）/ band 既定/ generic label（構造・非断定・actionShape 修飾・raw 英字なし）/ transform（item 化・null guard・clamp 1440）/ select（consumed のみ）/ redaction（seedRef/UUID/raw/source_ref 非出）/ 静的。reality **558 PASS**（540→+18）。自変更 tsc 新規 0・baseline 55（不変）。

**■ 必須充足**: raw 発話なしで成立✓ / generic label 過度に断定しない✓ / consumed のみ確定 item 化✓ / active は surface 側に残す✓ / expired·rejected·active を誤って item 化しない✓ / output に seedRef/UUID/raw/source_ref 非出✓。

**■ live computation の統合点（別 slice）**: consumed reader（status='consumed' column-restricted read・seedRef を server-side で保持）→ ConsumedSeedReflectInput（redact）→ selectConsumedPlanItems → DraftPlan node に merge（id/seedRef 紐付けは server-side）+ gap-fit refinement（PRM/active window/既存 node 衝突回避）。

**■ しない（A1-6-5b 範囲外）**: DB write / consumed reader 実装 / RPC / route / UI / migration / production / raw 保存 / source_ref surface / external_anchor / remote。

### 9.8 A1-6-5c 実装（landed）— Consumed Seed → DraftPlan Merge Skeleton（repository interface + pure additive merge・no-real-read・no-DB）

A1-6-5c（consumed seed を DraftPlan computation に additive に混ぜる read/computation 骨格・repository 注入 + pure merge・実 DB read/write/route/UI 不変）:

**■ 独立評価**: GPT「read/computation 骨格」妥当。A1-6-4 executor パターン（interface 注入 + fake 検証）を read 側に適用。実 read を repository に閉じれば merge semantics を DB なしに検証でき、live computation は real repository 注入だけになる。

**■ 監査で固めた具体**
- DraftPlan = {id, userId, date, level, items: DraftPlanItem[], generatedAt, generatedBy, basedOn, status}。DraftPlanItem = {id, startTime: "HH:MM", endTime?, title, origin: anchor/seed/rhythm_inferred, rigidity: hard/soft/suggestion, reason?, confidence}。
- **node id は opaque handle**（A1-6-1 deriveCandidateHandle・seedRef-free）→ seedRef を出さない。
- **startTime format = "HH:MM"**（既存 `formatMinutes`[timeline-geometry・pure] を再利用＝DRY・format 整合）。
- origin="seed"（DraftPlan 内の seed-origin = 承認済み・active proposal は surface 側で DraftPlan に来ない）・rigidity="suggestion"（band-level movable）。

**■ pure 実装（`lib/plan/reality/consumed-seed-merge.ts`・barrel 非 export）**
- `ReflectableConsumedSeed`（= ConsumedSeedReflectInput + handle・**seedRef なし**）。
- `ConsumedSeedRepository`（read 注入 interface・live=実 DB / test=fake・本 skeleton は呼ぶだけ）。
- `consumedSeedToDraftPlanItem`: A1-6-5b guard + label/time → DraftPlanItem（id=handle・HH:MM・origin=seed）/ 非 reflectable → null。
- `mergeConsumedSeedsIntoDraftPlan`: **additive**（既存 items 末尾追加・他 field 不変・basedOn 不触）+ **date filter**（同日のみ・undated/他日除外）+ **duplicate guard**（既存 handle 再追加しない・idempotent）+ 対象なし→元 DraftPlan 同一参照。
- `reflectConsumedSeedsIntoDraftPlan`: repository 注入で read → merge（composer）。

**■ tests +15（fake repository・DB read 0）**: transform（consumed→item・非 consumed→null）/ additive（既存 item 同一参照・id/userId/basedOn 不変・対象なし同一参照）/ date filter（他日・undated 除外）/ duplicate guard（既存 handle 再追加しない）/ 二層分離（混在→consumed のみ）/ composer（fake repo read→merge・空→no-op）/ redaction（seedRef/UUID/raw/source_ref 非出）/ 静的。reality **573 PASS**（558→+15）。自変更 tsc 新規 0・baseline 55（不変）。

**■ 必須充足**: consumed seed だけが DraftPlan item✓ / active は surface 側に残る✓（DraftPlan に来ない）/ expired·rejected·active を誤って混ぜない✓（guard）/ merge は additive で既存を壊さない✓ / output に seedRef/UUID/raw/source_ref 非出✓（id=opaque handle）/ generic label 非断定✓。

**■ live 統合（別 slice）**: real ConsumedSeedRepository（plan_seeds status='consumed' column-restricted read・seedRef→handle 変換・redact）+ reflectConsumedSeedsIntoDraftPlan を morning pipeline の DraftPlan 組成に配線 + gap-fit refinement（PRM/active window/衝突回避）+ undated→today 割当。

**■ しない（A1-6-5c 範囲外）**: 実 DB read / DB write / RPC / route / UI / migration / production / raw 保存 / source_ref surface / external_anchor / remote。

### 9.9 A1-6-5d Part 1 実装（landed）— Real Status-only Executor + feasibility audit（DB-write primitive・fake-verified・smoke は gated 次段）

A1-6-5d（status-only real executor + consumed reflection の controlled staging smoke）の **Part 1**: real status-only executor + 包括 feasibility audit。**実 DB write は controlled staging smoke で・gated 次段**（.env.staging.local 未設定 + 初 DB-write ゆえ focused 運用）。

**■ 独立評価**: GPT「real executor + smoke」妥当。前回 A1-6-5 の blocker（reflection misdesign）は A1-6-5a/b/c で解消済。accept は単一の条件付き UPDATE（status-only）。

**■ feasibility audit（全 PASS）**
- **auth**: `.env.local` の `STAGING_USER_A_EMAIL/PASSWORD`（staging test user）+ anon key。service_role var なし → service_role 0。
- **plan_seeds RLS**: owner select / insert / update / **delete** 全 present（L84-94）→ executor UPDATE・reader SELECT・**cleanup DELETE** 全 feasible。
- **columns**: plan_seeds = id, **desired_date(DATE)**, desired_time_hint(band), action_shape, confidence, status, source, source_ref。**duration は別 table `duration_evidences`**（reader は enrich 要）。
- **staging apply**: plan_seeds 済（A1-5-2-2-2b）。**refs**: hjcr=staging / aljav=production（devFixtureHost canonical）。
- **smoke pattern**: `reality-real-read-smoke.ts`（belt-and-suspenders preflight: GO flag / URL host ref===PROJECT_REF / PROD denylist / STAGING allowlist / no service_role）。但し `.env.staging.local` **未設定**。

**■ real executor（`lib/plan/reality/integration/plan-seed-status-executor.ts`・server-only・barrel 非 export）**
- `createStatusOnlyExecutor(client)`: applyStatusTransition(seedRef, from, to) = `UPDATE plan_seeds SET status=to WHERE id=seedRef AND status=from` → select("id")。ok = 更新行 ≥1。
- **status 列のみ**（generateComplete / anchor write なし）・**from=active guard**（0 rows→ok=false・並行 consume / non-active fail-closed）・**user-RLS client 注入・service_role なし**・**INSERT/DELETE なし**。

**■ fake tests +6（mock client・DB 0）**: accept（UPDATE status=consumed WHERE id∧status=active）/ dismiss（status=rejected）/ 0 rows→ok=false / error→ok=false / 静的（server-only・no generateComplete/anchor/createClient/service_role/insert/delete）。自変更 tsc 新規 0・baseline 55（不変）。

**■ gated 次段（Part 2: consumed reader + controlled staging smoke）**
- consumed reader: read consumed plan_seeds（SEED_COLUMNS_SQL）+ duration_evidences（projectDurationEvidenceRowsToMap 再利用）→ ReflectableConsumedSeed（handle=deriveCandidateHandle・seedRef redact）。
- controlled staging smoke（vitest harness・.env.local STAGING_USER_A・belt-and-suspenders guard・cleanup・rows=0）: create seed → accept→consumed → read→merge → dismiss→rejected → later no-op → from=active guard → cleanup。
- **初 DB-write ゆえ focused 運用**（rush しない・整合性 > スピード・失敗/cleanup 不能なら STOP）。

**■ しない（本 Part）**: 実 DB read/write（smoke は次段）/ RPC / route / UI / migration / production / external_anchor / generateComplete / service_role / raw 保存 / remote。

### 9.10 A1-6-5d Part 2 実装（landed）— Consumed Reader + Controlled Staging Smoke PASS（real DB read + 初の実 DB-write 検証完了）

A1-6-5d Part 2: consumed seed real reader + **controlled staging smoke PASS**。**初の plan_seeds 実書き込みを staging hjcr で controlled に検証完了**（accept→consumed→merge / dismiss→rejected / later no-op / from=active guard / cleanup rows=0）。

**■ real reader（`lib/plan/reality/integration/consumed-seed-repository-supabase.ts`・server-only・barrel 非 export）**
- `createConsumedSeedRepository(client, userId)`: consumed plan_seeds（SEED_COLUMNS_SQL）.eq(user_id).eq(status,'consumed') + duration_evidences（projectDurationEvidenceRowsToMap・high のみ）→ ReflectableConsumedSeed（durationMin=evidence・date/band/actionShape=row・**handle=deriveCandidateHandle**[seedRef 非出]）。
- **column-restricted**（raw/source_ref なし）・**consumed のみ**・**read-only**（select/eq/in/limit）・user-RLS・service_role なし。
- fake tests +7（mock client）: consumed→ReflectableConsumedSeed（handle・durationMin enrich・seedRef 非出）/ query 構築（eq status=consumed・in seed_id）/ evidence なし→durationMin null / anytime→band null / consumed なし→[] / 静的。

**■ controlled staging smoke PASS（real DB・USER_A・hjcr・TEST_DATE 隔離・smoke harness untracked + 実行後削除）**
- preflight（全 PASS）: GO flag / host=hjcr（≠aljav・PROD denylist + STAGING allowlist）/ anon role / service_role 0 / USER_A sign-in / pre-write test rows=0。
- redacted report（counts/booleans のみ・raw/seedRef/secret なし）: createdSeeds=3・**acceptOk=true**（active→consumed）・consumedReadTestCount=1・**mergedItemCount=1**（originSeed=true・genericLabel=true・**noSeedRef=true**）・**dismissOk=true**（active→rejected）・**rejectedNotInConsumed=true**・**rejectedNotMerged=true**・**laterNoWrite_seedCActive=true**・**guardDuplicateFailClosed=true**・**guardNonActiveFailClosed=true**・**cleanupTestRows=0**・cleanupOk=true。1 つも失敗なし。

**■ 必須充足（全 PASS）**: staging/hjcr hard-pin✓ / aljav hard-denylist✓ / service_role 0✓ / pre-write USER_A rows=0✓ / accept→status=consumed✓ / consumed→DraftPlan item merge✓ / dismiss→status=rejected✓ / rejected は DraftPlan item にならない✓ / later→DB write 0✓ / from=active guard で duplicate/non-active fail-closed✓ / cleanup 後 rows=0✓ / raw/seedRef/secret を report に出さない✓ / smoke harness untracked+削除✓。

**■ 検証**: reality 586 PASS（573→+13: executor 6 + reader 7）・自変更 tsc 新規 0・baseline 55（不変）。

**■ A1-6-5d 完了**: status→consumed→DraftPlan reflection の本筋を **real staging DB で実証完了**。誤設計（external_anchor）を排し status-only に修正後、accept/dismiss/later の status-only executor + consumed reader + merge が実 DB で動作確認。

**■ しない（A1-6-5d 範囲外）**: route 接続 / route.ts / UI ボタン / production / migration apply / external_anchor / generateComplete / service_role / raw 保存 / remote。

### 9.11 A1-6-6 実装（landed）— Candidate Action Route Integration + Controlled Staging Route Smoke PASS（初の route.ts 接続）

A1-6-6: candidate action route（`{handle, action}` → `{ok, data}`）を接続 + **controlled staging route smoke PASS**。**初の route.ts 接続**で status→consumed→DraftPlan reflection の全 flow を route 経由で実証完了。

**■ 独立評価**: GPT「action route 接続 + route smoke」妥当。route は薄い層（auth + surfaceable 再 read + handleCandidateActionRequest + real executor）・pure 経路は全段検証済。

**■ 監査で固めた配線**
- route 配置: `app/api/reality/candidate-action/route.ts`（reality namespace）。
- auth: `supabaseServer()` + `auth.getUser()`（user-RLS・no service_role）。
- **surfaceable 再 read は surface と同一 pipeline**: `loadActiveCandidateEntries`（read+enrich+lifecycle entry・surface guard と同一構築＝drift なし）→ `selectSurfaceableCandidates`（active∧fresh∧非 expired∧dedup）→ SurfaceableCandidate[]。seedRef は server-side のみ。
- envelope: `NextResponse.json({ok:true, data})` / `{ok:false, error}`（malformed JSON→400 / no auth→401）。

**■ 実装**
- `lib/plan/reality/integration/candidate-action-route-support.ts`（server-only・barrel 非 export）: `loadSurfaceableForAction`（surfaceable 再 read）+ `runCandidateActionRoute`（handleCandidateActionRequest + {ok,data} envelope）。
- `app/api/reality/candidate-action/route.ts`（POST・薄い wrapper）: req.json → auth → surfaceable 再 read → real status-only executor → runCandidateActionRoute → NextResponse。
- fake tests +11: runCandidateActionRoute（accept/dismiss/later → {ok,data}・invalid handle/action/no candidate/non-active/status_conflict fail-closed・seedRef 非出）/ loadSurfaceableForAction（active fresh→surfaceable・seed なし→[]・stale→除外）。

**■ controlled staging route smoke PASS（real DB・USER_A・hjcr・TEST_DATE 隔離・harness untracked + 削除）**
- preflight 全 PASS（hjcr hard-pin / aljav denylist / anon / service_role 0 / USER_A sign-in / pre-write rows=0）。
- redacted report: **acceptViaRouteOk=true**・**acceptResponseNoSeedRef=true**・**mergedItemCount=1**（originSeed/noSeedRef true）・**dismissViaRouteOk=true**・**rejectedNotMerged=true**・**laterViaRouteDeferred=true**・laterNoWrite_seedCActive=true・**invalidHandleFailClosed / invalidActionFailClosed / noCandidateFailClosed / duplicateFailClosed=true**・**cleanupTestRows=0**。1 つも失敗なし。

**■ 必須充足（全 PASS）**: route request {handle,action} のみ✓ / response に seedRef/UUID/raw/source_ref/secret 非出✓ / auth user 以外の seed 操作不可✓（RLS）/ invalid handle·action·no candidate·non-active fail-closed✓ / accept→consumed✓ / dismiss→rejected✓ / later no-op✓ / from=active guard 維持✓ / cleanup rows=0✓ / staging hjcr hard-pin✓ / aljav denylist✓ / service_role 0✓ / smoke harness untracked+削除✓。

**■ 検証**: reality 597 PASS（586→+11）・自変更 tsc 新規 0・baseline 55（不変）。

**■ A1-6-6 完了**: candidate action route 接続。handle-based 全 flow（request→surfaceable 再 read→resolve→decide→status-only executor→redacted response→consumed reader→DraftPlan merge）が route 経由 + real staging DB で動作確認。UI は後で route を叩くだけ。

**■ しない（A1-6-6 範囲外）**: UI ボタン / UI 変更 / production / migration apply / external_anchor / generateComplete / service_role / raw 保存 / remote。

### 9.12 A1-6-7 実装（landed）— Consumed Seed → MorningPlan Runtime Wiring + Controlled Staging Computation Smoke PASS（live plan 反映・DraftPlan→MorningPlan pivot）

A1-6-7: consumed seed（accept 済み）を **live `MorningPlan` に runtime 反映** + **controlled staging computation smoke PASS**。accept→consumed→plan item の read/computation 経路を runtime 側に接続（UI ボタンより先・「押したのに予定に出ない」を防ぐ）。

**■ 重大な整合性発見（実装前に STOP→CEO 判断）**: 監査で A1-6-5c/d/6 が target する `DraftPlan` は **live computation でない**判明（唯一の constructor は A1-6-5c merge 自身・他は comment/re-export のみ・`draft-plan.ts` 自身が「Wave-4 で generator 本実装」明記）。user が見る live plan は **`MorningPlan`**（`lib/alter-morning/types.ts`・`items: PlanItem[]`・morning route が serve）。→ `DraftPlan` に wire しても plan に出ない。CEO 判断（2026-06-08）で reflection target を **`DraftPlan`→`MorningPlan` に pivot**（work backward from goal: goal=「consumed seed が user の予定に出る」→target は live `MorningPlan`）。

**■ 設計（surgical・既存 pattern 踏襲）**
- 新 pure merge（`MorningPlan`/`PlanItem` 版）+ A1-6-5d reader を **再利用**（reader は plan-type 非依存ゆえ rework は merge のみ）。
- flag-gating（`realityConsumedReflection` default-off）: 既存 `resolveMorningProtocolCaptureFragment` 同様 helper 側に閉じる（route は PLAN_FLAGS 非 import・1 行で呼ぶ）。
- **serve-time のみ**（route が response 用に別変数 servedMorningPlan で受ける・**stored session=morningResponse.plan は不変**）。

**■ 実装**
- `lib/plan/reality/consumed-seed-morning-reflection.ts`（pure・barrel 非 export）: `consumedSeedToMorningPlanItem`（A1-6-5b guard+label+band 配置→`PlanItem`[id=handle・kind=todo・what=null・fixedStart=false・startTime=band 既定・durationMin]）/ `reflectConsumedSeedsIntoMorningPlan`（additive・同日のみ・dup guard・追加 0→同一参照）/ `loadConsumedReflectedMorningPlan`（reader 注入 composer）。
- `lib/plan/reality/integration/morning-consumed-reflection.server.ts`（server-only・barrel 非 export）: `resolveConsumedReflectedMorningPlan`（flag off/plan null→plan 不変・on→reader+merge・例外→fail-open plan）。
- `app/api/stargazer/alter/route.ts`（serve-time 配線）: fireMorningCapture 後に servedMorningPlan = resolveConsumedReflectedMorningPlan(morningResponse?.plan ?? null, supabase, userId) を算出し morningProtocol.plan に serve（既存 morningResponse.plan は不変）。
- `lib/plan/featureFlags.ts`: `realityConsumedReflection`（REALITY_CONSUMED_REFLECTION・server-side・default-off）。
- fake tests +18（mapper guard[active/rejected/expired/duration 欠落→null]・merge[additive・同日・dup・no-op 同一参照・seedRef 非出]・composer[fake repo read→merge]・resolve flag-off=同一参照）。
- 静的 guard 更新（realityStargazerCaptureWrite）: serve は servedMorningPlan（source=morningResponse?.plan ?? null・plan 出力維持）。

**■ controlled staging computation smoke PASS（real DB・USER_A・hjcr・TEST_DATE 隔離・harness untracked+削除）**
- preflight 全 PASS（hjcr hard-pin / aljav denylist / anon[role≠service_role] / pre-write rows=0）。
- redacted report: **consumedSameDateBecomesItem=true**・**existingItemPreserved=true**・**activeNotItem / rejectedNotItem / otherDateConsumedNotItem=true**・**itemCount=2**・**consumedItemKindTodo / consumedItemWhatNull=true**・consumedItemStartTime="13:00"・**noSeedRefInOutput=true**・**resolveFlagOnSameItem=true**（flag-gated route-support も同一）・**cleanupTestRows=0**。1 つも失敗なし。

**■ 必須充足（全 PASS）**: consumed seed だけが item✓ / active·rejected·expired·別日 は混ざらない✓ / accepted 後 consumed が item として読める✓ / output に seedRef·UUID·raw·source_ref·secret 非出✓ / merge additive で既存 plan 不変✓ / staging hjcr hard-pin✓ / aljav denylist✓ / service_role 0✓ / harness untracked+削除✓ / cleanup rows=0✓。

**■ 検証**: reality 615 PASS（597→+18）・自変更 tsc 新規 0・baseline 55（不変）。

**■ A1-6-7 完了**: consumed seed が live `MorningPlan` に runtime 反映（flag-gated・serve-time・additive・fail-open）。accept→consumed→plan item の computation 経路を real staging DB で実証。flag on で UI は route response の plan に consumed item が現れる。

**■ しない（A1-6-7 範囲外）**: UI ボタン / UI 変更 / production rollout（flag on は CEO 判断）/ migration apply / external_anchor / generateComplete / service_role / raw 保存 / remote。

### 9.13 A1-6-8 実装（landed）— Candidate Action UI Buttons + Client Wiring（「候補→承認→予定に出る」が UI で成立）

A1-6-8: candidate banner に **accept/dismiss/later ボタン**を追加し `/api/reality/candidate-action`（A1-6-6）に `{handle, action}` を POST。accept 後は client が MorningPlan に **optimistic add**（A1-6-7 merge 再利用）。ユーザー体験として「候補があります → 承認 → 予定に出る」が初めて成立。

**■ 独立評価**: GPT「runtime wiring(A1-6-7)後に UI ボタン」適時。監査で既存基盤が揃っていることを確認: banner は live（`realityCaptureSurface` server flag・`morningCaptureCandidate` 抽出は useAlterChat L819 で実装済）/ handle は per-item で client DTO に到達（A1-6-2・redaction が format-gated 保持）/ `setMorningPlan` は client-side 更新可（既存で使用）。

**■ 設計判断**
- **reflection = optimistic add**（再取得は chat turn ゆえ不可）。`reflectConsumedSeedsIntoMorningPlan`（A1-6-7・client-safe 確認済）を **再利用**し client で即時反映＝**server と同一 PlanItem**（id=handle・drift なし・次の server fetch で置換）。
- **新 client flag `realityCandidateActions`（NEXT_PUBLIC・default-off）でボタン gate**。`realityConsumedReflection`（server reflect）と一緒に staging で on にする運用（optimistic と server reflect の整合・production 両 off→banner 出ても button なし）。
- **later = no-op**（item 残す・「あとで」表示）/ accept = optimistic add + item 除去 / dismiss = item 除去。

**■ 実装**
- `lib/plan/featureFlags.ts`: `realityCandidateActions`（NEXT_PUBLIC_REALITY_CANDIDATE_ACTIONS・default-off）。
- `components/home/morning/captureCandidateClient.ts`（pure helpers・client-safe）: `postCandidateAction`（{handle,action} POST→{ok,accepted,reason,reflectsToPlan,deferred}・fail-safe）/ `applyAcceptedCandidateToPlan`（candidate item→ReflectableConsumedSeed→A1-6-7 merge）/ `removeCandidateItem`（DTO item 除去・hasCandidate/count 再計算）/ `applyCandidateActionResult`（next state: 失敗·later→不変・accept→add+除去・dismiss→除去）。
- `captureCandidatePresenter.ts`: display item に `handle`（opaque・無→null）。
- `CaptureCandidateBanner.tsx`（"use client"）: per-item accept/dismiss/later ボタン（onCandidateAction 提供時のみ）+ pending/error/deferred state。
- `MorningPlanCard.tsx` / `AskHero.tsx`: `onCandidateAction` を banner まで prop-drill（additive optional）。
- `app/AneurasyncHome.tsx`: `onCandidateAction={PLAN_FLAGS.realityCandidateActions ? alterChat.submitCandidateAction : undefined}`（flag-gated）。
- `hooks/useAlterChat.ts`: `submitCandidateAction`（postCandidateAction→applyCandidateActionResult→setMorningPlan+setMorningCaptureCandidate）+ expose。
- tests +28（postCandidateAction / applyAcceptedCandidateToPlan / removeCandidateItem / applyCandidateActionResult / banner buttons static render / presenter handle / wiring static）+ 2 既存修正（presenter display item shape・banner static render string）。

**■ staging UI smoke スキップの判断**: route（A1-6-6）+ reflection（A1-6-7）は staging-verified 済・client POST contract {handle,action} + response contract {ok,data:{accepted,reason,reflectsToPlan,deferred}} は固定+unit-test（fake が real shape と一致）・optimistic add は server と**同一 merge 関数**（drift 不能）。よって heavy HTTP smoke は marginal とし skip（CEO の手動 UI 確認は別途可能）。

**■ 必須充足（全 PASS）**: request {handle,action} のみ✓ / seedRef·UUID·raw·source_ref·secret を DOM/state に非出✓（handle は opaque・static markup 非搬送）/ invalid·failed は安全に失敗表示✓ / accept→予定反映導線✓（optimistic add）/ dismiss→item 消える（rejected）✓ / later→no-op·deferred✓ / 既存 MorningPlan 表示を壊さない✓（additive）/ flag off·candidate 無で既存 UI 不変✓（onCandidateAction undefined→read-only banner）。

**■ 検証**: reality 643 PASS（615→+28）・alter-morning 4501 PASS（無回帰）・自変更 tsc 新規 0・baseline 55。

**■ A1-6-8 完了**: 「候補→承認→予定に出る」が UI で成立（flag on）。flag off は read-only banner（既存 UI 不変）。

**■ しない（A1-6-8 範囲外）**: production rollout（flag on は CEO 判断）/ migration apply / external_anchor / generateComplete / service_role / raw 保存 / remote / 大規模 UI 刷新。

### 9.14 A1-6-8 検証 host（landed）— Candidate Action UI render-only Preview（/plan/dev-candidate-actions・staging/dev 限定）

A1-6-8 の banner+buttons は Home 経路に閉じるが、CEO 制約（**staging では Home 不使用・production 不可・GitHub 不可・smoke は /plan 等のみ**）により、A1-6-8 UI を **/plan 配下の staging/dev 限定 render-only preview host** で目視確認可能にする。

**■ 監査**: 既存 /plan は MorningPlanCard/banner を render せず（DraftPlan/shift 専用）→ 不十分。但し /plan/dev-shift-draft が**三重ガード**（明示 flag + staging allowlist + production deny → notFound）+ auth の前例。この pattern を再利用。

**■ CEO 判断（2026-06-08）**: 「render-only を今・E2E は別 GO」。route(A1-6-6)+reflection(A1-6-7) は staging 検証済ゆえ、未検証 gap は browser での interactive 挙動のみ → render-only で十分。

**■ 実装**
- `lib/plan/reality/candidateActionsPreviewHost.ts`（pure guard・devDraftHost と同 pattern・定数のみ再利用）: `isCandidateActionsPreviewHostAllowed`（REALITY_CANDIDATE_ACTIONS_DEV_HOST==="true" ∧ staging ref ∧ !production ref）。
- `app/(culcept)/plan/dev-candidate-actions/page.tsx`（server）: 三重ガード→notFound（production 不可視）→ Client render。
- `CandidateActionsPreviewClient.tsx`（"use client"）: fixture candidate(2件・有効 handle)+ fixture MorningPlan を local state、onCandidateAction は **REAL pure helper applyCandidateActionResult**（A1-6-8）で local plan に optimistic add（疑似遅延で pending 目視）。「失敗をシミュレート」toggle + リセット。**real route/DB/network なし**（postCandidateAction 不使用）。
- tests +10（guard: staging+flag→true/production→false/flag 未設定→false/'1'·'yes'→false・client static render: banner+buttons+plan・UUID 非出・page guard wiring・client postCandidateAction 非使用）。

**■ 有効化**: staging/dev で `REALITY_CANDIDATE_ACTIONS_DEV_HOST=true`（∧ supabase URL が staging）→ `/plan/dev-candidate-actions` 可視。production は flag 未設定で notFound（構造的に不可視）。

**■ 検証**: reality 653 PASS（643→+10）・自変更 tsc 新規 0・baseline 55。

**■ しない（範囲外）**: E2E 機能 smoke（real route + real candidate・別 GO）/ production / Home 配線 / GitHub。

### 9.15 A1-6-9 実装（landed）— Candidate Action E2E Functional Smoke Preview（real route + real staging DB・E2E 実証）

A1-6-9: `/plan/dev-candidate-actions-e2e`（staging/dev 限定・三重ガード）で **real route（/api/reality/candidate-action）+ real staging DB** の E2E を実装 + **controlled staging E2E smoke PASS**。「候補→承認→route POST→DB status 更新→MorningPlan 反映」を browser で実証。既存 render-only preview（§9.14）は不変。

**■ 監査**: `buildMorningCaptureSurface` は `realityCaptureSurface` flag 依存（off→null）だが route の `loadSurfaceableForAction` は flag 非依存。E2E は triple-guard が gate ゆえ **`buildCaptureSurfaceFromProjected`（gateAllow=true・un-gated・export 済）** で surface を組む。capture RPC は SECURITY INVOKER・user-RLS だが smoke 実績ある直接 insert を採用。

**■ 設計**
- 新 page `/plan/dev-candidate-actions-e2e`（render-only と別ディレクトリ・三重ガード）。
- server actions（"use server"・**各 action 冒頭で三重ガード再適用**[直接呼び出し対策]・`auth.getUser()` user-RLS・service_role なし）: `setupE2ETestCandidate`（sentinel seed[desired_date=2099-12-31]+evidence 直接 insert）/ `getE2EPreviewState`（un-gated surface DTO + consumed→reflected plan・sentinel date 隔離・返り値 redacted=candidate DTO + opaque handle id の plan item）/ `cleanupE2ETestCandidates`（sentinel delete→remaining）。
- E2E client: banner は **`postCandidateAction`（real route POST・browser auth cookie）**、action 後 `getE2EPreviewState` で **実 DB re-fetch**（optimistic でない真値）。
- fake tests +13（actions 静的: 三重ガード/auth/sentinel/no service_role/redaction・page guard・client real route+re-fetch・render-only 不破壊）。

**■ controlled staging E2E smoke PASS（Playwright・real route + real DB・USER_A login・sentinel 隔離・harness untracked+削除・robust status-wait[route on-demand compile 吸収]）**
- onE2EPage=true・cleanStart=true・**accept: 成功 / bannerAfter=0（consumed→消える）/ planItems=1（real consumed→MorningPlan 反映「13:00 午後の予定（60分）」）**・**dismiss: bannerAfter=0（rejected→消える）/ planItems=0（反映されない）**・**later: planItems=0 / deferredShown=true（no-op）**・全 cleanup「残り 0」・errors なし。独立 cleanup verify **SENTINEL_ROWS_REMAINING=0**。

**■ 必須充足（全 PASS）**: staging hjcr hard-pin✓ / aljav hard-denylist✓ / service_role 0✓（anon・user-RLS）/ seedRef·UUID·raw·source_ref·secret を DOM/state/report 非出✓ / smoke harness untracked+削除✓ / cleanup後 rows=0✓（独立 verify）/ 既存 render-only preview 維持✓ / 失敗時 fail-closed✓（finally cleanup・guard）。

**■ 検証**: reality 666 PASS（653→+13）・自変更 tsc 新規 0・baseline 55。

**■ A1-6-9 完了**: accept/dismiss/later の real route + real DB E2E を browser で実証（consumed→反映 / rejected→非表示 / later→no-op を真値で確認）。初の committed DB-write server action（triple-guard + user-RLS + sentinel + cleanup）。

**■ しない（範囲外）**: production rollout / Home 配線 / remote / migration apply。

### 9.16 A1-6-10 実装（landed）— Candidate Action Gap-fit Refinement（dev/staging・UI/copy polish）

A1-6-10: 技術的な鎖（A1-6-9 で E2E 実証済）を前提に、「動く」→「使いたくなる」へ向け、real-user 体験の gap を監査し dev/staging で安全に直せる UI/copy を polish。**新 component / DB / migration / Home 配線なし**。

**■ 監査（8 領域）**: accept後の見え方 / dismiss·later の意味 / 候補なし / エラー·再試行 / cleanup導線 / 反映後の自然さ / 複数候補 / なぜこの候補か。

**■ 実装した安全 polish（pure UI/copy・flag-gated・既存 preview が共有 banner/presenter 経由で自動取得）**
- presenter（`captureCandidatePresenter.ts`）: note に「なぜ」明示（「あなたとのやり取りから、空き時間に置けそうな予定の候補です」）/ band label を reflection（consumed-seed-reflection）と一致（朝→午前・昼→午後・夕方→夜＝**候補↔予定の語不一致を解消**）。
- banner（`CaptureCandidateBanner.tsx`）: pending「送信中…」明示 / error に再試行ヒント（「…。もう一度試せます」）/ 複数候補に薄い区切り線（i>0 border-top）。
- tests: 既存 assertion を午前へ更新 + A1-6-10 検証（午後/夜・note why）追加。

**■ 検証**: reality 667 PASS（666→+1）・自変更 tsc 新規 0・baseline 55。service_role/DB 不接触（pure UI/copy）。production 非可視（banner=realityCandidateActions flag-gated・preview=三重ガード notFound）。既存 render-only（§9.14）/ E2E（§9.15）preview 非破壊。本線配線なし。

**■ 残 product gap（別 GO）**: ①accept/dismiss の明示的確認（removal タイミングの banner 主導再設計・live/preview 横断）②反映後 item の自然さ（generic label・時刻 13:00 placeholder・Home-adjacent MorningPlanCard 描画）③「いつ」文脈（desired date 表示・presenter に today 注入）④複数候補の上限·優先（dedup）⑤候補→予定の連続性演出（cross-component highlight）。

### 9.17 A1-6-11 実装（landed）— Candidate Action「いつ」文脈 + action 確認（controlled formatter・dev/staging）

A1-6-11: §9.16 残 gap ①③に対応。**controlled formatter**（LLM 不使用・structured state の安全表示）で #1「いつ」文脈（desired date の friendly 表示）+ #2 action 確認文言を実装。CEO 指摘の #2 視認性 gap（accept/dismiss で candidate 0 件化→ feedback が見えない）を **banner 内部**で解消。**新 component / DB / migration / route / status lifecycle / Home 配線なし**。

**■ #1「いつ」文脈（presenter formatter）**: `friendlyDateLabel(date, today)` = 今日/明日/明後日/昨日/M/D（pure・deterministic・**Date.now 不使用＝today 注入**・parse 不能/欠落→null で捏造しない）。banner が local today を注入（test は固定値で deterministic）。表示「…・午後・明日」。

**■ #2 action 確認（presenter formatter + banner-level）**: `actionResultText(action)` = accept「予定に入れました」/ dismiss「今回は見送りました」/ later「あとで確認できます」（固定文）。banner-level confirmation（`data-testid=action-feedback`）に表示。

**■ CEO 指摘 #2 視認性 gap の修正（banner 内部・Home 非接触）**: parent removal で candidate が 0 件化しても banner は MorningPlanCard が**無条件 mount** し続け **state（feedback）が保持される**（banner は unmount せず null を返すだけ）。ゆえ `display=null` でも feedback があれば confirmation を返す（早期 null の前）+ `setTimeout(4s)` で **transient 自動クリア**。**parent / Home 本線非接触で達成**。

**■ 実機検証（render-only preview・実ブラウザ・STAGING_USER_A login・proxy.ts auth gate 通過）**: accept ×2（最後で 0 件）→「予定に入れました」visible + MorningPlan に 2 件反映（計3）/ dismiss ×2（0 件）→「今回は見送りました」visible / later →「あとで確認できます」visible・banner 残存。console error 0。screenshot 2 枚で 0 件 confirmation を目視。harness untracked+削除。

**■ 検証**: reality 677 PASS（676→+1 persistence 回帰）・alter-morning 4501 PASS・自変更 tsc 新規 0・baseline 55。service_role/DB/route/status lifecycle 不接触（pure UI/formatter）。production 非可視（banner=realityCandidateActions flag-gated・preview=三重ガード notFound）。既存 render-only（§9.14）/ E2E（§9.15）preview 非破壊。本線配線なし。

**■ 残 product gap（次 slice）**: ②反映後 item の自然さ（generic label・時刻 placeholder・MorningPlan 描画＝**次 slice で着手**）④複数候補の上限·優先（dedup）⑤候補→予定の連続性演出。

**■ しない（範囲外）**: production rollout / Home 配線 / remote / migration apply / production flag。

### 9.18 A1-6-12 実装（landed）— Reflected Item Naturalness（slot sharpness 明示・MorningPlanCard 描画検証・dev/staging）

A1-6-12: #3「反映後 item の自然さ」。監査で **§9.16 の前提が反転**: §9.16 は preview の簡易 `<li>` render（「13:00 午後の予定（60分）」）を見て「時刻が精密すぎ」と懸念したが、**live `MorningPlanCard`（slot モデル）** は反映 item を別経路で描画する。反映は `whenSharpness`/`whatSharpness` を未設定ゆえ `normalizePlanItem` が "missing" に倒し、card は時刻「[時間未確定]」・内容「[内容暫定]」で **generic label を捨てる**（真の gap は false precision でなく **label 破棄**）。**pure 反映修正**（sharpness 明示）で解消。**MorningPlanCard / DB / route / lifecycle / Home 配線なし**。

**■ 修正（pure・reflection データ）**: `consumed-seed-morning-reflection.ts` の反映 PlanItem に `whenSharpness="vague"`（band 既定時刻＝精密でない→「[時間未確定]」・false precision を出さない）+ `whatSharpness="vague"`（generic label＝暫定→ card が `text`「午後の予定（60分）」を表示+「内容暫定」・**label を出す**）+ `confirmationState="confirmed"`（CEO B・consumed=accepted の **contract 補正**→「予定として確定」・default "provisional" の「暫定」chip を外す。時間/内容の粗さは sharpness が担う）を明示。既存 MorningPlanCard rendering を活用（card 非接触）。

**■ card 検証 preview（§9.18・新 dev page）**: `/plan/dev-reflected-item`（三重ガード再利用・render-only・real route/DB 不使用）。**実 reflection helper** で reflected item を生成→**実 MorningPlanCard** で描画し live 相当を目視。既存 candidate preview（§9.14/§9.15）は簡易 render で card を通さないため新設。

**■ 実機検証（card-verify・実ブラウザ・STAGING_USER_A login）**: reflected 行 = 「[時間未確定] 午後の予定（60分） 内容暫定」（**label 表示**・旧 `[時間未確定][内容暫定]` から改善）+ fixed 比較 item「10:00 ミーティング」+ console error 0。screenshot で目視。harness untracked+削除。

**■ 検証**: reality 683 PASS（677→+6: 反映 sharpness +1 / preview +5）・alter-morning 4501 PASS（無回帰）・自変更 tsc 新規 0・baseline 55。MorningPlanCard/DB/route/lifecycle/Home 配線 不接触。production 非可視（preview=三重ガード notFound）。

**■ confirmationState（CEO B 補正）**: 当初 confirmationState 未設定→ default "provisional" で reflected 行に標準「暫定」chip が出ていた。CEO B 判断で **consumed=accepted の contract 補正**として `confirmationState="confirmed"` を追加→「暫定」chip 除去・「予定として確定（時間・内容は粗い）」を表現。card-verify 再検証で標準「暫定」chip 消失（`standaloneProvisionalChip=false`）・`[時間未確定]`/`内容暫定`/label は維持を確認。

**■ しない（範囲外）**: production rollout / Home 本線改変 / remote / migration apply / production flag / MorningPlanCard 改変。（注: live route への reflection 配線**自体**は A1-6-7 で既存＝wired-but-dormant。A1-6-12 はその表示 contract のみ。詳細 §9.19。）

### 9.19 A1-6-13 監査（docs-only）— Live Morning Route Connection Preflight（配線既存の確定 + staging enablement runbook）

A1-6-13: 「reflection を live morning route に安全接続する挿入点」を read-only 監査。**最重要発見: live route 配線は A1-6-7 で既存**（A1-6-12 report の「live 未配線」は誤り）。コード/env/flag/route/DB 変更なし（docs-only）。

**■ 訂正（整合性）**: `app/api/stargazer/alter/route.ts:10376` が **A1-6-7 で** `resolveConsumedReflectedMorningPlan(morningResponse?.plan ?? null, supabase, userId)` を serve-time に呼び `morningProtocol.plan`（L10405）で client へ serve → `useAlterChat.ts:771` → AskHero → MorningPlanCard（**end-to-end 配線済**）。現状は **wired-but-dormant**（`REALITY_CONSUMED_REFLECTION` OFF・default）。残るは「配線」でなく **flag chain の staging 有効化判断**。

**■ 挿入点**: route.ts:10376（既存・capture-surface 注入 route.ts:10432 と同一 serve point）。新規挿入点 不要。

**■ flag OFF diff 0**: `morning-consumed-reflection.server.ts:36` `if (!realityConsumedReflection || plan===null) return plan`（read 0・plan 不変）。例外時 try/catch `return plan`（**fail-open**）。

**■ 安全性（監査で verify）**: serve-time のみ（servedMorningPlan 別変数・stored session=morningResponse.plan 不変）/ **read-only**（status='consumed' read のみ・write なし）/ **user-RLS**（`createConsumedSeedRepository` に user-RLS client・service_role なし）/ **同日 filter**（`seed.date===plan.date`）/ **handle dedup**（`!existingIds.has(handle)`・round-trip 安全）。

**■ TTL未実装時の暫定安全性**: cron（status=expired 遷移）未実装だが **同日 filter が天然 TTL**（consumed seed は desired_date===today の日だけ reflect・翌日自動消失）+ consumed status final + active の read-side `expires_at` guard。→ staleness は desired_date に bounded。

**■ Slice E（staging enablement・別 GO・env は CEO/operator）**: flag chain（`REALITY_CAPTURE_SURFACE` + `NEXT_PUBLIC_REALITY_CANDIDATE_ACTIONS` + `REALITY_CONSUMED_REFLECTION`）を staging で together ON → smoke → 観測 → production canary。手順: `docs/reality-consumed-reflection-enablement-runbook.md`。

**■ 任意・後続（今はやらない）**: Slice S（stale-reconcile・additive→removal）/ Slice T（TTL cron）。

**■ しない（本監査）**: コード実装 / env 変更 / staging flag ON / production / remote / migration / DB schema / route 変更（docs-only）。

## 10. A1-7 Candidate Action Learning（reaction を「学習」に変える foundation）

### 10.0 A1-7-0 実装（landed）— Candidate Action Outcome → PRM Dry-run Learning Event（pure・local・未永続化）

A1-7-0: accept / dismiss / later を単なる status 遷移（A1-6-0 `decideCandidateAction`）で終わらせず、**将来の Personal Reality Model / correction / 予定生成改善** に使える **structured learning event 候補** に変換する pure transform。**これは PRM 永続化ではなく dry-run event foundation**（候補を作るだけ・PRM 本体に保存しない）。**pure / local / no-DB / no-persist / no-LLM / no-route / no-Home**。

**■ 設計思想（observed > inferred・断定しない・negative capability）**: 単一 action は**弱く曖昧な証拠**。dismiss は「嫌い」でなく「今回は選ばず / タイミング / 提示のズレ」かもしれない。ゆえに 1 action を**単一の意味に潰さず**、曖昧性を**複数 hypothesis** として保持し、**文脈**（confidence/duration/band/date/source）を記録して**将来の cross-event 相関で disambiguation** できるようにする。

**■ 実装（`lib/plan/reality/learning/dry-run-learning-event.ts`・pure）**:
- `toDryRunLearningEvent(ctx, action, actedAtISO?)` → `DryRunLearningEvent`（`kind="dry_run_learning_event"`＝未永続化 marker）。
- signal（中立・評価でない）: accept→`adoption` / dismiss→`non_adoption`（≠negative）/ later→`deferral`。
- hypotheses（曖昧性・潰さない）: accept→[accepted_for_plan, positive_signal] / dismiss→[not_selected, not_now, mismatch_unknown] / later→[postpone_signal, timing_uncertain]。primary=先頭（最も中立）。
- **非断定の構造的保証**: `certainty="low"`（単一 action は常に弱い）/ `assertsPreference=false`（選好を断定しない）。rejected≠嫌い / consumed≠選好確定 / deferred≠拒否。
- 文脈記録: handle(opaque) / desiredDate / band / confidenceBand / durationMin / sourceKind / sourceLabel(controlled)。raw / seedRef / source_ref / UUID を持たない。
- `actedAtISO` は**注入**（Date.now 不使用・pure deterministic）。`hypothesisLabel(code)`=controlled hypothesis-tone label（LLM 不使用）。`toDryRunLearningEvents`=batch（順序保持）。

**■ 検証**: reality 696 PASS（683→+13）・自変更 tsc 新規 0・baseline 55。fake fixtures で 3 action が正しく event 化・非断定（assertsPreference=false/certainty=low/嫌い等を含まない）・文脈記録・Date.now 不使用・pure deterministic を証明。

**■ しない（範囲外）**: PRM 永続化 / 集約 / DB write / persistence / route 接続 / Home 本線 / production / env / remote / migration / LLM / 性格·嗜好の断定。

**■ 次段（学習に変える入口・別 GO）**: dry-run events を**集約**し文脈との相関で hypothesis を強化/弱化する **disambiguation 層**（still pure/dry-run）→ dev-report で観測 → PRM dry-run（§3）。→ **§10.1 A1-7-1 で実装**。

### 10.1 A1-7-1 実装（landed）— Dry-run Event Aggregation + Hypothesis Disambiguation（pure・no-persist）

A1-7-1: A1-7-0 の dry-run events（個別・曖昧・非断定）を **in-memory で集約**し、**文脈との相関で hypothesis を disambiguate** して **tentative pattern report** を出す pure layer。「学習に変える入口」（reaction → tentative pattern）。**PRM 保存 / DB write しない**（dry-run・dev-report 観測用）。**pure / local / no-persist / no-DB / no-LLM / no-route / no-Home**。

**■ aggregation schema（`lib/plan/reality/learning/dry-run-aggregation.ts`）**:
- `aggregateDryRunEvents(events, opts?)` → `TentativePatternReport`（`kind="tentative_pattern_report"`＝未永続化 marker / `assertsPersonality=false`）。
- 4 文脈次元（**univariate**）: `band` / `durationBucket`（short≤30 / medium≤90 / long / unknown）/ `confidence` / `source`。各次元で文脈値ごとに group 化、`minEvents`（既定 3）以上のみ pattern 化（少数では断定しない）。出力は value 昇順 sort で deterministic。
- `TentativePattern`: dimension / value / dominantAction / signal / eventCount / dominantCount / **counterCount（counter-evidence）** / consistency（mixed/leaning/consistent）/ **favoredHypothesis** / **stillPossible（他の可能性を残す）** / **certainty（"low"|"tentative"・high なし）** / assertsPreference=false / note（controlled hypothesis-tone）。

**■ disambiguation rule（核心・controlled）**: (dominantAction, dimension) → favored hypothesis。
- timing 系次元（band / durationBucket）+ dismiss → `not_now`（活動の拒否でなく「いつ/どれだけ」の問題）/ + later → `timing_uncertain`。
- framing 系次元（confidence / source）+ dismiss → `mismatch_unknown`（system は確信したのに不採用＝提示のズレ）/ + accept → `accepted_for_plan`。
- favored は必ず該当 action の hypothesis 集合内。残りは `stillPossible` で保持（潰さない）＝**同じ dismiss でも band 次元なら not_now / confidence 次元なら mismatch_unknown に分岐**。

**■ 非断定 / counter-evidence / bounded certainty**: 1 件では断定しない（minEvents）。counter-evidence（`counterCount`）を必ず保持し、一貫性 ratio≥0.75 のみ `tentative` に昇格（**最大 tentative・100% 一貫でも high にしない**）。性格・嗜好を断定しない（構造保証）。

**■ 検証**: reality 705 PASS（696→+9）・自変更 tsc 新規 0・baseline 55。fake fixtures で disambiguation（band→not_now / confidence→mismatch_unknown）・counter-evidence（mixed→low/counterCount）・certainty 上限 tentative・duration bucket・非断定/未永続化・pure deterministic を証明。

**■ しない（範囲外）**: PRM 永続化 / 集約結果 persist / DB write / route / Home 本線 / production / env / remote / migration / LLM / 多変量集約 / 性格·嗜好の断定。

**■ 次段（dev-report・別 GO）**: tentative pattern report を **dev 限定 preview（三重ガード）** で可視化し、CEO/dev が学習品質を shadow 観測 → 検証 PASS 後に PRM dry-run（§3・別 GO・DB=CEO 承認）。→ **§10.2 A1-7-2 で実装**。

### 10.2 A1-7-2 実装（landed）— Shadow Learning Preview（dev-report・render-only・no-persist）

A1-7-2: A1-7-1 `aggregateDryRunEvents` の tentative pattern report を **fixture dry-run events** から **dev 限定 preview** で可視化し、PRM 永続化**前**に **学習品質・過断定防止・counter-evidence 表示** を目視検証する（shadow 観測ゲート）。**dev/staging 限定・render-only・実 event/DB/persistence/route なし**。

**■ preview（`/plan/dev-learning-report`）**:
- page（三重ガード `isCandidateActionsPreviewHostAllowed` 再利用→notFound）+ client（fixture events → `aggregateDryRunEvents` → pattern card 描画・"use client"・**no-persist/no-route/no-DB**）。
- fixture（disambiguation/counter-evidence/certainty 上限を 1 画面で）: evening dismiss→not_now（timing）/ high-confidence dismiss→mismatch_unknown（framing）＝**同 dismiss が次元で分岐**/ morning accept→positive / afternoon mixed→counter-evidence。
- card 表示: dimension「value」/ dominantAction+consistency / eventCount·dominantCount·**counterCount** / **certainty badge（low/tentative・high なし）** / **favoredHypothesis + stillPossible（他に残す）** / note。meta に totalEvents/patterns/**assertsPersonality:false**/kind。

**■ 実機検証（実ブラウザ・STAGING_USER_A login・screenshot）**: 8 patterns 描画・disambiguation 対比（時間帯「夜」→タイミング / 確信度「高」→提示のズレ）・counterCount 可視・certainty は low/tentative のみ・stillPossible「他に残す」可視・assertsPersonality:false・console error 0。harness untracked+削除。

**■ 検証**: reality 711 PASS（705→+6）・自変更 tsc 新規 0・baseline 55。render test（renderToStaticMarkup）で content・guard・no-persist を証明。

**■ 観測（軽微）**: card header は context 値を raw enum（afternoon/high/medium…）で表示し note は friendly（午後/高/中）。dev 精度優先の意図的設計（CEO 判断で header も friendly 化可）。

**■ しない（範囲外）**: 実 event / DB / persistence / route / Home / production / env / remote / migration / LLM / PRM 接続。

**■ 次段（PRM dry-run・別 GO・§3）**: dev-report で学習品質を CEO/dev が検証 → PASS 後に **PRM dry-run 永続化設計（§3・設計のみ・migration 実行禁止）**（何を persist=events/patterns・dry-run observation model・schema 設計）→ CEO 承認で DB/migration。→ **§10.3 A1-7-3 で proposal projection（永続化前）を実装**。

### 10.3 A1-7-3 実装（landed）— PRM Dry-run Proposal Projection（pure・no-persist・review-gated）

A1-7-3: A1-7-1 `TentativePatternReport` を **PRM に保存する前**の **PRM update proposal candidate** に変換する pure projection。**PRM 永続化ではなく「PRM 更新候補への dry-run projection」**（保存しない・review 必須）。**pure / local / no-persist / no-DB / no-LLM / no-route / no-Home**。

**■ 設計思想（PRM に fact を勝手に積まない・review gate）**: PRM は user について自動で fact を学習しない。すべての更新は **review 必須の dry-run 提案**（事実でない）で、evidence + counter-evidence + 代替仮説（stillPossible）+ humility を携える。**dismiss を「嫌い」/ accept を「好み確定」に変換しない**（tendency 表現 + 要 review）。high certainty / fixed preference / personality を作らない。

**■ proposal schema（`lib/plan/reality/learning/prm-dry-run-projection.ts`）**:
- `PrmDryRunProposal`: kind=`prm_dry_run_proposal`(未永続化 marker) / **status**(candidate|blocked) / sourceDimension·sourceValue / dominantAction·signal / **tentativeInterpretation**(tendency・要 review) / favoredHypothesis / **stillPossible** / **evidenceCount·counterCount** / certainty(low|tentative) / **whyProposalOnly**(humility) / **blockedReason**(certainty_low|evidence_insufficient|null) / **reviewRequired:true**(常に) / assertsPreference:false。
- `PrmDryRunProjection`: kind=`prm_dry_run_projection` / totalPatterns / proposals / **candidates**(status=candidate) / **blocked**(status=blocked) / assertsPersonality:false / **persisted:false**(明示)。

**■ projection rule**: certainty≠tentative → **blocked(certainty_low)**（observation 止まり）/ tentative かつ evidenceCount < minCandidateEvidence(既定 5) → **blocked(evidence_insufficient)** / tentative かつ十分 → **candidate**（但し reviewRequired）。**低 certainty / 少数では PRM 候補にしない**（過断定防止の二段 gate: aggregation minEvents=3 + projection minCandidateEvidence=5）。

**■ 検証**: reality 720 PASS（711→+9）・自変更 tsc 新規 0・baseline 55。fake fixtures で low→blocked(certainty_low) / tentative+不足→blocked(evidence_insufficient) / tentative+十分→candidate(reviewRequired) / dismiss≠嫌い·accept≠好み確定(tendency) / counter-evidence·stillPossible 保持 / persisted=false / pure deterministic を証明。

**■ しない（範囲外）**: PRM 永続化 / DB write / schema / migration / route / Home / production / env / remote / LLM / 性格·嗜好の断定。

**■ 次に PRM 永続化へ進む場合の stop gate（§3・別 GO）**: ① dev-report で CEO/dev が proposal 品質を review（candidate/blocked の妥当性・counter-evidence・過断定なし）→ ② PRM 永続化 schema 設計（§3・設計のみ・migration 禁止）→ ③ CEO 承認 → ④ migration / persistence（**dry-run shadow write**・UX 不変）→ ⑤ observe・検証 → ⑥ 本番。各段で reviewRequired 維持・certainty を high にしない。→ **step ① の review 面を §10.4 A1-7-4 で実装**。

### 10.4 A1-7-4 実装（landed）— Proposal Projection Dev-report Integration（dev-report 拡張・no-persist）

A1-7-4: A1-7-2 learning report preview に **A1-7-3 PRM dry-run proposal projection** を追加表示。PRM 永続化**前**に「**何が保存候補（candidate）になり、何が blocked されるか**」を CEO/dev が目視確認できる状態にする（stop gate step ①）。**dev/staging 限定・render-only・fixtures のみ・no-persist/no-route/no-DB/no-Home**。

**■ 拡張（`/plan/dev-learning-report` の client）**:
- 既存 pattern report に加え `projectPrmDryRun(report)` の proposal section を描画（`projectPrmDryRun` も pure・no-persist）。
- fixture を candidate が出るよう調整（evening dismiss ×6=≥5 → candidate / morning accept ×3=<5 → blocked(insufficient) / afternoon 割れ → blocked(low)）。
- ProposalCard: **status badge（candidate=amber / blocked=gray）** + **要 review**（reviewRequired・全提案）+ certainty + **tendency interpretation**（採用されやすい/にくい傾向・嫌い/好み確定でない）+ evidence·counter·stillPossible + **blockedReason** + whyProposalOnly（humility）。meta に candidates/blocked 数・**persisted:false**・assertsPersonality:false。

**■ 実機検証（実ブラウザ・STAGING_USER_A login・screenshot）**: 9 proposals（**3 candidate + 6 blocked**）描画・candidate（確信度「高」→提示のズレ framing / 所要時間「中」→タイミング timing = 同 dismiss が次元で分岐）・全提案 要 review・blockedReason（evidence_insufficient / certainty_low）可視・tendency framing 維持・persisted:false・console error 0。harness untracked+削除。

**■ 検証**: reality 723 PASS（720→+3）・自変更 tsc 新規 0・baseline 55。render test で proposal section（candidate/blocked/reviewRequired/blockedReason/persisted）+ tendency framing を証明。既存 A1-7-2 note test の regex を断定形（性格は/が/を/的/だ）に精緻化（「性格ではなく」の非断定文を許容）。

**■ しない（範囲外）**: PRM 永続化 / DB write / schema / migration / route / Home / production / env / remote / LLM / 性格·嗜好の断定。

**■ 次に PRM schema 設計へ進む場合の stop gate（§3・別 GO）**: 本 dev-report で CEO/dev が **proposal 品質を review**（candidate/blocked の妥当性・counter-evidence・過断定なし・tendency framing）→ PASS 後に PRM 永続化 schema 設計（§3・設計のみ・migration 禁止）。**review PASS まで schema/DB（migration）に進まない**。→ schema **設計（docs-only・migration なし）** は §10.5 A1-7-5 で先行実施。

### 10.5 A1-7-5 設計（docs-only）— PRM Persistence Schema Design（設計のみ・migration 禁止）

A1-7-5: A1-7-0〜7-4 を踏まえ、将来何を永続化すべきかを設計（**docs-only・migration/schema 実装/persistence/route/Home/production/env/remote/LLM 禁止**）。詳細: `docs/prm-persistence-schema-design.md`。**設計は先行するが migration は stop gate（review PASS + CEO 承認）まで書かない**。

**■ 保存対象（events / patterns / proposals 比較）**: **events を源泉として保存**（不変事実・append-only・patterns/proposals は events の純関数ゆえ改良 rule で再導出可能・audit clean）。**patterns/proposals は read 時に派生**（保存すると rule 凍結・stale 化）。**PRM model = 人間が review・approve した tendency のみ**（events から自動生成しない）。proposal の **review 決定**だけが PRM への入口。

**■ schema（設計のみ）**: ① `prm_learning_events`（段階1・源泉 signal log・redacted・append-only・TTL）② `prm_review_decisions`（段階2・review の橋渡し・reviewRequired の実体）③ `prm_model_entries`（段階3・review 済 tendency＝実 PRM）。

**■ 保存契約（過断定防止を schema 化）**: reviewRequired（`review_decision_id NOT NULL`＝自動学習なし）/ counter-evidence（`counter_count` で弱化）/ stillPossible（`still_possible jsonb`）/ **certainty cap（`CHECK (certainty IN (low,tentative))`＝DB level で high 不可能）** / non-personality（性格 column なし・文脈束縛 tendency のみ）。

**■ retention/TTL/deletion/audit/rollback/user-visibility**: events `expires_at`(180日)+model `decay_weight`(recency)/ user 起点 cascade 削除(GDPR)/ append-only audit + provenance trace/ `supersedes_id` versioning + `retracted_at` 論理削除で可逆/ `user_visible` 開示 + `user_correction`(強い override＝ユーザーが第二の自己を所有・編集)。

**■ migration 前 stop gate**: ①dev-report で proposal 品質 review→②本 schema 設計 CEO 承認→③review flow 設計→④migration 計画 CEO 承認→⑤承認後にのみ migration。**①〜④未了は schema/DB 不接触**。

**■ しない（範囲外）**: migration / schema 実装 / persistence 実装 / 自動 PRM 更新 / route / Home / production / env / remote / LLM / 性格断定 / patterns·proposals の保存。

### 10.6 A1-7-6 設計（docs-only）— PRM Review Flow Design（設計のみ）

A1-7-6: A1-7-5 chain の `[HUMAN REVIEW]` ステップ（candidate proposal → 人間 review → decision → PRM model 入口）を設計。**docs-only**。詳細: `docs/prm-review-flow-design.md`。

**■ 状態遷移**: blocked=review 不可（observation）/ candidate → pending → **approved**（PRM entry 生成・certainty≤tentative 維持）/ **rejected**（PRM 不追加・rejection 記録）/ **deferred**（変化なし・再 surface）。candidate のみ reviewable・再 review 可。

**■ decision 意味論**: approve=「傾向を追跡する価値あり」（**事実確定でない・high にしない・trait でない**）/ reject=「推論傾向が妥当でない」/ defer=「情報不足」。

**■ 所有 arc**: 段階1 operator（推論品質検証）→ 段階2 user（自分の PRM を confirm/correct＝第二の自己所有・最強 signal）。`reviewed_by: operator|user`。

**■ 非断定の保存**: approve しても certainty≤tentative / counter-evidence / stillPossible / user-correction override / decay を保つ＝PRM は事実に硬化しない・いつでも引き戻せる。

**■ roadmap + stop gate**: A1-7-7 pure contract/types → A1-7-8 dry-run helper → A1-7-9 dev preview（全 no-persist）→ **decision 永続化/migration は A1-7-9 後に必ず停止**（CEO 承認）。

**■ しない**: decision 永続化 / DB write / migration / 実 review UI 本接続 / route / Home / production / env / remote / LLM / 自動 review / 性格断定。

### 10.7 A1-7-7 実装（landed）— Review Flow pure contract / types（pure・no-persist）

A1-7-7: review flow の **契約 vocabulary** を pure 定義（`lib/plan/reality/learning/review-flow-contract.ts`）。**pure / no-persist / no-DB / no-LLM / no-route / no-Home**。
- types: `ReviewDecisionKind`(approve/reject/defer) / `ReviewerKind`(operator/user) / `ReviewValidity` / `PrmEffect`。
- 関数: `isReviewableProposal`（candidate のみ true・blocked 不可）/ `validateReview`（未知 decision・non-reviewable を fail-closed）/ `decisionEffect`（approve→add_model_entry_candidate / reject→record_rejection / defer→no_model_change）/ `proposalFingerprint`（dimension:value:dominantAction・seedRef なし）。
- 検証: reality 728 PASS（723→+5）・自変更 tsc 新規 0・baseline 55。**しない**: 永続化/DB/migration/route/Home/production/env/remote/LLM。次は A1-7-8。

### 10.8 A1-7-8 実装（landed）— Review Decision Dry-run Helper（pure・no-persist）

A1-7-8: candidate proposal + 人間 decision → `ReviewDecisionRecord` を pure 生成（`lib/plan/reality/learning/review-decision-dry-run.ts`）。**保存しない**（persisted=false）。**pure / no-persist / no-DB / no-LLM / no-route / no-Home**。
- `toReviewDecisionRecord(proposal, decision, reviewer, reviewedAtISO?)`: validateReview → snapshot 固定 → effect。blocked / 未知 decision → valid=false（**fail-closed・throw なし**）。
- record: kind marker / valid·reason / proposalFingerprint / decision·effect（無効時 null）/ reviewer / **snapshot（review 時点・certainty≤tentative）** / reviewedAtISO（注入・Date.now なし）/ reviewRequired:true / assertsPersonality:false / **persisted:false**。`toReviewDecisionRecords` batch。
- 検証: reality 735 PASS（728→+7）・自変更 tsc 新規 0・baseline 55。**しない**: 永続化/DB/migration/route/Home/production/env/remote/LLM。次は A1-7-9 dev preview。

### 10.9 A1-7-9 実装（landed）— Review Flow Dev Preview（dev-report・render-only・no-persist）

A1-7-9: A1-7-7/7-8 review flow を fixture で可視化する dev 限定 preview（`/plan/dev-review-flow`）。永続化前に decision ごとの effect・blocked の fail-closed・persisted:false を目視検証。**dev/staging 限定・render-only・no-persist/no-route/no-DB**。
- page（三重ガード→notFound）+ client（fixture proposals → `toReviewDecisionRecords` → record card・no-persist）。fixture: candidate(evening/confidence high) を approve/reject/defer + blocked(morning) を approve → 4 records。
- card: proposalFingerprint / valid(緑)|invalid(赤・not_reviewable) / decision→effect / snapshot(certainty≤tentative) / **persisted:false** / reviewRequired:true / assertsPersonality:false。
- 実機検証(screenshot): approve→add_model_entry_candidate / reject→record_rejection / defer→no_model_change(user 再 review) / blocked→invalid(not_reviewable・fail-closed)・全 persisted:false・console error 0。
- 検証: reality 741 PASS(735→+6)・自変更 tsc 新規 0・baseline 55。**A1-7-9 完了＝review flow 実装層の終端**。
- **■ migration stop gate（必ず停止）**: A1-7-9 後の **decision 永続化（prm_review_decisions への DB write）・migration・PRM 永続化本体** は CEO 承認まで着手しない。→ readiness plan は §10.10 A1-7-10 で先行（**file は作らない**）。

### 10.10 A1-7-10 設計（docs-only）— PRM Migration Readiness Plan（migration file は作らない）

A1-7-10: A1-7-5 schema 設計 + A1-7-6〜9 review flow を前提に、実 migration を作る**前**の readiness plan。**docs-only・migration file/DB schema 実装/DB write/Supabase apply/route/Home/persistence/production/env/remote/PR を一切しない**。詳細: `docs/prm-migration-readiness-plan.md`。

**■ 段階分割**: M1 `prm_learning_events`（源泉・先行）→ M2 `prm_review_decisions`（review 入口）→ M3 `prm_model_entries`（実 PRM・M2 へ FK）。各段は**別 migration file・独立に revert 可能**。M1 単独で shadow 蓄積開始可。

**■ 最小カラム/RLS/constraints**: 3 table の最小 column（設計図示・seedRef/raw column を持たない）/ RLS owner-only（`auth.uid()=user_id`・service_role 前提にしない・cross-user 不可）/ **certainty CHECK in (low,tentative)＝high 不可**・**review_decision_id NOT NULL＝review なし entry 禁止**・trait column なし（文脈束縛 tendency のみ）。

**■ index/rollback/smoke**: 最小 index（recency/TTL/lookup）/ down=clean DROP（新規 table のみ・既存無変更・完全可逆）/ **local-only smoke**（remote 触らない・checklist 定義のみ・本 plan で実行しない）。

**■ retention/deletion**: events expires_at（TTL・sweep cron は別段階）/ user 起点 cascade 削除（GDPR）/ decay_weight + retracted_at。

**■ migration 作成前 最終 stop gate**: ①plan+review flow CEO 承認 →②開始段階（M1 推奨）承認 →③local smoke 手順承認 →④M1 file 作成+local smoke+実 SQL review →⑤remote apply 別承認。**①②未了は file を作らない・④まで local apply なし・⑤まで remote なし**。

**■ しない**: migration file/DB schema/DB write/Supabase apply/route/Home/persistence/production/env/remote/PR/deploy。

### 10.11 A1-7-11 実装（draft・未 apply）— M1 prm_learning_events Migration File Draft

A1-7-11: A1-7-10 M1 設計に従い `supabase/migrations/20260608120000_create_prm_learning_events.sql` を **1 本だけ作成 + 静的監査**（**未 apply**）。CEO が migration stop gate を越える承認（M1 file 作成 + 静的監査まで）。**apply / DB write / local reset / remote / M2 / M3 は禁止**。

**■ schema**: `prm_learning_events`（源泉 signal log・**append-only**）。columns: id / user_id(FK auth.users CASCADE) / handle(opaque) / action / signal / desired_date / band / confidence_band / duration_min / source_kind / acted_at / captured_at / expires_at(TTL)。**raw/seedRef/source_ref/utterance/certainty/evidence/counter/stillPossible/personality/trait/fixed_preference 列なし**（events=raw facts・derived/model は再導出/M3）。

**■ RLS/policy**: owner-only（`auth.uid()=user_id`・service_role 非前提・cross-user 不可）。**SELECT/INSERT/DELETE のみ・UPDATE policy なし＝append-only（事実は更新不能）**。

**■ constraints**: action/signal/band/confidence_band/source_kind の enum CHECK・duration_min≥0。**certainty high CHECK は M3（M1 に certainty 列なし）**。

**■ indexes**: (user_id, acted_at)（recency）/ (user_id, expires_at) partial（TTL sweep）。

**■ rollback/down**: header comment に revert SQL（DROP index → DROP table・policies は table と共に drop）。新規 table ゆえ clean DROP・M1 独立で可逆。

**■ 静的監査 PASS**: SQL（非コメント行）に raw/seedRef/utterance/personality/fixed_preference/certainty/evidence/counter/stillPossible/service_role/M2/M3 なし・UPDATE policy なし・RLS enabled・owner-only・REFERENCES auth.users・prm_ migration は本 file のみ。

**■ 正確な不接触表現**: **DB apply 0 / Supabase apply 0 / DB write 0 / local reset 0 / remote 0 / route 0 / Home 0 / production 0 / env 0 / persistence 実装 0**。migration **file は作成**したため「DB 関連 file 作成自体」は 0 でない（draft）。

**■ stop gate**: 実 DB apply / db push / local smoke 実行は別 GO（CEO 承認）。M2/M3 file は未作成。

### 10.12 A1-7-12 設計（docs-only）— M1 SQL Static Review + Local Smoke Plan

A1-7-12: M1 migration（A1-7-11）の **深い静的レビュー + local smoke checklist**。**docs-only・apply/db push/local reset/migration up 実行しない**。詳細: `docs/prm-m1-static-review-and-smoke-plan.md`。

**■ 静的レビュー verdict**: M1 SQL は correct/complete/safe（源泉 events log 用途）。finding 6 件は**全て非 blocker**（①expires_at app-insert 責務 ②handle index 将来 ③acted_at app validate ④self-poisoning は self-only/review-gated ⑤unique なしは設計通り ⑥down は revert migration 手順）。

**■ local smoke plan（実行しない・別 GO）**: local Supabase のみで apply →`\d` で schema → RLS(UPDATE policy なし確認) → constraints reject(action='foo' / confidence NULL / duration<0 / UPDATE / 別 user SELECT 0 rows) → index → down clean DROP。PASS 条件 + FAIL 時は draft 修正・remote に進まない。

**■ stop gate**: local smoke 実行も CEO 承認後。PASS→CEO が実 SQL+結果 review→remote apply 別 GO→production 更に別。

**■ しない**: Supabase apply/db push/local reset/migration up 実行/migration 編集/M2・M3/route/Home/persistence/production/env/remote/PR。

### 10.13 A1-7-13 設計（docs-only）— PRM Learning Event Insert Path Design

A1-7-13: dry-run event（A1-7-0）↔ M1 `prm_learning_events`（A1-7-11）を繋ぐ insert path を設計。**docs-only・コード/migration/DB apply/DB write/route/Home/persistence wrapper/M2/M3/production/env/remote 一切なし**。詳細: `docs/prm-learning-event-insert-path-design.md`。

**■ 元イベント**: accept/dismiss/later → CandidateActionOutcome（A1-6-0）→ `toDryRunLearningEvent`（A1-7-0）= 挿入実体。**dry-run と live が同一 helper・同一 event 形（乖離なし）**。

**■ 推奨タイミング**: **action route 直後**（status 更新成功後・最小安全）。reflection（read path ゆえ不可）/ sweep（plan_seeds から復元不能）を除外。

**■ 推奨設計**: まず route に fire 配線しない（mapper+repository[fake] のみ構築）→ 将来 flag ON 時だけ insert。**insert は fire-and-forget/fail-open**（失敗が user action を壊さない・no-retry）。**privacy は構造的 fail-closed**（mapper が raw/seedRef 生成不能）。

**■ repository**: pure mapper（event→insert row・raw 持てない型）/ repository interface / fake repository（test）/ Supabase impl は後続。

**■ RLS/idempotency/flag/observability/rollback**: user-RLS（user_id=auth.uid()・service_role なし・handle opaque・raw 非保存）/ fire-once+no-retry（将来 UNIQUE(handle,action,acted_at) は M1 追記=別 GO）/ flag default off・local/staging only・production gate / log は count/status のみ（raw/seedRef 出さない）/ flag off で即 disable（diff 0）+ M1 revert で完全可逆。

**■ 実装最小 slice（順序）**: ①mapper（pure・自律）②repository interface+fake+tests（pure・自律）③Supabase repository（🛑gate）④route connection（🛑gate）⑤DB apply（🛑gate）。write が動く前に全 logic を fake 検証。

**■ しない**: コード/migration/DB apply/DB write/route/Home/PlanClient/persistence wrapper/M2/M3/production/env/remote/PR。

### 10.14 A1-7-14 実装（pure・no-DB）— PRM Learning Event Insert Mapper + Repository Port/Fake

A1-7-14: A1-7-13 設計の **slice ①mapper + ②repository interface/fake** を pure 実装。**A1-7-14 は insert contract / fake repository foundation であり、Supabase repository ではない**。Supabase repository（real insert）/ route connection / DB apply は **後続 gate**（CEO 承認・未着手）。

**■ 追加（3 file・既存 prod から未参照=未配線）**:
- `lib/plan/reality/learning/prm-learning-event-insert.ts`: `PrmLearningEventInsertRow`（M1 列のみ・user_id/id を持たない）/ `toPrmLearningEventInsertRow(event,{capturedAtISO,expiresAtISO?})` pure mapper / `toPrmLearningEventInsertRows` / `PrmLearningEventRepository` interface（insert(rows)→{ok,inserted}・DB 型/Supabase client を漏らさない）/ `PrmLearningEventInsertResult`。
- `lib/plan/reality/learning/fake-prm-learning-event-repository.ts`: `FakePrmLearningEventRepository`（in-memory・**persisted:false marker**・dedup by (handle,action,acted_at)・`setFailNext` で graceful 失敗）/ `insertRowIdempotencyKey`。
- `tests/unit/reality/realityPrmLearningEventInsert.test.ts`: 17 tests（M1 schema 一致 / 構造的非保存 / timestamp 注入・acted_at fallback / fake insert / idempotency / 再 action 別 row / fail-open / marker）。

**■ 安全保証**: raw/seedRef/utterance/personality/trait/fixed_preference/certainty/hypotheses/user_id/id は InsertRow 型に存在せず**構造的非保存**（mapper が生成不能）。Date.now 直呼びなし（timestamp 注入・pure deterministic）。idempotency=fire-once dedup（A1-7-13 §6）。fail-open は fake が throw でなく {ok:false} を返すことで検証（user action を壊さない設計）。

**■ 不接触**: DB / Supabase client / persistence / route / Home / PlanClient / production / env / remote / migration / apply / LLM / M2 / M3。tsc 55（baseline 不変）・reality 755 PASS。

**■ 後続 gate**: ③Supabase repository（persistence・CEO 承認）④route connection（route/Home・CEO 承認）⑤DB apply（remote・CEO 承認・local smoke 後）。

### 10.15 A1-7-15 実行（local smoke）— M1 prm_learning_events Local Smoke PASS

A1-7-15: M1 migration（`20260608120000_create_prm_learning_events.sql`）を **隔離 throwaway `postgres:17` container** で apply し、schema/RLS/constraints/index/rollback を検証。**全 19 assertion PASS**。**既存 Supabase local stack（`supabase_db_aneurasync-x-ops`）/ remote / staging / production に一切触れていない**（`supabase` CLI コマンド 0 回・linked ref `hjcrvndumgiovyfdacwc`=staging 未接触・dev-local データ wipe なし）。

**■ 実行方式**: `docker run postgres:17`（host port 非公開・独立）→ Supabase 風 auth stub（`auth.users` / `auth.uid()`=`request.jwt.claims->>'sub'` / `authenticated` role・**user-RLS / service_role 非前提**）→ M1 verbatim apply → 19 assertion → rollback → container 破棄。repo file 変更 0。

**■ 結果（全 PASS）**: apply+table 作成 / RLS enabled / column=M1 13 列のみ（raw/seed_ref/utterance/personality/trait/fixed_preference/certainty/hypotheses 不在）/ indexes 2 / M2·M3 table 不在 / 制約 reject 5（action·signal·band·confidence NULL·duration<0）/ RLS owner-only（他人 user_id INSERT 拒否·他人 SELECT 0 rows·owner SELECT 1·owner DELETE 成功）/ append-only（UPDATE policy 不在·UPDATE 0 rows）/ rollback clean DROP。

**■ 不接触**: remote/staging/production apply 0・env 0・route/Home/persistence 0・Supabase repository 0・M2/M3 0。本記録は docs-only commit。

**■ 次**: M1 が実 Postgres 上で apply/RLS/constraint/rollback まで通ったため A1-7-16 Supabase repository 実装に進める（実 staging apply は引き続き別 gate=slice ⑤）。

### 10.16 A1-7-16 実装（server-only・mock test）— Supabase PRM Learning Event Repository

A1-7-16: A1-7-13 slice ③ = `PrmLearningEventRepository`（A1-7-14 port）の **Supabase 実装**。A1-7-15 で M1 local smoke PASS したため CEO 承認で実装。**route 未接続・実 DB insert 実行 0・未配線**（route connection=slice ④ は stop gate）。

**■ 追加（2 file・既存 prod から未参照=未配線）**:
- `lib/plan/reality/learning/supabase-prm-learning-event-repository.ts`（`import "server-only"`）: `createSupabasePrmLearningEventRepository(client, userId)` / `PrmLearningEventWriteClient`（structural user-RLS write client）/ `PRM_LEARNING_EVENTS_TABLE`。
- `tests/unit/reality/realitySupabasePrmLearningEventRepository.test.ts`: 8 tests（mock client・実 DB 接続 0）。

**■ behavior**: injected user-RLS client + userId（route が auth.getUser() で確定）→ mapper 済 row に user_id 付与 → `from('prm_learning_events').insert(payload)`。空 rows → insert 呼ばず {ok:true,0}。error → {ok:false,0}。例外（auth 同期 throw / network reject）→ catch して {ok:false,0}（**fail-open・throw しない**）。成功 → {ok:true, rows.length}。

**■ 安全保証**: createClient しない（client 注入）・**service_role 禁止**（user-RLS・RLS WITH CHECK auth.uid()=user_id）・payload は InsertRow（M1 列）+ user_id のみ（raw/seedRef/utterance/personality/trait/fixed_preference/certainty/hypotheses を型として持たない）・return/log は count/status のみ（UUID/error detail を出さない・本 module は log しない）・Date.now なし。

**■ 不接触**: route / Home / PlanClient / DB apply / Supabase apply / 実 DB insert / local reset / remote/staging/production / env / migration / M2 / M3。tsc 55（baseline 不変）・reality 763 PASS。

**■ 後続 gate**: ④route connection（slice ④・flag-gated fire-and-forget・CEO 承認）⑤DB apply（remote・CEO 承認）。

### 10.17 A1-7-17 実装（route connection・flag default OFF）— Learning Event Write On Action

A1-7-17: A1-7-13 slice ④ = candidate-action route に learning event write path を接続。**flag `realityLearningEventWrite` default OFF**（flag OFF→insert 0・既存挙動完全不変）。CEO 承認は **flag OFF の route connection code まで**（DB apply / env 変更 / production / remote / flag ON = 別 gate）。

**■ 追加/変更（4 file）**:
- `lib/plan/reality/integration/learning-event-write-on-action.ts`（新・server-only）: `writeLearningEventOnAction(input)` glue + `learningEventExpiresAtISO(nowMs)` + `LEARNING_EVENT_TTL_DAYS=180`。
- `lib/plan/featureFlags.ts`（+`realityLearningEventWrite`・`REALITY_LEARNING_EVENT_WRITE`・default false・server-side）。
- `app/api/reality/candidate-action/route.ts`（flag-gated block: status 成功後に entry 再 read + glue・flag OFF で skip）。
- `tests/unit/reality/realityLearningEventWriteOnAction.test.ts`（11 tests・mock repo）。

**■ behavior**: route が runCandidateActionRoute 後、flag ON のとき `loadActiveCandidateEntries` で context 再 read → glue。glue: flag OFF / 非 accepted / deferred(later) / parse 不能 / entry 解決不能 → 何もしない。それ以外（accept→consumed / dismiss→rejected 成功）→ context(handle/date/band/confidenceBand(numeric→band)/durationMin/evidenceSource=seed_explicit v1 既定)→toDryRunLearningEvent(action, nowISO)→toPrmLearningEventInsertRow(capturedAt=now, expiresAt=now+180d)→repository.insert を **await-and-swallow**（失敗/例外は握り action response 不破壊）。

**■ 挿入点**: `app/api/reality/candidate-action/route.ts` POST、`runCandidateActionRoute` 直後の flag-gated block。

**■ flag OFF diff 0**: flag OFF → block 全体を skip（entry 再 read も repository 生成も glue も呼ばない）= insert 0・response 不変・既存挙動完全不変。

**■ 安全保証**: status update が主責務・learning write は best-effort（await-and-swallow・fail-open）/ 時刻は route 境界注入（nowMs・glue は Date.now 直呼びせず `new Date(nowMs)`）/ payload は M1 列のみ（raw/seedRef/personality を型として持たない・seedRef 非出・handle opaque）/ later は status transition なしゆえ非対象（v1）/ evidenceSource は entry が source kind 未保持ゆえ seed_explicit 既定（v1・将来 enrich）。

**■ 不接触**: DB apply 0 / Supabase apply 0 / DB write 実行 0（flag OFF）/ env 0 / Home 0 / PlanClient 0 / MorningPlanCard 0 / production 0 / remote 0 / migration 0 / M2·M3 0。tsc 55・reality 774 PASS。

**■ 後続 gate**: ⑤DB apply（remote prm_learning_events・CEO 承認）+ flag ON（staging 有効化・CEO 承認）。

### 10.18 A1-7-18 実装（pure helper + tests + docs）— Later / Deferred Learning Event Policy

A1-7-18: A1-7-17 v1 が later(deferred) を learning event 非対象にしていた不整合を是正する **policy**。**later を保存する**（deferral 信号は最も深い観測素材=timing/hesitation 次元）。**pure helper + tests + docs のみ**（glue/route 変更は design-only・DB/flag/remote 不接触）。詳細: docs/prm-later-deferred-policy.md。

**■ 結論**: later を保存対象にする（A1-7-0 が既に later→deferral/[postpone_signal,timing_uncertain] をモデル化済・route connection だけ落としていた）。M1 schema は action/signal に later/deferral を既に含むため **migration 変更不要**。

**■ 保存条件**: action が **accepted（validly processed）** なら write（accept→adoption / dismiss→non_adoption / later→deferral）。!accepted は skip。later は status 遷移を持たないが accepted=true ゆえ write 対象（「status 成功 only」を是正）。

**■ dedup/idempotency**: events は raw 源（append-only・全 tap 記録）。dedup grain=**handle+action+acted_date（日粒度・aggregation 側で適用）**: 同日反復（later 連打）→1 信号 collapse / 異日反復→別 key=慢性 deferral 蓄積。accept/dismiss は反復不能ゆえ安全。write 時 dedup なし（append-only 維持）。

**■ 追加（2 file・prod 未参照=glue/route 未変更）**: lib/plan/reality/learning/learning-event-write-policy.ts（decideLearningWrite/learningEventDedupKey）・tests/unit/reality/realityLearningEventWritePolicy.test.ts（9 tests）。

**■ route 変更要否**: 要（glue gate を `accepted&&!deferred`→`decideLearningWrite().write` に是正）= route connection 変更ゆえ **design-only（A1-7-19 候補・CEO 承認）**。aggregation dedup も design-only。

**■ DB apply へ進めるか**: M1 schema は later-ready（変更不要）ゆえ DB apply は block されない。ただし flag ON で later を取りこぼさないため glue gate 是正は flag ON 前に着地。

**■ 不接触**: glue/route 0・DB apply 0・Supabase apply 0・DB write 0・env 0・flag ON 0・Home 0・production 0・remote 0・migration 0・M2/M3 0。tsc 55・reality PASS。

### 10.19 A1-7-19 実装（route glue correction + aggregation dedup）— accept/dismiss/later write semantics 統一

A1-7-19: A1-7-18 policy を route glue に適用し、accept/dismiss/**later** の 3 action 学習素材化を完成。**flag default OFF 維持**（実行は flag ON + table apply 時のみ・現状 0）。**DB apply / flag ON はまだ未実施**。

**■ route glue correction（learning-event-write-on-action.ts）**:
- gate を `!response.accepted || response.deferred`（later 除外）→ **`decideLearningWrite(parsed.action, response).write`**（accepted なら write・later=deferral も対象）に是正。
- parse を gate 前に移動（action を得てから decideLearningWrite）。failed/conflict/unresolved（!accepted）は write しない。
- 以降（context 構築→toDryRunLearningEvent→toPrmLearningEventInsertRow→await-and-swallow insert）は不変。flag OFF で全 skip も不変。

**■ aggregation dedup（dry-run-aggregation.ts）**:
- `dedupeEventsForSignal(events)`（新 export）: `learningEventDedupKey`（handle+action+acted_date）で同日反復を最初の 1 件に collapse。
- `AggregationOptions.dedupeSameDay?`（**default false**）: true で集約前に dedup。同日 later 連打→1 signal / 異日→別 / distinct handle（accept/dismiss/別候補）→collapse なし。
- **default false ゆえ既存 aggregation/dev-report は regress なし**（fixture は定数 handle・live signal 集約は dedupeSameDay:true 推奨）。

**■ tests**: glue—later→insert 1（deferral）・failed later→insert 0・flag OFF→insert 0。aggregation—同日 later 連打→signal 1 / 異日→2 / distinct handle accept regress なし。raw/seedRef なし・expires_at 180d・Date.now 直呼びなし 維持。

**■ 不接触**: DB apply 0・Supabase apply 0・DB write 実行 0・env 0・flag ON 0・Home 0・PlanClient 0・production 0・remote 0・migration 0・M2/M3 0。tsc 55・reality 790 PASS。

**■ DB apply / flag ON はまだ未実施**: accept/dismiss/later の write semantics が揃ったため次は DB apply（slice ⑤）→flag ON。両方 CEO 承認 stop gate。

### 10.20 A1-7-20 Preflight + A1-7-21 Staging M1 DB Apply — M1 を staging に apply + smoke PASS

A1-7-20（read-only preflight）→ A1-7-21（apply・**DB apply stop gate を CEO 承認で越える**）。M1 `prm_learning_events` を **staging（hjcrvndumgiovyfdacwc）に apply** し post-apply smoke 全 PASS。**flag ON は未実施**（`REALITY_LEARNING_EVENT_WRITE=false` 維持）。

**■ A1-7-20 preflight（read-only・全 PASS）**: linked ref=staging・active URL keys=staging・production ref（aljavfujeqcwnqryjmhl）は **deny-constant（SHIFT_SMOKE_PROD_URL_DENY / PRODUCTION_PROJECT_REF）のみ=active 接続でない**・`migration list` で M1 が唯一の pending・M1 file は A1-7-15 smoke 以降 未変更で DDL は local smoke と一致（差はコメントのみ）・revert SQL は header。

**■ A1-7-21 apply（staging のみ・production 不接触）**: ①再確認（staging/非 production）②`supabase migration list --linked`（M1 のみ pending）③`supabase db push --linked --dry-run`（"Would push: 20260608120000 のみ"）④`supabase db push --linked --yes`（apply exit 0・"Applying 20260608120000… Finished"）⑤post-apply: `migration list` で M1 Remote 適用済 + `supabase db dump`（read-only）で schema 検証。

**■ post-apply smoke（staging・全 PASS）**: table exists / 13 columns / RLS ENABLE / policies=SELECT·INSERT·DELETE（**UPDATE policy 0=append-only**）/ indexes 2（user_acted/active_expiry）/ CHECK 6（action·signal·band·confidence·duration·source）/ 禁止 column 不在（raw/seed_ref/utterance/personality/trait/fixed_preference/certainty/hypotheses）/ M2·M3 table 不在。

**■ 不接触**: production apply 0・flag ON 0（REALITY_LEARNING_EVENT_WRITE=false 維持）・env 変更 0・route/Home/PlanClient 変更 0・M2/M3 0・test row 0（roundtrip は flag ON 後に自然発生・staging に test data 残さず）。

**■ 次**: flag ON（`REALITY_LEARNING_EVENT_WRITE=true`・staging 有効化）は別 CEO gate。**staging table は ready**。

### 10.22 A1-7-22 実行（staging flag ON controlled insert smoke）— accept/dismiss/later 実 insert PASS + cleanup

A1-7-22: CEO 承認で **flag ON + staging DB write stop gate を越え**、controlled smoke で accept/dismiss/later の実 insert を staging で検証 + cleanup。**flag は process env のみ（.env.local/Vercel 非永続）= staging effectively OFF 維持**。production 不接触。

**■ 実行方式**: throwaway tsx script（実行後削除・repo 非追加）。real pure helpers（`decideLearningWrite`→`toDryRunLearningEvent`→`toPrmLearningEventInsertRow`）+ flag（`REALITY_LEARNING_EVENT_WRITE=true` を process env→`PLAN_FLAGS.realityLearningEventWrite=true` 確認）+ staging auth user（USER_A）で **repo の insert（row+user_id）を忠実再現**。server-only route/repo は使わず（一致を mapper+flag gate で担保）。

**■ smoke 結果（staging・全 PASS）**: target=staging（hjcrvndumgiovyfdacwc）・production ref 不在 / flag env=true・PLAN_FLAGS=true / **accept→adoption・dismiss→non_adoption・later→deferral** 各 1 件 insert / row columns=M1 13 列のみ（禁止 column 不在・raw/seedRef 値なし）/ user_id=auth user / handle opaque（c1:）/ expires_at−acted_at=180 日 / RLS: owner read 3・他人 user_id INSERT 拒否（42501=insufficient_privilege）/ cleanup 後 smoke row 0。

**■ flag 判断**: smoke は flag を **process env のみで ON**（.env.local/Vercel に永続化せず）→ staging は **effectively OFF**。**推奨: OFF 維持**（実 user data 蓄積は dogfood scope + 監視を CEO が決めてから persistent 有効化）。

**■ 不接触**: production 0・M2/M3 0・route/Home/PlanClient 変更 0・env 永続変更 0（.env.local 不変）・repo code 0（記録は docs-only）・staging に test data 残さず（cleanup 0）。

**■ 次**: persistent flag ON（Vercel staging env or .env.local に REALITY_LEARNING_EVENT_WRITE=true）+ dogfood・M2（review）・M3（model）は別 CEO gate。

### 10.23 A1-7-23 実行（route-level smoke）— **BUG 発見**: accept/dismiss の learning write が落ちる（glue が transition 後に active entry を再 read）

A1-7-23: 実 `/api/reality/candidate-action` route 経由で accept/dismiss/later を staging に流す route-level smoke。**route-level E2E が A1-7-17 wiring の real bug を検出**（A1-7-22 script smoke は fabricated entries ゆえ masking していた）。**A1-7-23 は PASS せず**（fix slice 後に再実行）。

**■ 検証結果**: route POST 3 件すべて HTTP 200・resolved（accept accepted=true / dismiss accepted=true / later accepted=true deferred=true）= status transition は成功（seed statuses = consumed/rejected/active）。**だが prm_learning_events は 1 件のみ insert**（later→deferral のみ）。accept/dismiss の event が**書かれない**。

**■ root cause**: `app/api/reality/candidate-action/route.ts` の A1-7-17 wiring が `loadActiveCandidateEntries` を **`runCandidateActionRoute`（status transition）の後**に呼ぶ。accept→consumed / dismiss→rejected で seed が **非 active** になり、glue の `entries.find(deriveCandidateHandle(seedRef)===handle)` が見つからず `if(!entry) return` → write skip。later は transition なし→active のまま→found→write。

**■ 影響**: 現 wiring では **accept(adoption)/dismiss(non_adoption) の learning event が永続化されない**（later のみ）。A1-7 の主目的（採用/非採用信号）を満たさない critical bug。route-level E2E でなければ検出できなかった（script smoke の限界）。

**■ fix 案（design・実装は CEO 承認）**: context を **transition 前に capture**する。最小=route で `loadActiveCandidateEntries` を `runCandidateActionRoute` の**前**に移動し、その entries を glue に渡す（pre-transition entries は acted candidate を active で含む）。clean=`loadSurfaceableForActionWithEntries` を追加し surfaceable+entries を 1 read で返す。

**■ cleanup/不接触**: smoke の 1 event + 3 seeds 削除（count 0）・dev server 停止・throwaway script 削除・flag は process env のみ（.env.local 不変=staging OFF）・production 0・M2/M3 0・route/Home/PlanClient 変更 0・repo code 0（記録は docs-only）。

**■ 次**: **A1-7-24 fix slice（route wiring 修正・CEO 承認）→ A1-7-23 route smoke 再実行**。それまで persistent flag ON に進まない。

### 10.24 A1-7-24 実装（route wiring fix + re-smoke PASS）— accept/dismiss/later 全て route 経由で learning event 永続化

A1-7-24: A1-7-23 の bug（glue が status transition 後に active entry を再 read し accept/dismiss の context を見失う）を修正。**context を transition 前に capture**。route-level re-smoke で **accept→adoption / dismiss→non_adoption / later→deferral の 3 件 staging insert** を確認。**flag default OFF 維持・persistent flag ON 未実施**。

**■ root cause**: route.ts が `loadActiveCandidateEntries` を `runCandidateActionRoute`（transition）の後に呼ぶ→accept→consumed / dismiss→rejected で seed 非 active→glue が entry を見失い skip（later のみ書けていた）。

**■ 修正**:
- `candidate-action-route-support.ts`: `loadSurfaceableForActionWithEntries(client,userId,nowMs)→{surfaceable, entries}`（1 read で surfaceable + **pre-transition context 付き entries**）。`loadSurfaceableForAction` は delegate（API 互換）。
- `route.ts`: `loadSurfaceableForActionWithEntries` で **transition 前に entries capture** → runCandidateActionRoute → glue に同 entries を渡す。post-transition `loadActiveCandidateEntries` 削除。flag OFF→block skip（surfaceable load は従来と同一 1 read ゆえ挙動不変）。
- glue/repo/mapper/policy/flag/TTL は不変（await-and-swallow / fail-open / raw 非保存 / expires 180d / route boundary time 維持）。

**■ unit tests（realityCandidateActionRoute.test.ts +3）**: loadSurfaceableForActionWithEntries が surfaceable+entries(context) を返し delegate と一致 / seed なし→[]・[] / **fix 検証: pre-transition entries で accept(→consumed)/dismiss(→rejected)/later すべて insert 1 + signal 一致 + raw なし**。

**■ route-level re-smoke（staging・全 PASS）**: 実 /api/reality/candidate-action に accept/dismiss/later POST（全 HTTP 200）→ prm_learning_events 3 件 {adoption:1, non_adoption:1, deferral:1}・13 列・raw なし・user_id=auth・handle opaque・expires 180d。flag は process env のみ（非永続）。cleanup events 0 / seeds 0。

**■ 不接触**: DB apply 0・Supabase apply 0・persistent env 変更 0（.env.local 不変=staging OFF）・production 0・Home/PlanClient 0・M2/M3 0・PRM model persistence 0。tsc 55・reality 793 PASS。

**■ 次**: persistent staging flag ON + dogfood は別 CEO gate（accept/dismiss/later の 3 action が route 経由で正しく永続することを確認済）。

### 10.25 A1-7-25 実行（persistent staging flag ON + dogfood enablement）

A1-7-25: **persistent staging flag ON** — `.env.local`（staging 接続 local-dev env・**Vercel/production 不接触**）に `REALITY_LEARNING_EVENT_WRITE=true` を追加（gitignore ゆえ未 commit）。**inline env なしの dev server**で route smoke が 3 件書ける＝**flag が .env.local 由来で persistent に ON**。limited dogfood（local-dev-against-staging）有効化。CEO 方針修正（明確な stop gate まで自律継続・staging/dogfood/docs/pure/tests/dev-preview/staging smoke/M2-M3 design は低リスクなら止まらず進める・production 絶対不可）に基づき自律実行。

**■ 検証（staging・全 PASS）**: dev server を inline env **なし**で起動（flag=.env.local 由来）→ 実 /api/reality/candidate-action に accept/dismiss/later POST（全 HTTP 200）→ prm_learning_events 3 件 {adoption:1,non_adoption:1,deferral:1}・13 列・raw なし・user_id=auth・handle opaque・expires 180d。cleanup events 0/seeds 0。

**■ rollback**: .env.local の `REALITY_LEARNING_EVENT_WRITE` 行削除（即 OFF・diff 0）。

**■ dogfood scope**: local-dev-against-staging（staging 接続 dev で app を使うと learning event が蓄積）。owner-only RLS・structured-only・TTL 180d・user 削除可。**production 無影響**。

**■ 不接触**: production 0・Vercel/deploy 0・remote 0・M2/M3 0・Home/PlanClient 0・route/repo code 変更 0（flag は env のみ・記録は docs-only）。

### 10.26 A1-7-26 実装（pure read mapper + Supabase reader）— live events → DryRunLearningEvent 観測 read 側

A1-7-26: dogfood で蓄積する prm_learning_events を **観測可能**にする read 側。**pure read mapper + server-only reader + tests**（未配線・low-risk）。

**■ 追加（2 lib + 1 test・prod 未参照=未配線）**:
- `prm-learning-event-read.ts`（pure）: `PrmLearningEventReadRow`（context 列のみ・raw/seedRef/user_id/id/signal なし）/ `PRM_LEARNING_EVENT_READ_COLUMNS` / `prmLearningEventRowToDryRunEvent`（ctx 再構築→toDryRunLearningEvent・insert と同一 helper で faithful）/ `prmLearningEventRowsToDryRunEvents`（不正 action skip）。
- `supabase-prm-learning-event-reader.ts`（server-only）: `createSupabasePrmLearningEventReader(client,userId)`→owner events を column-restricted read→DryRunLearningEvent[]。read-only・user-RLS・service_role 禁止・fail-open []。
- `realityPrmLearningEventRead.test.ts`（8 tests）。

**■ 観測 loop**: reader → DryRunLearningEvent[] → `aggregateDryRunEvents({dedupeSameDay:true})`（A1-7-1）→ tentative patterns → `projectPrmDryRun`（A1-7-3）→ proposals。dry-run と同形（PRM model でない）。

**■ 安全**: signal/hypotheses は action から再導出（stored signal 読まず単一 source）・read 列に raw/seedRef/user_id/id/signal なし・**insert→read round-trip で event 完全一致**・fail-open。

**■ 不接触**: route/Home/PlanClient/DB write/migration/production/env/remote 0。tsc 55・reality 801 PASS。

### 10.27 A1-7-27 設計（M2 migration draft + static audit）— prm_review_decisions

A1-7-27: M2 `prm_review_decisions`（人間の review 決定ログ・**PRM model への唯一入口**）の **migration draft + design + 静的監査**。**apply しない**（別 CEO gate・M1 同手順）。詳細: docs/prm-m2-review-decisions-design.md。

**■ 追加（migration draft 1 + docs 1）**: supabase/migrations/20260609120000_create_prm_review_decisions.sql（draft・未 apply）・docs/prm-m2-review-decisions-design.md。

**■ schema**: id/user_id(FK auth.users)/proposal_fingerprint(=dimension:value:action)/decision(CHECK approve·reject·defer)/reviewer(CHECK operator·user)/snapshot flat 列(source_dimension CHECK 4・source_value・dominant_action CHECK 3・favored_hypothesis・still_possible TEXT[]・evidence_count·counter_count CHECK≥0)/**certainty CHECK in(low,tentative)=high を DB で不可能化**/reviewed_at/created_at。index 2(fingerprint latest・recency)。RLS owner SELECT/INSERT/DELETE・**UPDATE policy 不在=append-only**。

**■ 設計判断**: snapshot は flat 列(jsonb 不使用=raw 混入余地を排除・CHECK 強制)・decision/reviewer は A1-7-7 contract に統一(approve/reject/defer・operator/user)・effect は decisionEffect の純関数ゆえ非保存・**certainty CHECK で過断定防止 gate を persistence 層に導入**(M1 になかった構造 gate)。

**■ static audit**: correct/complete/safe・finding 6 全て非 blocker(unique なし=append-only 正/favored·value enum なし=controlled code/reviewed_at app validate/self-poisoning owner-only・reviewRequired は設計/still_possible code 配列/down revert SQL)。

**■ 不接触**: apply 0・db push 0・local reset 0・M3 0・route/Home/persistence 0・production/env/remote 0。

### 10.28 A1-7-28 実装（live observation dev-preview）— dogfood learning を可視化

A1-7-28: dogfood で蓄積する learning を **dev-preview で可視化**。`/plan/dev-learning-observation`（triple-guard + auth・owner-only）が A1-7-26 reader で staging events を読み aggregate(dedupeSameDay)→project→render。**read-only・PRM 保存しない・製品入口でない**。

**■ 追加/変更**:
- `dev-learning-observation/page.tsx`（新・server）: triple-guard（REALITY_CANDIDATE_ACTIONS_DEV_HOST + staging ref + 非 production）→ supabaseServer auth → createSupabasePrmLearningEventReader → readLearningEvents → aggregateDryRunEvents({dedupeSameDay:true}) → projectPrmDryRun → LearningReportPreviewClient(live)。未 auth は空 report。
- `dev-learning-report/LearningReportPreviewClient.tsx`（optional props 化）: {report?, projection?, live?} を受け、未指定なら fixture（既存挙動不変）・指定なら live。

**■ 検証**: tsc 55・既存 preview test 9 PASS（regression なし）・reality 801 PASS・**runtime render check**（dev server REALITY_CANDIDATE_ACTIONS_DEV_HOST=true + Playwright login → /plan/dev-learning-observation HTTP 200・learning-report testid present・"Live Learning Observation" 表示）。未 auth は 307（proxy gate）。

**■ 安全**: read-only（reader は select のみ）・owner-only RLS・PRM 保存しない・triple-guard で production 構造的不可視・raw/seedRef 非出（reader column-restricted）。

**■ 不接触**: DB write 0・migration 0・production 0・env 永続 0（dev-host flag は dev server process env のみ）・Home/PlanClient 0。

### 10.29 A1-7-29 設計（M3 migration draft + static audit）— prm_model_entries（PRM 本体）

A1-7-29: M3 `prm_model_entries`（review 済 tendency = **PRM 本体=第二の自己**）の **migration draft + design + 静的監査**。**3-table アーキテクチャ設計完成**（M1 live + M2 draft + M3 draft）。apply しない（M2→M3 順・別 CEO gate）。詳細: docs/prm-m3-model-entries-design.md。

**■ 追加**: supabase/migrations/20260609130000_create_prm_model_entries.sql（draft・未 apply）・docs/prm-m3-model-entries-design.md。

**■ schema**: id/user_id(FK)/context_dimension(CHECK 4)/context_value/tendency_direction(CHECK adoption·non_adoption·deferral)/favored_hypothesis/still_possible TEXT[]/evidence_count·counter_count(CHECK≥0)/**certainty CHECK low·tentative**/decay_weight REAL(0..1)/**review_decision_id NOT NULL FK→prm_review_decisions=reviewRequired 構造的実体**/supersedes_id(self FK・versioning)/user_visible/user_correction(CHECK enum)/created·updated·retracted_at。index 2・updated_at trigger・RLS owner SELECT/INSERT/UPDATE/DELETE。

**■ 過断定防止 5 重 gate を全て schema 構造化**: reviewRequired FK NOT NULL + certainty CHECK no high(INSERT/UPDATE) + counter_count + still_possible[] + tendency-not-trait(trait 列なし)。可逆: supersedes/retracted/user_correction。

**■ static audit**: correct/complete/safe・finding 6 全非 blocker(UPDATE 許可=model 層 mutable 設計通り/supersedes SET NULL/favored enum なし=controlled/review_decision CASCADE/decay app 更新/down revert)。

**■ 不接触**: apply 0・db push 0・M1/M2 編集 0・route/Home/persistence 0・production/env/remote 0。

### 10.30 A1-7-30 実装（M2/M3 repository contract + fake + Supabase adapter・未配線）

A1-7-30: M2/M3 の write 側（mapper + repository interface + fake + Supabase adapter）。**全 unwired・no apply・no route・no UI**。reviewRequired / certainty no high / no raw-seedRef-personality / owner-RLS / fail-open / 全契約維持。

**■ 追加（6 lib + 1 test・prod 未参照）**:
- M2: prm-review-decision-write.ts（reviewDecisionRecordToInsertRow=valid review のみ・certainty≤tentative・raw 非保持 / interface / result{ok,inserted,ids}）・fake-prm-review-decision-repository.ts（id 返却・fail-open）・supabase-prm-review-decision-repository.ts（server-only・user-RLS・.select("id")で id 返却・fail-open）。
- M3: prm-model-entry-write.ts（approvedReviewToModelEntryRow=**review_decision_id 必須+approve のみ**=reviewRequired・tendency 写像 accept→adoption/dismiss→non_adoption/later→deferral・certainty≤tentative / interface / result）・fake-prm-model-entry-repository.ts・supabase-prm-model-entry-repository.ts（server-only・user-RLS・fail-open）。
- realityPrmReviewModelWrite.test.ts（17 tests）。

**■ 契約維持**: reviewRequired（M2=valid review のみ行・M3=review_decision_id 空→null/approve のみ）・certainty high 型で不可能・personality/trait/fixed_preference 列なし・raw/seedRef/utterance を payload/return に出さない・user-RLS（service_role 禁止）・fail-open・counterCount/stillPossible/snapshot/user_correction/supersedes/retracted の契約は M2/M3 schema + mapper で保持。

**■ 不接触**: DB apply 0・route 0・UI 0・Home/PlanClient 0・production/remote/env 0・PRM persistence 有効化 0。tsc 55・reality 818 PASS。

**■ 次（全 stop gate）**: M2/M3 apply・review UI/route・PRM persistence 有効化 = 全て CEO 承認 stop gate。

### 10.31 A1-7-31+ 次フェーズ設計（review-to-model flow）— 全 stop gate

A1-7-30 後の次フェーズ設計。**実装は全て CEO 承認 stop gate**（M2/M3 apply / review UI·route / PRM persistence 有効化）。詳細: docs/prm-review-to-model-flow-design.md。

**■ phases（全 gate）**: A1-7-31 M2/M3 staging apply（M2→M3 順・FK 依存）/ A1-7-32 review flow route+UI（人間が proposal review→decision→M2 insert→approve なら M3 entry・REALITY_REVIEW_WRITE default OFF）/ A1-7-33 PRM model 読み+第二の自己 surfacing（実ユーザー有効化＝CEO 明示 gate）。

**■ CEO 仕様判断（要確認）**: ①reviewer（operator-only 先行 推奨 / user も）②UI（dev-preview 拡張 / dashboard）③第二の自己 surfacing の公開判断（哲学の核・最慎重）。

**■ 推奨順序**: apply → operator review(flag OFF) → dogfood 観測 → user 公開（最慎重）。全フェーズで reviewRequired/certainty no high/raw 非保存/owner-RLS/tendency-not-trait/可逆/production 不接触 維持。

**■ 不接触**: 本 slice は docs のみ・実装 0。

### 10.32 A1-7-32 実行（M2/M3 local smoke + staging apply + post-apply smoke）

A1-7-32: M2 prm_review_decisions + M3 prm_model_entries を **staging に apply**（M2→M3 順・FK 依存）。local smoke 19 PASS + post-apply smoke 全 PASS。**flag/review UI/PRM 有効化なし・production 不接触**。CEO 承認（M2/M3 local smoke/staging apply/post-apply smoke まで）。

**■ local smoke（throwaway postgres:17・全 19 PASS）**: tables/RLS/M2 policies 3(UPDATE 不在=append-only)/M3 policies 4(UPDATE あり=mutable)/indexes/M3 trigger/forbidden columns 不在/M2·M3 **certainty=high reject**/M2 decision bogus reject/M3 valid review_decision_id INSERT/**M3 review_decision_id NOT NULL reject(reviewRequired)**/**M3 FK reject(reviewRequired)**/M3 decay>1 reject/M2 cross-user INSERT reject/M2 owner INSERT/M2 UPDATE 0 rows(append-only)/M2 cross-user SELECT 0/rollback clean DROP。
**■ staging**: preflight(linked=staging・production ref なし・pending=M2/M3 のみ)→dry-run("Would push 20260609120000 M2,20260609130000 M3" のみ)→db push --yes(M2→M3 順 apply・Finished・error なし・migration list 両方 Remote 適用済)→post-apply smoke(db dump read-only): M2/M3 certainty CHECK(low/tentative=no high)・**M3 review_decision_id NOT NULL + FK→prm_review_decisions CASCADE(reviewRequired)**・全 CHECK・RLS enable 2・M2 policies 3(append-only)・M3 policies 4(UPDATE あり)・forbidden columns なし・staging row counts M2/M3=0。

**■ 不接触**: production 0・env 変更 0・review UI/route 0・Home/PlanClient 0・PRM user-facing 有効化 0・test row 0（local smoke は throwaway 内・staging に 0）。
**■ 次（stop gate）**: review flow route/UI・PRM persistence 有効化・第二の自己 surfacing。

### 10.33 A1-7-33 詳細設計（review flow route + UI）— stop gate

A1-7-32（M2/M3 apply）後の review flow 詳細設計。**実装は CEO 承認 stop gate**。詳細: docs/prm-review-flow-route-design.md。

**■ route**: POST /api/reality/review-decision（{proposalFingerprint, decision, reviewer}・**snapshot は client から受けず server 再導出**）→ reader→aggregate→project→候補探索→validateReview→toReviewDecisionRecord(server snapshot)→M2 insert→id→approve なら M3 entry insert(review_decision_id FK)→redacted return。flag `REALITY_REVIEW_WRITE` default OFF。

**■ integrity**: snapshot server 再導出(client 注入不可)・certainty ≤tentative+DB CHECK・reviewRequired(M3 は M2 id 経由のみ)・owner-RLS・fail-open・no raw。

**■ atomicity（CEO 判断）**: 逐次 best-effort(M2 source・M3 再導出可)推奨 v1 / RPC atomic。

**■ UI**: dev-learning-observation 拡張(operator-only・flag-gated・dev 限定)。

**■ 実装 slice（承認後）**: flag→route core+test(fake repo)→route handler→UI buttons→staging controlled smoke(cleanup)。

**■ CEO 判断**: reviewer scope(operator-only 推奨)/UI(observation 拡張 推奨)/atomicity(逐次推奨)/実装 GO。

**■ 不接触**: 本 slice docs のみ・実装 0。次 stop gate: review flow 実装・第二の自己 surfacing(A1-7-34)・PRM user-facing。

### 10.34 A1-7-33 実装（review flow route + UI）— operator review → M2/M3

A1-7-33: review flow を実装（CEO 承認・自律・a〜d 決定済 operator-only/observation 拡張/逐次 best-effort but partial failure 明示/GO）。operator が candidate proposal を review→M2 insert→approve なら M3 entry。staging controlled smoke PASS。**flag default OFF・production 不接触・第二の自己 surfacing なし**。

**■ 追加/変更**:
- flag `REALITY_REVIEW_WRITE`（server・default OFF）+ `NEXT_PUBLIC_REALITY_REVIEW_UI`（client・default OFF）。
- `review-flow-route-core.ts`（pure・executeReviewDecision: **server 再導出 proposal**→fingerprint 解決→blocked fail-closed→M2 insert→approve なら M3[review_decision_id FK]→**partial failure 明示** redacted）+ 9 tests。
- `app/api/reality/review-decision/route.ts`（auth・flag OFF→disabled・reader 再導出→M2/M3 Supabase repo→core）。
- `ReviewButtons.tsx`（**別 file=fixture preview client を route-free 維持**）+ LearningReportPreviewClient(reviewEnabled prop)+ observation page(reviewEnabled=realityReviewUi)。

**■ staging smoke（全 PASS）**: 5 evening dismiss → candidate band:evening:dismiss → review approve(HTTP 200 reviewed=true modelEntryCreated=true partialFailure=null)→ M2 1(approve/operator)+M3 1(review_decision_id=M2 id・tendency non_adoption・certainty≤tentative・no raw)→cleanup events/M2/M3/seeds 全 0。flag 非永続(staging OFF)。

**■ 守った条件**: client snapshot 不信(server 再導出)・blocked fail-closed・approve=M2+M3/reject·defer=M2 のみ・M3 必ず review_decision_id・certainty no high・no raw/personality・owner-RLS・redacted・flag OFF 不変・**partial failure 隠さない**。

**■ 不接触**: production 0・env 永続 0(flag process env のみ)・Home/PlanClient 0・第二の自己 surfacing 0。tsc 55・reality 827 PASS。

### 10.35 A1-7-34 設計（第二の自己 surfacing）— 最重要 stop gate・設計のみ

A1-7-33（review flow）後の第二の自己 surfacing 設計。**実装一切なし**（実ユーザーに tendency を見せる=PRM user-facing 有効化=最重要 stop gate）。詳細: docs/prm-second-self-surfacing-design.md。

**■ 何を**: M3 review 済 tendency(user_visible・非 retracted)を**ユーザー本人に返す**=「自分って、そういう人間だったのか」(Aneurasync 哲学の核)。
**■ framing**: tendency-not-trait・非断定(certainty≤tentative)・counter/stillPossible 併記・narrative・correctable(user_correction=ユーザーが第二の自己を所有)。
**■ 革新**: co-created living model(events→review→model→user confirm/correct→強化)+Alter 連結(M3 tendency を判断エンジンに注入=「未来の自分が先に試す」の実体)+意味ある瞬間に gentle に。
**■ pipeline**: M3 reader(owner-RLS read-only column-restricted)→tendency framing(pure 非断定)→user confirm/correct route(user_correction 更新)→user-facing component→Alter 注入(任意)。
**■ flag/gating**: REALITY_SECOND_SELF_SURFACE default OFF・operator dogfood→test user→broader(各段 CEO)・production hard block。
**■ CEO 判断**: (a)いつ surface (b)どこに置く(Stargazer/Alter/専用) (c)copy tone (d)Alter 連結 (e)confirm/correct loop (f)実装 GO=最重要 gate。
**■ 不接触**: 本 slice docs のみ・実装 0。

### 10.36 A1-7-34 実装（Second Self read-only surface preview）— operator-only dev-preview

A1-7-34: M3 review 済 tendency を **operator-only dev-preview で非断定表示**（read-only・correction write なし・Alter/Home/Stargazer 本線なし）。staging smoke PASS。CEO 判断 a〜f（reviewed M3 存在時のみ・dev preview・観察トーン・Alter なし・correction design のみ・read-only GO）。

**■ 追加（5 lib/app + 1 test）**:
- flag `REALITY_SECOND_SELF_SURFACE`（server・default OFF）。
- `prm-model-entry-read.ts`（pure・M3 read row→SecondSelfTendency・column-restricted・certainty≤tentative）。
- `supabase-prm-model-entry-reader.ts`（server-only・owner-RLS・user_visible∧非retracted・read-only・fail-open）。
- `second-self-presenter.ts`（pure・**非断定・観察・共同編集トーン**・context→読める文・direction→傾向・counter/stillPossible 併記・empty state）。
- `dev-second-self/page.tsx`（triple-guard+auth+flag→reader→presenter）+ `SecondSelfPreviewClient.tsx`（cards+empty+「直す」disabled=write なし）。
- `realitySecondSelfPresenter.test.ts`（14 tests）。

**■ staging smoke（PASS）**: review approve→M3 1→dev-second-self HTTP 200・card 1・観測文「夜の予定では、見送りやすい傾向が見えています」・**断定/trait なし**→cleanup events/M2/M3/seeds 全 0。flag 非永続。

**■ 守った条件**: certainty low/tentative のみ・tendency-not-trait・counter/stillPossible 併記・**断定しない観測トーン**・no raw/seedRef/personality/trait/fixed_preference・owner-RLS・**correction write なし**・no Alter/Home/Stargazer 本線・no notification・empty state・flag OFF read 0。

**■ 不接触**: production 0・Vercel/deploy/remote 0・correction write 0・Alter 連結 0・Home/PlanClient/Stargazer 本線 0・notification 0。tsc 55・reality 841 PASS。

**■ 次（stop gate）**: A1-7-35 Confirm/Correct Loop Design（設計のみ）・correction write 実装/Alter 連結/本線接続/本格 user-facing は stop gate。

> A1-5-0…§10.35 / **A1-7-34 実装 Second Self read-only surface preview（§10.36・**M3 review 済 tendency を operator-only dev-preview で非断定表示・read-only・correction write なし・Alter/Home/Stargazer 本線なし・staging smoke PASS・CEO 判断 a〜f に基づく**・A1-7-34 完了）。追加 5 lib/app+1 test: flag REALITY_SECOND_SELF_SURFACE(server default OFF)・prm-model-entry-read.ts(pure・PrmModelEntryReadRow→SecondSelfTendency・PRM_MODEL_ENTRY_READ_COLUMNS column-restricted raw/user_id/id/decay 非 select・certainty≤tentative・不正 direction/certainty skip)・supabase-prm-model-entry-reader.ts(server-only・createSupabasePrmModelEntryReader・owner-RLS・eq(user_id)+eq(user_visible,true)+is(retracted_at,null)・read-only select のみ・service_role 禁止・fail-open [])・second-self-presenter.ts(pure・presentTendency/presentSecondSelf・context_dimension/value→人間が読める文脈句・tendency_direction→非断定傾向動詞 取り入れ/見送り/後回し やすい・observation=…では…傾向が見えています・certaintyNote≤tentative・counterNote/stillPossibleNote 併記・provenanceNote reviewed・correctable copy・correctionState・emptyNote)・dev-second-self/page.tsx(triple-guard isCandidateActionsPreviewHostAllowed+auth+flag realitySecondSelfSurface→reader→presentSecondSelf→client)・SecondSelfPreviewClient.tsx(Card 非断定表示+empty state+「直す（準備中）」disabled button=write しない)・realitySecondSelfPresenter.test.ts(14: row→tendency/不正 skip/read 列 raw なし/presenter 断定しない trait 出さない/counter·stillPossible 併記/counter 0 null/certainty note/provenance/correctable/全 direction 断定なし/correctionState/view empty/reader mock owner-RLS eq·is/fail-open)。staging smoke PASS: 5 evening dismiss seed→dev server(REALITY_REVIEW_WRITE+REALITY_SECOND_SELF_SURFACE+REALITY_CANDIDATE_ACTIONS_DEV_HOST=true process env)→Playwright login→dismiss 5/5→review approve(modelEntryCreated=true M3 1)→/plan/dev-second-self HTTP 200・second-self-card 1・観測文「夜の予定では、見送りやすい傾向が見えています」含・断定(あなたは〜です)/trait(性格/怠惰)なし→cleanup events/M2/M3/seeds 全 0・flag 非永続。守った条件: certainty low/tentative のみ表示・tendency-not-trait(ある状況で出やすい傾向)・counter/stillPossible 必ず併記・断定でなく観測トーン・no raw/seedRef/utterance/personality/trait/fixed_preference・owner-RLS service_role 禁止・correction write しない(導線 copy+disabled button のみ)・Home/PlanClient/Stargazer 本線接続なし・Alter 連結なし・notification/push なし・empty state あり・flag OFF read 0。不接触: production 0・Vercel/deploy/remote push/PR 0・correction write 0・Alter 連結 0・Home/PlanClient/Stargazer 本線 0・notification 0・env 永続 0(flag process env のみ)。tsc 55・reality 51 files 841 PASS。次 stop gate: A1-7-35 Confirm/Correct Loop Design(設計のみ)・correction write 実装/Alter 連結/本線接続/本格 user-facing 公開**。**M3 を見せる表現面(operator-only dev-preview read-only)を実装+staging smoke PASS・非断定観察トーンで tendency 表示・「夜の予定では見送りやすい傾向が見えています」・trait/断定なし・counter/stillPossible 併記・correction write せず導線のみ・次は A1-7-35 confirm/correct loop は設計のみで停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.34 / **A1-7-34 第二の自己 Surfacing 設計（§10.35・**M3 review 済 tendency を実ユーザーに返す=「自分って、そういう人間だったのか」Aneurasync 哲学の核・実装一切なし・最重要 stop gate(PRM user-facing 有効化)**・A1-7-34 設計提出→停止）。詳細 docs/prm-second-self-surfacing-design.md。何を: M3 prm_model_entries(review 済 tendency・user_visible・非 retracted)を本人に返す。framing(断定しない・尊厳・自己認識): tendency-not-trait(「午後の提案を見送りやすい傾向かも」≠「怠惰」)・非断定 certainty≤tentative 表示・counter_count+still_possible 併記(過断定防止をユーザーにも見せる)・narrative(思慮深い友人の観察)・correctable(user_correction 導線=ユーザーが第二の自己を所有)。革新: co-created living model(events→review→model→user confirm/correct=directly observed 最強 signal で model 強化・loop を閉じる)+Alter 連結(Human OS 北極星=M3 tendency を alterHomeAdapter 判断エンジンに注入し本人モデルで判断=「未来の自分が先に試す」の実体)+timing(dashboard でなく reflection 等の意味ある瞬間に gentle に)。pipeline(設計のみ): M3 reader(server-only owner-RLS read-only column-restricted raw 非 select)→tendency framing(pure 非断定 controlled copy 断定語禁止)→user confirm/correct route(M3 user_correction owner 更新 flag-gated)→user-facing component(Stargazer 深層観測/Alter 領域/専用 view・CEO 配置判断)→Alter 注入(任意後続)。flag/gating: REALITY_SECOND_SELF_SURFACE server default OFF+client UI flag・段階 operator dogfood→少数 test user 招待→broader(各段 CEO)・production hard block。安全契約全維持: read-only(surfacing は M3 mutate しない user_correction のみ owner 更新)・certainty no high≤tentative 表示・counter/stillPossible 併記・no raw/seedRef/personality・owner-RLS service_role 禁止・redacted・tendency-not-trait/尊厳/correctable(哲学絶対原則)。CEO 判断(実装前最重要): (a)いつ surface(dogfood→test user→broader 各 gate)(b)どこ(Stargazer/Alter/専用 view)(c)copy tone(自分って そういう人間だったのか を起こす表現)(d)Alter 連結含めるか(e)user confirm/correct loop を v1 に含めるか(f)実装 GO=user-facing 公開=最重要 stop gate 越え。実装最小 slice(承認後): M3 reader+tendency framing pure+tests→user-facing component flag-gated operator 先行→confirm/correct route→staging dogfood で operator が自分の第二の自己を見る→CEO 評価→段階公開。不接触: 本 slice 設計のみ・実装 0・user-facing 公開 0・production 0・Alter 本線注入 0・実ユーザー tendency 表示 0**。**第二の自己 surfacing を設計提出(Aneurasync 哲学の核「自分って そういう人間だったのか」)・co-created living model+Alter 連結の革新方向・tendency-not-trait/非断定/correctable/尊厳を絶対維持・実装は CEO 最重要 stop gate ゆえ設計のみで停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.33 / **A1-7-33 実装 Review Flow Route + UI（§10.34・**operator が candidate proposal を review→M2 insert→approve なら M3 entry(review_decision_id FK)・server 再導出 proposal(client snapshot 不信)・partial failure 明示・staging controlled smoke PASS・flag default OFF・production/第二の自己 surfacing 不接触**・A1-7-33 完了）。追加/変更: flag REALITY_REVIEW_WRITE(server default OFF)+NEXT_PUBLIC_REALITY_REVIEW_UI(client default OFF)・review-flow-route-core.ts(pure executeReviewDecision={proposals server 再導出,rawRequest,m2,m3,nowMs}→parseRequest(fingerprint+decision・unknown_decision fail-closed)→proposals.find(proposalFingerprint===fp)(not_found fail-closed)→validateReview(blocked→not_reviewable fail-closed)→toReviewDecisionRecord(operator 固定・server snapshot・reviewedAtISO 注入)→reviewDecisionRecordToInsertRow→m2.insert→ids[0]→reject/defer は M2 のみ・approve は approvedReviewToModelEntryRow({reviewDecisionId,decision,snapshot})→m3.insert→ReviewFlowResult{ok,reviewed,decision,modelEntryCreated,reason,partialFailure}・M2 fail→fail-closed/M3 fail→partialFailure=model_entry_insert_failed 隠さない)+9 tests・app/api/reality/review-decision/route.ts(POST・auth getUser・flag OFF→{disabled}write 0・reader readLearningEvents→aggregateDryRunEvents(dedupeSameDay)→projectPrmDryRun で再導出→createSupabasePrmReviewDecisionRepository/createSupabasePrmModelEntryRepository→executeReviewDecision→redacted return)・ReviewButtons.tsx(別 file・fetch はここだけ=fixture preview client を route-free 維持・operator review approve/reject/defer→POST→partial failure 表示)・LearningReportPreviewClient.tsx(reviewEnabled prop・ProposalCard が candidate に ReviewButtons)・dev-learning-observation page(reviewEnabled=PLAN_FLAGS.realityReviewUi)。staging controlled smoke 全 PASS: 5 evening dismiss-able seed→Playwright login→candidate-action に dismiss 5/5 POST(5 dismiss events band evening)→review-decision に approve POST(HTTP 200 reviewed=true modelEntryCreated=true reason=ok partialFailure=null)→verify M2 1(proposal_fingerprint band:evening:dismiss/decision approve/reviewer operator/certainty≤tentative)+M3 1(review_decision_id=M2 id/tendency_direction non_adoption/certainty≤tentative/no raw)→cleanup events/M2/M3/seeds 全 0・REALITY_REVIEW_WRITE は dev server process env のみ非永続 staging OFF。守った条件: client snapshot 不信(server 再導出)・blocked fail-closed・approve=M2+M3/reject·defer=M2 のみ・M3 必ず review_decision_id(reviewRequired)・certainty no high(≤tentative+DB CHECK)・no raw/seedRef/personality・service_role 禁止 owner-RLS・redacted return・flag OFF で write 0 既存不変・partial failure 隠さない。不接触: production 0・Vercel/deploy/remote/PR 0・env 永続 0(flag process env のみ)・Home/PlanClient 0・第二の自己 surfacing 実装 0。tsc 55・reality 50 files 827 PASS。次 stop gate: 第二の自己 surfacing(A1-7-34)・PRM user-facing 有効化**。**review flow(route core+handler+UI)実装+staging smoke PASS・operator review で M2+M3 稼働・server 再導出で integrity・partial failure 明示・reviewRequired/certainty no high 維持・flag OFF 不変・次は A1-7-34 第二の自己 surfacing は設計のみで停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.32 / **A1-7-33 Review Flow Route + UI 詳細設計（§10.33・**M2/M3 apply 後の review flow 詳細設計・実装は CEO 承認 stop gate・設計のみ**・A1-7-33 設計提出）。詳細 docs/prm-review-flow-route-design.md。route POST /api/reality/review-decision({proposalFingerprint,decision,reviewer}・snapshot は client から受けず server 再導出=integrity)→auth owner-RLS→flag REALITY_REVIEW_WRITE OFF なら no-op→reader(A1-7-26)→aggregateDryRunEvents(dedupeSameDay)→projectPrmDryRun→proposalFingerprint で candidate 探索(無/blocked→fail-closed)→validateReview(A1-7-7)→toReviewDecisionRecord(A1-7-8 server snapshot・reviewedAtISO route now)→reviewDecisionRecordToInsertRow(A1-7-30)→M2 repo insert→id→decision=approve なら approvedReviewToModelEntryRow({reviewDecisionId:id,decision,snapshot})→M3 repo insert→redacted return{ok,reviewed,modelEntry}。integrity: snapshot server 再導出(client が counts/certainty/fingerprint 偽造不可)・certainty projection≤tentative+DB CHECK で high 不可・reviewRequired(M3 は M2 id=review_decision_id FK 経由のみ・mapper+DB FK で二重)・owner-RLS service_role 禁止・no raw/seedRef/personality・tendency-not-trait・fail-open redacted。atomicity CEO 判断: 逐次 best-effort(M2 source of truth・M3 失敗は approved M2 から再導出可)推奨 v1 / RPC atomic。UI: dev-learning-observation(A1-7-28 triple-guard)の candidate proposal に approve/reject/defer ボタン(operator-only・REALITY_REVIEW_WRITE+NEXT_PUBLIC_REALITY_REVIEW_UI flag-gated・dev 限定)。実装最小 slice(承認後): flag→route core+unit test(fake M2/M3 repo)→route handler(auth/flag/M2→M3 配線)→UI buttons→staging controlled smoke(operator 1 approve→M2 1+M3 1→cleanup)。CEO 判断: (a)reviewer scope operator-only 先行推奨 or user も(b)UI observation 拡張推奨 or dashboard(c)atomicity 逐次推奨 or RPC(d)実装 GO=stop gate 越え判断。不接触: 本 slice docs のみ実装 0。次 stop gate: review flow 実装・第二の自己 surfacing(A1-7-34・実ユーザーに tendency 見せる最重要 gate)・PRM user-facing 有効化**。**review flow(route+UI)を実装可能な詳細設計に・snapshot server 再導出で integrity・reviewRequired を route+mapper+FK で三重担保・operator-only/observation 拡張/逐次 atomicity 推奨・実装は CEO stop gate ゆえ設計提出して停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.31 / **A1-7-32 M2/M3 Local Smoke + Staging Apply + Post-Apply Smoke（§10.32・**M2 prm_review_decisions+M3 prm_model_entries を staging に apply(M2→M3 順 FK 依存)・local smoke 19 PASS+post-apply smoke 全 PASS・flag/review UI/PRM 有効化なし・production 不接触**・A1-7-32 完了）。local smoke(throwaway postgres:17 全 19 PASS): tables/RLS/M2 policies 3(UPDATE 不在 append-only)/M3 policies 4(UPDATE あり mutable)/indexes M2·M3≥2/M3 updated_at trigger/forbidden columns 不在(raw/seedRef/utterance/personality/trait/fixed_preference)/M2·M3 certainty=high reject/M2 decision bogus reject/M3 valid review_decision_id INSERT/M3 review_decision_id NULL→NOT NULL reject(reviewRequired)/M3 不在 review_decision_id→FK reject(reviewRequired)/M3 decay>1 reject/M2 cross-user INSERT reject(RLS)/M2 owner INSERT/M2 UPDATE 0 rows(append-only)/M2 cross-user SELECT 0/rollback clean DROP(M3→M2 順)。staging: 直前確認 linked=hjcrvndumgiovyfdacwc(staging)・active URL に production ref aljavfujeqcwnqryjmhl なし・migration list pending=M2(20260609120000)+M3(20260609130000)のみ(M1 適用済)→db push --linked --dry-run(Would push M2,M3 のみ)→db push --linked --yes(Applying M2→M3 順・Finished・error なし)→migration list で M2/M3 両方 Remote 適用済→post-apply smoke(db dump --linked read-only): M2 certainty CHECK low/tentative・decision/reviewer/source_dimension/dominant_action/evidence·counter CHECK・still_possible text[]、M3 review_decision_id uuid NOT NULL+FK REFERENCES prm_review_decisions(id) ON DELETE CASCADE(reviewRequired)・certainty CHECK low/tentative・tendency_direction CHECK・decay_weight CHECK 0..1・supersedes self FK SET NULL・RLS enable 2・M2 policies SELECT/INSERT/DELETE 3(UPDATE 不在 append-only)・M3 policies SELECT/INSERT/UPDATE/DELETE 4・forbidden columns なし・owner で M2/M3 count=0(test row 作らず staging 0)。不接触: production apply 0・env 変更 0・Vercel/deploy/remote push/PR 0・review UI/route 0・Home/PlanClient 0・PRM user-facing 有効化 0・test row 0(local smoke は throwaway container 内で container 破棄・staging には insert せず count 0)。次(全 CEO stop gate): review flow route/UI・PRM model persistence 実ユーザー有効化・第二の自己 surfacing**。**M2/M3 を staging に apply・local 19 smoke+staging post-apply で certainty no high と reviewRequired(review_decision_id NOT NULL FK)を構造的に検証・append-only(M2)/mutable(M3)/RLS owner-only/forbidden columns なし・staging row 0・production 不接触・次は review flow=CEO stop gate**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.30 / **A1-7-31+ Review-to-Model Flow 次フェーズ設計（§10.31・**A1-7-30 後の次フェーズ設計・実装は全て CEO 承認 stop gate(M2/M3 apply/review UI route/PRM persistence 有効化)・設計のみ**・A1-7-31 設計提出）。詳細 docs/prm-review-to-model-flow-design.md。phases(全 gate): A1-7-31 M2/M3 staging apply(M2→M3 順 FK 依存・M1 同手順 migration list→dry-run→db push→smoke)/A1-7-32 review flow route+UI(人間が proposal candidate を review→decision approve/reject/defer→M2 insert[A1-7-30 repo]→approve なら M3 entry insert[review_decision_id FK]・REALITY_REVIEW_WRITE default OFF flag-gated fail-open)/A1-7-33 PRM model 読み+第二の自己 surfacing(M3 review 済 tendency を user が見る・tendency framing 断定しない・certainty/stillPossible/user_correction 併記=実ユーザー有効化 CEO 明示 stop gate)。CEO 仕様判断: ①reviewer(operator-only 先行推奨=品質確認後 user review 開く/user も即)②UI(dev-learning-observation 拡張 dev 限定/専用 operator dashboard)③第二の自己 surfacing 公開判断(Aneurasync 哲学の核・最慎重)。推奨順序: apply→operator review(flag OFF)→dogfood で M2/M3 蓄積観測→user 公開(最慎重)・全フェーズで reviewRequired(自動学習なし)/certainty no high/raw 非保存/owner-RLS/tendency-not-trait/可逆(supersedes/retracted/user_correction)/production 不接触 維持。不接触: 本 slice docs のみ実装 0。次に CEO が決めるべきこと: (a)M2/M3 staging apply 承認(b)reviewer と UI(c)第二の自己 surfacing 公開判断**。**review-to-model flow の次フェーズを設計提出・3 phase(apply/review flow/第二の自己 surfacing)全て CEO stop gate・operator-only review 先行を推奨・全フェーズで安全契約維持・実装は CEO 判断待ちで停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.29 / **A1-7-30 M2/M3 Repository Contract + Fake + Supabase Adapter（unwired・§10.30・**M2/M3 の mapper+repository interface+fake+Supabase adapter・全 unwired・no apply/route/UI・reviewRequired/certainty no high/no raw-seedRef-personality/owner-RLS/fail-open/全契約維持**・A1-7-30 完了）。追加 6 lib+1 test(prod 未参照): M2=prm-review-decision-write.ts(reviewDecisionRecordToInsertRow=valid review[valid∧decision∧reviewedAtISO]のみ row・無効 null・certainty≤tentative 型・raw/seedRef/personality 非保持・PrmReviewDecisionRepository interface・result{ok,inserted,ids})/fake-prm-review-decision-repository.ts(persisted:false marker・id 返却 fake-review-N・fail-open)/supabase-prm-review-decision-repository.ts(server-only・createSupabasePrmReviewDecisionRepository(client,userId)・user_id 付与・.select(id)で M3 FK 用 id 返却・error/例外→fail-open・service_role 禁止)、M3=prm-model-entry-write.ts(approvedReviewToModelEntryRow=review_decision_id 必須[空→null]+approve のみ[reject/defer→null]=reviewRequired を mapper で担保・tendency_direction 写像 accept→adoption/dismiss→non_adoption/later→deferral・不正 dominantAction→null・certainty≤tentative・decay 1.0・user_visible true・supersedes/user_correction null・PrmModelEntryRepository interface・result)/fake-prm-model-entry-repository.ts/supabase-prm-model-entry-repository.ts(server-only・user-RLS・fail-open)、realityPrmReviewModelWrite.test.ts(17 tests=M2 valid のみ row/certainty high 型不可/invalid·null skip/records filter/fake id·fail-open/Supabase user_id·id·error·throw·空 + M3 reviewRequired review_decision_id 空→null/approve のみ/tendency 写像/不正 dominantAction null/fake/Supabase user_id·review_decision_id 保持·fail-open)。契約維持: reviewRequired(M2 valid review のみ・M3 review_decision_id 必須+approve のみ)・certainty high 型不可能・personality/trait/fixed_preference 列なし・raw/seedRef/utterance を payload/return に出さない(NO_RAW regex 検査)・user-RLS service_role 禁止・fail-open・counterCount/stillPossible/snapshot/user_correction/supersedes/retracted 契約保持。不接触: DB apply 0/route 0/UI 0/Home/PlanClient 0/production/remote/env 0/PRM persistence 有効化 0。tsc 55・reality 49 files 818 PASS。次(全 stop gate): M2/M3 apply・review UI/route・PRM persistence 有効化**。**M2/M3 write 側(mapper+fake+Supabase adapter)を未配線実装・reviewRequired を mapper(M3 review_decision_id 必須+approve のみ)で担保・certainty high 型不可・no raw/personality・全 unwired・次は review UI/route と M2/M3 apply=CEO stop gate ゆえ設計提出して停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.28 / **A1-7-29 M3 prm_model_entries Migration Draft + Static Audit（§10.29・**review 済 tendency=PRM 本体=第二の自己の migration draft+design+静的監査・3-table アーキテクチャ設計完成(M1 live+M2 draft+M3 draft)・apply しない(M2→M3 順・別 CEO gate)**・A1-7-29 完了）。追加: supabase/migrations/20260609130000_create_prm_model_entries.sql(draft 未 apply)・docs/prm-m3-model-entries-design.md。schema: id/user_id(FK auth.users CASCADE)/context_dimension(CHECK band·durationBucket·confidence·source)/context_value/tendency_direction(CHECK adoption·non_adoption·deferral=傾向 trait でない)/favored_hypothesis/still_possible TEXT[]/evidence_count·counter_count(CHECK≥0)/certainty(CHECK low·tentative=high を INSERT/UPDATE 両方で不可能化)/decay_weight REAL(CHECK 0..1・recency)/review_decision_id UUID NOT NULL FK→prm_review_decisions(=reviewRequired の構造的実体・review なしに entry INSERT 不能=自動学習禁止)/supersedes_id(self FK SET NULL・versioning)/user_visible(default true)/user_correction(CHECK null/rejected/direction_adjusted/context_refined=structured override・raw でない)/created·updated·retracted_at(論理削除)・index 2(user+context/user WHERE retracted_at NULL=active)・updated_at trigger(BEFORE UPDATE)・RLS owner SELECT/INSERT/UPDATE/DELETE。過断定防止 5 重 gate を全て schema 構造化: reviewRequired FK NOT NULL(M3 最終担保)+certainty CHECK no high+counter_count+still_possible[]+tendency-not-trait(trait 列なし)・可逆 supersedes/retracted/user_correction・recency decay_weight。static audit(A1-7-12/27 同手法): correct/complete/safe・finding 6 全非 blocker(①UPDATE 許可=M1/M2 append-only と違い M3 は retract/correction/decay 更新が本質・CHECK が UPDATE でも certainty high 禁止②supersedes SET NULL③favored/context_value enum なし=controlled code④review_decision CASCADE=provenance 整合⑤decay app/cron 更新 or read-time 計算⑥down revert SQL header)。3-table アーキテクチャ完成: M1 events(適用済 dogfood)→aggregate→proposal(派生)→review(M2 draft)→model entry(M3 draft・M2 に FK)→第二の自己 read。不接触: apply 0/db push 0/M1·M2 編集 0/route/Home/persistence 0/production/env/remote 0。次段階: M2/M3 apply(M2→M3 順・別 CEO gate)/M2·M3 repository/review UI route**。**PRM 永続化 3-table(M1 live+M2/M3 draft)設計完成・M3=review 済 tendency PRM 本体・review_decision_id NOT NULL FK で自動学習を構造的に禁止・certainty CHECK no high を全層・apply は別 CEO gate・次は M2/M3 repository or review flow**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.27 / **A1-7-28 Live Learning Observation Dev-Preview（§10.28・**dogfood で蓄積する learning を /plan/dev-learning-observation(triple-guard+auth owner-only)で可視化・A1-7-26 reader で staging events 読み aggregate(dedupeSameDay)→project→render・read-only・PRM 保存しない・製品入口でない**・A1-7-28 完了）。追加/変更: dev-learning-observation/page.tsx(新 server=triple-guard[REALITY_CANDIDATE_ACTIONS_DEV_HOST+staging ref+非 production]→supabaseServer auth→createSupabasePrmLearningEventReader→readLearningEvents→aggregateDryRunEvents({dedupeSameDay:true})→projectPrmDryRun→LearningReportPreviewClient(live)・未 auth は空 report)・LearningReportPreviewClient.tsx(optional props 化={report?,projection?,live?}・未指定なら fixture 既存挙動不変・指定なら live)。検証: tsc 55・既存 preview test 9 PASS(regression なし)・reality 801 PASS・runtime render check(dev server REALITY_CANDIDATE_ACTIONS_DEV_HOST=true+Playwright login→/plan/dev-learning-observation HTTP 200・learning-report testid present・Live Learning Observation 表示・未 auth は 307 proxy gate)。安全: read-only(reader select のみ)・owner-only RLS・PRM 保存しない・triple-guard で production 構造的不可視・raw/seedRef 非出(reader column-restricted)。不接触: DB write 0・migration 0・production 0・env 永続 0(dev-host flag は dev server process env のみ)・Home/PlanClient 0。tsc 55・reality 801 PASS**。**dogfood learning を dev-preview で可視化・reader→aggregate(同日 dedup)→project→render・triple-guard+auth owner-only・read-only PRM 非保存・runtime render 200 確認・現在空(0 events)だが dogfood 蓄積で patterns 表示・次は M2 repository / M3 design / M2 apply gate**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.26 / **A1-7-27 M2 prm_review_decisions Migration Draft + Static Audit（§10.27・**人間の review 決定ログ=PRM model への唯一入口の migration draft+design+静的監査・apply しない(別 CEO gate・M1 同手順)**・A1-7-27 完了）。追加: supabase/migrations/20260609120000_create_prm_review_decisions.sql(draft 未 apply)・docs/prm-m2-review-decisions-design.md。schema: id/user_id(FK auth.users CASCADE)/proposal_fingerprint(=sourceDimension:sourceValue:dominantAction)/decision(CHECK approve/reject/defer=A1-7-7 ReviewDecisionKind)/reviewer(CHECK operator/user=ReviewerKind)/snapshot flat 列(source_dimension CHECK band·durationBucket·confidence·source/source_value/dominant_action CHECK accept·dismiss·later/favored_hypothesis/still_possible TEXT[]/evidence_count·counter_count CHECK≥0)/certainty CHECK in(low,tentative)=high を DB で構造的に不可能化(過断定防止 gate を persistence 層導入)/reviewed_at/created_at・index 2(user+fingerprint+reviewed_at DESC=latest 照会/user+reviewed_at DESC=recency)・RLS owner SELECT/INSERT/DELETE・UPDATE policy 不在=append-only(再 review は新 row latest 有効)。設計判断: snapshot flat 列(jsonb 不使用で raw 混入余地排除・CHECK 強制 structured-only)・effect は decisionEffect 純関数ゆえ非保存・personality/trait 列なし。static audit(A1-7-12 同手法): correct/complete/safe・finding 6 全非 blocker(fingerprint unique なし=append-only 正/favored·value enum なし=controlled code/reviewed_at app validate/self-poisoning owner-only+reviewRequired は設計/still_possible code 配列/down revert SQL header)。過断定防止 5 重 gate の M2 担当=certainty CHECK no high+reviewRequired+counter_count+still_possible+tendency-not-trait。不接触: apply 0/db push 0/local reset 0/M3 0/route/Home/persistence 0/production/env/remote 0。次段階: M2 apply(別 CEO gate・local smoke→staging)/M2 repository(ReviewDecisionRecord→insert mapper)/review UI route/M3 prm_model_entries design**。**M2 review 決定ログを draft+静的監査・certainty CHECK no high で過断定を persistence 層で構造的に不可能化・append-only/owner-only/structured-only/snapshot flat 列・apply は別 CEO gate・次は M2 repository or M3 design**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.25 / **A1-7-26 PRM Learning Event Read Mapper + Supabase Reader（§10.26・**dogfood で蓄積する prm_learning_events を観測可能にする read 側・pure read mapper+server-only reader+tests・未配線**・A1-7-26 完了）。追加 2 lib+1 test(prod 未参照): prm-learning-event-read.ts(pure・PrmLearningEventReadRow=context 列のみ raw/seedRef/user_id/id/signal なし・PRM_LEARNING_EVENT_READ_COLUMNS・prmLearningEventRowToDryRunEvent=ctx 再構築→toDryRunLearningEvent で insert と同一 helper faithful・prmLearningEventRowsToDryRunEvents=不正 action skip)・supabase-prm-learning-event-reader.ts(server-only・createSupabasePrmLearningEventReader(client,userId)→owner events を column-restricted read→DryRunLearningEvent[]・read-only select/eq/order/limit・user-RLS・service_role 禁止・fail-open [])・realityPrmLearningEventRead.test.ts(8 tests=row→event/insert→read round-trip 完全一致/不正 action skip/read 列に raw 等なし/reader rows→events+table/cols/eq 正しい/error→[]/null→[]/read events→aggregate 観測)。観測 loop: reader→DryRunLearningEvent[]→aggregateDryRunEvents({dedupeSameDay:true})→tentative patterns→projectPrmDryRun→proposals(dry-run 同形 PRM model でない)。安全: signal/hypotheses は action から再導出(stored signal 読まず単一 source)・read 列に raw/seedRef/user_id/id/signal なし・insert→read round-trip で event 完全一致・fail-open。不接触: route/Home/PlanClient/DB write/migration/production/env/remote 0。tsc 55・reality 801 PASS**。**dogfood events を読み aggregation→tentative pattern で観測する read 側を pure mapper+server-only reader で構築・round-trip 完全一致で faithful・未配線・次は dev-preview 観測 UI / M2 design**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.24 / **A1-7-25 Persistent Staging Flag ON + Dogfood Enablement（§10.25・**.env.local(staging local-dev env・Vercel/production 不接触)に REALITY_LEARNING_EVENT_WRITE=true 追加・inline env なし dev server で route smoke 3 件確認=flag が .env.local 由来で persistent ON・limited dogfood 有効化・CEO 自律方針に基づき実行**・A1-7-25 完了）。検証(staging 全 PASS): dev server を inline env なしで起動→実 /api/reality/candidate-action に accept/dismiss/later POST(全 HTTP 200)→prm_learning_events 3 件 {adoption:1,non_adoption:1,deferral:1}・13 列・raw なし・user_id=auth・handle opaque・expires 180d・cleanup 0/0。rollback: .env.local の該当行削除で即 OFF。dogfood scope: local-dev-against-staging(staging 接続 dev で app 使用→learning event 蓄積)・owner-only RLS・structured-only・TTL 180d・user 削除可・production 無影響。不接触: production 0・Vercel/deploy 0・remote 0・M2/M3 0・Home/PlanClient 0・route/repo code 0(flag は env のみ・記録 docs-only)。次: live events 観測(aggregation dev-report)/M2・M3 design を自律継続**。**persistent staging flag ON を .env.local で実現(Vercel/production 不接触)・inline env なし dev server で 3 action 永続確認・dogfood 有効・rollback は行削除・production 無影響・次は live events 観測と M2/M3 design**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.23 / **A1-7-24 Route Wiring Fix + Route-Level Re-smoke（§10.24・**A1-7-23 bug 修正・context を status transition 前に capture・route-level re-smoke で accept→adoption/dismiss→non_adoption/later→deferral の 3 件 staging insert 確認・flag default OFF 維持・persistent flag ON 未実施**・A1-7-24 完了）。root cause: route.ts が loadActiveCandidateEntries を runCandidateActionRoute(transition)の後に呼ぶ→accept→consumed/dismiss→rejected で seed 非 active→glue が entry 見失い skip(later のみ書けた)。修正: candidate-action-route-support.ts に loadSurfaceableForActionWithEntries(client,userId,nowMs)→{surfaceable,entries}(1 read で surfaceable+pre-transition context 付き entries)追加・loadSurfaceableForAction は delegate(API 互換)/route.ts で transition 前に entries capture→glue に渡す・post-transition loadActiveCandidateEntries 削除・flag OFF→block skip(surfaceable load 従来と同一 1 read ゆえ挙動不変)/glue/repo/mapper/policy/flag/TTL 不変(await-and-swallow/fail-open/raw 非保存/expires 180d/route boundary time)。unit tests(realityCandidateActionRoute.test.ts +3): loadSurfaceableForActionWithEntries が surfaceable+entries(context)返し delegate 一致/seed なし→[]・[]/fix 検証 pre-transition entries で accept(→consumed)/dismiss(→rejected)/later すべて insert 1+signal 一致+raw なし。route-level re-smoke(staging 全 PASS): 実 /api/reality/candidate-action に accept/dismiss/later POST(全 HTTP 200)→prm_learning_events 3 件 {adoption:1,non_adoption:1,deferral:1}・13 列・raw なし・user_id=auth・handle opaque・expires 180d・flag process env のみ非永続・cleanup events 0/seeds 0。不接触: DB apply 0/Supabase apply 0/persistent env 変更 0(.env.local 不変 staging OFF)/production 0/Home/PlanClient 0/M2/M3 0/PRM model persistence 0。tsc 55・reality 793 PASS。次: persistent staging flag ON+dogfood は別 CEO gate**。**A1-7-23 bug を pre-transition entries capture で修正・route-level re-smoke で 3 action(adoption/non_adoption/deferral)全て staging 永続を確認・flag OFF 挙動不変・cleanup 0・persistent flag ON は次 CEO gate**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.22 / **A1-7-23 Route-Level Learning Write Smoke — BUG 発見（§10.23・**実 /api/reality/candidate-action route 経由 smoke が A1-7-17 wiring の real bug 検出・A1-7-23 は PASS せず・fix 後再実行**・A1-7-23 完了[bug 発見]）。検証結果: route POST 3 件すべて HTTP 200 resolved(accept/dismiss accepted=true・later accepted=true deferred=true)=status transition 成功(seed statuses consumed/rejected/active)・だが prm_learning_events は 1 件のみ(later→deferral)・accept/dismiss event が書かれない。root cause: route.ts の A1-7-17 wiring が loadActiveCandidateEntries を runCandidateActionRoute(status transition)の後に呼ぶ→accept→consumed/dismiss→rejected で seed 非 active→glue の entries.find(deriveCandidateHandle(seedRef)===handle)が見つからず if(!entry)return で write skip・later は transition なし→active のまま→found→write。影響: 現 wiring で accept(adoption)/dismiss(non_adoption)の learning event が永続化されない(later のみ)=A1-7 主目的を満たさない critical bug・route-level E2E でなければ検出不能(script smoke A1-7-22 は fabricated entries で masking)。fix 案(design・実装 CEO 承認): context を transition 前に capture・最小=loadActiveCandidateEntries を runCandidateActionRoute の前に移動し entries を glue に渡す・clean=loadSurfaceableForActionWithEntries で surfaceable+entries を 1 read。cleanup: 1 event+3 seeds 削除 count 0・dev server 停止・throwaway 削除・flag process env のみ(.env.local 不変 staging OFF)・production 0・M2/M3 0・route/Home/PlanClient 0・repo code 0。次: A1-7-24 fix slice→A1-7-23 再実行→それまで persistent flag ON に進まない**。**route-level E2E が accept/dismiss の learning write 欠落 bug を検出(glue が transition 後の active entry 再 read で acted candidate を見失う)・later のみ書かれた・fix=entry を transition 前 capture・cleanup 済・persistent flag ON は fix まで停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.20 / **A1-7-22 Staging Flag ON Controlled Insert Smoke（§10.22・**flag ON+staging DB write stop gate を CEO 承認で越え accept/dismiss/later 実 insert を staging で検証+cleanup・flag は process env のみ(.env.local/Vercel 非永続)=staging effectively OFF 維持・production 不接触**・A1-7-22 完了）。実行方式: throwaway tsx script(実行後削除・repo 非追加)・real pure helpers(decideLearningWrite→toDryRunLearningEvent→toPrmLearningEventInsertRow)+flag(REALITY_LEARNING_EVENT_WRITE=true process env→PLAN_FLAGS=true 確認)+staging auth user(USER_A)で repo の insert(row+user_id)忠実再現・server-only route/repo 不使用。smoke 結果(staging 全 PASS): target=staging・production ref 不在/flag env=true PLAN_FLAGS=true/accept→adoption・dismiss→non_adoption・later→deferral 各 1 件/row columns=M1 13 列のみ(禁止 column 不在・raw/seedRef 値なし)/user_id=auth/handle opaque c1:/expires_at−acted_at=180 日/RLS owner read 3・他人 user_id INSERT 拒否 42501/cleanup 後 smoke row 0。flag 判断: process env のみ ON で .env.local/Vercel 非永続→staging effectively OFF・推奨 OFF 維持(persistent 有効化は dogfood+監視を CEO 判断後)。不接触: production 0・M2/M3 0・route/Home/PlanClient 0・env 永続変更 0・repo code 0・staging test data 残さず。次: persistent flag ON+dogfood・M2・M3 は別 CEO gate**。**accept/dismiss/later が staging に実 insert され adoption/non_adoption/deferral 正しく永続・13 列のみで raw/seedRef なし・RLS owner-only(他人 INSERT 42501 拒否)・cleanup 0・flag 非永続で staging OFF 維持・production 不接触・次は persistent flag ON stop gate**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.19 / **A1-7-20 Preflight + A1-7-21 Staging M1 DB Apply（§10.20・**M1 prm_learning_events を staging(hjcrvndumgiovyfdacwc)に apply+post-apply smoke 全 PASS・DB apply stop gate を CEO 承認で越える・flag ON は未実施(REALITY_LEARNING_EVENT_WRITE=false 維持)・production 不接触**・A1-7-20/21 完了）。preflight(read-only): linked ref=staging・active URL=staging・production ref(aljavfujeqcwnqryjmhl)は deny-constant(SHIFT_SMOKE_PROD_URL_DENY/PRODUCTION_PROJECT_REF)のみで active 接続でない・migration list で M1 が唯一 pending・M1 file は smoke 以降未変更で DDL 一致・revert SQL header。apply: migration list(M1 のみ pending)→db push --linked --dry-run(Would push 20260608120000 のみ)→db push --linked --yes(apply exit 0)→post-apply migration list(M1 Remote 適用済)+db dump(read-only schema 検証)。post-apply smoke 全 PASS: table exists/13 columns/RLS ENABLE/policies SELECT·INSERT·DELETE(UPDATE policy 0=append-only)/indexes 2(user_acted/active_expiry)/CHECK 6(action·signal·band·confidence·duration·source)/禁止 column 不在(raw/seed_ref/utterance/personality/trait/fixed_preference/certainty/hypotheses)/M2·M3 不在。不接触: production apply 0・flag ON 0(REALITY_LEARNING_EVENT_WRITE=false)・env 変更 0・route/Home/PlanClient 0・M2/M3 0・test row 0(staging に test data 残さず)。次: flag ON(staging 有効化)は別 CEO gate・staging table ready**。**M1 が staging に apply 済・13 列/RLS/append-only(UPDATE policy なし)/CHECK/index/禁止列なし/M2M3 なし を実 staging schema dump で検証・production 不接触・flag OFF ゆえ実 insert はまだ 0・次は flag ON stop gate**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.18 / **A1-7-19 route glue correction + aggregation dedup（accept/dismiss/later write semantics 統一・§10.19・**A1-7-18 policy を route glue に適用し 3 action 学習素材化を完成・flag default OFF 維持(実行は flag ON+table apply 時のみ・現状 0)・DB apply/flag ON はまだ未実施**・A1-7-19 完了）。route glue correction(learning-event-write-on-action.ts): gate を !response.accepted||response.deferred(later 除外)→decideLearningWrite(parsed.action,response).write(accepted なら write・later=deferral も対象)に是正・parse を gate 前に移動(action を得てから decide)・failed/conflict/unresolved(!accepted)は write しない・以降(context→toDryRunLearningEvent→toPrmLearningEventInsertRow→await-and-swallow insert)不変・flag OFF 全 skip 不変。aggregation dedup(dry-run-aggregation.ts): dedupeEventsForSignal(events)新 export=learningEventDedupKey(handle+action+acted_date)で同日反復を最初の 1 件に collapse・AggregationOptions.dedupeSameDay?(default false)=true で集約前 dedup(同日 later 連打→1 signal/異日→別/distinct handle accept-dismiss-別候補→collapse なし)・default false ゆえ既存 aggregation/dev-report regress なし(fixture は定数 handle・live signal 集約は dedupeSameDay:true 推奨)。tests: glue—later→insert 1(deferral)/failed later→insert 0/flag OFF→insert 0・aggregation—同日 later 連打→signal 1/異日→2/distinct handle accept regress なし・raw/seedRef なし・expires_at 180d・Date.now 直呼びなし 維持。不接触: DB apply 0/Supabase apply 0/DB write 実行 0/env 0/flag ON 0/Home 0/PlanClient 0/production 0/remote 0/migration 0/M2/M3 0。tsc 55・reality 790 PASS**。**accept→adoption/dismiss→non_adoption/later→deferral の 3 action が flag OFF で全結線・同日 later 連打は dedupeSameDay で 1 signal collapse・異日は慢性 deferral 蓄積・既存 accept/dismiss regress なし・次は DB apply→flag ON の stop gate**。次は **DB apply(slice ⑤)/flag ON は CEO 承認 stop gate**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.17 / **A1-7-18 Later / Deferred Learning Event Policy（pure helper+tests+docs・§10.18・**A1-7-17 v1 が later(deferred) を learning event 非対象にしていた不整合を是正・later を保存する(deferral=最も深い観測素材 timing/hesitation 次元)・pure helper+tests+docs のみ・glue/route 変更は design-only**・A1-7-18 完了）。詳細 docs/prm-later-deferred-policy.md。結論: later を保存対象に(A1-7-0 が既に later→deferral/[postpone_signal,timing_uncertain] モデル化済・route connection だけ落としていた)・M1 schema は action IN(accept,dismiss,later)/signal IN(adoption,non_adoption,deferral) を既に含むため migration 変更不要。保存条件: action が accepted(validly processed)なら write(accept→adoption/dismiss→non_adoption/later→deferral)・!accepted は skip・later は status 遷移なしだが accepted=true ゆえ write(status 成功 only を是正)。dedup: events は raw 源 append-only・dedup grain=handle+action+acted_date(日粒度・aggregation 側)で同日反復(later 連打)→1 信号 collapse/異日反復→別 key=慢性 deferral 蓄積・accept/dismiss は反復不能ゆえ安全・write 時 dedup なし。追加 2 file(prod 未参照): learning-event-write-policy.ts(decideLearningWrite(action,outcome)/learningEventDedupKey(handle,action,actedAtISO)=handle::action::YYYY-MM-DD UTC 日)・realityLearningEventWritePolicy.test.ts(9 tests)。route 変更要否: 要(glue gate を accepted&&!deferred→decideLearningWrite().write)=route connection 変更ゆえ design-only(A1-7-19 候補)・aggregation dedup も design-only。DB apply: M1 schema は later-ready ゆえ block されない・ただし flag ON で later 取りこぼさないため glue gate 是正は flag ON 前に着地。不接触: glue/route 0・DB apply 0・Supabase apply 0・DB write 0・env 0・flag ON 0・Home 0・production 0・remote 0・migration 0・M2/M3 0。tsc 55・reality PASS**。**later を保存対象に確定(deferral=timing/hesitation 観測)・同日連打は日粒度 dedup で非断定・異日は慢性 deferral 蓄積・M1 は later-ready で DB apply 非 block・glue gate 是正は design-only stop gate**。次は **A1-7-19 glue gate 是正(later write)を CEO 判断・その後 DB apply/flag ON は stop gate**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.16 / **A1-7-17 Learning Event Write On Action（route connection・flag default OFF・§10.17・**A1-7-13 slice ④=candidate-action route に learning event write path を接続・flag realityLearningEventWrite default OFF(flag OFF→insert 0・既存挙動完全不変)・CEO 承認は flag OFF の route connection code まで(DB apply/env/production/remote/flag ON は別 gate)**・A1-7-17 完了）。追加/変更 4 file: learning-event-write-on-action.ts(新 server-only・writeLearningEventOnAction(input) glue+learningEventExpiresAtISO(nowMs)+LEARNING_EVENT_TTL_DAYS=180)・featureFlags.ts(+realityLearningEventWrite=REALITY_LEARNING_EVENT_WRITE default false server-side)・app/api/reality/candidate-action/route.ts(flag-gated block: status 成功後に loadActiveCandidateEntries で entry 再 read+glue・flag OFF で skip)・realityLearningEventWriteOnAction.test.ts(11 tests mock repo)。behavior: glue は flag OFF/非 accepted/deferred(later)/parse 不能/entry 解決不能→何もしない・それ以外(accept→consumed/dismiss→rejected 成功)→context(handle/date/band/confidenceBand=numeric→band/durationMin/evidenceSource=seed_explicit v1 既定)→toDryRunLearningEvent(action,nowISO)→toPrmLearningEventInsertRow(capturedAt=now,expiresAt=now+180d)→repository.insert を await-and-swallow(失敗/例外を握り action response 不破壊)。挿入点: route POST の runCandidateActionRoute 直後 flag-gated block。flag OFF diff 0: block 全体 skip(entry 再 read も repository 生成も glue も呼ばない)=insert 0・response 不変。安全: status update が主責務・learning write は best-effort fail-open・時刻は route 境界注入(nowMs・glue は Date.now 直呼びせず new Date(nowMs))・payload は M1 列のみ(raw/seedRef/personality 型なし・seedRef 非出・handle opaque)・later は status transition なしゆえ非対象(v1)・evidenceSource は seed_explicit 既定(v1 将来 enrich)。不接触: DB apply 0/Supabase apply 0/DB write 実行 0(flag OFF)/env 0/Home 0/PlanClient 0/MorningPlanCard 0/production 0/remote 0/migration 0/M2·M3 0。tsc 55・reality 774 PASS。後続 gate: ⑤DB apply(remote)+flag ON(staging 有効化)・全 CEO 承認**。**route connection は flag default OFF で着地・flag OFF は block skip で既存不変・status 成功後のみ await-and-swallow・TTL 180 日 route 境界注入・slice ⑤DB apply と flag ON は stop gate**。次は **A1-7-18 以降（DB apply / flag ON 有効化 / remote）は stop gate**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.15 / **A1-7-16 Supabase PRM Learning Event Repository（server-only・mock test・§10.16・**A1-7-13 slice ③=PrmLearningEventRepository(A1-7-14 port) の Supabase 実装・A1-7-15 で M1 local smoke PASS ゆえ CEO 承認で実装・route 未接続・実 DB insert 実行 0・未配線**・A1-7-16 完了）。追加 2 file(既存 prod から未参照=未配線): supabase-prm-learning-event-repository.ts(import server-only・createSupabasePrmLearningEventRepository(client,userId)・PrmLearningEventWriteClient structural user-RLS write client・PRM_LEARNING_EVENTS_TABLE)・realitySupabasePrmLearningEventRepository.test.ts(8 tests mock client 実 DB 接続 0)。behavior: injected user-RLS client+userId(route が auth.getUser() で確定)→mapper 済 row に user_id 付与→from(prm_learning_events).insert(payload)・空 rows は insert 呼ばず{ok:true,0}・error→{ok:false,0}・例外(auth 同期 throw/network reject)→catch して{ok:false,0}(fail-open throw しない)・成功→{ok:true,rows.length}。安全: createClient しない(注入)・service_role 禁止(user-RLS・RLS WITH CHECK auth.uid()=user_id)・payload は InsertRow(M1 列)+user_id のみ(raw/seedRef/utterance/personality/trait/fixed_preference/certainty/hypotheses を型として持たない)・return/log は count/status のみ(UUID/error detail 出さない・log しない)・Date.now なし。不接触: route/Home/PlanClient/DB apply/Supabase apply/実 DB insert/local reset/remote/staging/production/env/migration/M2/M3。tsc 55 baseline 不変・reality 763 PASS。後続 gate: ④route connection(flag-gated fire-and-forget)⑤DB apply(remote)・全 CEO 承認**。**Supabase repo は注入 user-RLS client に user_id 付与して insert・service_role なし・fail-open で user action を壊さない・payload に raw/seedRef なし・未配線で実 insert 0・slice ④以降は stop gate**。次は **A1-7-17 route connection は stop gate ゆえ設計だけ提出し実装に進まない**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.14 / **A1-7-15 M1 prm_learning_events Local Smoke PASS（local-only・§10.15・**M1 migration を隔離 throwaway postgres:17 container で apply し schema/RLS/constraints/index/rollback を検証・全 19 assertion PASS・既存 Supabase local stack(supabase_db_aneurasync-x-ops)/remote/staging/production に一切未接触・supabase CLI コマンド 0 回・linked ref hjcrvndumgiovyfdacwc=staging 未接触・dev-local wipe なし**・A1-7-15 完了）。実行方式: docker run postgres:17(host port 非公開・独立)→Supabase 風 auth stub(auth.users/auth.uid()=request.jwt.claims->>'sub'/authenticated role・user-RLS/service_role 非前提)→M1 verbatim apply→19 assertion→rollback→container 破棄・repo file 変更 0。結果(全 PASS): apply+table 作成/RLS enabled/column=M1 13 列のみ(raw/seed_ref/utterance/personality/trait/fixed_preference/certainty/hypotheses 不在)/indexes 2/M2·M3 table 不在/制約 reject 5(action·signal·band·confidence NULL·duration<0)/RLS owner-only(他人 user_id INSERT 拒否·他人 SELECT 0 rows·owner SELECT 1·owner DELETE 成功)/append-only(UPDATE policy 不在·UPDATE 0 rows)/rollback clean DROP。不接触: remote/staging/production apply 0·env 0·route/Home/persistence 0·Supabase repository 0·M2/M3 0。次: A1-7-16 Supabase repository 実装(実 staging apply は別 gate=slice ⑤)**。**M1 は実 Postgres で apply/RLS/constraint/append-only/rollback まで PASS・throwaway container で dev-local/remote 未接触・存在未確認 table への書き込み懸念は解消**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.13 / **A1-7-14 PRM Learning Event Insert Mapper + Repository Port/Fake（pure・no-DB・§10.14・**A1-7-13 設計の slice ①mapper+②repository interface/fake を pure 実装・insert contract/fake foundation であり Supabase repository ではない・Supabase repo/route/DB apply は後続 gate**・A1-7-14 完了）。追加 3 file(既存 prod から未参照=未配線): prm-learning-event-insert.ts(PrmLearningEventInsertRow=M1 列のみ user_id/id 持たない・toPrmLearningEventInsertRow(event,{capturedAtISO,expiresAtISO?}) pure mapper・toPrmLearningEventInsertRows・PrmLearningEventRepository interface insert(rows)→{ok,inserted} DB 型/Supabase client 漏らさない・PrmLearningEventInsertResult)・fake-prm-learning-event-repository.ts(FakePrmLearningEventRepository in-memory persisted:false marker・dedup by (handle,action,acted_at)・setFailNext graceful 失敗・insertRowIdempotencyKey)・realityPrmLearningEventInsert.test.ts(17 tests)。安全: raw/seedRef/utterance/personality/trait/fixed_preference/certainty/hypotheses/user_id/id は InsertRow 型に存在せず構造的非保存(mapper 生成不能)・Date.now 直呼びなし(timestamp 注入 pure deterministic)・idempotency=fire-once dedup・fail-open は fake が throw でなく {ok:false} を返し user action を壊さない。不接触: DB/Supabase client/persistence/route/Home/PlanClient/production/env/remote/migration/apply/LLM/M2/M3。tsc 55 baseline 不変・reality 755 PASS。後続 gate: ③Supabase repository(persistence)④route connection(route/Home)⑤DB apply(remote・local smoke 後)・全 CEO 承認**。**mapper は M1 列のみで raw/seedRef を型として生成不能・timestamp 注入で Date.now なし・fake で insert/idempotency/fail-open を実 DB なしで検証・slice ③以降は stop gate**。次は **A1-7-15 設計提出のみ(Supabase repository/route connection/DB write/local apply に近づくため実装せず CEO 判断)**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.12 / **A1-7-13 PRM Learning Event Insert Path Design（docs-only・§10.13・**dry-run event(A1-7-0)↔M1 prm_learning_events(A1-7-11)を繋ぐ insert path を設計・docs-only・コード/migration/DB apply/DB write/route/Home/persistence wrapper/M2/M3 なし**・A1-7-13 完了）。詳細 docs/prm-learning-event-insert-path-design.md。元イベント: accept/dismiss/later→CandidateActionOutcome(A1-6-0)→toDryRunLearningEvent(A1-7-0)=挿入実体・dry-run と live が同一 helper 同一 event 形(乖離なし)。推奨タイミング: action route 直後(status 更新成功後・最小安全)・reflection(read path 不可)/sweep(plan_seeds から復元不能)除外。推奨設計: まず route に fire 配線しない(mapper+fake repository のみ)→将来 flag ON 時だけ insert・insert は fire-and-forget/fail-open(失敗が user action を壊さない・no-retry)・privacy は構造的 fail-closed(mapper が raw/seedRef 生成不能)。repository: pure mapper(event→insert row・raw 持てない型)/repository interface/fake repository(test)/Supabase impl 後続。RLS: user-RLS(user_id=auth.uid()・service_role なし)・handle opaque・raw 非保存。idempotency: fire-once+no-retry(将来 UNIQUE(handle,action,acted_at)+ON CONFLICT は M1 追記=別 GO)。flag: default off・local/staging only・production gate。observability: count/status のみ(raw/seedRef 出さない)。rollback: flag off で即 disable(diff 0)+M1 revert で完全可逆。実装最小 slice 順: ①mapper(pure 自律)②repository interface+fake+tests(pure 自律)③Supabase repository(gate)④route connection(gate)⑤DB apply(gate)・write 前に全 logic を fake 検証**。**insert は action 直後に flag-gated fire-and-forget で user action を壊さない・dry-run と同一 event 形で乖離なし・write 前に fake 検証・slice 1-2 自律/3-5 gate**。次は **CEO 判断: slice ①mapper から自律実装に進むか / 別案**。**Supabase repository/route connection/DB apply/M2/M3/production/env/remote は CEO 承認 gate で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.11 / **A1-7-12 M1 SQL Static Review + Local Smoke Plan（docs-only・§10.12・**M1 migration(A1-7-11)の深い静的レビュー+local smoke checklist・docs-only・apply/db push/local reset/migration up 実行しない**・A1-7-12 完了）。詳細 docs/prm-m1-static-review-and-smoke-plan.md。静的レビュー verdict: M1 SQL は correct/complete/safe(源泉 events log 用途)・finding 6 件全て非 blocker(expires_at app-insert 責務/handle index 将来/acted_at app validate/self-poisoning は self-only review-gated/unique なしは設計通り/down は revert migration 手順)。local smoke plan(実行しない): local Supabase のみで apply→\d schema→RLS(UPDATE policy なし)→constraints reject(action='foo'/confidence NULL/duration<0/UPDATE 不可/別 user SELECT 0 rows)→index→down clean DROP・PASS 条件+FAIL 時は draft 修正で remote に進まない。stop gate: local smoke 実行も CEO 承認後・PASS→CEO 実 SQL+結果 review→remote apply 別 GO→production 更に別**。**M1 SQL を thorough に review し非 blocker のみ確認・local-only smoke 手順を定義・実行は CEO 承認待ち**。次は **A1-7-13 設計提出**（M1 local smoke 実行 or 次段階の設計）。**Supabase apply/db push/local reset/migration up 実行/M2・M3/route/Home/production/env/remote は別 GO・CEO 承認で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.10 / **A1-7-11 M1 prm_learning_events Migration File Draft（draft・未 apply・§10.11・**A1-7-10 M1 設計に従い 1 本だけ migration file 作成+静的監査・CEO が migration stop gate を越える承認(M1 file+静的監査まで)・apply/DB write/local reset/remote/M2/M3 禁止**・A1-7-11 完了）。file: supabase/migrations/20260608120000_create_prm_learning_events.sql。schema prm_learning_events(源泉 signal log・append-only): id/user_id(FK auth.users CASCADE)/handle(opaque)/action/signal/desired_date/band/confidence_band/duration_min/source_kind/acted_at/captured_at/expires_at(TTL)・raw/seedRef/source_ref/utterance/certainty/evidence/counter/stillPossible/personality/trait/fixed_preference 列なし(events=raw facts・derived/model は再導出/M3)。RLS owner-only(auth.uid()=user_id・service_role 非前提・cross-user 不可)・SELECT/INSERT/DELETE のみ・UPDATE policy なし=append-only。constraints: enum CHECK(action/signal/band/confidence/source)+duration_min≥0・certainty high CHECK は M3(M1 に certainty 列なし)。index: (user_id,acted_at)/(user_id,expires_at) partial。rollback: header に revert SQL(DROP index→table)・clean DROP・M1 独立可逆。静的監査 PASS: 禁止語なし/UPDATE policy なし/RLS enabled/owner-only/REFERENCES auth.users/prm_ は本 file のみ。正確な不接触: DB apply 0/Supabase apply 0/DB write 0/local reset 0/remote 0/route 0/Home 0/production 0/env 0/persistence 実装 0(file は作成ゆえ DB 関連 file 作成は 0 でない)**。**M1 events table を append-only/owner-only/structured-only/過断定不可(certainty 列なし)で draft・apply は別 GO・M2/M3 未着手**。次は **A1-7-12 M1 SQL static review / local smoke plan**。**実 DB apply/db push/local smoke 実行/M2/M3/route/Home/production/env/remote は別 GO・CEO 承認で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.9 / **A1-7-10 PRM Migration Readiness Plan（docs-only・§10.10・**A1-7-5 schema + A1-7-6〜9 review flow を前提に実 migration を作る前の readiness plan・docs-only・migration file/DB schema/DB write/Supabase apply/route/Home/persistence/production/env/remote/PR を一切しない**・A1-7-10 完了）。詳細 docs/prm-migration-readiness-plan.md。段階分割: M1 prm_learning_events(源泉・先行)→M2 prm_review_decisions(review 入口)→M3 prm_model_entries(実 PRM・M2 へ FK)・各段別 file 独立 revert 可・M1 単独で shadow 蓄積開始可。最小カラム/RLS/constraints: 3 table 最小 column(seedRef/raw column 持たない)・RLS owner-only(auth.uid()=user_id・service_role 前提にしない・cross-user 不可)・certainty CHECK in(low,tentative)=high 不可・review_decision_id NOT NULL=review なし entry 禁止・trait column なし(文脈束縛 tendency のみ)。index/rollback/smoke: 最小 index(recency/TTL/lookup)・down=clean DROP(新規 table のみ・既存無変更・完全可逆)・local-only smoke(remote 触らない・checklist のみ・実行しない)。retention/deletion: events expires_at(TTL・sweep cron 別段階)・user 起点 cascade 削除(GDPR)・decay_weight+retracted_at。seedRef/raw 非保存: column に含めない(構造的に保存不能)・handle opaque・snapshot redacted。migration 作成前 最終 stop gate: ①plan+review flow CEO 承認→②開始段階(M1)承認→③local smoke 承認→④M1 file 作成+local smoke+実 SQL review→⑤remote apply 別承認・①②未了は file 作らない・④まで local apply なし・⑤まで remote なし**。**実 migration を安全・可逆・段階的に作るための手順書を完成・file は作らず CEO 承認 stop gate で停止・過断定防止を DB constraint で構造化**。次は **CEO の readiness plan 承認→承認なら M1(prm_learning_events) migration file 作成は別 GO**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.8 / **A1-7-9 Review Flow Dev Preview（landed・§10.9・**A1-7-7/7-8 review flow を fixture で可視化する dev 限定 preview(/plan/dev-review-flow)・永続化前に decision ごとの effect・blocked fail-closed・persisted:false を目視検証・dev/staging 限定・render-only・no-persist/no-route/no-DB**・A1-7-9 完了＝review flow 実装層の終端）。page(三重ガード→notFound)+client(fixture proposals→toReviewDecisionRecords→record card・no-persist)・fixture(candidate evening/confidence high を approve/reject/defer+blocked morning を approve→4 records)・card(proposalFingerprint/valid 緑|invalid 赤 not_reviewable/decision→effect/snapshot certainty≤tentative/persisted:false/reviewRequired:true/assertsPersonality:false)。実機検証(screenshot): approve→add_model_entry_candidate/reject→record_rejection/defer→no_model_change(user 再 review)/blocked→invalid(not_reviewable・fail-closed)・全 persisted:false・console error 0。検証: reality 741 PASS(735→+6)・自変更 tsc 新規 0(baseline 55)**。**review flow(A1-7-6〜9)を contract→helper→preview で完成・全 dry-run/no-persist・人間 review が PRM 唯一入口・migration 手前で停止**。**■ migration stop gate: decision 永続化(prm_review_decisions DB write)/migration/PRM 永続化本体は CEO 承認まで着手しない**。次は **CEO の review flow 品質確認→承認なら migration 計画(schema 段階1 prm_learning_events から)**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.7 / **A1-7-8 Review Decision Dry-run Helper（landed・§10.8・**candidate proposal + 人間 decision → ReviewDecisionRecord を pure 生成(review-decision-dry-run.ts)・保存しない(persisted=false)・pure/no-persist/no-DB/no-LLM/no-route/no-Home**・A1-7-8 完了）。toReviewDecisionRecord(proposal,decision,reviewer,reviewedAtISO?): validateReview→snapshot 固定→effect・blocked/未知 decision→valid=false(fail-closed・throw なし)。record: kind marker/valid·reason/proposalFingerprint/decision·effect(無効時 null)/reviewer/snapshot(review 時点・certainty≤tentative・high なし)/reviewedAtISO(注入)/reviewRequired:true/assertsPersonality:false/persisted:false。toReviewDecisionRecords batch。検証: reality 735 PASS(728→+7)・自変更 tsc 新規 0(baseline 55)**。**review decision を dry-run で生成・snapshot で再現性・approve でも非断定/未保存維持・fail-closed**。次は **A1-7-9 dev preview**。**decision 永続化/DB write/migration/route/Home 本線/production/env/remote/LLM は別 GO・migration 手前で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.6 / **A1-7-7 Review Flow pure contract / types（landed・§10.7・**review flow の契約 vocabulary を pure 定義(review-flow-contract.ts)・pure/no-persist/no-DB/no-LLM/no-route/no-Home**・A1-7-7 完了）。types: ReviewDecisionKind(approve/reject/defer)/ReviewerKind(operator/user)/ReviewValidity/PrmEffect。関数: isReviewableProposal(candidate のみ true・blocked 不可)/validateReview(未知 decision・non-reviewable を fail-closed)/decisionEffect(approve→add_model_entry_candidate/reject→record_rejection/defer→no_model_change)/proposalFingerprint(dimension:value:dominantAction・seedRef なし)。検証: reality 728 PASS(723→+5)・自変更 tsc 新規 0(baseline 55)**。**candidate のみ reviewable・approve でも非断定維持(certainty high にしない)・review を PRM 唯一入口に**。次は **A1-7-8 review decision dry-run helper**。**decision 永続化/DB write/migration/route/Home 本線/production/env/remote/LLM/自動 review は別 GO・migration 手前で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.5 / **A1-7-6 PRM Review Flow Design（docs-only・§10.6・**A1-7-5 chain の [HUMAN REVIEW] ステップ=candidate proposal→人間 review→decision→PRM model 入口を設計・docs-only**・A1-7-6 完了）。詳細 docs/prm-review-flow-design.md。状態遷移: blocked=review 不可(observation)/candidate→pending→approved(PRM entry 生成・certainty≤tentative 維持)/rejected(PRM 不追加・rejection 記録)/deferred(変化なし・再 surface)・candidate のみ reviewable・再 review 可。decision 意味論: approve=傾向を追跡する価値あり(事実確定でない・high にしない・trait でない)/reject=推論傾向が妥当でない/defer=情報不足。所有 arc: 段階1 operator(推論品質検証)→段階2 user(自分の PRM を confirm/correct=第二の自己所有・最強 signal)・reviewed_by operator|user。非断定の保存: approve しても certainty≤tentative/counter-evidence/stillPossible/user-correction override/decay を保つ=PRM は事実に硬化しない・いつでも引き戻せる。roadmap: A1-7-7 pure contract/types→A1-7-8 dry-run helper→A1-7-9 dev preview(全 no-persist)→decision 永続化/migration は A1-7-9 後に停止**。**人間 review を PRM 唯一の入口に・approve でも非断定を保ち事実硬化を防ぐ・所有はユーザーへ**。次は **A1-7-7 review flow pure contract/types**。**decision 永続化/DB write/migration/実 review UI 本接続/route/Home 本線/production/env/remote/LLM/自動 review/性格断定は別 GO・migration 手前で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.4 / **A1-7-5 PRM Persistence Schema Design（docs-only・§10.5・**A1-7-0〜7-4 を踏まえ将来何を永続化すべきかを設計・docs-only・migration/schema 実装/persistence 禁止・設計は先行するが migration は stop gate まで書かない**・A1-7-5 完了）。詳細 docs/prm-persistence-schema-design.md。保存対象比較: events を源泉保存(不変事実・append-only・patterns/proposals は events の純関数ゆえ改良 rule で再導出可能・audit clean)・patterns/proposals は read 時派生(保存すると rule 凍結・stale)・PRM model=人間が review approve した tendency のみ(自動生成しない)・proposal の review 決定だけが PRM 入口。schema(設計のみ): prm_learning_events(源泉 signal log・redacted・append-only・TTL)/prm_review_decisions(review 橋渡し・reviewRequired 実体)/prm_model_entries(review 済 tendency=実 PRM)。保存契約(過断定防止を schema 化): reviewRequired(review_decision_id NOT NULL=自動学習なし)/counter-evidence(counter_count で弱化)/stillPossible(still_possible jsonb)/certainty cap(CHECK certainty IN low,tentative=DB level で high 不可能)/non-personality(性格 column なし・文脈束縛 tendency のみ)。retention/TTL/deletion/audit/rollback/user-visibility: events expires_at(180日)+model decay_weight(recency)/user 起点 cascade 削除(GDPR)/append-only audit+provenance trace/supersedes_id versioning+retracted_at 論理削除で可逆/user_visible 開示+user_correction(強い override=第二の自己をユーザーが所有編集)。migration 前 stop gate: ①proposal review→②schema 設計 CEO 承認→③review flow 設計→④migration 計画 CEO 承認→⑤承認後 migration・①〜④未了は schema/DB 不接触**。**「何を保存すべきか」を源泉(events)中心+人間 review gate+過断定 5 重 gate+ユーザー所有で設計・migration は CEO 承認まで書かない**。次は **CEO の schema 設計 review→承認なら review flow 設計→migration 計画**。**migration/schema 実装/persistence/DB write/route/Home 本線/production/env/remote/LLM は別 GO・CEO 承認で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.3 / **A1-7-4 Proposal Projection Dev-report Integration（landed・§10.4・**A1-7-2 learning report preview に A1-7-3 PRM dry-run proposal projection を追加表示・PRM 永続化前に何が candidate/blocked になるかを CEO/dev が目視確認（stop gate step ①）・dev/staging 限定・render-only・fixtures のみ・no-persist/no-route/no-DB/no-Home**・A1-7-4 完了）。拡張(client): pattern report に projectPrmDryRun(report) の proposal section 追加(pure・no-persist)・fixture を candidate が出るよう調整(evening dismiss×6=≥5→candidate/morning accept×3=<5→blocked(insufficient)/afternoon 割れ→blocked(low))・ProposalCard(status badge[candidate=amber/blocked=gray]+要 review[全提案]+certainty+tendency interpretation[採用されやすい/にくい傾向・嫌い/好み確定でない]+evidence·counter·stillPossible+blockedReason+whyProposalOnly[humility]・meta に candidates/blocked 数·persisted:false·assertsPersonality:false)。実機検証(実ブラウザ・STAGING_USER_A login・screenshot): 9 proposals(3 candidate+6 blocked)・candidate(確信度高→提示のズレ framing/所要時間中→タイミング timing=同 dismiss が次元で分岐)・全提案 要 review・blockedReason(evidence_insufficient/certainty_low)可視・tendency framing 維持・persisted:false・console error 0・harness untracked 削除。検証: reality 723 PASS(720→+3)・自変更 tsc 新規 0(baseline 55)・render test で proposal section+tendency framing 証明・既存 note test regex を断定形に精緻化**。**PRM 保存前の「保存候補一覧」を人間に見える化・candidate/blocked と blockedReason を可視・全提案 review 必須・tendency で断定回避**。次は **CEO/dev の proposal 品質 review→PASS 後 PRM 永続化 schema 設計(§3・設計のみ・migration 禁止)**。**PRM 永続化/DB write/schema/migration/route/Home 本線/production/env/remote/LLM/性格·嗜好断定は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.2 / **A1-7-3 PRM Dry-run Proposal Projection（landed・§10.3・**A1-7-1 TentativePatternReport を PRM 保存前の PRM update proposal candidate に変換する pure projection・PRM 永続化でなく PRM 更新候補への dry-run projection（保存しない・review 必須）・pure/local/no-persist/no-DB/no-LLM/no-route/no-Home**・A1-7-3 完了）。設計思想: PRM は fact を自動学習しない・全更新は review 必須の dry-run 提案で evidence+counter-evidence+stillPossible+humility を携える・dismiss を嫌い/accept を好み確定に変換しない(tendency+要 review)・high certainty/fixed preference/personality を作らない。proposal schema(lib/plan/reality/learning/prm-dry-run-projection.ts): PrmDryRunProposal(kind=prm_dry_run_proposal=未永続化 marker/status candidate|blocked/sourceDimension·sourceValue/dominantAction·signal/tentativeInterpretation[tendency·要 review]/favoredHypothesis/stillPossible/evidenceCount·counterCount/certainty[low|tentative]/whyProposalOnly[humility]/blockedReason[certainty_low|evidence_insufficient|null]/reviewRequired:true 常に/assertsPreference:false)・PrmDryRunProjection(kind=prm_dry_run_projection/totalPatterns/proposals/candidates/blocked/assertsPersonality:false/persisted:false)。projection rule: certainty≠tentative→blocked(certainty_low)/tentative かつ evidence<minCandidateEvidence(既定5)→blocked(evidence_insufficient)/tentative かつ十分→candidate(reviewRequired)=過断定防止の二段 gate(aggregation minEvents=3+projection minCandidateEvidence=5)。検証: reality 720 PASS(711→+9)・自変更 tsc 新規 0(baseline 55)・fixtures で low→blocked/tentative+不足→blocked/tentative+十分→candidate/dismiss≠嫌い·accept≠好み確定/counter-evidence·stillPossible 保持/persisted=false/pure deterministic 証明**。**PRM に fact を勝手に積まない review-gated dry-run proposal を実装・低 certainty/少数は observation 止まり・全提案 reviewRequired**。次に PRM 永続化へ進む stop gate: dev-report review→PRM schema 設計(§3・設計のみ)→CEO 承認→migration/dry-run shadow write→observe→本番(各段 reviewRequired 維持・certainty high 禁止)。**PRM 永続化/DB write/schema/migration/route/Home 本線/production/env/remote/LLM/性格·嗜好断定は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.1 / **A1-7-2 Shadow Learning Preview（landed・§10.2・**A1-7-1 aggregateDryRunEvents の tentative pattern report を fixture dry-run events から dev 限定 preview で可視化し PRM 永続化前に学習品質・過断定防止・counter-evidence 表示を目視検証（shadow 観測ゲート）・dev/staging 限定・render-only・実 event/DB/persistence/route なし**・A1-7-2 完了）。preview(/plan/dev-learning-report): page(三重ガード isCandidateActionsPreviewHostAllowed 再利用→notFound)+client(fixture events→aggregateDryRunEvents→pattern card・use client・no-persist/no-route/no-DB)・fixture(evening dismiss→not_now timing/high-confidence dismiss→mismatch_unknown framing=同 dismiss が次元で分岐/morning accept→positive/afternoon mixed→counter-evidence)・card(dimension「value」/dominantAction+consistency/counterCount/certainty badge[low/tentative・high なし]/favoredHypothesis+stillPossible[他に残す]/note・meta に assertsPersonality:false/kind)。実機検証(実ブラウザ・STAGING_USER_A login・screenshot): 8 patterns・disambiguation 対比(夜→タイミング/高→提示のズレ)・counterCount 可視・certainty low/tentative のみ・stillPossible 可視・assertsPersonality:false・console error 0・harness untracked 削除。検証: reality 711 PASS(705→+6)・自変更 tsc 新規 0(baseline 55)・render test で content/guard/no-persist 証明**。**学習品質を永続化前に目視検証する shadow ゲートを実装・過断定防止(certainty 上限)と counter-evidence/stillPossible を可視化**。次は **CEO の dev-report 学習品質検証→PASS 後 PRM dry-run 永続化設計(§3・設計のみ・migration 禁止)→CEO 承認で DB/migration**。**PRM 永続化/DB write/route/Home 本線/production/env/remote/migration/LLM/性格·嗜好断定は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§10.0 / **A1-7-1 Dry-run Event Aggregation + Hypothesis Disambiguation（landed・§10.1・**A1-7-0 dry-run events を in-memory 集約し文脈相関で hypothesis を disambiguate→tentative pattern report・「学習に変える入口」・PRM 保存/DB write なし・pure/local/no-persist/no-DB/no-LLM/no-route/no-Home**・A1-7-1 完了）。schema(lib/plan/reality/learning/dry-run-aggregation.ts): aggregateDryRunEvents(events,opts?)→TentativePatternReport(kind=tentative_pattern_report=未永続化 marker/assertsPersonality=false)・4 文脈次元 univariate(band/durationBucket[short≤30/medium≤90/long/unknown]/confidence/source)で文脈値 group 化・minEvents(既定3)以上のみ pattern 化(少数は断定しない)・value 昇順 sort で deterministic・TentativePattern(dimension/value/dominantAction/signal/eventCount/dominantCount/counterCount[counter-evidence]/consistency[mixed/leaning/consistent]/favoredHypothesis/stillPossible[潰さない]/certainty["low"|"tentative"・high なし]/assertsPreference=false/note[controlled tone])。disambiguation rule(controlled): timing 系(band/durationBucket)+dismiss→not_now/+later→timing_uncertain・framing 系(confidence/source)+dismiss→mismatch_unknown/+accept→accepted_for_plan・favored は該当 action の hypothesis 内・残りは stillPossible 保持=同じ dismiss でも band 次元 not_now/confidence 次元 mismatch_unknown に分岐。非断定/counter-evidence/bounded: 1 件で断定せず minEvents・counterCount 保持・ratio≥0.75 のみ tentative 昇格(100% でも high にしない)。検証: reality 705 PASS(696→+9)・自変更 tsc 新規 0(baseline 55)・fake fixtures で disambiguation/counter-evidence/certainty 上限/duration bucket/非断定/未永続化/pure deterministic 証明**。**reaction を tentative pattern に変える入口を非断定で実装・context が hypothesis を disambiguate・certainty 上限 tentative で構造的に過断定を防ぐ**。次は **dev-report(tentative pattern を dev 限定 preview で可視化し学習品質を shadow 観測・別 GO)→検証後 PRM dry-run(§3・DB=CEO 承認)**。**PRM 永続化/集約 persist/DB write/route/Home 本線/production/env/remote/migration/LLM/性格·嗜好断定は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.19 / **A1-7-0 Candidate Action Outcome → PRM Dry-run Learning Event（landed・§10.0・**accept/dismiss/later を status 遷移で終わらせず非断定の structured learning event 候補に変換する pure transform・PRM 永続化でなく dry-run foundation・pure/local/no-DB/no-persist/no-LLM/no-route/no-Home**・A1-7-0 完了）。設計思想: 単一 action は弱く曖昧な証拠ゆえ単一の意味に潰さず複数 hypothesis を保持+文脈記録で将来 cross-event 相関 disambiguation(negative capability・observed>inferred)。実装(lib/plan/reality/learning/dry-run-learning-event.ts・pure): toDryRunLearningEvent(ctx,action,actedAtISO?)→DryRunLearningEvent(kind=dry_run_learning_event=未永続化 marker)・signal(中立) accept=adoption/dismiss=non_adoption(≠negative)/later=deferral・hypotheses(潰さない) accept=[accepted_for_plan,positive_signal]/dismiss=[not_selected,not_now,mismatch_unknown]/later=[postpone_signal,timing_uncertain]・非断定の構造的保証 certainty=low+assertsPreference=false(rejected≠嫌い/consumed≠選好確定/deferred≠拒否)・文脈 handle(opaque)/desiredDate/band/confidenceBand/durationMin/sourceKind/sourceLabel・actedAtISO 注入(Date.now 不使用)・hypothesisLabel controlled tone・toDryRunLearningEvents batch。検証: reality 696 PASS(683→+13)・自変更 tsc 新規 0(baseline 55)・fake fixtures で 3 action event 化/非断定/文脈記録/Date.now 不使用/pure deterministic 証明**。**reaction を「学習」に変える foundation を非断定で実装・PRM 永続化でなく dry-run 候補のみ**。次は **学習に変える入口(dry-run events 集約→文脈相関で hypothesis disambiguation→dev-report 観測・別 GO)**。**PRM 永続化/集約/DB write/route/Home 本線/production/env/remote/migration/LLM/性格·嗜好断定は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.18 / **A1-6-13 Live Morning Route Connection Preflight（docs-only 監査・§9.19・**reflection を live morning route に安全接続する挿入点を read-only 監査・最重要発見=live route 配線は A1-6-7 で既存(A1-6-12 report の「live 未配線」は誤り)・現状 wired-but-dormant**・コード/env/flag/route/DB 変更なし）。訂正(整合性): route.ts:10376 が A1-6-7 で resolveConsumedReflectedMorningPlan(morningResponse?.plan??null,supabase,userId) を serve-time に呼び morningProtocol.plan(L10405)で client へ serve→useAlterChat.ts:771→AskHero→MorningPlanCard(end-to-end 配線済)・REALITY_CONSUMED_REFLECTION OFF で dormant。監査(verify): 挿入点=route.ts:10376(既存・capture-surface 注入 L10432 と同一 serve point・新規不要)/flag OFF diff 0(morning-consumed-reflection.server.ts:36 if(!flag||plan===null)return plan・read 0)/fail-open(try-catch return plan)/serve-time のみ(servedMorningPlan 別変数・session 不変)/read-only(status=consumed read のみ)/user-RLS(createConsumedSeedRepository・service_role なし)/同日 filter(seed.date===plan.date)/handle dedup(!existingIds.has・round-trip 安全)。TTL未実装時の暫定安全性: cron 未実装だが同日 filter が天然 TTL(consumed は desired_date===today の日だけ reflect・翌日自動消失)+consumed status final+active read-side expires_at guard=staleness は desired_date に bounded。Slice E(staging enablement・別 GO・env は CEO/operator): flag chain(REALITY_CAPTURE_SURFACE+NEXT_PUBLIC_REALITY_CANDIDATE_ACTIONS+REALITY_CONSUMED_REFLECTION)を staging together ON→smoke→観測→production canary・手順 docs/reality-consumed-reflection-enablement-runbook.md。任意後続(今やらない): Slice S(stale-reconcile)/Slice T(TTL cron)。検証: docs-only(code 0/env 0/flag 0/route 0/DB 0/production 0)ゆえ test 不要(reality 683/alter-morning 4501 不変)**。**「preview 内の成功」を live に繋ぐ配線は A1-6-7 で既存・安全(flag OFF diff 0/fail-open/serve-time/read-only/user-RLS/同日 dedup を verify)・残るは staging flag 有効化判断(env=CEO 承認)**。次は **CEO の staging 有効化判断(Slice E)/任意の Slice S・T**。**production/Home 本線/remote/migration/env 変更は CEO 承認必須**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.17 / **A1-6-12 Reflected Item Naturalness（landed・§9.18・**#3「反映後 item の自然さ」・監査で §9.16 前提反転[preview 簡易 render の 13:00 false precision でなく live MorningPlanCard slot モデルが sharpness 未設定→missing で generic label を捨てる=label 破棄]を発見・pure 反映修正で解消・MorningPlanCard/DB/route/lifecycle/Home 配線なし**・A1-6-12 完了）。修正(pure・reflection データ): consumed-seed-morning-reflection.ts の反映 PlanItem に whenSharpness="vague"(band 既定時刻=精密でない→[時間未確定]・false precision を出さない)+whatSharpness="vague"(generic label=暫定→card が text「午後の予定（60分）」を表示+内容暫定・label を出す)+confirmationState="confirmed"(CEO B・consumed=accepted の contract 補正→「確定」・default provisional の「暫定」chip 除去・粗さは sharpness が担う)を明示・既存 MorningPlanCard rendering を活用(card 非接触)。card 検証 preview(§9.18 新 dev page /plan/dev-reflected-item・三重ガード再利用・render-only・real route/DB 不使用・実 reflection helper で生成→実 MorningPlanCard で描画=live 相当を目視・既存 candidate preview §9.14/§9.15 は簡易 render で card 未通過ゆえ新設)。実機検証(card-verify・実ブラウザ・STAGING_USER_A login・proxy.ts auth gate 通過): reflected 行=[時間未確定] 午後の予定（60分） 内容暫定(label 表示・旧 [時間未確定][内容暫定] から改善)+fixed 比較 10:00 ミーティング+console error 0+screenshot 目視+harness untracked 削除。検証: reality 683 PASS(677→+6: 反映 sharpness +1/preview +5)・alter-morning 4501 PASS(無回帰)・自変更 tsc 新規 0(baseline 55)・MorningPlanCard/DB/route/lifecycle/Home 配線 不接触・production 非可視(preview=三重ガード)。confirmationState(CEO B 補正): 当初未設定→default provisional で標準「暫定」chip が出ていたが、CEO B で consumed=accepted の contract 補正として confirmationState="confirmed" を追加→「暫定」chip 除去・「確定（時間・内容は粗い）」を表現・card-verify 再検証で chip 消失(standaloneProvisionalChip=false)・[時間未確定]/内容暫定/label 維持を確認**。**#3 の真の gap(label 破棄)を pure 反映修正で解消・実 MorningPlanCard で label 表示を実機確認・false precision でなく label 破棄だったと監査で判明・CEO B で confirmationState も contract 補正**。次は **A1-6-13 監査で live route 配線は A1-6-7 既存=wired-but-dormant と判明(§9.19)→staging flag 有効化判断(Slice E)。#4/#5 は CEO により凍結(縦磨き停止)**。**production rollout/Home 配線/remote/migration apply は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.16 / **A1-6-11 Candidate Action「いつ」文脈+action 確認（landed・§9.17・**controlled formatter[LLM 不使用・structured state 安全表示]で #1 desired date friendly 表示 + #2 action 確認文言を実装・CEO 指摘の #2 視認性 gap を banner 内部で解消・新 component/DB/migration/route/status lifecycle/Home 配線なし**・A1-6-11 完了）。#1 presenter formatter friendlyDateLabel(date,today)=今日/明日/明後日/昨日/M/D(pure・deterministic・Date.now 不使用=today 注入・parse 不能/欠落→null で捏造しない・banner が local today 注入)。#2 actionResultText=accept 予定に入れました/dismiss 今回は見送りました/later あとで確認できます(固定文)・banner-level confirmation(action-feedback)。CEO 指摘 #2 視認性 gap 修正(banner 内部・Home 非接触): parent removal で candidate 0 件化しても banner は MorningPlanCard が無条件 mount し state(feedback)保持(banner は unmount せず null 返すだけ)ゆえ display=null でも feedback あれば confirmation 返す(早期 null の前)+setTimeout(4s)で transient 自動クリア=parent/Home 本線非接触で達成。実機検証(render-only preview・実ブラウザ・STAGING_USER_A login・proxy.ts auth gate 通過): accept×2(最後で0件)→予定に入れました visible+MorningPlan 2 件反映(計3)/dismiss×2(0件)→今回は見送りました visible/later→あとで確認できます visible・banner 残存・console error 0・screenshot 2 枚で 0 件 confirmation 目視・harness untracked+削除。検証: reality 677 PASS(676→+1 persistence 回帰)・alter-morning 4501 PASS・自変更 tsc 新規 0(baseline 55)・service_role/DB/route/status lifecycle 不接触(pure UI/formatter)・production 非可視(banner=realityCandidateActions flag-gated・preview=三重ガード)・既存 render-only(§9.14)/E2E(§9.15)preview 非破壊・本線配線なし・migration 0・remote 0**。**#2 視認性 gap を banner 内部 transient persistence で解消(0 件化後も confirmation 視認)・controlled formatter で「いつ」文脈と action 確認を LLM 不使用で実現・実ブラウザで視認確認**。次は **②反映後 item の自然さ(次 slice)/④複数候補上限·優先/⑤連続性演出/production rollout 段階設計(別 GO)**。**production rollout/Home 配線/remote/migration apply は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.15 / **A1-6-10 Candidate Action Gap-fit Refinement（landed・§9.16・**E2E 実証済の鎖を前提に「動く」→「使いたくなる」へ・dev/staging で安全な UI/copy polish のみ・新 component/DB/migration/Home 配線なし**・A1-6-10 完了）。監査(8 領域): accept後の見え方/dismiss·later の意味/候補なし/エラー·再試行/cleanup導線/反映後の自然さ/複数候補/なぜこの候補か。実装した安全 polish(pure UI/copy・flag-gated・既存 preview が共有 banner/presenter 経由で自動取得): presenter(captureCandidatePresenter.ts)=note に「なぜ」明示(あなたとのやり取りから)+band label を reflection と一致(朝→午前/昼→午後/夕方→夜=候補↔予定の語不一致を解消)・banner(CaptureCandidateBanner.tsx)=pending「送信中…」+error 再試行ヒント(…。もう一度試せます)+複数候補に薄い区切り線(i>0 border-top)。tests: 既存 assertion を午前へ更新+A1-6-10 検証(午後/夜・note why)追加。検証: reality 667 PASS(666→+1)・自変更 tsc 新規 0(baseline 55)・service_role/DB 不接触・production 非可視(banner=realityCandidateActions flag-gated・preview=三重ガード)・既存 render-only(§9.14)/E2E(§9.15)preview 非破壊・本線配線なし・migration 0・remote 0**。**「動く」→「使いたくなる」への第一歩を低リスク UI/copy で実施・深い product gap(accept/dismiss 確認/反映自然さ/いつ文脈/複数候補/連続性演出)は別 GO に整理**。次は **残 product gap の優先付け / production rollout 段階設計(別 GO) / 他機能**。**production rollout/Home 配線/remote/migration apply は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.14 / **A1-6-9 Candidate Action E2E Functional Smoke Preview（landed・§9.15・**/plan/dev-candidate-actions-e2e で real route + real staging DB の E2E を実装 + controlled staging E2E smoke PASS・「候補→承認→DB consumed→MorningPlan反映」を browser 実証**・A1-6-9 完了）。監査: buildMorningCaptureSurface は realityCaptureSurface flag 依存(off→null)だが route の loadSurfaceableForAction は flag 非依存・E2E は triple-guard が gate ゆえ buildCaptureSurfaceFromProjected(gateAllow=true・un-gated・export 済)で surface 構築・capture RPC は SECURITY INVOKER user-RLS だが smoke 実績ある直接 insert 採用。設計: 新 page /plan/dev-candidate-actions-e2e(render-only と別ディレクトリ・三重ガード)・server actions("use server"・各 action 冒頭で三重ガード再適用[直接呼び出し対策]・auth.getUser() user-RLS・service_role なし)=setupE2ETestCandidate(sentinel seed[desired_date=2099-12-31]+evidence 直接 insert)/getE2EPreviewState(un-gated surface DTO+consumed→reflected plan・sentinel date 隔離・返り値 redacted=candidate DTO+opaque handle id plan item)/cleanupE2ETestCandidates(sentinel delete→remaining)・E2E client(banner は postCandidateAction[real route POST・browser auth cookie]・action 後 getE2EPreviewState で実 DB re-fetch=optimistic でない真値)。fake tests +13(actions 静的[三重ガード/auth/sentinel/no service_role/redaction]・page guard・client real route+re-fetch・render-only 不破壊)。controlled staging E2E smoke PASS(Playwright・real route+real DB・USER_A login・sentinel 隔離・harness untracked+削除・robust status-wait[route on-demand compile 吸収]): onE2EPage=true・cleanStart=true・accept 成功/bannerAfter=0(consumed→消える)/planItems=1(real consumed→MorningPlan反映[13:00 午後の予定（60分）])・dismiss bannerAfter=0(rejected→消える)/planItems=0(反映されない)・later planItems=0/deferredShown=true(no-op)・全 cleanup 残り 0・errors なし・独立 cleanup verify SENTINEL_ROWS_REMAINING=0。必須全充足: staging hjcr hard-pin/aljav hard-denylist/service_role 0(anon・user-RLS)/seedRef·UUID·raw·source_ref·secret を DOM·state·report 非出/smoke harness untracked+削除/cleanup後 rows=0(独立 verify)/既存 render-only preview 維持/失敗時 fail-closed(finally cleanup+guard)。検証: reality 666 PASS(653→+13)・自変更 tsc 新規 0(baseline 55)**。**accept/dismiss/later の real route + real staging DB E2E を browser で実証・初の committed DB-write server action(triple-guard+user-RLS+sentinel+cleanup)・optimistic でなく実 DB 真値を確認**。次は **CEO の staging/dev 手動 E2E 確認(REALITY_CANDIDATE_ACTIONS_DEV_HOST=true→/plan/dev-candidate-actions-e2e)/production rollout(別 GO)/gap-fit refinement(別 GO)**。**production rollout/Home 配線/remote/migration apply は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.13 / **A1-6-8 検証 host: Candidate Action UI render-only Preview（landed・§9.14・**/plan/dev-candidate-actions に staging/dev 限定 render-only preview host を追加・A1-6-8 UI を Home 非経由で browser 目視可能化**）。背景: CEO 制約(staging で Home 不使用/production 不可/GitHub 不可/smoke は /plan 等のみ)。監査: 既存 /plan は banner 非 render(DraftPlan/shift 専用)で不十分・但し /plan/dev-shift-draft の三重ガード(明示 flag+staging allowlist+production deny→notFound)+auth が前例→再利用。CEO 判断(2026-06-08)「render-only を今・E2E は別 GO」(route A1-6-6+reflection A1-6-7 staging 検証済ゆえ未検証 gap は browser interactive 挙動のみ)。実装: candidateActionsPreviewHost.ts(pure guard・devDraftHost 同 pattern・定数再利用)=isCandidateActionsPreviewHostAllowed(REALITY_CANDIDATE_ACTIONS_DEV_HOST==='true' ∧ staging ref ∧ !production ref)・page.tsx(server: 三重ガード→notFound→Client)・CandidateActionsPreviewClient.tsx('use client': fixture candidate 2件[有効 handle]+fixture MorningPlan を local state・onCandidateAction は REAL pure helper applyCandidateActionResult で local plan に optimistic add[疑似遅延で pending 目視]・失敗 toggle+リセット・real route/DB/network なし=postCandidateAction 不使用)。tests +10(guard 三重ガード全分岐/client static render: banner+buttons+plan/UUID 非出/page guard wiring/client postCandidateAction 非使用)。有効化: staging/dev で REALITY_CANDIDATE_ACTIONS_DEV_HOST=true→/plan/dev-candidate-actions 可視・production は flag 未設定で notFound(構造的不可視)。検証: reality 653 PASS(643→+10)・自変更 tsc 新規 0(baseline 55)**。**A1-6-8 UI を Home 非経由・staging/dev 限定で目視確認できる host を render-only で提供・real route/DB 不使用ゆえ zero-risk・E2E 機能 smoke は別 GO**。次は **CEO の staging/dev 目視確認(REALITY_CANDIDATE_ACTIONS_DEV_HOST=true)/E2E 機能 smoke preview(real route+real candidate・別 GO)/production rollout(別 GO)**。**E2E smoke/production/Home 配線/GitHub は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.12 / **A1-6-8 Candidate Action UI Buttons + Client Wiring（landed・§9.13・**candidate banner に accept/dismiss/later ボタン追加 + route POST + accept→MorningPlan optimistic 反映・「候補→承認→予定に出る」が UI で成立**・A1-6-8 完了）。独立評価: GPT「runtime wiring(A1-6-7)後に UI ボタン」適時・監査で基盤確認(banner live=realityCaptureSurface server flag・morningCaptureCandidate 抽出は useAlterChat L819 実装済/handle per-item で client DTO 到達[A1-6-2・redaction format-gated 保持]/setMorningPlan client-side 更新可)。設計判断: reflection=optimistic add(再取得は chat turn ゆえ不可)・reflectConsumedSeedsIntoMorningPlan(A1-6-7・client-safe)再利用で server と同一 PlanItem(id=handle・drift なし・次 server fetch で置換)・新 client flag realityCandidateActions(NEXT_PUBLIC・default-off)でボタン gate(realityConsumedReflection と staging で揃え・production 両 off)・later=no-op(item 残す)/accept=add+除去/dismiss=除去。実装: featureFlags realityCandidateActions・captureCandidateClient.ts(pure helpers: postCandidateAction[{handle,action} POST→result・fail-safe]/applyAcceptedCandidateToPlan[item→ReflectableConsumedSeed→A1-6-7 merge]/removeCandidateItem/applyCandidateActionResult[失敗·later→不変·accept→add+除去·dismiss→除去])・presenter(display item に handle)・CaptureCandidateBanner.tsx("use client"・per-item accept/dismiss/later ボタン+pending/error/deferred state・onCandidateAction 提供時のみ)・MorningPlanCard/AskHero(onCandidateAction prop-drill)・AneurasyncHome(flag-gated wiring)・useAlterChat(submitCandidateAction=POST→applyCandidateActionResult→setMorningPlan+setMorningCaptureCandidate+expose)。tests +28(postCandidateAction/applyAcceptedCandidateToPlan/removeCandidateItem/applyCandidateActionResult/banner buttons static/presenter handle/wiring static)+2 既存修正(presenter item shape・banner static string)。staging UI smoke skip(route A1-6-6+reflection A1-6-7 staging-verified 済・client contract 固定+unit-test fake が real shape 一致・optimistic add は server と同一 merge 関数=drift 不能)。必須全充足: request {handle,action} のみ✓/seedRef·UUID·raw·source_ref·secret を DOM/state 非出✓(handle opaque・static markup 非搬送)/invalid·failed 安全失敗表示✓/accept→予定反映導線✓/dismiss→item 消(rejected)✓/later no-op·deferred✓/既存 MorningPlan 表示不変✓/flag off·candidate 無で既存 UI 不変✓(onCandidateAction undefined→read-only banner)。検証: reality 643 PASS(615→+28)・alter-morning 4501 PASS(無回帰)・自変更 tsc 新規 0(baseline 55)。A1-6-8 完了: 「候補→承認→予定に出る」が UI で成立(flag on)・flag off は read-only banner(既存 UI 不変)**。**初の candidate action UI・accept→consumed→MorningPlan optimistic 反映を client で実現・flag-gated で production 不変**。次は **production rollout(realityCaptureSurface+realityConsumedReflection+realityCandidateActions を staging→canary→production・別 GO)/gap-fit refinement(別 GO)/手動 UI 確認(staging)**。**production rollout/migration apply/external_anchor/generateComplete/service_role/raw 保存/remote/大規模 UI 刷新 は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.11 / **A1-6-7 Consumed Seed → MorningPlan Runtime Wiring + Controlled Staging Computation Smoke PASS（landed・§9.12・**consumed seed[accept 済]を live MorningPlan に runtime 反映 + computation を staging hjcr で controlled に実証・DraftPlan→MorningPlan pivot**・A1-6-7 完了）。重大発見(実装前 STOP→CEO 判断): A1-6-5c/d/6 が target する DraftPlan は live computation でない(唯一 constructor=A1-6-5c merge 自身・他 comment/re-export のみ・draft-plan.ts が Wave-4 generator 本実装 明記)・user が見る live plan は MorningPlan(lib/alter-morning/types.ts・items:PlanItem[]・morning route serve)→DraftPlan に wire しても plan に出ない→CEO 判断(2026-06-08)で reflection target を DraftPlan→MorningPlan に pivot(work backward: goal=consumed seed が予定に出る→target は live MorningPlan)。設計(surgical): 新 pure merge(MorningPlan/PlanItem 版)+A1-6-5d reader 再利用(plan-type 非依存・rework は merge のみ)・flag-gating(realityConsumedReflection default-off)は既存 resolveMorningProtocolCaptureFragment 同様 helper 側に閉じる(route は PLAN_FLAGS 非 import)・serve-time のみ(route が別変数 servedMorningPlan で受け stored session=morningResponse.plan は不変)。実装: consumed-seed-morning-reflection.ts(pure・barrel 非 export)=consumedSeedToMorningPlanItem(A1-6-5b guard+label+band 配置→PlanItem[id=handle・kind=todo・what=null・fixedStart=false・startTime=band 既定・durationMin])/reflectConsumedSeedsIntoMorningPlan(additive・同日のみ・dup guard・追加 0→同一参照)/loadConsumedReflectedMorningPlan(reader 注入 composer)・morning-consumed-reflection.server.ts(server-only・barrel 非 export)=resolveConsumedReflectedMorningPlan(flag off/plan null→plan 不変・on→reader+merge・例外→fail-open plan)・route.ts(serve-time 配線: fireMorningCapture 後に servedMorningPlan 算出→morningProtocol.plan に serve・morningResponse.plan 不変)・featureFlags.ts(realityConsumedReflection=REALITY_CONSUMED_REFLECTION・server-side・default-off)。+18 fake tests(mapper guard[active/rejected/expired/duration 欠落→null]・merge[additive・同日・dup・no-op 同一参照・seedRef 非出]・composer[fake repo]・resolve flag-off=同一参照)+静的 guard 更新(serve=servedMorningPlan・source=morningResponse?.plan ?? null・plan 出力維持)。controlled staging computation smoke PASS(real DB・USER_A・hjcr・TEST_DATE 隔離・harness untracked+削除): preflight 全 PASS(hjcr hard-pin/aljav denylist/anon[role≠service_role]/pre-write rows=0)・redacted report: consumedSameDateBecomesItem=true・existingItemPreserved=true・activeNotItem/rejectedNotItem/otherDateConsumedNotItem=true・itemCount=2・consumedItemKindTodo/consumedItemWhatNull=true・consumedItemStartTime=13:00・noSeedRefInOutput=true・resolveFlagOnSameItem=true(flag-gated route-support も同一)・cleanupTestRows=0。1 つも失敗なし。必須全充足: consumed のみ item✓/active·rejected·expired·別日 混ざらない✓/accepted 後 consumed が item として読める✓/seedRef·UUID·raw·source_ref·secret 非出✓/merge additive で既存不変✓/staging hjcr hard-pin✓/aljav denylist✓/service_role 0✓/harness untracked+削除✓/cleanup rows=0✓。検証: reality 615 PASS(597→+18)・自変更 tsc 新規 0(baseline 55 不変)。A1-6-7 完了: consumed seed が live MorningPlan に runtime 反映(flag-gated・serve-time・additive・fail-open)・accept→consumed→plan item の computation 経路を real staging DB で実証・flag on で UI は route response の plan に consumed item が現れる**。**DraftPlan は非 live(Wave-4 stub)と判明し live MorningPlan に pivot・consumed seed の plan 反映を serve-time・flag-gated で実証**。次は **UI ボタン(accept/dismiss/later→route POST・別 GO)/production rollout(flag on・別 GO)/gap-fit refinement(別 GO)**。**UI ボタン/UI 変更/production rollout/migration apply/external_anchor/generateComplete/service_role/raw 保存/remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.10 / **A1-6-6 Candidate Action Route Integration + Controlled Staging Route Smoke PASS（landed・§9.11・**candidate action route {handle,action}→{ok,data} 接続 + 初の route.ts を staging で controlled に実証完了**・A1-6-6 完了）。route 配置=app/api/reality/candidate-action/route.ts(reality namespace)・auth=supabaseServer()+auth.getUser()(user-RLS・service_role なし)・surfaceable 再 read は surface と同一 pipeline(loadActiveCandidateEntries[read+enrich+lifecycle entry・surface guard 同一構築・drift なし]→selectSurfaceableCandidates[active∧fresh∧非 expired∧dedup]→SurfaceableCandidate[]・seedRef は server-side のみ)・envelope=NextResponse.json({ok,data})/{ok:false,error}(malformed JSON→400/no auth→401)。実装: candidate-action-route-support.ts(server-only・barrel 非 export)=loadSurfaceableForAction(surfaceable 再 read)+runCandidateActionRoute(handleCandidateActionRequest+{ok,data} envelope)・app/api/reality/candidate-action/route.ts(POST 薄い wrapper: req.json→auth→surfaceable 再 read→real status-only executor→runCandidateActionRoute→NextResponse)。+11 fake tests(runCandidateActionRoute: accept/dismiss/later→{ok,data}・invalid handle/action/no candidate/non-active/status_conflict fail-closed・seedRef 非出/loadSurfaceableForAction: active fresh→surfaceable・seed なし→[]・stale→除外)。controlled staging route smoke PASS(real DB・USER_A・hjcr・TEST_DATE 隔離・harness untracked+削除): preflight 全 PASS(hjcr hard-pin/aljav denylist/anon/service_role 0/USER_A sign-in/pre-write rows=0)・redacted report: acceptViaRouteOk=true・acceptResponseNoSeedRef=true・mergedItemCount=1(originSeed/noSeedRef true)・dismissViaRouteOk=true・rejectedNotMerged=true・laterViaRouteDeferred=true・laterNoWrite_seedCActive=true・invalidHandle/invalidAction/noCandidate/duplicate FailClosed=true・cleanupTestRows=0。1 つも失敗なし。必須全充足: request {handle,action} のみ✓/response に seedRef·UUID·raw·source_ref·secret 非出✓/auth user 以外の seed 操作不可✓(RLS)/invalid·no candidate·non-active fail-closed✓/accept→consumed✓/dismiss→rejected✓/later no-op✓/from=active guard 維持✓/cleanup rows=0✓/staging hjcr hard-pin✓/aljav denylist✓/service_role 0✓/harness untracked+削除✓。検証: reality 597 PASS(586→+11)・自変更 tsc 新規 0(baseline 55 不変)。A1-6-6 完了: candidate action route 接続+handle-based 全 flow(request→surfaceable 再 read→resolve→decide→status-only executor→redacted response→consumed reader→DraftPlan merge)を route 経由+real staging DB で実証**。**初の route.ts 接続で status→consumed→DraftPlan reflection の本流を route 経由で動作確認。UI は後で route を叩くだけ**。次は **UI ボタン(accept/dismiss/later・別 GO)/reflection を morning pipeline の DraftPlan 組成に配線(別 GO)/gap-fit refinement(別 GO)/production rollout(別 GO)**。**UI ボタン/UI 変更/production/migration apply/external_anchor/generateComplete/service_role/raw 保存/remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.9 / **A1-6-5d Part 2 Consumed Reader + Controlled Staging Smoke PASS（landed・§9.10・**consumed seed real reader + 初の実 DB-write を staging hjcr で controlled に検証完了**・A1-6-5d 完了）。real reader(consumed-seed-repository-supabase.ts・server-only・barrel 非 export): createConsumedSeedRepository(client,userId)=consumed plan_seeds(SEED_COLUMNS_SQL).eq(user_id).eq(status,consumed)+duration_evidences(projectDurationEvidenceRowsToMap・high のみ)→ReflectableConsumedSeed(durationMin=evidence/date/band/actionShape=row/handle=deriveCandidateHandle[seedRef 非出])・column-restricted(raw/source_ref なし)・consumed のみ・read-only(select/eq/in/limit)・user-RLS・service_role なし。+7 fake tests(mock client: consumed→ReflectableConsumedSeed[handle・durationMin enrich・seedRef 非出]/query 構築[eq status=consumed・in seed_id]/evidence なし→durationMin null/anytime→band null/consumed なし→[]/静的)。controlled staging smoke PASS(real DB・USER_A・hjcr・TEST_DATE 隔離・harness untracked+実行後削除): preflight 全 PASS(GO/host=hjcr≠aljav[PROD denylist+STAGING allowlist]/anon role/service_role 0/USER_A sign-in/pre-write test rows=0)・redacted report(counts/booleans のみ): createdSeeds=3・acceptOk=true(active→consumed)・consumedReadTestCount=1・mergedItemCount=1(originSeed/genericLabel/noSeedRef すべて true)・dismissOk=true(active→rejected)・rejectedNotInConsumed=true・rejectedNotMerged=true・laterNoWrite_seedCActive=true・guardDuplicateFailClosed=true・guardNonActiveFailClosed=true・cleanupTestRows=0・cleanupOk=true。1 つも失敗なし。必須全充足: staging/hjcr hard-pin✓/aljav denylist✓/service_role 0✓/pre-write rows=0✓/accept→consumed✓/consumed→DraftPlan item merge✓/dismiss→rejected✓/rejected は item にならない✓/later→DB write 0✓/from=active guard で duplicate·non-active fail-closed✓/cleanup 後 rows=0✓/raw·seedRef·secret 非出✓/harness untracked+削除✓。検証: reality 586 PASS(573→+13: executor 6+reader 7)・自変更 tsc 新規 0(baseline 55 不変)。A1-6-5d 完了: status→consumed→DraftPlan reflection の本筋を real staging DB で実証完了**。**status-only accept/dismiss/later の real executor + consumed reader + merge が実 DB で動作確認。誤設計(external_anchor)を排し status-only に修正後、初の実 DB-write を controlled に通した**。次は **route 接続(action route + reflection を morning pipeline の DraftPlan 組成に配線)/UI ボタン/gap-fit refinement(別 GO)**。**route 接続/route.ts/UI/production/migration apply/external_anchor/generateComplete/service_role/raw 保存/remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.8 / **A1-6-5d Part 1 Real Status-only Executor + audit（landed・§9.9・**real status-only executor[DB-write primitive]+包括 feasibility audit・実 DB write は controlled staging smoke で gated 次段**）。独立評価: GPT「real executor+smoke」妥当・前回 A1-6-5 blocker(reflection misdesign)は A1-6-5a/b/c で解消・accept は単一条件付き UPDATE(status-only)。feasibility audit 全 PASS: auth=.env.local STAGING_USER_A(staging test user)+anon key・service_role var なし/plan_seeds RLS owner select·insert·update·delete 全 present(cleanup feasible)/columns plan_seeds=id·desired_date(DATE)·desired_time_hint(band)·action_shape·confidence·status·source·source_ref・duration は別 table duration_evidences(enrich 要)/staging apply 済(A1-5-2-2-2b)・refs hjcr=staging/aljav=production(devFixtureHost canonical)/smoke pattern=reality-real-read-smoke.ts(belt-and-suspenders preflight)但し .env.staging.local 未設定。real executor(plan-seed-status-executor.ts・server-only・barrel 非 export): createStatusOnlyExecutor(client)=applyStatusTransition(seedRef,from,to)=UPDATE plan_seeds SET status=to WHERE id=seedRef AND status=from→select(id)・ok=更新行≥1・status 列のみ(generateComplete/anchor なし)・from=active guard(0 rows→ok=false 並行/non-active fail-closed)・user-RLS client 注入・service_role なし・INSERT/DELETE なし。+6 fake tests(mock client: accept/dismiss/0 rows→ok=false/error→ok=false/静的 server-only·no generateComplete/anchor/createClient/service_role/insert/delete)・自変更 tsc 新規 0(baseline 55 不変)。実 DB read 0/write 0/RPC 0/route 0/UI 0/migration 0/production 0/external_anchor 0/generateComplete 0/service_role 0/remote 0**。**status-only real executor(DB-write primitive)を fake 検証し確立(条件付き UPDATE・from=active guard・status のみ)。実 DB write proof は controlled staging smoke=gated 次段(初 DB-write ゆえ focused 運用・.env.staging.local 要設定)**。次は **Part 2: consumed reader 実装(plan_seeds consumed read+duration_evidences enrich→ReflectableConsumedSeed)+controlled staging smoke(create→accept→consumed→read→merge→dismiss→rejected→later no-op→from=active guard→cleanup→rows=0・belt-and-suspenders guard)**。**実 DB write/route/UI/production/remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.7 / **A1-6-5c Consumed Seed → DraftPlan Merge Skeleton（landed・§9.8・**consumed seed を DraftPlan に additive merge する read/computation 骨格・repository 注入 + pure merge・実 DB read/write/route/UI 不変**）。独立評価: GPT「read/computation 骨格」妥当・A1-6-4 executor パターン(interface 注入+fake)を read 側に適用・real read を repository に閉じれば merge semantics を DB なしに検証・live は real repository 注入だけ。監査: DraftPlan={id,userId,date,level,items:DraftPlanItem[],generatedAt,generatedBy,basedOn,status}・DraftPlanItem={id,startTime:HH:MM,endTime?,title,origin:anchor/seed/rhythm_inferred,rigidity:hard/soft/suggestion,reason?,confidence}・node id は opaque handle(A1-6-1 deriveCandidateHandle・seedRef-free)・startTime format=HH:MM(既存 formatMinutes[timeline-geometry pure]再利用=DRY)・origin=seed(DraftPlan 内 seed-origin=承認済み・active は surface 側)・rigidity=suggestion(band-level movable)。pure 実装(consumed-seed-merge.ts・barrel 非 export): ReflectableConsumedSeed(=ConsumedSeedReflectInput+handle・seedRef なし)・ConsumedSeedRepository(read 注入 interface・live=DB/test=fake・呼ぶだけ)・consumedSeedToDraftPlanItem(A1-6-5b guard+label/time→DraftPlanItem[id=handle・HH:MM・origin=seed]/非 reflectable→null)・mergeConsumedSeedsIntoDraftPlan(additive[既存 items 末尾追加・他 field 不変・basedOn 不触]+date filter[同日のみ・undated/他日除外]+duplicate guard[既存 handle 再追加しない・idempotent]+対象なし→同一参照)・reflectConsumedSeedsIntoDraftPlan(repository 注入で read→merge composer)。+15 fake-repo tests(transform/additive[既存同一参照・他 field 不変]/date filter/duplicate guard/二層分離/composer/redaction/静的)・reality 573(558→+15)・自変更 tsc 新規 0(baseline 55 不変)。必須充足: consumed のみ DraftPlan item✓/active は surface 側に残る✓/expired·rejected·active 誤混入なし✓/additive で既存破壊なし✓/seedRef·UUID·raw·source_ref 非出✓(id=opaque handle)/generic label 非断定✓。実 DB read 0/DB write 0/RPC 0/route 0/UI 0/migration 0/production 0/raw 保存 0/external_anchor 0/remote 0**。**consumed seed→DraftPlan additive merge の骨格確立(二層分離・opaque handle id・date filter・duplicate guard・additive・seedRef 非出)。real repository 実装+pipeline 配線+gap-fit refinement は live slice**。次は **real ConsumedSeedRepository(plan_seeds status='consumed' read・seedRef→handle)+reflectConsumedSeedsIntoDraftPlan を morning pipeline 配線+gap-fit refinement+undated→today(live computation・DB read・別 GO)**。**実 DB read/DB write/RPC/route/UI/migration/production/raw 保存/external_anchor/remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.6 / **A1-6-5b Consumed Seed → DraftPlan Reflection（landed・§9.7・**consumed seed を DraftPlan に反映する pure 設計 + helper・raw 不使用・generic label・二層モデル・DB write/route/UI 不変**）。二層モデル: active seed→candidate surface(A1-5・不変・surface 側に残す)/consumed seed→確定 plan item(本 module・accept 済ゆえ committed)。generateComplete を使わない判断(独立推論): generateComplete(gap-fitting)は full day context=live read 必要で pure にならず・governance も proposed/tentative で確定 item に不適→consumed 専用 builder で band 既定配置+確定・gap-fitting は live 後段 refinement に分離。監査: TimeBand=morning/afternoon/evening・TimeWindow={band}のみ(clock なし)・time は分(0-1440)・ActionShape 8 値は approach/commitment で活動内容を断定しない(label 非断定修飾に安全)・seed-source は status='active' 固定→consumed reader は別経路(live)。pure helper(consumed-seed-reflection.ts・barrel 非 export): ConsumedSeedReflectInput(seedRef/raw 持たない)・isConsumedReflectable(consumed∧duration>0 のみ・fail-closed)・bandDefaultStartMin(morning540/afternoon780/evening1080/anytime720・pure default・live override 可)・buildGenericPlanLabel(構造のみ「{帯}の予定（{分}{・非断定 commitment}）」・raw 不使用)・consumedSeedToPlanItem(consumed→ConsumedPlanItem{label,startMin,endMin,date,band,confirmed}・seedRef/id 出さない・非 reflectable→null)・selectConsumedPlanItems(consumed のみ filter)。+18 pure tests(guard/band 既定/generic label 非断定/transform null guard/clamp 1440/select/redaction/静的)・reality 558(540→+18)・自変更 tsc 新規 0(baseline 55 不変)。必須充足: raw 発話なしで成立✓/generic label 過度に断定しない✓/consumed のみ確定 item 化✓/active は surface 側に残す✓/expired·rejected·active 誤 item 化しない✓/seedRef·UUID·raw·source_ref 非出✓。DB write 0/consumed reader 実装 0/RPC 0/route 0/UI 0/migration 0/production 0/raw 保存 0/external_anchor 0/remote 0**。**consumed seed→確定 plan item の pure 変換確立(二層分離・consumed 専用 builder・band 既定配置・generic 非断定 label・fail-closed guard・seedRef 非出)。live computation 統合(consumed reader+DraftPlan merge+gap-fit refinement)は別 slice**。次は **consumed reader 実装 + DraftPlan merge + gap-fit refinement(live computation・DB read・別 GO)**。**DB write/consumed reader 実装/RPC/route/UI/migration/production/raw 保存/external_anchor/remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.5 / **A1-6-5a Accept Reflection Correction（landed・§9.6・**A1-6-3/A1-6-4 の誤った plan_reflection op を削除し status-only に修正・DB write/route/UI 不変**・CEO 暫定方針 status-only accept）。CEO 暫定方針: accept=status consumed のみ/external_anchor 使わない/generateComplete を executor で呼ばない/consumed seed は read/computation 側で DraftPlan 反映/初期 label は privacy-safe generic/raw・source_ref 保存しない/richer label・user naming は後続。監査: PlanReflectionOperation/applyPlanReflection/plan_reflection/reflection_failed は本流 2 ファイル+test のみ(外部消費者なし)→安全削除。修正(surgical・2 source+2 test): candidate-action-orchestrator(PlanReflectionOperation 削除・CandidateOperation=StatusTransitionOperation・CandidateOperationPlan に reflectsToPlan 追加[outcome 伝播・response フラグ]・planCandidateActionOperations は status_transition のみ push→accept=[status(active→consumed)]+reflectsToPlan true/dismiss=[status(active→rejected)]/later=[])・candidate-action-executor(applyPlanReflection 削除[applyStatusTransition のみ]・executeCandidateOperationPlan は reflection 分岐削除・reflectsToPlan は plan 伝播・reflection_failed 廃止→status UPDATE のみ・anchor write なし)。tests 修正: A1-6-3(accept→status のみ・reflectsToPlan 検証・redaction に external_anchor/plan_reflection 非出)・A1-6-4(fakeExecutor から reflection 削除・fail-stop test 削除・status_conflict は status のみ call・reflectsToPlan plan 伝播)。reality 540(541→-1=fail-stop test 削除・回帰 0)・自変更 tsc 新規 0(baseline 55 不変)。必須充足: accept は consumed のみ✓/dismiss は rejected のみ✓/later は no-op✓/reflection·anchor·generateComplete を executor から完全除去✓/response に seedRef·UUID·raw·source_ref 非出✓/existing tests を新設計に整合✓。DB write 0/RPC 0/route 0/UI 0/migration 0/production 0/external_anchor 0/raw 保存 0/remote 0**。**誤設計の plan_reflection を除去し executor は status-only で大幅単純化・安全化。accept=status→consumed のみで reflection は read/computation 側の責務に分離**。次は **consumed seed → DraftPlan computation の pure 設計(reflection の read 側)**。**DB write/RPC/route/UI/migration/production/external_anchor/raw 保存/remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.4 / **A1-6-5R Candidate→Plan Reflection 設計修正（no-write design・§9.5・accept reflection の正しい永続化を pure 設計・A1-6-5 real executor は CEO 判断で保留）。監査で A1-6-3/A1-6-4 が design から引き継いだ misdesign 判明: accept=status→consumed+plan_reflection(generateComplete→create_external_anchor_bundle)は成立しない[①型不一致: generateComplete=gap-fitting 可動 CandidateDraft vs create_external_anchor_bundle=固定 ExternalAnchor ②title 源なし: external_anchors title 必須・seed は column-restricted ③時刻なし: candidate は band のみ ④table 用途違い: external_anchors=確認済み外部 import(confirmed_at 不変条件)]。データモデル監査: plan は computed(draft_plan/plan_item table なし)・PlanSeedStatus consumed=「DraftPlan に組み込まれた」・既存 read は active のみ(consumed 組込 read 未実装)・status 遷移 write も未実装(capture-write-policy が future slice 明記)。正しい reflection モデル(修正案): accept に別 reflection write(anchor)は不要・reflection=status→consumed + DraftPlan computation が consumed seed を組み込む。executor(write)=status のみ(accept→consumed/dismiss→rejected/later→no-op・generateComplete も anchor write も executor で呼ばない)・reflection(read/computation)=DraftPlan computation が consumed seed を読み plan item render(generateComplete は computation 側 gap-fitting)・external_anchor は無関係(外部 import 専用)。A1-6-3/A1-6-4 修正(resume 時・本スライスでは code 不変): plan_reflection op 削除(accept=[status_transition(active→consumed)]のみ)・applyPlanReflection 削除(applyStatusTransition のみ)→executor 大幅単純化・安全化。未解決 product/privacy(CEO へ surface): consumed seed の label(column-restricted で raw 捨てた・generic/最小 label/accept 時命名)・plan computation を consumed 読みに拡張・band→time placement・accept UI 性質。code 変更 0/DB write 0/real executor 0/migration 0/production 0**。**accept reflection は anchor write でなく status→consumed + computed DraftPlan の consumed 組込が正・executor は status-only で大幅単純化。A1-6-3/A1-6-4 の plan_reflection は誤設計→resume 時削除**。次は **product/privacy 判断(label/consumed read 拡張/placement) → reflection computation 設計 → A1-6-3/A1-6-4 修正 → A1-6-5 resume(status-only executor + smoke)**。**code 変更/DB write/real executor/migration/production/remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.3 / **A1-6-4 Candidate Action Executor / Route Contract Skeleton（landed・§9.4・**operation plan の実行を executor 注入で no-write 検証・request/response contract・実 DB write も route 接続も UI もしない**）。独立評価: GPT「executor interface + fake で order/fail-stop/redaction 検証」妥当(executor を DI 分離→実行 semantics を DB なしに検証・live route は real executor 実装+配線だけの薄い層・DB-write 境界ロジック最小化)。順序と atomicity を深く再検証: reflection-first(A1-6-3)は非 atomic で 2 失敗モードの深刻度比較[「consume したのに plan 無反応(intent 喪失・回復不能)」≫「重複 anchor(dismiss で回復可・並行 submit 稀)」]ゆえ正しい・但し重複 anchor を真に無くすには executor primitive contract(applyPlanReflection は seedRef で冪等・applyStatusTransition は from=active atomic)が要る→文書化し真の atomicity は live executor(transaction/冪等 RPC)の責務。監査: plan_seed status 更新 path 未実装→applyStatusTransition は planned primitive・create_external_anchor_bundle(p_user_id,p_source,p_anchors)auth.uid()guard→live applyPlanReflection は generateComplete→draft→RPC・response envelope={ok,data}。実装: candidate-action-executor.ts(server-only・no-write・barrel 非 export)=CandidateActionExecutor interface(applyPlanReflection/applyStatusTransition→{ok})・executeCandidateOperationPlan(plan を順に実行・fail-stop・redacted・reflection 失敗→reflection_failed[status しない]・status 0 rows→status_conflict[from=active guard])・handleCandidateActionRequest(route skeleton=resolveAndDecideAction→planCandidateActionFromResolution→execute・未解決→executor 呼ばず redacted fail・seedRef は executor へのみ)。+12 fake-executor tests(accept reflection→status 順/fail-stop/status_conflict/dismiss/later no-op/fail-closed unresolved·非 active·malformed→executor 呼ばない/redaction response に seedRef 非出·calls に seedRef あり/harness 単体)・reality 541(529→+12)・自変更 tsc 新規 0(baseline 55 不変)。real executor 0/実 DB write 0/実 status update 0/実 reflection 0/route 0/UI 0/migration 0/production 0/service_role 0/remote 0**。**operation plan の実行 semantics(順序 reflection→status・fail-stop・status_conflict from=active guard・fail-closed・redacted)を fake executor で DB なしに確立・route handler skeleton(request {handle,action}→response) 確定。real executor/route.ts/UI は別 slice の危険境界**。次は **real executor 実装(applyPlanReflection=generateComplete→create_external_anchor_bundle・applyStatusTransition=plan_seed UPDATE owner-RLS・atomicity/冪等・DB write 境界・別 GO) + action route.ts(別 GO) + UI ボタン(別 GO) + live useAlterChat wiring(別 GO)**。**real executor/実 DB write/実 status update/実 reflection/route 接続/route.ts 変更/UI/migration/production/service_role/remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.2 / **A1-6-3 Candidate Action Server Orchestrator / No-write Plan（landed・§9.3・**accept/dismiss/later の server 実行を operation plan として pure に固める・no-DB・no-execution・実行は plan に留める**）。独立評価: GPT「server 実行を op plan に固める」方向妥当(pure 決定[A1-6-0/1/2]と live 実行[route+DB write]の継ぎ目・固めれば live route は plan dispatch の薄い executor 化・DB-write 境界ロジック最小化)。op plan の価値: from-status guard(楽観的並行制御)+reflection KIND 明示+順序付き op 列(fail-stop)+action→server ops を 1 pure 場所に集約=実行契約。GPT の順序前提に疑義→accept は reflection(anchor)を先・status(consume)を後(anchor 失敗時に consume しない=seed active retryable・「consume したのに plan 無反応」防止)。監査: create_external_anchor_bundle(20260519100000)は external_anchor_sources/external_anchors のみ insert・plan_seed 不触→anchor write と consume は別 op(二重 consume なし)・seed status update 未実装(本 arc 設計)=status_transition は route 実装の planned intent・generateComplete(A1-4)=CompleteInput→CandidateDraft|null。op plan(pure・redacted): CandidateOperation=status_transition{from,to}(enum・seedRef なし)|plan_reflection{reflection:external_anchor}(KIND のみ・draft なし=id complete-{seedRef}が seedRef 持つ→route 実行時生成)・CandidateOperationPlan={accepted,reason,operations[],deferred}。planCandidateActionOperations(outcome): valid→reflection 先+status 後/invalid→fail-closed・planCandidateActionFromResolution(resolution): seedRef 読まず・unresolved→fail-closed。対応: accept→[reflection,status(active→consumed)]/dismiss→[status(active→rejected)]/later→[]+deferred/非 active·unresolved→fail-closed。実装: candidate-action-orchestrator.ts(pure・no-DB・no-execution・barrel 非 export・type-only import)。+12 pure tests・reality 529(517→+12)・自変更 tsc 新規 0(baseline 55 不変)。DB write 0/RPC 0/status update 実行 0/reflection 実行 0/route 0/UI 0/migration 0/production 0/service_role 0/remote 0**。**accept/dismiss/later の server 実行契約を pure・tested に確立(op plan・安全順・from-status guard・fail-closed・seedRef 非出)。実 status update/実 reflection/route 接続/UI は別 slice の危険境界**。次は **live route(request→resolveAndDecideAction→planCandidateActionFromResolution→op 実行[status update+reflection]→redactResolutionForClient・別 GO・DB write 境界) + UI ボタン(別 GO) + live useAlterChat wiring(別 GO)**。**DB write/RPC 実行/status update 実行/reflection 実行/route 接続/route.ts 変更/UI/migration/production/service_role/remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.1 / **A1-6-2 Candidate Handle Surface Propagation（landed・§9.2・**opaque handle を surface DTO→client request builder まで安全に流す・pure・no-UI・no-route・no-DB**・seedRef/UUID 非出・banner dormant 維持）。独立評価: GPT「handle を client まで流す」方向妥当だが、client 抽出は dormant(A1-5-15)・live wiring すると banner 出現=UI 表示変更=GPT 制約と矛盾→整合解: DATA パイプライン構築 + live wiring は UI slice 遅延(「handle が client に届く」は extractor 出力が handle 運ぶで満たす・banner dormant 維持で no UI change 絶対遵守)。設計(純度境界): handle 導出は server-side のみ(node:crypto)・candidate-surface(pure)/assembler(client-safe)は crypto 非 import。presentCandidateSurface に deriveHandle 注入(pure 維持)・server-only bridge が deriveCandidateHandle 渡す・redaction は handle を形式一致時のみ保持(inline regex・defense-in-depth)。変更(surgical): CandidateSurfaceItem.handle? optional(未注入=既存不変)・toCandidateSurfaceItem/presentCandidateSurface に deriveHandle?・consumption-surface-bridge が deriveCandidateHandle 注入(live surface が handle 運ぶ・flag-gated・production 不可視)・redactSurfaceItem が handle 形式一致時のみ保持・captureCandidateClient に buildCandidateActionRequest(pure・{handle,action}・seedRef なし)。往復整合: surface handle=deriveCandidateHandle(seedRef)→A1-6-1 resolveCandidateHandle で解決可能。+15 pure tests・reality 517(502→+15)・wave3PlanRoute 13(route 回帰 0)・自変更 tsc 新規 0(baseline 55 不変)。live wiring 0/UI 変更 0/action route 0/DB write 0/RPC 0/migration 0/production 0/service_role 0/remote 0**。**handle が surface DTO(server 導出・redacted)→client request builder(opaque) まで流れる pure パイプライン確立(seedRef 非搬送・形式 validate・往復整合)。live wiring(banner 出現)/action route/status update/plan 反映/UI ボタンは別 slice の危険境界**。次は **live useAlterChat wiring + action route + 実 status update + 実 plan 反映 + UI ボタン(別 GO)**。**live wiring/UI 見た目変更/action route/route.ts 変更/DB write/RPC/migration/production/service_role/remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§9.0 / **A1-6-1 Candidate Action Handle / Request Contract（landed・§9.1・**opaque handle + 解決方針・pure・no-DB・fake tests**・client に seedRef 出さず candidate 操作を成立）。opaque handle 設計(案比較): 採用=一方向 hash 再導出(handle=c1:+sha256(seedRef)・stateless/secretless/RLS-scoped/fail-closed・client は seedRef 持たず偽造不能・server は surfaceable seed 再 read+再導出で照合)。却下=署名/暗号トークン(secret 鍵要)・stateful mapping(storage=DB write 要)。request contract: {handle, action}・validate fail-closed(not_object/invalid_handle/invalid_action)。解決(surfaceable のみ・race-safe): handle→現在 surfaceable に照合・不在→unresolved(stale/expired/consumed/unknown=操作不可)・表示〜操作間 race は再 guard で fail-closed。decision 接続: resolve→decideCandidateAction(A1-6-0 idempotency)。redaction: resolved.seedRef は server-side のみ(live path 用)・client response は redactResolutionForClient で {accepted,reason,reflectsToPlan,deferred} のみ(seedRef/nextStatus 非出)。pure 実装: candidate-action-handle.ts(server-only・deterministic・deriveCandidateHandle/validateActionRequest/resolveCandidateHandle/resolveAndDecideAction/redactResolutionForClient・surfaceable 注入)。+23 pure tests(handle 一方向/validate/resolve fail-closed/decide/redaction/静的)・reality 502。自変更 tsc 新規 0(reality lib 0・baseline 55 不変)。DB write 0/RPC 0/route 0/UI 0/surface DTO 変更 0/production 0/service_role 0/remote 0**。**client に seedRef 出さず操作成立する handle/contract/解決/redaction の pure 確立(一方向 hash・surfaceable のみ解決・fail-closed・redacted)。実 DTO 付与/route/status update/plan 反映/UI は別 slice の危険境界**。次は **surface DTO への handle 付与 + action route + 実 status update + 実 plan 反映(live path・DB write・別 GO) / UI banner ボタン(別 GO)**。**DB write / RPC 実行 / route shell 実行 / UI 変更 / surface DTO 変更 / migration / production / service_role / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§8.67 / **A1-6-0 Candidate → Plan Action Foundation（landed・§9.0・**pure decision + 最小本流設計**・captureCandidate を「表示」から「予定反映できる候補」へ・no-production/no-write/fake tests）。本流設計: surfaced candidate(A1-5 capture surface)→user 操作(accept/dismiss/later)→seed status 遷移 + plan 反映。operations: accept→consumed(plan 反映)/dismiss→rejected/later→active 維持(deferred 再 surface)。status transition(A1-5-12 未実装→本 arc 設計): active→consumed/rejected・later 維持・idempotency(非 active→no-op 二重操作防止)・実 update は owner-RLS(別 slice)。plan 反映経路(accept): candidate→seed→SeedPlacement→generateComplete(A1-4)→create_external_anchor_bundle RPC(別 slice live path・DB write 境界)。boundary: client は redacted candidate(seedRef なし)→opaque handle で server 解決(handle は別 slice・seedRef 非露出維持)。UI: banner accept/dismiss/later additive(client display dormant〔A1-5-15〕ゆえ live 化は別 slice)。pure foundation: candidate-action.ts(decideCandidateAction・isActionableStatus・isValidActionKind・barrel 非 export・raw/UUID 非出)。+14 pure tests(active 操作/idempotency/未知 action/redaction/deterministic)・reality 479。自変更 tsc 新規 0(reality lib 0・baseline 55 不変)。DB write 0/production 0/route 0/UI 0/remote 0**。**candidate→plan action の pure foundation + 最小本流設計確立(accept/dismiss/later→status 遷移 + 反映意図・idempotency)。実 status update/実 plan 反映/handle/route/UI live は別 slice の危険境界**。次は **opaque candidate handle 設計(pure・別 GO) / 実 status update + plan 反映(live path・DB write・別 GO) / client display + action UI live 化(別 GO)**。**実 DB write / 実 status update / 実 plan 反映 / route shell 実行 / UI 変更 / production / migration / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・seedRef を client に出さない・production hard block を全段で維持する。

> A1-5-0…§8.66 / **A1-5-15 Production Canary Final Preflight（landed・§8.67・**planning/audit・doc-only・no-production/no-write**・production env 設定前の最終確認 + runbook）。成果物=docs/reality-production-canary-runbook.md(env 一覧/canary user/rollback/monitoring/DB 監視/STOP/段階実行手順)。最終確認: env→PLAN_FLAGS→resolver→gate chain 整合。env 名=REALITY_CAPTURE_PRODUCTION_CANARY(production lane 中核)/CANARY_USER_IDS(reality 専用・auth UUID)/LIVE(write)/OBSERVE(dry-run)/SURFACE/KILL(rollback)。env 未設定→production block(A1-5-13/14 test-locked)。**重要所見: client banner display は DORMANT**(selectMorningProtocolCaptureCandidate 未 call・useAlterChat.morningCaptureCandidate 未抽出・grep 確証)→production canary は backend-only(capture write + surface server-side + DB)・user UI 不変(最保守 canary・banner は別 slice)・NEXT_PUBLIC_REALITY_CAPTURE_SURFACE_CLIENT 不要(dormant)。段階導入: Phase1 observe(実 DB write 0・gate+extractor 検証・non-canary→gate_blocked)→Phase2 live write(実 RPC・suppress/TTL)→Phase3 surface(任意・user 不可視)。rollback=KILL 最優先 or flag off(module-load ゆえ redeploy 要・instant でない)・構造 backstop=productionCanaryEnabled 無ければ block。monitoring=redacted observe sink([reality.capture.observe])+DB(canary user の seed/evidence 件数・dedup で増えない・expired bounded)。STOP=non-canary write/RPC error/row 急増/secret 出力/意図せぬ allow/production 障害。production 接触 0/DB write 0/env 変更 0/コード変更 0(doc-only)/remote 0**。**production canary ON は purely env(A1-5-14 でコード完了)・実行は A1-5-16(CEO 手動・runbook 準拠)。canary は backend-only(user UI 不変)が最保守**。次は **A1-5-16 Production Canary ON(env 設定 + deploy + 監視・security-reviewed 別 GO) / user-facing banner 配線(別 GO) / cleanup·status transition·partial unique(scale 前・別 GO)**。**production ON / production env 変更 / production 接続 / migration / PRM·correction 実接続 / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.65 / **A1-5-14 Runtime Resolver Wiring（landed・§8.66・**gate scaffold を runtime resolver に接続・default-off / production挙動変更0**・production ON しない）。A1-5-13 の production canary gate scaffold を resolveMorningObserveGate(capture write)+resolveSurfaceGate(surface read)へ最小配線: opts に productionCanaryEnabled?/realityCanaryUserIds? 追加・output へ ?? false/?? [] で concrete 化・caller(fireMorningCapture/buildMorningCaptureSurface)が PLAN_FLAGS.realityCaptureProductionCanary + realityCanaryUserIds を渡す。default-off: env 未設定→false/[]→gate production lane 開かず→production block(既存 EXACTLY)・staging は production flag に影響されず既存通り・kill 最優先維持。+13 pure tests(resolver→evaluateCaptureGate composition: env 未設定+prod ref→block/flag true+reality 該当→allow/non-canary→block/shared だけ→block(reality list 必須 no-fallback)/kill→block/staging→既存 allow)+既存 resolver toEqual 更新+static(caller PLAN_FLAGS 配線)・既存 service/observe/surface 不変・reality 465。自変更 tsc 新規 0(reality lib 0・full baseline 55 不変)。production ON しない(env 未設定→production block)・production 接続 0・DB write 0・remote 0・production 挙動変更 0**。**gate scaffold が runtime に接続・env 設定だけで armable・production 不変**。次の production canary ON は purely env(REALITY_CAPTURE_PRODUCTION_CANARY + CANARY_USER_IDS + LIVE/SURFACE + production deploy + 監視・security-reviewed 別 GO)・コード変更不要。次は **production canary ON(env + 監視・別 GO) / cleanup·status transition·partial unique(scale 前・別 GO) / feat 同期**。**production ON / production 接続 / env 設定 / migration / PRM·correction 実接続 / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.64 / **A1-5-13 Production Canary Gate Scaffold（landed・§8.65・**gate capability + flags + tests・default-off / production挙動変更0**・runtime 配線は別 slice）。evaluateCaptureGate を 2-lane 化: PRODUCTION CANARY lane(productionCanaryEnabled ∧ aljav ref・reality 専用 canary list 必須・shared へ fallback しない)+DEFAULT/STAGING lane(既存挙動 EXACTLY)。新 input optional(productionCanaryEnabled?/realityCanaryUserIds?・default-off ゆえ既存 caller/test 不変)。canary 優先=reality 専用 list 非空→優先使用(PLAN_CANARY_USER_IDS 依存減)・空→staging のみ shared fallback・production は reality list 必須。新 flags scaffold(realityCaptureProductionCanary/realityCanaryUserIds・REALITY_CAPTURE_PRODUCTION_CANARY/CANARY_USER_IDS)は runtime resolver 未配線=設定しても production capture 起きない(dead-safe scaffold)。多重 production allow: !killed∧live∧productionCanaryEnabled∧aljav∧reality canary 該当・env 未設定→必ず block。設計判断: scope=gate+flags+tests(resolver 配線は activation 別 slice)/新 reason code 無し(aljav not-armed→PRODUCTION_PROJECT_REF 既存維持)/ref を nodeEnv 先評価(lane 分岐・fail-closed 不変)。+14 pure tests(default block/kill/flag missing/allow/non-canary/reality 空 no-fallback/kill·flag 優先/staging lane/precedence/shared fallback/production 挙動変更0/UUID 非出力)・既存 gate 11+service/observe/surface 不変・reality 452。自変更 tsc 新規 0(reality lib 0・full baseline 55 不変)。production 挙動変更 0(env 未設定→production block・既存 EXACTLY)・production ON しない(runtime 未配線/env 未設定)・DB write 0・remote 0**。**production canary の gate capability を default-off で確立(明示多重・reality list 分離)・production 不変**。次は **gate scaffold の runtime 配線(resolver→gate・activation・default-off・別 GO) → production canary ON(env 設定 + 監視・security-reviewed 別 GO) / feat 同期**。**runtime 配線 / env 設定 / production ON / gate を実際に開ける / migration / PRM·correction 実接続 / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.63 / **A1-5-12 Production Canary Readiness Bundle（landed・§8.64・**planning/audit・doc-only・no-production/no-write**・production canary 前の運用/安全/rollback/migration を判定）。中核所見: capture/surface は **構造的 staging-only**=evaluateCaptureGate が production を 3 重 block(nodeEnv=prod / ref=aljav denylist / ref∉[hjcr] allowlist)・surface も同 gate 共有→現コードで production 到達不能・realityCaptureGate.test で test-locked。→「production canary」は gate allowlist に production ref を加える deliberate code 変更が前提(=production ON 本体・別 GO)。各次元: flags/gate/kill ✅(default-off・module-load・kill 最優先・fail-closed)/canary ⚠(PLAN_CANARY_USER_IDS が personalModelIntegration V2 と共有=結合)/rollback ⚠(flag off or KILL だが module-load ゆえ redeploy 要・instant でない・production は gate staging-only が構造的 rollback)/logging ✅(redacted observe sink のみ・raw 非出力)/DB 蓄積 ⚠(write dedup で同構造防止・expired 残るが canary bounded)/status transition ❌(未実装・seed 永久 active・surface guard が表示除外のみ・design-only)/cleanup ❌(job 無し・active_expiry partial index + cron infra 在り・design-only)/partial unique ❌(unique 無し・read-before-write は race-prone だが canary nil・原子版は duration granularity caveat=evidence 表ゆえ粗い・design-only)。migration design-only(apply しない): partial unique / status transition / cleanup cron。verdict: STAGING canary READY(A1-5-11-6 実証)・PRODUCTION canary NOT YET(gate staging-only・gate 変更=production ON が前提)。運用 3 項目は小規模 canary の blocker でない(bounded/nil)が scale 用 design-only。production 接触 0/DB write 0/remote 0/コード変更 0(doc-only・gate safety は既 test-locked)**。**production canary 前提を evidence-based に確定: 唯一の構造 blocker は gate allowlist 変更(=production ON・別 GO)・運用は design-only で整理**。次は **production canary ON(gate allowlist 変更 + env provision + 監視・security-reviewed 別 GO) / cleanup·status transition·partial unique 実装(scale 前・別 GO) / feat 同期**。**production 接続 / production flag ON / gate 変更 / migration apply / PRM·correction 実接続 / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.62 / **A1-5-11-6 Runtime Duplicate / TTL Smoke（landed・§8.63・**EXECUTED & PASSED**・実 staging(hjcr) DB・one-shot harness 原則1回・doc-only）。A1-5-11-5 活性化 policy を実 staging で検証。infra=vitest one-shot(untracked・実行後削除・dotenv+dynamic import・runtime path 直呼び=route shell 非実行)。belt-and-suspenders guards(write 前 throw): URL ref===hjcr ∧ !==aljav(denylist)/anon JWT ref===hjcr ∧ role===anon(service_role 禁止)/NODE_ENV≠prod/self-pin UUID/pre-write USER_A rows===0。path=runMorningCaptureObserve(mode:write・gate明示・deps{fake extractor undated/morning/full_go/60min + real RPC writeClient + policy{existingActive:loadActiveCandidateEntries 実 read, nowMs 注入}})・同 policy 2 capture 共有・RPC counter。redacted report 全 PASS: preWrite 0・1回目 captured/RPC1/seed1/evidence1・undated TTL expires_at=now+14d・**2回目 suppressed/RPC still 1/rows 増えない**・surface candidateCount=1・banner「候補」no-leak・cleanup seed0/ev0。cleanup=seed delete→evidence FK CASCADE→0・独立 fresh-connection re-verify でも 0(DB 汚染 0 二重確証)。harness 2 本実行後削除。service_role 0/production(aljav) 0/実 LLM 0/remote 0**。**A1-5-11-5 policy が実 staging runtime で動作実証(write→suppress→TTL→surface→UI・DB 汚染 0)**。次は **partial unique index(migration・別 GO) / status 遷移·cleanup job(write・別 GO) / production canary 準備 / feat 同期**。**production 接続 / production flag ON / migration / PRM·correction 実接続 / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.61 / **A1-5-11-5 Capture Write Policy Live Activation（landed・§8.62・**配線 + fake/no-run tests**・A1-5-11-4 の core policy を本流 fireMorningCapture から活性化）。read client plumbing: fireMorningCapture client を MorningCaptureClient(RpcCapableClient & PendingCapturedRowsReadClient=write+read)に拡張・route 2 本(stargazer/alter·alter-morning/plan)の cast を MorningCaptureClient に更新(runtime object 不変)。read provider loadActiveCandidateEntries(loadPendingProjected→enrich→buildLifecycleEntryFromPlacement・read-only・fail-open [])。dedup drift 防止: 共有 builder buildLifecycleEntryFromPlacement(surface guard と同一構築)+write 候補 draftToCandidateEntry の desiredTimeHint を raw→band 正規化(anytime 取りこぼし解消・3 者同一キー)。fireMorningCapture は mode!=null で policy{existingActive provider, nowMs=Date.now 注入}を deps に載せる(write/observe 両適用=observe を忠実 dry-run)・flags off→mode null→policy 前に return(no-op)・gate block→provider 呼ばれず(read 0)・provider error/read 0 fail-open。+21 fake tests・reality 439。自変更 tsc 新規 0(reality lib 0・stargazer route pre-existing 15 不変・full baseline 55)。実 DB write 0/実 RPC 0/Supabase 0/production 0/migration 0/remote 0・実行なし(flags off no-op)**。**write policy が本流 capture write path に活性化(duplicate suppress/TTL が write path に効く)・production 挙動変更 0(flags off no-op)**。次は **実行(staging/canary で flag ON→実 DB write/実 RPC で write→read→UI E2E・別 GO) / partial unique index(migration・別 GO) / status 遷移·cleanup(write・別 GO)**。**flag ON 実行 / 実 DB write / 実 RPC / production 接続 / migration apply / PRM·correction 実接続 / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

> A1-5-0…§8.60 / **A1-5-11-4 Capture Write Policy Wiring（landed・§8.61・**配線 + fake/no-run tests**・A1-5-11-3 の pure policy を実 capture write runtime path へ外科的に通す）。配線: decideCaptureWrite/computeCaptureExpiry を orchestrator runStructuredCapturePipeline + service runCaptureService へ **optional DI(CaptureWritePolicyDeps={existingActive provider, nowMs 注入, freshnessMs?, ttlDays?})** で通す。policy 未指定→既存挙動不変。orchestrator: intake→withCaptureExpiry(明示尊重·undated/dated TTL 注入)→captureToDrafts→**write 直前 decideCaptureWrite(同構造 active fresh→suppress=writeClient 0 回)**→非 suppress なら write。新 result stage="suppressed"。service: deps.policy? 透過·stage suppressed→outcome "suppressed"·summarizeWouldCapture に suppressed(reason duplicate_active_fresh)。provider error→fail-open(existing=[]→write 継続)。race 非原子は限界継続(完全防止は migration unique・別 GO)。**live entry(fireMorningCapture)未活性化(意図的)**: fireMorningCapture は RpcCapableClient(.rpc のみ·read 不可)しか持たず dedup read に read client 要·entry へ通すは route.ts 変更必須=GO「route.ts変更0」で禁止·型安全でないキャスト不可→policy を write runtime path へ通し切り live 活性化(read client plumbing)は次境界で停止·observe は policy 非 import=**production 挙動変更 0**。+24 fake tests(dedup/TTL/suppress redaction/service suppressed/provider error fail-open/静的 live 未活性化)·reality tests/unit/reality/ 418 PASS(24 含む)/broad reality 1110 PASS(24 含む)。自変更 tsc 新規 error 0(reality lib tree 0·project 102)。DB read/write 0/Supabase 0/実 RPC 0/route.ts 0/UI 0/production 0/migration 0/schema 0/remote 0）**。**write-side policy を実 capture write runtime path へ通し切る(policy 指定で dedup+TTL·未指定で既存挙動)。live entry 未活性化で production 不変**。次は **live 活性化(fireMorningCapture が read-backed policy 構築=read client plumbing + route.ts 変更·別 GO) / partial unique index(migration·別 GO) / status 遷移·cleanup(write·別 GO) / A1-5-12 production canary 準備**。**fireMorningCapture 活性化 / 実 DB read·write / 実 RPC / migration apply / production 接続 / PRM·correction 実接続 / remote は別 GO で停止**。raw を同じ読み取り表面に置かない・column-restricted・fail-closed・no default duration・production hard block を全段で維持する。

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
