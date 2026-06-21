// app/(culcept)/calendar/_lib/travel/repository/fixtureLocationNotesRepository.ts
// Phase E-1: LocationNotesRepository の fixture 実装（既定）。
// 従来 LocationNotesScreen が直接呼んでいた getLocationNotes を Promise でラップするだけ（挙動不変）。

import { getLocationNotes } from "../locationNotesData";
import type { LocationNotesData } from "../types";
import type { LocationNotesRepository } from "./locationNotesRepository";

export class FixtureLocationNotesRepository implements LocationNotesRepository {
  async getLocationNotes(prefecture: string): Promise<LocationNotesData> {
    return getLocationNotes(prefecture);
  }
}
