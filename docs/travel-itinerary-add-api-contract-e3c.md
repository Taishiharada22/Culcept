# Itinerary Add API Contract 設計（Phase E-3C・design-only）

**作成日**: 2026-06-22
**ステータス**: 📐 設計のみ（実装・migration・DB write なし）
**前提**: E-3B で「旅程追加 write は day_id 不在の API gap」として NotImplemented 停止（判断は正）。本書はその解消設計。
**安全**: read-only 調査 + docs のみ。コード変更・migration・SQL・db reset・DB write・remote 接触：**なし**。

---

## 1. 現在の API gap（確定）

「旅程に追加」呼び出しは **LocationItem しか持たない**：
- `addToItinerary(item: LocationItem): boolean`（`ItineraryContext.tsx:20`）。consumer（8 views / LocationDetailSheet）も `(item)` のみ渡す。
- 永続形 `StoredAddedEntry = { sourceId: string; item: ScheduleItem }`（`travelLocalStore.ts:66`）。`ScheduleItem` に day 文脈なし。`itineraryConvert.ts` は `id=added-${item.id}` / `startTime=""` のみ。
- `TravelDayDetail` は `trip`/`day` を持つ（`TravelDayDetail.tsx:24`）が、`LocationNotesScreen` には **`onClose`/`onToast` しか渡さない**（`:90`）。→ 追加呼び出し地点に day 文脈が届いていない。
- 🔴 **`TripDay` に `id` フィールドが無い**（`types.ts:237`・fixture/assembler とも未保持）。`Trip` は `id` あり。`travel_days.id` は DB に存在するが TripDay へ未surface。
- DB 必須列: `travel_itinerary_items.day_id NOT NULL`・`sort_order NOT NULL`・`name NOT NULL`・`source_kind`／`location_note_to_itinerary.day_id`・`location_note_id NOT NULL`。
- 重複ガード: `uq_travel_itinerary_items_day_note (day_id, source_location_note_id) WHERE source_location_note_id IS NOT NULL`／`location_note_to_itinerary_unique (user_id, location_note_id, day_id)`。
- `SupabaseTravelPersonalStore.{read,write}AddedEntries` は `NotImplementedError("API gap: day_id 不在")`。

---

## 2. 旅程追加に必要な文脈

| 項目 | 取得元 | 必須経路 |
|---|---|---|
| `user_id` | auth セッション（RLS WITH CHECK） | Supabase のみ |
| `day_id` | **現在表示中の day**（TravelDayDetail.day）の DB id | Supabase のみ |
| `date` | `TripDay.date`（既存） | day_id 解決の代替キー |
| `trip_id` | `Trip.id`（既存） | day_id 解決の補助 |
| `source_location_note_id` | 追加元 `LocationItem.id`（DB note の uuid） | Supabase のみ |
| location item 内容 | `LocationItem`（既存） | 全経路 |
| `sort_order` | 当該 day の既存 max+1 | Supabase（fixture は配列末尾） |
| `start_time` | 未設定（""→ null） | 全経路（後から編集前提） |

**semantics（要確定・本設計の推奨）**: 追加先 day は「**現在閲覧中の day**」（TravelDayDetail が開いている day）とする。
- 現状 `useMergedSchedule(day)` は addedItems を **全 day にマージ**（fixture 簡略化）。DB 化では day 紐付けが正となるため、
  「追加した day にのみ表示」へ収束させる（E-3C-2/3 で整合）。将来 day-picker 追加は別途。

---

## 3. 設計案比較

### Option A — Provider に currentTrip/currentDay context を持たせる（**推奨**）
`TravelItineraryProvider`（`TravelDayDetail.tsx:105` で生成・trip/day を保有）に `currentTrip`/`currentDay` を渡し、
`addToItinerary(item)` が内部で文脈を参照して `StoredAddedEntry` に day 情報を載せる。
- **pros**: public hook signature **不変**（`addToItinerary(item)` のまま＝8 views・LocationDetailSheet 改修ゼロ）。文脈注入点が Provider 境界の1箇所。Provider は既に trip/day を持つ環境に居る。
- **cons**: day 不明な文脈で Provider を使うと day_id 無し（fixture は OK・Supabase write のみ skip）。TripDay に day 識別子が要る（§6）。

### Option B — `addToItinerary(item, context)` と引数化
- **pros**: 明示的。
- **cons**: 🔴 **public hook signature を破壊**（禁止）。8 views + LocationDetailSheet + viewTypes に ripple。**不採用**。

### Option C — TravelPersonalStore に selectedDayContext を注入
- **pros**: store が day_id を知る。
- **cons**: store は `getTravelPersonalStore()` で都度生成の stateless。可変文脈の注入は React(Provider) と二重管理になり整合が崩れる。文脈の住所が不自然。**非推奨**。

**推奨: Option A**（signature 不変・注入点 1 箇所・既存構造に最も自然）。

---

## 4. fixture / localStorage / Supabase 3 経路の整合

`StoredAddedEntry` を後方互換に拡張（**optional 追加のみ**）:
```
StoredAddedEntry = {
  sourceId: string;
  item: ScheduleItem;
  dayId?: string;        // DB write 用（fixture/旧データは undefined）
  tripId?: string;       // day_id 解決補助
  sourceDate?: string;   // date による day 解決の代替
}
```
- **fixture**: day に DB id 無し → `dayId` undefined。in-session 追加は従来どおり（挙動不変）。
- **localStorage**: 旧エントリは `dayId` 無しでも読める（fail-soft・既存体験を壊さない）。新規は文脈があれば付与。
- **Supabase**: `dayId`（＝`travel_days.id`）と `sourceLocationNoteId`（＝DB note uuid）が**両方ある時のみ** write。
  どちらか欠落（fixture note / fixture day）→ write を skip（または明示 no-op）。捏造 day_id・fixture 流用は **禁止**。
- 切替は既存 `isTravelSupabaseRepoEnabled()`（default OFF）。flag OFF では localStorage のまま＝完全不変。

---

## 5. DB write 仕様案（Supabase・実装は E-3C-3）

owner-scoped・RLS・service_role 不使用。1 回の「追加」で 2 行:
1. `travel_itinerary_items` insert:
   `{ user_id=auth.uid(), day_id, name=item.title, subtitle=item.areaLabel, description, address, categories, photo_id=null(写真uploadなし), coords?, sort_order=(当該 day max+1), source_kind='user_added', source_location_note_id=item.id, start_time=null }`
   → returning `id`。
2. `location_note_to_itinerary` insert:
   `{ user_id=auth.uid(), location_note_id=item.id, itinerary_item_id=(1 の id), day_id }`。
- **duplicate guard**: `uq_travel_itinerary_items_day_note` / `location_note_to_itinerary_unique` に依拠。
  upsert(ignoreDuplicates) もしくは unique_violation を捕捉して「既追加」= false を返す（`addToItinerary` の bool 契約と一致）。
- **optimistic update / rollback**: React state を即時追加（楽観）→ write→ 失敗時は当該 entry を除去 + toast。
  `addToItinerary` は現状 sync(bool)。E-3C-3 で「楽観追加は sync、永続は fire-and-forget + 失敗時 rollback」とし、bool 契約は楽観成功で維持。
- **RLS / FK 注意**: `location_note_to_itinerary` の INSERT policy は owner-only（user_id）。saves と同じ **FK が RLS をバイパス**する論点あり
  → 可視でない他人の note を attach できる懸念。**E-3B-1 と同型の可視性 EXISTS hardening を write 実装時に併せて行う**（§6）。

---

## 6. migration 必要性

- **write 自体は migration 不要**: `travel_itinerary_items` / `location_note_to_itinerary` は Phase D で day_id・source_location_note_id・unique 完備。
- **TripDay.id**: これは **TS 型の追加（optional `id?: string`）であって DB migration ではない**。E-2 assembler が `travel_days.id` を surface するだけ。fixture は undefined のまま。
- **推奨 hardening migration（理由のみ・本フェーズ実装しない）**: `location_note_to_itinerary` INSERT policy を E-3B-1 同様
  「可視な location_notes のみ attach 可」へ EXISTS 強化。理由＝saves と同じ FK/RLS バイパスで他人の非公開 note を attach されうるため。
  実装は write 実装フェーズ（E-3C-3）の前段で別 commit・local 検証。

---

## 7. 最小実装スコープ（段階）

- **E-3C-1（type/context only）**: `TripDay.id?` 追加 / `StoredAddedEntry` に optional day 文脈 / `TravelItineraryProvider` に currentTrip・currentDay props + 内部 context / `TravelDayDetail`→Provider に trip・day 注入 / `LocationNotesScreen` は `addToItinerary(item)` のまま（signature 不変）。DB なし。tsc + 既存 test 維持。
- **E-3C-2（localStorage compatibility）**: 拡張 `StoredAddedEntry` の read/write 後方互換（旧 dayId 無しも可）。fixture/flag OFF 挙動不変を test。
- **E-3C-3（Supabase write local integration）**: `SupabaseTravelPersonalStore.{read,write}AddedEntries` 実装（§5）。
  併せて §6 の note_to_itinerary policy hardening migration（local）。opt-in local IT（userA/userB RLS・duplicate・他人非公開 attach 不可）。flag OFF default 維持。

各段階で禁止事項（staging/production apply・db push・flag default ON・Calendar 本切替・Travel UI 見た目変更・push）は不変。

---

## 8. 報告サマリ（E-3C 設計）

- **API gap**: addToItinerary が day 文脈を持たず DB（day_id 必須）へ書けない（§1 確定）。
- **必要 context**: day_id / date / trip_id / source_location_note_id / item / sort_order（§2）。
- **推奨**: Option A（Provider に currentTrip/currentDay・signature 不変）。
- **3 経路整合**: StoredAddedEntry を optional 拡張・fixture/localStorage は dayId 無しで不変・Supabase は dayId+noteId 揃う時のみ write（§4）。
- **DB write 仕様**: items + note_to_itinerary の 2 insert・unique で duplicate・楽観/rollback・RLS owner（§5）。
- **migration**: write は不要。TripDay.id は型追加。note_to_itinerary policy hardening のみ推奨（理由提示・実装は write フェーズ）（§6）。
- **次の最小 scope**: E-3C-1 → E-3C-2 → E-3C-3（§7）。
