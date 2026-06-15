# RD2e-SUPPLY-0A — LeaveBy Supply 前提再裁定（startTime provenance / fixedness / buffer small / originTemporalValidity / scopeKey）docs-only

- 日付: 2026-06-15 / 位置づけ: RD2e-SUPPLY-0（`e7c96463`）に GPT 監査 7 点 + **adversarial workflow（`wf_793224f4`・5 grounding + 3 critique・実コード line 根拠）**を反映し、RD2e-SUPPLY 実装前に fixedness / startTime provenance / buffer small / originTemporalValidity / scopeKey を**確定**する。
- 規律: **コードを書かない**。供給/adapter 実装・RC2a/MovementReality/departure line/currentLocation/weather/UI/DB write/production には進まない。
- 検証方法（CEO ①②③ + ultracode）: 提案規則を**実コードに対し adversarial 検証**。下記は workflow が file:line で確認した事実に基づく（推測でない）。

---

## 0. adversarial 検証の中核発見（GPT を超える・実コード根拠）

| # | 発見 | 根拠（実コード） | 帰結 |
|---|---|---|---|
| F1 | **`fixedStart.status='confirmed'` は `rigidity_hard` から導出される** | `commitmentSignal.ts:141` `inferredAttribute(true, 0.8, ['rigidity_hard'], {status:'confirmed', source:'known_from_user'})` | 提案の「fixedStart confirmed ∧ rigidity hard ∧ provenance confirmed」3 ゲートのうち 2 つが同一信号（rigidity_hard）に collapse → 実質 ~1 ゲート。**fixedStart を fixedness 判定の独立ゲートに使えない** |
| F2 | **startTime 専用 provenance field が上流に存在しない** | `ExternalAnchor.startTime`/`EventNode.startTime` は素の string。`durationSource` は DURATION 用。`sourceType`/`confirmedAt` は anchor 全体 | `startTimeProvenance='confirmed'` の**正当な producer が無い** → v0 で **fixed arrival を産出できない** |
| F3 | **origin fuel が scope-mismatch gate を escape している（RD2e-b の実バグ）** | `leaveByAdapter.ts:310-313` は duration/arrival/buffer の scopeKey のみ比較・**origin を含めない**。`OriginTemporalValidityForLeaveByV0` に transportMode が無い | 別 scope の origin が混入し得る（現状コード） |
| F4 | **`originConflict='minor_discrepancy'` が gate を通る（RD2e-b の実バグ）** | `leaveByAdapter.ts:283` は `=== 'conflict'` のみ reject | 軽微 conflict 信号がある origin で leaveBy 計算される |
| F5 | **origin freshness/asOf field が無い → stale origin が valid を通る** | buffer は `freshness`、duration は `freshness` を持つが origin 型は持たない | 古い origin 観測が検出されない |
| F6 | **buffer `small` は pre-route に正当化できない** | supply 段階で place/route/ETA/distance が未供給（`placeResolution` は certainty のみ・raw 距離なし） | low-friction evidence が**構造的に存在しない** → small を v0 で出せない |

→ 結論: **提案規則を更に締める。特に F2 は「v0 では arrival を fixed として供給できない」という honest な fail-closed 帰結**を意味する。

---

## 1. startTime provenance 再裁定（CEO 必須 1）

**裁定: `durationSource` を startTime provenance の根拠に使わない。** さらに、**startTime 専用 provenance source が上流に無い（F2）ため、v0 では `startTimeProvenance='confirmed'` を産出できない。**

- **禁止 proxy（exact field 名で列挙）**: `EventNode.durationSource`（DURATION 用）/ `ExternalAnchor.sourceType==='manual'` / `origin==='user'`（anchor 作成方法であって startTime 確定方法でない）/ `ExternalAnchor.confirmedAt`（anchor 承認時刻・startTime 確定でない）。これらから provenance を導いたら `start_time_provenance_proxy_rejected` を立てる（forbidden path を silent でなく observable に）。
- **v0 honest 挙動**: 専用 startTime source が無い間、arrival は `startTimeProvenance='inferred'` 止まり（or `default`）→ **fixed にならない**（§2）→ arrival は供給されるが `fixed` でない → RD2e-b で `arrival_not_fixed` uncomputed。**実質、現状の上流では fixed arrival は産出されない（正しい wall）。**
- **前提となる upstream 追加（U1）**: ExternalAnchor/EventNode に **`startTimeSource`**（"user_explicit" | "imported_exact"[ICS DTSTART 等] | "assumed_default" | "inferred"）を追加して初めて `startTimeProvenance='confirmed'` が正当に立つ。これは別 GO の schema 追加（本書では発見として記録・実装しない）。
- ICS 非対称性（F 由来）: ICS DTSTART は権威的 wall-clock だが現状 `sourceType==='ics'` 経由で provenance 区別されない。U1 でこそ救済される（手入力 default 時刻と ICS 権威時刻を区別）。

---

## 2. fixedness for leaveBy の条件（CEO 必須 2・F1 反映で更に厳格化）

**裁定: `fixedStart.status` を fixedness 判定の独立ゲートにしない**（F1: それは rigidity_hard 由来）。

v0 で `fixedness='fixed'` を許す条件（**全て・disjoint 根拠必須**）:
1. `startTimeProvenance==='confirmed'`（**genuine startTime source 由来のみ**・§1。proxy 由来は不可）
2. `confidence !== 'low'`
3. （補助）rigidity は**単独で fixed にしない**・evidenceRef が `rigidity_hard` のみの fixedStart は fixed 根拠にしない
- `fixedStart.status==='inferred'` → **v0 では `tentative`**（昇格しない）
- fixedStart-confirmed ゲートと rigidity-hard ゲートが**同一 evidenceRef を共有**したら `fixedness_confirmed_signal_collision` → fixed 拒否
- **帰結（F2 連動）**: 条件 1 が現状満たせない（startTimeSource 未追加）ため、**v0 では fixed=false が既定**。fixedness 不確実 → `fixedness_not_confirmed` / `arrival_not_fixed` → uncomputed。
- **adapter 側 defense-in-depth（要 RD2e-b-A・F 由来 defect D4）**: `arrivalTargetViolations` で `fixedness==='fixed'` なら `startTimeProvenance==='confirmed'` ∧ `confidence!=='low'` を**再要求**（supplier 主張を adapter が信用しない・`arrival_fixed_without_confirmed_provenance`）。

---

## 3. buffer small 条件（CEO 必須 3・F6 反映）

**裁定: v0 で `small` を出さない。** pre-route に低摩擦を裏づける place/route/ETA/distance が**構造的に存在しない**（F6）。

- v0 写像（小さく・賢くしない）:
  - `large` = rigidity hard ∧（reservation/payment ∨ high commitment）
  - `medium` = 通常 fixed（既定の保守側・**small へ倒さない**）
  - `small` = **v0 では不可**（typed low-friction evidence + 専用 field `lowFrictionEvidencePresent` が将来供給された時のみ）。要求されたら `buffer_small_unsupported_pre_route` を立て **medium へ floor**
  - 不明 = `buffer_unknown` → uncomputed
- buffer evidenceRefs は全 bucket で非空必須だが、**small は generic evidence では不可**（typed low-friction が要る・現状無い）。`buffer_evidence_missing`。
- **禁止**: weather 数値化・LLM buffer・dynamic minute・「間に合う保証」。

---

## 4. originTemporalValidity 条件（CEO 必須 4・F3/F4/F5 反映）

`OriginInferenceV0` + `capability.originConflict` から導出。**現状 `OriginTemporalValidityForLeaveByV0` は rule 4 の必須 field を持たない**（critique HIGH）→ 下記 field 追加が前提（U2）。

- **previous_event_end 必須 field（U2 追加）**: `previousEventEndInstant`（calendar-valid JST）/ `previousEventEndLocationRef`（opaque）/ `previousEventSourceRef` / `originSubjectiveDate`。導出元は `MovementTransition.fromNodeId → EventNode.endTime/locationText`（F2 grounding: 統合構造は無く 2-3 段 lookup）。
  - **`previousEventEnd <= arrivalTargetInstant`** を adapter で**再検証**（`previous_event_end_after_arrival`）。
  - 前 event の `EventNode.durationSource==='assumed_default'`（既定 60min 由来の end）なら **end は fabricated** → validity=unknown（`previous_event_end_assumed_duration`）。
  - 必須 field 欠落 → `previous_event_end_missing` / validity=unknown。
- **origin freshness（U2 追加・F5）**: `originAsOfRef`（opaque）+ `originFreshness:'valid'|'stale'|'unknown'`（buffer/duration と対称）。`!== 'valid'` → `origin_temporal_freshness_unknown` / uncomputed。
- **home/work_assumed の confidence 上限（U2 追加・要 `originConfidence` field）**: `OriginInference` は home/work_assumed を confidence `low` で hard-code（`originInference.ts:171-`）。leaveBy 境界で `originKind ∈ {home_assumed, work_assumed}` は **moderate 上限**・`low` は不可（`origin_confidence_above_cap`）。assumed は static 仮定として残す（confirmed 扱いしない・user_confirmed 優先・currentLocation 上書きなし）。
- **originConflict='minor_discrepancy' を fail-closed**（F4・D2）: v0 は `originConflict !== 'none'` を reject（`origin_conflict_unresolved`）。silent pass を許さない。
- `current_location_candidate` / `unknown_origin` は供給段で弾く候補として渡し RD2e-b reject（二重防御）。
- **validity 導出**: certaintyStatus∈{confirmed,inferred} ∧ confidence∈{high,moderate} ∧ originFreshness=valid ∧（previous_event_end は時間関係成立）→ valid。さもなくば stale/unknown。

---

## 5. leaveByScopeKey 定義（CEO 必須 5・F3 反映）

```
leaveByScopeKey(x) := targetNodeId :: subjectiveDate :: transportMode :: temporalScopeRef?
```
- **temporalScopeRef を必須化**: `capability.identity.temporalScopeRef !== null` なら全 fuel が同 temporalScopeRef を持ち一致必須（`temporal_scope_ref_missing` / scope mismatch）。二鍵 binding は temporalScopeRef を含むのに scopeKey が落とすのは非対称（critique HIGH）。
- **origin を scope gate に含める（D1 修正・要 RD2e-b-A）**: 現状 `leaveByAdapter.ts:310-313` は origin を比較しない。`OriginTemporalValidityForLeaveByV0` に **transportMode を追加**し、`oriScope` を gate に含める（`origin_scope_mismatch`）。
- **completeness predicate（null-key collision 防止）**: scope 比較**前**に、全 fuel の targetNodeId/subjectiveDate/transportMode が **non-null ∧ non-empty** を要求（`'∅'` placeholder 同士の偽一致を排除・`scope_incomplete`）。
- **complete bundle 条件**: durationValue.scope = capability.scope = arrivalTarget.scope = buffer.scope = **originTemporalValidity.scope**（5 fuel）が全一致 ∧ 全 dim non-null。1 つでも欠/不一致 → bundle incomplete → uncomputed。
- **date-crossing gate（D5・要 RD2e-b-A）**: `arrivalTargetInstant` の日付 prefix ≠ `targetEventDate` → `target_event_date_mismatch`。減算後 `leaveByStr` の日付 prefix ≠ arrival の日付 prefix → `cross_day_arrival_unsupported`（v0 は day 跨ぎ leaveBy を supply で許さない・`event_spans_subjective_boundary_unsupported`）。

---

## 6. missingInput code 追加（CEO 必須 6 + workflow 由来）

supply trace（internal・raw echo なし）の `LeaveBySupplyMissingInput` を拡張:
```
// CEO 必須 6
start_time_provenance_missing | fixedness_not_confirmed | event_spans_subjective_boundary_unsupported |
previous_event_end_missing | origin_temporal_evidence_missing | buffer_evidence_missing |
// workflow 由来（実コード根拠）
start_time_provenance_proxy_rejected | fixedness_confirmed_signal_collision | arrival_fixed_without_confirmed_provenance |
previous_event_end_assumed_duration | previous_event_end_after_arrival |
origin_temporal_freshness_unknown | origin_conflict_unresolved | origin_confidence_above_cap | origin_scope_mismatch |
buffer_small_unsupported_pre_route | scope_incomplete | temporal_scope_ref_missing |
target_event_date_mismatch | cross_day_arrival_unsupported
```
- supply の missingInput は **RD2e-b の closed `LeaveByAdapterUncomputedReason`(8) とは別 taxonomy**（supply=「なぜ供給できなかったか」・richer）。bundle.missingInputs（trace）に残し、null fuel として RD2e-b に渡す（adapter は自前 8 reason へ写像）。orphan 化させない設計。

---

## 7. 発見した RD2e-b 実コード defect（**要 RD2e-b-A micro-fix GO**・本書では実装しない）

workflow が file:line で確認した、現行 `0c8daaea` の実バグ:
| id | defect | 場所 | 修正方針 |
|---|---|---|---|
| **D1** | origin が scope-mismatch gate に**含まれない** | `leaveByAdapter.ts:310-313` | origin を gate に追加 + origin 型に transportMode |
| **D2** | `originConflict='minor_discrepancy'` が通る | `leaveByAdapter.ts:283` | `!== 'none'` を reject（fail-closed） |
| **D3** | origin freshness/asOf field が無い → stale 通過 | origin 型 | `originAsOfRef`+`originFreshness` 追加・gate |
| **D4** | adapter が supplier の `fixedness` を無検証 trust | `arrivalTargetViolations:249-250` | fixed なら provenance=confirmed∧confidence≠low 再要求 |
| **D5** | date-crossing 無 gate（leaveBy が midnight を silent roll） | adapter | date-prefix 一致 check + post-subtraction check |
| **D6** | scopeKey が temporalScopeRef を落とす | `leaveByAdapter.ts:209-211` | temporalScopeRef 必須化（capability non-null 時） |

→ これらは RD2e-b の honest な hardening。**CEO の RD2e-b-A 実装 GO で対応**（本 docs-only slice の範囲外）。

---

## 8. 前提となる upstream schema 追加（**別 GO**・本書では実装しない）

| id | 追加 | 目的 |
|---|---|---|
| **U1** | `ExternalAnchor`/`EventNode` に `startTimeSource`（user_explicit/imported_exact/assumed_default/inferred） | fixed arrival を honest に産出する唯一の道（F2） |
| **U2** | origin supply 型に `originFreshness`/`originAsOfRef`/`originConfidence`/`transportMode` + previous_event_end 4 field | origin の temporal validity / scope / freshness を成立させる |

---

## 9. honest v0 結論（最重要・fail-closed の真実）

- **現状の上流では、RD2e-SUPPLY v0 は arrival を `fixed` として供給できない**（F2: startTime 専用 source 不在）。v0 supply は「正しく構造化された wall」= ほぼ常に `start_time_provenance_missing` → leaveBy uncomputed。
- これは**欠陥ではなく正しさ**: 出発時刻に直結する leaveBy を、startTime の確定根拠なしに計算しない（捏造より honest uncomputed）。
- **fixed leaveBy を本当に出すには U1（startTimeSource）が前提**。それまで RD2e-SUPPLY は「型・gate・trace を完備した uncomputed 製造機」として正しく機能する。

---

## 10. Department Responsibility Matrix（RD2e-SUPPLY-0A・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Mobility** | R | supply 境界の最終規則・scopeKey・fixedness/validity 導出 |
| **Context/Temporal** | C | startTimeSource(U1)・previous_event_end・date 跨ぎ |
| **Permission** | C | origin opaque・currentLocation 不使用・confirmed 上書き禁止 |
| **Risk** | C | fail-closed・proxy 禁止・捏造 field 禁止・RD2e-b defect の honest 記録 |
| **CEO** | A | RD2e-SUPPLY 実装 GO / RD2e-b-A defect 修正 GO / U1・U2 schema GO |

---

## 11. RD2e-SUPPLY 実装 GO 可否 自己判定（再）

- 規則は本書で確定（startTime provenance 厳格・fixedness は genuine source 依存・small 廃止・origin field 拡張・scopeKey 5 fuel + temporalScopeRef + completeness・missingInput 拡張）。
- ただし **honest な前提が 2 つ未充足**: (U1) startTimeSource が無いと fixed arrival を産出できない / (U2) origin 型の freshness/confidence/scope field 不足。**この 2 つが無いまま RD2e-SUPPLY を実装すると「常に uncomputed」な supply にしかならない**（無害だが leaveBy が一切出ない）。
- さらに **RD2e-b 自体に 6 defect（D1-D6）** が見つかった。supply を活かすには adapter hardening（RD2e-b-A）が先か並行で要る。
- **自己判定: RD2e-SUPPLY を「今すぐ単独実装」する価値は低い**（U1/U2 無しでは常時 uncomputed）。推奨順は **(a) RD2e-b-A（D1-D6 defect 修正・既存バグゆえ優先度高）→ (b) U1/U2 schema 追加 GO → (c) RD2e-SUPPLY 実装**。最優先は **D1-D4（origin scope escape / minor_discrepancy 通過 / stale origin / fixedness 無検証 trust）= 現行コードの安全 gap**。GO は CEO 専管。本書はコードを含まない。
