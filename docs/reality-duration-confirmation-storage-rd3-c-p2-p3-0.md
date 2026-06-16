# RD3c-P2/P3-0 — Integrated Storage + Operator Seed Write Design（docs-only）

- 日付: 2026-06-16 / 位置づけ: RD3c/3d-0（real supply source = user_confirmed duration を operator manual seed として起動）の**保存層設計**。`user_confirmed duration` / `operator_seed duration` を **どこに保存し・どう RLS で守り・どう adapter に繋ぐか**を、user/operator/dogfood/staging/production の provenance 分離込みで一体設計する。**まだ実装ではない**。
- 規律: 本書は**コードを書かない**。migration 作成・DB write・operator seed write・UI・API route・remote apply には進まない。
- 方法（CEO ①②③④⑤⑥⑦⑧）: 既存 migration / 型 / 学習経路を file:line で grounding し、**前提（"basis" と "provenance" は同じか）を疑った上で**、二次元分離（compute-grade × governance）に収斂させる。

---

## 0. 中核発見（grounded・前提を疑った結果）

| # | 発見 | 根拠 |
|---|---|---|
| **F1（linchpin・前提を疑った帰結）** | **"basis" と "provenance" は別次元**。`PlanningGradeDurationValueV0.basis` = DAG projection-grade（`external_route`/`cached_route`/`scheduled`/`user_confirmed`・`routeEtaDurationValue.ts:43`）＝**「leaveBy 計算に使えるか」**を司る。一方 CEO が挙げた `operator_seed`/`dogfood_seed`/`staging_seed` は **basis ではなく governance**（誰が・どの環境で・学習に流すか）。**operator_seed と general user_confirmed は同じ `basis=user_confirmed`（compute は同一）だが provenance が違う**。 | routeEtaDurationValue:43 |
| **F2** | **分離保存の precedent が既にある**: `plan_seed_duration_evidences`（A1-5-3b-1・draft 未 apply）が duration を **plan_seeds に置かず独立 store**・composite FK `(seed_id, user_id)→plan_seeds(id, user_id)` で owner integrity を DB 制約化・**owner-RLS（auth.uid()=user_id）・service_role 非前提**・source/confidence enum・opaque ref・**read path allowed columns に載せない**。 | 20260605110000_plan_seed_duration_evidences.sql |
| **F3** | **anchor 直カラム provenance の precedent もある**: U1-minimal `external_anchors.start_time_source` 等（draft）= NULL 許容・backfill しない・CHECK で偽装不可・**apply は CEO 承認後**・create_external_anchor_bundle RPC を CREATE OR REPLACE。但し start_time は **anchor 1:1**（duration confirmation は **1 anchor : N（recurrence instance × correction 時系列）**）。 | 20260615100000_external_anchors_start_time_provenance.sql |
| **F4** | **学習汚染面 = `prm_learning_events`**: `writeLearningEventOnAction`（`learning-event-write-on-action.ts`）が `toDryRunLearningEvent → toPrmLearningEventInsertRow → repository.insert`。flag `realityLearningEventWrite`（default OFF）。→ **learningEligible を source で gate すれば operator/dogfood seed は `toDryRunLearningEvent` に到達しない**。 | learning-event-write-on-action.ts / featureFlags:319 |
| **F5** | **value は basis のみ持ち provenance を持たない**: `PlanningGradeDurationValueV0` は kind/basis/upper/lower/scope/freshness/binding/evidenceRefs/displayPolicy(`internalServerOnly`)/provenance(conversion 系)/usableForLeaveByComputation。**actor/environment/learningEligible を持たない**＝compute 層は provenance-blind。 | routeEtaDurationValue:107-138 |
| **F6** | **value は 5 分 ceil 済 upper bound のみ**（`durationUpperBoundMinutes` integer・%5===0・**pre-ceil raw 不保持**）・lower は nullable・unit minutes 固定・displayPolicy `internalServerOnly`。 | routeEtaDurationValue:110-127 |
| **F7** | **adapter は二鍵**: value 自己 flag を鵜呑みにせず full basis 再照合 + `capability.timeEstimateUsableForPlanning` 再確認（`routeEtaDurationValue.ts:19`）。storage→value→capability の経路は既存 `resolveRouteEtaCapability(input,{provider})` を再利用できる（providerKind=`user_manual`・basis=user_confirmed）。 | routeEtaDurationValue:19 / routeEtaProviderAdapter |

→ **結論（設計の核）**: **2 次元に分離する**。
- **`durationBasis`（compute-grade・既存）**: leaveBy 計算可否。operator_seed も general user_confirmed も `user_confirmed`。
- **`durationProvenanceKind`（governance・新規）**: 学習適格性・環境・actor・user-facing 可否。
保存は **独立 `duration_confirmations` table**（F2 precedent）・compute 層は provenance-blind・segregation は RLS + learningEligible で構造強制。

---

## 1. user_confirmed と operator_seed の分離（語彙設計）

### 1.1 二次元語彙（混同しない）

**`durationBasis`（compute-grade・既存 `DurationValueBasis` を流用）**: `external_route` | `cached_route` | `scheduled` | `user_confirmed`。**operator_seed / dogfood_seed は basis ではない**。これらは provenance であり、compute 上は `user_confirmed` basis（手で確認された duration）として扱う。

**`durationProvenanceKind`（governance・新規）**:
| provenanceKind | actor | environment | basis 写像 | learningEligible | productionEligible | user-facing |
|---|---|---|---|---|---|---|
| `general_user_confirmed` | user | production | user_confirmed | **true**（唯一） | true | ✓ |
| `operator_seed` | operator | dogfood/staging | user_confirmed | **false** | **false** | ✗ |
| `dogfood_seed` | system/operator | dogfood | user_confirmed | **false** | **false** | ✗ |
| `staging_seed` | operator | staging | user_confirmed | **false** | **false** | ✗ |
| `imported_scheduled` | system | production | scheduled | false（v1）| 別 gate | ✗（別 slice） |
| `cached_route` | system | production | cached_route | false（v1）| 別 gate | ✗（別 slice） |
| `external_route` | system | production | external_route | false（v1）| 別 gate | ✗（別 slice） |

**不変条件**: `learningEligible=true` は `provenanceKind='general_user_confirmed' ∧ environment='production'` の時のみ（DB CHECK で強制）。operator/dogfood/staging seed は learningEligible=false 固定。

### 1.2 actorType / environment（直交軸）
- `actorType`: `user` | `operator` | `system`
- `environment`: `dogfood` | `staging` | `production`
- 組合せ制約（CHECK）: `actorType='operator' ⟹ environment ∈ {dogfood, staging}`（operator は production user データを作らない）。`provenanceKind='general_user_confirmed' ⟹ actorType='user' ∧ environment='production'`。

---

## 2. provenance 設計（フィールド）

`duration_confirmations` 行の provenance（governance・compute と分離）:
- `confirmed_by`（actor の opaque id・user は user_id・operator は operator id）
- `confirmed_at`（TIMESTAMPTZ）
- `confirmation_scope`（どの scope に対する確認か = §3 の scope key）
- `actor_type`（user/operator/system）
- `environment`（dogfood/staging/production）
- `provenance_kind`（§1.1）
- `source_refs` / `evidence_refs`（opaque・自由文本体でない・read path allowed columns に含めない）
- `created_by_slice`（例 `RD3c-P3a`・audit）
- `learning_eligible`（BOOLEAN・§1.1 の CHECK で governance 強制）
- `production_eligible`（BOOLEAN）

**不変条件（governance）**:
- operator_seed は一般 user_confirmed では**ない**（provenance_kind で構造区別）。
- operator_seed を一般ユーザー学習に流さない（learning_eligible=false → `toDryRunLearningEvent` に到達不能・F4）。
- dogfood_seed を production 学習に流さない（environment≠production → learning read filter で除外）。
- seed を external notification / user-facing copy に使わない（user-facing path は learning_eligible=true ∧ production のみ read）。
- seed の存在を一般ユーザーに出さない（RLS で operator 行を user read から構造遮断・§3RLS）。

---

## 3. duration value scope（一致条件）

confirmation は **scope に bound**（mismatch なら unusable）:
- `target_node_id`（arrival ERN）
- `origin_ref` / `destination_ref`（opaque・raw 座標不可）
- `transport_mode`
- `time_band`（時間帯・任意）
- `subjective_date`
- `temporal_scope_ref`
- `route_eta_supply_id`（どの supply 試行に対する確認か）
- `provider_version`
- `freshness` / `valid_until`

**scope mismatch ルール**: adapter は confirmation の scope と要求 scope（targetNodeId/subjectiveDate/transportMode/temporalScopeRef）を full 照合し、1 つでも不一致なら **unusable（durationValue を作らない）**。stale（valid_until 経過）も unusable。

---

## 4. duration value semantics（保守化）

- **raw precise seconds を保持しない**（minutes のみ・F6）。
- **5 分 ceil 済 upper bound のみ**（`durationUpperBoundMinutes` %5===0・pre-ceil raw 捨てる）。
- `durationLowerBoundMinutes`（nullable・<= upper）— range がある場合のみ。**point estimate は upper として保守化**（lower=null or =upper 扱い、planning は upper を使う）。
- **average duration 禁止**（中央値/平均を point に使わない・upper bound 保守化）。
- **heuristic 禁止**（basis allowlist 外・DAG 強制 F7）。
- **stale 禁止**（valid_until 経過は unusable）。
- **malformed 禁止**（CHECK: 1 < upper <= 1440・lower <= upper・unit='minutes'）。
- lower/upper range: storage は両方持てるが、leaveBy 計算は **upper bound のみ**使う（早めに出る方向＝保守的）。

---

## 5. storage strategy 比較

| option | migration risk | RLS | owner/user 境界 | operator-only 境界 | env 境界 | recurrence/instance | sourceId/externalUid | auditability | rollback | learning 汚染 | adapter 接続 | LeaveBy 接続 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A: external_anchors 直カラム** | 中（anchor schema 変更・破壊的 rollback） | anchor RLS 流用 | ◯ | **✗（operator seed を anchor に置けない＝user データ汚染）** | ✗ | **✗（1:1・instance 別を持てない）** | anchor 側 | 弱（履歴なし） | 破壊的（DROP COLUMN） | **高**（anchor read path に混入） | ◯ | ◯ |
| **B: 独立 `duration_confirmations` table** | 低（additive table・DROP TABLE で clean rollback） | owner-RLS + operator policy（F2 precedent） | ◯（composite FK） | **◯（provenance_kind + RLS で構造分離）** | **◯（environment 列 + CHECK）** | **◯（N 行・scope key で instance 区別）** | opaque ref のみ | **強（時系列・supersededBy）** | **clean（DROP TABLE・anchor 不変）** | **低（anchor read path 非混入・learning_eligible gate）** | ◯（read adapter） | ◯ |
| C: operator-only seed table（単独） | 低 | operator policy のみ | — | ◯ | ◯ | ◯ | opaque | 強 | clean | 低 | ◯ | ◯ |
| D: local/dev-only fixture seed（DB 無し） | なし | — | — | dev のみ | dev のみ | △ | — | 弱 | なし | なし | ◯（RD3a 既済） | ◯ |
| E: hybrid（user_confirmed table + operator seed table） | 中（2 table・2 adapter） | 2 policy set | ◯ | ◯（物理分離） | ◯ | ◯ | opaque | 強 | clean | **最低**（物理分離） | △（2 read path） | ◯ |

### 推奨: **B（独立 `duration_confirmations` table・provenance_kind + environment 判別 + 判別 RLS）**

**理由（rule ③⑤）**:
1. **A（anchor 直カラム）を退ける**: operator_seed を anchor に置くと user データを汚染する（F1 の二次元分離が崩れる）。recurrence instance を 1:1 で持てない。
2. **E（hybrid 2 table）は over-split**: 物理分離は安全だが 2 adapter / 2 RLS set / 重複。`provenance_kind` + `environment` 判別列 + **判別 RLS（user read は `provenance_kind='general_user_confirmed' ∧ environment='production'` のみ・operator read は operator role policy）**で単一 table のまま構造分離できる。
3. **D（dev fixture）は RD3a-P1 で既に達成済**（dogfood synthetic）。real storage の次段は B。
4. **B は F2 precedent（plan_seed_duration_evidences）と同形**: composite FK owner integrity・owner-RLS・opaque ref・read path 非露出。実証済パターンの再利用。

**hybrid（E）への fallback 条件**: 判別 RLS の信頼が不十分（operator 行が user read に漏れる懸念が残る）なら E（物理 2 table）に切替。但し B の判別 RLS + CHECK で構造保証できる見込み。

---

## 6. write gate（全て別 GO・本 slice は設計のみ）

- operator seed write は**別 GO**（RD3c-P3a）。user confirmation write も**別 GO**（RD3c-P4）。
- **DB write はまだ NO GO**・**migration はまだ NO GO**。
- **service_role 禁止**（owner-RLS / operator role policy のみ）。
- **owner-RLS**（auth.uid()=user_id）+ operator は専用 policy（operator role gate）。
- **no production apply**・**no remote Supabase apply**（local/dev のみ・apply は CEO 承認後）。
- write validation: scope full 一致・1<upper<=1440・lower<=upper・provenance_kind と environment/actor_type の CHECK 整合・duplicate は supersede（旧行 supersededBy 設定・物理削除しない=audit）。

---

## 7. adapter connection 方針

### 7.1 経路（既存 pipeline 再利用）
```
duration_confirmations 行（read・scope filter）
  → buildDurationValueFromConfirmation（row → RouteEtaProviderResultV0 相当: providerKind='user_manual'・basis='user_confirmed'・durationMinutesRaw=upper・routeShapePresent=false・freshnessBasisRef=valid_until ref）
  → resolveRouteEtaCapability(input,{provider})  ← 既存 RD2d-b adapter
  → {capability, durationValue}  ← 既存 RD2e durationValue
  → supplyAndResolveLeaveBy  ← 既存 RD2e-SUPPLY
  → computed leaveBy
  → assembleLeaveByBindings  ← 既存
  → （reconcile は RD3e-P1・MovementReality 反映）
```
**provenance（learning_eligible/actor/environment）は value に流さない**（F5・value は basis のみ）。governance は storage layer に留まる。

### 7.2 segregation（read 時）
- **production user path**: `provenance_kind='general_user_confirmed' ∧ environment='production' ∧ learning_eligible=true` のみ read（RLS + adapter query filter 二重）。
- **operator preview path**: operator role policy で operator_seed/dogfood_seed/staging_seed を read（user path からは構造遮断）。
- malformed/stale/scope mismatch → durationValue を作らない（unusable・fail-closed）。

### 7.3 LeaveBy / MovementReality へ進む条件
- LeaveBy: durationValue 非 null ∧ capability.timeEstimateUsableForPlanning（二鍵・F7）∧ supply complete（arrival/buffer/origin 揃う）。
- MovementReality: **RD3e-P1**（reconcile 拡張で etaKnown/leaveByKnown を derive・本 slice 範囲外）。

---

## 8. learning 汚染防止（多層）

1. **storage CHECK**: `learning_eligible=true ⟹ provenance_kind='general_user_confirmed' ∧ environment='production'`（DB レベル強制）。
2. **learning read filter**: `prm_learning_events` 生成（`toDryRunLearningEvent`）は `learning_eligible=true` 行のみ consume。operator/dogfood/staging seed は構造的に到達不能（F4）。
3. **value blindness**: value は provenance を持たない（F5）→ 仮に value が learning に渡っても actor/environment 情報が無く、source 識別不能（汚染経路が二重に塞がれる）。
4. **correction memory 条件**: user_confirmed かつ production かつ evidence quality high のみ correction 候補（sample size / recency / evidence quality を gate）。operator seed は preference として永続学習しない。
5. **環境分離**: dogfood_seed は environment≠production ゆえ production learning read filter で除外。

---

## 9. 実装分割案（リスク別・各々別 GO）

| slice | 内容 | 触る | リスク | apply |
|---|---|---|---|---|
| **RD3c-P2a**（schema/migration draft only）★ first | `duration_confirmations` table の **migration draft**（CREATE TABLE + CHECK + composite FK + owner-RLS + operator policy）+ TS type（`DurationConfirmationRowV0` / `DurationProvenanceKind` / governance types）。**DB apply なし** | new migration file（draft）+ new types | 低（draft・未 apply） | **NO（CEO 承認 gate）** |
| **RD3c-P2b**（read adapter only） | `buildDurationValueFromConfirmation`（row→PlanningGradeDurationValue・scope filter・unusable 判定）。**read path のみ・write なし**。dogfood/operator preview で injected row から chain を通す（RD3a 同形・但し real row shape） | new adapter + tests | 低 | NO |
| **RD3c-P3a**（operator seed write path） | operator-only write（server action・operator role gate・owner-RLS・staging/dev のみ・supersede/audit）。**no production** | new server action + RLS + write validation | 中（write・RLS） | 別 gate（staging のみ・CEO） |
| **RD3c-P3b**（operator seed dev panel・必要なら） | operator が seed を入れる最小 dev UI | operator-only UI | 中 | 別 gate |
| **RD3c-P4**（user confirmation UI） | 一般 user が予定ごとに duration 確認・production user-facing | product UI + write | 高（user-facing） | 別 CEO gate |

**推奨実装順**: **RD3c-P2a（schema/type/RLS draft・apply なし）→ RD3c-P2b（read adapter）→ RD3e-P1（MovementReality reconcile 拡張・別途）→ RD3c-P3a（operator seed write・staging）→ RD3c-P3b（dev panel）→ RD3c-P4（user UI）**。

---

## 10. Department Responsibility Matrix（RD3c-P2/P3-0・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Build/Mobility** | R | storage schema・二次元語彙（basis × provenance）・adapter connection 設計 |
| **Permission** | C | RLS 判別設計・operator/user 構造分離・service_role 禁止・seed 非露出 |
| **Risk** | C | learning 汚染防止多層・provenance CHECK・rollback/audit |
| **Communication** | C | seed を user-facing/notification/external に使わない・exact timestamp HOLD |
| **CEO** | A | RD3c-P2a/P2b/P3a/P3b/P4 各 GO・migration apply・remote apply gate |

---

## 11. RD3c-P2/P3-0 自己判定

- **storage 推奨 = B（独立 `duration_confirmations` table・provenance_kind + environment 判別 + 判別 RLS）**。F2 precedent（plan_seed_duration_evidences）と同形・anchor 汚染なし・recurrence N 対応・clean rollback・learning 汚染低。hybrid（E）は over-split（判別 RLS で単一 table に集約可・fallback として保持）。
- **二次元分離（前提を疑った核）**: `durationBasis`（compute-grade・既存）と `durationProvenanceKind`（governance・新規）を**混同しない**。operator_seed も user_confirmed も basis=user_confirmed（compute 同一）・provenance で learning/環境/user-facing を構造区別。
- **learning 汚染防止**: storage CHECK（learning_eligible gate）+ learning read filter + value blindness + correction memory 条件 + 環境分離 の多層。operator/dogfood seed は構造的に学習に到達しない。
- **adapter**: 既存 RD2d-b/RD2e pipeline を再利用（confirmation row → user_manual provider result → capability → durationValue → leaveBy）。value は provenance-blind。
- **RD3c-P2a 実装 GO 可否 自己判定**: **GO 可（schema/type/RLS migration draft only・DB apply なし・write なし・UI なし）**。最小・additive・clean rollback・既存 precedent 同形。**但し GO は CEO 専管**。本 slice はコードを含まない。
- **HOLD 継続**: DB write / migration apply / operator seed write / user UI / API route / remote Supabase / external / currentLocation / departure line / exact timestamp / notification（各 CEO gate）。

---

## 12. 実装反映（RD3c-P2a/P2b）

- **2026-06-16 RD3c-P2a/P2b 実装**（code `d11237ea5`・matrix §5 参照）: §5 案 B（独立 `duration_confirmations` table）・§1-§4 語彙/provenance/scope/semantics・§7 adapter connection・§8 learning 汚染防止を実装。
  - 実装ファイル: `supabase/migrations/20260616100000_duration_confirmations.sql`（draft・未 apply）・`lib/plan/realityCore/durationConfirmation.ts`（型 + validation）・`lib/plan/realityCore/durationConfirmationAdapter.ts`（read adapter・pure）・`tests/unit/durationConfirmation.test.ts`（33 PASS）。
  - **2 次元分離を型で固定**: `durationBasis`(compute・既存流用) × `durationProvenanceKind`(governance・新規)。learning_eligible は DB CHECK + TS `durationConfirmationLearningEligibleViolations` の二重。
  - **adapter は既存 RD2d-b/RD2e pipeline 再利用**（confirmation row → user_manual provider result → resolveRouteEtaCapability → durationValue）。value は provenance-blind（operator_seed の learningEligible=false は storage 層に留まり value に混入しない・test #23 で実証）。
  - **本 slice 範囲外（実装せず）**: DB apply（migration 未適用）・operator seed write（**RD3c-P3a**）・user confirmation write/UI（**RD3c-P4**）・MovementReality 反映（**RD3e-P1**）。
  - migration の **operator policy predicate `reality_operator` JWT claim は draft**（発行設計は RD3c-P3a・本 draft は claim 不在=default-deny の安全側）。
