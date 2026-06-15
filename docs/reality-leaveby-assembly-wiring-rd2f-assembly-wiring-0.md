# RD2f-assembly-wiring-0 — assembleLeaveByBindings call-site 接続設計（docs-only）

- 日付: 2026-06-15 / 位置づけ: `assembleLeaveByBindings`（`2a6ad554`）を、どの call-site に・どの条件で・どの順序で挟むか実装前設計。**まだ実装ではない**。
- 規律: 本書は**コードを書かない**。call-site 実装・product/Alter 接続・MovementReality 更新・leaveByKnown 反映・preview exact timestamp 表示には進まない。
- 方法（CEO ①②③ + ultracode）: **adversarial workflow（`wf_51a16ae5`・5 grounding + 2 synthesize・file:line 根拠）**で call-site/flag/DTO/supply 可用性を監査。下記は確認事実。

---

## 0. 中核発見（grounded・前提を疑った結果）

| # | 発見 | 根拠 |
|---|---|---|
| **F1** | **supply は今日**何も生成しない**（routeKnown/etaKnown/leaveByKnown は `compileMovementReality` で hardcoded false・RouteEtaCapability/durationValue は preview path に存在しない）→ durationValue null → supply incomplete → uncomputed → **何も attach されない** | `movementReality.ts:126-128`・preview paths |
| **F2** | `assembleRealityGraph`/`compileEventRealityNodes`/`compileMovementReality` は **dev/preview 専用**。**product `/plan` と Alter tab は reality engine に一切触れない** | `/plan/page.tsx`(PLAN_ROUTE_LIVE・anchors のみ)・AlterTab(buildAlterScreen) |
| **F3** | 唯一の call-site = `/plan/dev-reality-surface/page.tsx`（**triple-guard**: host `REALITY_CANDIDATE_ACTIONS_DEV_HOST` + flag `REALITY_SURFACE_PREVIEW` + operator auth）。dogfood(`buildScenario`:146・fixture・DB-free) + real-data(`buildOperatorDaySnapshot`:96・listAnchors select) | `dev-reality-surface/page.tsx`・dogfoodPreview/operatorDayPreview |
| **F4** | **leak guard が leaveBy token を scan しない**: `LEAK_TOKENS`(dogfood)/`REAL_LEAK_TOKENS`(operator)/`FORBIDDEN_TOKENS`(surfaceProjection) に leaveby 系なし。`copySurface.FORBIDDEN_LEXICON` のみ `leaveby`/`eta` あり（非対称） | dogfoodPreview:187 / operatorDayPreview:170 / surfaceProjection / copySurface:106 |
| **F5** | flag pattern: `PLAN_FLAGS`(`lib/plan/featureFlags.ts`)・env(非 NEXT_PUBLIC=server)・**default-OFF 慣習**。precedent=`REALITY_SURFACE_PREVIEW` | featureFlags.ts |
| **F6** | DTO は多層 filter（passthrough でない）: snapshot(internal)→RJ2 judgment chain→`surfaceProjection`(RJ2d redaction)→`copySurface`(RJ2e)→client DTO。snapshot は client に serialize されない | dev-reality-surface:88-93 |

→ **結論**: 最初の wiring は **「supply 空ゆえ何も attach しない inert plumbing」**。価値は **gated seam の確立 + leak-token 硬化**（route ETA supply が来た時の土台）。**「no-op が no-op のままである」ことを証明する slice**。

---

## 1. call-site audit

| call-site | 種別 | reality engine | 挿入点 |
|---|---|---|---|
| `dogfoodPreview.buildScenario` | **dev-only・fixture・DB-free・deterministic**（DATE 2026-06-12・4 scenario）| ✓ | `:146` assembleRealityGraph の直前（`:145` cs override の後）|
| `operatorDayPreview.buildOperatorDaySnapshot` | dev-only・**real-data**（listAnchors select）| ✓ | `:96` assembleRealityGraph の直前（`:95` momentSnapshot の後）|
| `/plan/dev-reality-surface/page.tsx` | dev-only host(triple-guard) | 上記 2 を呼ぶ唯一の route | — |
| product `/plan` | product | **✗ 触れない** | NO GO |
| Alter tab | product | **✗ 触れない**(buildAlterScreen pure) | NO GO |

---

## 2. wiring 候補比較

| option | pros | cons | risk | recommendation |
|---|---|---|---|---|
| **fixture preview（dogfoodPreview）** | 最安全・deterministic・DB-free・pure | real dogfood にならない | 低 | **★ first** |
| dev-only real-data preview（operatorDayPreview） | 実データで確認可能 | real-data + 新 enrichment の **2 risk 軸**が重なる | 中 | second |
| operatorDayPreview internal | reuse しやすい | 影響範囲広 | 中 | second |
| product `/plan` | 本番体験に近い | reality engine 未配線・新 attack surface・早すぎ | 高 | **NO GO** |
| Alter tab | Reality 文脈 | 表面汚染リスク・未配線 | 高 | **NO GO** |

**推奨 first wiring target = `dogfoodPreview.buildScenario`**（synthesis 両 lens 一致）。operatorDayPreview は dogfood で no-op 証明後の second。

---

## 3. wiring 順序

```
1. compileEventRealityNodes → ern[]
2. compileMovementReality → mv[]            （mv は以降 by-reference 不変）
3. [flag ON のみ] assembleLeaveByBindings({ eventRealityNodes: ern, supplyCandidates: [], consumingInstant, ernScopeByNodeId: {} }) → ern'
4. assembleRealityGraph({ ern: ern'(or ern), mv, cs, momentSnapshot })
```
- **RD2e-SUPPLY / computeLeaveBy は本 slice で呼ばない**（supply infra 未接続）→ `supplyCandidates: []`（empty）・`ernScopeByNodeId: {}`。
- flag OFF → step3 を実行せず ern をそのまま（DOM-diff zero）。
- leaveByKnown 反映なし・mv 不変。

---

## 4. input supply source 設計（honest: 空）

- **本 slice は `supplyCandidates: []`（empty）固定**。`buildLeaveBySupplyBundle`/`supplyAndResolveLeaveBy`/`deriveDurationValue…` を**呼ばない**（RouteEtaCapability/durationValue が preview に無い・F1）。
- uncomputed は**渡さない**（empty ゆえ候補ゼロ）。duplicate/orphan も発生しない。
- `consumingInstant` = **既存の preview instant をそのまま使う**（operatorDayPreview の `instant`(:93) / dogfood の fixture reference instant）。**新規 `new Date()` を作らない**。
- invalid consumingInstant 時は assembleLeaveByBindings 内の attach 再検証が conservative stale で弾く（が、候補が空なので無関係）。
- **将来 route ETA supply が来たら**: そこで `supplyAndResolveLeaveBy` を呼び `{leaveBy}` から candidate を組む（**bundle は discard**）。本 slice はその seam を空で確立するのみ。

---

## 5. disabled / gate

- **新 flag**（既存 `REALITY_SURFACE_PREVIEW` を流用しない・synthesis HIGH）: `PLAN_FLAGS.realityLeaveByEnrichPreview = process.env.REALITY_LEAVEBY_ENRICH_PREVIEW === "true"`（**非 NEXT_PUBLIC=server-only・default OFF・production OFF**）。
- disabled → `assembleLeaveByBindings` / RD2e-SUPPLY を**実行しない**・ern そのまま → **snapshot/DTO byte 同一**。
- **DOM-diff zero**: (a) flag OFF と (b) flag ON-but-empty の**両方**で payload が baseline と一致（F1 ゆえ ON でも何も attach されない）。test で 2 通り assert。
- API 追加なし・DB write なし・notification なし・localStorage なし・external なし。

---

## 6. safe output boundary（leak-token 硬化が前提）

- **wiring 前に leaveBy leak token を全 guard list に追加**（synthesis HIGH F4）。共有 const `LEAVEBY_LEAK_TOKENS = ['leaveby','leavebyinstant','leavebycomputed','arrivaltargetinstant','timecontract','sourcetimeestimateref','bufferref']` を `LEAK_TOKENS`(dogfood) / `REAL_LEAK_TOKENS`(operator) / `surfaceProjection.FORBIDDEN_TOKENS` / `copySurface.FORBIDDEN_LEXICON` に反映（非対称解消）。
- `ern.leaveByComputed`（internal・exact ISO instant 含む）を **client DTO に出さない**（`EVENT_REALITY_ATTRIBUTE_KEYS` 非含有ゆえ attribute 投影に乗らない + leak-token guard が二重防御）。
- **exact timestamp を preview に出さない**・surface/copy/notification へ出さない。
- dogfood に出すなら**別 slice で safe boolean のみ**（exact instant でない）。
- raw route/duration/location/evidence/source/missing refs を client へ出さない（token guard 通過）。
- **fixture-forced 合成 leaveByComputed test**（synthesis HIGH）: ERN に leaveByComputed を強制注入し full pipeline（snapshot→judgment→projection→copy）を通して **DTO/leak guard が exact instant を filter する**ことを assert（empty supply では実発生しないが、防御を機械検証）。
- assembleLeaveByBindings の **trace は client に出さない**（`{ eventRealityNodes }` のみ destructure・trace は dev flag 裏で server log か破棄）。

---

## 7. MovementReality 不変 / Feasibility・Risk・Permission 非接続

- 本 wiring で **MovementReality を変更しない**・`leaveByKnown`/`routeKnown`/`etaKnown`/`mobilityStatus`/`missingInputRefs` 不変・`deriveMovementLeaveByKnown` を wire しない。mv は compileMovementReality の出力を **by-reference unchanged** で assembleRealityGraph に渡す（test で assert）。
- **Feasibility は `ern.leaveByComputed` を読まない**（`ern.leaveBy`[null] を読む・non-load-bearing）。CollapseRisk/InterventionEligibility/Permission を変えない。proposal/notification/departure line を生成しない。

---

## 8. RD2f-assembly-wiring 実装候補（次段・各々別 GO）

| slice | 内容 | 触る |
|---|---|---|
| **RD2f-wiring-leaktokens（prep）** | leaveBy leak token を 4 guard に追加（共有 const）+ asymmetry test | dogfood/operator/surfaceProjection/copySurface guard 局所 |
| **RD2f-wiring-dogfood** | `dogfoodPreview:146` に flag-gated `assembleLeaveByBindings`(empty candidates) 挿入 + DOM-diff-zero(OFF/ON) test + 合成 leaveByComputed DTO-filter test | dogfoodPreview + featureFlags |
| **RD2f-wiring-operator（後段）** | operatorDayPreview に同様（real-data path） | operatorDayPreview |
| **product/Alter** | NO GO（reality engine 未配線） | — |

**推奨順**: leaktokens(prep) → dogfood(empty・no-op 証明) → operator → 表示系 HOLD。

---

## 9. Department Responsibility Matrix（RD2f-assembly-wiring-0・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Mobility/Build** | R | call-site 選定・flag・wiring 順序・empty supply・no-op 証明 |
| **Permission** | C | leak-token 硬化・leaveByComputed/exact instant の DTO 非露出・trace 非露出 |
| **Risk** | C | feasibility/risk/permission 非接続・mv 不変・DOM-diff zero |
| **Communication** | C | preview safe boolean のみ・exact instant HOLD・dogfood 表示境界 |
| **CEO** | A | RD2f-wiring 実装 GO（dogfood first）・operator/preview 表示 GO（別） |

---

## 10. RD2f-assembly-wiring 実装 GO 可否 自己判定

- **first target = dogfoodPreview（dev-only・fixture・DB-free）・新 default-OFF server flag・empty supplyCandidates**。product/Alter は NO GO（reality engine 未配線）。
- **honest constraint**: supply が今日空ゆえ **wiring は何も surface しない inert plumbing**（no-op 証明 + seam 確立 + leak-token 硬化が成果）。これを明記して ship する（empty supply を唯一 coverage にしない・合成 test で DTO filter も検証）。
- 封鎖すべき hole（leak-token 非対称・新 flag 分離・DOM-diff zero OFF/ON・mv 不変・trace 非露出）は設計済。
- **prep（leak-token 硬化）→ dogfood wiring の順**が安全。GO は CEO 専管。本書はコードを含まない。
