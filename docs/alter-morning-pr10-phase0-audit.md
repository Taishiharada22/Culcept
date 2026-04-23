# W3-PR-10 Phase 0 Audit — Transport Staircase 土台調査

**作成日**: 2026-04-23
**branch**: `feat/alter-morning-wave3-pr10`（clean main = PR #19 merged、HEAD `2eacb55a` 起点）
**CEO 承認**: Phase 0 Audit 着手承認 2026-04-23（§4 ロック済み決定 + Invariant T2 文言修正反映）
**原則**: 本監査は **コード変更ゼロ**。現状構造の棚卸しとギャップ特定のみ。

---

## 0. 監査のゴール

PR-10 transport staircase の Phase 1（Domain Model 構築）に入る前に:
- 既存 travel PlanItem / `kind === "travel"` 配線の全体像を固定する
- `event.where.coordinates`（PR-9 で landing）から plan item までの **現行 1 本線**を確認する
- **F-New-1**: event mutation（特に applyPlaceSelection による coordinates fix）→ plan rebuild trigger の現存点と未接続経路を明示する
- これらを Phase 1 の builder 配置点 / rebuild trigger 1 本化議論の根拠にする

---

## 1. Invariants（CEO 2026-04-23 文言修正反映）

### T1 — Canonical source
- Domain truth は常に `TransportSegment[]`
- persisted `kind: "travel"` PlanItem は **render / display cache** 扱い
- 復元時 snapshot を domain truth にしない（「2つの真実」回避）

### T2 — Canonical consumer 規律（修正版）
- Domain truth は常に `TransportSegment[]`
- domain consumer は persisted `travel` PlanItem を canonical source として読まない
- canonical segments は plan build / rebuild 時に **一度だけ生成された結果**を参照する
- 未生成時のみ canonical rebuild を **1 回だけ**走らせる
- consumer が個別に毎回 `buildTransportSegments()` を直接叩く設計にはしない

**修正理由**:
- consumer ごとの再計算は Routes API 重複実行・タイミング差・drift を招く
- canonical は一本化するが、builder 呼び出し点までは分散させない

### T3 — Flag gate 最上流
- `ALTER_MORNING_TRANSPORT_V2` は call-site 最上流で分岐
- flag=OFF 時は byte-diff ゼロ保証（既存 `insertTravelItems` / `kind: "travel"` 経路を一切変更しない）

---

## 2. 監査項目 #1: `kind === "travel"` 消費箇所 全棚卸し

### 2.1 **Writer（生成側）** — [lib/alter-morning/travelTimeEngine.ts](lib/alter-morning/travelTimeEngine.ts)

| 箇所 | 関数 | 出力 PlanItem |
|------|------|--------------|
| [L291](lib/alter-morning/travelTimeEngine.ts:291) | `insertTravelItems` | sync 中間 travel |
| [L330](lib/alter-morning/travelTimeEngine.ts:330) | `insertTravelItems` | sync 帰路 travel |
| [L521](lib/alter-morning/travelTimeEngine.ts:521) | `insertTravelItemsAsync` | async 中間 travel |
| [L577](lib/alter-morning/travelTimeEngine.ts:577) | `insertTravelItemsAsync` | async 帰路 travel |

**現状方針**: `travel` PlanItem は **この 4 箇所でのみ生成される**。ID prefix は `travel_<timestamp36>_<rand36>` 固定。

### 2.2 **Reader（読み手）** — production code

#### A. 自己除外（再計算時の既存 travel スキップ）
- [lib/alter-morning/travelTimeEngine.ts:255](lib/alter-morning/travelTimeEngine.ts:255) — sync re-entry で travel を除外
- [lib/alter-morning/travelTimeEngine.ts:264](lib/alter-morning/travelTimeEngine.ts:264) — sync ループ内 travel continue
- [lib/alter-morning/travelTimeEngine.ts:473](lib/alter-morning/travelTimeEngine.ts:473) — async re-entry で travel を除外
- [lib/alter-morning/travelTimeEngine.ts:481](lib/alter-morning/travelTimeEngine.ts:481) — async ループ内 travel continue

#### B. 隣接判定・gap fill
- [lib/alter-morning/gapFillEngine.ts:751](lib/alter-morning/gapFillEngine.ts:751) — `gap.before?.kind === "travel"` で free-time 隣接条件
- [lib/alter-morning/gapFillEngine.ts:752](lib/alter-morning/gapFillEngine.ts:752) — `gap.after?.kind === "travel"` 同上
- [lib/alter-morning/gapFillEngine.ts:789](lib/alter-morning/gapFillEngine.ts:789) — `item.kind !== "travel"` 早期 return
- [lib/alter-morning/gapFillEngine.ts:833](lib/alter-morning/gapFillEngine.ts:833) — pre-meal 候補で travel 前提
- [lib/alter-morning/gapFillEngine.ts:840](lib/alter-morning/gapFillEngine.ts:840) — pre-meeting 候補で travel 前提
- [lib/alter-morning/gapFillEngine.ts:894](lib/alter-morning/gapFillEngine.ts:894) — travel 後 gap 拒否

#### C. 時刻割当・順序
- [lib/alter-morning/planningEngine.ts:361](lib/alter-morning/planningEngine.ts:361) — buildDayPlan 前処理で travel 除外
- [lib/alter-morning/planningEngine.ts:898](lib/alter-morning/planningEngine.ts:898)〜L911 — Phase 3 reassign で firstTravelIdx / lastTravelIdx 算定 + travel 再配置
- [lib/alter-morning/planningEngine.ts:1007](lib/alter-morning/planningEngine.ts:1007) / L1084〜L1100 — async 版の同等ロジック

#### D. クリ
- [lib/alter-morning/locationClarify.ts:41](lib/alter-morning/locationClarify.ts:41) — clarify 対象から travel 除外
- [lib/alter-morning/locationClarify.ts:145](lib/alter-morning/locationClarify.ts:145) — location 保持判定で travel 除外

#### E. 周辺提案
- [lib/alter-morning/proactiveSuggestions.ts:191](lib/alter-morning/proactiveSuggestions.ts:191) — `plan.items.filter(i => i.kind === "travel")` で travel 件数集計

#### F. UI 描画
- [components/home/morning/MorningPlanCard.tsx:107](components/home/morning/MorningPlanCard.tsx:107) — `item.kind === "travel"` → `"move"` セグメントタイプ
- [components/home/morning/MorningPlanCard.tsx:368](components/home/morning/MorningPlanCard.tsx:368) — travel 行のレンダリング分岐
- [components/home/morning/MorningPlanCard.tsx:778](components/home/morning/MorningPlanCard.tsx:778) — `prevPlan.items.find(i => i.kind === "travel")` で既存 travel 参照
- [components/home/morning/MorningPlanCard.tsx:944](components/home/morning/MorningPlanCard.tsx:944) — `filter((i) => i.kind === "travel")` で travel のみ別処理
- [components/home/morning/MorningPlanCard.tsx:1022-1023](components/home/morning/MorningPlanCard.tsx:1022) — travel は上下移動禁止

### 2.3 **Tests** — 参考

- `tests/unit/alter-morning/travelTimeEngine.test.ts` — 11 箇所
- `tests/unit/alter-morning/ceoScenario.test.ts` — 15 箇所
- `tests/unit/alter-morning/phaseC-integration.test.ts` — 9 箇所
- `tests/unit/alter-morning/travelTimeRoutes.test.ts` — 1 箇所
- `tests/unit/alter-morning/locationClarify.test.ts` / `gapFillMinimalPlan.test.ts` / `outfitInvalidation.test.ts` — 各 1-2 箇所

### 2.4 消費者パターン分類

| パターン | 箇所 | PR-10 で影響する？ |
|---------|------|------------------|
| 自己除外（再計算時 skip） | travelTimeEngine × 4 | 不変 — flag=OFF 時は現行ロジック維持 |
| 隣接判定（gap fill） | gapFillEngine × 6 | 不変 — render 層扱い |
| 時刻割当 | planningEngine × 6 | 不変 — render 層扱い |
| clarify 除外 | locationClarify × 2 | **重要** — transport は clarify 対象外原則と整合 |
| 件数集計 | proactiveSuggestions × 1 | 不変 |
| UI 描画 | MorningPlanCard × 5 | 不変 — render layer |

**結論**: `kind === "travel"` 消費点は **production で 21 箇所**、すべて render / display cache layer に属する。domain truth 層（PR-10 が導入する `TransportSegment[]`）は既存には存在しない。

---

## 3. 監査項目 #2: 既存 travel PlanItem schema field 凍結リスト

### 3.1 現行 travel PlanItem が持つ field

`lib/alter-morning/travelTimeEngine.ts:289-302` / `L328-341` より:

| field | 型 | travel での値 | 凍結判定 |
|-------|-----|------------|---------|
| `id` | string | `travel_<t36>_<r36>` | **凍結** — UI 既存 key 依存 |
| `kind` | PlanItemKind | `"travel"` | **凍結** — 新 kind 追加禁止（設計書 §1） |
| `text` | string | `"🚗 甲府駅→自宅"` 等 | **凍結** — UI render 直結 |
| `what` | string \| null | `null` | **凍結** |
| `durationMin` | number | 推定分 | **凍結** — planning 時刻割当依存 |
| `fixedStart` | boolean | `false` | **凍結** |
| `orderHint` | number | `0` | **凍結** |
| `sourceTurnIndex` | number | `0` | **凍結** |
| `completed` | boolean | `false` | **凍結** |
| `travelFrom` | string? | 出発地ラベル | **凍結** |
| `travelTo` | string? | 到着地ラベル | **凍結** |
| `travelTransport` | TransportMode? | mode | **凍結** |

### 3.2 travel が **持たない** field（暗黙の contract）

現 `insertTravelItems` は travel に以下を **書き込まない** — PR-10 でも維持:
- `startTime`（planning 側が後で割当）
- `location`
- `what` 系以外の slot
- `confirmationState` / sharpness 系
- `proposal` 系

### 3.3 凍結宣言

PR-10 は travel PlanItem **schema を変更しない**。追加 field 禁止。
- 追加すべき情報は `TransportSegment` canonical 側に持つ
- PlanItem travel は display cache として **byte-diff ゼロ**を保つ
- 既存 5 箇所の writer（travelTimeEngine 生成箇所 + MorningPlanCard 等 reader 5 箇所）のいずれも **shape 変更なし**で PR-10 merge 可能であることを Phase 1 で実証する

---

## 4. 監査項目 #3: `event.where.coordinates` → plan item 1 本線トレース

### 4.1 書き込み側（write path）

```
user clicks PlaceCandidatePicker
  ↓
POST /api/stargazer/alter/selection  [app/api/stargazer/alter/selection/route.ts]
  ↓
dialogReducer(SEARCH_CANDIDATE_SELECTED) — state advance
  ↓
applyPlaceSelection({ events, targetEventId, candidate })
  [lib/alter-morning/search/applyPlaceSelection.ts:39-66]
  ↓
  events[idx].where = {
    place_ref: candidate.displayName,
    placeType: "exact_proper_noun",
    coordinates: { lat, lng },           ← PR-9 ここで埋まる
    provenance: toolProvenance("high"),
  }
  events[idx].missing_semantic_critical = prev.filter(!"where")
  ↓
response.morningSession.persistedEvents = updatedEvents
  ↓
client: setMorningPersistedEvents(updatedEvents)
  [hooks/useAlterChat.ts:583-584]
```

### 4.2 読み取り側 — 現行 plan item 生成経路

**Path A: Comprehension-First v1.3+ Wave 3（現行 v2 ユーザー経路）**

```
POST /api/stargazer/alter  （次ターン）
  ↓
runMorningPipeline(..., priorEvents: bindResult.events)
  [app/api/stargazer/alter/route.ts:1820 周辺]
  ↓
adaptPipelineToLegacy(pipelineResult, { priorPersistedEvents })
  [lib/alter-morning/legacyAdapter.ts:429-499]
  ↓
effectiveEvents = pipelineResult.comprehension.events ?? priorPersistedEvents
  ↓
effectiveEvents.map((ev, idx) => eventToPlanItem(ev, idx))
  [lib/alter-morning/legacyAdapter.ts:103-154]
  ↓
PlanItem { id: event.event_id, kind: "fixed"|"todo", text, what, startTime,
           durationMin: 45, ..., whenSharpness, whereSharpness, whatSharpness,
           confirmationState }
  ↓
plan.items  （UI が render）
```

**Path B: Legacy Morning Protocol v2（processMorningMessage 経路、現 user 経路ではない）**

```
processMorningMessage → buildDayPlan / buildDayPlanAsync
  [lib/alter-morning/morningProtocol.ts:468-]
  ↓ 内部で
insertTravelItems / insertTravelItemsAsync
  [lib/alter-morning/planningEngine.ts:688 / L833]
  ↓
travel 含む PlanItem[]
```

### 4.3 重大ギャップ — 座標は plan item に届いていない

`eventToPlanItem`（Path A）は `event.where.place_ref` だけを読み、**`event.where.coordinates` を一切参照しない**。

```typescript
// lib/alter-morning/legacyAdapter.ts:103-154 抜粋
function eventToPlanItem(event: ComprehensionEvent, orderHint: number): PlanItem {
  const whereText = event.where.place_ref ?? "";   // ← 文字列のみ
  ...
  return { id, kind, text, what, startTime, durationMin, ..., whereSharpness };
  // coordinates フィールドは PlanItem に書かれない
}
```

**結果**: Path A 経路では座標は `persistedEvents[*].where.coordinates` には存在するが、**plan.items に吸い上げられない**。

### 4.4 PR-10 の候補設計点

| 案 | 内容 | 判定 |
|----|------|-----|
| α | `eventToPlanItem` に coordinates を写す | **否**（T1 違反の恐れ — PlanItem を domain truth 化する方向） |
| β | `TransportSegment[]` 側で `event.where.coordinates` を **直接参照**し PlanItem に依存しない | **採用候補**（Phase 1 で詳細化） |
| γ | coordsMap を selection 時に build し Path A へ注入 | 部分併用候補（既存 `insertTravelItemsAsync` との互換） |

Phase 1 Domain Model 設計で β を主に、γ の扱いを決める。

---

## 5. 監査項目 #4: event mutation → plan rebuild trigger の現存点と未接続経路（**F-New-1 最重要**）

### 5.1 現存する plan rebuild trigger

| Trigger | 場所 | 発火条件 | plan rebuild する？ |
|---------|------|---------|-------------------|
| **chat turn 完了** | `/api/stargazer/alter` POST 経由の `adaptPipelineToLegacy` | 毎ターンの pipeline 完了時 | **YES** — `effectiveEvents.map(eventToPlanItem)` で毎回再生成 |
| **selection 完了** | `/api/stargazer/alter/selection` POST 応答 | place 選択受理時 | **NO** — `morningSession.persistedEvents` のみ更新、plan は触らない |
| **client setState** | `hooks/useAlterChat.ts:583-584` | selection accept 後 | **NO** — `setMorningPersistedEvents` のみ、`setMorningPlan` は呼ばれない |
| **MorningPlanCard re-render** | React state 伝搬 | `morningPlan` 参照が変わった時 | plan が変わらなければ render 変化なし |
| **Legacy processMorningMessage 内 applyDelta** | `morningProtocol.ts:1758 周辺` | 旧 v2 edit 経路 | Path B のみ、現 user 経路ではない |

### 5.2 未接続経路（F-New-1 の本体）

**場面**: user が PlaceCandidatePicker で場所選択 → selection 200 受領直後

- **event 状態**: `persistedEvents[idx].where.coordinates` が新しい座標で fix された
- **plan 状態**: `morningPlan.items[idx]` は **coordinates を持たないまま**（eventToPlanItem が読まない）
- **UI 状態**: picker は消えるが、plan 行の場所表示は place_ref（文字列）のみ更新される可能性あり

**次ターン user message が来るまで**:
- plan.items は **rebuild されない**
- transport segment 計算の前提となる座標確定情報は plan 側に反映されない

### 5.3 F-New-1 判定

**F-New-1（place reselect 後の rebuild trigger の 1 本線確認）**:
- **現状**: selection 経路から plan rebuild trigger が **存在しない**
- **PR-10 着手前の設計課題**:
  1. selection 経路で plan rebuild を走らせるのか、走らせないのか（Phase 1 で決定）
  2. rebuild を走らせる場合、call 点は selection endpoint サーバ側 か client useAlterChat 側か
  3. rebuild は `TransportSegment[]` を含む canonical 生成を **1 回だけ** 走らせるべき（Invariant T2）
  4. 既存 chat turn の plan rebuild（Path A）とロジックを共有するか分離するか

**結論**: F-New-1 は **未接続経路あり** と判定。Phase 1 の主要論点として Phase 1 Domain Model / Phase 2 rebuild trigger 接続の両方で扱う必要がある。

### 5.4 Phase 1 に持ち込むべき問い

1. **Path A / Path B の統合方針**: `adaptPipelineToLegacy` 経路は `insertTravelItems` を通らない。PR-10 transport staircase は Path A にも supply されるのか？
2. **canonical builder の呼び出し点**: plan build / rebuild 完了時点で 1 回（Invariant T2）。具体的に Path A では `effectiveEvents.map(eventToPlanItem)` の直後か？
3. **selection 経路の rebuild 要否**: selection endpoint で canonical segment と plan.items を連動 rebuild するか、次ターンの chat rebuild に任せるか（UX ラグの許容度含む）
4. **coordsMap の扱い**: `insertTravelItemsAsync` が既に `coordsMap` を期待する。Path A で coordsMap を build する層が現状ない

---

## 6. Phase 0 Audit サマリ

| 項目 | 結果 |
|-----|------|
| #1 `kind === "travel"` 消費点 | production 21 箇所（writer 4 / reader 17）、すべて render / display cache 層 |
| #2 travel PlanItem schema | 12 field 確定、**凍結** 宣言。PR-10 で field 追加禁止 |
| #3 coordinates → plan item 1 本線 | write path: selection endpoint → applyPlaceSelection → persistedEvents<br>read path: **eventToPlanItem が coordinates を読まない gap あり** |
| #4 F-New-1 | **未接続経路あり**。selection → plan rebuild trigger は現状存在しない |

### Phase 1 への引き渡し事項

- Path A（comprehension-first）と Path B（legacy processMorningMessage）の分岐を踏まえて `TransportSegment[]` canonical の供給点を 1 本化する方針を立てる
- F-New-1 の rebuild trigger を (a) selection サーバ側で自動 rebuild / (b) 次ターン chat まで遅延 / (c) client side で局所 rebuild のどれに倒すか CEO 判断を取る
- Invariant T2 修正文言に従い、builder 呼び出し点を **plan build/rebuild 1 点**に集約する具体的な API surface を設計する
- flag=OFF で byte-diff ゼロを維持するための最上流 gate 位置を確定する

### コード変更

本 audit では **ゼロ**。本メモが唯一の成果物。Phase 1 Domain Model 設計着手は CEO 再承認後。

---

## 7. 参照

- [docs/alter-morning-roadmap.md](docs/alter-morning-roadmap.md) — §4.5.5 slot 解決方式分離原則
- [docs/alter-morning-pr10-14-interface-reservation.md](docs/alter-morning-pr10-14-interface-reservation.md) — §1 TransportSegment 型予約
- [lib/alter-morning/transport/types.ts](lib/alter-morning/transport/types.ts) — TransportMode / TransportSegment（型のみ、関数追加禁止）
- [docs/alter-morning-pr9-places-search-design.md](docs/alter-morning-pr9-places-search-design.md) — PR-9 selection endpoint / applyPlaceSelection 設計
