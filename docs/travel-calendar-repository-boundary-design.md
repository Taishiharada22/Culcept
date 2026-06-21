# Travel / Calendar — Repository (DataSource) 境界 設計（Phase E-0）

**作成日**: 2026-06-22
**ステータス**: ✅ skeleton 実装済（fixture 経由・挙動不変）/ Supabase 実装は別 GO
**性質**: 設計 + repository skeleton。fixture を返す境界を導入し、将来 Supabase へ差し替え可能にする。

---

## 0. 目的とスコープ

Phase D で Travel/Location Notes の Supabase schema（`travel_*` / `location_notes` テーブル）を
local に dry-run 済み（`docs/travel-location-notes-local-db-dry-run.md`）。

Phase E-0 は **「Calendar が fixture を直接読む」状態をやめ、Repository（DataSource）境界を挟む**こと。

- ❌ やらないこと: `CalendarTab.tsx` を**いきなり実 DB に差し替える**。
- ✅ やること: fixture を **Repository 経由で返す**境界を作る。consumer は interface だけに依存。
  将来 Supabase 実装に差し替えても consumer のコードが変わらない構造にする。

> 原則: Supabase 実装の有効化・実装本体・staging 検証は **すべて別 GO**（本 E-0 には含まない）。

---

## 1. 境界の形

```
                ┌─────────────────────────────────────────────┐
  CalendarTab ──┤ getTravelRepository(): TravelRepository      │
  (consumer)    │   ├─ flag OFF（既定）→ FixtureTravelRepository │──→ getSampleTripDay (fixture)
                │   └─ flag ON         → SupabaseTravelRepository│──→ travel_* tables (RLS) ※E-1+ 未実装
                └─────────────────────────────────────────────┘
```

### interface（`repository/travelRepository.ts`）

```ts
export interface TripDayResult { trip: Trip; day: TripDay; }

export interface TravelRepository {
  getTripDay(date: string): Promise<TripDayResult | null>;
}
```

設計上の確定事項:

- **async（Promise）で固定**。Supabase 実装は必ず非同期になるため、fixture 実装も `Promise` を返して
  signature を揃える。これにより Supabase 移行時に **consumer の型が変わらない**（再 wiring 不要）。
- **owner スコープは実装の責務**。`userId` を引数に取らない。Supabase 実装は auth セッション + RLS で
  呼び出しユーザーのデータのみ返す（service_role 不使用・捏造防止・RLS 一元化）。
- **該当なしは `null`**（例外にしない）。「旅行日でない通常日」「期間外」を自然に表現。

---

## 2. 実装クラス

| クラス | ファイル | 役割 | E-0 状態 |
|--------|----------|------|----------|
| `FixtureTravelRepository` | `repository/fixtureTravelRepository.ts` | 旧 CalendarTab の `getSampleTripDay` + 期間判定を移設。`Promise.resolve` で返す | ✅ 実装済・既定 |
| `SupabaseTravelRepository` | `repository/supabaseTravelRepository.ts` | 将来 `travel_*` を owner-scoped query で組み立て | 🚧 skeleton（`getTripDay` は `NOT_IMPLEMENTED` を throw・Supabase client 呼び出しなし） |
| `getTravelRepository()` | `repository/index.ts` | flag で実装選択（既定 fixture） | ✅ 実装済 |

### flag（`flags.ts`）

```ts
isTravelSupabaseRepoEnabled(): boolean  // NEXT_PUBLIC_PLAN_TRAVEL_SUPABASE_REPO_ENABLED === "true"
```
- 既定 **OFF** → `FixtureTravelRepository` → 既存挙動完全不変。
- ON → `SupabaseTravelRepository`（E-0 では throw する skeleton。点火は別 GO）。

---

## 3. CalendarTab の変更（最小・挙動不変）

**Before**（fixture 直 import + 同期 useMemo）:
```ts
import { getSampleTripDay, SAMPLE_KYOTO_TRIP } from ".../sampleTrip";
const travelTripDay = useMemo(() => {
  if (!isTravelDayDetailEnabled()) return null;
  if (selectedDate < SAMPLE_KYOTO_TRIP.startDate || selectedDate > SAMPLE_KYOTO_TRIP.endDate) return null;
  return getSampleTripDay(selectedDate);
}, [selectedDate]);
```

**After**（repository 経由 + async load）:
```ts
import { getTravelRepository, type TripDayResult } from ".../repository";
const [travelTripDay, setTravelTripDay] = useState<TripDayResult | null>(null);
useEffect(() => {
  if (!isTravelDayDetailEnabled()) { setTravelTripDay(null); return; }
  let cancelled = false;
  void getTravelRepository().getTripDay(selectedDate)
    .then((r) => { if (!cancelled) setTravelTripDay(r); })
    .catch(() => { if (!cancelled) setTravelTripDay(null); });
  return () => { cancelled = true; };
}, [selectedDate]);
```

挙動の同一性:
- flag OFF（**本番既定**）: 常に `null` → 「旅の詳細を見る」ボタン非表示 → CalendarTab 完全不変。
- flag ON + 旅行日（6/24-26）: fixture が同じ TripDay を返す（`Promise.resolve` で next tick 解決）。
- flag ON + 期間外の通常日: repository が `null` を返す（旧 useMemo の期間判定を移設済）。
- 期間判定は `FixtureTravelRepository` 内へ移動。`isTravelDayDetailEnabled()`（UI entry flag）は
  consumer 側に残す（データ取得の関心と UI 表示の関心を分離）。
- stale 応答は `cancelled` guard で破棄。

> 唯一の差: flag ON 時に first render で一瞬 `null`→次 tick で populate（fixture は即解決）。
> 本番は flag OFF のため**ユーザー影響なし**。これが「同期 fixture → async 境界」への転換点。

---

## 4. 将来 Supabase 実装の対応表（E-1+ の指針）

`SupabaseTravelRepository.getTripDay(date)` の組み立て（Phase D テーブル → `TripDay`）:

| 取得元（RLS owner-only） | → TripDay フィールド |
|---|---|
| `travel_days(user_id=auth.uid(), date)` | date / theme / weather / walking / heroPhoto(FK) |
| `travel_trips(id)` | 親 Trip（title/destination/期間/partySize） |
| `travel_itinerary_items(day_id)` | `schedule`（sort_order 順・user_added 含む） |
| `travel_reservations(trip_id, day_id)` | `reservations` + `reservationStats`（集計） |
| `travel_photos(id)` | `heroPhoto` / 各 item.photo |
| `travel_movement_legs(day_id)` | `move.legs`（sort_order 順） |
| `travel_memories(trip_id, day_id)` | `memories` |

- 同一日に複数 trip（C-1）→ **primary-day 選択**: `status='active'` → `start_date` → `created_at`。
- すべて anon + RLS 前提。service_role 不使用。

---

## 5. 本 E-0 で**やっていないこと**（将来フェーズ）

- **ItineraryContext / travelLocalStore の repository 化**: 「旅程に追加」「保存」「下書き」は今も localStorage。
  E-1+ で `ItineraryRepository`（localStorage 実装 → Supabase `travel_itinerary_items` / `location_note_saves`）に抽象化予定。
- **LocationNotesScreen の repository 化**: 現状 `getLocationNotes("京都府")` を直接呼ぶ。
  E-1+ で `LocationNotesRepository`（fixture → `location_notes` 公開 select）に抽象化予定。
- **Supabase 実装本体**: `SupabaseTravelRepository` は throw する skeleton のまま。
- **flag 点火 / API route / server fetch 配線 / staging・production apply**: すべて別 GO。

---

## 6. 検証

- `npx tsc --noEmit`（`--max-old-space-size=8192`）: 総エラー **55 = 既存 baseline と同数**。
  **touched files（CalendarTab / repository / flags）に新規エラー 0**。
- `vitest run tests/unit/calendar`: **340 tests / 17 files PASS**（退化なし）。
- 本番影響: flag 既定 OFF のためゼロ。remote 非接触（Supabase client 呼び出しなし）。

---

## 7. ファイル一覧（E-0）

新規:
- `app/(culcept)/calendar/_lib/travel/repository/travelRepository.ts`（interface + result 型 + NotImplemented error）
- `app/(culcept)/calendar/_lib/travel/repository/fixtureTravelRepository.ts`（既定実装）
- `app/(culcept)/calendar/_lib/travel/repository/supabaseTravelRepository.ts`（skeleton）
- `app/(culcept)/calendar/_lib/travel/repository/index.ts`（factory）
- `docs/travel-calendar-repository-boundary-design.md`（本書）

変更:
- `app/(culcept)/calendar/_lib/travel/flags.ts`（`isTravelSupabaseRepoEnabled` 追加）
- `app/(culcept)/plan/tabs/CalendarTab.tsx`（fixture 直 import → repository 経由 async load）
