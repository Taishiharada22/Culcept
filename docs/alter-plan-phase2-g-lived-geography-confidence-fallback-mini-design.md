# Alter Plan Phase 2-G — Lived Geography Confidence Fallback / 信頼度つき生活圏 fallback Mini Design

**Status**: docs only (local 起票、未 commit)
**Date**: 2026-05-21
**Branch (予定)**: `feat/alter-plan-phase2-g-lived-geography-confidence-fallback` (= 実装着手時に派生、CEO 承認後)
**Pre-requisite**: Phase 2-D (cda09ef1) / Phase 2-E (677b7b6a) / Phase 2-F (b4ab331e) 凍結済
**Author**: Claude × CEO (Aneurasync) — GPT 補正 7 点反映 + actual code audit + 自立推論強化

---

## 0. 一行 summary

> Plan MapTab の baseline pin fallback を 「**信頼できる時だけ生活圏中心を使う**」 設計に補正する。
> 単純な重心ではなく、**confidence gate** を通過した sample 群のみを採用、外れ値が多い場合は silently baseline に degrade する。
> 「最近の場所を平均する機能」 ではなく 「ユーザーの生活圏を、信頼できる時だけ地図 fallback に使う機能」。

---

## 1. 背景と問い

### 1.1 Phase 2-D/E/F が解いていない gap

Phase 2-D で Place picker、Phase 2-E で時刻重なり気付き、Phase 2-F で Place Identity Contract を確立。残る大きな視覚体験 gap:

> MapTab の baseline fallback が **prefecture 50km broad** (= 県中心) で、user の生活実感とほぼ無関係な pin 配置になる。

例: 「成田在住の user が free text 入力で未確定の anchor を作る」 → MapTab で千葉県中心 (= 成田から数十 km 離れた行政中心) に pin される。これは「自分の生活を地図で見る」 体験を著しく損なう。

### 1.2 Phase 2-G が解く問題

> resolved anchor の生活圏中心を信頼できる時だけ baseline fallback に挿入する。
> 「平均地点」 ではなく「**信頼度つき生活圏**」 として、確信が持てない場合は **黙って既存 baseline に戻す**。

### 1.3 Phase 2-G が解かない問題 (= Phase 2-H 以降預け、GPT 補正 6 確認済)

- ❌ Geolocation API による現在地 fallback → **Phase 2-H 以降**、permission flow (denied / blocked / unavailable / secure context / Permissions-Policy) が scope 大 ([MDN Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition))
- ❌ AnchorResolution の `confidence` field 値の細分化 (= 「resolved」 or null の 2 値のみ使用)
- ❌ rigidity / category 重み付け → 将来拡張ポイント (§19)
- ❌ time-of-day 別生活圏 (朝の通勤圏 vs 夜の帰宅圏) → 将来拡張ポイント
- ❌ baseline home / city / prefecture 仕様変更
- ❌ place_resolution_cache schema 変更
- ❌ migration / env / dependency
- ❌ AnchorFormFields / PlaceCandidatesPanel / AddAnchor / EditAnchor / Detail
- ❌ MorningMapView / CoAlter / talk / Mirror / W1-6 / DraftPlan
- ❌ GitHub push / PR / remote ops

---

## 2. 設計思想 (= GPT 補正 1-7 反映 + 自立推論)

### 2.1 GPT 補正 1: 「home より上に置かない」

Claude 当初案の「resolved > current > **lived geography > home** > city > prefecture」 は **危険**。

理由 (GPT):
> home が分かっているなら、それはユーザーの明示的・安定的な生活拠点。
> 直近の外出先の重心が、home より正しいとは限らない。

例: 成田在住 user が直近数件だけ渋谷・新宿・池袋に行っていた場合、lived geography 重心は東京寄り。 未解決 anchor の fallback として常に東京寄りに置くのは誤り。

### 2.2 補正後の Confidence Order (= 固定順ではなく信頼度順、GPT 補正 1)

```
1. resolved anchor / place_resolution_cache hit              ← 最高信頼 (anchor 個別の正確 pin)
2. current location / Geolocation API ※Phase 2-H 以降、未実装
3. reliable home baseline                                    ← user 明示・安定 base
4. lived geography confidence fallback                       ← 本 Phase 2-G 新規、gate 通過時のみ
5. city baseline                                             ← 既存
6. prefecture baseline                                       ← 既存
7. none                                                      ← 既存
```

**設計判断 (= 自立推論)**:
- `home` が `reliable` でない場合 (= label 不正 / coord 異常 / 古い等) は lived geography が city / prefecture より上に来てよい
- 現実装の `_usePlanBaseline.ts` で home が `BaselineCoords` として返ってきている時点で「reliable home」 とみなす (= reliability 判定は Phase 2-G では追加しない、既存 baseline の trust を尊重)
- → 現 Phase では「home 存在 ⇒ home 優先、home なし ⇒ lived geography が city/prefecture より上」 のシンプル判定

### 2.3 Phase 2-G の名称 (= GPT 補正 2)

「**Lived Geography Confidence Fallback / 信頼度つき生活圏 fallback**」

単純な重心ではなく、**confidence gate** を通過した sample 群のみを採用。fail 時は **silent fallback** で既存 baseline に degrade。

「**最近の場所を平均する**」 ではなく「**ユーザーの生活圏を信頼できる時だけ使う**」 機能。

### 2.4 三層 invariant 再確認 (Phase 2-F で確立、本 Phase でも維持)

| Layer | Phase | 責務 |
|-------|-------|------|
| Data layer | 2-D 凍結 | canonical text 保存形式 / parse helpers |
| Decision layer | 2-D C3 / 2-E 凍結 | isPlaceUnconfirmed / detectTimedAnchorOverlaps |
| Display layer | 2-F 凍結 | formatLocationDisplayParts による 3 段密度 |
| **Spatial fallback layer** | **2-G 新規** | **`computeLivedGeographyFallback` による confidence gate** |

→ Phase 2-G は **新 layer = Spatial fallback layer の確立**。Display / Decision / Data に一切 touch しない。

---

## 3. Confidence-gated fallback chain (= 詳細仕様)

### 3.1 Confidence Order (decision sequence、補正 1)

```typescript
function decideFallbackPin(
  anchor: ExternalAnchor,
  resolutions: Map<string, AnchorResolution | null>,
  baselineCoords: BaselineCoords | null,
  livedGeography: LivedGeographyFallback | null,
): PinDecision {
  // 1. resolved anchor (最優先、既存)
  const resolved = resolutions.get(anchor.id);
  if (resolved) return { kind: "resolved", lat, lng, ... };

  // 2. (Phase 2-H+) current location → 未実装

  // 3. reliable home baseline (= 存在すれば優先)
  if (baselineCoords?.source === "home") return { kind: "baseline", coords: baselineCoords };

  // 4. lived geography (gate pass 時)
  if (livedGeography) return { kind: "lived_geography", coords: livedGeography };

  // 5-6. city / prefecture baseline (既存)
  if (baselineCoords?.source === "city") return { kind: "baseline", coords: baselineCoords };
  if (baselineCoords?.source === "prefecture") return { kind: "baseline", coords: baselineCoords };

  // 7. none (既存)
  return { kind: "none" };
}
```

**重要**: 現実装の `BaselineCoords` は 1 つの object に source field が入っており、home / city / prefecture を独立で返さない (= line 43 の `_usePlanBaseline.ts` 確認済)。そのため:
- baseline source = "home" → home として優先
- baseline source = "city" or "prefecture" → lived geography (gate pass 時) が上回る可能性

### 3.2 Confidence Gate 仕様 (= GPT 補正 3 完全反映)

Lived geography centroid を **採用するか null にするか** の判定:

```
PASS 条件 (すべて満たす):
  ✅ minSamples >= 3                       (= sample 数下限)
  ✅ sensitive anchor exclude              (= privacy 配慮)
  ✅ stale anchor exclude                  (= freshDays 期間外を集計しない)
  ✅ invalid coordinates exclude           (= lat/lng が NaN / 範囲外を除外)
  ✅ maxDistanceKm < threshold (= 30 km)   (= dispersion gate、外れ値検出)

FAIL → null を返す → 呼び出し側で既存 baseline へ silent fallback
```

### 3.3 Threshold 値の根拠

| パラメータ | 値 | 根拠 |
|----------|-----|------|
| `minSamples` | **3** | 1-2 件では「生活圏」 として意味不明、3 件で minimum pattern |
| `freshDays` | **30** | 「直近の生活実感」、月単位の生活パターン整合 |
| `maxDistanceKm` | **30 km** | 通勤通学範囲の上限値、これを超えると 「生活圏」 ではなく「日々違う行先」 |
| `MIN_LAT / MAX_LAT` | -90 / 90 | 球面座標範囲 |
| `MIN_LNG / MAX_LNG` | -180 / 180 | 同上 |

これらは helper 引数で **override 可能** にする (= test / 将来調整用)。

### 3.4 dispersion 計算式 (= 補正 3)

```
1. 全 sample の重心 (lat, lng) = (mean of lat, mean of lng)
2. 各 sample から重心までの Haversine 距離を計算
3. max 距離 maxDistanceKm = Math.max(...distances)
4. maxDistanceKm > threshold → null 返却
```

**注**: Haversine 距離は `lib/plan/...` で既に Phase 2-D Places Search endpoint で使用済 → 同 helper を再利用可能 (= 重複実装回避)。

### 3.5 sample 選別ロジック (= GPT 補正 3 + 自立推論)

```typescript
// freshDays 内に occurrence ある anchor のみ集計
// 1 anchor = 1 sample (= recurring の occurrence overweight を回避、自立推論)
// sensitive anchor は除外 (= privacy)
// resolutions に lat/lng がある anchor のみ
// lat/lng が範囲外 / NaN は除外 (= defensive)

const samples = anchors.filter(a => {
  if (a.sensitiveCategory) return false;                                // privacy
  if (!isFreshAnchor(a, now, freshDays)) return false;                  // stale exclude
  const r = resolutions.get(a.id);
  if (!r) return false;                                                  // resolved only
  if (!isValidCoord(r.lat, r.lng)) return false;                        // invalid exclude
  return true;
});
```

### 3.6 isFreshAnchor 仕様 (= 自立推論で actual schema 反映)

actual code audit より:
- **OneOff**: `anchor.date` (YYYY-MM-DD) を now と比較、`now - anchor.date <= freshDays`
- **Recurring**: validity 期間内かつ recurrence rule で freshDays 内 occurrence あるか
  - 簡略化案 (= 現 Phase で採用): `validFrom <= now <= (validUntil ?? Infinity)` かつ valid 期間が freshDays と overlap
  - 厳密判定 (= future): `anchorsForDay` を 過去 freshDays 日で繰り返し呼び出し、1 つでも occurrence あるか
  - 採用: **簡略化案** (= recurring anchor は valid 期間内なら sample 1 つとして含める)

---

## 4. Helper API 設計 (= GPT 補正 4 採用)

### 4.1 File: `lib/plan/livedGeographyFallback.ts` (新規)

```typescript
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { AnchorResolution } from "@/app/(culcept)/plan/tabs/_usePlanGeocode";

/**
 * Phase 2-G: 信頼度つき生活圏 fallback。
 *
 * 設計書: docs/alter-plan-phase2-g-lived-geography-confidence-fallback-mini-design.md
 *
 * 不変原則:
 *   - confidence gate (minSamples / sensitive / stale / invalid / dispersion) を通過時のみ非 null
 *   - gate fail → null を返し、呼び出し側で既存 baseline へ silent fallback
 *   - pure (no fetch / Date.now() は引数 now で injection、入力 mutate なし)
 *   - sensitive anchor の座標は集計対象外 (= privacy)
 *   - recurring anchor も one_off も 1 anchor = 1 sample (= occurrence overweight 回避)
 */
export interface LivedGeographyFallback {
  /** 生活圏中心 latitude */
  lat: number;
  /** 生活圏中心 longitude */
  lng: number;
  /** 集計に使った resolved anchor 数 (>= minSamples) */
  sampleCount: number;
  /** 集計期間 (days) */
  freshDays: number;
  /** 重心から最も離れた sample までの距離 (km、dispersion 指標) */
  maxDistanceKm: number;
  /** fallback source 識別子 (UI / debug 用) */
  source: "lived_geography";
  /**
   * 信頼度。現 Phase 2-G では "medium" のみ。
   * 将来 sampleCount / maxDistanceKm に基づき "high" / "low" を細分化可能 (= 将来拡張、§19)。
   */
  confidence: "medium";
}

export interface LivedGeographyOptions {
  /** sample 数下限 (default: 3) */
  minSamples?: number;
  /** 集計期間 (days、default: 30) */
  freshDays?: number;
  /** dispersion threshold (km、default: 30) */
  maxDistanceKm?: number;
}

/**
 * 渡された anchor / resolutions / now から、生活圏 fallback を計算。
 *
 * @param anchors 全 anchor 配列
 * @param resolutions usePlanGeocode の戻り値 Map (anchor.id → AnchorResolution | null)
 * @param now 現在時刻 (= test 用 inject 可能)
 * @param options 閾値の override (default 推奨)
 * @returns LivedGeographyFallback or null (= confidence gate fail)
 */
export function computeLivedGeographyFallback(
  anchors: ReadonlyArray<ExternalAnchor>,
  resolutions: ReadonlyMap<string, AnchorResolution | null>,
  now: Date,
  options?: LivedGeographyOptions,
): LivedGeographyFallback | null;
```

### 4.2 内部 helpers (export しない)

```typescript
function toDateUtc(dateStr: string): Date { /* "YYYY-MM-DD" → Date */ }
function daysBetween(a: Date, b: Date): number { /* abs days */ }
function isFreshAnchor(anchor, now, freshDays): boolean { /* OneOff/Recurring 判定 */ }
function isValidCoord(lat, lng): boolean { /* 範囲チェック */ }
function haversineKm(a, b): number { /* Haversine distance、既存 lib/plan/...から再利用検討 */ }
function computeCentroid(coords): { lat, lng } { /* mean */ }
```

### 4.3 Pure / Complexity

- 完全 pure (no React hook / no fetch / no DOM / no global Date.now())
- 入力 mutate なし
- deterministic (same input → same output)
- O(N) for centroid + O(N) for max distance = O(N) total (N = filtered samples、typical < 50)

---

## 5. MapTab 統合方針

### 5.1 配置

- MapTab.tsx 内で `computeLivedGeographyFallback(anchors, resolutions, new Date(), options)` を `useMemo` で 1 回計算
- 結果を pin 決定ロジック (= 既存 `allPins` 構築) に統合
- pinKind が新たに `"lived_geography"` を取り得る (= 既存 `"resolved" | "baseline"` に追加)

### 5.2 baseline pin 配置の置換

既存:
```
unresolved anchor → baseline pin (home > city > prefecture)
```

Phase 2-G 後:
```
unresolved anchor:
  if baseline.source === "home" → home pin (= 最優先)
  else if livedGeography → lived_geography pin (= gate pass 時)
  else if baseline → city or prefecture pin (= 既存)
  else → no pin
```

### 5.3 SelectedAnchorCard の表示

新 `pinKind === "lived_geography"` の場合:

```typescript
const baselineSourceLabel = (() => {
  if (pinKind === "lived_geography") {
    return "最近の場所傾向をもとに仮置きしています";  // 補正 5 採用文言
  }
  if (pinKind !== "baseline" || !baselineCoords) return null;
  // ...既存 home / city / prefecture 表示...
})();
```

`text-amber-600` の警告色は **使わない** (= Phase 2-F で確立した思想)、現状の text-amber-600 baselineSourceLabel との整合は別途検討 (= 実装段階で audit)。

---

## 6. UI 文言 (= GPT 補正 5 採用)

| 状況 | 文言 |
|------|------|
| pinKind = "lived_geography" | **「最近の場所傾向をもとに仮置きしています」** |
| (× 採用しない) | 「あなたの最近の行き先の中心付近に置いています」 (= 断定が強い、誤解の原因) |
| (× 採用しない) | 「あなたの生活圏に置いています」 (= 過度な personalization 主張) |

理由:
- 「仮置き」 = 暫定であることを明示、user に正確な現在地と誤解させない
- 「傾向をもとに」 = data driven であることを伝える
- 警告 / 不安を煽る色は禁止 (= Phase 2-E / 2-F 思想踏襲)

---

## 7. Actual Code Audit 結果 (= GPT 補正 6 厳守)

| 項目 | 確認結果 | docs 反映 |
|------|---------|----------|
| `AnchorResolution` 実型 | `{ lat: number; lng: number; confidence: string; resolvedName: string }` (= `_usePlanGeocode.ts:29`) | §4.1 helper 引数で使用 |
| resolved coords 保持場所 | `usePlanGeocode` の戻り値 `Map<string, AnchorResolution \| null>` (line 38) | §4.1, §5.1 |
| `BaselineCoords.source` 値 | `"home" \| "city" \| "prefecture"` (3 値、line 43) | §3.1 fallback chain |
| baseline 優先順位 (実コード) | home → city → prefecture (Phase 2-C 補正済) | §3.1 |
| `baselineSourceLabel` 配置 | `MapTab.tsx:856-865` (private function 内) | §5.3 |
| ExternalAnchor 日付 field | OneOff: `date: string` / Recurring: `validFrom`, `validUntil?`, `recurrenceRule`, `exceptionDates?` | §3.6 |
| recurring 扱い | `anchorsForDay` で展開可能、ただし Phase 2-G では **1 anchor = 1 sample** で簡略化 (occurrence overweight 回避) | §3.5, §3.6 |
| Haversine distance 既存実装 | Phase 2-D Places Search で使用済 → `lib/plan/...` 内に存在予定、実装段階で再利用検討 | §4.2 |
| confidence field 値の現状 | string、具体値は実装段階で確認 (Phase 2-G では「resolved or null」 のみ判定) | §1.3 解かない問題 |

---

## 8. Edge case 完全枚挙

| # | ケース | 期待 |
|---|-------|------|
| 1 | resolved anchor 5 件、すべて生活圏内 (= maxDistance < 30km) | LivedGeographyFallback 返却 (confidence="medium") |
| 2 | resolved anchor 2 件のみ (= minSamples 不足) | null (= baseline へ silent fallback) |
| 3 | resolved anchor 0 件 | null |
| 4 | sample 3 件、ただし 1 件が外れ値 (= 重心から 50km) | null (= dispersion gate fail) |
| 5 | sample 5 件、すべて 同地点 (maxDistance = 0km) | LivedGeographyFallback (= 局所生活圏) |
| 6 | 30 日超過の anchor (= stale) | sample 対象外、残り sample で再判定 |
| 7 | sensitive anchor 含む | sensitive は集計対象外、残り sample で判定 |
| 8 | invalid coord (lat=999, NaN 等) | sample 対象外、残り sample で判定 |
| 9 | recurring anchor の validity 期間が freshDays 内 | 1 sample として含める |
| 10 | recurring anchor の validUntil < now (= 過去) | sample 対象外 |
| 11 | recurring anchor の validFrom > now (= 未来) | sample 対象外 |
| 12 | resolved anchor すべて sensitive | sample 0 件 → null |
| 13 | base case: 全条件 PASS で returns | LivedGeographyFallback 正常返却 |
| 14 | now < anchor.date (= 未来の anchor) | sample 対象外 (stale 判定で除外、= "fresh" の定義は past only) |
| 15 | Date.now() injection で 確定動作 (= deterministic test) | options.now で test 制御 |
| 16 | sample 3 件、maxDistance = 30km exactly | edge: gate PASS (= < ではなく ≤ で判定する設計判断)、もしくは strict <、test で確認 |
| 17 | helper to mutation invariant | 入力 anchors / resolutions Map を mutate しない |
| 18 | 大量 anchors (n=100) | O(N) で動作、 typical < 50 想定 |
| 19 | empty array → null | early return |
| 20 | options 省略 | default 値 (minSamples=3, freshDays=30, maxDistanceKm=30) で動作 |

### Edge 16 の設計判断 (= 自立推論)

**`maxDistance >= threshold` で fail** にする (= 30km は fail)。理由:
- threshold 値はちょうど境界、生活圏としてギリギリ判定保守的にすべき
- `<` で判定すると 29.99km が PASS、30.00km が FAIL という不自然な境界
- 実装は `if (maxDistance >= threshold) return null` で OK

---

## 9. Touched files 候補

```
新規 (2):
  lib/plan/livedGeographyFallback.ts                                    ~120 行 (helper + private helpers)
  tests/unit/plan/livedGeographyFallback.test.ts                        ~280 行 (20+ edge case)

変更 (1-2):
  app/(culcept)/plan/tabs/MapTab.tsx                                    +35-45 行 (useMemo + pin 決定統合 + baselineSourceLabel 拡張)
  app/(culcept)/plan/tabs/_usePlanBaseline.ts                           (要 audit: source 拡張せず、上位 layer で OR を取る方針も可)

合計: 3-4 ファイル
```

### 9.1 触らないファイル (CEO 制約 + Phase 2-D/E/F 凍結)

- `lib/plan/external-anchor.ts` (= schema 不変)
- `lib/plan/anchor-detail-format.ts` (= Phase 2-F 凍結)
- `lib/plan/anchorOverlap.ts` (= Phase 2-E 凍結)
- `lib/plan/locationConfirmationStatus.ts` (= Phase 2-D C3 凍結)
- `lib/shared/canonicalLocationText.ts` (= Phase 2-D 凍結)
- `app/(culcept)/plan/tabs/_usePlanGeocode.ts` (= AnchorResolution 型を import のみ)
- `app/(culcept)/plan/tabs/CalendarTab.tsx` / `FlowTab.tsx` (= MapTab のみ touch)
- `app/(culcept)/plan/components/*` (= Modal / FormFields 不変)
- MorningMapView / CoAlter / talk / Mirror / W1-6 / DraftPlan
- migration / env / dependency

---

## 10. Invariants (= Phase 2-G で守る不変原則)

1. **既存 baseline (home/city/prefecture) 仕様完全不変**
2. **`place_resolution_cache` schema 不変** (= Phase 2-C 凍結部分)
3. **resolved anchor pin 表示優先順位不変** (= 最優先で resolved を使う)
4. **sensitive anchor の座標は集計対象外、UI 表示 / privacy 既存仕様維持**
5. **helper gate fail / null 時は既存 baseline fallback に gracefully degrade** (= silent fallback)
6. **Phase 2-D/E/F の indicator / 場所表示完全不変**
7. **`AnchorResolution` 型不変** (= 読み取り専用利用)
8. **MapTab pin tap UX (= selectedAnchorId) 不変**
9. **`baselineSourceLabel` の既存 home/city/prefecture 表示は完全不変** (= 新 `"lived_geography"` のみ追加)
10. **`amber/red` 警告色を使わない** (= Phase 2-E/2-F 思想踏襲)

---

## 11. やること / やらないこと (= まとめ)

### 11.1 やること

- `computeLivedGeographyFallback` helper 新規実装 + 20+ edge case test
- MapTab で helper を `useMemo` で活用、pin 決定ロジック統合
- SelectedAnchorCard の baselineSourceLabel に `"lived_geography"` 文言追加 (= 補正 5 採用)
- 透明性: 「最近の場所傾向をもとに仮置きしています」 文言

### 11.2 やらないこと (明示禁止)

| 禁止 | 理由 |
|------|------|
| home より上に lived geography を置く | GPT 補正 1、思想違反 |
| 単純な centroid (= gate なし) | GPT 補正 3、外れ値で誤判定 |
| Geolocation API 統合 | Phase 2-H 以降預け |
| `confidence` を helper 内で計算判定 | 現 Phase では "medium" 固定 |
| amber / red 警告色 | Phase 2-F 思想踏襲 |
| recurring anchor の occurrence overweight 集計 | 通勤先 bias、自立推論で 1 anchor = 1 sample 採用 |
| sensitive anchor の座標集計 | privacy |
| AnchorResolution.confidence 値の細分化 | Phase 2-G では「resolved or null」 のみ判定 |
| migration / env / dependency | CEO 制約 |
| Phase 2-D/E/F branch への追加 commit | 凍結 |
| GitHub push / PR / remote ops | CEO 明示禁止 |

---

## 12. 実装順序

実装着手は **CEO の docs 承認 + 実装 GO 判断後**。

1. helper `lib/plan/livedGeographyFallback.ts` 作成
2. test `tests/unit/plan/livedGeographyFallback.test.ts` 作成 (20+ edge case)
3. helper 単体 test PASS 確認 (= 早期 fail 検知)
4. MapTab で `useMemo` で helper 呼び出し統合
5. pin 決定ロジック更新 (= confidence order)
6. SelectedAnchorCard baselineSourceLabel 拡張 (= "lived_geography" 文言)
7. 検証 (helper test → lint → tsc → test:unit → build) Phase 2-F と同 pattern
8. CEO 報告 + local commit 判断 (= remote ops 引き続き禁止)

---

## 13. Smoke scenario

### 13.1 Confidence PASS ケース

1. 過去 30 日に resolved anchor 5 件 (= 渋谷・新宿・池袋・吉祥寺・下北沢)、すべて生活圏内 (maxDistance < 30km)
2. MapTab で未解決 anchor を表示 (= base = "city")
3. → lived_geography pin が city pin より上位、 lived_geography pin で表示
4. SelectedAnchorCard で 「最近の場所傾向をもとに仮置きしています」 banner

### 13.2 Confidence FAIL ケース (= silent fallback)

1. 過去 30 日に resolved anchor 3 件 (= 成田・渋谷・横浜、maxDistance = 45km)
2. → dispersion gate fail (maxDistance >= 30km)
3. → null 返却、既存 baseline (city) fallback
4. UI は既存「市区町村中心 付近に置いています」 表示 (= user に gate fail を露骨に伝えない)

### 13.3 sample 不足

1. resolved anchor 2 件のみ
2. minSamples gate fail → null
3. 既存 baseline へ silent fallback

### 13.4 home 優先 (= 補正 1)

1. 過去 30 日に resolved anchor 5 件あり (PASS 候補)
2. baseline.source = "home"
3. → home が lived geography より優先、home pin で表示
4. lived geography は使われない (= GPT 補正 1 遵守)

### 13.5 既存 indicator 完全不変

1. Phase 2-D 場所未確定 indicator → 動作完全不変 (= MapTab Display layer 不変)
2. Phase 2-E 時刻重なり indicator → 完全不変
3. Phase 2-F Place Identity Contract (= primary / fullLabel) → 完全不変
4. AddAnchorModal / EditAnchorModal / Place picker → 完全不変

---

## 14. Failure scenario (= 警戒すべき edge)

### 14.1 helper 内 throw 防止

- すべて defensive (= invalid coord / NaN / null すべて null return で gracefully fail)
- helper が throw すると MapTab render が破壊される、絶対 throw しない

### 14.2 Date.now() の use を避ける

- `now` を引数で injection (= deterministic test、SSR 整合)
- helper 内で `new Date()` を直接呼ばない

### 14.3 集計対象 0 件

- empty array / 全 anchor sensitive / 全 unresolved → 即 null
- early return で計算回避

### 14.4 sample 数が大量 (> 100)

- O(N) で動作、performance 問題なし
- ただし future sweepline 化は §19 で言及

---

## 15. Test plan (= 20+ ケース)

### 15.1 describe ブロック構成

```
describe("computeLivedGeographyFallback")
  describe("confidence PASS")              # 3 件
  describe("confidence FAIL by minSamples") # 3 件
  describe("confidence FAIL by dispersion") # 3 件
  describe("sensitive exclude")            # 2 件
  describe("stale exclude")                # 3 件 (one_off, recurring valid, recurring expired)
  describe("invalid coord exclude")        # 3 件
  describe("recurring anchor handling")    # 2 件
  describe("options override")             # 2 件
  describe("edge case / boundary")         # 3 件 (empty, 1-only, exact threshold)
  describe("pure / immutability")          # 2 件
```

### 15.2 Test fixture pattern (= Phase 2-E/F 同 pattern)

```typescript
function makeAnchor(opts: {
  id: string;
  date?: string;     // OneOff
  validFrom?: string;  // Recurring
  validUntil?: string;
  sensitive?: AnchorSensitiveCategory;
}): ExternalAnchor;

function makeResolutions(entries: Array<{id: string; lat?: number; lng?: number}>): Map<string, AnchorResolution | null>;
```

### 15.3 deterministic now

すべての test で `now = new Date("2026-05-21T00:00:00Z")` を inject、相対判定で stable。

---

## 16. Implementation split (= CEO 制約「小さく切る」 反映)

### 案 A: 単一 commit (= 推奨、Phase 2-F と同 pattern)

- 3-4 ファイル変更で 1 commit
- 「lived geography confidence fallback の追加」 として原子性高い
- 復旧時の PR 重さ: 軽い

### 案 B: 2 commit (helper / UI を分離)

- F-1: helper + test のみ (= 2 ファイル)
- F-2: MapTab 統合 (= 1-2 ファイル)
- 利点: 各 step が独立 review 可能
- 欠点: F-1 と F-2 の間で「helper は存在するが使われていない」 状態

**推奨: 案 A 単一 commit**。理由:
- helper が statically import されない状態は dead code
- Phase 2-F と同サイズ感、復旧時 PR 単独で十分軽い

---

## 17. Branch / commit 方針

- **base**: Phase 2-F commit `b4ab331e` を起点に派生
- **branch name**: `feat/alter-plan-phase2-g-lived-geography-confidence-fallback`
- **既存凍結 branch** (Phase 2-D `cda09ef1` / 2-E `677b7b6a` / 2-F `b4ab331e`) は **不変**
- **既存 docs branch** (`329a7145`) は **不変**
- **scope 外 dirty** (next-env.d.ts / supabase/.temp / *.png) は **stage しない**
- **commit**: CEO 承認後の local commit のみ
- **remote**: push / PR / gh / merge / fetch / pull **全禁止**

---

## 18. Beyond / 不採用案 (透明性)

| 案 | 却下理由 |
|----|---------|
| lived geography を home より上に置く | GPT 補正 1、思想違反 |
| 単純 centroid (= gate なし) | GPT 補正 3、外れ値で誤判定 |
| Geolocation API 統合 | Phase 2-H 以降預け、scope 大 |
| `confidence: "high"` 細分化 | 現 Phase では "medium" のみ、将来拡張 |
| outlier 個別除去 (= median 等) | scope 大、dispersion gate で十分 |
| time-of-day 別生活圏 | scope 大、Phase 2-G+ |
| rigidity / category 重み付け | scope 大、bias 設計が必要 |
| recurring occurrence overweight 集計 | 通勤先 bias、自立推論で 1 anchor = 1 sample 採用 |
| amber / red warning color | Phase 2-E/2-F 思想踏襲 |
| user に gate fail を露骨に伝える | silent fallback で UX 整合 |

---

## 19. 将来拡張ポイント (= Phase 2-H 以降預け)

1. **Phase 2-H**: Geolocation API による現在地 fallback (= permission flow / secure context / Permissions-Policy)
2. **Phase 2-I+**: `confidence` 細分化 (= "high" sampleCount >= 10 / maxDist < 10km、"low" sampleCount = 3 / maxDist 20-30km)
3. **rigidity / category 重み付け**: hard anchor を高 weight (= 「動かせない予定」 の場所は信頼性高)
4. **time-of-day 別 lived geography**: 朝の通勤圏 / 夜の帰宅圏
5. **lived geography variation visualization**: standard deviation での散らばり可視化
6. **gate fail reason logging** (debug): 「sampleCount=2 (< 3)」 等を internal log
7. **Aneurasync 思想統合**: 「最近、生活圏が広く分散しています」 subtle 気付き indicator (= Phase 2-E / 2-F 思想横展開)
8. **sweepline 最適化**: O(N) → O(N log N) (= 大量 anchor 想定時)

---

## 20. 変更履歴

### 2026-05-21 v1 (本起票、GPT 補正 7 点 + 自立推論強化、actual code audit 反映)

- Phase 2-D (cda09ef1) / 2-E (677b7b6a) / 2-F (b4ab331e) 凍結後、Phase 2-G を CEO 採択 (A 補正付き GO)
- GPT 補正 7 点反映:
  - 補正 1: lived geography を home より上に置かない (= confidence order)
  - 補正 2: 「Lived Geography Confidence Fallback」 として再定義
  - 補正 3: dispersion gate 必須 (minSamples / sensitive / stale / invalid / maxDistance)
  - 補正 4: helper 名 `computeLivedGeographyFallback`、戻り値に sampleCount / maxDistanceKm / source / confidence
  - 補正 5: UI 文言「最近の場所傾向をもとに仮置きしています」 (= 断定回避)
  - 補正 6: actual code audit 反映 (AnchorResolution / BaselineCoords / 日付 field / recurring 扱い)
  - 補正 7: docs-only 起票まで
- 自立推論で追加 (= 世界トップ超越):
  - **三層 invariant → 四層** (Data / Decision / Display / Spatial fallback layer) で Phase 2-G を新 layer として位置付け
  - **edge 16**: dispersion 境界判定 (`>=` strict) の設計判断
  - **recurring anchor を 1 sample 扱い** (= occurrence overweight 回避)
  - **deterministic now injection** (= test 安定性)
  - **Haversine 既存実装の再利用** (= Phase 2-D Places Search で既存)
  - **silent fallback policy** (= UX 整合、user に gate fail を露骨に伝えない)
  - **将来拡張 8 項目** (= Aneurasync 思想統合 / time-of-day / rigidity 重み付け 等)

---

**End of Phase 2-G Mini Design v1**. CEO 採択判断 → docs only commit → 実装 GO/NO-GO 判断をお待ちします。

Aneurasync 設計思想への寄与:
Phase 2-G は「ユーザーの生活実感地理」 を信頼できる時だけ地図に反映する仕組み。
「最近の場所を平均する機能」 ではなく「**ユーザーの生活圏を、信頼できる時だけ地図 fallback に使う機能**」 として、強制せず、誤判定せず、**silently graceful** に degrade する設計。

Phase 2-D (Place picker) → 2-E (時刻重なり気付き) → 2-F (Place Identity Contract) → 2-G (Lived Geography Confidence Fallback) で、Plan 全体の「観測の入口」 体験が完成。
