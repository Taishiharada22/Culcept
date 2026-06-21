// app/(culcept)/calendar/_lib/travel/repository/travelPersonalStore.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-1: ユーザー個人の Travel データ（旅程追加 / 保存heart / 投稿ノート）の
//   読み書き境界。ItineraryContext / LocationNotesScreen が travelLocalStore を
//   直接呼ぶのをやめ、この interface 経由にする。
//
//   - LocalStorageTravelPersonalStore … 現状 localStorage（travelLocalStore）を Promise でラップ（既定・挙動不変）
//   - SupabaseTravelPersonalStore     … 将来 owner-scoped Supabase（E-1 では skeleton）
//       readAddedEntries/write → travel_itinerary_items（user_id=auth.uid()）
//       readSavedIds/write     → location_note_saves
//       readUserNotes/write    → location_notes（自分の note・owner-only write）
//
// すべて owner スコープ＝呼び出しユーザー本人のデータのみ（Supabase 実装は RLS）。
// 設計: docs/travel-location-notes-repository-boundary-design.md
// ════════════════════════════════════════════════════════════════════════

import type { LocationItem } from "../types";
import type { StoredAddedEntry } from "../travelLocalStore";

export type { StoredAddedEntry } from "../travelLocalStore";

/**
 * 個人 Travel データの read/write 境界（async・owner スコープ）。
 * write は fire-and-forget で呼ばれる想定（consumer は await しなくてよい）。
 */
export interface TravelPersonalStore {
  // 旅程追加（「旅程に追加」）
  readAddedEntries(): Promise<StoredAddedEntry[]>;
  writeAddedEntries(entries: StoredAddedEntry[]): Promise<void>;
  // 保存（heart）した location id
  readSavedIds(): Promise<string[]>;
  writeSavedIds(ids: string[]): Promise<void>;
  // ＋投稿ノート
  readUserNotes(): Promise<LocationItem[]>;
  writeUserNotes(notes: LocationItem[]): Promise<void>;
}
