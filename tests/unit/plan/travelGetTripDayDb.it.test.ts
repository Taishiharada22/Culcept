/**
 * Phase E-2 — SupabaseTravelRepository.getTripDay 実DB統合テスト（**opt-in / local-only**）
 *
 * 既定では skip。ローカル Supabase 起動中に以下で実行:
 *   RUN_TRAVEL_DB_IT=1 npx vitest run tests/unit/plan/travelGetTripDayDb.it.test.ts
 *
 * 検証: 認証ユーザーで 7 テーブルに seed → getTripDay が RLS owner-scoped に取得し組み立て。
 *       別ユーザーからは見えない（RLS negative）。service_role 不使用（anon + auth セッション）。
 *
 * URL/anon は **local Supabase の公開デフォルト**（localhost 専用・秘密でない）。
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { SupabaseTravelRepository } from "@/app/(culcept)/calendar/_lib/travel/repository/supabaseTravelRepository";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const RUN = process.env.RUN_TRAVEL_DB_IT === "1";
const d = RUN ? describe : describe.skip;

function newClient() {
  return createClient(LOCAL_URL, LOCAL_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signUpUser(email: string) {
  const client = newClient();
  const { data, error } = await client.auth.signUp({ email, password: "password123" });
  if (error) throw error;
  if (!data.session) {
    const { error: e2 } = await client.auth.signInWithPassword({ email, password: "password123" });
    if (e2) throw e2;
  }
  if (!data.user) throw new Error("no user from signUp");
  return { client, uid: data.user.id };
}

d("SupabaseTravelRepository.getTripDay — local DB 統合", () => {
  it("認証ユーザーで seed → getTripDay が組み立て / 別ユーザーは null（RLS）", async () => {
    const date = "2026-06-24";
    const { client, uid } = await signUpUser(`trav-it-${Date.now()}@example.com`);

    const { data: trip, error: te } = await client
      .from("travel_trips")
      .insert({ user_id: uid, title: "京都 IT", destination_label: "京都", start_date: date, end_date: "2026-06-26", party_size: 2, status: "active" })
      .select()
      .single();
    expect(te).toBeNull();

    const { data: photo } = await client
      .from("travel_photos")
      .insert({ user_id: uid, source: "placeholder", label: "八坂の塔", tone: "sunset" })
      .select()
      .single();

    const { data: day, error: de } = await client
      .from("travel_days")
      .insert({ user_id: uid, trip_id: trip!.id, date, day_index: 1, weekday_label: "水", month_day_label: "6/24", theme: "東山さんぽ", theme_subtitle: "歴史と文化", weather: { icon: "sun", tempMax: 28, tempMin: 19 }, hero_photo_id: photo!.id, walking: { steps: 12450, distanceKm: 8.6 } })
      .select()
      .single();
    expect(de).toBeNull();

    const { error: re } = await client.from("travel_reservations").insert([
      { user_id: uid, trip_id: trip!.id, day_id: day!.id, category: "食事", name: "たん熊", status: "確定済み", changeable: true },
      { user_id: uid, trip_id: trip!.id, day_id: day!.id, category: "宿泊", name: "宿", status: "要対応", changeable: false, needs_action: true },
    ]);
    expect(re).toBeNull();

    const { error: ie } = await client.from("travel_itinerary_items").insert([
      { user_id: uid, day_id: day!.id, start_time: "09:30", name: "京都駅 到着", categories: ["到着"], duration_min: 30, coords: { lat: 34.9858, lng: 135.7588 }, transport_to_next: { mode: "bus", durationMin: 15, label: "バス 約15分" }, sort_order: 1, source_kind: "fixture" },
      { user_id: uid, day_id: day!.id, start_time: "10:30", name: "清水寺", categories: ["拝観"], duration_min: 90, photo_id: photo!.id, coords: { lat: 34.9949, lng: 135.7851 }, transport_to_next: { mode: "walk", durationMin: 10, label: "徒歩 約10分" }, sort_order: 2, source_kind: "fixture" },
    ]);
    expect(ie).toBeNull();

    const { error: le } = await client.from("travel_movement_legs").insert([
      { user_id: uid, day_id: day!.id, time: "09:10", endpoint_kind: "depart", name: "京都駅", mode: "taxi", mode_label: "タクシー", duration_text: "約20分", distance_text: "7.2 km", fare_text: "¥2,650", sort_order: 1 },
      { user_id: uid, day_id: day!.id, time: "09:30", endpoint_kind: "arrive", name: "清水寺", mode: "walk", mode_label: "徒歩", duration_text: "約12分", distance_text: "850 m", fare_text: null, sort_order: 2 },
    ]);
    expect(le).toBeNull();

    const { error: me } = await client
      .from("travel_memories")
      .insert({ user_id: uid, trip_id: trip!.id, day_id: day!.id, text: "良い一日", photo_ids: [photo!.id], phase: "after" });
    expect(me).toBeNull();

    // ── getTripDay（owner-scoped・RLS）──
    const repo = new SupabaseTravelRepository(client);
    const result = await repo.getTripDay(date);
    expect(result).not.toBeNull();
    expect(result!.trip.title).toBe("京都 IT");
    expect(result!.day.schedule.map((s) => s.name)).toEqual(["京都駅 到着", "清水寺"]);
    expect(result!.day.schedule[1].photo?.label).toBe("八坂の塔");
    expect(result!.day.reservationStats).toEqual({ total: 2, confirmed: 1, changeable: 1, needsAction: 1 });
    expect(result!.day.move.summary.totalFareText).toBe("概算 ¥2,650");
    expect(result!.day.routeStops.length).toBe(2);
    expect(result!.day.heroPhoto?.label).toBe("八坂の塔");
    expect(result!.day.weather).toEqual({ icon: "sun", tempMax: 28, tempMin: 19 });
    expect(result!.day.meal).toBeUndefined();
    expect(result!.day.budget).toBeUndefined();

    // ── RLS negative: 別ユーザーからは見えない ──
    const { client: other } = await signUpUser(`other-it-${Date.now()}@example.com`);
    const otherRepo = new SupabaseTravelRepository(other);
    expect(await otherRepo.getTripDay(date)).toBeNull();
  }, 40000);
});
