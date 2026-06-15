# RD2d-b-VALUE-0 — Internal Duration Value Channel Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: duration value channel 設計セッション
- 位置づけ: RD2e-b0A（`8b26254c`）+ adversarial verify（`wf_20a3e3bb`）が発見した根本ギャップ —「**`leaveBy = arrival − duration − buffer` の duration 数値がどこにも存在しない**」— を埋める。`RouteEtaCapabilityV0` は consumer-safe な **flag projection**（durationSignalPresent/timeEstimateUsableForPlanning は bool）で **minutes を持たない**。leaveBy 計算には数値が要る → capability とは別の **internal-only planning-grade duration value channel** を設計する。
- 規律: **コードを書かない**（docs-only）。value channel 実装・provider/adapter の value 出力・capability binding 実装・route provider 接続・currentLocation・weather・RC2a・UI・production には進まない。
- 上流: RD2e-b0A `8b26254c`（PlanningGradeTimeEstimateForLeaveBy 構想）+ RD2d-a-A/a-B（capability flags）+ RD2e-a/a-A（leaveBy 型・walker）。

---

## 0. 前提を疑う（CEO ① — 「二鍵」設計: capability も value も単独では leaveBy を authorize しない）

flag-only capability（consumer-safe）と raw を持たない規律を**壊さず**、計算に必要な数値を供給する核心アイデア:

> **capability（gate flag・consumer 射影）と value（数値・server-only）を同一 identity で bind し、どちらも単独では leaveBy を authorize できない**ようにする。capability だけでは minutes が無く、value だけでは gate（`timeEstimateUsableForPlanning`）が無い。両者が**同一 capability に bind され揃った時のみ**計算可能。

これにより 2 つの failure mode を構造排除: ①value だけで能力主張（overclaim・gate なき数値）②capability だけで minutes 捏造（数値なき gate）。value は **leaveBy computation fuel** であって consumer payload に出さない（INV-DURATION-INTERNAL）。

---

## 1. capability と value の分離（CEO 必須 1）

| | RouteEtaCapabilityV0（既存） | PlanningGradeDurationValueV0（新・本設計） |
|---|---|---|
| 役割 | consumer-safe **flag projection** | server-only **計算燃料（数値）** |
| 中身 | bool（timeEstimateUsableForPlanning 等）・enum・opaque ref | duration minutes（integer）+ binding |
| 露出 | consumer payload に出る（genericized） | **consumer payload に出さない・client に渡さない** |
| nest | — | **capability に nest しない**（capability の JSON identity を byte-for-byte 維持） |
| raw | 既に raw なし | raw route response/payload/coords/placeId/graphViewerKey を**持たない** |

- **絶対則**: duration value は **capability に nest しない**（並行チャネル・sibling return）。**consumer DTO 前提 field にしない**。**server/internal-only**。leaveBy computation fuel 専用。

---

## 2. value identity / binding（CEO 必須 2・二鍵の鍵合わせ）

value は **bind された capability と同一 identity basis** を持ち、`timeEstimateUsableForPlanning` が true の capability にのみ usable。

> **⚠ RD2d-b-B 補正（CEO 監査 2026-06-14）: hash-only binding は禁止**。`capabilityIdentityRef`（content hash）は **短縮 key / cache key であって内容同一性の証明ではない**（collision 可能・provenance 追跡不能）。binding には **full basis** を持たせ、RD2e-b は **hash 照合 + full basis 整合**を確認する（mismatch → uncomputed/violation）。

```
DurationValueScopeV0 = {
  originRef, destinationRef,            // opaque（RD2d-a OpaqueEndpointRef・raw 座標なし）
  targetNodeId, subjectiveDate, transportMode, temporalScopeRef,
}
DurationValueBindingToCapabilityV0 = {
  capabilityIdentityRef: string,        // **短縮 key（cache key）・内容証明ではない**（既存 fnv1a）
  routeEtaSupplyId: string | null,      // あれば（RD2d-0A 構想）
  // full basis（hash だけで bind 成立としない・RD2e-b が field-by-field 照合）:
  capabilitySchemaVersion: number,
  capabilityDerivationVersion: string,
  originRef, destinationRef,            // opaque
  targetNodeId, subjectiveDate, transportMode, temporalScopeRef,
  providerKind, providerVersion,
  freshnessRef, scopeRef,
  sourceRefs: ReadonlyArray<string>,
  evidenceRefs: ReadonlyArray<DurationValueEvidenceRef>,
}
```

- **不変条件**:
  - **hash だけで binding 成立としない・`capabilityIdentityRef` 同一だけで内容同一とみなさない**（CEO 監査）。
  - **RD2e-b は hash 照合 + full basis 整合**を確認（capabilitySchemaVersion/DerivationVersion/origin/dest/target/date/mode/temporalScope/providerKind/providerVersion 等が bind 先 capability と一致）。**full basis mismatch → uncomputed/violation**。
  - **value の `usableForLeaveByComputation` は bind 先 capability の `timeEstimateUsableForPlanning` と一致**（独立 source of truth にしない・overclaim 防止）。**value 単体の usableForLeaveByComputation=true を信用しない**（RD2e-b は必ず bind 先 capability を入力に取り、capability false なら value true でも unusable）。
  - **value だけで能力を主張しない**（gate は capability 側）。**capability だけで duration minutes を作らない**（数値は value 側）。
  - scope mismatch（別 trip）→ usable false。

---

## 3. duration value semantics（CEO 必須 3・over-precision 排除）

```
DurationValueKind = "point" | "range" | "upper_bound" | "scheduled_duration" | "user_confirmed_duration"
PlanningGradeDurationValueV0 = {
  schemaVersion: 0,
  timeEstimateRef: string,
  durationKind: DurationValueKind,
  durationUpperBoundMinutes: number,    // **integer ≥ 0・5 分 ceil（% 5 === 0）**・leaveBy が使う保守端
  durationLowerBoundMinutes: number | null,  // range のみ（≤ upper・integer ≥ 0）
  unit: "minutes",
  basis: DurationValueBasis,
  scope: DurationValueScopeV0,
  freshness: DurationValueFreshnessV0,
  binding: DurationValueBindingToCapabilityV0,
  sourceRefs: ReadonlyArray<string>,    // opaque
  evidenceRefs: ReadonlyArray<DurationValueEvidenceRef>,
  usableForLeaveByComputation: boolean, // = capability.timeEstimateUsableForPlanning ∧ fresh ∧ basis allowed
  displayPolicy: "internalReference" | "debugOnly",
}
```

- **不変条件**:
  - **`durationUpperBoundMinutes` は integer ≥ 0・5 分 ceil**（`% 5 === 0`・false precision を作らない・fractional は COORD_PATTERN を誤発火させる + median を生で使わない）。
  - **point median をそのまま leaveBy に使わない**（RD2e-b は upper bound を使う・point は保守膨張 + buffer 1 段上げ・RD2e-b0A §2）。
  - **average duration 禁止・false precision 禁止**。range は lower ≤ upper。
  - **⚠ ceil 前の raw/precise duration を保持しない（CEO 監査）**: value object に **`preCeilMinutes` を持たない**・**exact provider seconds を保持しない**・**provider duration raw を保持しない**。**stored は既に rounded safe upper bound**。変換の根拠は `conversionRule`/`ceilRule`（§6 trace）だけを残し、**exact raw が必要なら別 debug-only 内部で・value object/consumer には載せない**（過剰精密・provider raw 再混入を防ぐ）。

---

## 4. allowed / forbidden basis（CEO 必須 4）

```
DurationValueBasis = "external_route" | "cached_route" | "scheduled" | "user_confirmed"
```

| 許可 | 禁止（value を作れない/usable false） |
|---|---|
| external_route / cached_route(fresh) / scheduled / user_confirmed | **heuristic / none / unknown / malformed / stale / expired / static straight-line** |

- **絶対則**: **heuristic から duration value を作らない**（planning-grade allowlist のみ・RD2d-a-A の `durationProjectionGradeOk` と整合）。malformed/none/unknown → usable false。

---

## 5. freshness / scope（CEO 必須 5）

```
DurationValueFreshnessV0 = {
  freshnessStatus: "fresh" | "stale" | "expired" | "unknown",
  fetchedAtRef: string | null,          // 取得時刻 opaque ref
  validUntilRef: string | null,
  staleReason: string | null,
}
```

- **不変条件**:
  - **stale/expired/unknown → usableForLeaveByComputation false**（古い所要で leaveBy を作らない）。
  - **scope mismatch（origin/dest/mode/timeBand/arrivalTarget が bind 先と不一致）→ usable false**。
  - freshness は capability の freshness（RD2d-a-B: fresh + fetchedAtRef 必須）と整合。

---

## 6. provider result との関係（CEO 必須 6・raw を捨て数値だけ昇格）

- provider（cascade wrapper / external route）が **duration number を持つ場合でも raw payload/route response は捨てる**。**numeric duration（integer minutes）だけを validated value へ昇格**。
- **⚠ provenance trace（CEO 監査・raw は持たないが「なぜ有効か」の trace は残す）**: 数値だけ残す場合でも最低限 **providerKind / providerVersion / durationBasis / durationKind / durationSourceRef / freshnessRef / scopeRef / evidenceRefs / conversionRule / ceilRule / pointTreatment / valueCreatedBy** を value に保持（raw provider payload/route response/coordinates/polyline/address/placeId は保持しない）。raw を持たず trace を残すことで「捏造でない有効な minutes」を後で監査可能にする。
- **raw route response/polyline/coords を value object に載せない**（§7 leak guard）。
- **provider overclaim は walker で落とす**（value の usableForLeaveByComputation は capability flag と一致必須・基準を満たさねば usable false）。
- **malformed value（非 integer・負・basis 不正）→ usable false**。**dependency exception → value なし**（null・RD2d-c-A の総関数化と同型）。
- **実装方式（RD2d-b-VALUE）**: `resolveRouteEtaCapability` を **`{ capability, durationValue: PlanningGradeDurationValueV0 | null }` の sibling return** に拡張（value は capability に nest しない）。provider result に **internal `planningGradeDurationMinutes`（integer・kind・bound）** を追加し、adapter が capability usable 時のみ value へ routing。

---

## 7. leak guard（CEO 必須 7）

- **禁止**: raw coordinates / polyline / encodedPolyline / route response / placeId raw / provider payload / graphViewerKey / waypoints / 座標 encoding（geohash/plus_code 等）。
- value object を **consumer DTO に出さない**（INV-DURATION-INTERNAL）。**violation message は raw を echo しない**（redact・RD2d-c-A2 と同型）。
- **`containsRawLocation` 共有方針**: RD2d-c-A2 で wrapper に入れた magnitude-bounded coord-pair + plus-code + geocoding token 検出を、**RD2d-b-B（`lib/plan/realityCore/routeEtaSafety.ts`・実装済）で capability/adapter/wrapper に共有化済**（単一実装・drift 排除）。value の leak scan も**この共有 `containsRawLocation` を使う**。**integer minutes は許容**（COORD_PATTERN を誤発火させないよう integer 強制）。
- **provider invocation 境界の総関数化（RD2d-b-B2 `117f27e1`・前提条件）**: VALUE channel は duration value path を増やし **例外面を広げる**。これに先立ち adapter の `await provider(input)` を `try/catch`（binding 無し）で総関数化済 — 任意 provider が throw/reject しても adapter は throw せず、raw exception の message/stack/payload を一切 echo せず `routeEtaSafeExceptionReason()`（`dependency_error`）→ `no_route_source` に倒す。**value 生成 path も同じ境界の内側に置く**（value path 固有の throw が leak/chain 破壊にならない）。

---

## 8. RD2e-b への接続（CEO 必須 8・二鍵照合）

RD2e-b adapter は:
1. `PlanningGradeDurationValueV0` を **consume**（依存注入）。
2. **capability と value の binding を検証**（value.binding.capabilityIdentityRef === capability.identity hash）。
3. **value missing / stale / not usable / capability mismatch → uncomputed**（fake leaveBy なし）。
4. **capability.timeEstimateUsableForPlanning ∧ value.usableForLeaveByComputation の両方** + arrival target + buffer + origin temporal validity が揃えば、**value.durationUpperBoundMinutes（保守端）+ buffer**で leaveBy instant を計算（RD2e-b0A §4 pure subtraction）。
- **絶対則**: **二鍵（capability gate ∧ value 数値・同一 binding）が揃わなければ uncomputed**。

---

## 9. RD2d-b-VALUE 実装 GO 条件（チェックリスト）

| 条件 | 内容 |
|---|---|
| capability/value 分離 | value を capability に nest しない・consumer payload に出さない |
| sibling return | `resolveRouteEtaCapability → { capability, durationValue|null }` |
| integer 5 分 ceil | durationUpperBoundMinutes integer ≥0・% 5 === 0 |
| allowlist basis | external_route/cached_route/scheduled/user_confirmed のみ・heuristic→null |
| binding | capabilityIdentityRef で capability と bind・usableForLeaveByComputation = capability flag |
| freshness | stale/expired/unknown → usable false |
| leak guard | 共有 containsRawLocation（RD2d-b-B 後）・raw payload 捨てる・message redact |
| walker | `durationValueViolations`（integer/5 分/allowlist/binding/freshness/leak） |
| 不接触 | route provider 実行/external API/currentLocation/weather/RC2a/UI/DB なし（pure・依存注入） |
| tests | provider result→value mapping・heuristic→null・stale→usable false・binding mismatch→usable false・raw 不露出・integer 強制・RD2 targeted・tsc 55 |

- **推奨順**: RD2d-b-B（leak pattern 共有化・provider exception guard）→ **RD2d-b-VALUE 実装**（value channel + sibling return + walker）→ RD2e-b（leaveBy adapter・二鍵照合 + subtraction）。

---

## 10. Department Responsibility Matrix（RD2d-b-VALUE-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Mobility**（value channel 設計）+ **Build**（capability/value 分離・binding の technical safety） |
| consultedDepartments | Permission（consumer 非露出・PII）・Risk（over-precision/stale/overclaim）・Communication（value を user-facing に出さない）・Context（freshness） |
| blockingDepartments | **CEO**（RD2d-b-VALUE 実装 GO・RD2e-b は別 gate）+ Permission + production gate |
| outputs | RD2d-b-VALUE-0 設計（capability/value 分離・internal-only・identity/binding・semantics・allowlist basis・freshness/scope・provider 関係・leak guard・RD2e-b 接続・実装 GO 条件）。**コードなし** |
| safetyGate | **二鍵（capability gate ∧ value 数値・同一 binding）が揃わねば uncomputed**・**value は capability に nest しない/consumer 非露出/server-only**・**integer 5 分 ceil（false precision なし・median 生使用なし）**・**planning-grade allowlist のみ（heuristic/none/stale → usable false）**・**usableForLeaveByComputation = capability flag（独立 source にしない）**・**raw payload/route response/coords を value に載せない（共有 containsRawLocation・message redact）**・provider overclaim は walker で落とす・dependency exception → value null・production gate 未通過 |
| traceRefs | RD2e-b0A duration value 構想 / RD2d-a-A capability(flags) / RD2d-c-A2 containsRawLocation / RD2e-a leaveBy 型 |

---

## 11. 自己判定

- **RD2d-b-VALUE-0 は設計 ready**。核心は **「二鍵」設計** — capability（gate・consumer-safe）と value（数値・server-only）を同一 binding で結び、**どちらも単独では leaveBy を authorize しない**。これで flag-only 規律（consumer-safe・raw なし）を保ったまま、計算に必要な数値を internal-only に供給。
- **RD2d-b-VALUE 実装 GO は CEO 専管**。推奨: RD2d-b-B（leak 共有化）→ RD2d-b-VALUE（value channel）→ RD2e-b（leaveBy adapter）。
- 革新点（CEO ⑥⑦）: **capability=consumer 射影 / value=server-only 燃料の二層分離 + 二鍵照合**。多くのシステムは「能力フラグ」と「実数値」を 1 オブジェクトに混ぜ、consumer に数値が漏れる or 数値なきフラグで捏造する。本設計は **数値を consumer から構造的に隔離しつつ、binding でフラグと数値の整合を強制**し、「能力はあるが数値がない/数値はあるが能力がない」両方の捏造を排除。**integer 5 分 ceil で median 生使用の過剰精密も排除**。捏造しない reality OS を、最も行動に近い leaveBy の**数値供給層**まで貫く。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
