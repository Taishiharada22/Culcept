# Phase 3-L-4c-mapbridge Readiness Audit (= read-only、 pure helper 連続 GO 可能)

**作成日**: 2026-05-22
**承認**: CEO + GPT 合議 (= L-4c-pure 着地後、 「L-4c-mapbridge readiness audit に進む、 audit 結果が pure helper / tests だけで済む low-risk なら連続実装 OK」 指示)
**範囲**: 既存 MapTab geocode hook (= `_usePlanGeocode`) の output state shape を L-4c-pure pipeline input (= `coordsByAnchorId`) に変換する bridge layer の読み取り監査 + 低リスク pure helper 設計

> 本 audit は **L-4c-mapbridge-pure 連続実装 GO** と結論する。
> active geocode call なし / UI 変更なし / MapTab state 変更なし / PlanClient 変更なし。

---

## 0. Purpose

L-4c-pure pipeline は `coordsByAnchorId: ReadonlyMap<string, {lat, lng}>` を caller から受け取る。 一方、 既存 MapTab は `_usePlanGeocode` hook で `Map<string, AnchorResolution | null>` を保持している。

両者の **shape mismatch** を pure helper で埋める。 これがないと L-4d UI 接続時に MapTab 内に **直書きで変換ロジックが入る** リスクがある (= MapTab を汚す)。

→ 「safe な 1 関数」 として helper を切り出して freeze する。

---

## 1. 既存 MapTab geocode state の read-only 調査結果

### 1.1 hook 出力 shape (= `_usePlanGeocode.ts`)

```typescript
export interface AnchorResolution {
  lat: number;
  lng: number;
  confidence: string;       // "medium" 以上のみ返る (= server endpoint で filter 済)
  resolvedName: string;     // Places API の正規化名 (= "東京駅" 等、 PII 含む可能性)
}

export interface UsePlanGeocodeResult {
  resolutions: Map<string, AnchorResolution | null>; // ← anchor.id → resolution | null
  loading: boolean;
  apiAvailable: boolean;
}
```

### 1.2 null の意味 (= 統一 fallback)

server endpoint (`/api/plan/anchors/geocode`) が以下のいずれかの理由で resolution を null として返す:
- locationText 空 (= geocode 対象外)
- sensitiveCategory 設定済 (= Places API 呼ばない、 §2.0 不変原則)
- confidence "low" (= 既存 server で unresolved 扱い)
- not-owned anchor (= ownership check 失敗)
- Places API unavailable (= GOOGLE_MAPS_API_KEY 未設定)
- Places API timeout / error (= fail-open)
- rate limit (= 429)

→ **bridge helper は null を一律「unresolved」 として扱い skip**。 「なぜ null か」 は気にしない。

### 1.3 stale 結果の防御 (= hook 側で完結)

`_usePlanGeocode` は `fetchKey` (= anchor id + locationText concat) を `useEffect` の dep にし、 `cancelled` flag で race condition を防御。

→ **bridge helper は stale を気にしない**。 hook が常に最新の resolution map を返す前提で OK。

### 1.4 privacy 不変原則 (= hook 自身の規約、 維持される)

- in-memory のみ (= localStorage / sessionStorage / IndexedDB 書き込み禁止)
- anchor.title / notes / sensitiveCategory を server に送らない
- raw locationText は send するが、 server endpoint 側で sensitive blocking 等を実行済

→ **bridge helper も in-memory のみ**。 永続化なし。

### 1.5 lat/lng 型

`number`。 server endpoint が Number.isFinite で validate していないので、 helper 側で **防御**する。

---

## 2. 既存 PlanClient / MapTab の利用状況

PlanClient は `usePlanGeocode(visibleAnchors)` を呼び、 結果を MapTab 内の表示に使う。 L-4c-pure (= `runMovementDisplayPipeline`) は PlanClient / MapTab からはまだ呼ばれていない。

→ **L-4d UI 接続**で初めて PlanClient が L-4c-pure を呼ぶ予定。 そのとき caller は本 audit が提案する bridge helper を 1 行使うだけで `coordsByAnchorId` を作れる。

---

## 3. L-4c-mapbridge-pure 設計

### 3.1 入力

```typescript
ReadonlyMap<string, AnchorResolution | null>
```

(= `_usePlanGeocode.resolutions` をそのまま渡せる)

### 3.2 出力

```typescript
ReadonlyMap<string, { readonly lat: number; readonly lng: number }>
```

(= L-3c overlay / L-4c-pure pipeline の `coordsByAnchorId` 入力にそのまま使える)

### 3.3 変換ルール

| input entry | 動作 |
|---|---|
| key + `null` | **skip** (= 出力 map に入れない、 unresolved として扱われる) |
| key + `{lat, lng, ...}` で lat NaN/Infinity | **skip** (= 防御、 server から不正値が来ても安全) |
| key + `{lat, lng, ...}` で lng NaN/Infinity | **skip** |
| key + 正常な `{lat, lng}` | **採用** (= `{lat, lng}` のみ抽出、 `confidence` / `resolvedName` は **捨てる**) |

### 3.4 privacy 設計

- `resolvedName` (= Places API の正規化名、 「東京駅」 等の PII) は **絶対に output に含めない**
- `confidence` も output に含めない (= L-4c-pure pipeline 側で provider が自前の confidence を生成する責任)
- key は anchor.id (= 既に L-3c の transitionKey で禁止された anchor id だが、 ここは「caller の責任」 として渡すだけ、 overlay の sanitize で消える)

### 3.5 pure 保証

- 入力 mutation 0 (= 新規 Map 構築)
- 副作用 0
- 同一 input → 同一 output (= deterministic)
- async なし (= 既存 hook が async、 helper は sync で受け取って sync で返す)

---

## 4. STOP 条件 (= 連続 GO 着手前 必須クリア)

| STOP 条件 | 確認 |
|---|---|
| MapTab state 変更が必要 | 0 (= 既存 hook output をそのまま読むだけ) |
| active geocode call が必要 | 0 (= 既存 hook の結果を読むだけ、 新規 fetch なし) |
| UI 変更が必要 | 0 (= helper は data 変換、 render なし) |
| PlanClient 変更が必要 | 0 (= L-4d で caller が helper を呼ぶ予定、 本 audit では PlanClient は touch しない) |
| privacy 方針に触れる | 0 (= 既存 hook 規約内、 `resolvedName` / `confidence` を捨てる安全側) |
| env / API / DB / package / dependency | 0 |
| K phase / L-1〜L-4c-pure 既存 file 変更 | 0 |
| `_usePlanGeocode.ts` 自身を変更 | 0 (= AnchorResolution type を `type` import するのみ) |

→ **全 8 STOP 条件未抵触**。 L-4c-mapbridge-pure 連続実装 GO 判断成立。

---

## 5. 実装位置決定

| 候補 | 評価 |
|---|---|
| `lib/plan/transport/mapTabCoordsBridge.ts` | ✅ **推奨** (= transport layer 内、 L-4c 系の隣) |
| `app/(culcept)/plan/tabs/_geocodeBridge.ts` | ❌ tab layer に置くと再利用しにくい |
| `app/(culcept)/plan/tabs/_usePlanGeocode.ts` 内に追加 | ❌ hook と pure helper を混ぜると単一責任崩れる |

→ **`lib/plan/transport/mapTabCoordsBridge.ts`** に置く。 名前は「MapTab の geocode → 我々の coords」 を明示。

### 5.1 import 方向

```
mapTabCoordsBridge.ts → AnchorResolution type を `_usePlanGeocode.ts` から import (= type only)
```

`_usePlanGeocode.ts` は変更しない (= 既に `AnchorResolution` interface を export 済)。

---

## 6. L-4c-mapbridge-pure 名前空間

```typescript
// lib/plan/transport/mapTabCoordsBridge.ts

import type { AnchorResolution } from "@/app/(culcept)/plan/tabs/_usePlanGeocode";

/**
 * Bridge layer の output coords 型 (= L-3c overlay / L-4c-pure pipeline の入力に合致)。
 */
export interface BridgedCoords {
  readonly lat: number;
  readonly lng: number;
}

/**
 * MapTab geocode hook の出力 (= Map<anchor.id, AnchorResolution | null>) を
 * L-4c-pure pipeline の入力 (= Map<anchor.id, {lat, lng}>) に変換する pure helper。
 */
export function buildCoordsByAnchorIdFromGeocodeResults(
  resolutions: ReadonlyMap<string, AnchorResolution | null>,
): ReadonlyMap<string, BridgedCoords>;
```

---

## 7. 連続 GO 範囲 (= 本 audit が許可する実装 scope)

| 項目 | 着手 |
|---|---|
| `buildCoordsByAnchorIdFromGeocodeResults` pure helper | ✅ |
| tests (= null skip / NaN skip / privacy / immutability / pipeline integration) | ✅ |
| documentation | ✅ |
| ❌ MapTab UI / PlanClient 変更 | NO |
| ❌ `_usePlanGeocode.ts` 改変 | NO |
| ❌ 新規 fetch / endpoint 呼出 | NO |
| ❌ runtime telemetry sink | NO |
| ❌ env / DB / package / dependency | NO |

---

## 8. CEO 判断ポイント (= L-4c-mapbridge-pure 着地後)

| Q | 内容 |
|---|---|
| Q1 | L-4c-mapbridge-pure 着地で十分か (= 本 helper で L-4c 全範囲 freeze するか) |
| Q2 | 次は L-4d UI 接続 (= PlanClient で helper + pipeline を呼ぶ) か、 別軸 pivot か |
| Q3 | L-4d 前に CEO smoke (= preview で「移動 約 30 分」 表示確認) を挟むか |

---

## 9. 関連 docs

- `docs/alter-plan-phase3-l-4c-bridge-readiness-audit.md` (= L-4c-pure pipeline audit)
- `docs/alter-plan-phase3-l-4-readiness-audit.md` (= L-4 全体責務分解)
- `app/(culcept)/plan/tabs/_usePlanGeocode.ts` (= 入力源、 改変なし)
- `app/api/plan/anchors/geocode/route.ts` (= Phase 2-C 既存 endpoint、 改変なし)

---

## 10. 思想の transmission

1. **bridge は「shape mismatch を 1 関数で埋める」 が責務** — それ以上のことをしない
2. **既存 hook を改変しない** — `_usePlanGeocode` は Phase 2-C で確立済、 触らない
3. **privacy 最小化** — `resolvedName` (= 「東京駅」 等の PII) を捨てる安全側
4. **stale / null / NaN は全て一律 skip** — 「unresolved として扱う」 で統一
5. **L-4d UI 接続前の必要十分な抽象化** — helper 1 行で caller が L-4c-pure を呼べる

bridge helper は **「危険境界を超えずに UI 接続準備を整える」** ことだけを担当する。
