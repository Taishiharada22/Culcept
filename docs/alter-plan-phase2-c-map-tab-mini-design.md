# Alter Plan Phase 2-C — MapTab「自分の地理」 Mini Design

**作成日**: 2026-05-20
**Status**: 採択待ち (CEO 承認後、実装 wave に進む)
**branch**: `docs/alter-plan-phase2-c-map-tab-mini-design` (Phase 2-B impl branch の上に stack、GitHub suspension 中の local-first 運用)
**実装範囲**: 本 PR は **docs only**。実装は CEO 承認後の別 PR (stacked branch、推定 1 PR / 3 commits)

**前提**:
  - Phase 1 完全 PASS (PR #219 + W1-Z apply 済)
  - **Phase 2-A 実装完了** (`feat/alter-plan-phase2-a-calendar-week-strip`、5 commits、CEO local smoke PASS、6e37ad38 で凍結)
  - **Phase 2-B 実装完了** (`feat/alter-plan-phase2-b-flow-list`、3 commits、CEO local smoke PASS、99e7c02a で凍結)
  - 本 branch は Phase 2-B impl branch の上に stack (CEO 補正)、Phase 2-A / Phase 2-B branch とは完全分離

**関連**:
  - `docs/alter-plan-phase2-a-calendar-month-view-mini-design.md` (Phase 2-A mini design、CalendarTab refactor の前例)
  - `docs/alter-plan-phase2-b-flow-list-mini-design.md` (Phase 2-B mini design、FlowTab refactor + CEO 補正 1-3 + Beyond 改善の前例)
  - `app/(culcept)/plan/tabs/MapTab.tsx` (本命修正対象、現 194 行)
  - `app/(culcept)/plan/tabs/_helpers.ts` (helper、本 wave で軽量拡張)
  - `lib/plan/external-anchor.ts` (ExternalAnchor 型、lat/lng なし)
  - `components/home/morning/MorningMapView.tsx` (Alter Morning の Google Maps script-injection 前例、PR #31 で `@vis.gl/react-google-maps` reject、本 wave では参照のみ)
  - `lib/alter-morning/routesApiClient.ts` (Google Maps API key 利用箇所、本 wave で touch なし)
  - CEO 方針: 「地図アプリではなく自分の地理」「pins は単なる場所ではなく生活の意味を持つ点」

---

## 0. ゴール (CEO 方針由来)

### 0.1 CEO 方針の本質

> Phase 2-C は「地図アプリ」ではなく「自分の地理」。
> pin は単なる場所ではなく、生活の意味を持つ点として扱う。
> category / locationCategory / anchor を活かす。
> 最初から完璧な Google Maps 統合に飛ばず、最小安全設計を出す。

これは Aneurasync 哲学の自然な延長:

- **「この機能は、ユーザーの第二の自己として必要か?」**
  - Google 級の正確な GPS マップは「第二の自己」ではない (どのマップアプリでも提供される)
  - 「ここは私が労働する場所」「ここは私が一息つく場所」という **意味の地理** は第二の自己でしか提示できない
- **「自分って、そういう人間だったのか」 体験**
  - 「私は週 5 回ここに行く」「私の "聖域" は実はここ」が見える
  - GPS 座標ではなく、**category × frequency × time-signature** の組み合わせで現れる
- **Heart Dynamics Model 整合 (memory: `heart-dynamics-model-v1.md`)**
  - 時間構造 (気候 + 季節 + 天気) と並ぶ「**空間構造**」: 領土 (全カテゴリ) + 街 (頻訪先) + 部屋 (今日の場)
  - 場所もまた generative space (= 将来 ALTER が「ここで何する?」を提案する起点)

### 0.2 Phase 2-C v1 の goal (実装する範囲)

| 達成 | 詳細 |
|------|------|
| **MapTab を「カテゴリ別の場所リスト」 から「自分の地理」 view へ昇格** | 現 MapTab は機能としては正しいが、視覚 / voice / 哲学的整合が薄い。Phase 2-C v1 で richer な category grid + Aneurasync 独自 voice + 静的 ALTER 提案 placeholder を載せる |
| **既存 ExternalAnchor + locationCategory + helper を 100% 流用** | migration 0、新 field 0、API key 0、env 変更 0 |
| **Google Maps は使わない** (CEO 方針 + 技術現実) | ExternalAnchor に lat/lng がなく、地図描画する素材がない。地図 API を導入しても「自分の地理」 体験は出ない。実 map は将来 wave (lat/lng + reverse-geocoding 設計後) |
| **CalendarTab / FlowTab との役割分離** | 時間軸 (Calendar = 月、Flow = 7 日) ≠ 空間軸 (Map = カテゴリ別)。同じ anchor を 3 つの視点で見る価値を強化 |
| **完全 local-first 実装可能** | Phase 2-A / Phase 2-B と同様に GitHub 復旧待ちの間に C1-C3 を local commit のみで完了できる |

### 0.3 Phase 2-C で **やらないこと** (CEO 制約、本 wave スコープ外)

- ❌ **Google Maps integration** (PR #31 reject 前例 + ExternalAnchor 座標なし + Aneurasync 哲学逸脱)
- ❌ **ExternalAnchor 型に lat / lng / geo_point field 追加** (migration、別 wave)
- ❌ **locationText → coordinates の reverse geocoding service** (別 wave、需要発生時)
- ❌ **API key (NEXT_PUBLIC_*MAPS*) の Plan 用追加 / 流用** (CEO 確認に戻る)
- ❌ **env 変数追加 / 修正** (Production / Preview / Development いずれも)
- ❌ **Production / all-Preview env 変更**
- ❌ **service_role / DB password / connection string 使用**
- ❌ **migration 追加**
- ❌ **CoAlter / Mirror / /talk / D-* / W1-6 / DraftPlan / fallback path 関連**
- ❌ **Phase 2-A / Phase 2-B branch への追加 commit** (本 PR は別 branch)
- ❌ **Phase 2-A の CalendarTab / Phase 2-B の FlowTab の改修**
- ❌ **HomeSwipeContainer / PlanClient / Modal logic 変更** (CalendarTab / FlowTab refactor と同 pattern、touch なし)
- ❌ **Phase 3 ALTER 提案 flow 動作実装** (本 wave は静的 placeholder のみ)
- ❌ **real-time location tracking** / ユーザーの GPS 取得 (locationOptIn は別 feature)
- ❌ **長押し quick action menu** (Phase 2-C+ 預け、Phase 2-B と同 defer)

---

## 1. 現在の MapTab 構造 (read-only audit)

### 1.1 ファイル

| layer | path | 役割 |
|-------|------|------|
| component | `app/(culcept)/plan/tabs/MapTab.tsx` (194 行) | 地理レンズ (自分の聖地マップ)、locationCategory 別 anchor group view |
| helper | `app/(culcept)/plan/tabs/_helpers.ts` | `groupAnchorsByLocation` / `CATEGORY_META` / `SENSITIVE_LABEL` / `LOCATION_GROUP_ORDER` / `countOccurrences` 等を再利用 |
| parent | `PlanClient.tsx` | data fetch、Modal 制御、`onAddRequest` / `onAnchorClick` callback |

### 1.2 現状の表示構造 (W1-5 + W1-X3)

```
<MapTab>
  ├ header: "あなたの聖地マップ" + "今後 N 日間で訪れる場所"
  ├ Empty 状態: GlassCard "今後 N 日間に予定された場所がありません"
  └ ul (category groups):
      ├ group card per category (LOCATION_GROUP_ORDER 順):
      │   ├ header: emoji + label + hint + "N 日で X 回" badge
      │   ├ anchor list (sorted by count desc):
      │   │   ├ anchor row: title + ×count + locationText? + sensitive badge?
      │   │   └ ...
      │   └ W1-X3: "+ <カテゴリ>での予定を教える" button
      │     (locationCategory のみ pre-fill、locationText 自動入力なし、CEO 補正 3)
      └ ...
</MapTab>
```

### 1.3 重要な既存資産 (本 wave で 100% 再利用、touch なし)

- `groupAnchorsByLocation(anchors, start, end): CategoryGroup[]` — category 別の集計 (count 降順、title asc tie-break)
- `LOCATION_GROUP_ORDER`: `["home", "office", "school", "cafe", "public", "outdoor", "transit", "unknown", "none"]` — 表示順
- `categoryOf(anchor)`: locationCategory → LocationGroupKey (locationCategory なし / locationText あり = "unknown"、なし = "none")
- `CATEGORY_META`: 9 カテゴリ × { label, emoji, hint } の意味の地理データ
- `SENSITIVE_LABEL`: AnchorSensitiveCategory → 日本語 label
- `countOccurrences(anchor, start, end)`: recurring 展開 + exception_dates + validity の出現数カウント
- props signature: `anchors / now? / windowDays? / onAddRequest? / onAnchorClick?` (Phase 2-A の CalendarTab / Phase 2-B の FlowTab と共通)

### 1.4 CATEGORY_META = 「意味の地理」 のソース of truth

```ts
// _helpers.ts
CATEGORY_META = {
  home:    { label: "家",      emoji: "🏠", hint: "自分の聖域" },
  office:  { label: "職場",    emoji: "🏢", hint: "労働の場" },
  school:  { label: "学校",    emoji: "🎓", hint: "学びの場" },
  cafe:    { label: "カフェ",  emoji: "☕", hint: "ひと息の場" },
  outdoor: { label: "屋外",    emoji: "🌿", hint: "外の空気" },
  public:  { label: "公共",    emoji: "🏛️", hint: "市民の場" },
  transit: { label: "移動",    emoji: "🚃", hint: "通り道" },
  unknown: { label: "未分類",  emoji: "📍", hint: "場所カテゴリ未設定" },
  none:    { label: "場所なし", emoji: "·", hint: "場所が指定されていない予定" },
}
```

**重要**: `hint` は単なる説明ではなく **Aneurasync voice** (「自分の聖域」「ひと息の場」 等)。Phase 2-C v1 で **voice を card に visible 表示** することで「意味の地理」を視覚化する。

### 1.5 ExternalAnchor 型 (geo coordinate field の現状)

```ts
// lib/plan/external-anchor.ts (確認済)
interface ExternalAnchorBase {
  id, userId, title, startTime, endTime?,
  locationText?,            // 自由 string ("スターバックス 代官山店")
  locationCategory?,        // enum (home/office/school/cafe/outdoor/public/transit/unknown)
  rigidity, sourceId, confirmedAt, confidence?, sensitiveCategory?
}
```

→ **`latitude` / `longitude` / `geo_point` field なし**。本 wave で migration 追加もしない (CEO 制約)。
→ Google Maps を描画する素材がない → 地図 API 不採用が技術的に確定。

### 1.6 周辺の Google Maps 利用状況 (本 wave で不可触)

| ファイル | 用途 | 本 wave 取り扱い |
|---------|------|------|
| `lib/alter-morning/routesApiClient.ts` | Alter Morning の Routes API (`GOOGLE_MAPS_API_KEY` server-side) | 不可触 |
| `components/home/morning/MorningMapView.tsx` | Alter Morning の Map View (`NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` browser-side、script injection) | **参照のみ** (script load fail-safe / pin-only / fitBounds pattern が将来 real-map 時の reference) |
| `@vis.gl/react-google-maps` (PR #31 で reject) | React wrapper | **使わない** (Vercel build 45:22 timeout 前例) |

→ Phase 2-C v1 で **これらの env / key / dependency を一切参照しない** (CEO 制約)。

---

## 2. CEO mock との差分

### 2.1 想定 mock (具体 mock 不在の場合の汎用ターゲット)

CEO mock の具体スクショ (MapTab specific) は不在のため、CEO 方針 + Aneurasync 哲学 + Phase 2-A/2-B との一貫性から逆算した完成形を仮定:

```
あなたの地理 (or 自分の地理 / 生活が起こる場所 — CEO 判断)
今後 14 日間で訪れる場所

┌──────────────────┐  ┌──────────────────┐
│ 🏠 (large)        │  │ 🏢 (large)        │
│ 家                │  │ 職場              │
│ 自分の聖域          │  │ 労働の場          │
│ 週 7 回 · 朝晩中心   │  │ 週 5 回 · 9-18 中心 │
│ ───────────       │  │ ───────────       │
│ 朝食 × 7           │  │ 定例会議 × 3       │
│ 夕食 × 6           │  │ 個人作業 × 5       │
│ + ここでの予定を教える│  │ + ここでの予定を教える│
└──────────────────┘  └──────────────────┘
┌──────────────────┐  ┌──────────────────┐
│ ☕ (large)        │  │ 🎓 (large)        │
│ カフェ             │  │ 学校              │
│ ひと息の場          │  │ 学びの場 (今は静か) │
│ 週 2 回 · 午後中心   │  │ ―                 │
│ ───────────       │  │                   │
│ 読書 × 2           │  │                   │
│ + ここでの予定を教える│  │ + ここでの予定を教える│
└──────────────────┘  └──────────────────┘
... (outdoor / public / transit / unknown / none)

┌──────────────────────────────────────┐
│ 静的 ALTER 提案 card (CEO 補正 #2 整合)│
│ "ALTER があなたの地理を読みに..."       │
│ (Phase 3 で動作予定)                  │
└──────────────────────────────────────┘

                                      [+]
                                     FAB
```

### 2.2 現 MapTab との差分 (Phase 2-C v1 で追加するもの)

| 項目 | 現 MapTab (W1-5 + W1-X3) | Phase 2-C v1 (CEO mock 整合) | 差分種別 |
|------|---------------------------|------------------------------|----------|
| **layout** | 縦 1 列 list、各 group が 1 card | **2 列 grid** (mobile responsive、wider では 2-3 列) | 構造変更 |
| **card visual** | header (emoji + label + count badge) + anchor list + add link | **emoji を text-4xl 大型化** + **hint を visible voice 表示** + 頻度/時間 signature + 充実した anchor list | 視覚強化 |
| **frequency 表現** | "N 日で X 回" (literal) | **"週 N 回" / "月 N 回" 自然語** (Aneurasync voice) | 表現変更 |
| **time signature** | (なし) | **"朝晩中心" / "9-18 中心" / "午後中心"** (anchors の startTime 集計) | 新規 |
| **empty category 表現** | 非表示 (`totalCount=0` の group は filter) | **静かなトーンで表示** (`(今は静か)` voice、Aneurasync "未来 = generative space" 哲学整合、Phase 2-B §11.10 と同) | 構造変更 |
| **静的 ALTER 提案 card** | (なし) | **末尾に static placeholder** (Phase 2-B §3.4 と同 pattern、ボタン風禁止、CEO 補正 #2 整合) | 新規 |
| **FAB** | (なし、per-category add のみ) | **global FAB** (Phase 2-A / 2-B 同視覚) + **per-category add 維持** | 新規 (per-category と共存) |
| **header copy** | "あなたの聖地マップ" + "今後 N 日間で訪れる場所" | **"あなたの地理" or 候補から CEO 判断**, sub copy 同 | 用語確認 |
| **sensitive privacy** | anchor row に `<GlassBadge>{sensitive}</GlassBadge>` 表示 | **`🔒 ⟨敏感⟩ 〇〇` 形式 + 同 badge 維持** (Phase 2-B AnchorThumbnail の sensitive ロジックと整合) | 整合 |

---

## 3. MapTab 完成形 (Phase 2-C v1)

### 3.1 全体構造

```tsx
<MapTab>
  ├ <header>
  │   ├ <h2>あなたの地理</h2>  (or CEO 判断による header copy)
  │   └ <p>今後 14 日間で訪れる場所</p>
  ├ {groups.length === 0 → Empty card (静的、Phase 2-B EmptyCategoryStillness 哲学整合)}
  ├ <ul role="list" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
  │   {LOCATION_GROUP_ORDER.map(cat => (
  │     <li key={cat}>
  │       <CategoryCard ... />  ← active category も empty category も同 component、active flag で出し分け
  │     </li>
  │   ))}
  └ </ul>
  ├ {showStaticAlterCard && <StaticAlterSuggestionCard ... />}  (CEO 判断、Phase 2-B 整合)
  └ {onAddRequest && <FAB ... />}                                 (CEO 判断、Phase 2-B 整合)
</MapTab>
```

### 3.2 CategoryCard 構造

```tsx
<CategoryCard category="home" group={...} timeSignature={...} onAdd={...} onAnchorClick={...}>
  <header>
    <span className="text-4xl">{emoji}</span>
    <div>
      <h3 className="text-lg font-semibold">{label}</h3>
      <p className="text-xs italic text-slate-500">{hint}</p>  ← voice visible 化
    </div>
  </header>

  {active === false && (
    <p className="text-xs text-slate-400">今は静か</p>  ← empty category の voice
  )}

  {active === true && (
    <>
      <p className="text-xs text-indigo-600">
        {frequencyLabel}  ← "週 N 回" / "月 N 回" (Aneurasync voice)
        {timeSignature && ` · ${timeSignature}`}  ← "朝晩中心" / "9-18 中心" (時間 signature)
      </p>
      <ul>
        {anchors.map(({ anchor, count }) => (
          <li key={anchor.id} role="button" ...>
            <span>{anchor.title}</span>
            <span>× {count}</span>
            {anchor.locationText && <p>{anchor.locationText}</p>}
            {anchor.sensitiveCategory && <span className="🔒 badge">{...}</span>}
          </li>
        ))}
      </ul>
    </>
  )}

  {isAddable && onAdd && (
    <button onClick={onAdd}>+ {label} での予定を教える</button>
  )}
</CategoryCard>
```

### 3.3 時間 signature の計算 (新 helper、本 wave C1)

```ts
// app/(culcept)/plan/tabs/_helpers.ts (additive)

/** anchor 集合の時間 signature を返す (anchor の startTime 集計) */
export function categoryTimeSignature(anchors: ExternalAnchor[]): string | null {
  if (anchors.length === 0) return null;
  const hours = anchors.map(a => Number(a.startTime.slice(0, 2)) || 0);
  const morningCount = hours.filter(h => h >= 5 && h < 11).length;
  const dayCount = hours.filter(h => h >= 11 && h < 17).length;
  const eveningCount = hours.filter(h => h >= 17 && h < 22).length;
  const nightCount = hours.filter(h => h >= 22 || h < 5).length;
  // 過半数が同帯 → その時間帯 voice、混在なら最頻 + "中心"
  const total = hours.length;
  const top = Math.max(morningCount, dayCount, eveningCount, nightCount);
  if (top / total >= 0.5) {
    if (top === morningCount) return "朝中心";
    if (top === dayCount) return "日中中心";
    if (top === eveningCount) return "夜中心";
    if (top === nightCount) return "深夜中心";
  }
  // 朝晩集中 (morning + evening が過半数) → "朝晩中心"
  if ((morningCount + eveningCount) / total >= 0.6) return "朝晩中心";
  // それ以外 → null (signature 表示しない)
  return null;
}

/** 期間内の visit 頻度を自然語 voice で返す */
export function categoryFrequencyVoice(count: number, windowDays: number): string {
  if (count === 0) return "今は静か";
  const perWeek = count / (windowDays / 7);
  if (perWeek >= 1) return `週 ${Math.round(perWeek)} 回`;
  const perMonth = count * (30 / windowDays);
  if (perMonth >= 1) return `月 ${Math.round(perMonth)} 回`;
  return `${count} 回 (${windowDays} 日間)`;
}
```

両 helper とも:
- pure (副作用なし)
- test deterministic
- 既存 `_helpers.ts` の Phase 2-A / Phase 2-B 拡張パターン踏襲 (additive only)

### 3.4 静的 ALTER 提案 card (Phase 2-B §3.4 と同 pattern)

```tsx
{/*
  CEO 補正 #2 (Phase 2-B 整合): 静的 placeholder、ボタン風禁止
  - <section role="region">、cursor: default、tabIndex なし、onClick なし
  - 文言は CTA 想起を作らない
  - hover/shadow/transition なし
  - Phase 3 で初めて button-like styling に切り替え
*/}
<StaticAlterSuggestionCard>
  <p className="italic text-slate-500">あなたの地理を、ALTER が読みに来る予定です</p>
  <div className="border bg-white/70 px-4 py-3">
    <p>あなたの "聖域" を見てみたいですか?</p>  ← CEO 判断、文言バリエーション §13
    <p className="text-slate-400">(Phase 3 で動作予定 — 今は説明だけ)</p>
  </div>
</StaticAlterSuggestionCard>
```

### 3.5 FAB (Phase 2-A / 2-B 同 pattern)

```tsx
{onAddRequest && (
  <button
    type="button"
    onClick={handleFabClick}
    aria-label="場所カテゴリ未指定で予定を追加"
    data-testid="plan-map-fab"
    className="
      fixed bottom-20 right-6 z-30
      w-14 h-14 rounded-full
      bg-gradient-to-br from-indigo-500 to-purple-500
      ...
    "
  >+</button>
)}
```

- prefill: locationCategory なし (= 未指定、AddAnchorModal で user が選ぶ)
- subtitle: `地理 / カテゴリ未指定 から` or `地理 / 自分の場所から` (CEO 判断、§13)
- per-category add (W1-X3 既存) と並行: FAB は generic entry、card 内 add は category-prefilled entry

### 3.6 anchor detail 導線 (W1-X5 既存、不変)

- AnchorCard 内の anchor row tap → `onAnchorClick(anchor)` → AnchorDetailModal 起動
- 既存挙動 (role="button" + tabIndex + Enter/Space 対応) 継承
- AnchorDetailModal は Phase 1 / W1-X5 で完成、本 wave 不可触

### 3.7 + 教える 導線の整理

| 場所 | 状態 | 用途 |
|------|------|------|
| PlanClient header 「+ 教える」 | 継続 (両 mode) | route mode で primary entry |
| MapTab FAB (Phase 2-C 新規) | **追加** (Phase 2-A / 2-B 整合) | 主要 entry on mobile (カテゴリ未指定) |
| 各 CategoryCard 内 「+ <カテゴリ> での予定を教える」 | **継続** (W1-X3 既存、locationCategory pre-fill) | category-context 追加 |
| 静的 ALTER 提案 card | tap 不可 (CEO 補正 #2 と同) | Phase 3 で動作実装 |
| empty category (active=false) | tap 動作? | CEO 判断 §13: A. add link 表示 / B. tap 不可 (本 wave) |

---

## 4. Google Maps を使う場合 / 使わない場合の比較

### 4.1 Side-by-side

| 観点 | Google Maps **使う** | Google Maps **使わない** (Phase 2-C v1 推奨) |
|------|---------------------|-------------------------------------------|
| **ExternalAnchor data** | lat/lng 必須 → **migration 必須**: anchors.latitude / longitude (or geo_point PostGIS) + backfill | 既存 locationCategory / locationText のみで成立 |
| **Geocoding** | locationText → coordinates の reverse service 必要 (Google Geocoding API / Mapbox / OpenStreetMap、cost/rate-limit/privacy) | 不要 |
| **API key** | `NEXT_PUBLIC_*MAPS*` の Plan 専用 key or Alter Morning key 流用 → **env 変更必須** | 不要 |
| **build performance** | PR #31 で `@vis.gl/react-google-maps` reject (45:22 timeout)。script injection なら OK だが追加 KB / network roundtrip | 影響 0 |
| **license attribution** | Google ロゴ表示義務、ToS 遵守 | 不要 |
| **privacy** | Google への HTTP リクエスト発生 (anchor location が直接送られはしないが domain access はある) | ローカル完結 |
| **cost** | usage-based pricing (低頻度は無料枠だが scale 時はコスト発生) | 0 |
| **「自分の地理」 哲学整合** | 弱い (= Google Maps 自体が「他人事の地理」、汎用 map API) | **強い** (= category + voice + frequency が「私の地理」を露出) |
| **「pin = 生活の意味を持つ点」 整合** | 弱い (= GPS pin は意味を持たず単なる点) | **強い** (= CategoryCard が意味を持つ単位) |
| **CalendarTab / FlowTab との分離度** | 弱い (= 「地図 vs リスト」になり、地図側が distinct 価値を提示しにくい) | **強い** (= 時間軸 (Calendar/Flow) ≠ 空間軸 (Map)、3 レンズ pattern が成立) |
| **「最初から完璧な統合に飛ばない」 整合** | × (= 最大限の依存追加) | ✅ |
| **将来 lat/lng 追加時の switch コスト** | 既に統合済 → 微調整のみ | 別 wave で wrapping component を切り替え (lat/lng based pin overlay を v1 grid と並べる or 別 view mode 追加) |
| **CEO 制約「Google Maps API key や env 変更が必要なら CEO 確認に戻る」** | **トリガー発火 → 即停止** | 不発火 |

### 4.2 結論

**Phase 2-C v1 は Google Maps を使わない**。理由は 12 観点中 11 で「使わない」 が優位、唯一の懸念 (「将来 switch コスト」) は別 wave (lat/lng 追加 wave) で対応可能。

**将来 wave (= Phase 2-C+ / Phase 2-D / 別命名) の起点**:
- 条件: ExternalAnchor に lat/lng が追加された (= migration が承認・適用された) 後
- 内容: 既存 v1 grid の **side-by-side or toggle 切替** で real-map view を追加 (v1 grid は残す、両立)
- 採用判断は CEO が別 wave 起票時に判断

---

## 5. 既存 Google Maps env / API key の有無に依存しない最小設計

### 5.1 設計原則

本 wave で実装する MapTab.tsx + helper 群は以下を **必ず満たす**:

1. **`process.env.GOOGLE_MAPS_API_KEY` を参照しない**
2. **`process.env.NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` を参照しない**
3. **`@vis.gl/react-google-maps` / `google-map-react` 等の geo dependency を import しない**
4. **Google Maps の script tag (`maps.googleapis.com/maps/api/js`) を読み込まない**
5. **lat / lng / coordinates の field / type を扱わない** (ExternalAnchor の現 schema に存在しないため誤参照のリスクすらない)
6. **外部 geocoding API call を発行しない** (locationText は free string のまま、reverse なし)
7. **MorningMapView / routesApiClient の import / 関数呼び出しを行わない** (本 wave touch なし)

### 5.2 検証手順 (実装 wave 後)

- [ ] `grep -rn "GOOGLE_MAPS\|MAPBOX\|MAP_API\|google-maps\|mapbox\|leaflet\|maps.googleapis" app/(culcept)/plan/` → 0 hit
- [ ] `grep -rn "latitude\|longitude\|geo_point\|coordinates" app/(culcept)/plan/tabs/MapTab.tsx app/(culcept)/plan/tabs/_helpers.ts` → 0 hit
- [ ] DevTools Network: MapTab タブ表示中の `maps.googleapis.com` / `maps.gstatic.com` への request → 0 件
- [ ] DevTools Console: Google Maps related warning / error → 0 件
- [ ] `npm run build`: Vercel build 時間が Phase 2-B baseline から +5% 以内 (geo dependency 追加なしを実測)

### 5.3 CEO 確認に戻るトリガー (CEO 制約遵守)

実装 wave 中に以下のいずれかが必要になった瞬間、**実装を中断して CEO に判断を仰ぐ**:

- ExternalAnchor 型に lat / lng / geo_point field を追加する必要が生じた
- migration ファイルを作成する必要が生じた
- Production / Preview env に新 key (`NEXT_PUBLIC_*MAPS*` / `*GEO*` / `*MAP*`) を追加する必要が生じた
- 既存 `GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` を Plan tab で読みたくなった
- 外部 geocoding / map tile / static map API を call したくなった
- `@vis.gl/react-google-maps` / `google-map-react` / `leaflet` / `mapbox-gl` 等の dependency を install したくなった

→ いずれも本 wave スコープ外。

---

## 6. local-first 中に実装できる範囲 / GitHub 復旧後にすべき範囲

### 6.1 local-first 中に実装できる (= GitHub 復旧待ちで進められる)

すべて GitHub 操作 0 で進行可能 (Phase 2-A / Phase 2-B と同 pattern):

| 範囲 | 詳細 |
|------|------|
| **C1: helpers + tests** | `_helpers.ts` に `categoryTimeSignature` / `categoryFrequencyVoice` 等を additive 追加、`tests/unit/plan/mapTabHelpers.test.ts` を新規作成 |
| **C2: MapTab refactor** | `MapTab.tsx` を grid + voice + frequency + time signature + empty category stillness + 静的 ALTER card + FAB の構造に refactor |
| **C3: visual polish + smoke docs 更新** | hover transition / focus ring / micro-typography 調整 + `docs/alter-plan-home-swipe-visual-smoke.md` に Phase 2-C 追加 smoke check |
| **local test / build** | `npx tsc --noEmit` / `npx eslint <files>` / `npx vitest run tests/unit/plan/` / `npm run build` |
| **CEO local smoke** | CEO 環境で実機検証 |
| **blocker fix** | smoke 中に見つかった blocker を本 branch 上で修正 commit |

### 6.2 GitHub 復旧後にすべき (= 復旧を待つ操作)

| 操作 | 順番 |
|------|------|
| Phase 2-A push (PR #223 更新) | 1 |
| Phase 2-A merge | 2 |
| Phase 2-B push (新 PR) | 3 (Phase 2-A merge 後) |
| Phase 2-B merge | 4 |
| 本 docs PR push (新 PR、本 mini design 採択用) | 5 (Phase 2-B merge 後、stack の論理順) |
| 本 docs PR merge | 6 |
| Phase 2-C impl branch を最新 main に rebase + push + 新 PR | 7 (Phase 2-C 実装が本 docs 承認後着手の場合) |
| (Optional) 別 wave for real-map: ExternalAnchor lat/lng + migration | 後日、CEO 別判断 |

### 6.3 stacked branch の整合

```
local main b07eeab5  (suspension 時の snapshot、復旧後 pull で advance)
   ↑ merge-base
Phase 2-A  feat/alter-plan-phase2-a-calendar-week-strip @ 6e37ad38   (凍結、5 commits)
   ↑ stacked
Phase 2-B  feat/alter-plan-phase2-b-flow-list @ 99e7c02a   (凍結、3 commits)
   ↑ stacked
Phase 2-C docs  docs/alter-plan-phase2-c-map-tab-mini-design @ HEAD  (本 PR、docs only、1 commit)
   ↑ (実装 wave 後) stacked
Phase 2-C impl  feat/alter-plan-phase2-c-map-tab @ ...   (推定 3 commits)
```

復旧後 rebase は Phase 2-B mini design §16 と同 pattern (Merge commit / Squash / Rebase merge 3 方式すべて対応可能、`--onto` 含む)。

---

## 7. Home swipe / scroll / modal lock 干渉対策

### 7.1 Home swipe (HomeSwipeContainer) との関係

- MapTab は **縦 scroll** (CategoryCard grid が 2 列で並び、9 categories → 4-5 行 = ~600-800px の縦長)
- HomeSwipeContainer は **X 軸 dragDirectionLock** (Phase 1 C1)
- → 衝突なし (Phase 2-A CalendarTab / Phase 2-B FlowTab と同 pattern)
- → MapTab が縦に長くなっても sticky header (Phase 2-B §11.11 と同) は **本 wave では不要** (grid の見出しが少なく orientation 維持必要性低い)

### 7.2 Modal lock (Phase 1 C3) との関係

- AnchorDetailModal (anchor row tap → 起動) / AddAnchorModal (FAB or per-category add → 起動) 開時は HomeSwipeContainer drag disable (既存)
- 本 wave で **追加 modal なし、新規 lock 不要**
- 静的 ALTER 提案 card は tap で何も起きない → modal lock 影響なし

### 7.3 縦 scroll vs 横 swipe の衝突

- HomePane (Plan pane) で縦 scroll 中、small 横揺れがあっても swipe threshold (画面幅 30%) に達せず pane 切替しない (Phase 1 既存挙動)
- Phase 2-C は grid layout で縦 scroll が短め (sticky header なし) → 衝突リスクむしろ低い

### 7.4 pane mode の overflow-y context

- `displayMode="pane"`: PlanClient の `<main className="h-full overflow-y-auto ...">` が scroll context
- MapTab は scroll context 内で `<div className="space-y-4">` 直下に grid を置く
- 縦 scroll が成立 (Phase 2-B FlowTab と同)
- pane width 制約: pane は viewport 幅 100%、grid は `grid-cols-1 sm:grid-cols-2` で responsive

### 7.5 PR #214 containing block 効果

- FAB は `fixed bottom-20 right-6 z-30` (Phase 2-A / 2-B と同)
- Plan pane の `transform: translateZ(0)` + `contain: layout paint` (PR #214) で fixed が pane 内に閉じ込まる
- Plan pane swipe 中も FAB が pane と一緒に移動 (Phase 2-A / 2-B で実証済)

---

## 8. MapTab と CalendarTab / FlowTab の役割分離

### 8.1 3 レンズ pattern (PlanClient header の謳い文句整合)

PlanClient header:
> 同じ予定を 3 つの視点で見ると、自分の生活パターンが見えてきます。

各 tab の distinct contribution:

| Tab | 軸 | 質問 | 単位 |
|-----|-----|------|------|
| **CalendarTab (Phase 2-A)** | 時間 (月単位) | 「今月はどんな日々か?」 | 日 (date) |
| **FlowTab (Phase 2-B)** | 時間 (週単位、近未来) | 「今後 7 日は何があるか?」 | 日 + 時刻 (datetime sequence) |
| **MapTab (Phase 2-C)** | 空間 (カテゴリ単位、生活ドメイン) | 「私の生活はどこで起こるか?」 | カテゴリ (life domain) |

### 8.2 同 anchor を 3 視点で見る価値

例: 「9:00 スターバックス 代官山店で打ち合わせ」 という anchor

- **Calendar**: 5月20日(水)の selected day agenda に表示 (時間軸 = 日)
- **Flow**: 今後 7 日リストの 5/20 section に時刻順 anchor として表示 (時間軸 = 連続性)
- **Map**: 「☕ カフェ」 カテゴリの anchor list に "× 1" として表示、time signature "午後中心" に寄与 (空間軸 = 生活ドメイン)

3 つの異なる文脈で同 anchor が **意味づけられる** → ユーザーの自己理解が深まる。

### 8.3 重複しない情報

| 情報 | Calendar | Flow | Map |
|------|----------|------|-----|
| 月の overview | ✓ | | |
| 月送り navigation | ✓ | | |
| 今日 / 明日 prefix | | ✓ | |
| 連続日 (7 日) の sequence | | ✓ | |
| 時刻軸 + gap | | ✓ | |
| カテゴリ別の集計 | | | ✓ |
| 頻度 voice (週 N 回) | | | ✓ |
| 時間 signature (朝晩中心) | | | ✓ |
| 場所の意味 (hint voice) | | | ✓ |
| anchor 詳細 (modal) | ✓ | ✓ | ✓ |
| anchor 追加 (modal) | ✓ | ✓ | ✓ |

→ Map のみが提供する unique 情報: **カテゴリ集計 / 頻度 voice / 時間 signature / hint voice**。これらが MapTab の existence justification。

---

## 9. Commit 階段 (実装 wave 用、本 PR では実装しない)

### C1: helpers + tests

**Files**:
- `app/(culcept)/plan/tabs/_helpers.ts` (additive only)
  - 新規 `categoryTimeSignature(anchors: ExternalAnchor[]): string | null` — 朝/日/夜/深夜/朝晩中心の voice
  - 新規 `categoryFrequencyVoice(count: number, windowDays: number): string` — 週 N 回 / 月 N 回 / N 回 (windowDays 日間) / 今は静か
  - (optional) 新規 `CATEGORY_VOICE_TONE` enum or const — 4 段階 of voice 強度 (CEO 判断、§13 候補)
- `tests/unit/plan/mapTabHelpers.test.ts` (新規)
  - `categoryTimeSignature` の境界 (空配列 / 過半数判定 / 朝晩混在 / 4 帯均等)
  - `categoryFrequencyVoice` の境界 (count=0 / count<windowDays/7 / count>=windowDays/7 / windowDays=1 / pure な deterministic)
- 既存 `groupAnchorsByLocation` / `LOCATION_GROUP_ORDER` / `CATEGORY_META` / `categoryOf` / `countOccurrences` は **不可触** (additive only、削除なし、変更なし)

### C2: MapTab refactor + 新 component

**Files**:
- `app/(culcept)/plan/tabs/MapTab.tsx` — refactor (194 行 → 推定 350-420 行)
  - 旧 縦 1 列 list → 2 列 grid (`grid-cols-1 sm:grid-cols-2 gap-3`)
  - `LOCATION_GROUP_ORDER` を全て render (active + empty 両方)、`groupAnchorsByLocation` で取得した active group は data 注入、empty は静的 placeholder
  - `<CategoryCard>` internal component (各カテゴリ 1 card、active / empty 出し分け)
  - emoji を text-4xl 大型化
  - hint を visible italic text-xs で voice 化
  - `categoryFrequencyVoice` 表示 (active: 週 N 回 / 月 N 回 / 今は静か)
  - `categoryTimeSignature` 表示 (active かつ非 null の場合のみ)
  - anchor list (既存) + per-category add link (W1-X3 既存)
  - empty card: subtle opacity (`opacity-60`) + "今は静か" voice
  - 末尾に **静的 ALTER 提案 card** (Phase 2-B §3.4 と同 pattern、ボタン風禁止、CEO 補正 #2 整合)
  - 右下 **FAB** (Phase 2-A / 2-B 同 pattern、locationCategory なしで AddAnchorModal を開く)
  - sensitive anchor: title 表示 + `<GlassBadge>` で sensitive label (Phase 2-B AnchorThumbnail の sensitive ロジックと整合)

### C3: visual polish + smoke docs 更新

**Files**:
- `app/(culcept)/plan/tabs/MapTab.tsx` — micro polish (hover transition / focus ring / spacing 調整)
- `docs/alter-plan-home-swipe-visual-smoke.md` — Phase 2-C 追加 smoke check (新 grid UI 確認項目)

---

## 10. Smoke 項目 (実装 wave 用)

### 10.1 /plan route (route mode)

- [ ] /plan 直 URL で 3 tab 表示 (カレンダー / リスト / 地図)
- [ ] "地図" tab tap → MapTab content 表示
- [ ] header: "あなたの地理" (or CEO 確定 copy) + "今後 14 日間で訪れる場所"
- [ ] grid layout: 2 列 (sm 以上)、1 列 (xs)
- [ ] 9 categories (LOCATION_GROUP_ORDER 順) が全て表示 (active + empty 両方)

### 10.2 CategoryCard 内容 (active カテゴリ)

- [ ] emoji が text-4xl で大型表示
- [ ] label (text-lg font-semibold)
- [ ] hint (text-xs italic text-slate-500) が visible
- [ ] frequencyVoice (例: "週 5 回") が表示
- [ ] timeSignature (例: "朝晩中心") が表示 (null の場合は表示しない)
- [ ] anchor list: title × count + locationText? + sensitive badge?
- [ ] sensitive anchor: title 表示 + `<GlassBadge>{label}</GlassBadge>` (Phase 2-B AnchorThumbnail integration)
- [ ] per-category add link: "+ <カテゴリ> での予定を教える" (W1-X3 既存)
- [ ] anchor row tap → AnchorDetailModal 起動 (W1-X5 既存)

### 10.3 Empty category (active=false)

- [ ] CategoryCard 表示は維持 (隠さない、Aneurasync 哲学整合)
- [ ] opacity-60 で subtle に de-emphasize
- [ ] voice: "今は静か"
- [ ] anchor list 表示なし
- [ ] frequencyVoice / timeSignature 表示なし
- [ ] per-category add link: CEO 判断 §13 (A. 表示する / B. 表示しない)
- [ ] aria-label に "今は静か" 含む (screen reader にも伝える)

### 10.4 静的 ALTER 提案 card (CEO 補正 #2 整合、Phase 2-B §3.4 と同 pattern)

- [ ] tap 動作なし (cursor:default、tabIndex なし、onClick なし)
- [ ] hover/shadow/transition なし
- [ ] role="region" + aria-label
- [ ] 文言は CTA 想起を作らない (Phase 3 で動作予定明記)
- [ ] DevTools で確認: outer に `cursor:default`、内側 div に `shadow-md` 以上の elevation なし

### 10.5 FAB (Phase 2-A / 2-B 同 pattern)

- [ ] 右下 fixed (bottom-20 right-6 z-30)、56px 紫 gradient
- [ ] FAB tap → AddAnchorModal 起動、locationCategory **未指定** (= user が modal 内で選ぶ)
- [ ] subtitle: "地理 / カテゴリ未指定 から" or "地理 から" (CEO 確定 copy)
- [ ] pane 内 containing block 効果 (PR #214、Plan pane swipe で一緒に移動)
- [ ] safe-area-inset-bottom 適用

### 10.6 Recurring + exception_dates + validity (既存 groupAnchorsByLocation 動作)

- [ ] FREQ=WEEKLY recurring anchor が windowDays 期間内の対応曜日カウントに反映
- [ ] FREQ=DAILY recurring anchor が windowDays カウントに反映
- [ ] exception_dates 適用 (除外日カウントなし)
- [ ] valid_until 後の日は count に含まれない

### 10.7 Home pane 統合 (pane mode)

- [ ] Home → 左 swipe → Plan pane → 地図 tab tap → 同 UI
- [ ] FAB / anchor row tap → Modal 起動、Modal 開時 swipe disable (Phase 1 C3)
- [ ] grid 縦 scroll で横 swipe 誤発火しない

### 10.8 Network / Console (Phase 2-C 独自検証)

- [ ] Network: **`maps.googleapis.com` / `maps.gstatic.com` への request 0 件**
- [ ] Network: `aljavfujeqcwnqryjmhl` (Production Supabase) のみ、`hjcrvndumgiovyfdacwc` (Alter staging) 0 hit
- [ ] Network: `/api/coalter` / `/api/talk` / `/api/mirror` → 0 hit
- [ ] Console: Google Maps related warning / error → 0 件
- [ ] Console: React 19 warning 0
- [ ] Console: framer-motion warning 0
- [ ] grep `app/(culcept)/plan/tabs/MapTab.tsx` for `GOOGLE_MAPS\|maps.googleapis\|@vis.gl` → 0 hit

### 10.9 A11y

- [ ] 各 CategoryCard: `<section aria-label="家 · 自分の聖域 · 週 7 回">` 形式
- [ ] empty card: aria-label に "今は静か" 含む
- [ ] anchor row: role="button" + tabIndex=0 + Enter/Space (W1-X5 既存)
- [ ] FAB: aria-label に "場所カテゴリ未指定で予定を追加"
- [ ] 静的 ALTER card: role="region" + aria-label "ALTER 提案 (今後の機能、Phase 3 で実装予定)"
- [ ] grid 内 tab 順: card 順 (LOCATION_GROUP_ORDER 順)、各 card 内 anchor 順
- [ ] touch target 44pt 最小 (anchor row / per-category add button / FAB)

---

## 11. やらないこと (制約再宣言)

### CEO 補正による制約 (Phase 2-A / 2-B 通算)

- ❌ CoAlter / Mirror / /talk / D-* 関連
- ❌ Production env / all-Preview env 変更
- ❌ migration 追加 (ExternalAnchor lat/lng 含む)
- ❌ service_role / DB password / connection string 使用
- ❌ DraftPlan generator / W1-6 passive drift logging
- ❌ W1-Z+ cleanup (apply 後 1 週間観測、別 wave)
- ❌ fallback path 削除
- ❌ **Phase 2-A branch (`feat/alter-plan-phase2-a-calendar-week-strip`) への追加 commit**
- ❌ **Phase 2-B branch (`feat/alter-plan-phase2-b-flow-list`) への追加 commit**

### Phase 2-C 固有の制約 (CEO 方針整合)

- ❌ **Google Maps integration** (PR #31 reject + ExternalAnchor 座標なし + 哲学逸脱)
- ❌ **ExternalAnchor 型に lat / lng / geo_point field 追加** (migration 必須、別 wave)
- ❌ **locationText → coordinates の reverse geocoding service** (別 wave)
- ❌ **API key (NEXT_PUBLIC_*MAPS*) の Plan 用追加 / Alter Morning key 流用** (即時 CEO 確認に戻る)
- ❌ **env 変数追加 / 修正** (Production / Preview / Development いずれも)
- ❌ **`@vis.gl/react-google-maps` / `google-map-react` / `leaflet` / `mapbox-gl` 等の geo dependency install**
- ❌ **`maps.googleapis.com` / `maps.gstatic.com` への request 発生**
- ❌ **MorningMapView / routesApiClient の import / 関数呼び出し**
- ❌ **MapTab に "Coming soon" / "Phase 3" のような未実装 placeholder の addition** (静的 ALTER 提案 card 以外)
- ❌ **real-time location tracking** / ユーザーの GPS 取得 (locationOptIn は Home の別 feature)
- ❌ **長押し quick action menu** (Phase 2-C+ 預け、Phase 2-B と同 defer)
- ❌ **MapTab を default tab に変更** (現在 Calendar = default は維持)
- ❌ **PlanClient / HomeSwipeContainer / Modal lock 変更**
- ❌ **Phase 2-A の CalendarTab / Phase 2-B の FlowTab の改修** (本 wave は MapTab.tsx + _helpers.ts のみ)
- ❌ **AddAnchorModal の signature 変更** (既存 `initialState` / `contextSubtitle` を流用)

### 削除しないもの (irreversibility 原則、Phase 2-B CEO 補正 #3 整合)

- ✅ `groupAnchorsByLocation` / `LOCATION_GROUP_ORDER` / `categoryOf` / `countOccurrences` helpers — **不可触**
- ✅ `CATEGORY_META` (9 categories 全部) — **不可触** (label / emoji / hint いずれも)
- ✅ `SENSITIVE_LABEL` — **不可触**
- ✅ 既存 test (helper test + MapTab integration test if any) — **継続 PASS**
- ✅ Phase 2-A / Phase 2-B helpers (Phase 2-A の月 helpers / Phase 2-B の flow list helpers) — **不可触**

---

## 12. 自立推論 — Beyond 設計 (世界トップアプリ研究 + Aneurasync 哲学)

### 12.1 世界トップアプリの「自分の地理」 比較

| アプリ | アプローチ | Phase 2-C との関係 |
|--------|------------|---------------------|
| **Apple Maps Memories** | 「N 年前の今日 Paris に居た」 story-like 表示、real map base | 時間 × 場所の物語、Aneurasync は時間 (Calendar/Flow) と分離、空間 lens を独自に |
| **Google Maps Timeline** | 日次 GPS history + route + place visit | 「行った場所」 の記録、Aneurasync は「行く場所 = 意味の地理」 (= 未来志向) |
| **Foursquare / Swarm** | チェックイン + badge ゲーミフィケーション | ユーザー操作型、Aneurasync は anchor data を自動集計 (passive 観測) |
| **Day One** | journal + location tag (optional) | 個人のジャーナリング、Aneurasync は anchor を「生活の意味」 として読み解く |
| **Strava Heatmap** | 個人の running path heatmap | 移動の集約、Aneurasync は domain (カテゴリ) の集約 |
| **Spotify Wrapped Geography** | 年次の地理 story (聴いた場所) | 年次 retrospective、Aneurasync は近未来 (windowDays 14) prospective |
| **Mint / Money Forward** | カテゴリ別 spending visualization | 金銭の「意味の集計」、Aneurasync の「場所の意味の集計」 と構造類似 (= 同 pattern が空間に応用される) |

→ **Aneurasync Phase 2-C の unique 立ち位置**:
- **prospective** (今後 N 日)、retrospective ではない
- **passive 観測** (anchor data 自動集計、user の追加操作不要)
- **categorical** (カテゴリ = 生活ドメイン)、geographic (GPS coord) ではない
- **voice 入り** (hint / frequency / time signature が Aneurasync 声で語る)

### 12.2 Aneurasync 哲学整合 (Heart Dynamics Model 整合)

**HDM の時間構造** (memory: `heart-dynamics-model-v1.md`):
- 気候 (年): 長期傾向
- 季節 (月): 中期傾向
- 天気 (日): 短期状態

**Phase 2-C で対応する空間構造の提案**:
- **領土** (= 全カテゴリ): あなたが訪れる場所の全体像 — MapTab の grid 全体
- **街** (= 頻訪カテゴリ): あなたの "聖域" / 主要ドメイン — frequency 高い CategoryCard
- **部屋** (= 今日の場): 今日 anchor がある category — 別 wave で highlight (本 wave スコープ外)

これらは Aneurasync の「自己理解」の **空間版**。HDM の generative space 哲学を空間にも extends。

### 12.3 Beyond 改善 (本 wave で採用)

#### 12.3.1 hint visible 化 = voice integration

現在: hint は表示されない (data として保持のみ)
Phase 2-C v1: hint を `text-xs italic text-slate-500` で visible 表示

```
🏠 家
自分の聖域       ← hint visible (italic、subtle)
週 7 回 · 朝晩中心
```

**意義**: CATEGORY_META.hint は Aneurasync が用意した「voice」。表示することで「カテゴリ」が単なる label から「意味」 へ昇格する。

#### 12.3.2 Frequency natural language voice

現在: "N 日で X 回" (literal、機械的)
Phase 2-C v1: "週 N 回" / "月 N 回" / "今は静か" (自然語、aneurasync voice)

**実装** (§3.3 `categoryFrequencyVoice`):
- 14 日内 7 回以上 → "週 N 回"
- 14 日内 1-6 回 → 30 日換算 → "月 N 回"
- 0 回 → "今は静か"

#### 12.3.3 Time signature

現在: なし
Phase 2-C v1: anchor の startTime を集計して "朝中心" / "日中中心" / "夜中心" / "深夜中心" / "朝晩中心" / null

**実装** (§3.3 `categoryTimeSignature`):
- 5-10 時 = 朝、11-16 時 = 日中、17-21 時 = 夜、22-4 時 = 深夜
- 過半数 → 該当帯 + "中心"
- 朝晩 ≥ 60% → "朝晩中心"
- 均等 → null (表示しない)

**意義**: 同じ category でも「朝のカフェ」と「夜のカフェ」では意味が違う。time signature で **生活リズムの空間版** が露出する。

#### 12.3.4 Empty category as silence (Phase 2-B §11.10 と同 哲学)

現在: `totalCount=0` の group は完全 filter (`groupAnchorsByLocation` で除外済)
Phase 2-C v1: **全 9 categories を表示**、empty は `opacity-60` + "今は静か" voice

**意義**: Apple Maps / Google Maps は空 category を隠す (= 「ない場所は存在しない」)。Aneurasync は「ない = 静か」 として尊重する (= 「未来 = generative space」哲学整合)。

ユーザーは「私の学校カテゴリは静かだな」「私の屋外カテゴリは空白だな」 と気づく → 「学びを増やしたい」「外に出たい」 の self-recognition の起点になる。

#### 12.3.5 Per-category add for empty categories

empty category にも "+ <カテゴリ> での予定を教える" link を表示するか?
- A. 表示する (CEO 判断 §13 推奨): empty を埋める導線が自然に提供される
- B. 表示しない: ノイズ削減、active のみに focus

→ **CEO 判断 §13**。推奨は A (empty を「埋める」 のは Aneurasync の核心体験)。

#### 12.3.6 Static ALTER suggestion card (Phase 2-B §3.4 と同 pattern)

末尾に静的 placeholder card:
- 文言: "あなたの地理を、ALTER が読みに来る予定です" + "(Phase 3 で動作予定 — 今は説明だけ)"
- 内側 card: "あなたの "聖域" を見てみたいですか?" (CEO 判断、§13 候補)
- ボタン風 styling 禁止 (Phase 2-B CEO 補正 #2 と同)
- tabIndex なし、cursor:default、select-none

**意義**: Phase 3 接続点を視覚的に予告。MapTab のみ で完結する閉じた view ではなく、ALTER が将来関与する hook を見せる。

#### 12.3.7 FAB (Phase 2-A / 2-B 同 pattern)

global FAB を追加 (per-category add は維持):
- FAB: locationCategory **未指定** (user が modal 内で選ぶ)
- per-category: locationCategory **prefill** (即時 context 渡し)
- 2 つの mental model: 「予定を追加 (今 category 不明)」 vs 「○○ での予定を追加」

#### 12.3.8 Header copy refinement

現在: "あなたの聖地マップ" + "今後 14 日間で訪れる場所"
Phase 2-C v1 候補 (CEO 判断 §13):

A. "あなたの地理" + "今後 14 日間で訪れる場所" ← 推奨 (simple、CEO 方針 "自分の地理" 直訳)
B. "あなたの場所" + "今後 14 日間で訪れる場所"
C. "生活が起こる場所" + "今後 14 日間"
D. "聖地マップ" を維持 + sub copy のみ更新
E. "自分の地理" + "あなたの生活舞台" (大胆な poetic copy)

#### 12.3.9 Sensitive privacy 整合 (Phase 2-B AnchorThumbnail 整合)

Phase 2-B では sensitive anchor の thumbnail を 🔒 generic icon に統一。
Phase 2-C では anchor row の title + locationText が表示される (現 MapTab 既存)。

Option:
A. **現状維持** (title 表示 + sensitive badge): 詳細情報は AnchorDetailModal で明らかにする pattern、現 MapTab 整合
B. **title 抹消** (sensitive anchor の title を "🔒 ⟨敏感⟩" に置換、AnchorDetailModal でのみ実 title 表示): privacy 最大化
C. **title + 🔒 prefix** (title 維持 + 🔒 prefix): privacy 軽度配慮、視覚的に sensitive を明示

→ **CEO 判断 §13**。推奨は A (現状維持)。Phase 2-B の "thumbnail は 🔒、title は通常" pattern と整合 (= title は AnchorRow level で表示、thumbnail/icon level でのみ 🔒 抑制)。

#### 12.3.10 Restraint UI (Phase 2-B §11.16 整合)

- 色: indigo (active) / slate (subtle) / 曜日色なし (時間色は MapTab に不要)
- shadow: card hover でのみ subtle
- typography: emoji 大 (text-4xl) + label / hint / voice の細やかな contrast
- gradient (static ALTER card): `/60` で薄く

#### 12.3.11 a11y semantic

- `<section role="region" aria-label="家 · 自分の聖域 · 週 7 回">` 形式
- empty: `aria-label="家 · 自分の聖域 · 今は静か"`
- screen reader が「カテゴリ + voice + 頻度」 を 1 行で読み上げる
- grid 内 keyboard nav: Tab で card 順 → card 内 anchor 順 → 次 card
- arrow key nav は採用しない (本 wave で keyboard composer 系の衝突を避けるため、Phase 2-A の week strip と同 simple Tab 順)

#### 12.3.12 prefers-reduced-motion 対応

- Phase 2-C は animation 不要 (FlowTab と同)
- card hover transition のみ、reduced-motion でも disable 不要 (transition は subtle で acceptable)

### 12.4 採用しない improvements (Phase 2-C+ / 別 wave 預け)

| 改善 | 理由 | 預け先 |
|------|------|-------|
| **Today's stage highlight** (今日 anchor がある category を強調) | 本 wave は windowDays-aggregate focus、「今日」 は Calendar/Flow で見れる | Phase 2-C+ |
| **windowDays toggle** (7 / 14 / 30 / all) | UI 複雑化、現 14 日固定で価値検証 | Phase 2-C+ |
| **Drill-down (category tap → 詳細 view)** | grid のシンプルさが価値、tap で別 page は flow を分断 | Phase 2-C+ / Phase 3 |
| **Long-press quick action** | Phase 2-B と同 defer 理由 (mobile only / framer-motion 衝突) | Phase 2-C+ |
| **Real map (Google Maps + lat/lng)** | ExternalAnchor 座標なし、migration 必要 | 別 wave (lat/lng 追加後) |
| **Pin clustering** | 座標前提、本 wave は categorical | 別 wave |
| **Path drawing (transit ↔ home)** | 移動軌跡、座標前提 | 別 wave |
| **Category-specific stats (e.g. 「カフェ訪問の平均滞在時間」)** | endTime を集計するロジック必要、価値検証は後 | Phase 2-C+ |
| **Category への custom name (e.g. 「サードプレイス」)** | enum 拡張、migration 必要 | 別 wave |
| **Heat indicator (頻度を visual gradient で)** | 視覚過剰、frequency voice で十分 | 別 wave、否決の可能性高い |

---

## 13. CEO 判断点 (本 PR merge 後の実装 wave 起票前)

### 判断 1: layout (§3.1)

- **A. 2 列 grid (mobile responsive、wider で 2-3 列)** ← 推奨
- B. 縦 1 列 list (現 MapTab 維持)、CategoryCard 内部のみ refactor
- C. semantic spatial layout (SVG custom、center=home、外周に other categories) — Phase 2-C+ 預け
- D. Frequency-based size variation (大きい card / 小さい card)、heatmap feel — Phase 2-C+ 預け

### 判断 2: empty category 表示 (§3.2、§12.3.4)

- **A. 全 9 categories 常時表示、empty は opacity-60 + "今は静か" voice** ← 推奨 (Aneurasync 哲学整合)
- B. active のみ表示 (現 MapTab 既存挙動維持)
- C. empty は collapsed default、tap で expand

### 判断 3: empty category per-category add link (§12.3.5)

- **A. 表示する** (empty を埋める導線、Aneurasync 「未来 = generative space」 整合) ← 推奨
- B. 表示しない (active のみ add link)

### 判断 4: 静的 ALTER 提案 card 表示 (§3.4、§12.3.6)

- **A. 表示する** (Phase 2-B integration、Phase 3 接続点予告) ← 推奨
- B. 表示しない (MapTab は category-only に閉じる)

### 判断 5: FAB の有無 (§3.5、§12.3.7)

- **A. global FAB を追加** (Phase 2-A / 2-B 整合、per-category add と共存) ← 推奨
- B. per-category add のみ (現 MapTab 既存挙動)

### 判断 6: header copy (§12.3.8)

- **A. "あなたの地理" + "今後 14 日間で訪れる場所"** ← 推奨 (CEO 方針 "自分の地理" 直訳)
- B. "あなたの場所" + "今後 14 日間で訪れる場所"
- C. "生活が起こる場所" + "今後 14 日間"
- D. "聖地マップ" を維持 + sub copy のみ更新 (旧 voice 維持)
- E. "自分の地理" + "あなたの生活舞台" (poetic)

### 判断 7: sensitive anchor の title 表示 (§12.3.9)

- **A. 現状維持** (title + locationText 表示 + sensitive badge) ← 推奨 (Phase 2-B AnchorThumbnail integration 整合)
- B. title を "🔒 ⟨敏感⟩" に置換、AnchorDetailModal でのみ実 title (privacy 最大化)
- C. title + 🔒 prefix (中庸)

### 判断 8: windowDays default (§3.1)

- **A. 14 (現 default 維持)** ← 推奨 (現 MapTab 既存挙動)
- B. 7 (Phase 2-B FlowTab と整合)
- C. 30
- D. 設定可能 (toggle UI 追加、Phase 2-C+ 預け)

### 判断 9: 静的 ALTER 提案 card の文言 (§3.4、§12.3.6)

- A. "あなたの "聖域" を見てみたいですか?" + "(Phase 3 で動作予定)"
- B. "ALTER があなたの地理を読み解きます" + "(Phase 3 で動作予定)"
- **C. "あなたの場所のパターンを、ALTER が読みに来る予定です" + "(Phase 3 で動作予定)"** ← 推奨 (Aneurasync voice + 控えめ + Phase 3 明示)
- D. CEO 別案

### 判断 10: Phase 2-C 後の次フェーズ優先順位

| Phase | 内容 | 推奨 timing |
|-------|------|--------------|
| **Phase 3** | 空き日 → ALTER 質問 → 提案 flow (FlowTab / MapTab integration) | Stargazer / Alter engine 接続 (大型) |
| **Phase 2-C+** | MapTab に Today's stage / windowDays toggle / drill-down | Phase 2-C 着地後 |
| **別 wave (Real Map)** | ExternalAnchor lat/lng migration + reverse geocoding + Google Maps integration | 需要発生時、CEO 別判断 |
| **Phase 2-A+** | Full month grid view mode 追加 | 別 design |
| **W1-Z+ cleanup** | Repository fallback path 削除 | apply 後 1 週間観測 |

---

## 14. 制約遵守 (本 PR 通算)

- ✅ docs only (実装 / migration / env 変更 0)
- ✅ Phase 2-A branch (`feat/alter-plan-phase2-a-calendar-week-strip`) への混入なし (本 PR は別 branch)
- ✅ Phase 2-B branch (`feat/alter-plan-phase2-b-flow-list`) への混入なし (本 PR は別 branch、Phase 2-B impl の上に stack)
- ✅ GitHub 操作 0 (suspension 中、push / pull / fetch / gh 全禁止維持)
- ✅ CoAlter / Mirror / /talk / D-* / W1-6 / DraftPlan / fallback path 不触
- ✅ Production / all-Preview env 不触
- ✅ migration 追加なし (ExternalAnchor lat/lng は別 wave)
- ✅ service_role / DB password / connection string 不使用
- ✅ Google Maps API key (`GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY`) Plan 用追加 / 流用なし
- ✅ MorningMapView / routesApiClient / `@vis.gl/react-google-maps` 不可触
- ✅ Phase 2-A 実装 (CalendarTab / SelectedDay / 月送り animation / Today button) 不変
- ✅ Phase 2-B 実装 (FlowTab / AnchorThumbnail / 静的 ALTER card / FAB / sticky header) 不変
- ✅ Phase 2-C / Phase 3 / Phase 2-A+ / Phase 2-B+ は別 wave 預け

---

## 15. References

### 既存 files (本 PR で touch しない、実装 wave で touch する file 含む)

- `app/(culcept)/plan/tabs/MapTab.tsx` (本命修正対象、194 行、本 PR で touch しない)
- `app/(culcept)/plan/tabs/_helpers.ts` (既存 helper、本 wave で軽量拡張のみ)
- `app/(culcept)/plan/PlanClient.tsx` (parent、本 wave で touch しない)
- `lib/plan/external-anchor.ts` (ExternalAnchor 型、本 wave で touch しない、lat/lng なし確認)
- `app/(culcept)/plan/components/AnchorDetailModal.tsx` (W1-X5 既存、本 wave で touch しない)
- `app/(culcept)/plan/components/AddAnchorModal.tsx` (W1-X1/X2 既存、本 wave で touch しない)

### 関連設計書

- `docs/alter-plan-w15-ui-mini-design.md` §2, §4 (MapTab 初版設計)
- `docs/alter-plan-w1x3-cell-add-mini-design.md` (per-category add 導線、本 wave で維持)
- `docs/alter-plan-w1x5-anchor-detail-mini-design.md` (anchor detail modal、本 wave で維持)
- `docs/alter-plan-phase2-a-calendar-month-view-mini-design.md` (Phase 2-A、refactor pattern の前例)
- `docs/alter-plan-phase2-b-flow-list-mini-design.md` (Phase 2-B、CEO 補正 1-3 + Beyond 改善 + 静的 ALTER card pattern の前例)
- `docs/alter-plan-home-swipe-visual-smoke.md` (smoke runbook、本 wave で Phase 2-C section 追加)

### Aneurasync 哲学 references (memory)

- `memory/aneurasync-philosophy.md` (中心問い "第二の自己として必要か?")
- `memory/heart-dynamics-model-v1.md` (時間構造 + generative space 哲学)
- `memory/project_phase2-direction.md` (Phase 2 方針)

### Google Maps 関連 (本 wave で参照のみ、touch なし)

- `components/home/morning/MorningMapView.tsx` (script injection pattern、将来 real-map wave の reference)
- `lib/alter-morning/routesApiClient.ts` (server-side API key 利用、本 wave で touch なし)
- PR #31 (`@vis.gl/react-google-maps` 採用試行 → Vercel build 45:22 timeout で reject)
- PR #34 (M1 pin-only MVP landed 8d0ce253)

### 世界トップアプリ参考 (§12.1)

- Apple Maps Memories (iOS / macOS)
- Google Maps Timeline
- Foursquare / Swarm
- Day One
- Strava Heatmap
- Spotify Wrapped Geography
- Mint / Money Forward (categorical aggregation pattern)

---

## 16. GitHub 復旧後の手順 (3-level stacked branch)

### 16.1 stacked branch の構造

```
local main             b07eeab5  (suspension 時点 snapshot、復旧後 pull で advance)
                       ↑
Phase 2-A              6e37ad38  (feat/alter-plan-phase2-a-calendar-week-strip、5 commits、凍結)
                       ↑
Phase 2-B              99e7c02a  (feat/alter-plan-phase2-b-flow-list、3 commits、凍結)
                       ↑
Phase 2-C docs         HEAD       (docs/alter-plan-phase2-c-map-tab-mini-design、本 PR、1 commit)
                       ↑ (実装 wave 着手後)
Phase 2-C impl         ...        (feat/alter-plan-phase2-c-map-tab、推定 3 commits)
```

### 16.2 復旧後 procedure (CEO 操作、本 docs は AI が事前に整理)

```bash
# (1) suspension 解除確認
gh auth status

# (2) Phase 2-A push & merge
git checkout feat/alter-plan-phase2-a-calendar-week-strip
git push origin feat/alter-plan-phase2-a-calendar-week-strip
# → PR #223 自動更新、CI / CEO review → merge

# (3) Phase 2-B push & merge
git checkout feat/alter-plan-phase2-b-flow-list
# (5-a/b/c) Phase 2-A の merge 方式に応じて rebase
git rebase main  # or `git rebase --onto main 6e37ad38 ...` (Squash の場合)
git push -u origin feat/alter-plan-phase2-b-flow-list
# 新 PR 起票、CI / CEO review → merge

# (4) Phase 2-C docs push & merge (本 PR)
git checkout docs/alter-plan-phase2-c-map-tab-mini-design
git rebase main  # or `--onto` (Phase 2-B merge 方式に応じて)
git push -u origin docs/alter-plan-phase2-c-map-tab-mini-design
# 新 PR 起票、CI (docs only なので軽い) / CEO review → merge

# (5) (実装 wave 着手後) Phase 2-C impl branch push & merge
git checkout feat/alter-plan-phase2-c-map-tab  # 本 docs merge 後に切る
git rebase main
git push -u origin feat/alter-plan-phase2-c-map-tab
# 新 PR 起票、CI / CEO review → merge
```

### 16.3 merge 方式の柔軟性 (Phase 2-B §16 と同 pattern)

Phase 2-B mini design §16 と同じく、Phase 2-A / 2-B / 2-C docs / 2-C impl のいずれの merge 方式 (Merge commit / Squash / Rebase merge) でも `--onto` 含む 3 方式すべて対応可能。CEO は復旧時の repo 設定 / 状況に合わせて選んで OK。

### 16.4 復旧前の禁止事項 (継続)

- ❌ `git push` / `git pull` / `git fetch`
- ❌ `gh auth login` / `gh pr` (任意の gh コマンド)
- ❌ `git branch -D` / `git branch -d` / `git checkout -B`
- ❌ `git reset --hard` / `git checkout --` / `git restore .` / `git clean -f` / `git stash`
- ❌ Phase 2-A branch / Phase 2-B branch / Phase 2-C docs branch (本 branch) 以外への commit
- ❌ local main (`main`) への commit
- ❌ Phase 2-A / Phase 2-B 凍結 branch への追加 commit (本 docs PR で違反検出時は revert)

### 16.5 復旧前にできること (継続)

- ✅ 本 PR (Phase 2-C mini design docs) への補正 commit (必要なら複数 commit OK)
- ✅ CEO レビュー → 判断 1-10 確定 → 別 branch で Phase 2-C 実装着手
- ✅ Phase 2-C 実装 branch を本 docs branch から派生 (= 4 段 stacked)
- ✅ local test (`npx tsc --noEmit` / `npx vitest run` / `npm run build`)
- ✅ CEO local smoke

---

## 17. 変更履歴

| 日付 | 変更 | 承認 |
|------|------|------|
| 2026-05-20 | Phase 2-C (MapTab 「自分の地理」 view) mini design 起票、GitHub suspension 中 local-first 運用、Phase 2-B impl branch (99e7c02a) の上に stack、Phase 2-A / 2-B branch とは完全分離。Google Maps 不採用 (ExternalAnchor 座標なし + PR #31 reject 前例 + CEO 哲学整合)、既存 helper 100% 流用、最小安全設計。CEO 判断点 10 件 + Beyond 改善 12 件 (hint visible / frequency natural voice / time signature / empty stillness / per-category add for empty / static ALTER card / FAB / header copy / sensitive privacy / restraint UI / a11y / reduced-motion) | CEO レビュー待ち (GitHub 復旧後) |

---

**End of Mini Design**. CEO レビュー → 判断 1-10 → 実装 wave (3 commits) GO/NO-GO 判断をお待ちします。

復旧前に既に許可された範囲は §6.1 + §16.5、復旧後手順は §16.2-16.3。実装は 4 段 stacked branch (Phase 2-A → Phase 2-B → Phase 2-C docs → Phase 2-C impl) で安全に進行可能。実装中に Google Maps API key / migration / env 変更が必要になった瞬間、本 wave を中断して CEO 確認に戻る (§5.3 のトリガー)。
