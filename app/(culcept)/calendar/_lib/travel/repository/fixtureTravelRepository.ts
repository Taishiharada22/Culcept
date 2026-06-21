// app/(culcept)/calendar/_lib/travel/repository/fixtureTravelRepository.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-0: TravelRepository の fixture 実装（既定）。
//
// 従来 CalendarTab が直接呼んでいた getSampleTripDay + 期間判定を、この実装に移設。
// 挙動は完全に同一（同じ fixture を返す）。唯一の差は async（Promise.resolve）化。
//
// → これにより consumer は「同期 fixture」ではなく「async repository」に依存する形になり、
//   将来 SupabaseTravelRepository へ差し替えても consumer のコードは変わらない。
// ════════════════════════════════════════════════════════════════════════

import { getSampleTripDay, SAMPLE_KYOTO_TRIP } from "../sampleTrip";
import type { TravelRepository, TripDayResult } from "./travelRepository";

export class FixtureTravelRepository implements TravelRepository {
  async getTripDay(date: string): Promise<TripDayResult | null> {
    // 旧 CalendarTab の判定をそのまま移植（fixture trip の期間外は null＝詳細ボタン非表示）。
    if (date < SAMPLE_KYOTO_TRIP.startDate || date > SAMPLE_KYOTO_TRIP.endDate) {
      return null;
    }
    // 同期に解決できるが、interface 契約に合わせて Promise で返す。
    return getSampleTripDay(date);
  }
}
