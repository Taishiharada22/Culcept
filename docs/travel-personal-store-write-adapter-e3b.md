# TravelPersonalStore Supabase write adapter（Phase E-3B）

**作成日**: 2026-06-22
**ステータス**: ✅ saved / userNotes write 実装・local 検証済 / 旅程追加=API gap / **要 CEO 判断: saves RLS/FK 知見**
**安全**: local Supabase のみ・opt-in IT・flag OFF（default は localStorage）・remote 非接触・push なし。

---

## 1. 実装ファイル
- `repository/personalStoreWrite.ts`（pure）: `diffSaveIds` / `buildSaveRow` / `buildUserNoteInsertRow`
- `repository/supabaseTravelPersonalStore.ts`: saved/userNotes 実装 + 旅程追加=NotImplemented(API gap)
- tests: `personalStoreWrite.test.ts`(pure) / `personalStoreDb.it.test.ts`(opt-in IT)

## 2. TravelPersonalStore API 確認
| メソッド | DB write 可否 |
|---|---|
| readSavedIds / writeSavedIds | ✅ location_note_saves（reconcile） |
| readUserNotes / writeUserNotes | ✅ location_notes（self/self_memo/private） |
| readAddedEntries / writeAddedEntries | 🔴 **API gap**（day_id 不在）→ NotImplemented |

## 3. save / unsave 仕様
- `readSavedIds`: location_note_saves を owner-scoped select（RLS）。
- `writeSavedIds(ids)`: `diffSaveIds(existing, ids)` で reconcile。
  - 追加: `upsert(onConflict: user_id,location_note_id, ignoreDuplicates)`＝duplicate 安全・idempotent。
  - 削除: `delete().in(location_note_id, toRemove)`（RLS owner-only＝自分の save 行のみ）。
- 検証(IT): save→read 一致 / duplicate で件数不変 / unsave / 全 unsave。

## 4. user note 仕様
- `buildUserNoteInsertRow`: **contributor_type='self' / source_type='self_memo' / status='private' / moderation_status='none' / photo_id=null**（published 作らない・self_memo published 不可維持・写真アップロードなし）。client `user-<ts>` は PK にしない（DB 採番）。
- `writeUserNotes(notes)`: bulk-replace。**no-loss 優先順**＝ insert(new uuids) → 旧 self/self_memo/private 行 delete。
  - insert 失敗時は旧行無傷。delete 失敗時は重複のみ（次回 write で収束）。
  - ⚠ **非原子性は既知制約**（client から多文トランザクション不可）。production は server RPC/transaction 推奨。flag OFF・localStorage ミラー下で許容。
- `readUserNotes`: 自分の note のみ（user_id=auth.uid・deleted 除外）→ mapLocationNoteRow。
- 検証(IT): insert(private/self_memo/self/photo null を行で確認)・bulk-replace で旧削除・往復一致。

## 5. 旅程追加 write 可否 — ❌ 不可（API gap）
`travel_itinerary_items` / `location_note_to_itinerary` は **day_id 必須**。一方
`TravelPersonalStore.writeAddedEntries(StoredAddedEntry[])` / `StoredAddedEntry={sourceId, item:ScheduleItem}` /
`ScheduleItem` に **day_id が無い**。捏造 day_id・fixture day_id 流用は禁止のため実装せず NotImplemented。

## 6. API gap 詳細（次フェーズ設計へ）
1. **旅程追加 day_id 不在**: 「旅程に追加」がどの travel_days に紐づくかの文脈（day_id / trip_id / source_location_note_id）が
   public API に無い。public hook（useTravelItinerary 等）signature を壊さず解決するには:
   - ItineraryContext に「対象 day」文脈を導入（CalendarTab の選択日 or Travel overlay の day）し、
     write 時に day_id を渡す API へ拡張、が必要。E-3B では着手せず設計課題として記録。
2. **userNotes id round-trip**: client `user-<ts>` 非 uuid・bulk-replace のため insert→delete 置換で対応したが、
   incremental add/remove API（id 返却）に再設計すれば書込量を削減できる。

## 7. RLS 検証結果 / ★FK 知見（要 CEO 判断）
- ✅ userB は userA の **saves を read 不可**（owner-only select → 0）。
- ✅ userB は userA の **private user note を read 不可**（owner-only / E-3A read と整合）。
- ✅ self_memo + published は check 制約で insert 不可（既存 RLS test と整合）。
- ★ **probe 知見**: userB が **userA の private note id を参照する save 行を insert できた**（`error: null`）。
  - 原因: `location_note_saves` の INSERT policy は `WITH CHECK (auth.uid()=user_id)` のみ。
    FK(`location_note_id → location_notes`)の存在チェックは **RLS をバイパス**するため、可視でない note へも save 行を作れる。
  - 影響度: **content leak は無い**（userB は当該 note 本文を read 不可＝RLS-negative 済）。実害は
    「未閲覧 id への phantom save」＋「uuid の存在 oracle（uuid 推測は非現実的）」に限定＝低。
  - **推奨対策（別 GO・local migration）**: `location_note_saves` INSERT policy に可視性 EXISTS 条件を追加:
    `WITH CHECK (auth.uid()=user_id AND EXISTS(SELECT 1 FROM location_notes ln WHERE ln.id=location_note_id
     AND (ln.user_id=auth.uid() OR (ln.status='published' AND ln.moderation_status='approved' AND ln.deleted_at IS NULL))))`
  - 本 E-3B では **policy 変更（migration）は実施せず**、知見を報告（停止条件に従い CEO 判断を仰ぐ）。
    flag OFF・dormant のため production 影響なし。

## 8. fixture fallback / flag default OFF
- `flags.ts` 未変更（default OFF）・`repository/index.ts` factory 未変更 → `getTravelPersonalStore()` は flag OFF で
  `LocalStorageTravelPersonalStore` を返す。Supabase write adapter は **default では使われない**。

## 9. 検証サマリ
- tsc 55=baseline・新規0 / calendar+travel **398 PASS** / pure 15 PASS / IT **4 PASS**（saved/userNotes/RLS negative/probe）
- DB write は **local のみ**（IT seed・認証ユーザー・RLS owner）。remote 非接触・project-ref unlinked・stack stop 済。

## 10. やっていないこと（別 GO）
旅程追加 write / 写真アップロード / public published / moderation / API route full CRUD /
saves policy hardening migration / flag 点火 / CalendarTab 本切替 / Travel UI 変更 / staging・production apply / push。
