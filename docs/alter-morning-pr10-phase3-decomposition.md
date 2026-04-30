# W3-PR-10 Phase 3 分解監査メモ

**作成日**: 2026-04-23
**作成者**: Build Unit
**承認**: CEO 判断待ち（本メモは実装前の設計監査、コード変更なし）
**前提**: `origin/main` HEAD = `7ffad3e1`（Phase 2 merge PR #21 landing 済）

---

## 0. なぜこの監査が必要か

Phase 1（canonical `TransportSegment[]`）と Phase 2（Path A `PlanItem(kind="travel")` display cache）が landing した。表向きは「次は map / timeline / Routes API」だが、着手前に **すでに積まれている暗黙の二重化リスク** を洗う必要がある。

CEO の指摘通り、source of truth が再び揺れる構造を抱えた状態で Phase 3 を重ねると、Phase 4 以降で戻れなくなる。したがって本メモは **「次に何を作るか」ではなく「次に何を固めるか」** を決める。

---

## 1. Path B / persisted travel 監査

### 1.1 Path B travel 生成経路（evidence-based）

`processMorningMessage` → `buildV2DayPlan` / `buildV2DayPlanAsync` → `buildDayPlan` / `buildDayPlanAsync` → **`insertTravelItems` / `insertTravelItemsAsync`**

- 定義: [lib/alter-morning/travelTimeEngine.ts:244](lib/alter-morning/travelTimeEngine.ts:244)
- id 形式: `travel_<Date.now().toString(36)>_<Math.random().toString(36).slice(2,6)>`
  - **single underscore prefix** (`travel_`)
  - ランダム、非決定論、セッションごとに変わる
- canonical `TransportSegment[]` は **返さない**（Path B は segment 無知）

### 1.2 Path A travel 生成経路（Phase 2）

`synthesizeTravelItems` → `interleaveTravelItems` in [lib/alter-morning/planning/synthesizeTravelItems.ts](lib/alter-morning/planning/synthesizeTravelItems.ts)

- id 形式: `travel__<fromEventId>__<toEventId>` (**double underscore**)
- 決定論・event_id 派生
- canonical segments を返す

### 1.3 Path B 側の travel 粛清ロジック（重要）

[lib/alter-morning/planningEngine.ts:662](lib/alter-morning/planningEngine.ts:662):
```ts
const nonTravel = items.filter(i => i.kind !== "travel");
```

**Path B が走ると、prefix に関係なく全ての travel item を strip して Path B 由来 travel を再生成する**。

帰結:
- Path A → Path B 遷移: `travel__` items は silent discard、`travel_` に置換される
- Path B → Path A 遷移: selection route の rebuild で `travel_` は落ちる（builder が event-only items を返し、そこに `travel__` のみ interleave）

**これは一見「landmine」だが、実は cleanly-separating な filter である。**
両 prefix の items が同じ `plan.items[]` に「永続的に」共存する状態は、現在の実装では発生しない（どちらかの path が走った瞬間に片方が蒸発する）。

### 1.4 persisted 経路

- サーバー側 Supabase への session persistence は **未実装**（監査で確認）
- plan は **client-authoritative**: client が毎ターン `morningSession` を request body で送る、server は response body で返す
- `plan.items[]`（`travel__` 含む）は HTTP roundtrip で survive する
- `plan.transportSegments` も同様に survive する（optional field）
- **client refresh = server state 消失**（client localStorage のみが頼り）

### 1.5 共存シナリオでの重複・衝突・表示ズレ

| シナリオ | 結果 | 評価 |
|---|---|---|
| Path A のみで完結（新規 session、flag ON） | `travel__` items + `transportSegments` | ✅ 正常 |
| Path A → selection（再 rebuild） | `travel__` 再生成（同じ id）+ `transportSegments` 再生成 | ✅ 正常 |
| Path A で plan 生成 → chat route で plan_presented 継続 | **Path B が走り `travel__` strip → `travel_` に置換** | ⚠️ Phase 2 の意図を破る |
| Path A で plan 生成 → client drag / 時間編集 | **Client `regenerateTravel` が Path B 経由で `travel_` に置換** | ⚠️ Phase 2 の意図を破る |

**結論**: 表面的な id 衝突や表示ズレは起きない（filter が clean）。しかし **Path A の成果物は極めて壊れやすい**。chat turn 1 回、もしくは client drag 1 回で Phase 2 の display cache は完全に消える。

---

## 2. Consumer 前提監査

### 2.1 現状の `plan.items[]` travel consumer

| Component | File:Line | 読む field | `durationMin=0` 許容 | `travelTransport=undefined` 許容 |
|---|---|---|---|---|
| MorningPlanCard travel row | [components/home/morning/MorningPlanCard.tsx:368](components/home/morning/MorningPlanCard.tsx:368) | `kind`/`startTime`/`travelTransport`/`durationMin`/`text` | **"0 分" として表示**（misleading） | ✅ Route icon fallback |
| MorningPlanCard 合計 | [components/home/morning/MorningPlanCard.tsx:942](components/home/morning/MorningPlanCard.tsx:942) | `kind`/`durationMin` | ✅（加算に 0 が混ざる） | N/A |
| MorningPlanCard regenerate | [components/home/morning/MorningPlanCard.tsx:776](components/home/morning/MorningPlanCard.tsx:776) | `kind`/`travelTransport` | N/A | ✅ "car" fallback |
| PlanOutfitViewer | [components/home/morning/PlanOutfitViewer.tsx:175](components/home/morning/PlanOutfitViewer.tsx:175) | `startTime`/`text`/`durationMin` | ✅ | N/A |
| MorningOutfitCard | [components/home/morning/MorningOutfitCard.tsx:352](components/home/morning/MorningOutfitCard.tsx:352) | `eventType` で travel filter out | ✅ | N/A |

### 2.2 現状の `plan.transportSegments` consumer

**ZERO**。

grep 結果:
- `legacyAdapter.ts` / `selection/route.ts` → 書く側（Path A）
- `synthesizeTravelItems.ts` → 書く側
- UI / timeline / map / client hook → **読む側ゼロ**

canonical truth が write-only。Phase 3 で map / timeline を作るなら、それが **初の consumer** になる。

### 2.3 Map / timeline UI に必要な field の揃い具合

| 必要 field | `TransportSegment` | `PlanItem(travel)` | 埋まっているか |
|---|---|---|---|
| 両端座標（lat/lng） | ❌ 持っていない（events から引く） | ❌ 持っていない | **map には event 側の `where.coordinates` と cross-ref 必須** |
| fromEventId / toEventId | ✅ | ❌（id 文字列内に混入のみ） | segments を読む前提なら OK |
| 距離 | ✅ `distanceM` (現状 null) | ❌ | Phase 3 Routes API で埋める |
| duration | ✅ `estimatedDurationMin` (現状 null) | ✅ `durationMin` (現状 0) | Phase 3 Routes API で埋める |
| mode | ✅ | ✅ | OK |
| confidence / source | ✅ | ❌ | UI で「推定」「確定」を出したいなら segments から読む |
| label（地名） | ❌ | ✅ `travelFrom/travelTo` | items 経由のほうが楽、ただし events から派生可能 |
| startTime | N/A | ❌ 未設定（interleave 後に planner が埋める想定だが現状まだ） | Phase 3 UI で課題 |

### 2.4 Failure mode（UI が壊れる条件）

| Failure | Trigger | 現在の挙動 | Severity |
|---|---|---|---|
| "0 分" 表示 | `durationMin=0`（Phase 2 現状ほぼ全件） | `formatDuration(0) → "0分"` | **MEDIUM** — flag ON で即発生するユーザー可視 bug |
| 片側 coords 欠落 → segment なし | event.where.coordinates = null | travel item 未生成、event 連続表示（説明なし） | MEDIUM — silent info loss |
| travelFrom/travelTo 空文字 | event.where.place_ref = null | `"🚃 →"` になる | MEDIUM — 文字列生成の防御不足 |
| `travelTransport="train"` (`public_transit` マップ先) | 正常 mapping | TrainFront icon | ✅ OK |
| `travelTransport="unknown"` | segment.mode=unknown のまま | Route icon fallback | ✅ OK |

---

## 3. Phase 3 候補 5 軸の分解

### 軸 A: Path B / persisted travel 統合

- **本質**: `processMorningMessage` 経路（plan_presented / clarifying 継続ターン）で canonical segments を生成・保持する。`travel_` prefix を根絶するか、Path A/B の id 空間を統一する。client `regenerateTravel` を Path A 側に寄せる。
- **依存関係**: Phase 1/2 が必要条件。duration 強化（軸 B）・mode 推定（軸 C）は不要。
- **先にやるべきか**: **YES（論理的にここが最上流）**。これをやらないと flag ON にできない（1 turn / 1 drag で Phase 2 が蒸発）。Phase 3 以降全ての work が Path A 側に依存していくため、Path B が並走している現状は時限爆弾。
- **危険な混ぜ方**:
  - `processMorningMessage` そのものを潰して Path A に統合する大改修に膨らませる（PR が巨大化、rollback 不能）
  - client `regenerateTravel` を潰して Path B の `insertTravelItems` を **client で禁止** するだけでは壊れる（segments が無い session で travel が消える）
  - Path B と Path A の id 空間統一を id migration 込みで一気にやる（既存 localStorage session 破壊）
- **最小 landing**:
  - client `regenerateTravel` を「`plan.transportSegments` があれば `interleaveTravelItems` で再生成、無ければ従来通り `insertTravelItems`」に切り替える
  - サーバー側（`processMorningMessage`）は **触らない**
  - id 空間はそのまま（`travel__` は Path A、`travel_` は Path B、共存は filter で清算される現行 invariant を維持）
  - 1 component のみ変更、50-100 行、テスト可能

### 軸 B: duration / source 強化

- **本質**: canonical `TransportSegment.estimatedDurationMin` / `.distanceM` を Routes API で埋める。`PlanItem.durationSource` を `"routes_api" | "inferred" | "user_override" | "default"` に分類。
- **依存関係**: Routes API module（Path B の `insertTravelItemsAsync` に既存、lib/alter-morning 下に transport v2 用の async wrapper 新設要）。canonical segment shape（Phase 1 で定義済）。
- **先にやるべきか**: 中優先。flag OFF のままなら急がない。flag ON にした瞬間に「0 分」表示が即発生するため、**flag ON の前には必須**。ただし軸 A の方が上流（A が無いと B の成果も 1 drag で消える）。
- **危険な混ぜ方**:
  - Routes API の呼び出しを pure function に混入（Phase 1 T2 原則違反）
  - Routes API 失敗時の fallback を "0 分" のままにする（UX 悪化の増幅）
  - per-segment cache を server / client 両方に持つ（source of truth 再二重化）
- **最小 landing**:
  - `lib/alter-morning/transport/resolveDurations.ts`（新規 async wrapper）で segments[] を受け取り、Routes API で durations を埋めた segments[] を返す pure-ish fn
  - Path A の selection rebuild / legacyAdapter で await して segments を enrich
  - `durationSource` 追加は別 PR（本筋は Routes API 接続のみ）

### 軸 C: mode 推定エンジン

- **本質**: `segment.mode` を「距離 + 時間 + user history」から決定する層を設ける。現状は segment.mode が直通、Phase 2 で `unknown → car` fallback。
- **依存関係**: 軸 B（距離が無いと推定できない）。
- **先にやるべきか**: **NO（最下位）**。`unknown → car` fallback は UX 的に許容範囲。Stargazer 統合を混ぜると検証不能になる。
- **危険な混ぜ方**:
  - Stargazer / Relational 由来の user preference を pre-MVP で混入（検証コスト爆発）
  - user override（軸 D）と同時着手
- **最小 landing**: 決定論ルール（walk < 2km、train/car > 2km、時間帯で bus）のみ。ML なし。本 Phase 3 スコープからは除外推奨。

### 軸 D: per-segment override / UI 連動

- **本質**: user が特定の segment の mode / duration を上書きできる UI + server-side override 反映経路。
- **依存関係**: UI consumer（軸 E 側）、軸 A / B（override 対象が壊れない前提）。
- **先にやるべきか**: **NO**。見えないものを override できないので、map/timeline UI より後。
- **危険な混ぜ方**:
  - override を client state にのみ持つ（サーバー rebuild で蒸発）
  - override を canonical `TransportSegment` に上書きする（source / confidence が壊れる、"user_override" layer を別に持つべき）
- **最小 landing**: 本 Phase 3 スコープでは **着手しない**。override 層の型予約だけ後日。

### 軸 E: parser 拡張

- **本質**: L1 pipeline が utterance から transport hint（「電車で」「歩いて」「タクシーで」）を抽出し、`Event.transport` 経由で `TransportSegment.mode` に反映。
- **依存関係**: L1 comprehension pipeline（既存）。canonical segment shape（既存）。
- **先にやるべきか**: **低優先**。軸 B（duration 強化）の精度向上には貢献するが、本質ではない。
- **危険な混ぜ方**:
  - LLM に mode 推定も兼ねさせる（幻覚リスク、決定論性損失）
  - 曖昧な utterance（「まあなんか移動する」）から mode を推測する
- **最小 landing**: 決定論 keyword matcher（`電車/歩/徒歩/タクシー/車/自転車`）を pre-classifier として追加、LLM に渡す前に hint 確定。本 Phase 3 スコープからは除外推奨（orthogonal）。

---

## 4. 優先順位の結論

### 4.1 最上流から見た依存グラフ

```
                   [flag ON 安全化]  ← 本質的なゴール
                         │
            ┌────────────┼─────────────┐
            │            │             │
     [A] Path B/regen  [B] duration  [UI consumer]
     統合              強化            (map/timeline)
            │            │             │
            │            └── Routes API └── segments を読む contract
            │
     [E] parser     ←── orthogonal、後続
     [C] mode 推定  ←── [B] に依存、後続
     [D] override   ←── [UI] に依存、後続
```

### 4.2 次にやるべき 1 本: **軸 A「Path B / client regenerate 限定統合」の最小版**

**具体的スコープ**:
1. Client `regenerateTravel`（[MorningPlanCard.tsx:776](components/home/morning/MorningPlanCard.tsx:776)）を Path A 対応に切り替える
   - if `plan.transportSegments` present → `interleaveTravelItems(nonTravel, synthesizeTravelItems(segments, events))` を使う
   - else → 従来通り `insertTravelItems`（Path B 互換、flag OFF 経路）
2. client 側が `persistedEvents` を保持しているか確認、保持していなければ props で渡す導線を足す（必要な最小限のみ）
3. テスト: client regenerate 後に travel id prefix が `travel__` のまま保持されることを unit で確認

**スコープ外（明示的に）**:
- サーバー側 `processMorningMessage` は触らない
- chat route で Path A 側に寄せる改修はしない（別 PR、軸 A の第 2 段）
- Routes API 統合はしない（軸 B）
- map / timeline UI はしない
- id 空間統一（`travel_` → `travel__` への migration）はしない

### 4.3 なぜこれが最優先か

1. **Phase 2 の壊れやすさが最大の現存リスク**。flag ON にした瞬間、user drag 1 回で Phase 2 の成果物は蒸発する（`regenerateTravel` が Path B 経由で `travel_` に置換）。これを塞がない限り、Phase 2 は "dormant 状態のまま landing" した美しい canonical で、production 価値はゼロに近い。
2. **source of truth 再二重化の最大震源**。サーバーが Path A、クライアントが Path B という構造は、ちょうど CEO が警戒している「source of truth が揺れる」パターンそのもの。duration / Routes API / UI 何を上に積んでも、この根元が治らない限り drift し続ける。
3. **scope が最小**。1 component、1 関数、50-100 行。server-side 変更ゼロ、API 契約変更ゼロ、migration なし。rollback も reviewer judgment も軽い。
4. **他 4 軸の前提条件を作る**。
   - 軸 B（duration）: client regenerate が canonical 対応してから Routes API を繋ぐべき。でなければ「サーバーで Routes API 実測 → user drag で heuristic 0 分に戻る」という恥ずかしい挙動。
   - UI consumer: UI が canonical を信じる前提には、client mutation が canonical を壊さない保証が要る。
   - 軸 D（override）: override 層を client に持たせる設計議論以前に、client が canonical と合意しているかが前提。

### 4.4 なぜ他の 4 本は今ではないか

- **軸 B（duration 強化）**: 実効性は高いが、軸 A なしにやると user drag で `travel__` が消える。Routes API で埋めた durations が消えるのは滑稽。軸 A 直後に回す。
- **軸 C（mode 推定）**: 軸 B に依存（距離が要る）。現状の `unknown → car` fallback は許容範囲。後続。
- **軸 D（per-segment override）**: UI consumer に依存。見えないものを override できない。後続。
- **軸 E（parser 拡張）**: orthogonal。L1 prompt tuning で代替可能。後続の小 PR で済む。

### 4.5 1 PR に閉じるならどこまで入れてよいか

**入れてよい**:
- `MorningPlanCard.regenerateTravel` の分岐追加（canonical / heuristic）
- 新 props（`transportSegments`, `persistedEvents`）の受け渡し
- unit test（canonical 経路 / fallback 経路）

**入れない**:
- server 側コード変更
- `processMorningMessage` への手入れ
- Routes API 接続
- 新 UI component
- id 空間 migration
- flag defaults 変更

**1 PR の成功条件**:
- flag OFF: 挙動完全不変（byte-diff zero 相当、既存テスト緑）
- flag ON + segments present + user drag: `travel__` 維持、Path B 経路に落ちない
- flag ON + segments absent: 従来 `insertTravelItems` fallback（回帰なし）

---

## 5. 追加観察（本 PR スコープ外だが記録）

1. **`ALTER_MORNING_V2_ROUTE_ENABLED` と `ALTER_MORNING_TRANSPORT_V2` の 2 flag 関係**: 前者が OFF だと chat 経路で Path B が走り、後者を ON にしても plan_presented 継続ターンでは segments が生成されない。将来 flag を ON する際は **両方 ON が前提**。この関係を `docs/alter-morning-flag-matrix.md`（新規）で固定しておくべき。
2. **`durationMin=0` の UI 表示 "0 分"**: 軸 B まで待つと長いので、軸 A と同 PR で `formatDuration(0)` のみ「未確定」相当の表示に切り替える小改修もあり得る。ただし scope crept の誘因、別 PR 推奨。
3. **`travelFrom/travelTo` 空文字**: `event.where.place_ref = null` のときに `"🚃 →"` になる。軸 A スコープ外だが、軸 E（parser）もしくは legacyAdapter 側で防御すべき。
4. **server-side session persistence 未実装**: 本 Phase 3 内では解決しない。beta ユーザー数が増える前の Phase 5-ish で検討。

---

## 推奨する次の 1 本

> **「Client `regenerateTravel` の canonical 対応 — Path A segments があれば `interleaveTravelItems` で再生成、なければ従来 `insertTravelItems` fallback」**
>
> 1 component、scope 最小、server 非接触、Phase 2 成果物の壊れやすさを根元から塞ぐ。
> 本 PR が landing してはじめて `ALTER_MORNING_TRANSPORT_V2=true` を production で検討できる。
> 他 4 軸はすべてこの後。
