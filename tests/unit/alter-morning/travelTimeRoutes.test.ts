/**
 * Travel Time Engine — Routes API 統合テスト (Phase C-4)
 *
 * estimateTravelTimeWithRoutes / insertTravelItemsAsync のテスト。
 * Routes API はモック、ビジネスロジック（フォールバック、fail-open）を検証。
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  estimateTravelTimeWithRoutes,
  insertTravelItemsAsync,
  type RoutedTravelEstimate,
} from "@/lib/alter-morning/travelTimeEngine";
import type { PlanItem } from "@/lib/alter-morning/types";
import type { LatLng } from "@/lib/alter-morning/routesApiClient";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mock: routesApiClient
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const mockComputeRoute = vi.fn();
const mockIsRoutesApiAvailable = vi.fn();

vi.mock("@/lib/alter-morning/routesApiClient", () => ({
  computeRoute: (...args: unknown[]) => mockComputeRoute(...args),
  isRoutesApiAvailable: () => mockIsRoutesApiAvailable(),
  toRouteTravelMode: (t?: string) => {
    const map: Record<string, string> = {
      car: "DRIVE", taxi: "DRIVE", train: "TRANSIT",
      bus: "TRANSIT", walk: "WALK", bicycle: "BICYCLE",
      motorcycle: "TWO_WHEELER",
    };
    return map[t ?? "car"] ?? "DRIVE";
  },
}));

const SHIBUYA: LatLng = { lat: 35.6580, lng: 139.7016 };
const TOKYO: LatLng = { lat: 35.6762, lng: 139.6503 };
const KOFU: LatLng = { lat: 35.6621, lng: 138.5682 };

beforeEach(() => {
  mockComputeRoute.mockReset();
  mockIsRoutesApiAvailable.mockReset();
  mockIsRoutesApiAvailable.mockReturnValue(true);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. estimateTravelTimeWithRoutes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("estimateTravelTimeWithRoutes", () => {
  test("座標あり + API 成功 → routes_api ソース", async () => {
    mockComputeRoute.mockResolvedValueOnce({
      durationSeconds: 900,
      durationMinutes: 15,
      distanceMeters: 8000,
      travelMode: "DRIVE",
    });

    const result = await estimateTravelTimeWithRoutes(
      SHIBUYA, TOKYO, "car",
    );

    expect(result).not.toBeNull();
    expect(result!.source).toBe("routes_api");
    expect(result!.durationMin).toBe(15); // ceil(15/15)*15 = 15
    expect(result!.routeDistanceMeters).toBe(8000);
    expect(result!.distanceCategory).toBe("city"); // 8km = city
    expect(mockComputeRoute).toHaveBeenCalledTimes(1);
  });

  test("自宅出発 → HOME_DEPARTURE_OVERHEAD 加算", async () => {
    mockComputeRoute.mockResolvedValueOnce({
      durationSeconds: 600,
      durationMinutes: 10,
      distanceMeters: 5000,
      travelMode: "DRIVE",
    });

    const result = await estimateTravelTimeWithRoutes(
      SHIBUYA, TOKYO, "car", undefined, undefined, true,
    );

    expect(result!.source).toBe("routes_api");
    // 10 + 10(HOME_DEPARTURE) = 20 → ceil(20/15)*15 = 30
    expect(result!.durationMin).toBe(30);
    expect(result!.overheadMin).toBe(10);
  });

  test("origin null → ヒューリスティックフォールバック", async () => {
    const result = await estimateTravelTimeWithRoutes(
      null, TOKYO, "car", undefined, "cafe",
    );

    expect(result).not.toBeNull();
    expect(result!.source).toBe("heuristic");
    expect(mockComputeRoute).not.toHaveBeenCalled();
  });

  test("destination null → ヒューリスティックフォールバック", async () => {
    const result = await estimateTravelTimeWithRoutes(
      SHIBUYA, null, "car", undefined, "cafe",
    );

    expect(result!.source).toBe("heuristic");
    expect(mockComputeRoute).not.toHaveBeenCalled();
  });

  test("API キー未設定 → ヒューリスティックフォールバック", async () => {
    mockIsRoutesApiAvailable.mockReturnValue(false);

    const result = await estimateTravelTimeWithRoutes(
      SHIBUYA, TOKYO, "car", undefined, "cafe",
    );

    expect(result!.source).toBe("heuristic");
    expect(mockComputeRoute).not.toHaveBeenCalled();
  });

  test("API エラー → fail-open でヒューリスティックフォールバック", async () => {
    mockComputeRoute.mockRejectedValueOnce(new Error("Routes API computeRoute failed: 500"));

    const result = await estimateTravelTimeWithRoutes(
      SHIBUYA, TOKYO, "car", undefined, "cafe",
    );

    expect(result).not.toBeNull();
    expect(result!.source).toBe("heuristic");
    expect(mockComputeRoute).toHaveBeenCalledTimes(1);
  });

  test("距離区分: 1.5km → near", async () => {
    mockComputeRoute.mockResolvedValueOnce({
      durationSeconds: 300, durationMinutes: 5,
      distanceMeters: 1500, travelMode: "WALK",
    });

    const result = await estimateTravelTimeWithRoutes(SHIBUYA, TOKYO, "walk");
    expect(result!.distanceCategory).toBe("near");
  });

  test("距離区分: 25km → adjacent", async () => {
    mockComputeRoute.mockResolvedValueOnce({
      durationSeconds: 1800, durationMinutes: 30,
      distanceMeters: 25000, travelMode: "DRIVE",
    });

    const result = await estimateTravelTimeWithRoutes(SHIBUYA, KOFU, "car");
    expect(result!.distanceCategory).toBe("adjacent");
  });

  test("距離区分: 120km → wide", async () => {
    mockComputeRoute.mockResolvedValueOnce({
      durationSeconds: 5400, durationMinutes: 90,
      distanceMeters: 120000, travelMode: "DRIVE",
    });

    const result = await estimateTravelTimeWithRoutes(SHIBUYA, KOFU, "car");
    expect(result!.distanceCategory).toBe("wide");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. insertTravelItemsAsync
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** テスト用ヘルパー: PlanItem 生成 */
function makePlanItem(partial: Partial<PlanItem> & { id: string; text: string }): PlanItem {
  return {
    kind: "todo",
    what: partial.text,
    durationMin: 60,
    fixedStart: false,
    orderHint: 0,
    sourceTurnIndex: 0,
    completed: false,
    ...partial,
  };
}

describe("insertTravelItemsAsync", () => {
  test("goOut=false → 移動なし", async () => {
    const items = [makePlanItem({ id: "1", text: "仕事" })];
    const result = await insertTravelItemsAsync(items, "car", false, {}, null);
    expect(result).toEqual(items);
  });

  test("座標あり → Routes API で移動時間を取得", async () => {
    mockComputeRoute.mockResolvedValue({
      durationSeconds: 1200, durationMinutes: 20,
      distanceMeters: 10000, travelMode: "DRIVE",
    });

    const items = [
      makePlanItem({
        id: "1", text: "カフェ",
        location: { canonicalId: "cafe_1", label: "スタバ渋谷", category: "cafe", source: "user_explicit" },
      }),
    ];

    const coordsMap: Record<string, LatLng> = {
      cafe_1: SHIBUYA,
    };

    const result = await insertTravelItemsAsync(
      items, "car", true, coordsMap, TOKYO,
    );

    // [travel: 自宅→スタバ渋谷] + [カフェ] + [travel: スタバ渋谷→自宅]
    expect(result.length).toBe(3);
    expect(result[0].kind).toBe("travel");
    expect(result[0].travelFrom).toBe("自宅");
    expect(result[0].travelTo).toBe("スタバ渋谷");
    expect(result[1].id).toBe("1");
    expect(result[2].kind).toBe("travel");
    expect(result[2].travelTo).toBe("自宅");

    // Routes API が呼ばれた
    expect(mockComputeRoute).toHaveBeenCalled();
  });

  test("座標なし → ヒューリスティックフォールバック", async () => {
    const items = [
      makePlanItem({
        id: "1", text: "買い物",
        location: { canonicalId: "shop_1", label: "近くのスーパー", category: "shopping", source: "user_explicit" },
      }),
    ];

    // 座標マップに何も入れない → Routes API スキップ
    const result = await insertTravelItemsAsync(
      items, "car", true, {}, null,
    );

    // ヒューリスティックで移動が入る（origin null なので Routes API は呼ばれない）
    expect(result.length).toBe(3);
    expect(result[0].kind).toBe("travel");
    expect(mockComputeRoute).not.toHaveBeenCalled();
  });

  test("2セグメント間: A→B の座標あり → Routes API 使用", async () => {
    // 1回目: 自宅→A
    // 2回目: A→B
    // 3回目: B→自宅
    mockComputeRoute
      .mockResolvedValueOnce({ durationSeconds: 600, durationMinutes: 10, distanceMeters: 5000, travelMode: "DRIVE" })
      .mockResolvedValueOnce({ durationSeconds: 900, durationMinutes: 15, distanceMeters: 8000, travelMode: "DRIVE" })
      .mockResolvedValueOnce({ durationSeconds: 1200, durationMinutes: 20, distanceMeters: 12000, travelMode: "DRIVE" });

    const items = [
      makePlanItem({
        id: "1", text: "カフェ",
        location: { canonicalId: "cafe_1", label: "スタバ", category: "cafe", source: "user_explicit" },
      }),
      makePlanItem({
        id: "2", text: "打ち合わせ",
        location: { canonicalId: "office_1", label: "A社", category: "office", source: "user_explicit" },
      }),
    ];

    const coordsMap: Record<string, LatLng> = {
      cafe_1: SHIBUYA,
      office_1: TOKYO,
    };

    const result = await insertTravelItemsAsync(
      items, "car", true, coordsMap, KOFU,
    );

    // [travel:自宅→スタバ] [カフェ] [travel:スタバ→A社] [打ち合わせ] [travel:A社→自宅]
    expect(result.length).toBe(5);
    const travels = result.filter(i => i.kind === "travel");
    expect(travels.length).toBe(3);
    expect(travels[0].travelTo).toBe("スタバ");
    expect(travels[1].travelFrom).toBe("スタバ");
    expect(travels[1].travelTo).toBe("A社");
    expect(travels[2].travelFrom).toBe("A社");
    expect(travels[2].travelTo).toBe("自宅");
    expect(mockComputeRoute).toHaveBeenCalledTimes(3);
  });

  test("API エラー → ヒューリスティックフォールバックで移動が入る", async () => {
    mockComputeRoute.mockRejectedValue(new Error("Network Error"));

    const items = [
      makePlanItem({
        id: "1", text: "ランチ",
        location: { canonicalId: "r_1", label: "レストラン", category: "restaurant", source: "user_explicit" },
      }),
    ];

    const result = await insertTravelItemsAsync(
      items, "car", true,
      { r_1: SHIBUYA },
      TOKYO,
    );

    // API エラーでもヒューリスティックで移動が入る
    expect(result.length).toBe(3);
    expect(result[0].kind).toBe("travel");
    expect(result[2].kind).toBe("travel");
  });

  test("場所なしアイテム → 移動なし", async () => {
    const items = [
      makePlanItem({ id: "1", text: "読書" }),
    ];

    const result = await insertTravelItemsAsync(
      items, "car", true, {}, TOKYO,
    );

    expect(result.length).toBe(1);
    expect(result[0].id).toBe("1");
  });
});
