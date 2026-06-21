// app/(culcept)/calendar/_lib/travel/repository/index.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-0: TravelRepository の選択 factory。
//
// flag（isTravelSupabaseRepoEnabled）で実装を選ぶ。既定（OFF）は fixture。
// consumer はこの getTravelRepository() だけを呼ぶ（実装クラスを直接 import しない）。
// ════════════════════════════════════════════════════════════════════════

import { isTravelSupabaseRepoEnabled } from "../flags";
import { FixtureTravelRepository } from "./fixtureTravelRepository";
import { SupabaseTravelRepository } from "./supabaseTravelRepository";
import type { TravelRepository } from "./travelRepository";

export type { TravelRepository, TripDayResult } from "./travelRepository";
export { TravelRepositoryNotImplementedError } from "./travelRepository";

/**
 * 現在の flag に応じた TravelRepository を返す。
 * - 既定（flag OFF）: FixtureTravelRepository（fixture を Promise で返す・挙動不変）
 * - flag ON: SupabaseTravelRepository（E-0 時点では未実装 skeleton）
 *
 * 実装は stateless のため毎回 new しても安価。flag は env 由来で runtime 不変なので
 * キャッシュ不要（テストでの flag 切替時に stale cache を踏まない利点もある）。
 */
export function getTravelRepository(): TravelRepository {
  return isTravelSupabaseRepoEnabled()
    ? new SupabaseTravelRepository()
    : new FixtureTravelRepository();
}
