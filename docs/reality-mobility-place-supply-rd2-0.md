# RD2-0 — Mobility / Place Supply Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: mobility/place supply 設計セッション
- 位置づけ: RD1c の coverage gap（place/route/ETA/leaveBy/movement が RC2a で全 unknown/knownFalse）を受け、**これらをどう供給するか**を設計する。供給の段階・fake 禁止境界・RC2a 接続・currentLocation/external API gate・dogfood 反映・実装候補を確定。
- 規律: **コードを書かない**（docs-only）。route/ETA/Places/weather API 接続・currentLocation 取得・UI/Alter tab/本線接続・production には進まない。
- 検証根拠: §1 は並列 codebase 監査（4 subsystem・workflow `wf_6cc73cbf`）+ 実ファイル読み取り。全主張に file:symbol。

---

## 0. 前提を疑う（CEO ① — 供給インフラは大半が既存・RD2 は接続が核）

並列監査の結論（RD0/RD1b と同じ構図・**再発明しない**）:

> **place 解決・transport cascade・origin/currentLocation gate・JMA は既に実装済み。ただし RC2a に未配線**（RC2a は honest に unknown/knownFalse を保つ）。RD2 の核は「**既存の honest provider を RC2a に安全接続**」+「**genuinely absent な leaveBy 導出・buffer・weather friction の設計**」。

既存（監査根拠 §1）:
- **place**: `lib/alter-morning/placeResolver.ts`（Places API + Web fallback + 3 placeType + 2 層 cache）/ `placeTable.ts`（100+）/ `lib/shared/municipalityCoords.ts`（220+ 座標）/ `canonicalLocationText.ts`（`name · address`）/ `locationConfirmationStatus.ts:isPlaceUnconfirmed` / `app/api/plan/anchors/geocode/route.ts`（auth+rate+sensitive skip）。
- **movement**: **L-1/L-2 transport cascade 一式**（`transportTypes.ts` の `TransportResolutionProvider` interface・`heuristicDistanceProvider.ts`[Haversine]・`unresolvedProvider.ts`・`manualUserProvider.ts`・`cascadeOrchestrator.ts:runCascade`[privacy guard]・`transportIntegrityContract.ts`）。`google_routes` は **型宣言のみ・未実装**（L-3+）。
- **origin/currentLocation**: `lib/origin/lifeProfile/geolocation.ts`（getCurrentLocation/captureLocation/reverseGeocode[Nominatim]）/ `lib/alter-morning/journey/currentLocationGating.ts:evaluateCurrentLocation`（accuracy<1000m・age<30min・5 check）/ `locationResolver.ts:resolveOrigin`（5 層）。**RC2a compile は currentLocation に一切 access しない**（pure）。
- **weather**: `jma:fetchJmaDailyForecast`（pop_blocks/temp/condition）。

genuinely absent（監査根拠 §1）: **leaveBy 導出**・**buffer policy**・**weather friction factor**・**place の anchor 永続化**（geocode は ephemeral）・**Google Routes 実装**（heuristic L-2 のみ）。

---

## 1. 現状監査（subsystem map・根拠）

| subsystem | implemented（既存） | stubbed/unknown | absent（要設計/未実装） | RC2a 接続点 |
|---|---|---|---|---|
| **place** | placeResolver(Places API/3 type/cache)・municipalityCoords(220+)・PREFECTURE_COORDS(47)・canonicalLocationText・isPlaceUnconfirmed・geocode API | resolvedLat/Lng **ephemeral**（anchor 未永続）・endpointAnchor schema 未定義 | Places client 詳細(別)・companion location・place→anchor 永続 | `compileEventRealityNodes:placeCertainty`(常に unknown・`location_text_present_unresolved`) |
| **movement/route/ETA** | transport L-1/L-2 cascade(`TransportResolutionProvider`/heuristicDistanceProvider/cascadeOrchestrator/integrityContract)・movementReality compile | `google_routes` 型のみ・manualUserProvider shell・coordsByAnchorId は caller 供給 | **Google Routes 実装**・traffic ETA・override 永続・provider health | `movementReality:routeKnown/etaKnown/leaveByKnown`(常に knownFalse)・`mobilityStatus`(unresolved) |
| **origin/currentLocation** | geolocation.ts(getCurrentLocation/reverseGeocode)・currentLocationGating(accuracy/age)・locationResolver 5 層・resolveOrigin | Layer3 GPS placeholder・planState.currentLocation 定義のみ | **originInference engine**(realityCore 内)・previousEvent.endLocation 自動推定 | `compileEventRealityNodes:movementRequired`(transition のみ)・`resolveOrigin`(sourceType→origin) |
| **weather/leaveBy** | jma:fetchJmaDailyForecast(pop/temp/condition)・slackAnalysis struct・honest leaveBy null+whyUnresolved | slackAnalysis 未 populate・buffer placeholder のみ | **leaveBy 導出**・**buffer policy**・**weather friction factor**・departure line・cascade buffer | `compileEventRealityNodes:leaveBy`(null+`eta_source_missing`)・`departureStatus`(unresolved) |

**結論**: place 解決・transport cascade・currentLocation gate・JMA は**実装済みだが RC2a 未配線**。leaveBy 導出・buffer・weather friction は**未実装**。RD2 = 安全接続 + 不足設計。

---

## 2. Place 解決の段階（CEO #1・既存 placeResolver/isPlaceUnconfirmed にマップ）

| stage | 意味 | 既存マップ | RC2a placeCertainty |
|---|---|---|---|
| `location_text_only` | locationText 文字列のみ（解決前） | anchor.locationText? | **unknown**（`location_text_present_unresolved`） |
| `candidate_unresolved` | place candidate 取得したが未選択（複数 or confidence medium） | placeResolver Places API top-N・confidence=medium | **unknown**（candidate あるが確定でない） |
| `candidate_selected` | candidate を 1 つ選択（だが exact 確認前） | canonicalLocationText 化済・isPlaceUnconfirmed=true | **inferred(低)**（選択済だが未確認） |
| `exact_confirmed` | 本人が exact place を確認 | isPlaceUnconfirmed=false（canonical 確定） | **inferred(高)** or **confirmed**（本人確認） |
| `ambiguous_place` | 複数候補が拮抗・確定不能 | placeResolver 候補拮抗 | **unknown**（ambiguity・断定しない） |
| `missing_place` | locationText すら無い | locationText undefined | **unknown**（place_missing） |

- **絶対則（CEO #1）**: **locationText があるだけで placeCertainty confirmed にしない**。`location_text_only` / `candidate_*` は **unknown ないし inferred 止まり**。confirmed は **本人確認（isPlaceUnconfirmed=false）** のみ。
- 既存防御: `isPlaceUnconfirmed`（canonical チェック）が「未確定」を表現済。Places API top-1（confidence=medium）→ **candidate_unresolved**（confirmed にしない）。

---

## 3. Origin 推定の段階（CEO #2・既存 locationResolver 5 層 + currentLocationGating）

| stage | 意味 | 既存マップ | gate |
|---|---|---|---|
| `previous_event_end` | 前 event 終了地を origin とする | locationResolver todayOrigin（前 event 連鎖） | — |
| `home_assumed` | 居住地（profile baseline）を仮 origin | locationResolver layer1（prefecture/city→coords） | inferred（assumed・断定しない） |
| `work_assumed` | 勤務地を仮 origin | （work_location profile・存在すれば） | inferred（assumed） |
| `current_location` | 実 GPS 現在地 | geolocation.ts + currentLocationGating（accuracy<1000m/age<30min） | **別 gate・opt-in 必須（§8）** |
| `unknown_origin` | origin 不明 | resolveOrigin fallback | **default**（v0） |

- **絶対則（CEO #2）**: **v0 で currentLocation を使うなら別 gate**。**勝手に現在地を読む実装は NO GO**。`current_location` は opt-in gate（§8）を通った時のみ・default は `unknown_origin` または `home_assumed`（inferred・断定しない）。
- home/work は **assumed（inferred）**であって confirmed origin ではない（本人が今日どこから出るかは不明）。

---

## 4. Route / ETA 供給の段階（CEO #3・既存 transport L-1/L-2・Google Routes 未実装）

| stage | 意味 | 既存マップ | RC2a routeKnown/etaKnown |
|---|---|---|---|
| `no_route_source` | route/ETA 供給なし | unresolvedProvider | **knownFalse**（現状・honest） |
| `static_heuristic` | Haversine 距離 × 速度の**粗い見積り**（実 route でない） | heuristicDistanceProvider | **routeKnown false・etaKnown false**（heuristic は実 ETA でない・§7）。別 field `heuristicDurationHint`（推定明示・leaveBy には使わない） |
| `external_route_api` | Google Routes 等の実 route/ETA | `google_routes`（型のみ・**未実装**） | **inferred(高)**（実 API・traffic 込みなら更に） |
| `cached_route` | 実 route の cache | （transport cache・L-3+） | **inferred**（cache age で confidence 調整） |
| `user_confirmed_route` | 本人が route/所要を確認 | manualUserProvider（shell） | **confirmed**（本人確認） |
| `unknown` | 不明 | — | **knownFalse/unknown** |

- **RD2-0 提案（実装するならどこまで）**: v0 は `no_route_source` + `static_heuristic`（既存 heuristic provider）まで。**external_route_api（Google Routes）は別 slice + external API gate（§8）**。docs-only ゆえ **API 接続しない**。
- **絶対則（CEO #3）**: **heuristic を実 ETA と偽らない**。`static_heuristic` は **etaKnown=false のまま**・`heuristicDurationHint`（推定・leaveBy 不使用）に隔離。

---

## 5. leaveBy 生成条件（CEO #4・全条件 AND・既存 honest null を尊重）

leaveBy を **null でなく出してよい**のは、以下が**全て揃う**時のみ:

1. **origin known**（§3・`current_location` or `previous_event_end` or `user_confirmed`・assumed 単独では不可）
2. **destination known**（§2・`exact_confirmed`・candidate 止まりでは不可）
3. **route/ETA known**（§4・`external_route_api` or `user_confirmed_route`・**heuristic では不可**）
4. **arrival target known**（到着すべき時刻 = event startTime + fixedness 制約）
5. **buffer policy known**（§5.1）
6. **confidence / evidence present**（各 supply の evidenceRefs が揃う）

- **絶対則（CEO #4）**: **ETA が無ければ leaveBy は引き続き null**（既存 honest 構造）。**prep（internal_prepare）単独で leaveBy を出さない**。1 つでも欠ければ leaveBy=null + whyUnresolved に欠落理由。

### 5.1 buffer policy（未実装・要設計）

- verb/rigidity 別 buffer（例: work strict → 大・social soft → 小）。**v0 は固定 conservative buffer**（過小評価で遅刻誘発を避ける）。weather friction（§5.2）を **qualitative に**加味。
- buffer は **evidence 付き**（なぜその buffer か）。fake しない（根拠なき精密 buffer を出さない）。

### 5.2 weather friction（未実装・要設計・JMA は既存）

- JMA（`fetchJmaDailyForecast`）から **降水確率/condition** を取得済。**friction を deterministic delay にしない**（CEO fake 禁止）。
- v0 は **qualitative risk note**（「雨で遅れやすい状況」相当・分単位の delay を断定しない）。buffer を **粗く増やす**程度（evidence 付き）。「遅れる/間に合う」を**断定しない**。

---

## 6. MovementReality / RC2a 接続方針（CEO #5・honest 構造を壊さない）

既存 RC2a field を **provider 供給に応じて unknown→inferred に動かす**（但し供給が無ければ unknown/knownFalse を保つ）:

| field | 現状 | 供給後（接続方針） | honest 維持 |
|---|---|---|---|
| `placeCertainty` | 常に unknown | §2 stage に応じて unknown→inferred→confirmed（本人確認のみ confirmed） | 供給なし→unknown 保持 |
| `routeKnown` | knownFalse | external/user 供給で inferred true。**heuristic では false 維持** | 供給なし→knownFalse |
| `etaKnown` | knownFalse | 同上（実 ETA のみ true） | 供給なし→knownFalse |
| `leaveByKnown` | knownFalse | §5 全条件 AND で true | 1 つ欠ければ false |
| `movementRequired` | transition のみ inferred | place 解決後 origin≠dest なら inferred true。**不明は unknown 保持** | 供給なし→unknown |
| `mobilityStatus` | unresolved | resolved（実供給）/ heuristic_estimate（新・推定明示）/ unresolved | 供給なし→unresolved |
| `whyUnresolved` | place/route/eta_missing | 供給で該当理由を**消す**（捏造で埋めない） | 残りは保持 |
| `missingInputRefs` | 自動生成 | 供給で減る（honest に） | — |
| `evidenceRefs` | field-level | provider evidence（source/confidence/timestamp）を追加 | raw 座標は internal |

- **絶対則（CEO #5）**: 既存 **honest unknown/knownFalse 構造を壊さない**。「fake 禁止」は **provider が unresolved を返したら unknown/knownFalse のまま**で実現（compileMovementReality の `movementRealityViolations` が fake ETA を検出済）。
- 接続は **adapter**（provider 出力 → RealityAttribute）であって、新規 fake 経路を作らない。

---

## 7. fake 禁止 field 一覧（CEO + 監査 fake-risk・絶対境界）

| field | 禁止 | 監査根拠 |
|---|---|---|
| **place** | locationText だけで exact place 断定しない（candidate 止まり・本人確認のみ confirmed） | placeResolver confidence=medium・isPlaceUnconfirmed |
| **route** | route を fake しない（external/user のみ true・heuristic は false） | movementRealityViolations |
| **ETA** | ETA を fake しない（実 ETA のみ・heuristic は hint 隔離） | RJ0.2 §8 |
| **leaveBy** | leaveBy を fake しない（§5 全条件 AND・ETA なしは null） | ガード 8 |
| **currentLocation** | 勝手に現在地を読まない（§8 gate） | RC2a pure・compile は navigator 不 access |
| **weather friction** | 分単位 delay を断定しない（qualitative のみ） | JMA は確率のみ |
| **「遅れる/間に合う」** | 断定しない（feasibility は unresolved/risk まで） | RJ surface 既存 |
| **place candidate** | Places API top-1 を confirmed に昇格しない（confidence=medium→candidate） | placeResolver |
| **sanity reject** | prevAnchor 低精度で 30km sanity を過信しない（false reject 注意） | HARD_SANITY_KM_FOR_EXPLICIT |

---

## 8. currentLocation gate / external API gate（CEO 別 gate）

- **currentLocation gate**: 既存 `currentLocationGating.evaluateCurrentLocation`（accuracy<1000m・age<30min・5 check）を**通った時のみ** origin candidate に使う。**取得自体が opt-in**（勝手に navigator.geolocation を読まない）。default は currentLocation 不使用（`unknown_origin`/`home_assumed`）。**v0 NO GO**（別 gate）。
- **external API gate**（Places/Google Routes/外部）: **CEO 承認 + production gate + 法務（外部送信）**まで HOLD。geocode API は既存（sensitive skip 済）だが RC2a 供給への接続は別 slice。heuristic L-2（no-API）が default fallback。

---

## 9. missingInputRefs 方針

- 既存 `deriveMomentSnapshot` が自動生成（criticality "unknown"・source trace 保持）。供給が来たら **該当 missingInputRef を消す**（捏造で埋めない）。
- 供給の evidenceRefs（source/confidence/timestamp/provider）を field-level で残す。**raw 座標/place id は internal**（client safe DTO に出さない・RD1a 規律）。

---

## 10. dogfood preview 反映方針（CEO #6・UI 実装しない）

将来 dogfood で **genericized** に見せる（consumer view・RD2d projection 規律）:

| 内部状態 | consumer 表現（genericized・raw 座標/place id なし） |
|---|---|
| place unresolved/missing | 「場所が未確定」相当（info_incomplete claim） |
| place exact_confirmed | 「場所あり」（具体地名は genericize・RD2d で safe label） |
| route/ETA unresolved | 「移動の見通しは未確定」（info_incomplete） |
| leaveBy unavailable | **出発時刻を出さない**（null・departure を語らない） |
| route available / leaveBy available | 出発の目安（**RJ2e copy・CEO 承認まで文面 HOLD**・depature line は RJ2d で構造遮断中） |

- **絶対則**: place/route/leaveBy が unknown のときは**何も語らない**（誠実）。available でも **departure line 文面は RJ2e/RC4 まで HOLD**（現状 departureLineRefs=[] 構造遮断）。

---

## 11. RD2a 実装候補（次段・各々別 GO・CEO 専管）

| slice | 内容 | API 接続 | リスク |
|---|---|---|---|
| **RD2a** | `PlaceResolutionV0` schema/types only（§2 stage の型・既存 placeResolver を type で表現） | なし | 低（型のみ） |
| **RD2b** | locationText → place candidate unresolved adapter（既存 placeResolver consume・**confirmed にしない**） | Places（gate） | 中 |
| **RD2c** | `OriginInferenceV0` docs/types（§3 stage・currentLocation gate 設計） | なし | 低 |
| **RD2d** | Route/ETA provider design（既存 transport L-1/L-2 consume・heuristic まで・Google Routes は別） | external（gate） | 中 |
| **RD2e** | leaveBy boundary design（§5 全条件・buffer/weather friction 設計） | なし | 中 |

- **推奨順**: RD2a（型）→ RD2c（origin 型）→ RD2e（leaveBy 境界）→ RD2b（place adapter・API gate）→ RD2d（route provider・API gate）。**型・境界（API なし）を先に固め、API 接続は後ろ + gate**。
- **RD2-0 完了で停止**。RD2a 実装には進まない（CEO 専管）。

---

## 12. Department Responsibility Matrix（RD2-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Mobility**（place/movement 供給設計）+ **Build**（RC2a 接続の technical safety） |
| consultedDepartments | Permission（currentLocation/external gate）・Communication（dogfood 表現）・Risk（weather friction）・Context（weather/JMA） |
| blockingDepartments | **CEO**（RD2a 実装 GO・external API/currentLocation は別 gate）+ Permission + production gate |
| outputs | RD2-0 設計（現状監査・place/origin/route/ETA/leaveBy 段階・fake 禁止境界・RC2a 接続・gate・missingInputRefs・dogfood 反映・RD2a-e 候補）。**コードなし** |
| safetyGate | **既存 honest provider を接続**（新規 fake 経路なし）・**locationText だけで exact 断定しない**・**route/ETA/leaveBy を fake しない**（heuristic は hint 隔離・ETA なしは leaveBy null）・**currentLocation は別 gate・勝手に読まない**・**external API は別 gate + 法務**・weather friction は qualitative（分 delay 断定しない）・「遅れる/間に合う」断定しない・unknown は誠実に保持・raw 座標/place id は internal・**production gate 未通過** |
| traceRefs | placeResolver/transport cascade/currentLocationGating/JMA（既存）/ RC2a movementReality 接続点 |

---

## 13. 自己判定

- **判定: RD2 は設計 ready**。核は **既存の honest provider（placeResolver/transport L-1L-2/currentLocationGating/JMA）を RC2a に安全接続** + **genuinely absent（leaveBy 導出/buffer/weather friction）の設計**。供給は既存・再発明しない（RD0/RD1b と同じ規律）。
- **ただし RD2a 実装 GO は CEO 専管**。RD2-0 の CEO 確認 → RD2a（型）から。external API/currentLocation は別 gate + 法務 + production。
- 革新点（CEO ⑦）: **「供給を作る」のでなく「既存の honest provider を unknown→inferred の adapter で繋ぐ」** — place/route/ETA は既に解ける（Places/heuristic/JMA）が、RC2a の誠実さ（unknown/knownFalse・fake 禁止）を保ったまま段階的に確信度を上げる。**heuristic を ETA と偽らず・currentLocation を勝手に読まず・ETA なしで leaveBy を出さない**ことで、「捏造しない reality OS」を移動判断まで貫く。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
