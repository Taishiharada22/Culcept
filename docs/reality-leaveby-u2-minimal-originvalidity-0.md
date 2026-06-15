# U2-minimal-0 — OriginTemporalValidity 供給設計（previous_event_end のみ）docs-only

- 日付: 2026-06-15 / 位置づけ: U2（`docs/reality-leaveby-upstream-provenance-u1-u2-0.md`）の**最小 scope 第 1 片**。RD2e-SUPPLY が origin を honest に供給するための builder を、**temporal validity が今日のデータから honest に導ける唯一の origin kind = `previous_event_end`** に限定して念密設計する。
- scope を最小に割る理由（CEO）: corner-cut でなく**詳細プランの精度のため**。他 origin kind は fail-closed 既定で本片の対象外（各々別 scoped slice）。
- 規律: 本書は**コードを書かない**。supply builder 実装・RD2e-b 接続・currentLocation・home/work profile 拡張・production には進まない。
- 方法（CEO ①②③ + ultracode）: **adversarial workflow（`wf_7af7a071`・5 grounding + 2 scope・file:line 根拠）**で originInference / dayGraph / profile / walker / consumer seam を監査。下記は確認事実。

---

## 0. 中核発見（grounded・U1 との決定的な違い）

| # | 発見 | 根拠 | 帰結 |
|---|---|---|---|
| **G1** | **`OriginInferenceV0` は pure compute・DB 非永続**（6 constructor・pure・未配線=RD2c types-only） | `originInference.ts:129-246` | **U2 は新 DB カラム不要**（U1 と違い migration なし・pure builder のみ） |
| **G2** | **dayGraph は 1 graph=1 date**（`DayGraphAttributes.date` 'YYYY-MM-DD'・全 node 共有・per-node date なし） | `dayGraphTypes.ts:251` | same-subjectiveDate が**構造的に保証**・`EventNode.endTime`('HH:MM') + graph.date で instant 構成可 |
| **G3** | **instant materialization が未実装**（HH:MM + date → canonical JST への変換関数が無い） | dayGraph / leaveByAdapter | **本片の load-bearing gap**: supplier が `${date}T${HH}:${MM}:00+09:00` を mint + `isCalendarValidMinuteJstIso` 検証 |
| **G4** | supportedBoundary 導出可（`durationSource==='explicit' ∧ ¬boundaryClipped`・clip end=23:00 fabricated） | `eventNodes.ts:280-281`・`dayGraphTypes.ts:44` | previous_event_end の end-instant 信頼性 gate |
| **G5** | **U1 `start_time_source`（`87b2f07b`）が前 event の START provenance を供給** | external-anchor + U1-minimal | supportedBoundary に加え「前 event の START も非 default」を要求できる（synergy） |
| **G6** | **home_assumed: profile に `baseline_home_{label,lat,lng}` はあるが asOf 列が無い**（`baseline_home_updated_at` 不在） | `20260418120000_baseline_home_columns.sql` | freshness orphan → **defer**（home-location timestamp 列が前提） |
| **G7** | **work_assumed: work_location が DB に一切無い** | profiles | data ゼロ → **defer（hard）** |
| **G8** | **user_confirmed_origin: 確認 timestamp が無い**（originAsOfRef は opaque・anchor confirmedAt は event-start で departure-location でない） | `originInference.ts:228-246` | freshness 偽装になる → **defer** |
| **G9** | locationText は **sensitive 時 undefined**（redaction と absence が overload） | `eventNodes.ts:275`・`dayGraphTypes.ts:161` | originLocationState tri-state が必要 |
| **G10** | STAGE_MAX_CONFIDENCE が walker で**未強制**（inferred 全 stage に moderate を許す） | `originInference.ts:281-348` | walker に per-stage ceiling 追加（companion micro-fix） |
| **G11** | supply builder が**未存在**（`OriginTemporalValidityForLeaveByV0` 型はあるが builder なし） | leaveByAdapter | 新 seam `lib/plan/realityCore/leaveBySupplyOrigin.ts`（pure） |

→ **U2-minimal = `previous_event_end` ONLY**。pure compute（migration なし）。他は fail-closed。

---

## 1. scope（previous_event_end のみ・他は fail-closed/defer）

| origin kind | U2-minimal | 理由 |
|---|---|---|
| **previous_event_end** | **採用** | validity + freshness が dayGraph + U1 startTimeSource から honest に導ける唯一の kind |
| home_assumed | defer | profile に home-location asOf 列が無い（G6）→ freshness は honestly 'unknown' のみ |
| work_assumed | defer（hard） | work_location が DB に無い（G7）→ data ゼロ |
| user_confirmed_origin | defer | 確認-of-departure-location timestamp が無い（G8）→ freshness 偽装 |
| current_location_candidate | **reject 恒久** | currentLocation HOLD・「今いる場所 ≠ 出発場所」・supplier は pass-through で adapter reject（二重防御） |
| unknown_origin | reject | source none・origin signal なし |

---

## 2. 新 seam: pure supply builder（migration なし）

`lib/plan/realityCore/leaveBySupplyOrigin.ts`（pure・IO/時刻/乱数なし）:
```
buildPreviousEventEndOriginValidity(input): OriginTemporalValiditySupplyResultV0
```
入力（既存構造から・新規 persist なし）:
- `dayGraphDate`: 'YYYY-MM-DD'（`DayGraphAttributes.date`）
- `dayGraphSnapshotId`: string（freshness の **実 asOf ref**・G2）
- `arrivalNodeId` / `arrivalTargetInstant`（canonical JST）/ `subjectiveDate` / `transportMode` / `temporalScopeRef`（capability/arrival から・scope 整合用）
- `previousEvent`: { nodeId, endTimeHHMM, durationSource('explicit'|'assumed_default'), boundaryClipped(boolean), locationText?(redaction 込), sensitive(boolean), startTimeSource(U1・前 event anchor 由来), anchorRef }
- `originInferenceStage`: OriginInferenceV0.stage（previous_event_end 期待・他は reject へ）

出力: `OriginTemporalValidityForLeaveByV0`（leaveByAdapter 入力型）+ supply trace。

---

## 3. instant materialization（G3・load-bearing）

```
previousEventEndInstant := `${dayGraphDate}T${pad2(hh)}:${pad2(mm)}:00+09:00`   // endTimeHHMM = "HH:MM"
assert isCalendarValidMinuteJstIso(previousEventEndInstant)   // leaveByAdapter から export 済・再利用
```
- 非 calendar-valid（不正 HH:MM / 不正 date）→ validity='unknown'。
- date は graph 全体で 1 つ（G2）ゆえ same-subjectiveDate は構造保証。

---

## 4. validity 導出（full AND・fail-closed・複数 HIGH hole を封鎖）

`validity='valid'` は**全条件 AND**のときのみ:
1. `originInferenceStage === 'previous_event_end'`（他 stage は reject へ）。
2. **supportedBoundary**: `durationSource==='explicit' ∧ boundaryClipped===false`（G4）。`assumed_default` / `boundaryClipped` → fabricated end → not valid。
3. **previousEventStartProvenance ∈ {user_explicit, imported_exact}**（G5・U1）。`assumed_default`/`system_inferred`/`unknown`/NULL → 前 event の START が default ゆえ end も信用しない → not valid。
4. `previousEventEndInstant` calendar-valid（§3）。
5. **`previousEventEndInstant ≤ arrivalTargetInstant`**（hard-reject・lexicographic 比較）。`>` → originConflict='conflict'（adapter が fail-close）/ validity='unknown'。
6. **originLocationState ≠ 'absent'**（§6 tri-state）。`redacted_sensitive` は opaque ref で valid 可（location を echo しない）・`absent` → not valid。
- 満たさなければ `stale`（boundary/provenance 不足）or `unknown`（instant/scope 不能）。**'valid' を data 無しに到達不可能にする**（critique HIGH の核心）。

---

## 5. freshness 導出（originFreshness orphan を実 asOf で塞ぐ）

- `originFreshness='valid'` は **end-instant が arrival と同一 dayGraph snapshot 由来**のときのみ（G2 same-subjectiveDate 構造保証）。
- **`originAsOfRef := dayGraphSnapshotId`**（opaque だが**実データ backed**・捏造でない）。snapshot 不一致/欠落 → `originFreshness='unknown'` → adapter uncomputed（`U2_ORIGIN_ABSENT_ASOF_IS_UNKNOWN`）。
- これにより「freshness orphan で 'valid' 偽装」を排除（critique HIGH）。home/work/user_confirmed は実 asOf が無いので **'valid' に到達できない**＝ defer の構造的理由。

---

## 6. originLocationState tri-state（G9）

`originLocationState: 'present' | 'redacted_sensitive' | 'absent'`:
- `sensitive===true` → `redacted_sensitive`（location を echo せず opaque `previousEventEndLocationRef` のみ・validity 可）。
- locationText present → `present`。
- locationText undefined ∧ ¬sensitive → `absent` → not valid（出発場所不明では leaveBy を作らない）。

---

## 7. scope 整合（cross-fuel・RD2e-b-A D1/D6 と一致）

- `originTemporalValidity.targetNodeId = arrivalNodeId`（**前 event id でなく到着 node id**）。
- `subjectiveDate = dayGraphDate`・`transportMode`/`temporalScopeRef` = capability/arrival から copy。
- これで RD2e-b-A の 5-fuel scope gate（`leaveByAdapter.ts:349,353,362`）+ completeness + temporalScopeRef を通る。supplier は RD2e-b-A defect（D1-D6・`dd4fa5da`）を**回帰させない**。

---

## 8. originProvenanceKind binding（laundering 防止）

- `originProvenanceKind = 'previous_event_chain'`（previous_event_end 固定）。
- 不変条件: home/work/current の laundering を排除（`gated_current_location` を previous_event_chain に偽装しない）。adapter 側 binding と整合（U1/U2-0 §6）。

---

## 9. companion micro-fix: STAGE_MAX_CONFIDENCE walker（G8・本片に含む）

`originInference.ts:originInferenceViolations` に **per-stage 上限**を追加:
```
STAGE_MAX_CONFIDENCE = { unknown_origin:'none', previous_event_end:'moderate',
  home_assumed:'low', work_assumed:'low', current_location_candidate:'moderate', user_confirmed_origin:'high' }
```
- `confidence > STAGE_MAX_CONFIDENCE[stage]` → violation。inferred 全 stage に moderate を許す穴を塞ぐ。
- previous_event_end は moderate 上限（high は user_confirmed 予約）。本片の builder も confidence を moderate 上限で扱う。

---

## 10. supply missingInput taxonomy（internal trace・adapter 8 reason へ写像）

`LeaveBySupplyOriginMissingInput`（raw echo なし）:
```
origin_stage_not_previous_event_end | previous_event_boundary_unsupported |
previous_event_start_defaulted | previous_event_end_not_calendar_valid |
previous_event_end_after_arrival | origin_location_absent |
origin_snapshot_asof_missing | origin_scope_mismatch
```
- bundle.missingInputs（trace）に残し、null origin として RD2e-b に渡す → adapter は自前 `origin_temporal_invalid` 等へ写像（closed 8 reason 不変）。orphan 化させない。

---

## 11. 対象外（次 scoped slices・各々完全設計）

- **U2-home/work**: profile に `baseline_home_asof`（+ work_location + asof）を追加してから（G6/G7・要 migration）。
- **U2-user-confirmed**: departure-location 確認 timestamp + 入力 UI を追加してから（G8）。
- **currentLocation**: 恒久 HOLD（CEO）。
- **U1-rest 依存**: 前 event が google/microsoft/shift/pdf/image/chat/template 由来だと start provenance が unknown → previous_event_end は honestly 'unknown'。U1-rest 着地で valid 化が広がる（synergy・本片では fail-closed）。

---

## 12. U2-minimal 実装 GO 条件 + tests 計画

**GO 条件（漏れなし）**: (1) 新 pure `leaveBySupplyOrigin.ts`（builder + instant materialization + validity/freshness/location/scope/provenance 導出）/ (2) STAGE_MAX_CONFIDENCE walker micro-fix（originInference）/ (3) **migration なし**（pure compute）/ (4) RD2e-b 接続は別 GO（本片は OriginTemporalValidityForLeaveByV0 を**返すだけ**）。

**tests 計画**:
1. previous_event_end + explicit ∧ ¬clipped + start=user_explicit + prevEnd≤arrival + location present → validity='valid'・freshness='valid'（asOf=snapshotId）
2. assumed_default end → 'stale'（supportedBoundary false）
3. boundaryClipped → 'stale'
4. 前 event start_time_source=assumed_default/system_inferred/unknown → not valid（U1 synergy）
5. prevEnd > arrival → conflict/unknown（hard-reject）
6. instant 非 calendar-valid（不正 HH:MM）→ 'unknown'
7. sensitive location → redacted_sensitive・valid 可・location 非 echo
8. location absent → not valid
9. snapshot 不一致/欠落 → freshness='unknown'
10. originKind≠previous_event_end（home/work/current/unknown）→ reject（pass-through）
11. scope: targetNodeId=arrival node・subjectiveDate=graph date・mode/temporalScopeRef 整合
12. STAGE_MAX_CONFIDENCE: previous_event_end に high → walker violation・home/work に moderate → violation
13. originProvenanceKind='previous_event_chain' 固定
14. RD2e-b 5-fuel scope gate を通る（回帰なし・D1-D6 不変）
15. source-scan: currentLocation/geolocation/Date/乱数なし・raw location 非 echo
16. tsc baseline 55

---

## 13. Department Responsibility Matrix（U2-minimal-0・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Mobility/Build** | R | supply builder・validity/freshness 導出・instant materialization・walker ceiling |
| **Context/Temporal** | C | dayGraph date/snapshot・prev-event-end・supportedBoundary |
| **Permission** | C | currentLocation HOLD・location redaction（tri-state）・laundering 防止 |
| **Risk** | C | fail-closed（'valid' を data 無しに不可能化）・prevEnd≤arrival・no fabrication |
| **CEO** | A | U2-minimal 実装 GO / U2-home-work・user-confirmed の asOf 拡張 GO |

---

## 14. 自己判定

- **U2-minimal は実装可能水準**で、U1 と違い **migration なし（pure compute）**。`previous_event_end` の validity + freshness は dayGraph snapshot + supportedBoundary + U1 startTimeSource から **honest に**導ける唯一の kind。
- critique の HIGH hole（freshness orphan / supportedBoundary だけでは不足 / prevEnd≤arrival 未実装 / location overload）を full-AND validity + 実 asOf(snapshotId) + tri-state で封鎖。
- home/work/user_confirmed は **honest な asOf/data が無い**ため defer（dishonest 'valid' を作らない＝正しさ）。
- 実装は GO 後。本書はコードを含まない。
