// app/(culcept)/calendar/_lib/travel/repository/localStorageTravelPersonalStore.ts
// Phase E-1: TravelPersonalStore の localStorage 実装（既定）。
// 既存 travelLocalStore の各関数を Promise でラップするだけ（SSR 安全・fail-soft・写真正規化はそのまま）。

import type { LocationItem } from "../types";
import {
  readAddedEntries,
  writeAddedEntries,
  readSavedIds,
  writeSavedIds,
  readUserNotes,
  writeUserNotes,
  type StoredAddedEntry,
} from "../travelLocalStore";
import type { TravelPersonalStore } from "./travelPersonalStore";

export class LocalStorageTravelPersonalStore implements TravelPersonalStore {
  async readAddedEntries(): Promise<StoredAddedEntry[]> {
    return readAddedEntries();
  }
  async writeAddedEntries(entries: StoredAddedEntry[]): Promise<void> {
    writeAddedEntries(entries);
  }
  async readSavedIds(): Promise<string[]> {
    return readSavedIds();
  }
  async writeSavedIds(ids: string[]): Promise<void> {
    writeSavedIds(ids);
  }
  async readUserNotes(): Promise<LocationItem[]> {
    return readUserNotes();
  }
  async writeUserNotes(notes: LocationItem[]): Promise<void> {
    writeUserNotes(notes);
  }
}
