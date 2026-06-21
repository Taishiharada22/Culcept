// app/(culcept)/calendar/_lib/travel/repository/supabaseLocationNotesRepository.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-1: LocationNotesRepository の Supabase 実装 — **skeleton（未実装）**。
//
// ⚠ 実際の Supabase client 呼び出しは行わない（remote 非接触）。getLocationNotes は throw。
//
// 実装時（E-2+）の対応（Phase D テーブル）:
//   location_notes（公開 select policy: status='published' ∧ moderation_status='approved' ∧ deleted_at IS NULL）
//     + 自分の note（auth.uid()=user_id・全 status）を union し、prefecture で絞り込み。
//   都道府県候補 / テーマ等の「不変メタ」は、当面 fixture 由来のままにするか、別メタ table を検討。
//   ★ 公開（published）の実運用は Phase G まで凍結 → 当面は実質「自分の note のみ」。
// ════════════════════════════════════════════════════════════════════════

import type { LocationNotesData } from "../types";
import type { LocationNotesRepository } from "./locationNotesRepository";
import { TravelRepositoryNotImplementedError } from "./travelRepository";

export class SupabaseLocationNotesRepository implements LocationNotesRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getLocationNotes(_prefecture: string): Promise<LocationNotesData> {
    throw new TravelRepositoryNotImplementedError("getLocationNotes");
  }
}
