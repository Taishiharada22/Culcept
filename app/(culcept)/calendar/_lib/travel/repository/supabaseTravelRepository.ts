// app/(culcept)/calendar/_lib/travel/repository/supabaseTravelRepository.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-2: TravelRepository の Supabase 実装（getTripDay 実装済・owner-scoped・RLS 前提）。
//
// ⚠ flag OFF（既定）では factory がこれを生成しない＝production 経路に乗らない（点火は別 GO）。
//   service_role は使わない（auth セッション + anon + RLS）。
//
// query（I/O）と組み立て（mapping）を分離: 取得行を assembleTripDayFromRows に渡す。
//   - travel_days(date) を owner-scoped 取得 → 同日複数 trip は primary-day 選択
//     （trip.status='active' → start_date 昇順 → created_at 昇順）。
//   - reservations は **trip 全体**を取得（reservationStats を trip-wide で算出）。
//   - soft-delete 行（deleted_at not null）は除外。
// ════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TravelRepository, TripDayResult } from "./travelRepository";
import {
  assembleTripDayFromRows,
  type DayRow,
  type TripRow,
  type PhotoRow,
  type ItineraryItemRow,
  type ReservationRow,
  type MovementLegRow,
  type MemoryRow,
} from "./tripDayAssembler";

export class SupabaseTravelRepository implements TravelRepository {
  private client: SupabaseClient | null;

  constructor(client?: SupabaseClient) {
    this.client = client ?? null;
  }

  /** 注入が無ければ browser client を遅延生成（flag ON 経路でのみ呼ばれる）。 */
  private async getClient(): Promise<SupabaseClient> {
    if (this.client) return this.client;
    const { supabaseBrowser } = await import("@/lib/supabase/client");
    this.client = supabaseBrowser() as unknown as SupabaseClient;
    return this.client;
  }

  async getTripDay(date: string): Promise<TripDayResult | null> {
    const sb = await this.getClient();

    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return null;

    // 当日の days（RLS で本人分のみ・soft-delete 除外）
    const { data: days } = await sb
      .from("travel_days")
      .select("*")
      .eq("date", date)
      .is("deleted_at", null);
    if (!days || days.length === 0) return null;

    // 親 trip
    const tripIds = [...new Set(days.map((d) => (d as DayRow).trip_id))];
    const { data: trips } = await sb
      .from("travel_trips")
      .select("*")
      .in("id", tripIds)
      .is("deleted_at", null);
    const tripById = new Map((trips ?? []).map((t) => [(t as TripRow).id, t as TripRow]));

    // primary-day 選択: status='active' → start_date 昇順 → created_at 昇順
    const sortedDays = (days as (DayRow & { created_at?: string })[]).slice().sort((a, b) => {
      const ta = tripById.get(a.trip_id);
      const tb = tripById.get(b.trip_id);
      const aActive = ta?.status === "active" ? 0 : 1;
      const bActive = tb?.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      if (ta && tb && ta.start_date !== tb.start_date) return ta.start_date < tb.start_date ? -1 : 1;
      return (a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1;
    });
    const day = sortedDays[0] as DayRow;
    const trip = tripById.get(day.trip_id);
    if (!trip) return null;

    // 関連行（day 単位の items/legs/memory・trip 全体の reservations）
    const [itemsRes, reservationsRes, legsRes, memoryRes] = await Promise.all([
      sb.from("travel_itinerary_items").select("*").eq("day_id", day.id).is("deleted_at", null),
      sb.from("travel_reservations").select("*").eq("trip_id", trip.id).is("deleted_at", null),
      sb.from("travel_movement_legs").select("*").eq("day_id", day.id),
      sb.from("travel_memories").select("*").eq("day_id", day.id).is("deleted_at", null).limit(1),
    ]);
    const items = (itemsRes.data ?? []) as ItineraryItemRow[];
    const reservations = (reservationsRes.data ?? []) as ReservationRow[];
    const legs = (legsRes.data ?? []) as MovementLegRow[];
    const memory = ((memoryRes.data ?? [])[0] ?? null) as MemoryRow | null;

    // 参照写真をまとめて取得
    const photoIds = [
      day.hero_photo_id,
      ...items.map((i) => i.photo_id),
      ...reservations.map((r) => r.photo_id),
      ...(memory?.photo_ids ?? []),
    ].filter((x): x is string => !!x);
    let photos: PhotoRow[] = [];
    if (photoIds.length) {
      const { data: photoData } = await sb
        .from("travel_photos")
        .select("*")
        .in("id", [...new Set(photoIds)])
        .is("deleted_at", null);
      photos = (photoData ?? []) as PhotoRow[];
    }

    return assembleTripDayFromRows({ trip, day, photos, items, reservations, legs, memory });
  }
}
