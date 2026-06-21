// app/(culcept)/calendar/_lib/travel/repository/supabaseTravelPersonalStore.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-1: TravelPersonalStore の Supabase 実装 — **skeleton（未実装）**。
//
// ⚠ Supabase client 呼び出しなし（remote 非接触）。全メソッド throw。
//
// 実装時（E-2+）の owner-scoped 対応（Phase D テーブル・RLS owner-only）:
//   readAddedEntries / writeAddedEntries → travel_itinerary_items（source_kind='user_added'・user_id=auth.uid()）
//   readSavedIds / writeSavedIds         → location_note_saves（unique(user_id, location_note_id)・トグル＝insert/delete）
//   readUserNotes / writeUserNotes       → location_notes（自分の note・owner-only insert/update/delete）
// ════════════════════════════════════════════════════════════════════════

import type { LocationItem } from "../types";
import type { StoredAddedEntry } from "../travelLocalStore";
import type { TravelPersonalStore } from "./travelPersonalStore";
import { TravelRepositoryNotImplementedError } from "./travelRepository";

export class SupabaseTravelPersonalStore implements TravelPersonalStore {
  async readAddedEntries(): Promise<StoredAddedEntry[]> {
    throw new TravelRepositoryNotImplementedError("readAddedEntries");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async writeAddedEntries(_entries: StoredAddedEntry[]): Promise<void> {
    throw new TravelRepositoryNotImplementedError("writeAddedEntries");
  }
  async readSavedIds(): Promise<string[]> {
    throw new TravelRepositoryNotImplementedError("readSavedIds");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async writeSavedIds(_ids: string[]): Promise<void> {
    throw new TravelRepositoryNotImplementedError("writeSavedIds");
  }
  async readUserNotes(): Promise<LocationItem[]> {
    throw new TravelRepositoryNotImplementedError("readUserNotes");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async writeUserNotes(_notes: LocationItem[]): Promise<void> {
    throw new TravelRepositoryNotImplementedError("writeUserNotes");
  }
}
