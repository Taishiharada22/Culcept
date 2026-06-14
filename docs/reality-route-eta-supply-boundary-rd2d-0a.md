# RD2d-0A — Route / ETA Supply Boundary（identity / freshness / scope 精緻化・docs-only）

- 日付: 2026-06-14 / 作成: route/ETA supply boundary 精緻化セッション
- 位置づけ: RD2d-0（`f2c6b931`）の方向（heuristic≠ETA・cascade consume）は正しいが、**route/duration/ETA/leaveBy の分離・identity・freshness・scope・origin temporal validity・endpoint pair gate が粗い**（GPT 監査 + 独立検証）。RD2d 実装前にこれらを確定する。
- 規律: **コードを書かない**（docs-only）。RouteEtaSupply 実装・transport cascade 接続・heuristic adapter・Google Routes・currentLocation・weather API・RC2a compile 変更・UI/DB/production には進まない。
- 上流: RD2d-0 `f2c6b931` + RD2c `d5a90500`（origin）+ RD2a/RD2b（place）。

---

## 0. 独立裁定（GPT を鵜呑みにせず・前提を疑う CEO ①）

GPT 監査 7 点を first-principles + honest-reality-OS の目標から検証 → **全て妥当・採用**。核心は:

> **route shape / transport mode / travel duration / traffic-aware duration / arrival-target ETA / leaveBy-eligibility は全部別の claim**。external API が duration を返しただけで etaKnown=true / leaveBy 可にしない。

ただし**鵜呑みにせず GPT を超える 3 点を追加**（CEO ⑥⑦）:
1. **単調 capability lattice**（§1）— フラットな bool 列でなく「各 rung が下位を要求する梯子」。30 bool の山より厳密・検証可能。
2. **per-capability provenance**（§1.2）— 各能力ビットが独立の source/evidenceRef。routeShape は external・arrivalTarget は event 由来、と別物として追跡。
3. **「traffic-aware ETA でも inferred であって confirmed でない」**（§1.3）— traffic は予測（forecast）であって確定でない。確定は user 確認（in-scope・fresh）のみ。RD2c の「high は confirmed 予約」を route まで貫く。

---

## 1. Route / duration / ETA / leaveBy の分離（CEO 必須 1・capability lattice）

> **⚠ RD2d-0B 補正（GPT 監査 2026-06-14・採用）**: 本 §1 の**単調 lattice は不採用**（撤回）。`trafficAware` を全 mode 共通の必須 rung にすると徒歩・鉄道を不当に unknown へ落とす（徒歩に traffic 無関係・鉄道は schedule-aware が別概念）。`arrivalTargetKnown`（event 側 context）と `leaveByEligible`（join 結果）を transport lattice に混ぜたのも誤り。**正本は RD2d-0B の mode-aware capability DAG**（`reality-route-eta-supply-boundary-rd2d-0b.md`）。本 §1 の「各能力は入力が支える以上を主張しない」という monotone 安全性のみ DAG の precise edges として継承する。以下 1.1 は履歴として残す。

### 1.1 単調 capability lattice（撤回・RD2d-0B DAG に置換）

```
L0 transportModeKnown      — 移動手段（walk/transit/car/bike）が分かる
L1 routeShapeKnown         — 経路の幾何（道筋）が分かる            ⊃ L0
L2 travelDurationKnown     — 所要時間の見積りがある（mode 依存・時刻非依存可） ⊃ L0
L3 trafficAware            — その duration が特定時刻の traffic を反映  ⊃ L2
L4 temporalScopeKnown      — duration が対象の departure/arrival 時間窓に有効 ⊃ L3
L5 arrivalTargetKnown      — 到着すべき時刻（event start + fixedness）が分かる
L6 etaKnown                — 特定 departure に対する arrival ETA が出せる ⊃ L4
L7 leaveByEligible         — 出発時刻を出してよい  ⊃ L6 ∧ L5 ∧ origin-usable ∧ buffer ∧ fresh
```

- **絶対則**: 上位は下位を**含意必須**（lattice 違反 = walker violation）。`travelDurationKnown` だけで `etaKnown` にしない（traffic/temporal scope が要る）。`etaKnown` だけで `leaveByEligible` にしない（arrival target/origin-usable/buffer/freshness が要る）。
- **heuristic の位置**: heuristic は **L2(travelDurationKnown) を coarse に満たすが L1(routeShape) も L3(trafficAware) も満たさない** → lattice の鎖が L2 で切れる。よって etaKnown=false・leaveByEligible=false（§4）。
- **external API（departure_time なし）**: L0+L1+L2 を満たすが **L3(trafficAware)=false・L4=false** → etaKnown=false（§1.3）。
- **external API（departure_time あり・traffic forecast）**: L0-L4+L6 を満たす → etaKnown=true（但し inferred・§1.3）。

### 1.2 per-capability provenance（各能力ビットに source/evidence）

各 L0-L7 は **独立の `source` と `evidenceRefs`** を持つ（単一 source field でなく capability 別）。例: routeShapeKnown.source=external_route_api / arrivalTargetKnown.source=event_anchor / travelDurationKnown.source=heuristic_distance。これにより「どの能力がどこ由来か」を honest に追跡し、heuristic 由来の能力が ETA に昇格しないことを構造保証。

### 1.3 traffic-aware ETA でも inferred（confirmed でない）

- external route API の traffic-aware ETA は **未来交通の予測（forecast）** → **inferred**（確定でない）。`certaintyStatus: inferred`・confidence は moderate〜high 手前。
- **confirmed は user 確認（in-scope・fresh）のみ**（§5）。RD2c の origin と同型。
- → etaKnown=true は「実 ETA claim がある」を意味するが、**certaintyStatus を confirmed にはしない**（user 確認 in-scope を除く）。leaveBy は inferred ETA でも出せるが hedge 付き（RD2e）。

---

## 2. identity / scope（CEO 必須 2・Route/ETA は identity が命）

`RouteEtaSupplyV0` は **full identity basis** を持つ（from/to text だけ・raw lat/lng・array index・routeRef 単独で同一視しない）:

| field | 意味 | 禁止 |
|---|---|---|
| `routeEtaSupplyId` | 下記 basis の content hash（cacheKey でなく full identity） | text/index ベース禁止 |
| `originRef` | origin の opaque ref（RD2c OriginRef・raw 座標なし） | raw lat/lng を id に直接入れない |
| `destinationRef` | destination の opaque ref（RD2a・raw なし） | 同上 |
| `targetNodeId` | 対象 event node（id-only） | — |
| `subjectiveDate` | JST subjective date | — |
| `transportMode` | walk/transit/car/bike/unknown | **mode 不明で route confirmed 禁止** |
| `temporalScope` | departureTime / arrivalTargetTime の窓 | — |
| `providerKind` | heuristic_distance/external_route_api/route_cache/user_confirmed | — |
| `providerVersion` | provider 実装版（version 変われば別供給） | — |
| `routeOptions` | avoid_tolls 等（あれば） | — |
| `routeInputRevision` | origin/dest/mode/time の入力リビジョン | — |
| `sourceRefs` / `evidenceRefs` | 由来・能力別 provenance（§1.2） | — |

- **絶対則**: 同じ origin/dest でも **mode / departureTime / arrivalTarget / subjectiveDate / targetNodeId / providerKind / providerVersion / routeOptions が違えば別供給**。identity は **full basis の content hash**（RD1a snapshotId と同型）。**routeRef だけで内容同一とみなさない**。

---

## 3. freshness / invalidation（CEO 必須 3・stale は使わない）

| field | 意味 |
|---|---|
| `fetchedAt` | 供給取得時刻 |
| `validUntil` | 有効期限（provider/mode 依存） |
| `freshnessStatus` | fresh / stale / expired |
| `staleReason` | age_exceeded / input_changed / provider_version_changed / traffic_window_passed |
| `invalidationTriggers` | 下記いずれかで無効化 |
| `sourceRevision` / `routeInputRevision` | 入力・provider リビジョン |

**invalidationTriggers**: origin changed / destination changed / transportMode changed / event start changed / arrival target changed / subjectiveDate changed / provider version changed / traffic・weather input changed / user correction occurred。

- **絶対則**: **stale/expired なら etaKnown=false・leaveByEligible=false**。期限切れ cache を「少し古いけど参考」で leaveBy に使わない。freshnessStatus が fresh の時のみ etaKnown true を許す。

---

## 4. heuristic boundary（CEO 必須 4・ETA と読ませない）

`heuristicDurationHint`（static_heuristic 由来）の不変条件:

- `displayPolicy = internalReference | debugOnly`（**consumer 露出禁止**）
- `routeShapeKnown=false`・`trafficAware=false`・`temporalScopeKnown=false`・`etaKnown=false`・`leaveByEligible=false`（L2 coarse のみ）
- **user-facing copy 禁止**・**RJ2e copy 禁止**・**「○分」と文面化禁止**
- **leaveBy に渡さない**・**Feasibility の confirmed 材料にしない**・**CollapseRisk の high 材料にしない**・**proposal candidate に使わない**
- 用途: 内部の「距離感」参照（例: movementRequired の弱い示唆）のみ。**実所要として一切扱わない**。

---

## 5. user_confirmed_route boundary（CEO 必須 5・確認には scope がある）

本人確認所要でも **scope が一致しなければ使えない**:

| field | 意味 |
|---|---|
| `confirmedAt` | 確認時刻 |
| `confirmedScope` | origin/destination/transportMode/timeBand/dayType の確認範囲 |
| `originRef`/`destinationRef`/`transportMode`/`timeBand` | 一致判定の基準 |
| `validUntil` / recency | 鮮度（古い確認は stale） |
| `evidenceRefs` / `userCorrectionRefs` | 確認・修正の履歴 |

- **一致条件**: 評価対象の origin/destination/mode/timeBand が confirmedScope と**一致**する時のみ confirmed として使う。
- **禁止**: 昔の本人確認を無期限に使う / 別 origin・destination に流用 / 別 transportMode に流用 / **user_confirmed_route だから常に etaKnown true**（scope 不一致なら不可）。

---

## 6. currentLocation / origin usability（CEO 必須 6・GPT 指摘の核心修正）

RD2c の `current_location_candidate` は **confirmed origin ではない**。RD2d-0 §9 の「leaveBy origin に current_candidate 含む」は**誤り**（評価時点の位置・出発時刻には移動しうる）。origin の usability を **2 軸 × temporal validity** に分離:

| 概念 | 意味 |
|---|---|
| `originUsabilityForRouting` | route 形状/距離を引くための origin として使えるか（現在地でも可・「今ここから」の経路は引ける） |
| `originUsabilityForLeaveBy` | **出発時刻の origin** として使えるか（現在地は条件付き — 下記 temporal） |
| `originTemporalFreshness` | origin signal の鮮度（GPS age・accuracy） |
| `originStillValidAtEvaluation` | 評価時点で origin がまだ妥当か |
| `originMayChangeBeforeDeparture` | 出発時刻までに origin が変わりうるか（evaluation→departure gap） |

- **核心則（temporal origin validity）**: leaveBy は**未来の出発**についての claim。origin は**出発時刻に妥当**でなければならない（評価時点でなく）。
  - **imminent departure**（evaluation→departure gap が小・「今すぐ出る」）→ current_location_candidate は leaveBy origin として**可**（出発 = 今の位置から）。
  - **future departure**（gap 大・「3 時間後に出る」）→ current_location_candidate は leaveBy origin として**不可**（移動しうる）。`home_assumed`/`previous_event_end`/`user_confirmed` を使うか leaveBy を出さない。
- **絶対則**: `originUsabilityForLeaveBy=true` は **(user_confirmed origin) ∨ (previous_event_end with chain) ∨ (current_location_candidate ∧ imminent ∧ fresh)** のみ。**current_location_candidate 単独・future departure では leaveBy origin 不可**。

---

## 7. external endpoint pair gate（CEO 必須 7・route は pair の外部送信）

route API は **(origin, destination) ペアを外部送信** → **片側でなくペアで gate**:

| gate | 条件 |
|---|---|
| `originEndpointSensitive` | origin が sensitive(medical/legal/exam)/home-inferred/work-inferred/currentLocation |
| `destinationEndpointSensitive` | destination が sensitive 等 |
| `eitherEndpointSensitive` | **どちらか一方でも sensitive → 外部送信 block** |
| `otherPeople / reservation / work / payment boundary` | 同伴者・予約・仕事・支払い文脈の endpoint |
| `currentLocationExternalSend` | 現在地の外部送信は**別 gate**（最も慎重） |
| `homeWorkInferencePrivacy` | home/work 推定座標の外部送信 privacy |
| `pairExternalSendAllowed` | **両 endpoint gate を通過した時のみ true** |
| `legalPrivacyGate` / `productionGate` | 法務 + production |

- **絶対則**: **片側だけ見ない**。どちらかの endpoint が sensitive/home/work/currentLocation なら `pairExternalSendAllowed=false`（external route API を叩かない・heuristic か no_route に倒す）。currentLocation 外部送信は最慎重 gate。

---

## 8. RC2a 接続条件（CEO 必須 8・honest 維持）

| RC2a field | true にする条件 | honest |
|---|---|---|
| `routeKnown` | L1(routeShapeKnown) ∧ fresh ∧ (external/cache/user)。**heuristic では false** | 供給なし→knownFalse |
| `etaKnown` | L6(etaKnown lattice) ∧ trafficAware ∧ temporalScope ∧ fresh。**heuristic/duration-only では false** | 供給なし→knownFalse |
| `leaveByKnown` | L7(leaveByEligible) 全条件（§1 + origin-usable §6 + arrival + buffer + fresh） | 1 つ欠ければ false |
| `whyUnresolved` 消去 | 当該能力が**実供給**で満たされた時のみ消す | heuristic では消さない |
| `missingInputRefs` 消去 | 同上（実供給のみ） | — |
| `evidenceRefs` 追加 | 能力別 provenance（§1.2）を追加 | raw は internal |

- **heuristic で消してはいけない missingInputRefs**: `route_missing` / `eta_source_missing` / `leaveBy_*`。heuristic は travelDuration(coarse) を与えるだけで route/ETA を満たさない → これらの missingInputRef を**消さない**（消したら誠実さが崩れる）。`movementRealityViolations` が fake ETA を検出（既存）。

---

## 9. fake 禁止 field 一覧（絶対境界）

| field | 禁止 |
|---|---|
| etaKnown | travelDuration/heuristic だけで true にしない（traffic+temporal+fresh 必須） |
| routeKnown | heuristic で true にしない（routeShape 必須） |
| leaveByEligible | etaKnown だけで true にしない（origin-usable+arrival+buffer+fresh 必須） |
| heuristicDurationHint | consumer/copy/leaveBy/feasibility/proposal に出さない・「○分」断定しない |
| user_confirmed_route | scope 不一致・stale で etaKnown true にしない |
| current_location origin | future departure で leaveBy origin にしない |
| external send | 片側 endpoint sensitive でペア送信しない |
| stale cache | freshness 切れで etaKnown/leaveBy true にしない |
| identity | from/to text・raw lat/lng・array index で同一視しない・mode 不明で confirmed しない |
| raw route data | polyline/座標/raw duration を consumer field に出さない（routeRef opaque） |

---

## 10. Department Responsibility Matrix（RD2d-0A・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Mobility**（route/ETA 供給設計）+ **Build**（lattice/identity/freshness の technical safety） |
| consultedDepartments | Permission（endpoint pair gate・currentLocation・PII）・Communication（heuristic 非露出）・Risk（stale/forecast 誤用）・Context（traffic/weather は RD2e） |
| blockingDepartments | **CEO**（RD2d 実装 GO・external API/DB は別 gate）+ Permission + 法務（pair 外部送信）+ production gate |
| outputs | RD2d-0A 設計（capability lattice・identity/scope・freshness/invalidation・heuristic 境界・user confirmed scope・origin temporal usability・endpoint pair gate・RC2a 接続・fake 禁止・RD2d GO 可否）。**コードなし** |
| safetyGate | **route/duration/ETA/leaveBy を lattice で分離**・**travelDuration/heuristic だけで etaKnown/leaveBy にしない**・**traffic-aware でも inferred**・**confirmed は user 確認 in-scope のみ**・**stale は使わない**・**current_location は future departure で leaveBy origin 不可**・**endpoint ペアで gate（片側 sensitive で送信 block）**・**identity は full basis content hash**・**heuristic は internalReference/debugOnly**・raw route data internal・RC2a compile 不変（接続別 GO・honest knownFalse 維持）・production gate 未通過 |
| traceRefs | RD2d-0 / RD2c origin / RD2a place / 既存 transport cascade / movementReality honest knownFalse |

---

## 11. RD2d 実装 GO 可否の自己判定

- **判定: RD2d-0A で RD2d 実装の設計前提が揃った**。GPT 監査 7 点 + 独立 3 追加（lattice/per-capability provenance/traffic-is-inferred）を反映し、route/duration/ETA/leaveBy の分離・identity・freshness・scope・origin temporal validity・endpoint pair gate を確定。
- **RD2d 実装（pure 型 + adapter）は GO 可能**（CEO 承認後）。ただし範囲は **capability lattice 型 + heuristic 隔離 + identity/freshness 型 + pure adapter（provider 注入）まで**。**external API / cascade 実接続 / RC2a 接続 / 永続化は各々別 GO + gate**。
- **推奨実装順**: RD2d（lattice 型 + identity/freshness 型 + heuristic 隔離・pure）→ RD2d'（cascade/heuristic provider 注入）→ RD2e（leaveBy 導出・origin temporal validity 適用）→ RC2a 接続 → RD2d''（external・endpoint pair gate・最後）。
- 革新点（CEO ⑥⑦）: **capability lattice + per-capability provenance + traffic-is-inferred** により、「external API が duration を返した＝所要確定」という業界標準の雑な扱いを排除。**route が分かること・所要が分かること・特定時刻の ETA が分かること・出発時刻を出してよいこと**を厳格に分離し、reality OS が「アプリが勝手に所要を断定して遅刻させる」事故を **lattice 違反 = walker block** で構造排除する。捏造しない誠実さを移動所要の各層まで貫く。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
