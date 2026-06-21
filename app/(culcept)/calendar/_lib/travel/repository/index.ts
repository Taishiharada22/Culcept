// app/(culcept)/calendar/_lib/travel/repository/index.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-0 / E-1: Travel 系 Repository の選択 factory。
//
// flag（isTravelSupabaseRepoEnabled）で実装を選ぶ。既定（OFF）は fixture / localStorage。
// consumer はこれら factory だけを呼ぶ（実装クラスを直接 import しない）。
// ════════════════════════════════════════════════════════════════════════

import { isTravelSupabaseRepoEnabled } from "../flags";
import { FixtureTravelRepository } from "./fixtureTravelRepository";
import { SupabaseTravelRepository } from "./supabaseTravelRepository";
import type { TravelRepository } from "./travelRepository";
import { FixtureLocationNotesRepository } from "./fixtureLocationNotesRepository";
import { SupabaseLocationNotesRepository } from "./supabaseLocationNotesRepository";
import type { LocationNotesRepository } from "./locationNotesRepository";
import { LocalStorageTravelPersonalStore } from "./localStorageTravelPersonalStore";
import { SupabaseTravelPersonalStore } from "./supabaseTravelPersonalStore";
import type { TravelPersonalStore } from "./travelPersonalStore";

export type { TravelRepository, TripDayResult } from "./travelRepository";
export { TravelRepositoryNotImplementedError } from "./travelRepository";
export type { LocationNotesRepository } from "./locationNotesRepository";
export type { TravelPersonalStore, StoredAddedEntry } from "./travelPersonalStore";

/**
 * 現在の flag に応じた TravelRepository を返す（E-0: 旅行 1 日詳細）。
 * - 既定（flag OFF）: FixtureTravelRepository（fixture を Promise で返す・挙動不変）
 * - flag ON: SupabaseTravelRepository（未実装 skeleton）
 *
 * 実装は stateless のため毎回 new しても安価。flag は env 由来で runtime 不変なので
 * キャッシュ不要（テストでの flag 切替時に stale cache を踏まない利点もある）。
 */
export function getTravelRepository(): TravelRepository {
  return isTravelSupabaseRepoEnabled()
    ? new SupabaseTravelRepository()
    : new FixtureTravelRepository();
}

/**
 * Location Notes 読み取り repository を返す（E-1）。
 * - 既定（flag OFF）: FixtureLocationNotesRepository（fixture を Promise で返す・挙動不変）
 * - flag ON: SupabaseLocationNotesRepository（未実装 skeleton）
 */
export function getLocationNotesRepository(): LocationNotesRepository {
  return isTravelSupabaseRepoEnabled()
    ? new SupabaseLocationNotesRepository()
    : new FixtureLocationNotesRepository();
}

/**
 * 個人 Travel データ（旅程追加 / 保存 / 投稿ノート）の store を返す（E-1）。
 * - 既定（flag OFF）: LocalStorageTravelPersonalStore（localStorage を Promise でラップ・挙動不変）
 * - flag ON: SupabaseTravelPersonalStore（未実装 skeleton）
 */
export function getTravelPersonalStore(): TravelPersonalStore {
  return isTravelSupabaseRepoEnabled()
    ? new SupabaseTravelPersonalStore()
    : new LocalStorageTravelPersonalStore();
}
