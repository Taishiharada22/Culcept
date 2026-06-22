/**
 * Phase E-2 — assembleTripDayFromRows（DB行 → TripDay・pure）
 *
 * DB query を介さず、行 contract から TripDay 組み立てを検証:
 *   - source-of-truth（trip/day/items/reservations/legs/memory/photos）の map
 *   - 派生（reservationStats/move.summary/routeStops）の算出
 *   - meal/budget は undefined（honest optional）
 *   - 写真 lookup（hero/item）・sort_order 並べ替え
 */
import { describe, it, expect } from "vitest";
import { assembleTripDayFromRows, type TripDayRows } from "@/app/(culcept)/calendar/_lib/travel/repository/tripDayAssembler";

const ROWS: TripDayRows = {
  trip: {
    id: "t1",
    title: "京都 2泊3日",
    destination_label: "京都",
    start_date: "2026-06-24",
    end_date: "2026-06-26",
    party_size: 2,
    status: "active",
  },
  day: {
    id: "d1",
    trip_id: "t1",
    date: "2026-06-24",
    day_index: 1,
    weekday_label: "水",
    month_day_label: "6/24",
    theme: "東山さんぽ",
    theme_subtitle: "歴史と文化",
    weather: { icon: "sun", tempMax: 28, tempMin: 19 },
    hero_photo_id: "p1",
    walking: { steps: 12450, distanceKm: 8.6 },
  },
  photos: [
    { id: "p1", source: "placeholder", url: null, label: "八坂の塔", tone: "sunset", caption: null, captured_at: null },
    { id: "p2", source: "placeholder", url: null, label: "清水寺", tone: "temple", caption: null, captured_at: null },
  ],
  items: [
    // sort_order を逆順で渡し、assembler が並べ替えることを確認
    { id: "i2", start_time: "10:30", end_time: null, name: "清水寺", subtitle: null, description: null, address: null, categories: ["拝観"], duration_min: 90, photo_id: "p2", coords: { lat: 34.9949, lng: 135.7851 }, reservation_id: null, transport_to_next: { mode: "walk", durationMin: 10, label: "徒歩 約10分" }, sort_order: 2 },
    { id: "i1", start_time: "09:30", end_time: null, name: "京都駅 到着", subtitle: null, description: null, address: null, categories: ["到着"], duration_min: 30, photo_id: null, coords: { lat: 34.9858, lng: 135.7588 }, reservation_id: "r1", transport_to_next: { mode: "bus", durationMin: 15, label: "バス 約15分" }, sort_order: 1 },
  ],
  reservations: [
    { id: "r1", category: "食事", name: "たん熊", status: "確定済み", confirmation_code: null, time_label: null, address: null, phone: null, changeable: true, needs_action: null, tags: null, transit_from: null, transit_to: null, transit_depart: null, transit_arrive: null, seat: null, check_in: null, check_out: null, party_size: 2, actions: null, coords: null, photo_id: null },
    { id: "r2", category: "宿泊", name: "宿", status: "要対応", confirmation_code: null, time_label: null, address: null, phone: null, changeable: false, needs_action: true, tags: null, transit_from: null, transit_to: null, transit_depart: null, transit_arrive: null, seat: null, check_in: null, check_out: null, party_size: 2, actions: null, coords: null, photo_id: null },
  ],
  legs: [
    { id: "l1", time: "09:10", endpoint_kind: "depart", name: "京都駅", sub: null, mode: "taxi", mode_label: "タクシー", duration_text: "約20分", distance_text: "7.2 km", fare_text: "¥2,650", is_destination: null, sort_order: 1 },
    { id: "l2", time: "09:30", endpoint_kind: "arrive", name: "清水寺", sub: null, mode: "walk", mode_label: "徒歩", duration_text: "約12分", distance_text: "850 m", fare_text: null, is_destination: null, sort_order: 2 },
  ],
  memory: { text: "良い一日でした", photo_ids: ["p2"] },
};

describe("assembleTripDayFromRows", () => {
  const { trip, day } = assembleTripDayFromRows(ROWS);

  it("trip/day の基本フィールドを map", () => {
    expect(trip.title).toBe("京都 2泊3日");
    expect(trip.partySize).toBe(2);
    expect(day.date).toBe("2026-06-24");
    expect(day.theme).toBe("東山さんぽ");
    expect(day.themeSubtitle).toBe("歴史と文化");
    expect(day.weather).toEqual({ icon: "sun", tempMax: 28, tempMin: 19 });
    expect(day.walking).toEqual({ steps: 12450, distanceKm: 8.6 });
  });

  it("schedule を sort_order 昇順に並べ替え＋写真 lookup", () => {
    expect(day.schedule.map((s) => s.id)).toEqual(["i1", "i2"]);
    expect(day.schedule[0].photo).toBeNull(); // i1 は photo_id null
    expect(day.schedule[1].photo?.label).toBe("清水寺"); // i2 → p2
  });

  it("heroPhoto を hero_photo_id から lookup", () => {
    expect(day.heroPhoto?.label).toBe("八坂の塔");
  });

  it("reservationStats を算出（trip 全体）", () => {
    expect(day.reservationStats).toEqual({ total: 2, confirmed: 1, changeable: 1, needsAction: 1 });
  });

  it("move.summary / routeStops を算出", () => {
    expect(day.move.summary.totalFareText).toBe("概算 ¥2,650");
    expect(day.move.legs.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(day.routeStops.map((r) => r.order)).toEqual([1, 2]);
    expect(day.routeStops[0].name).toBe("京都駅 到着"); // schedule 由来
  });

  it("meal/budget は undefined（honest optional）", () => {
    expect(day.meal).toBeUndefined();
    expect(day.budget).toBeUndefined();
  });

  it("memories を map（photo_ids[0] lookup）", () => {
    expect(day.memories.text).toBe("良い一日でした");
    expect(day.memories.photo?.label).toBe("清水寺");
  });
});
