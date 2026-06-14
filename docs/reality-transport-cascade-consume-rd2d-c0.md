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
| `manualUserProvider.ts`（shell） | user 確認 route の**容れ物**（confirmation evidence ではない） | **`user_confirmed` にしない**（§13）→ 確認 evidence が無ければ `no_route` |
| `transportTypes.ts` | `MovementSegmentResolved/Unresolved`・`TransportResolutionProvider` IF | 型の出所 |
| `transportIntegrityContract.ts` | 整合契約 | wrapper が遵守 |
| `google_routes`（型のみ・未実装） | external route | **RD2d-c では使わない**（§7） |

**結論**: L-1（unresolved）/ L-2（heuristic）は consume 可能。**manual shell は confirmation evidence がない限り user_confirmed にしない（§13）**。**external（google_routes）は未実装かつ RD2d-c 対象外**。

> **⚠ RD2d-c0A 補正（4 レンズ監査 wf_c8839639 + GPT 反映 2026-06-14）**: 本 doc に 3 つの coordinate-boundary 穴があった → §12（private coordinate-bearing input 分離）・§6 改（localHeuristicAllowed を pairExternalSendAllowed と別 gate 化）・§13（manual shell ≠ user_confirmed）で補正。core 原則: **opaque ref と raw coordinate の境界を曖昧にしない**・**local heuristic も raw 座標を使うので別 gate**・**shell を confirmed に昇格しない**。

---

## 2. cascade provider wrapper（CEO 論点・RD2d-b への注入形）

- wrapper = `(input: RouteEtaAdapterInputV0) => Promise<RouteEtaProviderResultV0>`。RD2d-b の `deps.provider` に注入。
- **入力は 2 層に分ける（§12・coordinate boundary）**: public adapter-facing input（opaque refs のみ）と private coordinate-bearing input（server-only・非 client・非 loggable）。
- wrapper 内部フロー:
  1. **private coordinate-bearing input を別 layer が構築**（§12）。**wrapper/adapter-facing input には raw 座標を入れない**。private input を作れない場合 → `no_route`。
  2. `runCascade` を呼ぶ（privacy guard 経由・§5 + localHeuristicAllowed §6）。
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
| manual shell（確認 evidence なし） | **`user_confirmed` にしない**（§13）→ status `no_route` or signal-only（confirmation evidence がある場合のみ user_confirmed） |
| 不明/malformed | status `no_route`（**都合よく補完しない**・RD2d-b が malformed を no_route_source に倒す） |

- **絶対則**: normalize は **enum を厳密に**（RD2d-b の `routeEtaProviderResultViolations` が enum/raw を再検証）。**raw 座標を providerKind/providerVersion/opaqueRouteRef に残さない**（RD2d-b が input 境界で検出 → no_route_source）。
- **freshnessStatus** は cascade の取得時刻から **caller/別 layer が計算**して渡す（wrapper は clock を持たない pure であるべき・時刻は外部注入）。**fresh は `freshnessBasisRef`（fetchedAt 相当 opaque ref）を伴わせる**（RD2d-b-A: basis 無しの fresh は adapter が stale へ downgrade し planning に上げない）。

---

## 5. privacy guard（CEO 論点）

- `runCascade` の既存 privacy guard を**そのまま尊重**（sensitive anchor の座標を扱わない等）。
- wrapper は **raw 座標を log/return に出さない**（RD2d-a-A `rawCoordinateLoggingProhibited`・RD2d-0B §8）。
- **sensitive endpoint**（medical/legal/exam・home/work 推定・現在地観測）の場合、wrapper は cascade を**呼ばない**か、座標を渡さない（§6 の pair gate と連携）。

---

## 6. endpoint pair gate との関係（CEO 論点・RD2d-c0A 補正・localHeuristicAllowed 別 gate）

- RD2d-a `EndpointPairPrivacyGateV0` は **external 送信可否**を govern する（`pairExternalSendAllowed`）。
- **⚠ 補正（旧記述は危険）**: 旧 §6 は「pairExternalSendAllowed=false でも heuristic local は別判断で可」と書いたが、**「別判断」の gate を定義していなかった**。**local heuristic も raw 座標を消費する**（`heuristicDistanceProvider` は fromCoords/toCoords を読む）ので、external 送信とは別に **「そもそも local で座標を触ってよいか」の gate が必要**。
- **`localHeuristicAllowed` を `pairExternalSendAllowed` と別の独立 gate に**（privacy guard が決める・`!pairExternalSendAllowed` から導出しない・`coordinatePrecisionPolicy` から導出しない）。両者は**直交**:
  - external-send = 座標が第三者へ出てよいか
  - local-heuristic = 座標を**そもそも（local でも）距離計算に使ってよいか**
- **default false（sensitive）**: `currentObservationInvolved`（現在地観測＝最強 sensitive）→ `localHeuristicAllowed=false`（現在地を Haversine すらしない）。`homeWorkDerivedInvolved`（home/work 推定）→ default false。`eitherEndpointSensitive`（medical/legal/exam 等）→ false。
- **不変条件**: `pairExternalSendAllowed=false` は `localHeuristicAllowed=true` を**含意しない**（逆も）。`localHeuristicAllowed=false` → wrapper は heuristic を**呼ばない** → status `no_route` → adapter no_route_source（**sensitive endpoint で黙って距離計算しない**）。
- 既存 `runCascade` は sensitive_adjacent/sensitive_both/location_unknown で provider 呼出前に early-exit（cascadeOrchestrator）— capability 層も同じ拒否を**明示 flag**で encode すべき。
- **scope note**: `localHeuristicAllowed` の field 化（`EndpointPairPrivacyGateV0`/`deriveEndpointPairGate`/walker）は **RD2d-a-B（`88448f61`）で実装済**（pairExternalSendAllowed と直交・sensitive/current/home-work は false 強制・privacy guard が tighten 可）。RD2d-c 実装（wrapper）は privacy guard から localHeuristicAllowed を受け取り、false なら heuristic を呼ばず no_route。

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
- **先行必須（別 slice）**: `localHeuristicAllowed` field 追加（capability walker・§6）。RD2d-c wrapper 実装の前に gate を型化する。

---

## 12. coordinate boundary — public opaque input と private coordinate-bearing input の分離（RD2d-c0A 補正）

旧 §2.1 は「opaque refs から cascade が要求する座標を **caller が供給（別 layer）**」と書いたが、**opaque ref と raw 座標の境界が曖昧**で owner も型も leak scan も未定義だった。補正:

- **2 層に明確分離**:
  - **public adapter-facing input** = `RouteEtaAdapterInputV0`（**opaque refs のみ**: originRef/destinationRef=OpaqueEndpointRef・temporalScopeRef 等）。adapter→provider 境界を渡る唯一の型。adapter が serialize/leak-scan するのはこれ。
  - **private coordinate-bearing input** = 別の named 型（例 `CascadePrivateRouteInput{fromCoords, toCoords, privacyClass}`）。**server-only・非 client（client component / RSC payload に出さない）・非 loggable（rawCoordinateLoggingProhibited）・token-leak-scan 対象**。
- **named owner**: private input は **1 つの server-side coordinate-resolver layer** が opaque refs を key に構築する。**adapter は構築しない・wrapper-as-provider も構築しない**（wrapper は out-of-band[closure/別 server-only 引数]で受け取る）。「別 layer」を名前のない hand-wave にしない。
- **不変条件**:
  - private coord input は **adapter が一切受け取らない・serialize しない・leak-scan しない**（持たないから）。
  - **private input が無い/解決不能 → wrapper は status `no_route` → adapter no_route_source**（部分座標から heuristic を捏造しない）。
  - private input は token-leak-scan を通過してから境界を越える。

## 13. manualUserProvider shell ≠ user_confirmed（RD2d-c0A 補正・最重要）

旧 §1/§4 は manual shell を `user_confirmed` 候補としたが、**これは最も危険な certainty 捏造**:

- `manualUserProvider` は **stateless shell**（localStorage/DB 不使用・確認イベントなし・persisted correction なし）で、caller が渡した数値を echo して confidence high を stamp するだけ。
- `user_confirmed` は DAG の**最高 trust grade**（`durationProjectionGradeOk` allowlist 該当→projection に登れる・`deriveConfidence` が high を返す唯一・walker が confidence high を user_confirmed に予約）。**shell を user_confirmed にすると app の最高確信度を捏造**する。
- **不変条件**:
  - **shell（確認 evidence なし）は `user_confirmed` にしない** → durationBasis `none`（or 非 projection-grade）・status `no_route`/unresolved。
  - `user_confirmed` を emit してよいのは **(1) この origin/dest/mode/date に対する explicit 確認イベント（real user action・evidenceRef 化）** または **(2) persisted trusted correction（durable override）** がある時のみ。
  - normalize 時に enforce（walker の `user_confirmed && evidenceRefs 空 → violation` は backstop だが、それに依存しない）。

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
