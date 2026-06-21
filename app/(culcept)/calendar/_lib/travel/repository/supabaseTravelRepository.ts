// app/(culcept)/calendar/_lib/travel/repository/supabaseTravelRepository.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-0: TravelRepository の Supabase 実装 — **skeleton（未実装）**。
//
// ⚠ 本ファイルは「将来こう実装する」を示す型の足場のみ。実際の Supabase client 呼び出しは
//   一切行わない（remote 非接触・DB 結合なし）。getTripDay は NOT_IMPLEMENTED を投げる。
//   有効化（flag ON）+ 実装 + staging 検証は **すべて別 GO**。
//
// 実装時の対応表（Phase D で作成した migration テーブル → TripDay）:
//   travel_days(user_id, date)            → TripDay の日付・テーマ・天気・walking・heroPhoto(FK)
//     ・同一日に複数 trip（C-1）→ primary-day 選択: status='active' → start_date → created_at
//   travel_trips(id)                       → Trip（title/destination/期間/partySize）
//   travel_itinerary_items(day_id)         → TripDay.schedule（sort_order 順・user_added 含む）
//   travel_reservations(trip_id, day_id)   → TripDay.reservations + reservationStats（集計）
//   travel_photos(id)                      → heroPhoto / 各 item.photo
//   travel_movement_legs(day_id)           → TripDay.move.legs（sort_order 順）
//   travel_memories(trip_id, day_id)       → TripDay.memories
//   location_notes（公開 select）           → 別 repository（LocationNotesRepository・E-1+）
//
//   すべて RLS owner-only。呼び出しユーザーの auth セッションから user_id を取得し、
//   service_role は使わない（クライアント/サーバ both で anon+RLS 前提）。
// ════════════════════════════════════════════════════════════════════════

import {
  type TravelRepository,
  type TripDayResult,
  TravelRepositoryNotImplementedError,
} from "./travelRepository";

export class SupabaseTravelRepository implements TravelRepository {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getTripDay(_date: string): Promise<TripDayResult | null> {
    // TODO(Phase E-1+): travel_days(user_id=auth.uid(), date=_date) を引き、
    //   親 trip + itinerary/reservations/photos/movement_legs/memories を束ねて
    //   TripDay に組み立てて返す。該当なしは null。
    throw new TravelRepositoryNotImplementedError("getTripDay");
  }
}
