# Supabase Repo flag ON — local dogfood readiness / no-remote wiring audit（Phase E-4A）

**作成日**: 2026-06-22
**ステータス**: ✅ flag ON で Supabase repo が UI 経路から選ばれる配線・fail-soft を audit / **staging・production・Calendar 本切替・API route・flag 既定 ON には進まない**
**安全**: audit + test + docs。flags.ts 既定 OFF 不変・remote 非接触・local stack 起動なし（fake client で fail-soft 検証）。

---

## 1. audit した経路
- factory: `getTravelRepository` / `getLocationNotesRepository` / `getTravelPersonalStore`（`repository/index.ts`）
- flag: `isTravelSupabaseRepoEnabled`（`flags.ts`・`NEXT_PUBLIC_PLAN_TRAVEL_SUPABASE_REPO_ENABLED`）
- UI: CalendarTab / TravelDayDetail / LocationNotesScreen / ItineraryContext

## 2. flag ON/OFF factory 確認（test: travelRepoReadinessE4a.test.ts）
- **OFF（既定）**: getTravelRepository→`FixtureTravelRepository` / getLocationNotesRepository→`FixtureLocationNotesRepository` / getTravelPersonalStore→`LocalStorageTravelPersonalStore`。
- **ON**（`vi.stubEnv(FLAG,"true")`）: それぞれ `SupabaseTravelRepository` / `SupabaseLocationNotesRepository` / `SupabaseTravelPersonalStore`。
- `"true"` 以外（例 `"1"`）は OFF 扱い。**flags.ts の default は未変更（OFF）**。

## 3. UI wiring 確認（source contract test）
| 経路 | 確認 |
|---|---|
| CalendarTab → `getTravelRepository().getTripDay` | ✅ `getSampleTripDay(` 直呼びなし |
| TravelDayDetail → Provider に `currentTripId/currentDayId/currentDate` 注入 | ✅ |
| LocationNotesScreen → `getLocationNotesRepository()` + `getTravelPersonalStore()` | ✅ |
| ItineraryContext → `getTravelPersonalStore()` read/write + `buildAddedEntry(item, context)` | ✅ |
| `addToItinerary(item)`（signature 不変）→ context 付き entry → `writeAddedEntries` | ✅（E-3C-1/3） |
| `readAddedEntries`=`[]`（getTripDay が source・二重表示回避） | ✅ |

→ flag ON で、UI は何も変えずに Supabase 経路に切り替わる（consumer は factory にのみ依存）。

## 4. fail-soft 確認（fake client・remote 不触）
- LocationNotes 0件 → `EMPTY_LOCATION_NOTES_DATA` / error → EMPTY。
- getTripDay 0件 → `null` / 未認証 → `null`。
- readSavedIds 未認証/0件 → `[]`（throw しない）/ readAddedEntries → 常に `[]`。
- writeAddedEntries 未認証 → no-op（from を呼ばない）。
- writeAddedEntries context 不足 / 非 uuid sourceId → skip（from を呼ばない＝捏造保存しない）。

## 5. 追加した tests
- `tests/unit/plan/travelRepoReadinessE4a.test.ts`（14）: factory flag ON/OFF・wiring source contract・fail-soft（fake client）。

## 6. integration 結果
本フェーズは fake client の unit で完結（local stack 起動なし）。実 DB 挙動は既存 opt-in IT（`personalStoreDb` / `locationNotesRepositoryDb` / `travelGetTripDayDb`・**計 10 PASS**・E-3C-3 時点）が担保。

## 7. regression 結果
travel+calendar **411 PASS**（E-3C-3 と同値・本フェーズは test/docs 追加のみで挙動不変）。

## 8. tsc 結果
**55 = baseline 維持**・新規ファイル エラー0。

## 9. docs
本書（`docs/travel-supabase-repo-readiness-e4a.md`）。

## 10. 未確認事項（local dogfood ready でないもの）
- **認証済みブラウザ live smoke**: `/plan` が auth gate（.env.local=staging）でログイン不可・jsdom 未導入のため、flag ON での実ブラウザ目視は未実施。
- **staging DB / production DB**: 一切未適用（migration 5本は local のみ）。
- **flag ON 時の getTripDay と readAddedEntries の二重表示**: ロジック上 `readAddedEntries=[]` で回避設計だが、live UI（実 getTripDay + 楽観追加 + 再取得）の遷移は未目視。
- **API route / server fetch**: 未実装（client repository のみ）。
- meal/budget は依然 undefined（honest optional・E-2 方針）。

## 11. remote 不触確認
`project-ref` unlinked・`supabase db push`/remote SQL/staging/production：なし。fail-soft は fake client（ネットワークなし）。

## 12. local stack 停止確認
本フェーズは local Supabase を起動していない（fake client のみ）。前フェーズで stop 済。

## 13. 結論：local dogfood readiness
- ✅ flag ON で UI 経路が Supabase repo を選ぶ配線は成立（factory + wiring + fail-soft 検証済）。
- ✅ flag OFF 既定で従来 fixture/localStorage 体験は完全不変。
- ⏳ 実ブラウザ live dogfood は auth gate のため未実施（要 認証済みローカル or staging・別 GO）。

## 14. 次フェーズ候補（すべて別 GO）
API route（owner-scoped）/ server fetch / 認証済みローカルでの flag ON live smoke / staging apply（CLI staging re-link + backup + 二重確認・migration 5本順次）/ flag 既定 ON 判断。
