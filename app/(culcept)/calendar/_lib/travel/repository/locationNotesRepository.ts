// app/(culcept)/calendar/_lib/travel/repository/locationNotesRepository.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-1: Location Notes 読み取りの境界（DataSource / Repository）。
//
// LocationNotesScreen が fixture（getLocationNotes）を直接 import するのをやめ、
// この interface 経由で取得する。実装差し替えで consumer は不変。
//   - FixtureLocationNotesRepository  … 現状 fixture を Promise で返す（既定・挙動不変）
//   - SupabaseLocationNotesRepository … 将来 location_notes の公開 select（published+approved+未削除）
//                                       + 自分の note を owner-scoped で取得（E-1 では skeleton）
//
// 設計: docs/travel-location-notes-repository-boundary-design.md
// ════════════════════════════════════════════════════════════════════════

import type { LocationNotesData } from "../types";

/**
 * Location Notes の読み取り境界。
 * - async（Promise）で固定（Supabase 実装を見据える）。
 * - getLocationNotes は **fixture/公開メタ**（都道府県候補・テーマ・公開アイテム）を返す。
 *   ユーザー個人の保存(heart)・投稿ノートは別境界（TravelPersonalStore）が扱う。
 */
export interface LocationNotesRepository {
  /** 指定都道府県の Location Notes データ（候補・テーマ・公開アイテム等）を返す。 */
  getLocationNotes(prefecture: string): Promise<LocationNotesData>;
}
