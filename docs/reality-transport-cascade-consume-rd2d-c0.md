# RD2d-c0 — Transport Cascade Consume Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: transport cascade consume 設計セッション
- 位置づけ: RD2d-b（`56b90a06`）で `resolveRouteEtaCapability`（provider 注入の pure adapter）を実装した。RD2d-c0 は **既存 transport cascade を `RouteEtaProvider` としてどう wrap して注入するか** — cascade provider wrapper・heuristicDistanceProvider の opaque 圧縮・provider result normalization・privacy guard・endpoint pair gate との関係 — を設計する。**external route API は使わない**。
- 規律: **コードを書かない**（docs-only）。cascade 実接続・heuristic wrapper 実装・Google Routes/external route API・RC2a compile 変更・leaveBy 生成・UI/DB/production には進まない。
- 上流: RD2d-b `56b90a06`（adapter）+ RD2d-b0A `2767d711`（adapter 設計）+ RD2d-a-A `2faf8a2d`（capability DAG）。検証根拠: §1 は transport cascade 実ファイル監査（RD2-0 §1）。

---

## 0. 前提を疑う（CEO ① — wrapper は「cascade を adapter 形に翻訳」するだけ）

RD2d-b の `RouteEtaProvider = (input) => Promise<RouteEtaProviderResultV0>` は、provider が **opaque な capability 素材**（durationBasis/signal/scope/condition/freshness/providerKind）を返す契約。RD2d-c の wrapper の責務は:

> **既存 cascade（`cascadeOrchestrator.runCascade` + `heuristicDistanceProvider` 等）を呼び、その出力を `RouteEtaProviderResultV0` に正規化する**こと。wrapper は **raw 座標を opaque に圧縮**し、**heuristic を heuristic basis に正直に stamp**する。能力判定（projection/planning/leaveBy）は一切しない — それは RD2d-b adapter が DAG で行う。

wrapper は「翻訳層」であって「判断層」ではない。RD2d-b との責務分離が核心。

---

## 1. 現状監査（transport cascade・consume 対象・根拠）

| component | 役割 | wrapper consume |
|---|---|---|
| `cascadeOrchestrator.ts:runCascade` | provider 連鎖 + privacy guard | wrapper が呼ぶ正本 |
| `heuristicDistanceProvider.ts` | Haversine straight-line duration | → durationBasis `heuristic`・routeShape なし |
| `unresolvedProvider.ts` | 解決不能を honest に返す | → status `no_route` |
| `manualUserProvider.ts`（shell） | user 確認 route | → durationBasis `user_confirmed`（本実装は別） |
| `transportTypes.ts` | `MovementSegmentResolved/Unresolved`・`TransportResolutionProvider` IF | 型の出所 |
| `transportIntegrityContract.ts` | 整合契約 | wrapper が遵守 |
| `google_routes`（型のみ・未実装） | external route | **RD2d-c では使わない**（§7） |

**結論**: L-1（unresolved）/ L-2（heuristic）/ user（manual shell）は consume 可能。**external（google_routes）は未実装かつ RD2d-c 対象外**。

---

## 2. cascade provider wrapper（CEO 論点・RD2d-b への注入形）

- wrapper = `(input: RouteEtaAdapterInputV0) => Promise<RouteEtaProviderResultV0>`。RD2d-b の `deps.provider` に注入。
- wrapper 内部フロー:
  1. input（opaque originRef/destinationRef + mode + temporalScopeRef）から cascade が要求する座標を **caller が供給**（wrapper は座標解決をしない・別 layer）。
  2. `runCascade` を呼ぶ（privacy guard 経由）。
  3. cascade 出力（`MovementSegmentResolved/Unresolved`）を `RouteEtaProviderResultV0` に **normalize**（§4）。
  4. raw 座標/polyline を **opaque ref に圧縮**してから返す（§3）。
- **wrapper は能力 flag を立てない**（durationSignalPresent/scopeBounded/condition/freshness を埋めるが、arrivalProjection 等は RD2d-b adapter が DAG で導く）。

---

## 3. heuristicDistanceProvider の opaque 圧縮（CEO 論点・核心）

- `heuristicDistanceProvider`（Haversine）は **raw 座標 + 直線距離 + 粗い duration** を持つ。
- wrapper は:
  - `durationBasis = heuristic` に**正直に stamp**（external_route 等に偽装しない・RD2d-a-A の allowlist が fail-closed なので偽装しても落ちるが、正直 stamp が第一義）。
  - `durationSignalPresent = true`・`durationScopeBounded`（input の trip に scope されているか）・`routeShapePresent = false`（直線は route shape でない）・`conditionModelStatus = static_assumption`。
  - **raw 座標/距離を opaque ref に圧縮**（`opaqueRouteRef` は hash 等・raw を載せない）。
  - **adapter は opaqueRouteRef を capability に載せない**（RD2d-b）ので、heuristic の raw は capability に到達しない（二重防御）。
- 結果: heuristic → RD2d-b で `durationSignalPresent` 止まり・projection 不可（DAG allowlist）。

---

## 4. provider result normalization（CEO 論点）

cascade 出力 → `RouteEtaProviderResultV0` の正規化規則:

| cascade 出力 | normalize |
|---|---|
| `MovementSegmentUnresolved` | status `no_route`・durationBasis `none`・durationSignalPresent false |
| heuristic resolved | status `ok`・durationBasis `heuristic`・signal true・routeShape false・static_assumption |
| user manual resolved | status `ok`・durationBasis `user_confirmed`・condition は確認内容に応じ |
| 不明/malformed | status `no_route`（**都合よく補完しない**・RD2d-b が malformed を no_route_source に倒す） |

- **絶対則**: normalize は **enum を厳密に**（RD2d-b の `routeEtaProviderResultViolations` が enum/raw を再検証）。**raw 座標を providerKind/providerVersion/opaqueRouteRef に残さない**（RD2d-b が input 境界で検出 → no_route_source）。
- **freshnessStatus** は cascade の取得時刻から **caller/別 layer が計算**して渡す（wrapper は clock を持たない pure であるべき・時刻は外部注入）。

---

## 5. privacy guard（CEO 論点）

- `runCascade` の既存 privacy guard を**そのまま尊重**（sensitive anchor の座標を扱わない等）。
- wrapper は **raw 座標を log/return に出さない**（RD2d-a-A `rawCoordinateLoggingProhibited`・RD2d-0B §8）。
- **sensitive endpoint**（medical/legal/exam・home/work 推定・現在地観測）の場合、wrapper は cascade を**呼ばない**か、座標を渡さない（§6 の pair gate と連携）。

---

## 6. endpoint pair gate との関係（CEO 論点）

- RD2d-a `EndpointPairPrivacyGateV0` は **external 送信可否**を govern する（`pairExternalSendAllowed`）。
- **RD2d-c の cascade は heuristic（local 計算・外部送信なし）まで**ゆえ、`pairExternalSendAllowed=false` でも **heuristic local 計算は別判断で可**（RD2d-0B §8・「pairExternalSendAllowed=false でも local heuristic は別判断」）。
- ただし **sensitive endpoint の raw 座標を heuristic に渡すこと自体の privacy** は §5 privacy guard が判断（local でも sensitive 座標の取り扱いは慎重に）。
- pair gate は RD2d-b adapter の input（`pairPrivacyParts`）で表現済 → capability に `EndpointPairPrivacyGateV0` として載る。wrapper は pair gate を**変えない**（external 接続は RD2d-c'/RD2d-c で別 gate）。

---

## 7. no external route API（CEO 論点・絶対境界）

- **RD2d-c では Google Routes / 外部 route API を一切叩かない**。`google_routes`（型のみ・未実装）に触れない。
- external route は **RD2d-c'（別 GO・external API gate + sensitive skip + 法務 + production）**。
- RD2d-c の射程: **L-1（unresolved）+ L-2（heuristic local）+ user manual（shell）まで**。これらは外部送信なし（heuristic は座標→距離の local 計算）。

---

## 8. no RC2a compile change / no leaveBy generation（CEO 論点・絶対境界）

- **MovementReality / compileMovementReality / RC2a compile chain を変更しない**。wrapper は `RouteEtaProviderResultV0` を返すまで・RD2d-b adapter は `RouteEtaCapabilityV0` を返すまで。
- **leaveBy を生成しない**。leaveByComputable は RD2d-b adapter が DAG で導く（capability flag）だけ・実 leaveBy 時刻の導出は **RD2e**（別 GO）。
- dogfood preview / UI / Alter tab / 本線に接続しない。

---

## 9. RD2d-c 実装候補（次段・各々別 GO）

| slice | 内容 | API |
|---|---|---|
| **RD2d-c** | `cascadeRouteEtaProvider`（pure wrapper・runCascade consume・normalize・opaque 圧縮）+ test。RD2d-b adapter に注入 | なし（heuristic local） |
| **RD2d-c'**（external・別 GO） | GoogleRoutesProvider + Routes API + endpoint pair gate + sensitive skip + 法務 | external（gate） |
| **RD2e**（leaveBy） | leaveBy 時刻導出（leaveByComputable + buffer + weather friction + origin temporal validity） | なし |
| **RC2a 接続**（別 GO） | capability → movementReality（honest 維持） | なし |

- **推奨**: RD2d-c（pure wrapper・heuristic local）→ RD2e（leaveBy）→ RC2a 接続 → RD2d-c'（external・最後 + pair gate）。

---

## 10. Department Responsibility Matrix（RD2d-c0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Mobility**（cascade wrapper 設計）+ **Build**（wrapper 純粋性・normalize の technical safety） |
| consultedDepartments | Permission（privacy guard・endpoint pair・座標 PII）・Risk（heuristic 誤用・normalize）・Context（cascade 出所） |
| blockingDepartments | **CEO**（RD2d-c 実装 GO・external API は別 gate）+ Permission + 法務（座標）+ production gate |
| outputs | RD2d-c0 設計（cascade consume・wrapper・heuristic opaque 圧縮・normalize・privacy guard・pair gate 関係・no external/no RC2a/no leaveBy・RD2d-c 候補）。**コードなし** |
| safetyGate | **wrapper は翻訳層（能力判定しない）**・**heuristic を heuristic basis に正直 stamp**・**raw 座標を opaque 圧縮・log/return に出さない**・**normalize は enum 厳密・malformed を補完しない**・**external route API を叩かない（heuristic local まで）**・**RC2a compile 不変・leaveBy 生成なし**・privacy guard 尊重・pair gate 不変・production gate 未通過 |
| traceRefs | RD2d-b adapter / RD2d-a-A capability / 既存 transport cascade（runCascade/heuristicDistanceProvider・consume 対象）/ movementReality honest knownFalse |

---

## 11. 自己判定

- **RD2d-c0 は設計 ready**。wrapper は **「cascade → RD2d-b provider 形への翻訳」**（能力判定は RD2d-b adapter が DAG で行う・責務分離）。heuristic を正直 stamp + opaque 圧縮し、external は使わない（heuristic local まで）。
- **RD2d-c 実装 GO は CEO 専管**。pure wrapper（heuristic local・外部送信なし）を先に・external は RD2d-c'（別 gate + 法務）。
- 革新点（CEO ⑥）: **翻訳層（wrapper）と判断層（adapter DAG）の厳格分離** — wrapper が能力を判定しないことで、cascade の出力品質に関わらず RD2d-a-A の fail-closed DAG が最終判断を握る。heuristic を opaque 圧縮 + 正直 stamp することで、cascade の raw 座標が capability に到達しない二重防御。捏造しない reality OS を cascade consume まで貫く。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
