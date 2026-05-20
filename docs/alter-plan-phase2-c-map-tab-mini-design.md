# Alter Plan Phase 2-C — MapTab「自分の地理」 Mini Design (v2: Google Maps あり本命)

**作成日**: 2026-05-20
**Status**: v2 採択待ち (CEO 補正により v1 から大幅改訂、補正後 GO/NO-GO 判断待ち)
**branch**: `docs/alter-plan-phase2-c-map-tab-mini-design` (Phase 2-B impl branch の上に stack、GitHub suspension 中の local-first 運用)
**実装範囲**: 本 PR は **docs only**。実装は CEO 承認後の別 PR (stacked branch、推定 1 PR / 3 commits)

**version 履歴 (本 file 単独の改訂)**:
  - **v3 (2026-05-20、本 commit)**: **GPT 補正 4 件 + 自立推論で追加した強化点 5 件を反映**。v2 の方向 (Google Maps あり 本命) は維持し、コスト・プライバシー・Alter Morning 不可触の規律を明文化。具体: ①cost を確定値から hypothesis に格下げ ②privacy-safe payload を strict spec で明記 ③Script loader 推奨を「shared module 抽出 (option A)」 から「Plan 側独立 loader (option B/C 統合)」 に変更 (MorningMapView 不可触保証) ④rate limit / ownership check / input validation / lazy resolve / normalized dedupe / optimistic UI / confidence guard / browser key restriction を §5.7-5.9 に追加 ⑤§20 GO condition checklist 新設
  - v2 (2026-05-20、commit 86f7c25e、本 commit で更新): Google Maps あり 本命に redirect、既存 Alter Morning 資産 (Places API client / 2-layer cache / vanilla JS script loader / NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY) 流用方針確立
  - v1 (2026-05-20、commit 59dbb3c5、**撤回**): Google Maps なし semantic-only 設計、empirical audit 不足で overly conservative

**前提**:
  - Phase 1 完全 PASS (PR #219 + W1-Z apply 済)
  - **Phase 2-A 実装完了** (`feat/alter-plan-phase2-a-calendar-week-strip`、5 commits、CEO local smoke PASS、6e37ad38 で凍結)
  - **Phase 2-B 実装完了** (`feat/alter-plan-phase2-b-flow-list`、3 commits、CEO local smoke PASS、99e7c02a で凍結)
  - 本 branch は Phase 2-B impl branch の上に stack (CEO 補正)、Phase 2-A / Phase 2-B branch とは完全分離

**関連**:
  - `docs/alter-plan-phase2-a-calendar-month-view-mini-design.md` (Phase 2-A mini design、CalendarTab refactor の前例)
  - `docs/alter-plan-phase2-b-flow-list-mini-design.md` (Phase 2-B mini design、CEO 補正 1-3 + Beyond 改善 + 静的 ALTER card pattern の前例)
  - `app/(culcept)/plan/tabs/MapTab.tsx` (本命修正対象、現 194 行)
  - `app/(culcept)/plan/tabs/_helpers.ts` (helper、本 wave で軽量拡張)
  - `lib/plan/external-anchor.ts` (ExternalAnchor 型、lat/lng なし、本 wave で touch なし)
  - `components/home/morning/MorningMapView.tsx` (vanilla Google Maps JS script loader pattern、本 wave で参照 + 抽出して reuse)
  - `lib/alter-morning/placesApiClient.ts` (Google Places API Text Search、本 wave で server-side endpoint から流用)
  - `lib/alter-morning/placeResolver.ts` (2-layer cache + resolver、本 wave で `getCachedResolution` / `setCachedResolution` を流用)
  - `lib/alter-morning/placeCacheStore.ts` (Supabase L2、既存 table `place_resolution_cache` migration 20260416100000 既適用、本 wave で touch なしで利用)
  - `lib/alter-morning/locationResolver.ts` (PREFECTURE_COORDS / municipalityCoords fallback、本 wave で参照可能性あり)
  - CEO 方針: 「Alter Morning 用 API 資産は Alter Plan で普通に使ってよい」「使える資産は積極流用」「@vis.gl/react-google-maps は NG (PR #31 timeout)、vanilla JS API は OK」

---

## 0. ゴール (v2、CEO 補正反映)

### 0.1 v1 撤回 → v2 redirection の経緯

v1 (commit 59dbb3c5) は「Google Maps なし、semantic category grid」 で設計したが、CEO 補正 (2026-05-20):

> Alter Morning 用 API 資産は Alter Plan で普通に使ってよい。
> Google Maps API も既にあるなら使ってよい。
> 使える資産は積極使うべき。

を受けて、empirical audit を再実施。**Alter Morning が既に保有する Google Maps 統合資産** が判明:

| 資産 | 用途 | 本 wave 流用 |
|------|------|--------------|
| `placesApiClient.searchPlacesByText` | Google Places API (New) Text Search | ✅ |
| `placeResolver.getCachedResolution` | L1 (in-memory) + L2 (Supabase) cache 読み込み | ✅ |
| `placeResolver.setCachedResolution` | L1 + L2 cache 書き込み (L2 は fire-and-forget) | ✅ |
| `placeCacheStore` の Supabase `place_resolution_cache` table | 永続 cache、migration 20260416100000 既適用、30 日 TTL | ✅ (touch なしで利用) |
| `MorningMapView` 内 vanilla JS script loader pattern | `script.id="alter-morning-gmaps"` singleton、failsafe、`NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` 利用 | ✅ (抽出 + 共有 module 化、もしくは inline 再現) |
| `MorningMapView` 内 pure helpers (`isValidCoord` / `isSamePointCluster` / `computeBounds`) | pin 描画前提条件チェック | ✅ (再 export または import) |
| `GOOGLE_MAPS_API_KEY` (server-side env) | Places API 認証 | ✅ (既存 env、追加なし) |
| `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` (browser-side env) | Maps JS API 認証 | ✅ (既存 env、追加なし) |
| `lib/shared/location.ts` の `PREFECTURE_COORDS` | 都道府県 fallback 座標 (47 都府県) | ✅ (必要時に参照) |
| `lib/shared/municipalityCoords.ts` の `getMunicipalityCoords` | 市区町村 fallback 座標 | ✅ (必要時に参照) |

→ v1 結論「Google Maps なし」 は overly conservative。**v2 = Google Maps あり本命** に補正。

### 0.2 CEO 方針の本質 (v1 から維持)

> Phase 2-C は「地図アプリ」ではなく「自分の地理」。
> pin は単なる場所ではなく、生活の意味を持つ点として扱う。
> category / locationCategory / anchor を活かす。

これは v2 でも変わらない。重要な変化:
- v1: 「地図アプリではない = 地図そのものを使わない」 と過剰一般化
- **v2**: 「地図アプリではない = 地図 を 自分の地理 のキャンバスとして使う」 ← 正しい解釈

「地図アプリ」 (Apple Maps / Google Maps consumer) は「他人事の地理」(全世界対象、generic)。**Aneurasync の MapTab は「私の地理」 (my anchors only、my categories、my voice) を Google Maps の地理キャンバスの上に重ねる**。これが distinct contribution。

### 0.3 v2 の goal (実装する範囲)

| 達成 | 詳細 |
|------|------|
| **Google Maps view を MapTab に統合**、anchor を pin として描画 | vanilla JS script loader (MorningMapView pattern) + `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` (既存) |
| **locationText → 座標解決を server-side endpoint で集約**、cache reuse | 新 `app/api/plan/anchors/geocode/route.ts` 1 ファイル、内部で `placesApiClient` + `placeResolver` cache を call。新 dep / migration / env なし |
| **semantic category overlay** (category 別 pin color / icon、voice integration) | v1 で設計した CATEGORY_META.hint + frequency voice + time signature を pin and panel に統合 |
| **semantic fallback list** (座標解決できない anchor を地図下に list 表示) | locationText 曖昧 / 空 / Places API miss の anchor は地図に pin を出さず、下部 list 表示 |
| **CalendarTab / FlowTab との役割分離** | 時間軸 (Calendar/Flow) ≠ 空間軸 (Map)、3 レンズ pattern (v1 から維持) |
| **完全 local-first 実装可能** | Phase 2-A / Phase 2-B と同様 GitHub 復旧待ちの間に C1-C3 を local commit のみで完了 |
| **migration / 新 env / 新 dep / @vis.gl すべてなし** | 既存資産流用、新規追加 0 |

### 0.4 Phase 2-C で **やらないこと** (CEO 制約)

#### 削除 (v1 から、v2 では制約解除)

- ~~❌ Google Maps integration~~ → **使う** (v2、CEO 補正)
- ~~❌ Real-map 描画~~ → **使う** (v2)
- ~~❌ locationText → 座標解決~~ → **既存 Alter Morning Places API + cache を流用する** (v2)

#### 維持 (v1 から継続、v2 でも禁止)

- ❌ **`@vis.gl/react-google-maps` dep 追加** (PR #31 で Vercel build 45:22 timeout、vanilla JS API のみ採用)
- ❌ **ExternalAnchor 型に lat / lng / geo_point field 追加** (migration、別 wave)
- ❌ **新 migration ファイル追加** (既存 `place_resolution_cache` table 流用は migration ではない、新 table / column 追加禁止)
- ❌ **新 env 追加** (`NEXT_PUBLIC_*MAPS*` の Plan 専用 key 追加 / 既存外の新 key)
- ❌ **新 dep install** (geo / map 系ライブラリ、`leaflet` / `mapbox-gl` / `@vis.gl/react-google-maps` 等)
- ❌ **Production / all-Preview env 変更**
- ❌ **service_role / DB password / connection string 使用**
- ❌ **CoAlter / Mirror / /talk / D-* / W1-6 / DraftPlan / fallback path 関連**
- ❌ **Phase 2-A / Phase 2-B branch への追加 commit** (本 PR は別 branch)
- ❌ **Phase 2-A の CalendarTab / Phase 2-B の FlowTab の改修**
- ❌ **HomeSwipeContainer / PlanClient / Modal logic 変更** (CalendarTab / FlowTab refactor と同 pattern、touch なし)
- ❌ **AddAnchorModal の signature 変更** (既存 `initialState` / `contextSubtitle` を流用)
- ❌ **Phase 3 ALTER 提案 flow 動作実装** (本 wave は静的 placeholder のみ、Phase 2-B と同)
- ❌ **`MorningMapView.tsx` の改修** (Alter Morning 側の component、本 wave touch なし。Plan 側で再実装または pure helper のみ import)
- ❌ **`placeResolver` 等の改修** (Alter Morning 側、本 wave で API call のみ、内部 logic touch なし)
- ❌ **`place_resolution_cache` table への schema 変更** (column 追加 / index 追加すべて NG)
- ❌ **real-time location tracking** / ユーザーの GPS 取得 (Layer 3 GPS は locationResolver で「未実装」プレースホルダー、本 wave スコープ外)
- ❌ **長押し quick action menu** (Phase 2-B と同 defer)
- ❌ **MapTab を default tab に変更** (現在 Calendar = default 維持)

---

## 0.5 v2 → v3 補正 (GPT 補正 4 件 + 自立推論強化 5 件)

### 0.5.1 GPT 補正 4 件 (本 v3 で全面採用)

#### 補正 1: Cost は hypothesis 扱い

- v2 で「$3.8/user/month」 を提示したが、Google Places API は SKU 別 (Text Search / Autocomplete / Details / Nearby Search 等) で usage-based pricing
- 単価は Google 公式 (https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) で SKU ごとに設定、cache hit 率 / 検索パターン / 月次 quota free tier で実測値は変動
- v3 では **$3.8 を illustrative hypothesis として扱い、確定値 / commitment ではない** ことを明示。actual cost は実装後に Google Cloud Console + Vercel analytics で観測
- v3 §11.13 / §14 判断 4 / §19 (中断 trigger) で具体的に表現

#### 補正 2: Privacy-safe payload (`locationText` only)

- v2 の geocode endpoint 設計は `{ anchorId, locationText }` のみ受け取る形だが、明示的な spec / validation がない
- v3 で以下を必須:
  - **入力 schema strict validation**: `{ items: [{ anchorId, locationText }] }` のみ受理、extra field reject (zod or 手書き)
  - **Anchor ownership check**: server-side で auth user の所有 anchor のみ resolve、他 user の anchor ID は 403
  - **Outbound API payload は最小限**: Places API への送信は `{ textQuery: locationText }` のみ。anchor.title / notes / sensitiveCategory / 会話履歴 / userId は **絶対送らない**
  - **Audit log には sensitive data を残さない**: log は anchorId + outcome (resolved / unresolved / cache_hit) のみ、locationText 実値 / Places API レスポンス body は log しない
- v3 §5.2 + §5.8 で具体仕様

#### 補正 3: MorningMapView 不可触 (behavior-preserving)

- v2 は「Script loader option A: shared module 抽出 + MorningMapView refactor」を推奨だが、これは **MorningMapView の挙動を変える risk を内包** (loader hook の分離 + analytics emit の場所変更 + script.id 変更可能性)
- GPT 指摘: Plan 側に minimal 独立 loader を作る方が **Alter Morning regression risk 0** で安全
- v3 で **推奨を変更**:
  - **default 推奨: Plan 側 独立 loader** (新 file `lib/shared/googleMapsLoader.ts` を **新規作成**、MorningMapView は touch しない、両 component が独立に script tag injection + 同 SCRIPT_ID で singleton 共有)
  - **option (CEO 別判断時のみ)**: shared module 抽出 + MorningMapView refactor を完全 behavior-preserving (analytics emit / 既存 SCRIPT_ID / load fail handler 等) で実施
- v3 §5.1 / §14 判断 2 で recommendation 反転

#### 補正 4: @vis.gl / 新 env / 新 migration / 新 dep 禁止 (再確認)

- v2 で既に明示済、v3 で再確認 + 中断 trigger §19 に閾値を追加

### 0.5.2 自立推論で追加した強化点 5 件 (本 v3 で新規導入)

#### 強化 1: Per-user rate limit (DoS / cost spike 防御)

- server-side で auth user 当たり **max 100 geocode calls / hour** (CEO 判断、§14 候補)
- 超過時は 429 Too Many Requests + Retry-After header
- client は fail-open (= semantic fallback)
- 悪意あるユーザー or bug による暴走を server で遮断
- v3 §5.2 / §5.7 で実装仕様

#### 強化 2: Anchor ownership check (server-side authorization)

- request body の anchorId 群が auth user の所有 anchor かを server で verify
- 他 user の anchor ID は 403 Forbidden (or silently 除外、CEO 判断 §14)
- Supabase RLS と二重防御
- v3 §5.2 / §5.8 で仕様

#### 強化 3: Input schema strict validation

- 入力 body は `{ items: [{ anchorId, locationText }] }` のみ受理
- extra field (例: `title`、`notes`、`sensitiveCategory`) があれば即 400 Bad Request
- locationText の trim / max length 制限 (e.g. 300 文字)
- v3 §5.2 で実装

#### 強化 4: Lazy resolve + Normalized dedupe + Optimistic UI

- **Lazy resolve**: 全 anchor を一括 resolve せず、windowDays (default 14) 内に occurrence がある anchor のみ送信。Phase 2-C+ で windowDays toggle 追加時に on-demand 追加 resolve
- **Normalized dedupe**: 同一 locationText (whitespace / casing / 半角全角 normalize 後) を持つ複数 anchor → 1 Places API call で全て解決
- **Optimistic UI**: MapTab mount 時、まず CategoryGrid + UnresolvedAnchorsSection を render (semantic 即可)、Map view は geocode 完了次第 populate (= 「Map が出るまで何も見えない」 を回避)
- v3 §5.7 / §5.9 で実装

#### 強化 5: Cached low-confidence guard + Browser key domain restriction

- **Cached low-confidence guard**: `placeResolver` の cache は Alter Morning 側で "low" confidence entry も保存される可能性がある。Plan は **cache read 時に confidence < medium なら unresolved 扱い** (semantic fallback に move) で誤 pin を回避
- **Browser key domain restriction**: `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` は JS bundle に露出する → Google Cloud Console で **allowed referrers = aneurasync 本番 / preview domain** に制限することを §11.13 + §17 後手順で確認 (本 wave 実装範囲外、CEO 操作要件)
- v3 §5.8 / §11.13 で記載

### 0.5.3 v3 の最終 stance

| 観点 | v3 stance |
|------|-----------|
| Google Maps view 採用 | ✅ (v2 と同) |
| `@vis.gl/react-google-maps` | ❌ (v1/v2/v3 一貫) |
| 既存 Alter Morning 資産流用 | ✅ (v2 と同、ただし MorningMapView **不可触**) |
| 新 migration / 新 env / 新 dep | ❌ (v1/v2/v3 一貫) |
| Script loader 戦略 | **Plan 側独立 loader (本 v3 で推奨変更)** |
| Cost 表記 | hypothesis only、確定値ではない (本 v3 で明示) |
| Privacy payload | `locationText` only + strict validation + ownership check (本 v3 で明文化) |
| Rate limit | per-user 100 calls / hour (本 v3 で新設) |
| Lazy resolve + dedupe + optimistic UI | (本 v3 で新規) |

---

## 1. 既存 Alter Morning 資産 audit (流用範囲の確定)

### 1.1 server-side API resources (本 wave で API call 流用)

#### 1.1.1 `placesApiClient.searchPlacesByText`

```ts
// lib/alter-morning/placesApiClient.ts
export async function searchPlacesByText(options: {
  textQuery: string;
  locationBias?: { lat: number; lng: number; radius: number };
  languageCode?: string;
  maxResultCount?: number;
}): Promise<PlacesApiPlace[]>

interface PlacesApiPlace {
  id: string;
  displayName: { text: string; languageCode: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude: number; longitude: number };  // ← Plan MapTab pin 用
  types?: string[];
  businessStatus?: string;  // OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
}
```

**特性**:
- server-side のみ (uses `process.env.GOOGLE_MAPS_API_KEY`)
- cost-optimized: Basic field mask (~$0.032/req)、`maxResultCount=5` default
- `isPlacesApiAvailable()` で事前チェック可能 (key 未設定時は false、fail-open)
- fail 時 throw、resolver 側 catch → fail-open

**Plan 流用方針**: 新 server-side endpoint (§5.2) から薄く呼び出すのみ。internal logic touch なし。

#### 1.1.2 `placeResolver.getCachedResolution` / `setCachedResolution`

```ts
// lib/alter-morning/placeResolver.ts
export async function getCachedResolution(
  userId: string,
  placeText: string,
  area?: string,
): Promise<PlaceResolutionCacheEntry | null>

export async function setCachedResolution(
  userId: string,
  placeText: string,
  area: string | undefined,
  entry: Omit<PlaceResolutionCacheEntry, "cachedAt" | "lastUsedAt" | "useCount">,
): Promise<void>

interface PlaceResolutionCacheEntry {
  resolvedName: string;
  address?: string;
  placeId?: string;
  lat?: number;  // ← Plan MapTab pin 用
  lng?: number;  // ← Plan MapTab pin 用
  confidence: ResolutionConfidence;
  cachedAt: string;
  lastUsedAt: string;
  useCount: number;
}
```

**特性**:
- 2-layer cache: L1 (in-memory Map) → miss → L2 (Supabase `place_resolution_cache`)
- L1 hit → 高速 path
- L2 hit → L1 に書き戻し → return
- write: L1 + L2 (L2 は fire-and-forget)
- 30 日 TTL (`CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000`)
- key: `userId:placeText.lower():area.lower()` (`cacheKey()` 内部関数)
- fail-open: L2 障害時は L1 のみで動作継続
- low / unresolved は L2 に保存しない (アプリ層で制御)

**Plan 流用方針**: そのまま使う。`userId` は requesting user、`placeText` は anchor.locationText、`area` は user の baseline prefecture (optional、§5.3)。

#### 1.1.3 `placeCacheStore` の Supabase L2 table

```sql
-- supabase/migrations/20260416100000_place_resolution_cache.sql (既適用)
CREATE TABLE place_resolution_cache (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  place_text TEXT NOT NULL,
  coarse_area TEXT NOT NULL,
  resolved_name TEXT NOT NULL,
  address TEXT,
  place_id TEXT,
  place_type TEXT,
  confidence TEXT,
  source TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  use_count INT,
  created_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);
```

**特性**:
- migration 既適用 (Production / staging 両方)
- user_id RLS あり想定 (placeCacheStore 内 query は user_id 指定)
- `lat`, `lng` column 既存 → Plan の pin 描画にそのまま使える

**Plan 流用方針**: **touch なし**。`placeResolver.getCachedResolution` / `setCachedResolution` 経由でのみ参照。**schema 変更禁止** (column 追加 / index 追加すべて NG)。

#### 1.1.4 `locationResolver` の fallback coords

```ts
// lib/alter-morning/locationResolver.ts
export function resolveLayer1(base: SavedBase | null): ResolvedOrigin

// fallback chain:
// - layer1_city: baseline.prefecture + baseline.city → municipalityCoords
// - layer1_prefecture: baseline.prefecture → PREFECTURE_COORDS
```

```ts
// lib/shared/location.ts
export const PREFECTURE_COORDS: Record<Prefecture, LatLng>  // 47 都道府県
```

```ts
// lib/shared/municipalityCoords.ts
export function getMunicipalityCoords(prefecture, city): LatLng | null
```

**Plan 流用方針**: Phase 2-C v2 で **採用しない** (= 使わない)。
- 理由 1: anchor.locationText が空 or 解決不可なら **semantic fallback list に回す** が筋 (artificial coord を出すと「ここに行ったことになる」 という嘘になる)
- 理由 2: locationResolver の 3-layer は Alter Morning の routing 用 (origin / endpoint 算出)、Plan MapTab の pin (= anchor の場所) と用途が異なる
- 例外: 将来 wave で「ユーザーの活動範囲を bounds で限定する」 機能を追加するなら、baseline-based bounds に使える (本 wave スコープ外)

### 1.2 client-side resources (本 wave で抽出 / 再現)

#### 1.2.1 `MorningMapView.tsx` の vanilla JS script loader pattern

```ts
// components/home/morning/MorningMapView.tsx (要点抜粋)
const browserKey = process.env.NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY;
const SCRIPT_ID = "alter-morning-gmaps";
const SCRIPT_URL_BASE = "https://maps.googleapis.com/maps/api/js";

useEffect(() => {
  if (!browserKey || typeof window === "undefined") return;
  if (window.google?.maps) { setMapsReady(true); return; }

  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    existing.addEventListener("load", () => setMapsReady(true), { once: true });
    return;
  }

  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.async = true;
  script.defer = true;
  script.src = `${SCRIPT_URL_BASE}?key=${encodeURIComponent(browserKey)}`;
  script.addEventListener("load", () => setMapsReady(true), { once: true });
  script.addEventListener("error", () => { /* graceful */ }, { once: true });
  document.head.appendChild(script);
}, [browserKey]);
```

**Plan 流用方針 (3 候補、CEO 判断 §14)**:

- **A. shared module 抽出 (推奨)**: `lib/shared/googleMapsLoader.ts` を新規作成、MorningMapView と Plan MapTab 両方が import。SCRIPT_ID は単一 ("alter-morning-gmaps" を維持 or "aneurasync-gmaps" にリネーム)、load 状態 hook (`useGoogleMapsScript()`) を提供
- B. Plan 側 inline 再現 (= MorningMapView の loader code をコピー)、SCRIPT_ID は別 (例: "alter-plan-gmaps")。両 component 独立 load (DRY 違反、script 2 個になり cost も増える)
- C. Plan 側 inline 再現、SCRIPT_ID は同 ("alter-morning-gmaps")。両 component が同 script を share、後 mount 側が既存 script を待つ (簡素だが loader 重複)

A 推奨。既存 MorningMapView を refactor して shared loader を使うように更新する必要があるが、これは「Alter Morning touch なし」 制約と衝突する → CEO 判断必要。代替で B / C も可。

#### 1.2.2 `MorningMapView.tsx` の pure helpers

```ts
// すべて export 済、test 確認済
export function isValidCoord(c): boolean
export function extractPins(events): PinPoint[]
export function extractPinsFromPlanItems(items): PinPoint[]
export function extractJourneyPins(origin, end): PinPoint[]
export function composeJourneyPinList(journeyPins, eventPins): PinPoint[]
export function isSamePointCluster(pins): boolean
export function computeBounds(pins): { north, south, east, west } | null
```

**Plan 流用方針**:
- `isValidCoord`, `isSamePointCluster`, `computeBounds` は **直接 import** (汎用 pure logic)
- `extractPins*` / `extractJourneyPins` は Morning-specific (events / planItems / journey 用)、Plan は別 helper (`extractAnchorPins`) を C1 で新規作成

### 1.3 env / secrets (本 wave で touch なし)

| env | 種別 | 利用箇所 | Plan で touch |
|-----|------|---------|---------------|
| `GOOGLE_MAPS_API_KEY` | server-side | `placesApiClient` / `routesApiClient` 等 | **既存 env を server endpoint から indirect 利用** (placesApiClient call の deep 経由、Plan の code から直接 `process.env.GOOGLE_MAPS_API_KEY` を読まない) |
| `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` | browser-side (public、bundle に入る) | `MorningMapView` | **既存 env を Plan MapTab で直接 utilize** (script loader URL に注入) |

→ **新 env 追加なし**。命名が "ALTER_MORNING_" prefix なのは由来であり、Plan 用に rename したくなった場合は **CEO 確認に戻る** (§19 中断 trigger)。本 wave では prefix 維持で利用。

### 1.4 結論: 流用可能性

| 観点 | v1 想定 (撤回) | v2 (本 mini design) |
|------|---------------|---------------------|
| API key 追加 | 「Plan 用に必要」 | **不要** (既存 env 流用) |
| migration 追加 | 「lat/lng 追加に必須」 | **不要** (既存 cache table 流用、anchor schema 不変) |
| 新 dep | 「`@vis.gl/react-google-maps` 等」 | **不要** (vanilla JS script tag) |
| 座標解決 | 「Reverse Geocoding service が必要」 | **不要** (既存 Places API + cache を server endpoint 経由で reuse) |
| 永続 cache | 「新 table 必要」 | **不要** (既存 `place_resolution_cache` table 流用) |
| build performance | 「@vis.gl で timeout」 | **影響 0** (vanilla script tag は runtime load) |

→ **v2 は migration 0 / 新 env 0 / 新 dep 0 / 新 table 0** で実現可能。CEO 補正の「最小安全設計」 整合。

---

## 2. 現在の MapTab 構造 (read-only audit、v1 から維持)

### 2.1 ファイル

| layer | path | 役割 |
|-------|------|------|
| component | `app/(culcept)/plan/tabs/MapTab.tsx` (194 行) | 地理レンズ (自分の聖地マップ)、locationCategory 別 anchor group view (現状 = 地図 なし) |
| helper | `app/(culcept)/plan/tabs/_helpers.ts` | `groupAnchorsByLocation` / `CATEGORY_META` / `SENSITIVE_LABEL` / `LOCATION_GROUP_ORDER` 等を再利用 |
| parent | `PlanClient.tsx` | data fetch、Modal 制御、callback |

### 2.2 既存 helper (本 wave で 100% 維持、touch なし)

- `groupAnchorsByLocation(anchors, start, end): CategoryGroup[]` — category 別集計
- `LOCATION_GROUP_ORDER`: 9 categories 順序
- `categoryOf(anchor)`: locationCategory → LocationGroupKey
- `CATEGORY_META`: 9 categories × { label, emoji, hint }
- `SENSITIVE_LABEL`: AnchorSensitiveCategory → label
- `countOccurrences(anchor, start, end)`: recurring 展開 + exception_dates + validity

### 2.3 CATEGORY_META = 「意味の地理」 のソース of truth (v1 から維持)

```ts
home:    🏠 自分の聖域      cafe:    ☕ ひと息の場
office:  🏢 労働の場        outdoor: 🌿 外の空気
school:  🎓 学びの場        public:  🏛️ 市民の場
transit: 🚃 通り道          unknown: 📍 場所カテゴリ未設定
none:    ·  場所が指定されていない予定
```

v1 で導入した「hint を visible voice として表示」 は v2 でも維持。**地図 (Google Maps) の上に重ねる category overlay + voice panel** の核データ。

### 2.4 ExternalAnchor 型 (lat/lng なし、本 wave で touch なし)

```ts
interface ExternalAnchorBase {
  id, userId, title, startTime, endTime?,
  locationText?,        // 自由 string ("スターバックス 代官山店")
  locationCategory?,    // enum 8 種
  rigidity, sourceId, confirmedAt, confidence?, sensitiveCategory?
}
```

- **lat / lng なし** → migration 追加せず、render-time に locationText から座標解決
- **既存 schema 不変** → Phase 2-A / Phase 2-B / 他 feature への影響 0

---

## 3. CEO mock との差分 (v2、Google Maps 統合)

### 3.1 想定 mock (v2、Google Maps view 含む)

```
あなたの地理 (or "聖地マップ" etc.、§14 判断 1)
今後 14 日間で訪れる場所

┌────────────────────────────────────────┐
│ [Google Map (height: ~280px)]          │  ← Google Maps view (vanilla JS API)
│                                         │
│       📍 (pin: 🏠 home anchor)         │
│   📍 (pin: 🏢)                          │
│           📍 (pin: ☕)                  │
│   📍 (pin: 🚃)                          │
│                                         │
│   [fitBounds で全 pin を含む zoom]       │
└────────────────────────────────────────┘

カテゴリ概要 (semantic overlay panel、map と並ぶ or 下)
┌──────────────────┐  ┌──────────────────┐
│ 🏠 家             │  │ 🏢 職場           │
│ 自分の聖域         │  │ 労働の場          │
│ 週 7 回 · 朝晩中心  │  │ 週 5 回 · 9-18 中心│
│ ─────             │  │ ─────             │
│ 朝食 × 7 (📍 maps)│  │ 定例会議 × 3 (📍) │
│ 夕食 × 6 (📍 maps)│  │ 個人作業 × 5 (📍) │
│ + ここでの予定を   │  │ + ここでの予定を   │
└──────────────────┘  └──────────────────┘

座標解決できない予定 (semantic fallback、地図に出ない)
┌────────────────────────────────────────┐
│ 📂 場所が曖昧 / 未指定                  │
│ "近所のカフェ" × 2 (☕ カフェ category) │  ← 解決失敗の anchor
│ "公園で散歩" × 1 (🌿 屋外 category)     │
│ + 場所をはっきりさせる                  │  ← optional add link
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ 静的 ALTER 提案 card (Phase 2-B 整合)   │
│ "あなたの地理を、ALTER が..."           │
│ (Phase 3 で動作予定)                    │
└────────────────────────────────────────┘

                                      [+]
                                     FAB
```

### 3.2 現 MapTab → Phase 2-C v2 の差分 matrix

| 項目 | 現 MapTab (W1-5 + W1-X3) | Phase 2-C v2 | 差分種別 |
|------|---------------------------|--------------|----------|
| **地図 view** | なし (地図 API 不採用) | **vanilla Google Maps JS API で view 表示** (height ~280px、fitBounds 自動) | **新規追加** |
| **anchor pin** | なし | **locationText 解決 anchor に pin、category color / icon overlay** | **新規追加** |
| **座標解決** | なし | **server-side endpoint 経由で Places API + cache** | **新規 endpoint 追加** |
| **解決不可 anchor** | 全 anchor をリストに含めるだけ | **「曖昧 / 未指定」 専用 section に分離**、地図には出さない | **新規構造** |
| **category cards** | 縦 1 列 list | **2 列 grid** (v1 で設計、v2 でも維持)、map の下に配置 | 構造変更 |
| **frequency / time signature** | "N 日で X 回" | **"週 N 回 · 朝晩中心" 等の voice** (v1 で設計、v2 維持) | 表現変更 |
| **empty category** | 隠す | **静かなトーンで表示** ("今は静か"、v1 で設計、v2 維持) | 構造変更 |
| **静的 ALTER 提案 card** | なし | **末尾に static placeholder** (v1 で設計、v2 維持) | 新規 |
| **FAB** | なし | **追加** (v1 で設計、v2 維持) | 新規 |
| **header copy** | "あなたの聖地マップ" | **CEO 判断 §14** (5 候補) | 用語確認 |

---

## 4. MapTab 完成形 (v2)

### 4.1 全体構造

```tsx
<MapTab>
  ├ <header>
  │   ├ <h2>あなたの地理</h2>  (or CEO 確定 copy)
  │   └ <p>今後 14 日間で訪れる場所</p>
  ├ <PlanMapView>  ← 新 component (vanilla Google Maps JS API)
  │   ├ Google Maps script loader (singleton)
  │   ├ map mount + fitBounds + markers (category-themed)
  │   ├ marker tap → onAnchorClick (AnchorDetailModal)
  │   └ failsafe: script load fail / browserKey 不在 / pins<2 → empty placeholder
  ├ <CategoryGrid>  ← v1 で設計、v2 維持
  │   └ {LOCATION_GROUP_ORDER.map(cat => <CategoryCard ... />)}
  ├ <UnresolvedAnchorsSection>  ← 新 component (semantic fallback list)
  │   └ {unresolved.map(a => <UnresolvedAnchorRow ... />)}
  ├ <StaticAlterSuggestionCard>  (v1 維持、CEO 補正 #2 整合)
  └ <FAB>  (v1 維持)
</MapTab>
```

### 4.2 PlanMapView (新 component)

```tsx
function PlanMapView({
  anchors,          // ExternalAnchor[]
  resolutions,      // Map<anchorId, { lat, lng, confidence } | null>  座標解決結果
  onAnchorClick,    // (anchor) => void
}: {...}) {
  // (1) script loader (MorningMapView の pattern 流用)
  const { ready, key } = useGoogleMapsScript();  // shared loader hook (§5.1 候補 A の場合)

  // (2) resolvable anchors のみ pin 化
  const pins = useMemo(() => {
    const out: AnchorPin[] = [];
    for (const a of anchors) {
      const r = resolutions.get(a.id);
      if (!r || !isValidCoord({ lat: r.lat, lng: r.lng })) continue;
      out.push({ anchor: a, coord: { lat: r.lat, lng: r.lng } });
    }
    return out;
  }, [anchors, resolutions]);

  // (3) fallback: pins<2 or 全 same point → map mount しない (Morning と同 pattern)
  const allSamePoint = isSamePointCluster(pins.map(p => p.coord));
  const bounds = computeBounds(pins.map(p => p.coord));

  // (4) failsafe states:
  if (!key) return <MapKeyMissingPlaceholder />;     // browserKey 未設定
  if (!ready) return <MapLoadingPlaceholder />;      // script loading
  if (pins.length === 0) return <MapNoPinsPlaceholder />;  // 解決済み anchor なし
  if (pins.length < 2) {
    // 1 pin only: single-point center + default zoom
    return <SinglePinMap pin={pins[0]} />;
  }

  // (5) full map view
  return <FullMapView pins={pins} bounds={bounds} onPinClick={onAnchorClick} />;
}
```

**設計判断**:
- `height: ~280px` (CEO 判断 §14 候補 80 / 180 / 280 / 360px)
- `gestureHandling: "cooperative"` (Morning と同、scroll 衝突回避)
- `disableDefaultUI: true` (custom layer のみ)
- markers: legacy `google.maps.Marker` (Map ID 不要、Morning と同)
- marker color / icon: category-themed (例: `🏠 home` → indigo / `🏢 office` → slate / `☕ cafe` → amber)
- marker tap: `addListener("click", () => onAnchorClick(anchor))`

### 4.3 Anchor Pin の category-themed design

```ts
// 候補: SVG icon as marker (Google Maps の Marker.icon を SVG path で指定)
const CATEGORY_MARKER: Record<LocationGroupKey, { color: string; emoji: string }> = {
  home:    { color: "#6366f1", emoji: "🏠" },  // indigo
  office:  { color: "#475569", emoji: "🏢" },  // slate
  school:  { color: "#0ea5e9", emoji: "🎓" },  // sky
  cafe:    { color: "#d97706", emoji: "☕" },  // amber
  outdoor: { color: "#16a34a", emoji: "🌿" },  // green
  public:  { color: "#7c3aed", emoji: "🏛️" }, // violet
  transit: { color: "#64748b", emoji: "🚃" },  // slate
  unknown: { color: "#94a3b8", emoji: "📍" },  // slate-400
  none:    { color: "#cbd5e1", emoji: "·" },   // slate-300
};
```

**Sensitive 配慮**: `anchor.sensitiveCategory` がある場合は emoji を `🔒` に強制置換、color は灰色 (Phase 2-B AnchorThumbnail と整合)。

### 4.4 CategoryGrid (v1 で設計、v2 維持)

§3.2 / §3.3 / §12.3 (v1 内容) を維持。grid layout、emoji 大型、hint voice visible、frequency natural language、time signature、empty as silence、per-category add link、sensitive privacy。

(v2 で削除しない、すべて v1 通り。地図の **下** に配置。)

### 4.5 UnresolvedAnchorsSection (新 component、座標解決失敗 anchor の fallback)

```tsx
function UnresolvedAnchorsSection({
  anchors,
  resolutions,
  onAnchorClick,
  onAddRequest,
}: {...}) {
  // resolution が null (Places API miss) or locationText が空の anchor
  const unresolved = useMemo(() => {
    return anchors.filter(a => {
      const r = resolutions.get(a.id);
      return !r || !isValidCoord({ lat: r.lat, lng: r.lng });
    });
  }, [anchors, resolutions]);

  if (unresolved.length === 0) return null;

  return (
    <section role="region" aria-label="場所が曖昧 / 未指定の予定">
      <header>
        <h3>📂 場所が曖昧 / 未指定</h3>
        <p className="text-xs italic text-slate-500">
          地図に出せなかった予定 — locationText がない、または Places API で特定できなかった
        </p>
      </header>
      <ul>
        {unresolved.map(a => (
          <li key={a.id} role="button" onClick={() => onAnchorClick(a)}>
            <span>{a.title} × {count}</span>
            <span className="text-xs">({CATEGORY_META[categoryOf(a)].label})</span>
            {a.locationText && <p className="text-xs">"{a.locationText}"</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

**意義**:
- 「Phase 2-C は地図アプリではなく自分の地理」 哲学整合: 解決できない anchor も「私の地理の一部」 として無視せず尊重
- ユーザーが「あ、ここ locationText が曖昧だな」 と気づく self-recognition の起点

### 4.6 静的 ALTER 提案 card (v1 維持、Phase 2-B §3.4 と同 pattern)

§3.4 (v1 内容) を維持。tap 動作なし、ボタン風 styling 禁止、role="region"。文言は CEO 判断 §14 候補 3 件。

### 4.7 FAB (v1 維持、Phase 2-A / 2-B 同 pattern)

§3.5 (v1 内容) を維持。locationCategory 未指定で AddAnchorModal 起動。`fixed bottom-20 right-6 z-30`。

### 4.8 anchor detail 導線 (W1-X5 既存、不変)

- map marker tap → `onAnchorClick(anchor)` → AnchorDetailModal
- semantic card 内 anchor row tap → 同
- unresolved row tap → 同
- 既存 `onAnchorClick` callback signature 不変、本 wave で touch なし

### 4.9 + 教える 導線整理 (v1 から微更新)

| 場所 | 状態 | 用途 |
|------|------|------|
| PlanClient header 「+ 教える」 | 継続 (両 mode) | route mode で primary entry |
| MapTab FAB | 追加 | 主要 entry on mobile (カテゴリ未指定) |
| 各 CategoryCard 内 「+ <カテゴリ> での予定を教える」 | **継続** (W1-X3 既存、category prefill) | category-context 追加 |
| 静的 ALTER 提案 card | tap 不可 (CEO 補正 #2 整合) | Phase 3 で動作実装 |
| empty category card | CEO 判断 §14 | A. add link 表示 / B. tap 不可 |
| **UnresolvedAnchorsSection の "場所をはっきりさせる" link** (Beyond、§13) | CEO 判断 §14 | A. 表示 (EditAnchorModal 起動、locationText 編集 prompt) / B. 表示しない (本 wave) |

---

## 5. 既存資産流用戦略

### 5.1 vanilla Google Maps JS script loader の流用戦略 (v3 補正、MorningMapView 不可触原則)

#### 5.1.1 v3 推奨 (default): Plan 側 独立 loader、MorningMapView は完全不可触

`lib/shared/googleMapsLoader.ts` を**新規作成** (= shared utility だが MorningMapView は touch しない)。両 component が独立に `useGoogleMapsScript()` を call、**同 SCRIPT_ID で singleton 共有** することで script tag は実体 1 つになる:

- Morning が先に mount: `MorningMapView` の inline loader が script を inject (既存挙動、不変)
- Plan が先に mount: `googleMapsLoader.useGoogleMapsScript()` が script を inject、後 mount 時の Morning は既存 script を検出して既存挙動継続
- 両者: `script.id = "alter-morning-gmaps"` (= 既存 ID を維持) で de-dup、`window.google?.maps` の存在 check が fast path

**重要原則 (GPT 補正 3 整合)**:
- ✅ **MorningMapView の挙動は完全不変** (analytics emit / failsafe / pin extraction logic / script load timing すべて)
- ✅ Plan 側 loader は MorningMapView と **同 SCRIPT_ID** で singleton 共有 (新規 loader が先 mount でも Morning は既存 script を待つだけ、behavior preserved)
- ✅ Plan 側 loader は MorningMapView から **独立に開発・test** 可能 (依存方向 0)

#### 5.1.2 v3 alternative (CEO 別判断時のみ): shared module 抽出 + MorningMapView refactor

CEO が「重複なくしたい / DRY 優先」 と判断した場合のみ、`MorningMapView` の loader 部分を抽出して `lib/shared/googleMapsLoader.ts` に統合。ただし以下を全て満たすことが必須:

- ✅ Morning 側の analytics emit (`emitVisualFlowClientEvent("visual_flow_script_loaded")`) を loader hook 側に移し、出力イベント / payload / 順序 / timing **全てを v3 前と一致** させる
- ✅ Morning 側の SCRIPT_ID / URL / async / defer / error handler の挙動 **全てを v3 前と一致**
- ✅ Morning 側の test (existing tests) が一切修正なしで PASS
- ✅ Morning 機能の CEO smoke 再走で regression 0 を確認

この alternative は **v3 default では採用しない**。CEO 明示判断 + MorningMapView 不可触の保証が取れた場合のみ。

#### 5.1.3 v3 で却下した option (Plan 用に別 SCRIPT_ID で 2 script tag 注入)

- 別 SCRIPT_ID (例: `"alter-plan-gmaps"`) で 2 script tag を注入する option は **却下**
- 理由: Google Maps JS API は globally singleton (`window.google.maps`)、同 API を 2 回 load しても 1 度しか初期化されない (後の script は no-op)。ただし script tag が 2 個になり KB が無駄、Network 観測時に紛らわしい
- → SCRIPT_ID 統一 (= 5.1.1) が正しい

#### 5.1.4 Plan 側 loader の実装例 (v3 推奨)

```ts
// lib/shared/googleMapsLoader.ts (新規)
import { useEffect, useState } from "react";

const SCRIPT_ID = "aneurasync-gmaps";  // CEO 判断、現 "alter-morning-gmaps" 維持も可
const SCRIPT_URL_BASE = "https://maps.googleapis.com/maps/api/js";

interface UseGoogleMapsScriptResult {
  ready: boolean;
  keyAvailable: boolean;
}

export function useGoogleMapsScript(): UseGoogleMapsScriptResult {
  const browserKey = process.env.NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY;
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    if (!browserKey) return;
    if (typeof window === "undefined") return;
    if (window.google?.maps) { setReady(true); return; }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      const handler = () => setReady(true);
      existing.addEventListener("load", handler, { once: true });
      return () => existing.removeEventListener("load", handler);
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `${SCRIPT_URL_BASE}?key=${encodeURIComponent(browserKey)}`;
    script.addEventListener("load", () => setReady(true), { once: true });
    script.addEventListener("error", () => { /* graceful */ }, { once: true });
    document.head.appendChild(script);
  }, [browserKey]);

  return { ready, keyAvailable: !!browserKey };
}
```

#### 5.1.5 Plan 側 loader (5.1.4 の useGoogleMapsScript) の挙動仕様

- 1 page lifecycle で **1 度だけ** script tag を inject (singleton)
- `window.google?.maps` が既にあれば script を inject せず `ready=true` で即 return
- `document.getElementById(SCRIPT_ID)` で既存 script を検出 (Morning が先に inject していた場合)、`load` event を listen して `ready` 切替
- script load fail → `ready=false` のまま graceful、UI 側で keyAvailable=false 同等に semantic fallback
- `browserKey` 不在 → 即座に `ready=false` + `keyAvailable=false`、script を inject しない (== fail-open)

#### 5.1.6 Morning 側の touch 範囲 (v3 推奨では 0、alternative の場合のみ)

**v3 default (5.1.1 推奨)**: Morning 側 touch **0**。`MorningMapView.tsx` には変更を加えない。CEO の「Alter Morning 不可触」 制約 + GPT 補正 3 整合。

**v3 alternative (5.1.2、CEO 明示判断時のみ)**:
- `MorningMapView.tsx` の script loader code (line 388-430) を `useGoogleMapsScript()` 呼び出しに置換
- analytics emit (`emitVisualFlowClientEvent("visual_flow_script_loaded")`) を hook 側 callback として残す
- 既存 Morning test が一切修正なしで PASS することを必須条件とする
- Morning CEO smoke を再実行して regression 0 を確認

### 5.2 server-side geocoding endpoint (v3 補正、privacy-safe + rate limit + ownership)

#### 5.2.1 API contract (v3 strict spec)

| 項目 | 値 |
|------|---|
| Path | `POST /api/plan/anchors/geocode` |
| Auth | session (Supabase auth)、`getUserId(req)`、unauth = 401 |
| Request body | `{ items: Array<{ anchorId: string; locationText: string }> }` のみ、extra fields は 400 |
| Items max length | 50 (= max batch cap、超過は 400) |
| locationText max length | 300 chars (超過は server で trim せず該当 item を null に) |
| Per-user rate limit | 100 calls / hour (超過は 429 + `Retry-After` header) |
| Anchor ownership check | server で auth user が anchor の `user_id` かを Supabase で verify、所有外は silently 除外 (or 403、CEO 判断 §14) |
| Response | `{ results: Array<{ anchorId, resolution \| null }>, apiAvailable: boolean }` |
| Status codes | 200 (success / partial fail-open) / 400 (validation) / 401 (auth) / 429 (rate limit) / 500 (internal) |

#### 5.2.2 Privacy-safe payload spec (GPT 補正 2 整合)

**外部 (Google Places API) へ送信して OK な情報**:
- `textQuery = locationText` のみ (trim 後)
- (optional) `languageCode = "ja"`、`maxResultCount = 1`、`locationBias` (将来 baseline area 連携時)

**絶対に外部送信しない情報**:
- ❌ anchor.title
- ❌ anchor.notes
- ❌ anchor.sensitiveCategory
- ❌ anchor.locationCategory (Plan 側 use 用、外部不要)
- ❌ user の他 anchor 群
- ❌ user の会話履歴 / CoAlter / Mirror データ
- ❌ user の Personal Model / Stargazer 結果

**audit log policy**:
- 出力 log: `anchorId` + outcome (`cache_hit` / `cache_miss_resolved` / `cache_miss_unresolved` / `api_throw` / `validation_fail`) + 所要 ms のみ
- log に出さない: locationText の実値 / Places API response body / resolved address

#### 5.2.3 実装擬似 code (v3 spec)

```ts
// app/api/plan/anchors/geocode/route.ts (新規)
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getCachedResolution,
  setCachedResolution,
} from "@/lib/alter-morning/placeResolver";
import {
  searchPlacesByText,
  isPlacesApiAvailable,
} from "@/lib/alter-morning/placesApiClient";

const MAX_ITEMS_PER_REQUEST = 50;
const MAX_LOCATION_TEXT_LENGTH = 300;
const RATE_LIMIT_PER_HOUR = 100;
const MIN_CONFIDENCE_FOR_PIN = "medium";  // low は unresolved 扱い (§0.5.2 強化 5)

interface RequestItem { anchorId: string; locationText: string; }
interface Resolution { lat: number; lng: number; confidence: string; resolvedName: string; }
interface ResultEntry { anchorId: string; resolution: Resolution | null; }

export async function POST(req: Request) {
  // (0) auth
  const userId = await getUserId(req);
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  // (1) strict input validation (extra fields reject)
  let body: unknown;
  try { body = await req.json(); } catch { return new NextResponse("Bad JSON", { status: 400 }); }
  if (!body || typeof body !== "object") return new NextResponse("Invalid body", { status: 400 });
  const raw = body as Record<string, unknown>;
  const extraFields = Object.keys(raw).filter(k => k !== "items");
  if (extraFields.length > 0) return new NextResponse(`Unexpected fields: ${extraFields.join(",")}`, { status: 400 });
  if (!Array.isArray(raw.items)) return new NextResponse("items required", { status: 400 });
  if (raw.items.length > MAX_ITEMS_PER_REQUEST) return new NextResponse(`Max ${MAX_ITEMS_PER_REQUEST} items`, { status: 400 });
  const items: RequestItem[] = [];
  for (const it of raw.items) {
    if (!it || typeof it !== "object") return new NextResponse("Invalid item", { status: 400 });
    const obj = it as Record<string, unknown>;
    const itemExtra = Object.keys(obj).filter(k => k !== "anchorId" && k !== "locationText");
    if (itemExtra.length > 0) return new NextResponse(`Item has unexpected fields: ${itemExtra.join(",")}`, { status: 400 });
    if (typeof obj.anchorId !== "string" || typeof obj.locationText !== "string") return new NextResponse("Invalid item shape", { status: 400 });
    items.push({ anchorId: obj.anchorId, locationText: obj.locationText });
  }

  // (2) rate limit (per-user, in-memory + Supabase fallback)
  const allowed = await checkRateLimit(userId, RATE_LIMIT_PER_HOUR);
  if (!allowed) {
    return new NextResponse("Rate limit exceeded", { status: 429, headers: { "Retry-After": "3600" } });
  }

  // (3) anchor ownership check (Supabase で auth user の所有 anchor のみ通過)
  const anchorIds = items.map(i => i.anchorId);
  const { data: ownedRows } = await supabaseAdmin
    .from("external_anchors")
    .select("id")
    .in("id", anchorIds)
    .eq("user_id", userId);
  const ownedSet = new Set((ownedRows ?? []).map(r => r.id));

  // (4) normalized dedupe (同 locationText の anchor は 1 call にまとめる)
  const apiAvailable = isPlacesApiAvailable();
  const results: ResultEntry[] = [];
  const normalizedMap = new Map<string, RequestItem[]>();  // normalizedText → items
  for (const item of items) {
    if (!ownedSet.has(item.anchorId)) {
      results.push({ anchorId: item.anchorId, resolution: null });
      continue;
    }
    const text = item.locationText?.trim() ?? "";
    if (!text || text.length > MAX_LOCATION_TEXT_LENGTH) {
      results.push({ anchorId: item.anchorId, resolution: null });
      continue;
    }
    const normalized = normalizeLocationText(text);  // whitespace / casing / 全角半角 unify
    if (!normalizedMap.has(normalized)) normalizedMap.set(normalized, []);
    normalizedMap.get(normalized)!.push(item);
  }

  // (5) cache-first per normalized text
  for (const [normalized, group] of normalizedMap.entries()) {
    const sample = group[0];

    // (5a) cache lookup
    const cached = await getCachedResolution(userId, sample.locationText.trim(), undefined);
    if (cached && cached.lat !== undefined && cached.lng !== undefined
        && confidenceAtLeastMedium(cached.confidence) /* §0.5.2 強化 5 */) {
      for (const it of group) {
        results.push({
          anchorId: it.anchorId,
          resolution: { lat: cached.lat, lng: cached.lng, confidence: cached.confidence, resolvedName: cached.resolvedName },
        });
      }
      continue;
    }

    // (5b) cache miss → Places API (or fail-open)
    if (!apiAvailable) {
      for (const it of group) results.push({ anchorId: it.anchorId, resolution: null });
      continue;
    }
    try {
      // outbound payload: textQuery のみ送信、anchor metadata 一切送らない
      const places = await searchPlacesByText({
        textQuery: sample.locationText.trim(),
        maxResultCount: 1,
        languageCode: "ja",
      });
      const top = places[0];
      if (!top?.location) {
        for (const it of group) results.push({ anchorId: it.anchorId, resolution: null });
        continue;
      }
      const { latitude, longitude } = top.location;
      await setCachedResolution(userId, sample.locationText.trim(), undefined, {
        resolvedName: top.displayName.text,
        address: top.formattedAddress,
        placeId: top.id,
        lat: latitude, lng: longitude,
        confidence: "medium",  // Plan は medium 固定 (§5.5)
      });
      for (const it of group) {
        results.push({
          anchorId: it.anchorId,
          resolution: { lat: latitude, lng: longitude, confidence: "medium", resolvedName: top.displayName.text },
        });
      }
    } catch (err) {
      // fail-open: audit log は anchorId + outcome のみ、locationText / response body は log しない
      console.warn("[plan/geocode] api_throw", group.map(g => g.anchorId).join(","));
      for (const it of group) results.push({ anchorId: it.anchorId, resolution: null });
    }
  }

  return NextResponse.json({ results, apiAvailable });
}
```

#### 5.2.4 流用関数 (本 wave で新規定義、Alter Morning に影響なし)

- `normalizeLocationText(text)`: Plan 用 helper、whitespace 連続を 1 個 / lower-case / 全角→半角 NFKC normalize。`_helpers.ts` に追加 (additive)
- `checkRateLimit(userId, limit)`: per-user rate limit、in-memory Map + Supabase fallback。新 file `lib/plan/rateLimit.ts` か `_helpers.ts` に inline
- `confidenceAtLeastMedium(conf)`: `conf === "medium" || conf === "high"`、`_helpers.ts` に追加

#### 5.2.5 client への返却 spec

- `results[].resolution` = `{ lat, lng, confidence, resolvedName }` または `null`
- ❌ Places API の rich metadata (types / businessStatus / shortFormattedAddress 等) は **返さない** (privacy 配慮、client 不要)
- `apiAvailable` = server で `GOOGLE_MAPS_API_KEY` 設定済か (client が UI 判断用に参照)

### 5.3 cache key の area パラメータ

`getCachedResolution(userId, placeText, area?)` の `area` (coarse_area):
- Alter Morning: baseline.prefecture + city を `coarseArea` として渡す (resolver 内部で多用)
- Plan v2 で同 area を渡すべきか? → CEO 判断 §14

**option A (推奨)**: `area = undefined` (= "unknown" として cache 化)
- pros: Alter Morning と Plan で cache が share される (= 同 locationText でも area が違うと別 entry になる Alter Morning と独立)
- cons: 厳密には Plan は area context を持たない (= user area = baseline、Plan は anchor 自体に locationText)

**option B**: `area = user.baseline.prefecture` (= Alter Morning と同じ規約)
- pros: cache の共有度が上がる (同 user の同 locationText は area で互換)
- cons: Plan の context (anchor 単位) と area (user 単位) が乖離する場面で混乱

→ A 推奨 (= Plan 用は area unknown、Alter Morning とは別キャッシュ entry になる、シンプル)。CEO 別判断あれば B も可。

### 5.4 client-side hook for batch geocoding

```ts
// app/(culcept)/plan/tabs/_usePlanGeocode.ts (新規 internal hook)

import { useEffect, useState } from "react";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

interface ResolutionMap extends Map<string, { lat: number; lng: number; confidence: string; resolvedName: string } | null> {}

export function usePlanGeocode(anchors: ExternalAnchor[]): {
  resolutions: ResolutionMap;
  loading: boolean;
  apiAvailable: boolean;
} {
  const [resolutions, setResolutions] = useState<ResolutionMap>(new Map());
  const [loading, setLoading] = useState<boolean>(false);
  const [apiAvailable, setApiAvailable] = useState<boolean>(true);  // optimistic

  useEffect(() => {
    // anchor の uniqueness は (id) で良い、locationText が空のものは API call せず即 null
    const items = anchors
      .filter(a => a.locationText && a.locationText.trim().length > 0)
      .map(a => ({ anchorId: a.id, locationText: a.locationText!.trim() }));

    if (items.length === 0) {
      setResolutions(new Map(anchors.map(a => [a.id, null])));
      return;
    }

    setLoading(true);
    fetch("/api/plan/anchors/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then(r => r.json())
      .then((res: { results: GeocodeResultEntry[]; apiAvailable: boolean }) => {
        const m = new Map<string, ResolutionEntry | null>();
        // null anchors (locationText 空) を先に埋める
        for (const a of anchors) m.set(a.id, null);
        for (const r of res.results) m.set(r.anchorId, r.resolution);
        setResolutions(m);
        setApiAvailable(res.apiAvailable);
      })
      .catch(() => {
        // network error: fail-open、全 anchor を null に
        setResolutions(new Map(anchors.map(a => [a.id, null])));
      })
      .finally(() => setLoading(false));
  }, [anchors]);

  return { resolutions, loading, apiAvailable };
}
```

**特性**:
- `useEffect` で anchors 変化時に再 fetch (PlanClient の再 load 時のみ)
- in-memory `Map` で結果保持 (tab 切替で keep、tab close で release)
- fail-open: network error / API unavailable で全 anchor を null (= semantic fallback)
- loading state: UI 側で "場所を解決中..." 表示可能 (CEO 判断 §14、進捗 indicator の有無)

### 5.5 confidence の扱い

`searchPlacesByText` の結果は **常に confidence="medium"** として cache に書く (Plan v2 では):
- Alter Morning の resolver (`determineConfidence()`) は context (chain_brand / generic_place / area match 等) を考慮するが、Plan は context 簡素 (anchor 1 件 = 1 locationText) なので "medium" 固定
- 将来 Plan の confidence 判定が必要になれば別 wave で

**意義**:
- "high" にしない (over-confidence による誤 pin リスク回避)
- "low" にしない (cache 保存しない閾値、resolver 内部仕様)
- → "medium" が安全な default

### 5.7 Cost mitigation strategy (v3 新規、GPT 補正 1 整合)

Google Places API は **SKU 別 usage-based pricing** (Text Search の単価は Basic field mask で $0.032/req 程度、ただし quota free tier / SKU 改定で変動)。`$3.8/user/month` は v2 の hypothesis であり、**確定値ではない**。v3 では以下の **cost-defensive** 設計を必須:

#### 5.7.1 多層防御

| 層 | 防御 | 効果 |
|----|------|------|
| 1. L1 in-memory cache | 同セッション内の re-resolve は 0 API call | 単一 user 内の毎開きで 0 cost |
| 2. L2 Supabase cache (`place_resolution_cache`) | 30 日 TTL、同 user 同 locationText を re-cache | tab close / page reload 後も 0 cost |
| 3. Normalized dedupe | 同一 locationText (normalize 後) の N anchor → 1 API call | 通勤 anchor が複数日 ある場合 1 call で全て解決 |
| 4. Lazy resolve | windowDays (default 14) 内に occurrence ある anchor のみ resolve | 全 100 anchor のうち 30 anchor のみ resolve |
| 5. Max batch cap | 1 request あたり max 50 items (§5.2) | DoS / cost spike 1 request で制限 |
| 6. Per-user rate limit | 1 user あたり max 100 calls / hour (§5.2) | 累積 abuse / bug-induced spike を server 遮断 |
| 7. Client-side debounce | 同 anchor set への連続 fetch は 5 秒以内なら skip (Optional、§14 判断) | rapid tab 切替 UI bug の防御 |
| 8. Fail-open | API throw / rate limit / network error → semantic fallback、UI 落ちない | cost spike や障害でも user 体験 0 影響 |

#### 5.7.2 想定コスト (hypothesis、v3 で確定値扱いしない)

Hypothesis 計算:
- 100 anchor / user / month (heavy user 想定)
- うち 30 anchor (windowDays 14 内) を resolve (Lazy resolve)
- うち normalized dedupe で 20 unique locationText (= 同 anchor が複数日繰り返し)
- うち cache hit 率 70% (re-visit / 同 user の re-occurrence)
- = 月 6 calls / user (= 20 × 30%)
- × $0.032 / call = **$0.19 / user / month (hypothesis)**

v2 の `$3.8` は **lazy resolve / dedupe / cache を考慮しない場合の上限ケース**。v3 の多層防御 (§5.7.1) を入れると 20x 低減し得る。ただし actual は実装後の観測値で確定。

→ **本 mini design では cost を「TBD、実装後に Google Cloud Console + Vercel analytics で観測」 と扱う**。CEO は§19 中断 trigger (cost spike 2x 超え) で監視。

### 5.8 Privacy guarantees + data flow diagram (v3 新規、GPT 補正 2 整合)

#### 5.8.1 Aneurasync → Google への送信 data (= 厳格に最小限)

```
+---------------------------+
| Aneurasync server         |
| (geocode endpoint)        |
+---------------------------+
            │
            │ POST https://places.googleapis.com/v1
            │ Body (= 送信される全データ):
            │   {
            │     "textQuery": "<locationText の trim 後>",
            │     "languageCode": "ja",
            │     "maxResultCount": 1
            │   }
            │ Headers:
            │   X-Goog-Api-Key: <GOOGLE_MAPS_API_KEY>
            │   X-Goog-FieldMask: <Basic field mask only>
            ▼
+---------------------------+
| Google Places API         |
+---------------------------+
```

**送信されるのは locationText だけ** (例: "スターバックス 代官山店")。それ以外の context (title / notes / sensitive / userId / 会話 / Personal Model 等) は **一切送信されない**。

#### 5.8.2 Aneurasync 内で保持する data

- `place_resolution_cache` table (既存): `user_id`, `place_text` (= locationText), `coarse_area`, `resolved_name`, `address`, `place_id`, `lat`, `lng`, `confidence`, `source`, `use_count`, `created_at`, `last_used_at`
- audit log: `anchorId` + outcome + duration_ms のみ、locationText / 解決結果 / API response は log しない

#### 5.8.3 Client (browser) で保持する data

- `usePlanGeocode` の in-memory `Map<anchorId, Resolution | null>` (component lifetime のみ)
- localStorage / sessionStorage / IndexedDB に **書き込まない** (= tab close で release)

#### 5.8.4 Browser key の domain restriction (v3 新規、GPT 補正 2 整合 + 強化 5)

`NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` は **JS bundle に embed される public 値**。git history / sourcemap / DevTools で誰でも抽出可能。

**Google Cloud Console で必須設定** (本 wave 実装範囲外、CEO 操作):
- key の **Application restrictions** = HTTP referrers
- Allowed referrers:
  - `https://aneurasync.com/*` (or 本番 domain)
  - `https://*.aneurasync.com/*`
  - `https://*-aneurasync.vercel.app/*` (Preview deploy)
  - `http://localhost:3000/*` (dev)
- 範囲外 domain からの request は Google 側で 403 reject

→ §11.13 / §17 復旧後手順で CEO が確認する項目に追加。

#### 5.8.5 Plan 用と Alter Morning 用の cache 分離 (CEO 判断、§14)

current `place_resolution_cache` のキー: `userId:placeText.lower():area.lower()`

- **A. 同 cache を share (推奨)**: Plan も Morning も同 key (area=undefined → "unknown") で書き込み・読み込み、cache hit 率 maximize、cost 最小化
- B. Plan 用に area suffix (例: `:plan`) を付けて分離、Morning と独立 entry。cache hit 率は下がるが segregation 明示

→ A 推奨 (cost defensive)。CEO 別判断あれば B。

### 5.9 Lazy resolve + Normalized dedupe + Optimistic UI (v3 新規、自立推論強化 4)

#### 5.9.1 Lazy resolve (windowDays 内のみ)

```ts
// _usePlanGeocode.ts (擬似 code)
function useLazyAnchors(allAnchors: ExternalAnchor[], windowDays: number, now: Date): ExternalAnchor[] {
  return useMemo(() => {
    const today = utcMidnight(now);
    const end = addDays(today, windowDays - 1);
    return allAnchors.filter(a => countOccurrences(a, today, end) > 0);
  }, [allAnchors, windowDays, now]);
}

const visibleAnchors = useLazyAnchors(allAnchors, 14, now);
const { resolutions, ... } = usePlanGeocode(visibleAnchors);  // visible のみ batch
```

- 全 anchor を resolve しない、windowDays 内に occurrence のある anchor のみ
- Phase 2-C+ で windowDays toggle 追加時、on-demand resolve (= 7 → 14 → 30 と段階的)
- cost 低減 + 初回 load 時間短縮

#### 5.9.2 Normalized dedupe (client + server 二重)

client side:
```ts
function dedupeByLocationText(items: { anchorId: string; locationText: string }[]) {
  // client は trim + lower 程度の lightweight dedupe (server で本 dedupe 実施)
  // optimistic: 既に同 locationText が pending なら waiting (= 1 fetch で N anchor に結果配布)
}
```

server side (§5.2.3 で実装済):
- `normalizeLocationText()` で whitespace / casing / 全角半角 unify
- 同 normalized text の N anchor は 1 Places API call で全て解決

#### 5.9.3 Optimistic UI (semantic grid 即 render、Map は async populate)

MapTab mount 時の render 順序:
1. **即 render** (geocode 待たない): header / CategoryGrid / StaticAlterSuggestionCard / FAB
2. **placeholder render** (geocode in-flight): Map area に "場所を確認中..." 等の subtle indicator (CEO 判断 §14 候補)
3. **populate** (geocode resolved): Map に pins、UnresolvedAnchorsSection に未解決 anchor 移動

```tsx
function MapTab({ anchors, now, onAnchorClick, onAddRequest }) {
  const visible = useLazyAnchors(anchors, 14, now);
  const { resolutions, loading, apiAvailable } = usePlanGeocode(visible);

  return (
    <div>
      <header>あなたの地理</header>
      <PlanMapView                         /* loading 中 placeholder、resolved 後 pin */
        anchors={visible}
        resolutions={resolutions}
        loading={loading}
        apiAvailable={apiAvailable}
        onAnchorClick={onAnchorClick}
      />
      <CategoryGrid anchors={anchors} ... />  {/* 即 render */}
      <UnresolvedAnchorsSection
        anchors={visible}
        resolutions={resolutions}
        loading={loading}                     /* loading 中は section 自体 hide も可 */
        onAnchorClick={onAnchorClick}
        onAddRequest={onAddRequest}
      />
      <StaticAlterSuggestionCard ... />       {/* 即 render */}
      <FAB ... />                             {/* 即 render */}
    </div>
  );
}
```

→ user は MapTab 開いた瞬間 95% の UI を見られる、Map だけが async 更新。「真っ白で何も見えない 2 秒」 を回避。

### 5.10 流用構造図

```
[MapTab.tsx]
   │
   ├ usePlanGeocode(anchors) ─────────┐
   │                                  │
   ├ useGoogleMapsScript() ─────────┐ │
   │                                │ │
   ├ <PlanMapView                   │ │
   │   pins={...}                   │ │
   │   onAnchorClick={...} />       │ │
   │                                │ │
   ├ <CategoryGrid ... />           │ │
   │                                │ │
   ├ <UnresolvedAnchorsSection ... />│ │
   │                                │ │
   ├ <StaticAlterSuggestionCard />  │ │
   │                                │ │
   └ <FAB />                        │ │
                                    │ │
[lib/shared/googleMapsLoader.ts]   ◀┘ │
   │                                  │
   └ window.google.maps script tag    │
                                      │
[app/api/plan/anchors/geocode/route]◀─┘
   │
   ├ getCachedResolution(userId, text, undefined) ─────► [placeResolver.ts]
   │                                                            │
   ├ searchPlacesByText({ textQuery }) ─────► [placesApiClient.ts]
   │                                                │
   │                                       Google Places API
   │                                                │
   └ setCachedResolution(userId, text, ...) ─────► [placeResolver.ts]
                                                            │
                                                  [placeCacheStore.ts]
                                                            │
                                                  Supabase L2 cache table
```

→ **Plan 側で新規作成する file**: `lib/shared/googleMapsLoader.ts` (option A) / `app/api/plan/anchors/geocode/route.ts` / `app/(culcept)/plan/tabs/_usePlanGeocode.ts` / `app/(culcept)/plan/tabs/MapTab.tsx` (refactor) / `tests/unit/plan/planGeocodeRoute.test.ts` (新規 test) + α。
→ **Alter Morning 側 touch**: option A の場合 `MorningMapView.tsx` の script loader を hook 利用に置換、option B/C なら touch なし。
→ **`placesApiClient.ts` / `placeResolver.ts` / `placeCacheStore.ts` / `place_resolution_cache` table**: 完全 read-only 流用、touch なし。

---

## 6. 「migrationなし / envなし / depなし / @vis.gl なし」 で実現する最小設計

### 6.1 migration なし

- 既存 `place_resolution_cache` table を流用 (`placeResolver` の API 経由のみ、direct SQL なし)
- ExternalAnchor 型は touch なし (lat/lng 追加なし)
- 新 table / column / index / constraint 追加なし

### 6.2 env なし

- `GOOGLE_MAPS_API_KEY` (既存 server env) は `placesApiClient` 経由で indirect 利用
- `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` (既存 browser env) は `useGoogleMapsScript` 経由で directly 利用 (env 値そのものは新規取得しない)
- Plan 専用 key 追加なし (rename も CEO 確認に戻る、§19)

### 6.3 dep なし

- `@vis.gl/react-google-maps` 不採用 (PR #31 timeout)
- `@types/google.maps` 不採用 (MorningMapView は inline declare global で最小型を定義、Plan は shared loader hook で同パターン)
- `leaflet` / `mapbox-gl` / `google-map-react` / `react-leaflet` 等の代替 dep 不採用
- 既存 dep のみで完結

### 6.4 build performance への影響

- script tag は runtime load、build time に bundle に組み込まれない
- bundle size 増加: shared loader hook の数十行のみ
- Vercel build 時間: Phase 2-B baseline から +1% 以内予測 (実測は実装後)
- 検証: `npm run build` で比較、退行検出時は B / C option へ rollback

### 6.5 中断 trigger (CEO 確認に戻る条件、§19 で詳述)

実装中に以下のいずれかが必要になった瞬間 → **中断 + CEO 確認**:

- ExternalAnchor 型に lat / lng / geo_point field 追加 (migration)
- `place_resolution_cache` table への column 追加 / index 追加
- 新 env (`NEXT_PUBLIC_*MAPS*` の Plan 用 key、または rename)
- 新 dep (`@vis.gl/react-google-maps` / `leaflet` / `mapbox-gl` / etc.)
- `@types/google.maps` install
- 既存 `GOOGLE_MAPS_API_KEY` の usage spike (cost 急増)
- Vercel build 時間 +10% 以上 増加
- Alter Morning 機能の退行 (MorningMapView の behavior 変化、視覚 / analytics)

---

## 7. local-first / GitHub 復旧後の分離

### 7.1 local-first で実装可能 (= GitHub 復旧待ちで進められる)

| 範囲 | 詳細 |
|------|------|
| **C1: server endpoint + tests** | `app/api/plan/anchors/geocode/route.ts` + `tests/unit/plan/planGeocodeRoute.test.ts` (Places API mock + cache stub) |
| **C2: shared loader (option A の場合) + client hook + MapTab refactor** | `lib/shared/googleMapsLoader.ts` + `app/(culcept)/plan/tabs/_usePlanGeocode.ts` + `app/(culcept)/plan/tabs/MapTab.tsx` refactor + `app/(culcept)/plan/tabs/_helpers.ts` 拡張 (前 v1 と同 helpers) + `tests/unit/plan/mapTabHelpers.test.ts` (v1 で設計) + (option A の場合) `components/home/morning/MorningMapView.tsx` の loader 抽出 |
| **C3: visual polish + smoke docs 更新** | hover / focus / category-themed marker SVG + smoke docs |
| **local test / build** | `npx tsc --noEmit` / `npx eslint <files>` / `npx vitest run tests/unit/plan/` + `npm run build` |
| **CEO local smoke** | CEO 環境で実機検証 (browserKey が dev env にあること前提) |

### 7.2 GitHub 復旧後にすべき (= 復旧を待つ操作)

| 操作 | 順番 |
|------|------|
| Phase 2-A push & merge (PR #223) | 1 |
| Phase 2-B push & merge (新 PR) | 2 |
| 本 docs PR push & merge | 3 |
| Phase 2-C impl branch rebase + push + 新 PR | 4 (本 docs 採択 + 実装後) |
| (Optional) 別 wave for real-map enhancement (clustering / heatmap / lat/lng persist) | 後日、CEO 別判断 |

### 7.3 stacked branch (4 段) — v1 と同

```
local main b07eeab5 → Phase 2-A 6e37ad38 → Phase 2-B 99e7c02a → Phase 2-C docs HEAD → (実装後) Phase 2-C impl
```

復旧後 rebase は Phase 2-B mini design §16 と同 pattern (`--onto` 含む 3 方式すべて対応)。

---

## 8. Home swipe / scroll / modal lock / Google Maps gesture 干渉対策

### 8.1 Home swipe (HomeSwipeContainer) vs Google Maps gesture

**新規論点**: Google Maps view は drag / pan / pinch zoom の gesture を持つ。HomeSwipeContainer の X-axis dragDirectionLock と衝突しないか?

**解決策**: Morning と同じ `gestureHandling: "cooperative"` を指定:
- 1 finger pan: ❌ (= scroll に preserve、Map は反応しない)
- 2 finger pan: ✅ (= Map pan)
- 1 finger pinch: ✅ (= Map zoom)
- Ctrl + scroll: ✅ (= Map zoom on desktop)

→ 1 finger touch では HomeSwipeContainer / vertical scroll が priority、Map gesture は user 明示の 2-finger / pinch のみ。Home pane swipe / Plan tab vertical scroll の両方と非衝突。

### 8.2 Modal lock (Phase 1 C3) との関係

- AnchorDetailModal (pin tap → 起動) / AddAnchorModal (FAB or per-category add → 起動) は既存 Modal lock 対応済
- 本 wave で **追加 modal なし**、新規 lock 不要

### 8.3 縦 scroll vs 横 swipe (Phase 1 既存)

- MapTab 縦 scroll: Map view + CategoryGrid + UnresolvedAnchorsSection + StaticAlterCard が縦に並ぶ (~1200-1500px)
- 横 swipe (HomeSwipeContainer) は画面幅 30% threshold (Phase 1 既存)
- 縦 scroll で誤 swipe 発火しない

### 8.4 PR #214 containing block (pane mode)

- Plan pane の `transform: translateZ(0)` + `contain: layout paint` で fixed が pane 内
- Map element も containing block 内 (Map は absolute / fixed 不使用、`<div ref={mapRef}>` で flow layout)
- FAB は fixed、pane 内 containing block 効果 (Phase 2-A / 2-B と同)

---

## 9. MapTab vs CalendarTab / FlowTab の役割分離 (v2 reaffirmed)

### 9.1 3 レンズ pattern (v1 と同)

| Tab | 軸 | 質問 | 単位 |
|-----|-----|------|------|
| **CalendarTab** | 時間 (月) | 「今月はどんな日々か?」 | 日 |
| **FlowTab** | 時間 (週、近未来) | 「今後 7 日は何があるか?」 | 日 + 時刻 |
| **MapTab** | **空間 (生活ドメイン + 地理座標)** | 「私の生活はどこで起こるか? / どの場所が主か?」 | カテゴリ + lat/lng |

v2 で MapTab は **「空間 = カテゴリ × 地理」 の双方を提示**:
- 「自分の地理 = カテゴリの分布」 (v1 で設計)
- + 「自分の地理 = 地理座標の分布」 (v2 で追加、Google Maps view)

両者は同じ anchor を **異なる角度で見せる**:
- カテゴリ視点: 「私の聖域は home、平日の中心は office」 (semantic understanding)
- 地理視点: 「私の生活は渋谷-原宿の三角形に集中している」 (spatial understanding)

→ MapTab は **「カテゴリで意味を、地図で空間を」** の dual-lens viewer。

### 9.2 MapTab unique 情報 (v2 拡張)

| 情報 | Calendar | Flow | Map v2 |
|------|----------|------|--------|
| 月の overview | ✓ | | |
| 日付別 sequence | ✓ | ✓ | |
| 時刻軸 + gap | | ✓ | |
| カテゴリ別の集計 | | | ✓ |
| 頻度 voice | | | ✓ |
| 時間 signature | | | ✓ |
| hint voice | | | ✓ |
| **地理座標の分布** | | | **✓ (v2 新規)** |
| **pin clustering visualization** | | | **✓ (v2 新規、自動 fitBounds)** |
| anchor 詳細 (modal) | ✓ | ✓ | ✓ |
| anchor 追加 (modal) | ✓ | ✓ | ✓ |

---

## 10. Commit 階段 (実装 wave 用、本 PR では実装しない)

### C1: server endpoint + tests + Plan-side helpers (v1 helpers と統合)

**Files**:
- `app/api/plan/anchors/geocode/route.ts` (新規) — POST endpoint、§5.2
- `tests/unit/plan/planGeocodeRoute.test.ts` (新規) — Places API mock + cache stub
  - cache hit (L1 / L2 mock) → API 不呼び出し
  - cache miss → Places API mock → cache write
  - locationText 空 → null
  - Places API throw → null (fail-open)
  - apiAvailable=false → null (key 未設定時)
- `app/(culcept)/plan/tabs/_helpers.ts` (additive) — v1 で設計した `categoryTimeSignature` / `categoryFrequencyVoice` を維持 + 新 helper:
  - `categoryMarkerStyle(category): { color: string; emoji: string }` (§4.3 mapping)
- `tests/unit/plan/mapTabHelpers.test.ts` (v1 から拡張)

### C2: shared loader + client hook + MapTab refactor

**Files**:
- `lib/shared/googleMapsLoader.ts` (新規、option A の場合) — `useGoogleMapsScript()` hook
- `tests/unit/shared/googleMapsLoader.test.ts` (新規、option A の場合) — script tag injection / singleton / fail-open
- `app/(culcept)/plan/tabs/_usePlanGeocode.ts` (新規) — client hook、§5.4
- `app/(culcept)/plan/tabs/MapTab.tsx` — refactor (194 行 → 推定 480-600 行)
  - Map view (PlanMapView component) を追加
  - CategoryGrid を 2 列 grid に
  - UnresolvedAnchorsSection を追加
  - 静的 ALTER 提案 card を追加
  - FAB を追加
- (option A の場合) `components/home/morning/MorningMapView.tsx` — loader 部分のみ refactor、`useGoogleMapsScript` を使用するように変更 (= Alter Morning に最小 touch)
- `tests/unit/plan/planMapView.test.ts` (新規) — failsafe paths (keyAvailable=false / pins<2 / 全 same point) の確認 (Google Maps API は jsdom で mount できないので、render-only test + classNames / data-testid 検証)

### C3: visual polish + smoke docs 更新

**Files**:
- `app/(culcept)/plan/tabs/MapTab.tsx` — marker SVG icon polish、hover/focus、category overlay
- `docs/alter-plan-home-swipe-visual-smoke.md` — Phase 2-C 追加 smoke check (新 Map UI + fallback + cache)

---

## 11. Smoke 項目 (実装 wave 用、v2)

### 11.1 /plan route (route mode)

- [ ] /plan 直 URL で 3 tab 表示 (カレンダー / リスト / 地図)
- [ ] "地図" tab tap → MapTab content 表示
- [ ] header: "あなたの地理" (or CEO 確定 copy) + "今後 14 日間で訪れる場所"
- [ ] Google Maps view が height ~280px で mount される (browserKey 設定済 + pins ≥ 2)
- [ ] fitBounds で全 pin が画面内に収まる
- [ ] gesture: 2-finger pan で Map pan、pinch zoom 可能、1-finger では Map 反応せず縦 scroll が優先

### 11.2 Pin display (Map view)

- [ ] resolvable anchor は category color / emoji icon の marker として描画
- [ ] sensitive anchor は 🔒 icon (内容 leak 防止)
- [ ] marker tap → AnchorDetailModal 起動 (W1-X5 既存)
- [ ] pins 全て同点 (4 桁精度 ≒ 11m) → single fallback zoom (Morning と同 pattern)
- [ ] resolved name が Map info (marker title) として hover で見える

### 11.3 Geocoding flow

- [ ] MapTab mount → `/api/plan/anchors/geocode` 1 リクエストで全 anchor を batch resolve
- [ ] cache hit (L1 / L2) → API call 0、即座に pin 表示
- [ ] cache miss → Places API call → pin 描画
- [ ] Places API throw → semantic fallback (= unresolved section に move)
- [ ] locationText 空 → API call せず unresolved section に move

### 11.4 Failsafe (graceful degradation)

- [ ] `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` 未設定 → Map view 非表示、placeholder ("地図 key 未設定" 等)、CategoryGrid + UnresolvedAnchorsSection は表示
- [ ] `GOOGLE_MAPS_API_KEY` 未設定 (server) → geocode endpoint が apiAvailable=false 返す、全 anchor 未解決、CategoryGrid + UnresolvedAnchorsSection のみ表示
- [ ] script load fail (network error) → Map view 非表示、CategoryGrid 等は機能
- [ ] geocode endpoint 500 / timeout → 全 anchor 未解決、CategoryGrid + UnresolvedAnchorsSection で完結

### 11.5 UnresolvedAnchorsSection

- [ ] locationText 空 / Places API miss の anchor が下部 section に表示
- [ ] section header: "📂 場所が曖昧 / 未指定"
- [ ] each row: title × count + category label + locationText (if any)
- [ ] row tap → AnchorDetailModal 起動 (W1-X5 既存)
- [ ] sensitive anchor も同 section に出るが title masking は §14 判断による

### 11.6 CategoryGrid (v1 で設計、v2 維持)

- [ ] 9 categories (LOCATION_GROUP_ORDER 順) が全て表示 (active + empty 両方)
- [ ] emoji が text-4xl で大型表示
- [ ] hint (italic、Aneurasync voice) が visible
- [ ] frequencyVoice ("週 N 回") + timeSignature ("朝晩中心") が表示
- [ ] empty category: opacity-60 + "今は静か"
- [ ] per-category add link: "+ <カテゴリ> での予定を教える" (W1-X3 既存)

### 11.7 静的 ALTER 提案 card / FAB (v1 維持、Phase 2-B 整合)

- [ ] 静的 card: tap 動作なし、ボタン風 styling 禁止、role="region"
- [ ] FAB: 右下 fixed、紫 gradient、locationCategory 未指定 prefill

### 11.8 Cache behavior

- [ ] 同じ MapTab を 2 回開く → 2 回目は API call 0 (L1 cache hit)
- [ ] tab close → 別 page → MapTab に戻る → L1 in-memory が生きていれば cache hit、L1 expire していれば L2 から復元
- [ ] 30 日経過した cache entry → 自動 expire (placeResolver 側で削除)

### 11.9 Recurring + exception_dates + validity (既存 groupAnchorsByLocation)

- [ ] FREQ=WEEKLY recurring が windowDays 期間内に正しく count
- [ ] exception_dates 適用
- [ ] valid_until 後の日は count なし

### 11.10 Home pane 統合 (pane mode)

- [ ] Home → 左 swipe → Plan pane → 地図 tab tap → 同 UI
- [ ] Map gesture (2-finger pan / pinch zoom) は機能、1-finger 縦 scroll は priority
- [ ] FAB / marker tap → Modal、Modal 開時 swipe disable (Phase 1 C3)

### 11.11 Network / Console (v2 cost 確認)

- [ ] Network: `maps.googleapis.com/maps/api/js?key=...` (script tag、1 回のみ singleton)
- [ ] Network: `places.googleapis.com/v1` への request は **server-side** (browser から見えない、`/api/plan/anchors/geocode` への internal call として観測可能)
- [ ] Network: `aljavfujeqcwnqryjmhl` (Production Supabase) のみ
- [ ] Network: `hjcrvndumgiovyfdacwc` (Alter staging) 0 hit
- [ ] Network: `/api/coalter` / `/api/talk` / `/api/mirror` → 0 hit
- [ ] Console: React 19 warning 0
- [ ] Console: Google Maps related warning は Morning 由来のもののみ (新規 0)

### 11.12 A11y

- [ ] Map view: aria-label "地図 (今後 14 日間の予定の場所)"
- [ ] marker: aria-label "<title> (<category>)、開く"
- [ ] CategoryGrid card: aria-label "<category> · <voice>"
- [ ] UnresolvedAnchorsSection: aria-label "場所が曖昧 / 未指定の予定"
- [ ] keyboard: Tab で map → grid → unresolved → static card → FAB の順
- [ ] touch target 44pt 最小

### 11.13 Build / cost / privacy (v3 補正、illustrative hypothesis 扱い)

- [ ] `npm run build`: Phase 2-B baseline から +1% 以内 (実測、+10% 超で §19 中断 trigger)
- [ ] Google Maps script size: ~80KB (already used in Morning、追加なし)
- [ ] 初回 geocode batch のレスポンス時間: **目安** 1-3 秒 (N anchors × Places API、cache miss 時)、確定値ではない
- [ ] 2 回目以降: 目安 100ms 以内 (cache hit)、確定値ではない
- [ ] **Places API cost (hypothesis、確定値ではない、GPT 補正 1)**: §5.7.2 の多層防御後で **$0.19 / user / month** 想定 (上限ケース $3.8)、実装後に Google Cloud Console + Vercel analytics で実測。CEO budget は **hypothesis ベースで承認**、実測値が想定の 2 倍超えで §19 中断 trigger
- [ ] **Privacy (§5.8 整合、GPT 補正 2)**:
  - [ ] DevTools Network で `places.googleapis.com` への request body を観測、`textQuery` 以外の field がない確認 (例えば `anchorId` / `userId` / `title` 等が送信されていない確認)
  - [ ] `/api/plan/anchors/geocode` への request body は `{ items: [{ anchorId, locationText }] }` のみ、extra field を送ると 400 返ることを確認
  - [ ] audit log (`console.warn`) に locationText 実値 / Places API response body が出ていない確認
- [ ] **Browser key domain restriction (§5.8.4、CEO 操作)**: Google Cloud Console で `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` の HTTP referrers が aneurasync 本番 / Preview / localhost のみに制限されている確認
- [ ] **Rate limit (§5.2)**: 同一 user から 101 回目の request が 429 + Retry-After を返す確認
- [ ] **Anchor ownership**: 他 user の anchorId を含む request は該当 anchor が silently 除外される確認

---

## 12. やらないこと (制約再宣言、v2 補正)

### CEO 補正による制約 (Phase 2-A / 2-B 通算、本 wave で再確認)

- ❌ CoAlter / Mirror / /talk / D-* 関連
- ❌ Production env / all-Preview env 変更
- ❌ **新 env 追加** (`NEXT_PUBLIC_*MAPS*` の Plan 専用 key 追加、既存 key の rename)
- ❌ **新 migration 追加** (ExternalAnchor lat/lng / `place_resolution_cache` schema 変更すべて)
- ❌ service_role / DB password / connection string 使用
- ❌ DraftPlan generator / W1-6 passive drift logging
- ❌ W1-Z+ cleanup (apply 後 1 週間観測、別 wave)
- ❌ fallback path 削除
- ❌ Phase 2-A branch (`feat/alter-plan-phase2-a-calendar-week-strip`) への追加 commit
- ❌ Phase 2-B branch (`feat/alter-plan-phase2-b-flow-list`) への追加 commit

### Phase 2-C 固有の制約 (v2 補正)

#### v1 から維持 (v2 でも禁止)

- ❌ **`@vis.gl/react-google-maps` dep 追加** (PR #31 timeout)
- ❌ **新 dep install** (geo / map 系)、`leaflet` / `mapbox-gl` / `google-map-react` / `@types/google.maps` 等
- ❌ **ExternalAnchor 型に lat / lng / geo_point field 追加** (migration)
- ❌ **MapTab を default tab に変更** (現 Calendar = default 維持)
- ❌ **PlanClient / HomeSwipeContainer / Modal lock 変更**
- ❌ **AddAnchorModal の signature 変更**
- ❌ **Phase 2-A の CalendarTab / Phase 2-B の FlowTab の改修**
- ❌ **Phase 3 ALTER 提案 flow 動作実装** (本 wave は静的 placeholder のみ)
- ❌ **real-time location tracking** / GPS 取得 (Layer 3)
- ❌ **長押し quick action menu** (Phase 2-C+ 預け)

#### v1 から変更 (v2 では解除、v1 撤回)

- ~~❌ Google Maps integration~~ → **使う** (v2)
- ~~❌ `maps.googleapis.com` への request~~ → **使う** (v2)
- ~~❌ MorningMapView / placesApiClient / placeResolver の利用~~ → **流用する** (v2)
- ~~❌ Real-map view 描画~~ → **描画する** (v2)
- ~~❌ locationText → 座標解決~~ → **server endpoint で解決する** (v2)

#### v2 で新規追加 (実装中に発生したら CEO 確認に戻る)

- ❌ **既存 `place_resolution_cache` table への schema 変更** (column / index / constraint すべて)
- ❌ **新 server-side env variable 読み込み** (placesApiClient 経由の indirect 利用は OK、直接 `process.env.*MAPS*` を Plan code から読まない)
- ❌ **Alter Morning 側の `placesApiClient` / `placeResolver` / `placeCacheStore` の内部 logic 改変** (call sigature 利用のみ)
- ❌ **`@types/google.maps` install** (inline minimal type declaration で対応、Morning と同 pattern)
- ❌ **Plan-specific GOOGLE_MAPS_API_KEY rotation / new key** (既存 key 流用)

### 削除しないもの (irreversibility 原則、Phase 2-B CEO 補正 #3 整合)

- ✅ `groupAnchorsByLocation` / `LOCATION_GROUP_ORDER` / `categoryOf` / `countOccurrences` helpers — **不可触**
- ✅ `CATEGORY_META` (9 categories 全部) — **不可触**
- ✅ `SENSITIVE_LABEL` — **不可触**
- ✅ 既存 test (helper test + MapTab test if any) — **継続 PASS**
- ✅ Phase 2-A / Phase 2-B helpers — **不可触**
- ✅ `lib/alter-morning/*` の `placesApiClient` / `placeResolver` / `placeCacheStore` / `locationResolver` — **内部 logic 不可触** (call signature 経由の利用のみ)
- ✅ `place_resolution_cache` table schema — **不可触**

---

## 13. Beyond 改善 (v2 expanded、世界トップアプリ研究 + Aneurasync 哲学)

v1 で設計した Beyond 改善 12 件 (hint voice / frequency natural language / time signature / empty as silence / per-category add for empty / 静的 ALTER card / FAB / header copy / sensitive privacy / restraint UI / a11y / reduced-motion) は **すべて v2 でも維持**。

v2 で追加する Beyond 改善:

### 13.1 Map view を auxiliary 扱い、Category Grid を main 扱い

- 一般的な Map app: Map が main、補助 UI が下
- Phase 2-C v2: **Category Grid が main の役割**、Map は **「補助的な地理 lens」** として上に置く
- 理由: 「自分の地理 = カテゴリ + voice + 頻度」 は Aneurasync の核心、Map は spatial cluster の visualization

→ 視覚的 hierarchy:
1. 上: Map (height 280px、固定)
2. 中: Category Grid (主要 viewport、scroll で深く)
3. 下: UnresolvedAnchorsSection + static ALTER card + FAB

### 13.2 Pin color = category-themed (semantic overlay on map)

§4.3 の `CATEGORY_MARKER` mapping を実装。Map 上で pin の色が即座に「家か職場か」 を伝える。Google Maps デフォルト pin (赤い水滴) より情報密度高い。

### 13.3 Confidence 表現 (Beyond、CEO 判断 §14 候補)

`searchPlacesByText` の結果は `confidence: "medium"` で cache 化。Pin / list row に **confidence 表現** をどうするか?

- A. 表現しない (v2 default 推奨): user は地図と semantic list を見るだけ、confidence は internal metadata
- B. low confidence pin を dashed border / 透明度低めで render: 視覚的に「これ自信ないかも」 を伝える
- C. confidence < threshold の anchor を unresolved section に move: 厳密なフィルタリング

→ A 推奨 (本 wave シンプル)、B/C は Phase 2-C+ で。

### 13.4 Empty Map state の voice (Beyond)

全 anchor が unresolved / pins=0 → 「地図に出せる予定がまだない」 voice。
全 anchor が same point → 「あなたの活動は 1 つの場所に集中している」 voice (= self-recognition の起点)。

→ A 推奨 (CEO 判断 §14)、空白 placeholder ではなく Aneurasync voice 入り。

### 13.5 Cluster な視覚 (Beyond、Phase 2-C+ 預け)

Many anchors at one location: Google Maps marker clustering library (e.g. `@googlemaps/markerclusterer`) を使うと自動 cluster 表示できる。本 wave では dep 追加禁止 (§12) → Phase 2-C+ 預け。

### 13.6 Heatmap 視覚 (Beyond、別 wave)

Google Maps Heatmap layer で「私の活動 heat」 表示。dep `@googlemaps/markerclusterer` or 別 lib 必要 → 別 wave。

### 13.7 「場所をはっきりさせる」 link (UnresolvedAnchorsSection、Beyond)

Unresolved anchor の row に "Edit" link を追加 → EditAnchorModal を起動 → locationText を編集 prompt。
A. 追加 (推奨、user が「曖昧 → 具体」 の self-improvement loop)、B. 追加しない (本 wave シンプル)

### 13.8 Sensitive pin の総数表示 (Beyond)

Sensitive anchor の locationText が地図に pin として出る (🔒 icon)。CEO judgment §14:
A. 出す + 🔒 (v2 default、現 MapTab anchor row と整合): user に「ここに敏感予定あり」 を可視化、内容は modal で
B. 出さない (semantic fallback に強制 move): privacy 最大
C. 出す + count obfuscation (例: 「敏感予定 N 件 (位置非表示)」 という cluster pin): privacy 中庸

A 推奨 (本 wave シンプル + Phase 2-B AnchorThumbnail 整合)。

### 13.9 Tap-on-Map で empty area の add 起動 (Beyond、別 wave)

Map の白地に tap → AddAnchorModal を起動、緯度経度を coords prefill → 自動 reverse-geocode で locationText 候補。
→ ExternalAnchor に lat/lng 必要 (migration) → 別 wave。

### 13.10 World-leading 比較 (v2 update、v1 から拡張)

| アプリ | アプローチ | Phase 2-C v2 との関係 |
|--------|------------|------------------------|
| **Apple Maps Memories** | 「N 年前の今日 Paris に居た」 retrospective story-like、real map | Aneurasync は prospective (今後 14 日)、real-map 部分は共通 |
| **Google Maps Timeline** | 日次 GPS history + route | passive 自動収集、Aneurasync は anchor 自己申告 (= user-curated geography) |
| **Foursquare / Swarm** | チェックイン + badge | gamification、Aneurasync は passive aggregation (= 私の予定の自然な集約) |
| **Spotify Wrapped Geography** | 年次 retrospective story | Aneurasync は近未来 prospective + 私の voice |
| **Mint / Money Forward** | カテゴリ別 spending + 地図表示なし | categorical aggregation pattern (Aneurasync の Category Grid と類似)、Aneurasync は + 地図 lens |
| **Apple Health App (Walk Map)** | 自動 GPS 履歴 + heat | passive 観測、Aneurasync は user-anchor based curated |

→ Aneurasync v2 の unique 立ち位置: **user-curated + prospective + 意味の地理 voice + real-map lens (auxiliary)** = どれとも overlap しない。

---

## 14. CEO 判断点 (本 PR merge 後の実装 wave 起票前)

### 判断 1: 地図 view の height (§4.2)

- A. 280px (推奨、十分な pin 視認 + scroll bypass しすぎない)
- B. 180px (Morning と同、より控えめ)
- C. 360px (大きめ、map を主役寄り)
- D. dynamic (full-bleed、aspect 16:9)

### 判断 2: Script loader option (§5.1、v3 で推奨変更、GPT 補正 3 整合)

- **A. Plan 側 独立 loader (新 `lib/shared/googleMapsLoader.ts`、MorningMapView は完全不可触、SCRIPT_ID は "alter-morning-gmaps" 共有)** ← **v3 推奨** (Alter Morning regression risk 0)
- B. shared module 抽出 + MorningMapView refactor (= v2 旧推奨、CEO 明示判断 + 完全 behavior-preserving 保証時のみ)
- C. ~~Plan 側 inline + 別 SCRIPT_ID~~ (script 2 個 inject、却下 §5.1.3)
- D. ~~Plan 側 inline + 同 SCRIPT_ID~~ (loader code 重複、A の inline 簡易版、A の方が module 化されて test 容易)

### 判断 3: Cache area parameter (§5.3)

- **A. `area = undefined`** (推奨、Plan 専用 cache entry、Alter Morning と独立)
- B. `area = user.baseline.prefecture` (Alter Morning と互換 cache 共有)

### 判断 4: Cost / budget (§5.7 / §11.13、v3 で hypothesis 化、GPT 補正 1 整合)

- v2 で `$3.8/user/month` を提示したが **確定値ではない** (Google Places API は SKU 別 usage-based、v3 多層防御適用後の hypothesis は $0.19/user/month、上限ケース $3.8)
- A. **hypothesis ベースで budget 承認、actual は実装後 Google Cloud Console + Vercel analytics で観測。実測値が hypothesis の 2 倍超えで §19 中断 trigger 発動** ← **v3 推奨**
- B. cost を完全に確定してから着手 (= 1 week 程度の cost analysis wave を別途追加)
- C. budget hard cap (例: user 月 50 calls 上限)、超過は client semantic fallback 強制 (Phase 2-C+ で追加可能、本 wave 初期は §5.7 多層防御 + rate limit でカバー)

### 判断 5: Layout (§4.1 / §13.1)

- **A. Map 上、Category Grid 下、Unresolved さらに下** (推奨、Map auxiliary)
- B. Category Grid 上、Map 下 (map を後置、grid を main 強調)
- C. Side-by-side (desktop only、mobile は A と同)
- D. Tab 切替 (Map / Category 切替 toggle、深い refactor)

### 判断 6: layout (§3.1 v1 維持) — Category Grid layout

- **A. 2 列 grid (推奨、v1 と同)** — mobile responsive、wider で 2-3 列
- B. 縦 1 列 list (現 MapTab 維持)、CategoryCard 内部のみ refactor
- (C-D は v1 で却下、Phase 2-C+ 預け)

### 判断 7: empty category 表示 (§13、v1 維持)

- **A. 全 9 categories 常時表示、empty は "今は静か" voice** (推奨、Aneurasync 哲学整合)
- B. active のみ表示 (現 MapTab 既存挙動)

### 判断 8: empty category per-category add link (§13.7、v1 維持)

- **A. 表示する** (推奨、Aneurasync "未来 = generative space")
- B. 表示しない

### 判断 9: 静的 ALTER 提案 card (§4.6、v1 維持)

- **A. 表示する** (推奨、Phase 2-B integration)
- B. 表示しない

### 判断 10: FAB (§4.7、v1 維持)

- **A. global FAB を追加** (推奨、Phase 2-A / 2-B 整合)
- B. per-category add のみ

### 判断 11: header copy (§13.10、v1 から)

- **A. "あなたの地理" + "今後 14 日間で訪れる場所"** (推奨、CEO 方針直訳)
- B. "あなたの場所" + 同
- C. "生活が起こる場所" + 同
- D. "聖地マップ" 維持
- E. "自分の地理" + "あなたの生活舞台" (poetic)

### 判断 12: sensitive anchor の title 表示 (§13.8、v1 から)

- **A. 現状維持** (title + 🔒 badge、Phase 2-B AnchorThumbnail 整合) — 推奨
- B. title masking → AnchorDetailModal でのみ実 title
- C. title + 🔒 prefix

### 判断 13: 静的 ALTER 提案 card 文言 (v1 から)

- A. "あなたの "聖域" を見てみたいですか?" + "(Phase 3 で動作予定)"
- B. "ALTER があなたの地理を読み解きます" + "(Phase 3 で動作予定)"
- **C. "あなたの場所のパターンを、ALTER が読みに来る予定です" + "(Phase 3 で動作予定)"** (推奨、Aneurasync voice + 控えめ + Phase 3 明示)

### 判断 14: 「場所をはっきりさせる」 link (UnresolvedAnchorsSection、§13.7)

- A. 表示する (Edit anchor へ direct、self-improvement loop)
- **B. 表示しない (本 wave)、Phase 2-C+ 預け** (推奨、本 wave シンプル維持)

### 判断 15: Confidence 表現 (§13.3)

- **A. 表現しない (本 wave default)** — 推奨
- B. low confidence pin を dashed / 透明 render — Phase 2-C+
- C. low confidence を unresolved に強制 move — Phase 2-C+

### 判断 16: Empty Map state voice (§13.4)

- **A. Aneurasync voice 入り** (「地図に出せる予定がまだない」 等) — 推奨
- B. 空白 placeholder

### 判断 17: Phase 2-C 後の次フェーズ優先順位

| Phase | 内容 | 推奨 timing |
|-------|------|-------------|
| **Phase 3** | 空き日 → ALTER 質問 → 提案 flow | Stargazer / Alter engine 接続 (大型) |
| **Phase 2-C+** | clustering / heatmap / "場所をはっきりさせる" link / Today's stage / windowDays toggle | Phase 2-C 着地後 |
| **別 wave (Real Map enhancement)** | ExternalAnchor lat/lng migration + reverse geocoding 自動化 + Tap-on-Map add 起動 | 需要発生時、CEO 別判断 |
| **Phase 2-A+** | Full month grid view mode 追加 | 別 design |
| **W1-Z+ cleanup** | Repository fallback path 削除 | apply 後 1 週間観測 |

---

## 15. 制約遵守 (本 PR 通算、v2 補正)

- ✅ docs only (実装 / migration / env 変更 0)
- ✅ Phase 2-A branch (`feat/alter-plan-phase2-a-calendar-week-strip` @ 6e37ad38) への追加 commit 0、不可触
- ✅ Phase 2-B branch (`feat/alter-plan-phase2-b-flow-list` @ 99e7c02a) への追加 commit 0、不可触
- ✅ GitHub 操作 0 (suspension 中、push / pull / fetch / gh 全禁止維持)
- ✅ CoAlter / Mirror / /talk / D-* / W1-6 / DraftPlan / fallback path 不触
- ✅ Production / all-Preview env 不触
- ✅ **新 env 追加なし** (既存 `GOOGLE_MAPS_API_KEY` + `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` 流用)
- ✅ **新 migration なし** (既存 `place_resolution_cache` table 流用、ExternalAnchor schema 不変)
- ✅ **新 dep なし** (`@vis.gl/react-google-maps` / `@types/google.maps` / `leaflet` / `mapbox-gl` 等)
- ✅ service_role / DB password / connection string 不使用
- ✅ Alter Morning 側 `placesApiClient` / `placeResolver` / `placeCacheStore` 内部 logic 不可触 (call signature 経由のみ)
- ✅ Phase 2-A 実装 (CalendarTab) 不変
- ✅ Phase 2-B 実装 (FlowTab / AnchorThumbnail / 静的 ALTER card / FAB / sticky header) 不変
- ✅ Phase 3 / 別 wave 預け事項を明確化 (§17)

---

## 16. References

### 既存 files (本 PR で touch しない、実装 wave で touch する file 含む)

- `app/(culcept)/plan/tabs/MapTab.tsx` (本命修正対象、194 行)
- `app/(culcept)/plan/tabs/_helpers.ts` (既存 helper、軽量拡張)
- `app/(culcept)/plan/PlanClient.tsx` (parent、不可触)
- `lib/plan/external-anchor.ts` (ExternalAnchor 型、不可触、lat/lng なし確認済)
- `app/(culcept)/plan/components/AnchorDetailModal.tsx` (W1-X5、不可触)
- `app/(culcept)/plan/components/AddAnchorModal.tsx` (W1-X1/X2、不可触)
- `lib/alter-morning/placesApiClient.ts` (流用、内部 logic 不可触)
- `lib/alter-morning/placeResolver.ts` (流用、内部 logic 不可触)
- `lib/alter-morning/placeCacheStore.ts` (流用、内部 logic 不可触)
- `lib/alter-morning/locationResolver.ts` (参照のみ、本 wave 利用なし)
- `lib/shared/location.ts` (PREFECTURE_COORDS、参照のみ、本 wave 利用なし)
- `lib/shared/municipalityCoords.ts` (参照のみ、本 wave 利用なし)
- `components/home/morning/MorningMapView.tsx` (loader 抽出時に最小 touch、それ以外は参照)
- `supabase/migrations/20260416100000_place_resolution_cache.sql` (既適用、不可触)

### 関連設計書

- `docs/alter-plan-w15-ui-mini-design.md` §2, §4 (MapTab 初版設計)
- `docs/alter-plan-w1x3-cell-add-mini-design.md` (per-category add 導線、本 wave で維持)
- `docs/alter-plan-w1x5-anchor-detail-mini-design.md` (anchor detail modal、本 wave で維持)
- `docs/alter-plan-phase2-a-calendar-month-view-mini-design.md` (Phase 2-A、refactor pattern の前例)
- `docs/alter-plan-phase2-b-flow-list-mini-design.md` (Phase 2-B、CEO 補正 1-3 + Beyond 改善 + 静的 ALTER card pattern の前例)
- `docs/alter-plan-home-swipe-visual-smoke.md` (smoke runbook、本 wave で Phase 2-C section 追加)

### Aneurasync 哲学 references (memory)

- `memory/aneurasync-philosophy.md`
- `memory/heart-dynamics-model-v1.md` (時間構造 + 空間構造 (v2 提案))
- `memory/project_phase2-direction.md`

### Google Maps 関連

- PR #31 (`@vis.gl/react-google-maps` 採用試行 → Vercel build 45:22 timeout で reject)
- PR #34 (M1 pin-only MVP landed 8d0ce253 — vanilla JS API pattern 確立)

### 世界トップアプリ参考 (§13.10)

- Apple Maps Memories / Google Maps Timeline / Foursquare / Day One / Strava / Spotify Wrapped / Mint / Apple Health

---

## 17. GitHub 復旧後の手順 (4 段 stacked branch)

### 17.1 stacked branch 構造

```
local main             b07eeab5  (#215、suspension snapshot)
                       ↑ merge-base
Phase 2-A              6e37ad38  (feat/alter-plan-phase2-a-calendar-week-strip、5 commits、凍結)
                       ↑ stacked
Phase 2-B              99e7c02a  (feat/alter-plan-phase2-b-flow-list、3 commits、凍結)
                       ↑ stacked
Phase 2-C docs         HEAD       (docs/alter-plan-phase2-c-map-tab-mini-design、2 commits = v1 起票 + 本 v2 補正)
                       ↑ (実装 wave 着手後)
Phase 2-C impl         ...        (feat/alter-plan-phase2-c-map-tab、推定 3 commits、未着手)
```

### 17.2 復旧後 procedure (Phase 2-B mini design §16 と同 pattern)

```bash
gh auth status  # suspension 解除確認

# (1) Phase 2-A push & merge
git checkout feat/alter-plan-phase2-a-calendar-week-strip
git push origin feat/alter-plan-phase2-a-calendar-week-strip
# PR #223 自動更新 → CI / CEO review → merge

# (2) Phase 2-B rebase & push & merge
git checkout feat/alter-plan-phase2-b-flow-list
git rebase main  # or --onto (Squash の場合)
git push -u origin feat/alter-plan-phase2-b-flow-list
# 新 PR → CI / CEO review → merge

# (3) Phase 2-C docs rebase & push & merge (本 PR)
git checkout docs/alter-plan-phase2-c-map-tab-mini-design
git rebase main  # or --onto
git push -u origin docs/alter-plan-phase2-c-map-tab-mini-design
# 新 PR (docs only、軽い CI) → CEO review → merge

# (4) Phase 2-C impl branch 着手 (本 docs 採択後)
git checkout main
git pull origin main
git checkout -b feat/alter-plan-phase2-c-map-tab
# C1 / C2 / C3 実装 + local smoke
git push -u origin feat/alter-plan-phase2-c-map-tab
# 新 PR → CI / CEO review → merge
```

### 17.3 merge 方式の柔軟性

Phase 2-B mini design §16 と同、Merge commit / Squash / Rebase merge いずれも `--onto` で対応可能。

### 17.4 復旧前禁止事項 (継続)

- ❌ `git push` / `git pull` / `git fetch`
- ❌ `gh auth login` / `gh pr`
- ❌ `git branch -D / -d` / `git checkout -B`
- ❌ `git reset --hard` / `git checkout --` / `git restore .` / `git clean -f` / `git stash`
- ❌ Phase 2-A / Phase 2-B / 本 docs / Phase 2-C impl 以外への commit
- ❌ local main へ commit
- ❌ Phase 2-A / Phase 2-B 凍結 branch への追加 commit

### 17.5 復旧前にできること (継続)

- ✅ 本 PR (Phase 2-C mini design) への補正 commit (本 commit が v1 → v2 補正の例)
- ✅ CEO レビュー → 判断 1-17 確定 → Phase 2-C 実装着手
- ✅ Phase 2-C 実装 branch を本 docs branch から派生 (= 4 段 stacked)
- ✅ local test / build / smoke
- ✅ blocker fix commit

---

## 18. 変更履歴 + v1 撤回 + v2 → v3 補正経緯

| 日付 | 変更 | 承認 |
|------|------|------|
| 2026-05-20 v1 (commit 59dbb3c5、**撤回**) | 「Google Maps なし semantic-only」 で起票。empirical audit が不十分で「現 MapTab は地図 API 使わない pattern なので Phase 2-C も使わない」 を結論 | CEO レビューで補正指示 |
| 2026-05-20 v2 (commit 86f7c25e、本 v3 で更新) | **「Google Maps あり 本命」 に redirect**。CEO 補正「Alter Morning 用 API 資産は Alter Plan で普通に使ってよい」 + GPT 提案「`@vis.gl` は使わない、vanilla JS は使う」 を反映。empirical audit を再実施し、既存 Alter Morning 資産 (placesApiClient / placeResolver / placeCacheStore / vanilla script loader / 既存 env / 既存 cache table migration) の流用可能性を確認 | CEO 部分承認、GPT 補正 4 件で v3 へ |
| **2026-05-20 v3 (本 commit)** | **GPT 補正 4 件 + 自立推論強化 5 件を反映**。①Cost を hypothesis 化 (確定値ではない)、②Privacy-safe payload を strict spec で明文化 (locationText only、anchor metadata 送信なし)、③Script loader 推奨を「Plan 側独立 loader (MorningMapView 不可触)」 に変更、④Rate limit / Anchor ownership check / Input strict validation / Lazy resolve / Normalized dedupe / Optimistic UI / Cached low-confidence guard / Browser key domain restriction を §5.2 / §5.7-5.9 で実装仕様化、⑤§20 GO condition checklist 新設 | CEO レビュー待ち (GitHub 復旧後 push、本 v3 で実装 GO 判断確定見込み) |

### 18.1 v1 撤回理由 (audit trail)

**v1 が overly conservative だった原因**:
1. 「現 MapTab は地図 API 使わない pattern」 を 「Phase 2-C も使わない」 に過剰一般化
2. Alter Morning の Google Maps 統合資産の **深さを過小評価** (Places API client / 2-layer cache / shared loader pattern / 既存 env のすべてが Plan で reusable)
3. ExternalAnchor 座標なしを「migration 必要」 と短絡 (= render-time 解決 + cache で migration なしで実現可能)
4. CEO 方針 「使える資産は使う」 を 「使わない方が安全」 と保守解釈

**v2 で修正した点**:
1. Alter Morning 資産の empirical audit を実施 (§1)、12 種の reusable assets を確認
2. server-side geocoding endpoint で migration なし、cache table 流用で migration なし、vanilla script loader で dep なし、既存 env で env 追加なし → **「使う」 と「最小安全設計」 は両立** と判明
3. v1 で設計した semantic-only UI (CategoryGrid / 静的 ALTER card / FAB / voice 等) は **すべて v2 で維持**、Map view を **上に追加** するだけ → v1 の作業も無駄にならない
4. 中断 trigger (§19) を明文化、本当に migration / env が必要になった瞬間に CEO 確認に戻る規律を維持

→ **v2 は v1 + Map view 統合 + 既存資産流用** の上位互換構造。v1 の semantic 設計は v2 でも「Category Grid」 として完全継続。

### 18.2 v3 を採用した CEO + GPT 方針整合

CEO 方針:
> alter の API は全て流用して使っていい。alter-morning 専用じゃなくて、こっちで普通に使っていい。
> Google マップも普通に api 入ってるから使っていい。使える資産は使うべき。

GPT v3 補正方針 (本 commit で全面採用):

| GPT 補正 | v3 実装 |
|---------|---------|
| 1. cost を hypothesis 化 | §0.5.1-1 / §5.7.2 / §11.13 / §14 判断 4 / §19 cost spike trigger |
| 2. Privacy-safe payload (locationText only) | §0.5.1-2 / §5.2.2 / §5.2.3 / §5.8 / §11.13 privacy audit / §19 privacy trigger |
| 3. MorningMapView 不可触 | §0.5.1-3 / §5.1.1 default 推奨変更 / §14 判断 2 推奨 reverse / §19 MorningMapView 挙動変更 trigger / §20.2 non-comment 変更 0 |
| 4. @vis.gl / 新 env / migration / dep 禁止 | §0.5.1-4 / §0.4 / §12 / §19 / §20.2 |

自立推論強化 5 件 (本 v3 で追加):

| 強化 | v3 実装 |
|------|---------|
| 1. Per-user rate limit (100 calls/hour) | §5.2.1 / §5.2.3 / §11.13 rate limit smoke / §20.3 |
| 2. Anchor ownership check | §5.2.1 / §5.2.3 / §11.13 ownership smoke / §20.3 |
| 3. Input schema strict validation | §5.2.1 / §5.2.3 / §11.13 |
| 4. Lazy resolve + Normalized dedupe + Optimistic UI | §5.9 / §5.7.1 多層防御 / §11.13 |
| 5. Cached low-confidence guard + Browser key domain restriction | §5.2.3 confidenceAtLeastMedium / §5.8.4 Google Cloud Console / §11.13 / §20.3 |

→ v3 は **CEO 方針整合 + GPT 補正全採用 + Aneurasync 哲学維持 + 自立推論強化** の 4 要件をすべて満たす最終 design。

---

## 19. 中断 trigger (実装中に CEO 確認に戻る条件、v3 で閾値明文化)

実装中、以下のいずれかが必要になった瞬間 / 観測された瞬間 → **作業中断 + CEO 確認**:

| カテゴリ | 具体 trigger | 閾値 / 検証法 (v3 補正) |
|---------|-------------|-----------------------|
| **migration** | ExternalAnchor 型に lat / lng / geo_point field 追加が必要 / `place_resolution_cache` table への column / index / constraint 追加が必要 / 新 table 作成が必要 | grep で `supabase/migrations/202605*` の存在確認、または schema 設計案を CEO へ |
| **env** | 新 env variable 追加が必要 (`NEXT_PUBLIC_*MAPS*` の Plan 用 key、`*GEO*`、`*MAP*` 等) / 既存 env の rename / Plan 用に key rotation / 既存 key の secret 露出範囲変更 | `.env.example` / `vercel env ls` を base から diff、新 row があれば trigger |
| **dependency** | `@vis.gl/react-google-maps` / `@googlemaps/markerclusterer` / `@types/google.maps` / `leaflet` / `mapbox-gl` / `google-map-react` / 他 geo / map / clustering / heatmap 系 dep install | `package.json` diff、新 dependency があれば trigger |
| **MorningMapView 挙動変更** (GPT 補正 3 整合) | `components/home/morning/MorningMapView.tsx` の non-comment 行の変更、analytics emit / pin extraction / failsafe / script load timing いずれかの挙動変化 | Morning 既存 test の修正が必要になった瞬間 / Morning CEO smoke で regression 観測 / `MorningMapView.tsx` の non-comment diff > 0 行 |
| **Alter Morning 側 logic 改変** | `placesApiClient` の field mask / quota 変更 / `placeResolver` の cacheKey 規約変更 / `placeCacheStore` の TTL / table 名変更 | これら file の non-comment 変更 0 が前提、変更が必要になった瞬間 trigger |
| **cost spike** (GPT 補正 1 整合) | Places API call が想定 ($0.19/user/month hypothesis、上限 $3.8) を **2 倍以上超過** / cache hit 率が **50% 以下** / 1 user あたりの月次 calls > 200 | Google Cloud Console 観測 + Vercel analytics、月次 review で threshold 比較 |
| **build performance** | Vercel build 時間が Phase 2-B baseline から **+10% 以上** 増加 | Vercel deploy log の build duration を Phase 2-B 値と比較 |
| **privacy** (GPT 補正 2 整合) | locationText 以外の anchor metadata (title / notes / sensitiveCategory) を Google に送る必要 / audit log に locationText 実値が出る / Places API response body の rich metadata を client に返す | DevTools Network で `places.googleapis.com` への request body の field 監査、`textQuery` 以外があれば trigger |
| **rate limit / DoS** | 1 user 月 100 calls / hour を恒常的に超過 / DDoS / 不正利用観測 | server log で 429 発火率 > 10% / hour 観測 |
| **scope creep** | Phase 3 ALTER 動作実装が必要 / Phase 2-A / Phase 2-B の改修が必要 / CoAlter / Mirror / W1-6 / DraftPlan 接続が必要 | 設計時 / 実装時 / CR 時にいずれかの scope を求める commit が必要になった瞬間 |
| **sensitive data leakage** | 何らかの理由で sensitive anchor の title / locationText が Google に送られる、または log に書かれる、または client response に rich metadata として返される | DevTools / server log audit で観測 |

→ いずれも CEO 確認後、**再着手 / scope 修正 / 別 wave 移行 / 中止** のいずれかを決定。中断時は本 branch を凍結、修正後 commit から再開。

---

---

## 20. Phase 2-C implementation GO condition checklist (v3 新規、GPT 補正整合)

Phase 2-C 実装 (Phase 2-C impl branch) に着手する前に、**以下を全て CEO が確認 + 承認** すること:

### 20.1 設計面 (本 mini design への承認)

- [ ] v3 mini design 全体を承認 (§0.5 補正 4 + 強化 5 反映済)
- [ ] §14 判断 1-17 のいずれを採用するか CEO 確定
- [ ] §19 中断 trigger 11 件 を CEO 把握
- [ ] §5.8 privacy guarantees を CEO 承認 (= locationText only 外送信、その他データ送信なし)
- [ ] §5.7 cost mitigation strategy を CEO 把握 (= cost は hypothesis、actual は実測)

### 20.2 実装制約 (実装中に維持すべき条件、自動チェック可能)

- [ ] 新 env なし (= `vercel env ls` diff 0)
- [ ] 新 migration なし (= `supabase/migrations/202605*` 不在、ExternalAnchor schema 不変)
- [ ] 新 dep なし (= `package.json` diff 0、特に `@vis.gl` / `@types/google.maps` / `leaflet` / `mapbox-gl` / `google-map-react` / `@googlemaps/markerclusterer`)
- [ ] `components/home/morning/MorningMapView.tsx` non-comment 変更 0 (= GPT 補正 3 整合、`git diff feat/alter-plan-phase2-b-flow-list..feat/alter-plan-phase2-c-map-tab -- components/home/morning/MorningMapView.tsx | grep "^[+-]" | grep -v "^[+-]\s*\*\|^[+-]\s*//" | wc -l` が 0)
- [ ] `lib/alter-morning/{placesApiClient,placeResolver,placeCacheStore,locationResolver}.ts` の non-comment 変更 0 (call signature 経由のみ流用)
- [ ] `supabase/migrations/20260416100000_place_resolution_cache.sql` 不変 (= 同 table schema 不変)
- [ ] `lib/plan/external-anchor.ts` 不変 (= ExternalAnchor 型に lat/lng 追加なし)
- [ ] CoAlter / Mirror / /talk / D-* / W1-6 / DraftPlan / fallback path 不触 (= file diff 0)
- [ ] Phase 2-A / Phase 2-B 既存実装 (CalendarTab / FlowTab / 既存 helpers) の non-comment 変更 0

### 20.3 検証ゲート (実装後に PASS すべき条件)

- [ ] `npx tsc --noEmit`: 修正 file 由来の error 0
- [ ] `npx eslint <修正 files>`: 0 errors / 0 warnings
- [ ] `npx vitest run tests/unit/plan/`: regression 0 (Phase 2-A / 2-B baseline + 新 tests)
- [ ] `npx vitest run tests/unit/alter-morning/`: regression 0 (= Morning 既存 test 全て PASS、本 wave で Morning に影響なし保証)
- [ ] `npm run build`: ✓ Compiled successfully、Phase 2-B baseline から +10% 以内
- [ ] DevTools Network audit (CEO smoke): `places.googleapis.com` への request body field を確認、`textQuery` 以外送信 0
- [ ] DevTools Network audit: `/api/plan/anchors/geocode` への request body は `{ items: [{ anchorId, locationText }] }` のみ、extra field を含む request は 400 返る
- [ ] DevTools Network audit: `maps.googleapis.com/maps/api/js` script は SCRIPT_ID `alter-morning-gmaps` 1 個だけ inject される (= Morning と同 script 共有)
- [ ] DevTools Console audit: React 19 warning 0、Google Maps related warning は Morning 由来のもののみ
- [ ] Browser key domain restriction: Google Cloud Console で HTTP referrers が aneurasync domain 限定 (= CEO 操作要件、§5.8.4)
- [ ] Rate limit smoke: 同一 user 101 回目 request が 429 + Retry-After header 返却
- [ ] Anchor ownership smoke: 他 user の anchorId を含む request が該当 anchor を silently 除外 (or 403、§14 判断)
- [ ] Alter Morning CEO smoke (実機): MapView 機能が regression 0 で動作 (= GPT 補正 3 整合の最終 verify)

### 20.4 中断 trigger 監視体制

- [ ] 実装着手後、§19 trigger を週次 review (CEO 別判断)
- [ ] cost: Google Cloud Console で月次観測、hypothesis ($0.19/user/month) の 2 倍超えで CEO 確認
- [ ] build time: Vercel deploy 毎に Phase 2-B baseline と比較、+10% 超えで CEO 確認
- [ ] regression: Morning / Plan CEO smoke を Phase 2-C local smoke と同時に走らせる

### 20.5 GO 判断フロー

```
v3 mini design 承認 (§20.1)
   ↓ YES
判断 1-17 確定 (§14)
   ↓ 確定
実装制約 (§20.2) を CEO + AI 同意
   ↓ 同意
Phase 2-C impl branch (feat/alter-plan-phase2-c-map-tab) を docs branch から派生
   ↓
C1 (server endpoint + helpers + tests)
   ↓ PASS (§20.3 partial)
C2 (loader + hook + MapTab refactor)
   ↓ PASS (§20.3 partial)
C3 (polish + cost guard docs + smoke docs)
   ↓ PASS (§20.3 full)
CEO local smoke
   ↓ PASS
branch 凍結、GitHub 復旧待ち
   ↓ 復旧
push & PR & merge (§17.2)
   ↓
Phase 2-C 完了
```

実装中に §20.2 / §20.3 のいずれかが NO になった瞬間 → §19 中断 trigger 該当 → CEO 確認に戻る。

---

**End of Mini Design v3**. CEO レビュー → 判断 1-17 (§14) → §20 GO checklist 確認 → 実装 wave (3 commits) GO/NO-GO 判断をお待ちします。

復旧前に既に許可された範囲は §7.1 + §17.5、復旧後手順は §17.2-17.3。実装は 4 段 stacked branch (Phase 2-A → Phase 2-B → Phase 2-C docs → Phase 2-C impl) で安全に進行可能。実装中に §19 のいずれかが trigger → 中断 + CEO 確認。本 v3 は GPT 補正 4 件 + 自立推論強化 5 件を反映、v2 の構造的方向 (Google Maps あり 本命) は維持。
