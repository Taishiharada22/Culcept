# RD2d-b0 — Route / ETA Provider Adapter Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: route/ETA provider adapter 設計セッション
- 位置づけ: RD2d-a（`40c0146f`）で `RouteEtaCapabilityV0` の mode-aware DAG 型 + walker を固定した。RD2d-b0 は **provider 出力 → capability graph への写像 adapter** をどう設計するか — provider injection・既存 transport cascade consume・heuristicDistanceProvider の扱い・stage mapping・provider failure・raw route data internal・RC2a 接続・leaveBy へ渡す条件 — を確定する。
- 規律: **コードを書かない**（docs-only）。provider 実行・transport cascade 接続・heuristic adapter 実装・Google Routes・geocode・currentLocation・weather API・RC2a compile 変更・UI/DB/production には進まない。
- 上流: RD2d-a `40c0146f`（capability 型）+ RD2d-0B `f8969e4d`（DAG）+ RD2d-0A `6656f0bf`（identity/freshness/heuristic/pair gate）。

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
    durationBasis,            // heuristic | scheduled | user_confirmed | external_route | cached_route
    travelDurationPresent: boolean,
    routeShapePresent: boolean,
    conditionModelStatus,     // provider が反映した condition
    providerKind, providerVersion,
    opaqueRouteRef: string | null,   // raw polyline/座標を含まない opaque
    freshnessStatus,          // 外部計算済（fresh|stale|expired）
  }
  ```
- **provider は raw 座標/polyline を返さない**（opaque ref のみ）— adapter は raw を見ない（RD2d-a の raw 不露出を adapter 入口から保証）。

---

## 2. 既存 transport cascade を consume するか（CEO 論点・独立裁定）

- **consume する**（再発明しない）。`cascadeOrchestrator.runCascade`（privacy guard 付き）+ `heuristicDistanceProvider`（L-2）+ `unresolvedProvider`（L-1）+ `manualUserProvider`（user）を **RD2d-b 実装で provider としてラップ注入**。
- ただし cascade は内部に座標を持つ → **ラッパが opaque ref に圧縮**してから adapter へ渡す（adapter は座標を見ない）。
- **adapter 自体は cascade を import しない**（provider 注入のみ）。実 cascade consume は RD2d-b 実装（別 GO）。

---

## 3. heuristicDistanceProvider の扱い（CEO 論点・核心境界）

- `heuristicDistanceProvider`（Haversine）→ `durationBasis: heuristic`・`travelDurationPresent: true`・`routeShapePresent: false`・`conditionModelStatus: static_assumption`（道路/traffic 無視）。
- DAG derive により **heuristic → arrivalProjectionKnown=false / planning=false / leaveBy=false**（RD2d-a walker が強制）。adapter は heuristic 出力を `travelDurationKnown` までに**しか**写像しない。
- 出力 capability の `displayPolicy = internalReference`（RD2d-a・heuristic 必須）。**heuristicDurationHint として隔離・action input にしない**。

---

## 4. provider result → capability stage mapping（CEO 論点）

| provider result | durationBasis | 写像（capability） |
|---|---|---|
| status no_route / failed | none | `no_route_source` 相当（travelDurationKnown=false・全上位 false・**fake 候補なし**） |
| heuristic（L-2） | heuristic | travelDurationKnown=true・**projection/planning/leaveBy=false**・displayPolicy internalReference |
| scheduled（transit 時刻表） | scheduled | mode=transit + conditionModelStatus=schedule_aware なら projection 可（DAG 経由） |
| user_confirmed（in-scope・fresh） | user_confirmed | confirmedScope 一致 + fresh なら planning 可・confidence high |
| cached_route（fresh） | cached_route | freshnessStatus=fresh なら projection 可・stale は false |
| external_route（traffic_aware・departure_time） | external_route | car+traffic_aware なら projection 可（但し inferred・confidence moderate） |

- **絶対則**: mapping は **必ず `deriveCapabilityFlagsFromParts` を経由**（adapter が直接 leaveBy=true を立てない）。provider 種別だけで planning に上げない（mode/condition/temporal/freshness が要る）。

---

## 5. provider failure 時の扱い（CEO 論点）

- status `failed` / `no_route` → **`no_route_source`（travelDurationKnown=false・全上位 false）に安全に倒す**。**fake route/duration を作らない**（RD2b の provider failure と同型）。
- provider 未注入 → 同じく no_route_source。
- 部分失敗（duration はあるが condition 不明）→ conditionModelStatus=unknown → DAG で projection 不可（honest）。

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
  - `leaveByKnown` true ← `leaveByEligible`（DAG join 全充足）。
- **heuristic で消してはいけない missingInputRefs**: `route_missing` / `eta_source_missing` / `leaveBy_*`（heuristic は travelDuration だけ・これらを消すと誠実さが崩れる）。
- **接続で RC2a compile を変更しない**（adapter は capability を返すまで）。`movementRealityViolations`（既存）が fake ETA を検出。

---

## 8. leaveBy へ渡す条件（CEO 論点）

- leaveBy（RD2e で導出）に渡してよいのは **`leaveByEligible=true` の capability のみ**。
- `leaveByEligible` = DAG join（timeEstimateUsableForPlanning ∧ arrivalTargetScoped ∧ originUsableForLeaveBy ∧ bufferKnown ∧ ¬originConflict・RD2d-a）。
- **heuristic / duration-only / stale / origin conflict / future-departure current origin では leaveBy に渡さない**（leaveByEligible=false）。
- **endpoint pair gate は leaveBy 条件ではない**（RD2d-a の自己補正・external send 可否と leaveBy は別。user_confirmed route は外部送信なしで leaveBy 可）。

---

## 9. RD2d-b 実装候補（次段・各々別 GO）

| slice | 内容 | API |
|---|---|---|
| **RD2d-b** | `routeEtaAdapter`（pure・provider 注入・`deriveCapabilityFlagsFromParts` 経由）+ test。**API 叩かない**（provider は引数） | なし |
| **RD2d-b'**（cascade consume） | cascade/heuristic provider ラッパ注入（opaque 圧縮）+ test | なし（heuristic は座標→距離のみ） |
| **RD2d-c**（external・別 GO） | GoogleRoutesProvider + Routes API + endpoint pair gate + sensitive skip + 法務 | external（gate） |
| **RD2e**（leaveBy） | leaveBy 導出（leaveByEligible capability + buffer + weather friction + origin temporal validity） | なし |
| **RC2a 接続**（別 GO） | capability → movementReality（honest 維持） | なし |

- **推奨**: RD2d-b（pure adapter・API なし）→ RD2d-b'（cascade/heuristic 注入）→ RD2e（leaveBy）→ RC2a 接続 → RD2d-c（external・pair gate・最後）。

---

## 10. Department Responsibility Matrix（RD2d-b0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Mobility**（adapter 設計）+ **Build**（adapter 純粋性・DAG 経由保証の technical safety） |
| consultedDepartments | Permission（endpoint pair gate・座標 PII）・Communication（heuristic 非露出）・Risk（provider failure/forecast）・Context（traffic/schedule/weather） |
| blockingDepartments | **CEO**（RD2d-b 実装 GO・external API/DB は別 gate）+ Permission + 法務（pair 外部送信）+ production gate |
| outputs | RD2d-b0 設計（provider injection・cascade consume・heuristic 扱い・stage mapping・provider failure・raw internal・RC2a 接続・leaveBy 条件・RD2d-b 候補）。**コードなし** |
| safetyGate | **adapter は能力を上げない（DAG derive 経由）**・**heuristic を projection/leaveBy に昇格しない**・**provider failure で fake route/duration を作らない**・**provider は opaque ref のみ（raw 座標を adapter が見ない）**・**leaveBy は leaveByEligible のみ**・endpoint pair gate は leaveBy 条件でない（external send 可否と別）・RC2a compile 不変（接続別 GO・honest 維持・heuristic で missingInputRefs を消さない）・production gate 未通過 |
| traceRefs | RD2d-a capability 型 / RD2d-0A/0B / 既存 transport cascade（consume 対象）/ movementReality honest knownFalse |

---

## 11. 自己判定

- **RD2d-b0 は設計 ready**。adapter は **「provenance → capability の写像」**（能力を上げない）。既存 cascade/heuristic を consume するが **adapter は pure（provider 注入）**・実呼び出しと API は RD2d-b 実装 + gate（別 GO）。
- **RD2d-b 実装 GO は CEO 専管**。pure adapter（API なし・DAG derive 経由）を先に・cascade consume → leaveBy → RC2a 接続 → external（最後 + pair gate）。
- 革新点（CEO ⑥）: adapter が **provider 出力を必ず DAG derive に通す**ことで、「provider が返した＝能力あり」を構造的に排除。heuristic を opaque 圧縮 + internalReference 隔離し、external duration も mode/condition/temporal/freshness を経ないと planning に上がらない。捏造しない reality OS を route/ETA adapter まで貫く。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
