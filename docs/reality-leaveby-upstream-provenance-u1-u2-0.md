# U1/U2-0 — LeaveBy Upstream Supply Provenance Design（docs-only）

- 日付: 2026-06-15 / 位置づけ: RD2e-SUPPLY が arrivalTarget（U1）/ originTemporalValidity（U2）を **honest に**供給できるよう、上流に必要な provenance schema を設計する。RD2e-SUPPLY-0A の honest 結論（現状では常時 uncomputed）を解くための前提。
- 規律: **コードを書かない**。schema 実装・mapper 変更・DB migration・originInference 変更・currentLocation 取得・RC2a/UI には進まない。
- 方法（CEO ①②③ + ultracode）: **adversarial workflow（`wf_9bf7f319`・6 grounding + 3 critique・実コード file:line 根拠）**で上流構造を監査し、提案 schema を red-team。下記は推測でなく確認事実。

---

## 0. adversarial 現状監査の中核発見（file:line 根拠）

| # | 発見 | 根拠（実コード） | 帰結 |
|---|---|---|---|
| **G1** | **recurrence 展開は provenance を完全保存**。`expandRecurrence` は日付配列のみ返し、`anchorsForDay` は**原 anchor を無改変で返す**。startTime 再導出なし | `lib/plan/recurrence-expander.ts`・`app/(culcept)/plan/tabs/_helpers.ts:anchorsForDay` | **継承は健全**（rule の startTimeSource をそのまま継承・upgrade なし） |
| **G2** | **`assumed_default`(60min) は endTime にのみ・EventNode 生成時**。startTime には適用されない | `lib/plan/dayGraph/eventNodes.ts:166-170`・`DEFAULT_EVENT_DURATION_MIN=60` | startTime の default 化は別経路（all-day 00:00・§G3） |
| **G3** | **all-day import は `startTime='00:00'` を hardcode**。mapper が `tzid`/`isAllDay` を**破棄** | `icsParser.ts:icalTimeToIso`・`icsToAnchorMapper.ts:181-182`（google/ms 同様） | **all-day 00:00 と実時刻 00:00 が read-path で区別不能 = false-fixed の核心 leak** |
| **G4** | **`shift_image` の startTime は辞書 default**（SHIFT_CODE 表引き・user/exact でない） | shift import adapter | imported_exact でなく **system_inferred**（要 user 確認） |
| **G5** | **`confirmedAt` は MANDATORY だが「anchor 存在の承認」**であって「startTime 正確性の確認」ではない | `external-anchor.ts:RecurringExternalAnchor` | confirmedAt 単独で user_explicit にできない |
| **G6** | **per-instance override が存在しない**。`exceptionDates` は date-only 除外のみ・RECURRENCE-ID/EXDATE 非対応 | `external-anchor.ts`・`icsParser.ts` | 「exception が独自 source を持つ」は**現状実現不能**（v0 未対応と明記） |
| **G7** | **`OriginInferenceV0` に asOf/freshness/timestamp が一切ない** | `originInference.ts:91-104` | **`originFreshness='valid'` は orphan**（producer 無し）→ unknown fail-closed |
| **G8** | confidence hardcode: user_confirmed=`high` / previous_event_end=`moderate` / home/work_assumed=`low` / current_location_candidate=`moderate` / unknown=`none`。**walker は inferred 全 stage に moderate を許す**（cap 未強制） | `originInference.ts:109-116, 171-` | home/work cap は walker で**構造的に未強制** |
| **G9** | **supportedBoundary は導出可能** = `durationSource==='explicit' ∧ boundaryClipped===false`。clip end=`23:00`(fabricated) | `dayGraphTypes.ts:142-178, 44`・`eventNodes.ts:175-178` | previous_event_end の妥当性 gate を grounded に書ける |
| **G10** | `locationText` は **sensitive 時 undefined**（redaction と absence が overload） | `dayGraphTypes.ts:156-157` | locationRef は **tri-state**（present/redacted/absent）が必要 |

→ **核心結論**: U1/U2 は「read-path wrapper」ではない。**ingestion/inference 層に新 provenance を persist する schema 追加**が要る（U1=9 ingestion paths、U2=originInference + asOf）。それまで両者は **fail-closed（exact 不可・valid 不可）**。

---

## 1. U1 — StartTimeProvenance schema

```
type StartTimeSource = 'user_explicit' | 'imported_exact' | 'system_inferred' | 'assumed_default' | 'unknown';

interface StartTimeProvenanceV0 {            // ← anchor / EventNode に persist（read で derive しない）
  startTimeSource: StartTimeSource;
  startTimeValueRef: string;                  // 正規化 startTime の opaque ref（raw HH:MM を echo しない）
  startTimeConfirmedAtRef: string | null;     // **anchor の confirmedAt とは別**（時刻確定の as-of・G5）
  isAllDayPlaceholder: boolean;               // all-day 00:00 placeholder か（G3・persist 必須）
  timezoneOfRecordRef: string | null;         // tzid 保存（G3・imported_exact の根拠）
  anchorId: string; eventNodeId: string | null;
  subjectiveDate: string; targetEventDate: string; timezone: 'JST';
  confidence: 'high' | 'moderate' | 'low' | 'none';
  sourceRefs: string[]; evidenceRefs: StartTimeEvidenceRef[];
  displayPolicy: 'hidden';
}
interface StartTimeEvidenceRef { code: string; sourceKind: StartTimeSource; }
```

**confirmed 候補は `user_explicit` / `imported_exact` のみ**。`system_inferred`→tentative・`assumed_default`/`unknown`→reject。

**核心不変条件（grounded・walker-checkable）**:
- **`startTimeSource` は read 時に derive しない・creation 時に persist し read は参照のみ**（G3-G5: read-path に exactness 情報が無い）。
- **禁止 proxy**: `durationSource`（DURATION 用）/ `sourceType==='manual'` 単独 / `confirmedAt` 単独 から source を導かない（負の不変条件 `U1_CONFIRMEDAT_IS_NOT_TIME_CONFIRMATION`）。
- **all-day → 必ず `assumed_default`**（`isAllDayPlaceholder===true` → imported_exact/user_explicit 不可・`U1_ALLDAY_DEFAULT_NOT_EXACT`・G3）。`isAllDay` を persist して初めて検査可能。
- **shift_image → `system_inferred`**（辞書 default・`U1_DICTIONARY_RESOLVED_NOT_EXACT`・G4）。user 確認で初めて昇格。
- **ICS timed → `imported_exact`** は **`tzid`+`isAllDay` を persist した時のみ**（現状破棄ゆえ underivable・G3）。
- **`startTimeConfirmedAtRef`（時刻確定の as-of）が無ければ `user_explicit` 不可**（G5: confirmedAt は存在承認）。
- 各 ingestion path（manual/template/pdf/image/chat/ics/google/microsoft/shift_image）の **mapper/adapter で path 知識が残っている時点で persist**（read 層は collapse 済 sourceType しか見えない）。

---

## 2. U1 ↔ fixedness 接続条件

RD2e-SUPPLY が arrival を `fixed` 供給できる条件（RD2e-SUPPLY-0A §2 と接続）:
- `startTimeSource ∈ {user_explicit, imported_exact}` ∧ `isAllDayPlaceholder===false` ∧ `confidence ≠ low` ∧ `startTimeConfirmedAtRef ≠ null`。
- それ以外（system_inferred/assumed_default/unknown/all-day）→ `tentative`/reject → RD2e-b で `arrival_not_fixed` uncomputed。
- **adapter D4（実装済 RD2e-b-A）が `startTimeProvenance==='confirmed'` を再要求**するので、supply が誤って fixed を付けても二重に弾かれる。

---

## 3. recurring / one-off での startTimeSource 扱い（G1/G6 反映）

- **継承は健全（G1）**: 展開 instance は rule の `startTimeSource` を**そのまま継承**（upgrade 禁止・`U1_RECURRENCE_INHERITS_RULE_SOURCE_NO_UPGRADE`）。rule の source が assumed_default なら全 instance も assumed_default（default の laundering を防ぐ）。
- **per-instance override は v0 未対応（G6）**: `exceptionDates` は date-only 除外のみ。RECURRENCE-ID/EXDATE で移動した occurrence は **復元不能** → そのような instance の startTime を honest に供給できない（`U1_RECURRENCE_OVERRIDE_UNSUPPORTED_EXCLUDE`: 移動 occurrence は除外日扱い・stale rule 時刻を出さない）。
- **将来 per-instance override を入れる時は instance 自身の `startTimeProvenance` を持たせる**（default は system_inferred）。本書は設計のみ。
- one-off: anchor の startTimeSource をそのまま（manual→user_explicit / ics-timed→imported_exact[tzid persist 後] / all-day→assumed_default）。

---

## 4. U2 — OriginTemporalValidity schema（G7/G9/G10 反映）

```
type OriginFreshness = 'valid' | 'stale' | 'unknown';

interface OriginTemporalValidityV0 {          // originInference + transition から導出（supply 層）
  originKind: ComputedOriginKind | 'current_location_candidate' | 'unknown';
  originProvenanceKind: 'user_confirmed' | 'previous_event_chain' | 'home_profile' | 'work_profile' | 'gated_current_location' | 'none';
  validity: 'valid' | 'stale' | 'unknown';
  originFreshness: OriginFreshness;
  originAsOfRef: string;                       // **実 observation timestamp の ref**（confirmedAt を alias 不可・G7）
  originSubjectiveDate: string;
  confidence: 'high' | 'moderate' | 'low' | 'none';   // gate で cap 強制（§5）
  originConflict: 'none' | 'minor_discrepancy' | 'conflict';
  originLocationState: 'present' | 'redacted_sensitive' | 'absent';   // tri-state（G10）
  previousEventEnd: PreviousEventEndForOriginV0 | null;
  targetNodeId: string; subjectiveDate: string; transportMode: TransportModeV0; temporalScopeRef: string | null;
  sourceRefs: string[]; evidenceRefs: OriginTemporalEvidenceRef[];
  displayPolicy: 'hidden';
}
interface PreviousEventEndForOriginV0 {
  previousEventEndInstant: string;             // calendar-valid JST
  previousEventEndLocationRef: string | null;  // opaque（redacted は ref のみ）
  previousEventSourceRef: string; previousEventNodeId: string; previousEventSubjectiveDate: string;
  previousEventSupportedBoundary: boolean;     // = durationSource==='explicit' ∧ boundaryClipped===false（G9）
  previousEventEndProvenance: 'explicit' | 'boundary_clipped' | 'assumed_default';
  previousEventStartProvenance: StartTimeSource;  // 前 event の START も defaulted なら end も信用しない
}
```

**核心不変条件（fail-closed・walker-checkable）**:
- **`originFreshness='valid'` は `originAsOfRef` が実 as-of に解決できる時のみ**（G7: 現状無 → 既定 `unknown`・`U2_ORIGIN_ABSENT_ASOF_IS_UNKNOWN`）。confirmedAt を alias 禁止。
- **previous_event_end の妥当性**（全 AND）:
  - `previousEventSupportedBoundary===true`（= explicit ∧ ¬boundaryClipped・G9）。`boundary_clipped`(23:00 fabricated) / `assumed_default` → NOT valid。
  - **`previousEventStartProvenance ∉ {assumed_default, unknown, system_inferred}`**（前 event の START も defaulted なら end は fabricated・`U2_PREV_EVENT_DEFAULTED_START_NOT_VALID`）。
  - `previousEventEndInstant ≤ arrivalTargetInstant`（time-reversal は **hard-reject**・feasibility の "insufficient" に degrade させない）。
  - `previousEventSubjectiveDate === originSubjectiveDate`（別日 → stale/unknown）。
  - `originLocationState`: `absent`→NOT valid / `redacted_sensitive`→opaque ref で valid 可（location を echo しない・G10） / `present`→valid 可。
- `current_location_candidate` / `unknown` originKind は valid にしない（§6）。

---

## 5. home/work assumed の扱い（G8 反映・cap を構造強制）

- **stage→maxConfidence を originInference walker で強制**（G8: 現状 walker は inferred 全 stage に moderate を許す穴）。`home_assumed/work_assumed max='low'`・`previous_event_end max='moderate'`・`user_confirmed='high'` 予約。`STAGE_MAX_CONFIDENCE` map + `originInferenceViolations` に追加（U2 実装で）。
- **`OriginTemporalValidityV0.confidence` を gate で cap**: `originKind ∈ {home_assumed, work_assumed}` は `confidence > 'moderate'` を reject・`high` 厳禁（high は user_confirmed 予約）。現状 `OriginTemporalValidityForLeaveByV0` に confidence field が無く cap 不能 → **field 追加が前提**。
- home/work_assumed は **confirmed origin でない**（static 仮定）・`user_confirmed_origin` があれば優先・**currentLocation で上書きしない**・conflicting origin → invalid/unknown。
- **originFreshness 導出（home/work）**: profile last-updated の asOf が bounded recency 内 ∧ 同 logical context の時のみ valid・さもなくば stale/unknown（gate が valid 必須ゆえ asOf 無では uncomputed）。

---

## 6. currentLocation HOLD 確認 + laundering 防止（G8 critique 反映）

- **U2 でも currentLocation を取得しない**・`current_location_candidate` を valid origin にしない・geolocation/browser location import 禁止・future slice まで HOLD（不変）。
- **laundering 防止（新）**: `originProvenanceKind` を gate に bind し、home/work origin が **`home_profile`/`work_profile` 由来であることを証明**（`gated_current_location` 由来を home/work に偽装させない）。
- **`currentObservationOverrodeConfirmed` は input でなく derived にする**: `(userConfirmedOriginPresent ∧ selectedOriginKind===current_location_candidate)` から計算し、`selectedOriginKind !== current_location_candidate` を不変条件化（self-attested boolean を信用しない）。
- **user_confirmed precedence の不変条件**: `userConfirmedOriginPresent===true ⇒ selectedOriginKind === user_confirmed`（precedence を構造化）。

---

## 7. RD2e-SUPPLY 実装 GO 条件（walker-checkable）

supply 層は未実装ゆえ、全不変条件を **prose でなく walker-checkable** に定義（critique 指摘）。GO 前提:
- U1: 各 ingestion path で `startTimeSource` + `isAllDayPlaceholder` + `timezoneOfRecordRef` + `startTimeConfirmedAtRef` を **persist**（DB schema 追加）。read は参照のみ。
- U2: `OriginInferenceV0` に `originAsOfRef` + `originSubjectiveDate` 追加 + `STAGE_MAX_CONFIDENCE` walker 強制。`OriginTemporalValidityForLeaveByV0` に `confidence`/`originProvenanceKind`/`originLocationState` 追加。
- 上記が揃うまで supply は **fail-closed**（fixed arrival 不可・valid origin 不可 → leaveBy 常時 uncomputed・無害だが空）。

---

## 8. U1 実装と U2 実装を分けるべきか — 自己判定

- **分けるべき（独立）**。U1=arrival provenance（ingestion 9 paths + DB column）/ U2=origin validity（originInference + asOf + walker）。依存なし・別々に GO/実装可能。
- **U1 の方が surface が広い**（9 mapper/adapter + DB migration + 各 path の exactness 判定）。リスク高・app 横断。
- **U2 は realityCore + originInference 局所**だが asOf の実 source（観測 timestamp）が要る。
- 推奨: **U1-minimal**（manual + ics-timed の 2 path だけ先に persist = honest に exact を出せる最小集合）→ U2（asOf + cap）→ RD2e-SUPPLY。pdf/image/chat/shift/all-day は system_inferred/assumed_default 固定でよい（fail-closed）。
- **→ U1-minimal の詳細設計（manual + ICS-timed の永続化）= `docs/reality-leaveby-u1-minimal-startsource-0.md`（U1-minimal-0）**。grounding（`wf_68719869`）で choke point=`createSourceWithAnchors`・**二重書込経路（RPC + sequential）**・DB 正規化カラム・ICS が isAllDay/tzid を `icsToAnchorMapper.ts:181` で drop・manual が startTime を prefill を確認。CHECK 制約 + signal 分離 + server 導出で fail-open を封じる。**scope を最小に割るのは詳細プランの精度のため（corner-cut でない）**。

---

## 9. honest 結論 + 戦略読み（CEO ⑤⑧）

- **leaveBy 内部鎖は完成・安全（RD2e-a..b-A）**。残るは「実際に非 uncomputed な leaveBy を出す」ための**上流 provenance 投資**（U1 ingestion persist + U2 asOf/cap）。
- これは **pure-core を超える cross-cutting 実装**（DB migration・9 mapper・originInference 変更）。payoff（実 leaveBy 表示）は consumer 面（RC2a/departure line）が HOLD ゆえ**さらに下流**。
- **戦略選択肢（CEO 判断）**: (A) **U1-minimal だけ実装**して manual/ICS-timed の fixed arrival を解禁（薄い実 leaveBy）/ (B) **mobility 鎖をここで park**（完成・安全・honest-uncomputed）し、今月最優先の **Stargazer 深層観測**へ資源を戻す。CLAUDE.md の monthly priority に照らすと **(B) が整合的**。本書はその判断材料。

---

## 10. Department Responsibility Matrix（U1/U2-0・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Mobility** | R | U1/U2 schema・walker-checkable 不変条件・fixedness/validity 接続 |
| **Context/Temporal** | C | ingestion path の exactness 判定・recurrence 継承・previous_event_end・asOf |
| **Permission** | C | origin opaque・currentLocation HOLD・laundering 防止・location redaction |
| **Risk** | C | fail-closed（exact/valid 不可は uncomputed）・default laundering 防止 |
| **CEO** | A | U1/U2 実装 GO（DB schema 含む）/ mobility 鎖 park vs 続行の戦略判断 |

---

## 11. 自己判定

- U1/U2 の honest な schema は本書で確定（grounded・fail-closed・walker-checkable）。
- **最大の発見**: U1 の exact 判定は read-path で不可能で、**ingestion 9 paths + DB persist** が前提（all-day 00:00 / shift 辞書 / confirmedAt の 3 つが false-fixed leak）。U2 の freshness は orphan で **実 asOf 追加**が前提。
- **実装は可能だが pure-core を超える**（DB migration・app 横断）。RD2e-SUPPLY を活かすには U1-minimal + U2 が要る。
- **戦略推奨**: mobility 鎖は安全な完成点に到達済 → **park して Stargazer へ戻す**か、**U1-minimal の薄い解禁**かを CEO 判断。本書はコードを含まない。
