# RD2d-b0 — Route / ETA Provider Adapter Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: route/ETA provider adapter 設計セッション
- 位置づけ: RD2d-a（`40c0146f`）で `RouteEtaCapabilityV0` の mode-aware DAG 型 + walker を固定した。RD2d-b0 は **provider 出力 → capability graph への写像 adapter** をどう設計するか — provider injection・既存 transport cascade consume・heuristicDistanceProvider の扱い・stage mapping・provider failure・raw route data internal・RC2a 接続・leaveBy へ渡す条件 — を確定する。
- 規律: **コードを書かない**（docs-only）。provider 実行・transport cascade 接続・heuristic adapter 実装・Google Routes・geocode・currentLocation・weather API・RC2a compile 変更・UI/DB/production には進まない。
- 上流: RD2d-a `40c0146f`（capability 型）+ RD2d-0B `f8969e4d`（DAG）+ RD2d-0A `6656f0bf`（identity/freshness/heuristic/pair gate）。
- **RD2d-b0A 同期（2026-06-14）**: RD2d-a-A（`2faf8a2d`）の語彙・fail-closed projection・leaveBy computability を本 doc に同期。`travelDurationPresent`→`durationSignalPresent`・`leaveByEligible`→`leaveByComputable`・projection は `durationProjectionGradeOk` allowlist（fail-closed）・provider failure/malformed の fail-safe・RD2d-b 実装 GO 条件（§9.1）を確定。これで adapter 実装時に旧意味論が復活しない。
- **実装記録（RD2d-b `56b90a06`・RD2d-b-A `d6f60bfe`・RD2d-a-B `88448f61`）**: adapter は provider self-claim を信用しきらない（freshnessBasisRef なし fresh→stale・scope corroboration・route evidence・raw-echo redact・failureReason taxonomy）。**walker 本体も evidence checker 化（RD2d-a-B）**ゆえ、adapter 以外の producer も freshness evidence/route parity/condition coherence/localHeuristicAllowed に束縛される（coherent liar が green を通れない）。

---

## 0. 前提を疑う（CEO ① — adapter は「能力の昇格」でなく「provenance → capability の写像」）

RD2b（place adapter）と同型の規律: adapter は**能力を上げない**。provider が duration を返しても、それが route/ETA/planning/leaveBy のどの capability を満たすかは **provider の種別（durationBasis）・mode・temporal scope・freshness が決める**。adapter の責務は:

> **provider 出力を `deriveCapabilityFlagsFromParts`（RD2d-a の DAG）に通して capability を導く**こと。adapter は heuristic を projection に昇格させない・external duration を勝手に leaveBy にしない。DAG walker が最終防衛線。

---

## 1. provider injection（CEO 論点・RD2b と同型・pure adapter）

- adapter は **pure**（provider を引数注入・RD1a listAnchors / RD2b placeCandidateProvider と同型）。transport cascade / Google Routes を adapter から直接 import しない・叩かない。
- provider interface（注入される側・RD2d-b 実装で定義）:
  ```
  RouteEtaProvider = (identityBasis) => Promise<RouteEtaProviderResult>
  RouteEtaProviderResult = {
    status: "ok" | "no_route" | "failed",
    durationBasis,            // none | heuristic | scheduled | user_confirmed | external_route | cached_route
    durationSignalPresent: boolean,   // ★「所要が分かった」ではなく「duration signal が存在する」のみ（heuristic でも true）
    durationScopeBounded: boolean,    // ★ provider の duration が要求 identity（origin/dest/timeBand）に scope 済か
    routeShapePresent: boolean,
    conditionModelStatus,     // provider が反映した condition（traffic_aware|schedule_aware|weather_aware|static_assumption|not_applicable|unknown）
    providerKind, providerVersion,
    opaqueRouteRef: string | null,   // raw polyline/座標を含まない opaque
    freshnessStatus,          // 外部計算済（fresh|stale|expired）
  }
  ```
- **語彙は RD2d-a-A に同期**（`2faf8a2d`）: `durationSignalPresent`（≠ travelDurationKnown・signal の有無のみ）/ `durationScopeBounded` / `temporalFreshnessEvaluated`（temporal scope の評価済）/ 出力 capability は `leaveByComputable`（≠ leaveByEligible）。**adapter は「所要が分かった」と読める語を使わない**。
- **provider は raw 座標/polyline を返さない**（opaque ref のみ）— adapter は raw を見ない（RD2d-a の raw 不露出を adapter 入口から保証）。

---

## 2. 既存 transport cascade を consume するか（CEO 論点・独立裁定）

- **consume する**（再発明しない）。`cascadeOrchestrator.runCascade`（privacy guard 付き）+ `heuristicDistanceProvider`（L-2）+ `unresolvedProvider`（L-1）+ `manualUserProvider`（user）を **RD2d-b 実装で provider としてラップ注入**。
- ただし cascade は内部に座標を持つ → **ラッパが opaque ref に圧縮**してから adapter へ渡す（adapter は座標を見ない）。
- **adapter 自体は cascade を import しない**（provider 注入のみ）。実 cascade consume は RD2d-b 実装（別 GO）。

---

## 3. heuristicDistanceProvider の扱い（CEO 論点・核心境界・RD2d-a-A 同期）

`heuristicDistanceProvider`（Haversine straight-line）→ capability 写像は**厳密に**:
- `durationSignalPresent = true`（signal はある）
- `durationBasis = heuristic`
- `durationProjectionGradeOk(heuristic) = false`（**ALLOWLIST 非該当・fail-closed**）
- `arrivalProjectionKnown = false`
- `timeEstimateUsableForPlanning = false`
- `leaveByComputable = false`
- `displayPolicy = internalReference | debugOnly`
- **user-facing / proposal / departure / notification / action input 禁止**（heuristicDurationHint として隔離）

→ adapter は heuristic 出力を **`durationSignalPresent` までに**しか写像せず、`durationProjectionGradeOk` allowlist により projection に登れない（DAG derive + walker が二重強制）。**straight-line を external_route 等に誤 stamp しても allowlist で fail-closed**。

---

## 4. provider result → capability stage mapping（CEO 論点・fail-closed）

| provider result | durationBasis | 写像（capability・**必ず DAG derive 経由**） |
|---|---|---|
| status no_route / failed / 未注入 | none | `no_route_source`（durationSignalPresent=false・全上位 false・**fake 候補なし**） |
| heuristic（L-2 straight-line） | heuristic | durationSignalPresent=true・**allowlist 非該当→projection/planning/leaveBy=false**・displayPolicy internalReference |
| scheduled（transit 時刻表） | scheduled | **allowlist 該当**。mode=transit + schedule_aware + scope bounded + temporal + fresh なら DAG が projection 立てる |
| user_confirmed（in-scope・fresh） | user_confirmed | **allowlist 該当**。confirmedScope 一致 + fresh + scope bounded なら planning 可・confidence high |
| cached_route（fresh） | cached_route | **allowlist 該当**。fresh のみ planning 可・stale は DAG が落とす |
| external_route（traffic_aware・departure_time） | external_route | **allowlist 該当**。car+traffic_aware+scope bounded+temporal なら projection（inferred・confidence moderate） |
| basis unknown/malformed | none 扱い | **`no_route_source` 側に倒す**（誤 stamp を都合よく昇格しない・§5） |

- **絶対則（fail-closed）**: mapping は **必ず `deriveCapabilityFlagsFromParts` を経由**し、adapter は `arrivalProjectionKnown` / `timeEstimateUsableForPlanning` / `leaveByComputable` を**直接立てない**。
  - **`durationProjectionGradeOk` allowlist を通らない basis は projection 不可**（heuristic/none/unknown）。
  - **condition adequate だけでは projection 不可**（durationBasis grade も要る）。
  - **`durationScopeBounded` がなければ projection 不可**。
  - provider が duration を返しても **basis が projection-grade でなければ projection 不可**。

---

## 5. provider failure / malformed provider result（CEO 論点・fail-safe）

- status `failed` / `no_route` → **`no_route_source`（durationSignalPresent=false・全上位 false）に安全に倒す**。**fake route/duration を作らない**（RD2b の provider failure と同型）。
- **provider 未注入** → 同じく no_route_source。
- **provider result の basis が unknown/none/malformed** → **`no_route_source` または durationSignalOnly（durationSignalPresent=true だが basis=heuristic/none 扱いで projection 不可）に倒す**。**malformed を都合よく補完しない**（基準を満たさないものを projection-grade に昇格しない）。
- 部分失敗（duration はあるが condition 不明）→ conditionModelStatus=unknown → DAG で projection 不可（honest）。
- **raw route data が来ても adapter output に載せない**（opaque ref に圧縮・§6）。
- **provider output が overclaim していても walker で落とす**（adapter が DAG derive を経由するため、provider が「projection できる」と主張しても allowlist/scope/temporal/condition を満たさなければ false。最終 `routeEtaCapabilityViolations` が forged/overclaim を検出）。

### 5.1 provider invocation 境界の総関数化（RD2d-b-B2 `117f27e1` 実装記録）

adapter は **任意 provider 注入**を受ける。provider が `throw`/`reject` した場合、その例外が adapter chain を貫通すると（a）chain が落ちる（b）例外 message/stack/payload に raw 座標や provider payload が含まれ得る、の二重リスクがある。VALUE channel 追加で例外面が広がる前に adapter 境界を固める。

- **provider call を `try { raw = await provider(input) } catch { … }` で包む**。catch は **binding を取らない**（`} catch {`）— raw exception の message/stack/payload に一切触れない。sync throw も async reject も同一 catch で捕捉（async fn の sync throw は rejected promise・非 async の sync throw は try 内で同期捕捉）。
- 例外時は **shared `routeEtaSafeExceptionReason()`（= constant `"dependency_error"`）** へ倒す → `no_route_source`（durationSignalPresent=false・全上位 false）。violation は safe constant のみ（`"provider invocation failed — raw exception not exposed"`）。
- **malformed result shape（null / 非 object）**も総関数で防御（後続 field access の throw を遮断）→ `malformed_result`。形の詳細検査は backstop `routeEtaProviderResultViolations` が担当。
- raw exception を **success path に変換しない**・**failureReason/violation に raw message を入れない**・**stack を出さない**・**missingInputRefs を都合よく消さない**。
- 検出 helper は **shared `routeEtaSafety.ts`** のみ使用（adapter 内に独自 raw-scan 正規表現を再導入しない・`containsRawLocation`/`redactRouteEtaUnsafeValue`/`routeEtaSafeExceptionReason` を import）。

---

## 6. raw route data internal（CEO 論点）

- provider は opaque ref のみ返す（§1）。capability `RouteEtaIdentityBasisV0` は originRef/destinationRef/temporalScopeRef/routeOptionsRef を **opaque** で持つ（RD2d-a・raw 座標なし）。
- raw polyline/座標/Routes API response は **provider ラッパ内部で完結**（adapter/capability に載らない）。RD2d-a walker の serialization backstop（latitude/longitude/polyline/coordinates/COORD_PATTERN）が最終検査。
- **raw 座標を id/log/debug に出さない**（RD2d-0B §8）。endpoint pair gate（RD2d-a `EndpointPairPrivacyGateV0`）で外部送信可否を別判定。

---

## 7. RC2a 接続条件（CEO 論点・honest 維持・接続は別 GO）

- capability → RC2a `movementReality` への写像（RD2d-b 実装後の **別 GO**）:
  - `routeKnown` true ← `routeShapeKnown` ∧ (external/cache/user) ∧ fresh。heuristic では false。
  - `etaKnown` true ← `timeEstimateUsableForPlanning`（planning-grade のみ・heuristic/duration-only では false）。
  - `leaveByKnown` true ← `leaveByComputable`（DAG join 全充足）。
- **heuristic で消してはいけない missingInputRefs**: `route_missing` / `eta_source_missing` / `leaveBy_*`（heuristic は durationSignalPresent だけ・これらを消すと誠実さが崩れる）。
- **接続で RC2a compile を変更しない**（adapter は capability を返すまで）。`movementRealityViolations`（既存）が fake ETA を検出。

---

## 8. leaveBy へ渡す条件（CEO 論点・leaveByComputable 意味論）

- leaveBy（RD2e で導出）に渡してよいのは **`leaveByComputable=true` の capability のみ**。
- `leaveByComputable` = DAG join（timeEstimateUsableForPlanning ∧ arrivalTargetScoped ∧ originUsableForLeaveBy ∧ bufferKnown ∧ ¬originConflict・RD2d-a）。
- **`leaveByComputable` は内部計算可能性（tier-1）のみ**（RD2d-a-A 補正）。**不変条件**:
  - **display/action eligibility ではない**
  - **departure line を意味しない**
  - **notification を意味しない**
  - **proposal を意味しない**
  - **RJ2 / Permission / Delivery gate なしに user-facing へ出さない**
- **heuristic / duration-only / stale / origin conflict / future-departure current origin では leaveBy に渡さない**（leaveByComputable=false）。
- **endpoint pair gate は leaveByComputable の条件ではない**（RD2d-a-A の自己補正・external send 可否と leaveBy computation は別 sibling。user_confirmed route は外部送信なしで leaveBy 計算可）。

---

## 9. RD2d-b 実装候補（次段・各々別 GO）

| slice | 内容 | API |
|---|---|---|
| **RD2d-b** | `routeEtaAdapter`（pure・provider 注入・`deriveCapabilityFlagsFromParts` 経由）+ test。**API 叩かない**（provider は引数） | なし |
| **RD2d-b'**（cascade consume） | cascade/heuristic provider ラッパ注入（opaque 圧縮）+ test | なし（heuristic は座標→距離のみ） |
| **RD2d-c**（external・別 GO） | GoogleRoutesProvider + Routes API + endpoint pair gate + sensitive skip + 法務 | external（gate） |
| **RD2e**（leaveBy） | leaveBy 導出（leaveByComputable capability + buffer + weather friction + origin temporal validity） | なし |
| **RC2a 接続**（別 GO） | capability → movementReality（honest 維持） | なし |

- **推奨**: RD2d-b（pure adapter・API なし）→ RD2d-b'（cascade/heuristic 注入）→ RD2e（leaveBy）→ RC2a 接続 → RD2d-c（external・pair gate・最後）。

### 9.1 RD2d-b 実装 GO 条件（必須チェックリスト・RD2d-a-A 同期済）

RD2d-b（pure adapter）実装 GO には以下を**全て**満たすこと:
- **RD2d-a-A 語彙に同期済み**（durationSignalPresent / durationScopeBounded / temporalFreshnessEvaluated / leaveByComputable）
- **mapping は必ず `deriveCapabilityFlagsFromParts` 経由**（adapter が capability を直接 elevate しない）
- **direct capability elevation 禁止**（adapter が arrivalProjectionKnown / timeEstimateUsableForPlanning / leaveByComputable を手で立てない）
- **`durationProjectionGradeOk` allowlist 必須**（heuristic/none/unknown は projection 不可・fail-closed）
- **`leaveByComputable` は内部計算可能性のみ**（display/action/departure/notification/proposal を意味しない）
- **provider failure / malformed result は fail-safe**（no_route_source へ・都合よく補完しない）
- **heuristic は durationSignalPresent 止まり**（projection/planning/leaveBy/action input 不可・displayPolicy internalReference|debugOnly）
- **raw route data を adapter output に載せない**（opaque ref のみ）・出力は `routeEtaCapabilityViolations` で検証
- **route provider / cascade / external API / currentLocation / weather / RC2a compile はまだ不接触**（pure adapter・provider 引数注入のみ）

---

## 10. Department Responsibility Matrix（RD2d-b0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Mobility**（adapter 設計）+ **Build**（adapter 純粋性・DAG 経由保証の technical safety） |
| consultedDepartments | Permission（endpoint pair gate・座標 PII）・Communication（heuristic 非露出）・Risk（provider failure/forecast）・Context（traffic/schedule/weather） |
| blockingDepartments | **CEO**（RD2d-b 実装 GO・external API/DB は別 gate）+ Permission + 法務（pair 外部送信）+ production gate |
| outputs | RD2d-b0 設計（provider injection・cascade consume・heuristic 扱い・stage mapping・provider failure・raw internal・RC2a 接続・leaveBy 条件・RD2d-b 候補）。**コードなし** |
| safetyGate | **adapter は能力を上げない（DAG derive 経由）**・**`durationProjectionGradeOk` allowlist で fail-closed（heuristic/none/unknown は projection 不可）**・**provider failure/malformed で fake route/duration を作らない（no_route_source）**・**provider は opaque ref のみ（raw 座標を adapter が見ない）**・**leaveBy は `leaveByComputable` のみ（内部計算可能性・display/action でない）**・endpoint pair gate は leaveBy 条件でない（external send 可否と別 sibling）・RC2a compile 不変（接続別 GO・honest 維持・heuristic で missingInputRefs を消さない）・production gate 未通過 |
| traceRefs | RD2d-a capability 型 / RD2d-0A/0B / 既存 transport cascade（consume 対象）/ movementReality honest knownFalse |

---

## 11. 自己判定

- **RD2d-b0 は設計 ready**。adapter は **「provenance → capability の写像」**（能力を上げない）。既存 cascade/heuristic を consume するが **adapter は pure（provider 注入）**・実呼び出しと API は RD2d-b 実装 + gate（別 GO）。
- **RD2d-b 実装 GO は CEO 専管**。pure adapter（API なし・DAG derive 経由）を先に・cascade consume → leaveBy → RC2a 接続 → external（最後 + pair gate）。
- 革新点（CEO ⑥）: adapter が **provider 出力を必ず DAG derive に通す**ことで、「provider が返した＝能力あり」を構造的に排除。heuristic を opaque 圧縮 + internalReference 隔離し、external duration も mode/condition/temporal/freshness を経ないと planning に上がらない。捏造しない reality OS を route/ETA adapter まで貫く。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
