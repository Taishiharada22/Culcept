# Travel / Location Notes — Repository 境界 設計（Phase E-1）

**作成日**: 2026-06-22
**ステータス**: ✅ skeleton 実装済（fixture / localStorage 経由・挙動不変）/ Supabase 実装は別 GO
**前提**: E-0（`docs/travel-calendar-repository-boundary-design.md`）の続き。同じ flag・同じ方針。

---

## 0. 目的

E-0 で CalendarTab を `TravelRepository` 経由にした。E-1 は残る 2 consumer を境界化:

- **LocationNotesScreen**: fixture `getLocationNotes` 直呼び → `LocationNotesRepository` 経由。
- **ItineraryContext + LocationNotesScreen**: localStorage（travelLocalStore）直呼び → `TravelPersonalStore` 経由。

いずれも **fixture / localStorage 既定・flag OFF・Supabase skeleton 止まり・実DB接続なし**。

---

## 1. 追加した境界

### LocationNotesRepository（公開メタ・コンテンツの読み取り）
```ts
interface LocationNotesRepository {
  getLocationNotes(prefecture: string): Promise<LocationNotesData>;
}
```
- `FixtureLocationNotesRepository`（既定）: `getLocationNotes` を Promise でラップ。
- `SupabaseLocationNotesRepository`（skeleton）: throw。将来 `location_notes` 公開 select
  （published+approved+未削除）+ 自分の note を union（★公開は Phase G まで凍結＝当面 自分の note のみ）。

### TravelPersonalStore（個人データの read/write・owner スコープ）
```ts
interface TravelPersonalStore {
  readAddedEntries(): Promise<StoredAddedEntry[]>;  writeAddedEntries(e): Promise<void>;
  readSavedIds():     Promise<string[]>;            writeSavedIds(ids): Promise<void>;
  readUserNotes():    Promise<LocationItem[]>;       writeUserNotes(n): Promise<void>;
}
```
- `LocalStorageTravelPersonalStore`（既定）: travelLocalStore の各関数を Promise でラップ（SSR 安全・fail-soft・写真正規化はそのまま）。
- `SupabaseTravelPersonalStore`（skeleton）: 全メソッド throw。将来の owner-scoped 対応:
  - added → `travel_itinerary_items`（source_kind='user_added'）
  - saved → `location_note_saves`（unique(user_id, location_note_id)・トグル＝insert/delete）
  - userNotes → `location_notes`（自分の note・owner-only write）

### factory（`repository/index.ts`・既存に追加）
```ts
getLocationNotesRepository(): LocationNotesRepository  // flag OFF→Fixture
getTravelPersonalStore():     TravelPersonalStore      // flag OFF→LocalStorage
```
flag は E-0 と同じ `isTravelSupabaseRepoEnabled()`（既定 OFF）。1 つの switch で Travel 系 3 境界を統一。

---

## 2. consumer 変更（挙動不変）

### ItineraryContext
- `readAddedEntries/writeAddedEntries` 直呼び → `getTravelPersonalStore()` 経由。
- 復元 effect: `store.readAddedEntries().then(...)`（cancelled guard・fail-soft）。
- 永続 effect: `void store.writeAddedEntries(added)`（fire-and-forget・skip-first 維持）。
- 公開 hook（`useTravelItinerary` / `useMergedSchedule`）の signature 不変＝消費側ゼロ改修。

### LocationNotesScreen
- top-level の同期 `getLocationNotes("京都府")` を撤去。`prefecture` 初期値は
  `EMPTY_LOCATION_NOTES_DATA.defaultPrefecture`（"京都府"）。
- `baseData` state（初期 `EMPTY_LOCATION_NOTES_DATA`＝都道府県候補は出るが内容空）を
  `getLocationNotesRepository().getLocationNotes(prefecture)` で effect ロード（prefecture 変更で再取得・cancelled guard）。
- 個人データ（保存/投稿ノート）復元・永続を `getTravelPersonalStore()` 経由に。
- `data = useMemo({ ...baseData, items: [...mine, ...baseData.items] })`（マージ位置・並びは従来どおり）。

### locationNotesData.ts
- `EMPTY_LOCATION_NOTES_DATA` を export（getLocationNotes の空分岐の正本 + LocationNotesScreen の初期 state で共用・DRY）。

---

## 3. 挙動の同一性 / 影響

- 既定（flag OFF）: Fixture / LocalStorage 実装は **即解決**。従来と同じ内容・並び・永続。
- 唯一の差: LocationNotesScreen 初期に baseData が空メタ→次 tick で内容 populate（fixture 即解決）。
  本画面は **flag-gated な travel overlay をユーザーが開いた時のみ client mount**＝本番初期表示・SSR に影響なし。
- write は fire-and-forget（consumer は await しない）。失敗は fail-soft（catch で握り）。

---

## 4. 検証

- `tsc --noEmit`: 総 **55 = baseline**、touched/new files に新規エラー **0**。
- `vitest tests/unit/calendar`: **340 PASS**（回帰なし）。
- E-1 smoke:
  - `travelLocationNotesRepository.test.ts`（10 件）: Fixture（京都府=items / 未整備県=空メタ・候補維持）、factory（flag OFF→Fixture/LocalStorage）、LocalStorage（node=SSR 相当で throw せず空・write no-op）、Supabase skeleton 全 throw。
  - `locationNotesScreenSsrContract.test.tsx`: repository 化後も SSR で crash せずヘッダ/都道府県描画。
- localStorage round-trip 本体は既存 `tests/unit/calendar/travelLocalStore.test.ts` が担保（本 E-1 で不変）。
- client effect の live 実行（DOM）は E-0.5 同様 未実施（jsdom 等 未導入・/plan auth wall）。fixture/localStorage は即解決ゆえ
  挙動差は無し、本番 flag OFF で遷移なし。

---

## 5. やっていないこと（別 GO）

Supabase 実装本体 / API route / DB write / migration / staging・production apply / env 編集 / push — 全て未実施。
公開（published）Location Notes の実運用は Phase G。

---

## 6. ファイル（E-1）

新規:
- `repository/locationNotesRepository.ts` / `fixtureLocationNotesRepository.ts` / `supabaseLocationNotesRepository.ts`
- `repository/travelPersonalStore.ts` / `localStorageTravelPersonalStore.ts` / `supabaseTravelPersonalStore.ts`
- `tests/unit/plan/travelLocationNotesRepository.test.ts` / `locationNotesScreenSsrContract.test.tsx`
- `docs/travel-location-notes-repository-boundary-design.md`（本書）

変更:
- `repository/index.ts`（factory 2 本追加・型 re-export）
- `_lib/travel/locationNotesData.ts`（`EMPTY_LOCATION_NOTES_DATA` export）
- `_components/travel/state/ItineraryContext.tsx`（personal store 経由）
- `_components/travel/locationNotes/LocationNotesScreen.tsx`（location notes repo + personal store 経由）
