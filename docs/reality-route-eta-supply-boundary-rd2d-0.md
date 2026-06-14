# RD2d-0 — Route / ETA Supply Boundary Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: route/ETA supply boundary 設計セッション
- 位置づけ: RD2a（PlaceResolution 型）/ RD2b（place adapter）/ RD2c（OriginInference 型）に続き、**route/ETA 供給の段階・境界** を設計する。核心は「**heuristic を ETA と偽らない**」境界と、**既存 transport cascade を consume する方針**、**routeKnown/etaKnown/leaveBy への接続条件**。
- 規律: **コードを書かない**（docs-only）。transport cascade 実行・Google Routes/外部 route API 接続・geocode・currentLocation・UI/Alter tab/本線/RC2a compile 変更・production には進まない。
- 上流: RD2-0 `39fb0144`（§4 route/ETA 段階・§5 leaveBy 条件）+ RD2c `d5a90500`（origin 型）。検証根拠: §1 は transport cascade 実ファイル監査。

---

## 0. 前提を疑う（CEO ① — transport cascade は既存・核心は「heuristic ≠ ETA」境界）

並列監査（RD2-0 §1）の再確認:

> **transport L-1/L-2 cascade は既に実装済**（`transportTypes.ts` の `TransportResolutionProvider` interface・`heuristicDistanceProvider.ts`[Haversine]・`unresolvedProvider.ts`・`manualUserProvider.ts`[shell]・`cascadeOrchestrator.ts:runCascade`[privacy guard]・`transportIntegrityContract.ts`）。`google_routes` は **型宣言のみ・未実装**（L-3+）。

よって RD2d も RD2b と同じ構図 = **既存 cascade を consume する adapter**。ただし最重要の設計判断は:

> **核心境界: heuristic（Haversine 距離 × 速度）は「実 ETA」ではない**。道路・信号・交通を無視した粗い見積りであり、**routeKnown/etaKnown を true にしない**。heuristic は **`heuristicDurationHint`（推定明示・leaveBy 不使用）に隔離**する。実 ETA は **external route API / cached route / user 確認**のみ。

これは RD2c の「**confidence high は confirmed に予約**」と同型の安全則 — **「推定」と「確定」を厳格に分離**し、reality OS が heuristic を「実際の所要時間」と偽らないようにする。

---

## 1. 現状監査（transport cascade inventory・根拠）

| 層 | 既存（implemented） | stubbed | absent（要実装） |
|---|---|---|---|
| **contract** | `transportTypes.ts`（`MovementSegmentResolved`/`MovementSegmentUnresolved` discriminated union・`TransportResolutionProvider` interface・`TransportProvider`='google_routes' 型宣言） | google_routes 未実装 | — |
| **L-2 heuristic** | `heuristicDistanceProvider.ts`（Haversine 距離→粗い duration） | — | **実 route/traffic でない**（道路無視） |
| **L-1 unresolved** | `unresolvedProvider.ts`（解決不能を honest に返す） | — | — |
| **user manual** | `manualUserProvider.ts`（shell） | 本実装 shell | user 確認 route の本実装 |
| **orchestration** | `cascadeOrchestrator.ts:runCascade`（privacy guard・provider 連鎖） | — | provider health |
| **integrity** | `transportIntegrityContract.ts`・`movementSegmentOverlay.ts`・`movementDisplayFormatter.ts` | — | — |
| **external** | — | `google_routes`（型のみ） | **GoogleRoutesProvider 実装**・Routes API・traffic ETA・cache・override 永続 |
| **RC2a 接続** | `movementReality.ts:compileMovementReality`（routeKnown/etaKnown/leaveByKnown を **knownFalse** 固定・`movementRealityViolations` が fake ETA 検出） | — | cascade → movementReality 配線 |

**結論**: route/ETA の **L-1/L-2 cascade + integrity + honest unresolved は既存**。**実 route/ETA（external/cache/user）は未実装**。RC2a は honest に knownFalse。RD2d = 既存 cascade を consume する adapter + heuristic 隔離境界。

---

## 2. Route / ETA 供給の段階（CEO #・6 段・既存マップ）

| stage | 意味 | 既存マップ | routeKnown / etaKnown |
|---|---|---|---|
| `no_route_source` | route/ETA 供給なし | `unresolvedProvider` | **knownFalse**（honest・現状） |
| `static_heuristic` | Haversine 距離 × 速度の**粗い見積り**（実 route でない） | `heuristicDistanceProvider` | **routeKnown false・etaKnown false**。別 field `heuristicDurationHint`（推定明示・leaveBy 不使用） |
| `external_route_api` | Google Routes 等の**実 route/ETA**（traffic 込みなら更に高確信） | `google_routes`（**未実装**・別 gate） | **routeKnown true・etaKnown true**（実 API） |
| `cached_route` | 実 route の cache（freshness 内） | （cache・L-3+ 未実装） | **freshness 内なら inferred true**・期限切れは false |
| `user_confirmed_route` | 本人が route/所要を確認 | `manualUserProvider`（shell） | **confirmed**（本人確認） |
| `unknown` | 不明 | — | **knownFalse/unknown** |

- **絶対則**: `static_heuristic` は **etaKnown=false のまま**。heuristic を実 ETA と偽らない（§4）。
- **v0 提案**: `no_route_source` + `static_heuristic`（既存 heuristic provider）まで。**external_route_api（Google Routes）は別 slice + external API gate（§5）**。

---

## 3. 既存 transport cascade を consume する方針（CEO 論点・RD2b と同型）

- **consume する**（再発明しない）。ただし RD2d 実装の adapter は **pure（provider 引数注入）** — RD2b `placeCandidateAdapter` と同型。cascade/Routes API を adapter から直接叩かない。
- adapter は `TransportResolutionProvider` の**出力 shape にのみ依存**（注入）。provider 未注入 → `no_route_source`。provider 失敗 → `no_route_source`（**fake route を作らない**）。
- 既存 `cascadeOrchestrator.runCascade`（privacy guard 付き）は RD2d' 実装で provider として注入。RD2d-0/RD2d 実装の型・adapter は cascade を import しない。

---

## 4. heuristic を ETA 扱いしない境界（CEO 論点・核心安全則）

| 項目 | heuristic（static_heuristic） | 実 ETA（external/cache/user） |
|---|---|---|
| 中身 | Haversine 距離 × 想定速度（道路・信号・交通無視） | 実 route の所要（traffic 込み可） |
| routeKnown | **false** | true |
| etaKnown | **false** | true |
| 出力先 | `heuristicDurationHint`（**推定明示**・coarse・分単位の断定をしない） | `etaValue`（実 ETA） |
| leaveBy へ | **渡さない**（§9） | 渡してよい（§9 条件付き） |
| consumer 表現 | 「おおよその距離感」程度（「○分で着く」と言わない） | 「所要の目安」 |

- **絶対則**: heuristic から **etaKnown true を作らない**・**leaveBy を作らない**・**「○分で着く/遅れる」と断定しない**。`movementRealityViolations` が fake ETA を検出（既存）→ heuristic が etaKnown true に昇格したら violation。
- 革新点: heuristic は「ゼロ情報」と「実 ETA」の中間の **coarse hint** として正直に置く（捨てない・でも ETA と偽らない）。RD2c の moderate 上限と同思想。

---

## 5. external route API gate（CEO 論点）

- Google Routes（`google_routes`・未実装）は **外部送信（origin/destination 座標）** → **CEO 承認 + production gate + 法務（座標の外部送信・PII）**まで HOLD。
- gate 構造（geocode sensitive skip と同方針）: **sensitive anchor の route を外部に投げない**・flag（server-only・default OFF）・operator/owner-RLS・dogfood は heuristic（API 不要）まで。
- **RD2d-0（docs-only）/RD2d 実装（pure adapter）では API を叩かない**。external 接続は RD2d''（別 GO）。

---

## 6. cached route の扱い（CEO 論点）

- 実 route の cache は **freshness（age）で confidence 調整**。期限内 → inferred true（etaKnown）・期限切れ → knownFalse に戻す（古い ETA を実 ETA と偽らない）。
- cache は実 route 由来のみ（heuristic を cache しても ETA にならない）。**heuristic cache → 依然 etaKnown false**。
- 永続化（cache 書き込み）は **DB gate**（別 GO）。RD2d 実装では cache 読み取りも provider 注入で表現（直接 DB 叩かない）。

---

## 7. user confirmed route の扱い（CEO 論点）

- 本人が「この経路・所要で合っている」と確認 → `user_confirmed_route`（confirmed・etaKnown true）。`manualUserProvider` の本実装（別 GO）。
- RD2c の user_confirmed_origin と同型: **確認 provenance のみ confirmed**。route の自動推定（heuristic/external）は confirmed にしない（inferred 止まり）。

---

## 8. routeKnown / etaKnown への接続条件（CEO 論点・RC2a movementReality）

| RC2a field | 供給後の接続 | honest 維持 |
|---|---|---|
| `routeKnown` | external/cache(fresh)/user で true。**heuristic では false 維持** | 供給なし→knownFalse |
| `etaKnown` | 同上（実 ETA のみ true・heuristic は hint 隔離） | 供給なし→knownFalse |
| `mobilityStatus` | resolved（実供給）/ heuristic_estimate（新・推定明示）/ unresolved | 供給なし→unresolved |
| `whyUnresolved` | 供給で該当理由を消す（捏造で埋めない） | 残りは保持 |

- **接続は RD2d 後段（別 GO）**。RD2d 実装（adapter）は `RouteEtaSupplyV0` を返すまで・RC2a compile への注入は別 slice。`compileMovementReality` の honest knownFalse は供給が無い限り保持。

---

## 9. leaveBy へ渡してよい条件（CEO 論点・RD2-0 §5 を精緻化）

leaveBy を null でなく出してよいのは**全条件 AND**（RD2-0 §5・**RD2d-0A で精緻化**）:
1. **origin usable for leaveBy**（RD2c・assumed 単独不可・**`current_location_candidate` は単独不可** — 出発時刻までに移動しうる。`originUsabilityForLeaveBy` が別途 true の時のみ。詳細 RD2d-0A §6）
2. **destination known**（RD2a・exact_confirmed・candidate 不可）
3. **etaKnown true（実 ETA・traffic-aware・temporal-scope 内）**（§8・**heuristic では不可**・**travelDuration だけでも不可** — RD2d-0A §1 の lattice）
4. **arrival target known**（event startTime + fixedness）
5. **buffer policy known**（RD2e 設計）
6. **freshness 内 + confidence / evidence present**（stale な ETA/origin は不可・RD2d-0A §3）

- **絶対則（核心）**: **heuristic だけでは leaveBy を出さない**（条件 3 を満たさない）。ETA が無ければ leaveBy は null（既存 honest）。`heuristicDurationHint` は leaveBy に渡さない。
- **⚠ RD2d-0A 補正（GPT 監査反映 2026-06-14）**: 本 §9 の旧記述「origin known に current_candidate 含む」は**危険**（現在地は評価時点の位置・出発時刻には移動しうる）。leaveBy origin は `current_location_candidate` 単独では不可 → **RD2d-0A §6（origin usability / temporal validity）で再定義**。route/duration/ETA/leaveBy の粗い混同も **RD2d-0A §1（capability lattice）で分離**。本 §9 は RD2d-0A を正本とする。
- leaveBy 自体の導出（buffer・weather friction）は **RD2e**（別設計）。RD2d は etaKnown を leaveBy に渡してよいかの**境界**まで。

---

## 10. raw route data の internal 扱い（CEO 論点）

- route polyline / 座標列 / 距離 raw / Routes API response は **internal のみ**。`RouteEtaSupplyV0`（§11）は raw を field に持たず **routeRef は opaque**（RD2a/RD2c と同型）。
- consumer（dogfood/Alter tab）には **stage/etaKnown/genericized のみ**（raw polyline/座標非露出・RD2d projection で genericize）。
- leak guard: 出力 JSON に polyline/座標/lat/lng/raw duration が出ないことを walker で検証。

---

## 11. RouteEtaSupplyV0 型案（RD2d 実装で確定・docs では設計のみ）

```
RouteEtaStage = no_route_source | static_heuristic | external_route_api | cached_route | user_confirmed_route | unknown
RouteEtaSource = none | heuristic_distance | external_route_api | route_cache | user_confirmed
EtaKnownSource（etaKnown true を許す）= external_route_api | route_cache(fresh) | user_confirmed   // heuristic を含まない
RouteEtaSupplyV0 = {
  schemaVersion, stage,
  routeKnownStatus: boolean-ish(known/unknown),
  etaKnownStatus,                       // heuristic では false
  certaintyStatus, confidence,          // high は confirmed/external に予約（heuristic は low）
  source,
  heuristicDurationHint: opaque coarse | null,  // 推定明示・leaveBy 不使用
  routeRef: opaque | null,              // raw polyline/座標なし
  evidenceRefs, missingInputs, subjectNodeId, displayPolicy
}
```
- **不変条件**: `static_heuristic`/`no_route_source`/`unknown` → etaKnown false。etaKnown true は `EtaKnownSource` のみ。heuristic は `heuristicDurationHint` に隔離・leaveBy 不使用。raw route data を持たない（routeRef opaque）。

---

## 12. RD2d 実装候補（次段・各々別 GO）

| slice | 内容 | API |
|---|---|---|
| **RD2d**（実装） | `RouteEtaSupplyV0` 型 + `routeEtaAdapter`（pure・provider 注入・heuristic 隔離）+ test。**API 叩かない**（heuristic provider 注入まで） | なし |
| **RD2d'**（cascade consume） | `cascadeOrchestrator` を provider 注入（heuristic L-2 consume）+ test | なし（heuristic は座標のみ） |
| **RD2d''**（external・別 GO） | GoogleRoutesProvider + Routes API + external gate + sensitive skip + 法務 | external（gate） |
| **RC2a 接続**（別 GO） | RouteEtaSupplyV0 → movementReality 注入（honest 維持） | なし |
| **RD2e**（leaveBy） | leaveBy 導出（origin+dest+etaKnown+arrival+buffer+weather friction） | なし |

- **推奨**: RD2d（型・heuristic 隔離・pure）→ RD2d'（cascade consume）→ RD2e（leaveBy）→ RC2a 接続 → RD2d''（external・最後・gate）。**pure・heuristic 隔離を先・external API は最後 + gate**。

---

## 13. Department Responsibility Matrix（RD2d-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Mobility**（route/ETA 供給設計）+ **Build**（adapter 純粋性・RC2a 接続の technical safety） |
| consultedDepartments | Permission（external API/座標 PII gate）・Communication（dogfood 表現）・Risk（heuristic 誤用）・Context（traffic/weather は RD2e） |
| blockingDepartments | **CEO**（RD2d 実装 GO・external API/DB は別 gate）+ Permission + 法務（座標外部送信）+ production gate |
| outputs | RD2d-0 設計（現状監査・route/ETA 6 段・cascade consume 方針・heuristic≠ETA 境界・external gate・cache・user confirmed・routeKnown/etaKnown 接続・leaveBy 条件・raw internal・RouteEtaSupplyV0 型案・RD2d 候補）。**コードなし** |
| safetyGate | **heuristic を ETA と偽らない**（etaKnown false・heuristicDurationHint 隔離・leaveBy 不使用）・**実 ETA は external/cache(fresh)/user のみ**・**route 自動推定を confirmed にしない**・**heuristic だけで leaveBy を出さない**・**raw polyline/座標は internal**（routeRef opaque）・**external API は別 gate + sensitive skip + 法務**・cache 期限切れは knownFalse・RC2a compile 不変（接続は別 GO・honest knownFalse 維持）・production gate 未通過 |
| traceRefs | RD2c origin 型 / 既存 transport cascade（consume 対象）/ movementReality honest knownFalse / leaveBy 条件（RD2-0 §5） |

---

## 14. 自己判定

- **RD2d-0 は設計 ready**。核心は **「heuristic ≠ ETA」境界** — 既存 heuristicDistanceProvider を consume するが、**etaKnown を false に保ち heuristicDurationHint に隔離**し、**leaveBy には渡さない**。実 ETA は external/cache/user のみ。
- **RD2d 実装 GO は CEO 専管**。pure adapter（型・heuristic 隔離・API なし）を先に・cascade consume → leaveBy → RC2a 接続 → external API（最後 + gate）。
- 革新点（CEO ⑦）: **heuristic を捨てず・でも ETA と偽らない中間状態**（`heuristicDurationHint`・推定明示・leaveBy 不使用）。多くのナビ系は heuristic を「予測 ETA」として表示して外す事故を起こすが、本設計は **推定と確定を厳格分離**（RD2c の confidence 予約と同思想）し、「アプリが勝手に所要を断定して遅刻させる」事故を構造排除。捏造しない reality OS を移動所要まで貫く。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
