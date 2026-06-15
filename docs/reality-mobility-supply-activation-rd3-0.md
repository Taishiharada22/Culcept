# RD3-0 — Mobility Supply Activation Design（docs-only）

- 日付: 2026-06-15 / 位置づけ: 細切れの RD2d（route/ETA capability）・RD2e（durationValue/supply）・RD2f（computed leaveBy 保持/enrichment/preview wiring/leaveByKnown 緩和）の**次段**＝「dev/operator preview で supply を実際に non-empty にする」ための統合設計。**まだ実装ではない**。
- 規律: 本書は**コードを書かない**。real supply wiring 実装・route provider 接続・external API・currentLocation・MovementReality 変更・product/Alter 接続・departure line・exact timestamp・notification・DB write・production には進まない。
- 方法（CEO ①②③④⑤⑥⑦⑧ + ultracode）: **adversarial workflow（`wf_29639ac5`・6 grounding + 2 critique・file:line 根拠 + 活性化ルートを敵対的評価）**で供給ギャップを地に足のついた形で確定。下記は確認事実 + ルート裁定。

---

## 0. 中核発見（grounded・前提を疑った結果）

| # | 発見 | 根拠 |
|---|---|---|
| **F1（linchpin）** | **チェーン全体が test 以外で一度も実行されていない**。`resolveRouteEtaCapability` の **production caller はゼロ**（grep 確認）。provider 未注入ゆえ `routeEtaProviderAdapter.ts:281` で `buildNoRouteSource('not_injected')` → `no_route_source`・basis=`none` → durationValue null → supply incomplete → **uncomputed**（何も attach されない） | routeEtaProviderAdapter:276,281 |
| **F2** | **実 provider は既に存在するが未注入**: `createTransportCascadeRouteEtaProvider(deps,options)`（RD2d-c の pure wrapper・`transportCascadeRouteEtaProvider.ts:197-202`）が `RouteEtaProvider` を返す。注入されればチェーンが動く | transportCascadeRouteEtaProvider:197-202 |
| **F3** | **projection-grade basis が今日の実データから出ない**: durationValue 非 null は basis ∈ {`external_route`/`cached_route`/`scheduled`/`user_confirmed`} のみ（`routeEtaDurationValue.ts:42-50`）。`heuristic`/`none` は null。実 anchor には**座標がなく**、scheduled/user_confirmed の供給経路も未配線 → **gate を跨がずに real computed leaveBy は不可能** | routeEtaDurationValue:42-50,287-293 |
| **F4** | **previous_event_end origin のみ実データ由来で導出可能**。home/work/current/user_confirmed の v0 供給経路なし。placeCertainty は v0 で常に unknown（`compileEventRealityNodes:94-97`） | originInference:160-210 / compileEventRealityNodes:94-97 |
| **F5** | **preview は empty supply で no-op**（dogfood:154 / operator:105 が `supplyCandidates:[]`・`ernScopeByNodeId:{}`）。non-empty 化には compileMovementReality と assembleLeaveByBindings の間で provider→supply→candidate を構築する必要 | dogfoodPreview:154 / operatorDayPreview:105 |
| **F6** | **MovementReality は etaKnown/routeKnown を hardcode false**（`movementReality.ts:126-127`）。computed leaveBy が ERN に attach されても **mv.leaveByKnown は false のまま許容**（v0 ladder）。leaveByKnown=true 化は etaKnown/routeKnown 緩和（load-bearing・別 slice）が前提 | movementReality:126-127,205-207 |
| **F7** | **privacy/external gate は完備**: 入力は opaque ref のみ（座標 raw 不可）・`containsRawLocation` 走査・`pairExternalSendAllowed`/`localHeuristicAllowed` 直交 gate・sensitive endpoint 分類・fail-closed | routeEtaProviderAdapter:106-202 / routeEtaSafety |

→ **結論**: **real computed leaveBy を今日 gate なしで作れるのは dogfood synthetic fixture provider だけ**（F3）。これは P1/P2 が証明した「empty で no-op」の次＝**「non-empty でも computed が consumer に漏れない」を証明する graduation**。real data / external / 座標 / 表示はすべて gate 越え（別 slice）。

---

## 1. 現在の供給ギャップ（subsystem → stopPoint → 活性化最小条件）

| subsystem | stopPoint（今日どこで止まるか） | 活性化最小条件 |
|---|---|---|
| **RouteEtaCapability** | `routeEtaProviderAdapter.ts:281` provider 未注入 → `no_route_source`・basis=`none`・`timeEstimateUsableForPlanning=false`。**production caller ゼロ** | `resolveRouteEtaCapability(input,{provider})` を呼ぶ call-site + status='ok'/projection-grade basis/fresh+freshnessBasisRef/scope bounded を返す provider |
| **PlanningGradeDurationValue** | `routeEtaDurationValue.ts:305-306` basis 非許可 or `durationMinutesRaw` 無効 → null。実装は完備・防御的 | basis ∈ allowlist + finite `durationMinutesRaw≥0` + fresh + scope bounded（+ user_confirmed は evidenceRefs 必須） |
| **RD2e-SUPPLY** | bundle.complete = arrival ∧ buffer ∧ originTemporalValidity ∧ **durationValue** 全非 null（`leaveBySupply.ts:236`）。**durationValue null が主 blocker**（F1 の下流） | durationValue 非 null（上記）+ arrival/buffer/origin 非 null。origin は previous_event_end で可 |
| **PlaceResolution / OriginInference** | placeCertainty 常 unknown（`compileEventRealityNodes:94-97`）。home/work/current 供給経路なし | previous_event_end origin（実 anchor: endTime + startTimeSource∈{user_explicit,imported_exact} + locationText + 同日 prev event）→ `buildPreviousEventEndOriginValidity` |
| **preview call-sites** | dogfood:154 / operator:105 が empty supply で same-ref no-op | provider 注入 → supplyAndResolveLeaveBy → `LeaveBySupplyCandidateV0[]`（{eventRealityNodeId, leaveBy, computedScope}）+ `ernScopeByNodeId` を assembleLeaveByBindings に渡す |
| **MovementReality** | etaKnown/routeKnown hardcode false（126-127）。leaveByKnown は ladder で false 維持 | leaveByKnown=true には etaKnown/routeKnown を supply 由来で true 化（**load-bearing・別 slice RD3d/RD3e**） |
| **privacy/external gate** | 完備（opaque ref・containsRawLocation・直交 gate・fail-closed） | — （constraint map・活性化対象でない） |

### non-empty supply を作るための最小条件（goal 逆算）
**dogfood に決定論的 synthetic provider を 1 つ注入する**こと。具体的には `RouteEtaProviderResultV0`（status='ok'・basis='scheduled'・durationSignalPresent=true・durationScopeBounded=true・freshnessStatus='fresh'・freshnessBasisRef 非空・durationMinutesRaw=20[例]）を返す fixture provider を、既存 default-OFF flag `REALITY_LEAVEBY_ENRICH_PREVIEW` の裏で注入。→ capability usable → durationValue 非 null → supplyAndResolveLeaveBy complete → **computed leaveBy** → fixture ERN に attach → 完全チェーン実証。**外部送信ゼロ・座標ゼロ・product UI ゼロ・MovementReality 不変**。

> 実装注記（RD3a で決める）: `resolveRouteEtaCapability` は async ゆえ、(a) `buildScenario` を async 化して synthetic provider で full chain を runtime 実行するか、(b) precomputed fixture `LeaveByComputationV0` を直接組むか。**(a) を推奨**（capability→duration→supply→computation を実際に通し、boundary を実負荷で検証）。async 伝播は RD3a の実装判断。

---

## 2. 実供給ルート候補比較（敵対的裁定込み）

| option | 内容 | first blocker | gate | 裁定 |
|---|---|---|---|---|
| **dogfood synthetic non-empty supply** | fixture provider 注入で computed leaveBy を作る（dev-only・flag 裏・座標/外部なし） | なし（既存 flag で gate 済） | dev-only flag | **SAFE_FIRST ★** |
| operator real-data + internal provider | 実 anchor + transportCascade。但し projection-grade basis が出ない（F3）→ heuristic は uncomputed=inert | projection-grade basis 源が無い | operator-only + flag | **GATED**（readiness 監査のみ可・computed は出ない） |
| local heuristic route supply | 座標から距離 duration をローカル計算 | **raw coordinate gate**（座標が anchor に無い・現状不可） | currentLocation/座標 gate | **GATED**（heuristic basis は projection 非該当 → uncomputed・inert） |
| external route API | origin/dest を外部送信し ETA 取得 | **external send + privacy + API key** | 別 gate `REALITY_EXTERNAL_ROUTE_API_LIVE` + CEO | **NO_GO（CEO 承認まで）** |
| product /plan or Alter | user-facing 表示 | **user-facing display**（departure line/exact timestamp） | product gate + CEO | **NO_GO** |

**推奨 first = dogfood synthetic non-empty supply**（両 critique 一致・SAFE_FIRST）。real data は projection-grade basis 源が無いため computed を生まず（F3）、heuristic は inert、external/座標/表示は全て gate 越え。

---

## 3. 次の実装候補（リスク別・実装はリスクで束ねる）

| slice | 内容 | リスク | 裁定 |
|---|---|---|---|
| **RD3a: dogfood synthetic non-empty supply wiring** | dogfood に fixture provider 注入 → 完全チェーン実証・computed leaveBy が fixture ERN に attach・**consumerView byte-identical（OFF と）**・**safe payload に leak token ゼロ（non-empty でも）**・mv.leaveByKnown false 維持・MovementReality 不変 | 低（dev-only・flag 裏・座標/外部/UI なし） | **★ first GO 候補** |
| **RD3f: safe preview boolean** | `leaveByComputedPresent`（schema-state）を preview に出す型レベル防御込み。**RD3a で computed が実在するようになれば boolean が true を取り得る＝意味を持つ**ため RD3a 後に**再判断**（RD2f-SEM-0 では always-false ゆえ HOLD だった） | 低 | RD3a 後に再判断 |
| **RD3b: operator real-data supply readiness** | 実 anchor から place/origin/duration がどこまで作れるか readiness 監査（computed は出ない＝heuristic inert path の確認まで） | 中 | RD3a 後・監査主体 |
| **RD3d: etaKnown / routeKnown 意味論 re-audit** | route shape known か movement time basis known か再裁定（user_confirmed/scheduled は routeShape なしで成立し得る・RD2d 方針）。**load-bearing**（feasibility/decisionDebt が読む） | 中〜高 | 別 GO・docs first |
| **RD3e: MovementReality leaveByKnown real true path** | reconcile を pipeline に配線 + etaKnown/routeKnown 緩和。**load-bearing flags 変更** | 高 | RD3d 後・別 GO |
| **RD3c: routeEta provider / durationValue real connection** | scheduled-transit / user_confirmed / external のいずれを projection-grade 源にするか決定 + 接続 | 高（gate 越え） | NO_GO（源決定 + gate 待ち） |
| **RD3g: departure line boundary** | exact timestamp の user-facing 表示条件 | 最高 | **NO_GO** |

**推奨順**: **RD3a（first・full chain 実証 + boundary 実負荷検証）→ RD3f 再判断（computed 実在ゆえ boolean に意味）→ RD3b readiness → RD3d re-audit（docs）→ RD3e（load-bearing）→ RD3c（gate 越え・源決定）→ RD3g（NO_GO）**。RD3a と RD3f は **dev-only fixture path + pure helper + tests** ゆえ将来 1 GO 束ね候補。RD3d/RD3e/RD3c/RD3g は分割必須（§5）。

---

## 4. product / Alter / notification HOLD 確認

- **product `/plan` 接続 = NO GO**（reality engine 未配線・新 attack surface）
- **Alter tab 接続 = NO GO**
- **departure line 生成 = NO GO**（最高リスク）
- **exact timestamp 表示 = NO GO**（leaveByInstant/arrivalTargetInstant/ISO を出さない）
- **notification = NO GO**
- **external route API = 別 gate**（`REALITY_EXTERNAL_ROUTE_API_LIVE` + CEO 承認・現状 NO GO）
- **currentLocation = 別 gate**（geolocation・現状 NO GO）

---

## 5. slice 分割基準（“安全に行き過ぎない”ための明文化）

### まとめてよい（1 GO 束ね可）
- 同一 call-site 内の **guard + no-op/synthetic wiring**（dev-only fixture path）
- docs 設計上の**同一意味論**（例: RD2f-mv + feasibility-guard を 1 本に）
- **pure helper + tests**（IO/外部副作用なし）
- **non-user-facing dev-only fixture path**（座標/外部/UI/DB/notification を含まない）

### 分けるべき（別 GO 必須）
- **DB write / Supabase write**
- **product UI**（/plan・Alter・departure line・exact timestamp user-facing）
- **external API**（route 送信）
- **currentLocation / geolocation**
- **notification**
- **permission / action boundary 変更**
- **MovementReality load-bearing flags 変更**（etaKnown/routeKnown 緩和・mobilityStatus safe 化）

### 判定の一行原則
**「dev-only・座標/外部/UI/DB なし・既存 flag 裏・既存 boundary を緩めない」なら束ねてよい。いずれか 1 つでも越えるなら分ける。**

---

## 6. Department Responsibility Matrix（RD3-0・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Mobility/Build** | R | provider 注入点・supply candidate 構築・dogfood synthetic 設計・full chain 実証 |
| **Permission** | C | computed/exact instant の DTO 非露出（non-empty 負荷下でも）・leak guard・型レベル防御 |
| **Risk** | C | MovementReality 不変・consumerView byte-identical・etaKnown/routeKnown を勝手に true 化しない |
| **Communication** | C | departure line/exact timestamp/notification HOLD・safe preview boolean は schema-state まで |
| **CEO** | A | RD3a 実装 GO・external API/currentLocation/product/departure line gate 解除 |

---

## 7. RD3-0 自己判定

- **next first = RD3a（dogfood synthetic non-empty supply wiring）**: real computed leaveBy を gate なしで作れる唯一の道（F3）。価値は **「non-empty でも computed が consumer に漏れない」を実負荷で証明**（P1/P2 の empty no-op の graduation）。dev-only・flag 裏・座標/外部/UI/DB なし・MovementReality 不変・mv.leaveByKnown false 維持。
- **real data / external / 座標 / 表示はすべて gate 越え**（RD3b 以降・分割必須）。projection-grade basis 源（scheduled-transit/user_confirmed/external）の決定が real computed の前提（RD3c・gate 待ち）。
- **HOLD 継続**: product/Alter/departure line/exact timestamp/notification/external API/currentLocation。
- 封鎖すべき hole（async 伝播・non-empty leak・ladder coherence・staleness）は §1 注記・critique risk に記録済。**GO は CEO 専管**。本書はコードを含まない。
