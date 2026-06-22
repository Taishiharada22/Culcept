/**
 * Phase E-2 foundation — TripDay 派生関数の検証（fixture 照合）
 *
 * 設計判断（Option 2）: reservationStats / move.summary / routeStops は DB に持たず
 * source-of-truth（reservations / legs / schedule）から算出する。本テストはその算出ロジックを担保。
 *
 * 特に computeMoveSummary は fixture の move.summary を **完全再現**（DB 化しても同値）であることを証明。
 */
import { describe, it, expect } from "vitest";
import { SAMPLE_KYOTO_TRIP } from "@/app/(culcept)/calendar/_lib/travel/sampleTrip";
import {
  parseDurationMin,
  parseDistanceKm,
  parseFareYen,
  computeReservationStats,
  computeMoveSummary,
  deriveRouteStops,
} from "@/app/(culcept)/calendar/_lib/travel/tripDayDerive";
import type { Reservation } from "@/app/(culcept)/calendar/_lib/travel/types";

const DAY = SAMPLE_KYOTO_TRIP.days[0];

describe("parse helpers", () => {
  it("parseDurationMin: 約20分→20 / 空→0", () => {
    expect(parseDurationMin("約20分")).toBe(20);
    expect(parseDurationMin("約76分")).toBe(76);
    expect(parseDurationMin(undefined)).toBe(0);
  });
  it("parseDistanceKm: km はそのまま / m は km 換算", () => {
    expect(parseDistanceKm("7.2 km")).toBeCloseTo(7.2, 5);
    expect(parseDistanceKm("850 m")).toBeCloseTo(0.85, 5);
    expect(parseDistanceKm(null)).toBe(0);
  });
  it("parseFareYen: ¥2,650→2650 / null→0", () => {
    expect(parseFareYen("¥2,650")).toBe(2650);
    expect(parseFareYen(null)).toBe(0);
  });
});

describe("computeMoveSummary（legs → summary・fixture 完全再現）", () => {
  it("fixture move.summary を完全再現する", () => {
    const summary = computeMoveSummary(DAY.move.legs);
    expect(summary).toEqual(DAY.move.summary);
  });

  it("目的地（mode 無し）leg は per-mode 集計から除外", () => {
    // 末尾の目的地 leg（l6）は perMode に現れない＝taxi/walk/bus の 3 mode のみ
    const summary = computeMoveSummary(DAY.move.legs);
    expect(summary.perMode.map((p) => p.mode)).toEqual(["taxi", "walk", "bus"]);
  });
});

describe("computeReservationStats（reservations の集計）", () => {
  it("status/changeable/needsAction を数える", () => {
    const sample: Reservation[] = [
      { id: "a", category: "宿泊", name: "x", status: "確定済み", changeable: true, tags: [], actions: [], photo: null },
      { id: "b", category: "食事", name: "y", status: "確定済み", changeable: false, needsAction: true, tags: [], actions: [], photo: null },
      { id: "c", category: "交通", name: "z", status: "要対応", changeable: true, tags: [], actions: [], photo: null },
    ];
    expect(computeReservationStats(sample)).toEqual({ total: 3, confirmed: 2, changeable: 2, needsAction: 1 });
  });

  it("fixture の day reservations（4件・全確定/全変更可/要対応0）を集計", () => {
    // 注: fixture の day.reservationStats.total は 6（trip 全体・未掲載含む curated）。
    // 本関数は渡した配列を集計する＝day の 4 件では {4,4,4,0}。getTripDay は trip 全体を渡す。
    expect(computeReservationStats(DAY.reservations)).toEqual({
      total: 4,
      confirmed: 4,
      changeable: 4,
      needsAction: 0,
    });
  });
});

describe("deriveRouteStops（schedule の投影）", () => {
  const stops = deriveRouteStops(DAY.schedule);

  it("件数・順序が schedule に一致", () => {
    expect(stops.length).toBe(DAY.schedule.length);
    expect(stops.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("座標は fixture routeStops と一致（同じ schedule 由来）", () => {
    expect(stops.map((s) => s.coords)).toEqual(DAY.routeStops.map((s) => s.coords));
  });

  it("name は schedule 由来（fixture routeStops は表示用に手調整され名称が異なる）", () => {
    expect(stops[0].name).toBe(DAY.schedule[0].name); // "京都駅 到着"
    expect(stops[0].name).not.toBe(DAY.routeStops[0].name); // fixture は "京都駅"
  });

  it("末尾は modeToNext 無し（transportToNext が無い）", () => {
    expect(stops[stops.length - 1].modeToNext).toBeUndefined();
  });
});
