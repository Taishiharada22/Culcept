// app/(culcept)/calendar/_lib/travel/repository/tripDayAssembler.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-2: DB 行（snake_case）→ TripDay 組み立て（pure・DB 非依存）。
//
// SupabaseTravelRepository.getTripDay が各テーブルから取得した行を渡し、本関数が
// TripDay を組み立てる。I/O（query）と mapping を分離＝mapping を pure にテスト可能に。
//
// 方針（docs/travel-tripday-data-classification-e2-plan.md）:
//   - source-of-truth（trip/day/items/reservations/legs/memory/photos）は行から map。
//   - 派生（reservationStats/move.summary/routeStops）は tripDayDerive で算出。
//   - meal/budget は **undefined**（生成 / 要・別設計＝honest optional）。
// ════════════════════════════════════════════════════════════════════════

import type {
  DayWeather,
  MemoriesNote,
  MoveLeg,
  Reservation,
  ReservationAction,
  ReservationCategory,
  ReservationStatus,
  ReservationTag,
  ScheduleItem,
  TransportLeg,
  TransportMode,
  TravelPhoto,
  TravelPhotoSource,
  Trip,
  TripDay,
} from "../types";
import type { TripDayResult } from "./travelRepository";
import { computeMoveSummary, computeReservationStats, deriveRouteStops } from "../tripDayDerive";

// ── DB 行 contract（SELECT * の必要列のみ・snake_case・nullable は | null）──
export interface TripRow {
  id: string;
  title: string;
  destination_label: string | null;
  start_date: string;
  end_date: string;
  party_size: number;
  status: string;
}
export interface DayRow {
  id: string;
  trip_id: string;
  date: string;
  day_index: number;
  weekday_label: string | null;
  month_day_label: string | null;
  theme: string | null;
  theme_subtitle: string | null;
  weather: DayWeather | null;
  hero_photo_id: string | null;
  walking: { steps: number; distanceKm: number } | null;
}
export interface PhotoRow {
  id: string;
  source: string;
  url: string | null;
  label: string | null;
  tone: string | null;
  caption: string | null;
  captured_at: string | null;
}
export interface ItineraryItemRow {
  id: string;
  start_time: string | null;
  end_time: string | null;
  name: string;
  subtitle: string | null;
  description: string | null;
  address: string | null;
  categories: string[] | null;
  duration_min: number | null;
  photo_id: string | null;
  coords: { lat: number; lng: number } | null;
  reservation_id: string | null;
  transport_to_next: TransportLeg | null;
  sort_order: number;
}
export interface ReservationRow {
  id: string;
  category: string;
  name: string | null;
  status: string | null;
  confirmation_code: string | null;
  time_label: string | null;
  address: string | null;
  phone: string | null;
  changeable: boolean | null;
  needs_action: boolean | null;
  tags: ReservationTag[] | null;
  transit_from: string | null;
  transit_to: string | null;
  transit_depart: string | null;
  transit_arrive: string | null;
  seat: string | null;
  check_in: string | null;
  check_out: string | null;
  party_size: number | null;
  actions: ReservationAction[] | null;
  coords: { lat: number; lng: number } | null;
  photo_id: string | null;
}
export interface MovementLegRow {
  id: string;
  time: string | null;
  endpoint_kind: string | null;
  name: string | null;
  sub: string | null;
  mode: string | null;
  mode_label: string | null;
  duration_text: string | null;
  distance_text: string | null;
  fare_text: string | null;
  is_destination: boolean | null;
  sort_order: number;
}
export interface MemoryRow {
  text: string | null;
  photo_ids: string[] | null;
}

export interface TripDayRows {
  trip: TripRow;
  day: DayRow;
  photos: PhotoRow[];
  items: ItineraryItemRow[];
  /** trip 全体の予約（reservationStats を trip-wide で算出するため）。 */
  reservations: ReservationRow[];
  legs: MovementLegRow[];
  memory: MemoryRow | null;
}

/** PhotoRow → TravelPhoto（捏造なし・null は blank）。Location Notes mapper でも再利用。 */
export function mapPhotoRow(row: PhotoRow | undefined | null): TravelPhoto | null {
  if (!row) return null;
  const photo: TravelPhoto = { source: row.source as TravelPhotoSource };
  if (row.url) photo.url = row.url;
  if (row.label) photo.label = row.label;
  if (row.tone) photo.tone = row.tone as TravelPhoto["tone"];
  if (row.caption) photo.caption = row.caption;
  if (row.captured_at) photo.capturedAt = row.captured_at;
  return photo;
}
const mapPhoto = mapPhotoRow;

function mapItem(row: ItineraryItemRow, photoById: Map<string, PhotoRow>): ScheduleItem {
  const item: ScheduleItem = {
    id: row.id,
    startTime: row.start_time ?? "",
    name: row.name,
    categories: row.categories ?? [],
    photo: mapPhoto(row.photo_id ? photoById.get(row.photo_id) : undefined),
  };
  if (row.end_time) item.endTime = row.end_time;
  if (row.subtitle) item.subtitle = row.subtitle;
  if (row.description) item.description = row.description;
  if (row.duration_min != null) item.durationMin = row.duration_min;
  if (row.coords) item.coords = row.coords;
  if (row.address) item.address = row.address;
  if (row.reservation_id) item.reservationId = row.reservation_id;
  if (row.transport_to_next) item.transportToNext = row.transport_to_next;
  return item;
}

function mapReservation(row: ReservationRow, photoById: Map<string, PhotoRow>): Reservation {
  const r: Reservation = {
    id: row.id,
    category: row.category as ReservationCategory,
    name: row.name ?? "",
    status: (row.status ?? "確定済み") as ReservationStatus,
    changeable: row.changeable ?? false,
    tags: row.tags ?? [],
    actions: row.actions ?? [],
    photo: mapPhoto(row.photo_id ? photoById.get(row.photo_id) : undefined),
  };
  if (row.confirmation_code) r.confirmationCode = row.confirmation_code;
  if (row.time_label) r.timeLabel = row.time_label;
  if (row.address) r.address = row.address;
  if (row.phone) r.phone = row.phone;
  if (row.needs_action != null) r.needsAction = row.needs_action;
  if (row.transit_from) r.transitFrom = row.transit_from;
  if (row.transit_to) r.transitTo = row.transit_to;
  if (row.transit_depart) r.transitDepart = row.transit_depart;
  if (row.transit_arrive) r.transitArrive = row.transit_arrive;
  if (row.seat) r.seat = row.seat;
  if (row.check_in) r.checkIn = row.check_in;
  if (row.check_out) r.checkOut = row.check_out;
  if (row.party_size != null) r.partySize = row.party_size;
  if (row.coords) r.coords = row.coords;
  return r;
}

function mapLeg(row: MovementLegRow): MoveLeg {
  const leg: MoveLeg = {
    id: row.id,
    time: row.time ?? "",
    endpointKind: (row.endpoint_kind ?? "depart") as "depart" | "arrive",
    name: row.name ?? "",
  };
  if (row.sub) leg.sub = row.sub;
  if (row.mode) leg.mode = row.mode as TransportMode;
  if (row.mode_label) leg.modeLabel = row.mode_label;
  if (row.duration_text) leg.durationText = row.duration_text;
  if (row.distance_text) leg.distanceText = row.distance_text;
  if (row.fare_text != null) leg.fareText = row.fare_text;
  if (row.is_destination != null) leg.isDestination = row.is_destination;
  return leg;
}

const NEUTRAL_WEATHER: DayWeather = { icon: "", tempMax: 0, tempMin: 0 };

/**
 * DB 行群から TripDay を組み立てる（pure）。
 * meal/budget は undefined（honest optional）。reservationStats/move.summary/routeStops は算出。
 */
export function assembleTripDayFromRows(rows: TripDayRows): TripDayResult {
  const { trip, day, photos, items, reservations, legs, memory } = rows;
  const photoById = new Map(photos.map((p) => [p.id, p]));

  const schedule = items
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => mapItem(i, photoById));

  const mappedReservations = reservations.map((r) => mapReservation(r, photoById));

  const mappedLegs = legs
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(mapLeg);

  const memories: MemoriesNote = {
    text: memory?.text ?? "",
    photo: mapPhoto(memory?.photo_ids?.[0] ? photoById.get(memory.photo_ids[0]) : undefined),
  };

  const tripDay: TripDay = {
    // E-6A: DB day 行 uuid を TripDay.id に載せる。これが currentDayId として
    //   TravelItineraryProvider → buildAddedEntry に渡り、writeAddedEntries の
    //   isWritableAddedEntry（dayId が uuid）を満たす。未設定だと itinerary add が
    //   DB（travel_itinerary_items / location_note_to_itinerary）に到達しなかった（E-5C-2 検出）。
    id: day.id,
    date: day.date,
    dayIndex: day.day_index,
    weekdayLabel: day.weekday_label ?? "",
    monthDayLabel: day.month_day_label ?? "",
    theme: day.theme ?? "",
    weather: day.weather ?? NEUTRAL_WEATHER,
    heroPhoto: mapPhoto(day.hero_photo_id ? photoById.get(day.hero_photo_id) : undefined),
    schedule,
    reservations: mappedReservations,
    reservationStats: computeReservationStats(mappedReservations),
    // meal/budget: honest optional（DB に持たない・生成/別設計）→ undefined
    walking: day.walking ?? { steps: 0, distanceKm: 0 },
    move: { legs: mappedLegs, summary: computeMoveSummary(mappedLegs) },
    memories,
    routeStops: deriveRouteStops(schedule),
  };
  if (day.theme_subtitle) tripDay.themeSubtitle = day.theme_subtitle;

  const mappedTrip: Trip = {
    id: trip.id,
    title: trip.title,
    destinationLabel: trip.destination_label ?? "",
    startDate: trip.start_date,
    endDate: trip.end_date,
    dateRangeLabel: "",
    partySize: trip.party_size,
    days: [tripDay],
  };

  return { trip: mappedTrip, day: tripDay };
}
