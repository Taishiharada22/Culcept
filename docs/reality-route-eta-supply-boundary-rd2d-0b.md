# RD2d-0B — Route / ETA Mode-Aware Capability Graph（docs-only）

- 日付: 2026-06-14 / 作成: route/ETA capability graph 修正セッション
- 位置づけ: RD2d-0A（`6656f0bf`）の**単調 lattice を撤回**し、実世界の route/ETA に耐える **mode-aware capability DAG** に修正する。GPT 監査 8 点 + 独立強化を反映。
- 規律: **コードを書かない**（docs-only）。RouteEtaSupply 実装・transport cascade 接続・heuristic adapter・Google Routes・currentLocation・weather API・RC2a compile 変更・UI/DB/production には進まない。
- 上流: RD2d-0A `6656f0bf` + RD2d-0 `f2c6b931` + RD2c `d5a90500`（origin）。

---

## 0. 単調 lattice を採用しない理由（CEO 必須・独立検証）

RD2d-0A の単調鎖 `mode→routeShape→duration→trafficAware→temporalScope→arrivalTarget→eta→leaveBy` は**実世界の route/ETA で破綻**する:

1. **routeShape 無でも duration は存在しうる** — user 確認所要・公共交通の時刻表所要は経路幾何なしで成立。よって `travelDurationKnown` は `routeShapeKnown` を要求してはいけない（別 capability）。
2. **trafficAware は mode 依存** — car では重要だが**徒歩は traffic 無関係**・**鉄道は schedule-aware/realtime-delay が別概念**。全 mode 共通の必須 rung にすると徒歩/鉄道/user 確認が不当に落ちる。
3. **arrivalTargetKnown は transport の能力でなく event 側 context** — 到着目標は provider が返すものでなく event anchor 由来。transport lattice に混ぜない。
4. **leaveByEligible は transport supply の rung でなく join 結果** — origin × destination × projection × buffer × permission の meet。supply の一段ではない。
5. **single chain は過剰に unknown へ落とす**（正しい入力を捨てる）一方、**鎖を満たすと leaveBy 方向へ進みすぎる**。

→ **採用する構造: precise edges を持つ mode-aware capability DAG**。「各能力は入力が支える以上を主張しない」という monotone **安全性のみ**継承（lattice の正しい核）し、偽の直列（trafficAware 必須・duration⊃routeShape・arrivalTarget/leaveBy 混入）を除去。

---

## 1. Capability graph 設計（CEO 必須 1・DAG・5 ファミリ + join）

能力を**独立ファミリ**に分け、**precise dependency edges**（→ = 要求）で結ぶ。families は並列・edges のみが含意。

### 1.1 ファミリ（nodes）

```
ROUTE          : transportModeKnown / routeShapeKnown / routeOptionKnown / providerKindKnown
DURATION       : travelDurationKnown ( durationBasis ∈ {heuristic, scheduled, user_confirmed, external_route, cached_route} / durationScope )
TEMPORAL       : departureTimeScoped / arrivalTargetScoped / timeBandScoped / evaluatedAtKnown / temporalFreshnessKnown
CONDITION      : conditionModelStatus ∈ {traffic_aware, schedule_aware, weather_aware, static_assumption, not_applicable, unknown}
PROJECTION     : arrivalProjectionKnown
PLANNING       : timeEstimateUsableForPlanning / confidenceForAction / missingInputRefs
ELIGIBILITY    : leaveByEligible
```

### 1.2 precise edges（要求関係・monotone 安全性）

```
travelDurationKnown        → transportModeKnown            (所要は mode 相対・ただし routeShape は不要)
arrivalProjectionKnown     → travelDurationKnown
                           ∧ ( departureTimeScoped ∨ arrivalTargetScoped )
                           ∧ temporalFreshnessKnown
                           ∧ conditionAdequateForMode(mode, conditionModelStatus)   ← §2 マトリクス
timeEstimateUsableForPlanning → arrivalProjectionKnown ∧ freshnessStatus=fresh ∧ ¬stale
leaveByComputable (JOIN・§3) → timeEstimateUsableForPlanning
                           ∧ arrivalTargetScoped
                           ∧ originUsabilityForLeaveBy (RD2d-0A §6)
                           ∧ bufferKnown
                           ∧ ¬originConflict (§5)
```

> **⚠ RD2d-a-A 補正（実装 `40c0146f`+micro-fix・4 レンズ監査 wf_cef6e0fa 反映）**:
> - **leaveBy join から `pairPermissionOk` を削除**（endpoint pair gate は external provider 送信可否を govern する sibling であって leaveBy computation の条件でない。user_confirmed route は外部送信なしで leaveBy 計算可）。上の式 + 下の表 + §17 line 17 の「∧ permission」は本補正で**撤回**。
> - **語彙補正**: `travelDurationKnown`→`durationSignalPresent`（heuristic でも true ＝「known」は誇張・signal の有無のみ）／`temporalFreshnessKnown`→`temporalFreshnessEvaluated`（real freshness と区別）／`leaveByEligible`→`leaveByComputable`（tier-1 内部計算可能性のみ・display/action eligibility は RJ2/Permission/delivery の別 gate・computable ⇏ display ⇏ action）。
> - **projection gate を DENYLIST(!heuristic)→ALLOWLIST(`durationProjectionGradeOk` ∈ {scheduled,user_confirmed,external_route,cached_route})**（fail-closed・straight-line 誤 stamp / basis="none" も projection 不可）+ `durationScopeBounded` を projection conjunct に追加。

- **絶対則（monotone 安全性・lattice の継承核）**: **どの能力も edges の入力が揃わなければ true にしない**（DAG 違反 = walker block）。`routeShapeKnown` と `durationSignalPresent` は**独立**（一方欠如が他方を落とさない）。
- `routeShapeKnown` は単独 capability（provider が返すか否か）で、duration/projection の必須入力**ではない**。

---

## 2. mode-specific condition semantics（CEO 必須 2・trafficAware を共通必須にしない）

`conditionAdequateForMode(mode, conditionModelStatus)` = planning-grade に十分な condition か（mode 別）:

| mode | planning-grade に必要な conditionModelStatus | traffic | 補足 |
|---|---|---|---|
| `car` | **traffic_aware**（static_assumption は duration 止まり・projection 不可） | 必須 | weather_aware は加点 |
| `walking` | **static_assumption 以上で可**（traffic = **not_applicable**） | N/A | weather_aware（雨/雪）は加点 |
| `transit` | **schedule_aware**（時刻表）・realtime-delay-aware は加点 | N/A（mostly） | 時刻表更新で stale |
| `bike` | **static_assumption 以上**・weather/traffic 部分加点 | 部分 | — |
| `unknown` | **planning 不可**（何の condition が効くか不明 → conditionModelStatus=unknown） | unknown | duration のみ・projection 不可 |

- **絶対則**: **`trafficAware` を全 mode 共通必須にしない**。mode に応じた **condition adequacy** を見る。car で static_assumption のみ → `arrivalProjectionKnown=false`（traffic 未反映で時刻断定しない）。walking で traffic 無は当然 → static_assumption で projection 可。**unknown mode は projection 不可**（duration coarse 止まり）。

---

## 3. travelDurationKnown / arrivalProjectionKnown / timeEstimateUsableForPlanning / leaveByEligible の分離（CEO 必須 3・etaKnown 再裁定）

**「ETA」は曖昧 → 廃語**。4 概念に分離:

| 概念 | 定義 | 例 |
|---|---|---|
| `travelDurationKnown` | 所要時間の見積りがある（mode 相対・時刻非依存可・durationBasis 付き） | external が duration 返した・heuristic・user 確認・時刻表 |
| `arrivalProjectionKnown` | 特定 departure/arrival に対する**到着時刻投影**ができる（duration ∧ temporal scope ∧ condition adequate） | car traffic-aware + departure_time / transit schedule + 時刻 |
| `timeEstimateUsableForPlanning` | projection が **fresh ∧ in-scope ∧ condition-adequate** で**行動計画に使える** | 上 + freshness fresh |
| `leaveByComputable` | **出発時刻を内部計算できる（tier-1・display/action でない）**（planning-usable ∧ arrivalTarget ∧ origin-usable ∧ buffer ∧ ¬conflict。**permission/pairPermission は含めない**＝RD2d-a-A 補正） | §1.2 JOIN 全充足 |

- **絶対則**: **durationKnown ≠ arrivalProjectionKnown ≠ timeEstimateUsableForPlanning ≠ leaveByEligible**。external API が duration 返しても **travelDurationKnown** どまり（arrival target 無・condition 不適なら projection 不可）。**arrival target 無 → arrivalProjectionKnown でない**・**buffer 無 → leaveByEligible でない**・**stale → planning usable でない**。
- 旧 `etaKnown` は廃語。RC2a 接続（§ RD2d-0A 8）では **etaKnown = timeEstimateUsableForPlanning** に対応付ける（planning-grade のみ true）。

---

## 4. user_confirmed_route の能力別分解（CEO 必須 4・何を確認したか）

「本人確認 route」でも**確認対象を能力別に分ける**（confirmedScope）:

| 確認対象 | 与える能力 |
|---|---|
| `mode_confirmed` | transportModeKnown |
| `route_choice_confirmed` | routeShapeKnown / routeOptionKnown |
| `duration_confirmed` | travelDurationKnown（durationBasis=user_confirmed） |
| `origin_destination_confirmed` | identity の origin/dest 確定 |
| `time_band_confirmed` | timeBandScoped |
| `arrival_target_confirmed` | arrivalTargetScoped |
| `buffer_confirmed` | bufferKnown |
| `route_reliability_confirmed` | confidenceForAction 加点 |

- **絶対則**: **user_confirmed_route だけで routeShapeKnown/durationKnown/timeEstimateUsableForPlanning を全部 true にしない**。`confirmedScope` で能力ごとに切る。`confirmedAt`/`validUntil`/recency/context-match 必須。**scope mismatch（別 origin/dest/mode/timeBand）→ inferred/stale/unknown へ戻す**。古い確認を無期限に使わない。

---

## 5. origin conflict handling（CEO 必須 5・currentLocation で上書きしない）

複数 origin signal が矛盾する場合の処理（RD2c origin × route が join する点）:

| field | 意味 |
|---|---|
| `originConflictStatus` | none / minor_discrepancy / conflict |
| `originDiscrepancyRefs` | 矛盾する origin signal の ref（previous_event_end vs current_location 等） |
| `originSelectionPolicy` | confirmed 優先 / chain 優先 / current は補助のみ |

- **不変条件**:
  - `user_confirmed_origin` がある場合、**currentLocation で上書きしない**（観測値 ≠ 出発意図）。
  - `previous_event_end` と `current_location_candidate` が矛盾 → **勝手に currentLocation を採用しない**（conflict として扱う）。
  - `home_assumed` と `current_location_candidate` が矛盾 → 同上。
  - **conflicting origin がある場合 `leaveByEligible=false`**（origin 不確定で出発時刻を断定しない）。
  - currentLocation は**観測値**であって出発意図ではない（出発時刻に妥当かは RD2d-0A §6 の temporal usability で別判定）。

---

## 6. cache 分離（CEO 必須 6・route cache ≠ ETA cache）

cache を**能力別**に分け、**stale 判定も別**:

| cache | 内容 | 失効しやすさ / stale 条件 |
|---|---|---|
| `routeShapeCache` | 経路幾何 | 比較的長く有効（道路変更まで） |
| `durationCache` | mode 別所要（時刻非依存） | mode/経路変更で失効 |
| `trafficEtaCache` | traffic-aware ETA | **短時間で失効**（traffic window 経過） |
| `scheduleEtaCache` | transit 時刻表 ETA | **時刻表更新で失効** |
| `userConfirmedDurationCache` | user 確認所要 | **文脈一致しないと失効**（scope mismatch・recency） |

- **絶対則**: **「cache fresh なら etaKnown true」は雑** → cache 種別ごとに freshness/stale を判定。trafficEtaCache は短命・routeShapeCache は長命。**stale な cache を planning に使わない**。各 cache は providerVersion/routeInputRevision を持ち、invalidationTriggers（RD2d-0A §3）で無効化。

---

## 7. heuristicDurationHint 使用禁止境界（CEO 必須 7・明文化）

| 使ってはいけない | 使ってよい |
|---|---|
| `arrivalProjectionKnown` / `timeEstimateUsableForPlanning` / `leaveByEligible` の材料 | internal debug |
| departure line / 出発時刻 | coverage gap analysis（何が未供給か） |
| user-facing copy / RJ2e copy / 「○分」文面 | future calibration candidate（後の校正用） |
| Feasibility の confirmed factor | rough mobility burden reference（粗い移動負荷の内部参照） |
| CollapseRisk の high factor | （上記いずれも **never as action input**） |
| proposal generation / notification / urgency copy | — |

- **絶対則**: heuristicDurationHint は **`displayPolicy = internalReference | debugOnly`**・**action input に一切しない**。「捨てない・でも所要として使わない」を厳格化。

---

## 8. endpoint pair privacy（CEO 必須 8・外部送信前 gate + raw 座標）

route は (origin, destination) ペアの外部送信 → ペア gate + raw 座標保護:

| gate / policy | 内容 |
|---|---|
| `originEndpointGate` | origin が sensitive/home-inferred/work-inferred/currentLocation か |
| `destinationEndpointGate` | destination 同上 |
| `pairExternalSendAllowed` | **両 endpoint gate 通過時のみ true**・片側 sensitive で false |
| `coordinatePrecisionPolicy` | 送信時の座標精度最小化（必要最小限） |
| `rawCoordinateLoggingProhibited` | **raw 座標を id / log / debug に出さない** |
| `currentLocationSendGate` | **currentLocation 座標 = 最強 sensitive material**（最慎重・別 gate） |
| `homeWorkDerivedSensitivity` | home/work 推定座標 = **sensitive-derived material** |
| `legalPrivacyGate` / `productionGate` | 法務 + production |

- **絶対則**:
  - **`pairExternalSendAllowed=false` なら external route provider を呼ばない**。
  - ただし **`pairExternalSendAllowed=false` でも heuristic local 計算（外部送信なし）の可否は別判断**（local 距離計算は外部に投げない → 別途許容しうる）。
  - **raw 座標を id/log/debug に出さない**・currentLocation 送信は最強 sensitive・home/work 推定座標は sensitive-derived。
  - provider request payload の詳細定義は**別 slice**（RD2d'' 実装時）。

---

## 9. fake 禁止 field 一覧（更新・絶対境界）

| field | 禁止 |
|---|---|
| arrivalProjectionKnown | duration だけ・arrival target 無・condition 不適で true にしない |
| timeEstimateUsableForPlanning | stale・condition 不適で true にしない |
| leaveByEligible | projection だけ・origin-usable 無・buffer 無・origin conflict で true にしない |
| trafficAware（廃・conditionModelStatus へ） | 全 mode 共通必須にしない（mode 別 adequacy） |
| heuristicDurationHint | action input/copy/leaveBy/projection に出さない |
| user_confirmed_route | scope 別に切る・全能力 true にしない・流用禁止 |
| current_location origin | user_confirmed origin を上書きしない・conflict で leaveBy 不可・future departure 不可 |
| cache | 種別別 stale・traffic cache を長命扱いしない |
| external send | 片側 endpoint sensitive でペア送信しない・raw 座標を log/id に出さない |
| identity | full basis content hash・text/raw lat-lng/index 禁止・mode 不明で confirmed 禁止 |

---

## 10. Department Responsibility Matrix（RD2d-0B・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Mobility**（capability graph 設計）+ **Build**（DAG edges/identity/freshness の technical safety） |
| consultedDepartments | Permission（endpoint pair gate・currentLocation 座標・PII）・Communication（heuristic 非露出）・Risk（stale/forecast/mode 誤用）・Context（traffic/schedule/weather・event arrivalTarget） |
| blockingDepartments | **CEO**（RD2d 実装 GO・external API/DB は別 gate）+ Permission + 法務（pair 外部送信・座標）+ production gate |
| outputs | RD2d-0B 設計（単調 lattice 撤回理由・mode-aware capability DAG・mode×condition adequacy・duration/projection/planning/leaveBy 分離・user confirmed scope・origin conflict・cache 分離・heuristic 境界・endpoint pair privacy・RD2d GO 可否）。**コードなし** |
| safetyGate | **単調 lattice 不採用（DAG・各能力は edges 入力以上を主張しない）**・**trafficAware を共通必須にしない（mode 別 condition adequacy）**・**duration≠projection≠planning≠leaveBy**・**unknown mode は projection 不可**・**user confirmed は scope 別・流用禁止**・**origin conflict で leaveBy 不可・user_confirmed origin を currentLocation で上書きしない**・**cache 種別別 stale**・**heuristic は action input 禁止**・**endpoint ペア gate・片側 sensitive で送信 block・raw 座標 log/id 禁止・currentLocation 最強 sensitive**・identity full basis・RC2a compile 不変（接続別 GO・honest 維持）・production gate 未通過 |
| traceRefs | RD2d-0A / RD2d-0 / RD2c origin / RD2a place / 既存 transport cascade / movementReality honest knownFalse |

---

## 11. RD2d 実装 GO 可否の自己判定

- **判定: RD2d-0B で実装の設計前提が揃った**。単調 lattice を撤回し **mode-aware capability DAG** に修正。GPT 8 点 + 独立強化（precise edges DAG / mode×condition adequacy マトリクス / leaveBy=明示 join）を反映。
- **RD2d 実装（pure 型 + adapter）GO 可能**（CEO 承認後）。範囲: **capability graph 型（ファミリ別・mode×condition adequacy）+ identity/freshness 型 + heuristic 隔離 + pure adapter（provider 注入）まで**。**external API / cascade 実接続 / RC2a 接続 / 永続化 / origin conflict 解決 / cache 実装は各々別 GO + gate**。
- **推奨実装順**: RD2d（capability graph 型 + heuristic 隔離 + identity/freshness 型・pure）→ RD2d'（cascade/heuristic provider 注入・mode 別 condition）→ RD2e（leaveBy join・origin temporal validity + conflict）→ RC2a 接続 → RD2d''（external・endpoint pair gate・最後）。
- 革新点（CEO ⑥）: **mode-aware capability DAG + mode×condition adequacy** により、業界標準の「duration 返った＝ETA 確定」「traffic-aware 必須」の雑さを排除しつつ、**徒歩・鉄道・user 確認を不当に落とさない**。route が分かること・所要が分かること・特定時刻の到着投影・行動計画に使えること・出発時刻を出してよいことを **mode 別に正しく分離**し、「勝手に所要断定」も「正しい入力を過剰に捨てる」も両方を DAG + adequacy で防ぐ。誠実さと実用性を両立。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
