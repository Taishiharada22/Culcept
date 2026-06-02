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
- **importance/catastrophic は構造化シグナルのみ**（`deriveImportance`：reservation/payment/deadline/external/cascade/user-declared。**raw title 推測を型レベルで禁止**）。
- ③ dev report 画面・④ PRM 保存・⑤+ は未着手（要 CEO 承認）。

---

## 7. CEO 判断ポイント
1. 本 Connection Design を Phase 1 接続の設計確定としてよいか
2. **最初の実装許可範囲**：①read-only input adapter ＋ ②shadow run ＋ ③dev-only report は **既存挙動ゼロ変更・本番未接続** ゆえ自律実装してよいか（DB/push/native なし、flag gate、純 adapter＋テスト）
3. ④以降（PRM 保存・on-open・push・native）は段階ごとに別途承認

> 本書は設計提案。実装は CEO 承認後。次成果物（許可が出れば）＝ Stage ①②③ の read-only adapter ＋ shadow runner ＋ dev-only report（additive/可逆/flag gate、既存挙動不変）。
