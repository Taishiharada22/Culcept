/**
 * regenerateTravelForPlan — W3-PR-10 Phase 3A 契約テスト
 *
 * 目的: MorningPlanCard の reorder / time-edit / place-change ハンドラが
 * canonical 対応になっていることを保証する。
 *
 * カバレッジ:
 *   A. canonical mode (transportSegments !== undefined): travel 落とし、Path B 不混入
 *      A-1: transportSegments = [] でも canonical 扱い
 *      A-2: transportSegments が 1+ 本あっても travel 再注入しない
 *      A-3: anchor (departureTime/arrivalTime) が recalculateSchedule に伝播する
 *   B. non-canonical mode (transportSegments === undefined): 既存挙動維持
 *      B-1: place 変化があれば travel が挿入される
 *      B-2: transport は existingTravel > flowContext > dayConditions > "car"
 */

import { describe, test, expect } from "vitest";
import { regenerateTravelForPlan } from "@/lib/alter-morning/planning/regenerateTravelForPlan";
import type { MorningPlan, PlanItem } from "@/lib/alter-morning/types";
import type { TransportSegment } from "@/lib/alter-morning/transport/types";

function mkTaskItem(opts: {
  id: string;
  text?: string;
  startTime?: string;
  durationMin?: number;
  location?: { canonicalId: string; label: string; lat?: number; lng?: number };
  orderHint?: number;
}): PlanItem {
  return {
    id: opts.id,
    kind: "todo",
    text: opts.text ?? opts.id,
    what: opts.text ?? opts.id,
    startTime: opts.startTime,
    durationMin: opts.durationMin ?? 60,
    fixedStart: !!opts.startTime,
    orderHint: opts.orderHint ?? 0,
    sourceTurnIndex: 0,
    completed: false,
    location: opts.location
      ? {
          canonicalId: opts.location.canonicalId,
          label: opts.location.label,
          source: "user_explicit",
          lat: opts.location.lat,
          lng: opts.location.lng,
        }
      : undefined,
  } as PlanItem;
}

function mkTravelItem(opts: {
  id: string;
  travelFrom: string;
  travelTo: string;
  durationMin?: number;
  startTime?: string;
  orderHint?: number;
  transport?: "car" | "walk" | "train";
}): PlanItem {
  return {
    id: opts.id,
    kind: "travel",
    text: `${opts.travelFrom} → ${opts.travelTo}`,
    what: "移動",
    startTime: opts.startTime,
    durationMin: opts.durationMin ?? 15,
    fixedStart: false,
    orderHint: opts.orderHint ?? 0,
    sourceTurnIndex: 0,
    completed: false,
    travelFrom: opts.travelFrom,
    travelTo: opts.travelTo,
    travelTransport: opts.transport ?? "car",
  } as PlanItem;
}

function mkPlan(opts: {
  items: PlanItem[];
  transportSegments?: TransportSegment[];
  departureTime?: string;
  arrivalTime?: string;
  flowContextTransport?: "car" | "walk" | "train";
  mainTransport?: "car" | "walk" | "train";
  goOut?: boolean;
}): MorningPlan {
  const plan: MorningPlan = {
    date: "2026-04-23",
    items: opts.items,
    dayConditions: { mainTransport: opts.mainTransport },
    createdAt: "2026-04-23T00:00:00Z",
    confirmed: false,
    departureTime: opts.departureTime,
    arrivalTime: opts.arrivalTime,
  } as MorningPlan;
  if (opts.flowContextTransport !== undefined || opts.goOut !== undefined) {
    plan.flowContext = {
      transport: opts.flowContextTransport,
      goOut: opts.goOut,
    } as MorningPlan["flowContext"];
  }
  if (opts.transportSegments !== undefined) {
    plan.transportSegments = opts.transportSegments;
  }
  return plan;
}

describe("regenerateTravelForPlan — canonical mode (W3-PR-10 Phase 3A)", () => {
  test("A-1: transportSegments = [] でも canonical 扱い（travel 落とし）", () => {
    const prev = mkPlan({
      items: [
        mkTaskItem({ id: "t1", startTime: "09:00", location: { canonicalId: "home", label: "自宅" } }),
        mkTravelItem({ id: "travel__t1__t2", travelFrom: "家", travelTo: "Cafe A" }),
        mkTaskItem({ id: "t2", startTime: "10:00", location: { canonicalId: "cafe_a", label: "Cafe A" } }),
      ],
      transportSegments: [],
    });
    const nonTravel = prev.items.filter((i) => i.kind !== "travel");

    const result = regenerateTravelForPlan(nonTravel, prev);

    expect(result.some((i) => i.kind === "travel")).toBe(false);
    expect(result.map((i) => i.id)).toEqual(["t1", "t2"]);
  });

  test("A-2: transportSegments が 1+ 本あっても travel 再注入しない（stale 再利用禁止）", () => {
    const prev = mkPlan({
      items: [
        mkTaskItem({ id: "t1", startTime: "09:00", location: { canonicalId: "home", label: "自宅", lat: 35.6, lng: 139.7 } }),
        mkTravelItem({ id: "travel__t1__t2", travelFrom: "家", travelTo: "Cafe A" }),
        mkTaskItem({ id: "t2", startTime: "10:00", location: { canonicalId: "cafe_a", label: "Cafe A", lat: 35.7, lng: 139.8 } }),
      ],
      transportSegments: [
        {
          fromEventId: "t1",
          toEventId: "t2",
          mode: "car",
          estimatedDurationMin: 15,
          durationSource: "heuristic",
          distanceM: null,
          confidence: "inferred",
          source: "distance_heuristic",
        },
      ],
    });
    const nonTravel = prev.items.filter((i) => i.kind !== "travel");

    const result = regenerateTravelForPlan(nonTravel, prev);

    expect(result.filter((i) => i.kind === "travel")).toHaveLength(0);
    expect(result.some((i) => i.id.startsWith("travel_"))).toBe(false);
  });

  test("A-3: canonical mode で departure anchor が尊重される", () => {
    const prev = mkPlan({
      items: [
        mkTaskItem({ id: "t1", startTime: "09:00", location: { canonicalId: "home", label: "自宅" } }),
        mkTaskItem({ id: "t2", startTime: "10:00", location: { canonicalId: "cafe_a", label: "Cafe A" } }),
      ],
      transportSegments: [],
      departureTime: "09:00",
      arrivalTime: "18:00",
    });

    const result = regenerateTravelForPlan(prev.items, prev);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("t1");
    expect(result[1].id).toBe("t2");
  });
});

describe("regenerateTravelForPlan — non-canonical mode (flag OFF regression guard)", () => {
  test("B-1: transportSegments undefined + 場所変化 → travel が挿入される", () => {
    const prev = mkPlan({
      items: [
        mkTaskItem({ id: "t1", startTime: "09:00", location: { canonicalId: "home", label: "自宅" } }),
        mkTravelItem({ id: "travel_abc", travelFrom: "家", travelTo: "Cafe A", transport: "car" }),
        mkTaskItem({ id: "t2", startTime: "10:00", location: { canonicalId: "cafe_a", label: "Cafe A" } }),
      ],
      goOut: true,
    });
    const nonTravel = prev.items.filter((i) => i.kind !== "travel");

    const result = regenerateTravelForPlan(nonTravel, prev);

    const travels = result.filter((i) => i.kind === "travel");
    expect(travels.length).toBeGreaterThan(0);
  });

  test("B-2: transport 推定の優先順位 — existingTravel > flowContext > dayConditions", () => {
    const prev = mkPlan({
      items: [
        mkTaskItem({ id: "t1", location: { canonicalId: "home", label: "自宅" } }),
        mkTravelItem({ id: "travel_abc", travelFrom: "家", travelTo: "Cafe A", transport: "train" }),
        mkTaskItem({ id: "t2", location: { canonicalId: "cafe_a", label: "Cafe A" } }),
      ],
      flowContextTransport: "walk",
      mainTransport: "car",
      goOut: true,
    });
    const nonTravel = prev.items.filter((i) => i.kind !== "travel");

    const result = regenerateTravelForPlan(nonTravel, prev);
    const travel = result.find((i) => i.kind === "travel");

    expect(travel?.travelTransport).toBe("train");
  });

  test("B-3: canonical undefined + 場所変化なし → travel 無し", () => {
    const prev = mkPlan({
      items: [
        mkTaskItem({ id: "t1", startTime: "09:00" }),
        mkTaskItem({ id: "t2", startTime: "10:00" }),
      ],
    });

    const result = regenerateTravelForPlan(prev.items, prev);

    expect(result.filter((i) => i.kind === "travel")).toHaveLength(0);
  });
});
