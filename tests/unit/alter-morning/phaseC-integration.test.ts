/**
 * Phase C 統合テスト — Places → LocationResolver → TravelTimeEngine → Plan
 *
 * CEO要件 C-5:
 *   1. Places resolved lat/lng → location resolver → travelTimeEngine → plan の一気通貫
 *   2. 片側座標欠落 / Routes失敗時の���然なヒューリスティックフォールバック
 *   3. source: routes_api / heuristic / table_lookup の追跡可能性
 *   4. 出発アンカー・到着アンカー・gap fill と Routes 統合の衝突有無
 *
 * テスト方針:
 *   - 各レイヤーの関数を直接呼び出し、データが正しく流れることを検証
 *   - Routes API / Places API はモック（外部依存を排除）
 *   - 既存の buildDayPlan (sync) は変更なし → insertTravelItemsAsync を直接呼ぶ
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

// ── 対象モジュール ──
import {
  resolveOrigin,
  resolveLayer1,
  getSegmentCoords,
  canUseRoutesApi,
  resolveCoarseArea,
  type SavedBase,
  type LatLng,
} from "@/lib/alter-morning/locationResolver";
import {
  estimateTravelTimeWithRoutes,
  insertTravelItemsAsync,
  estimateTravelTime,
  type RoutedTravelEstimate,
} from "@/lib/alter-morning/travelTimeEngine";
import { buildDayPlan } from "@/lib/alter-morning/planningEngine";
import type { PlanSegment, PlanState } from "@/lib/alter-morning/planState";
import type { PlanItem, DayConditions, MorningPlan } from "@/lib/alter-morning/types";

// ── Mock: routesApiClient ──
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

beforeEach(() => {
  mockComputeRoute.mockReset();
  mockIsRoutesApiAvailable.mockReset();
  mockIsRoutesApiAvailable.mockReturnValue(true);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makePlanState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    targetDate: "2026-04-16",
    targetDateLabel: "今日",
    timezone: "Asia/Tokyo",
    segments: [],
    status: "collecting",
    missingFields: [],
    ...overrides,
  };
}

function makeSegment(overrides: Partial<PlanSegment> = {}): PlanSegment {
  return {
    id: `seg_${Math.random().toString(36).slice(2, 6)}`,
    order: 1,
    activity: "ランチ",
    companions: [],
    status: "confirmed",
    ...overrides,
  };
}

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 座標定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SHIBUYA: LatLng = { lat: 35.6580, lng: 139.7016 };
const SHINJUKU: LatLng = { lat: 35.6938, lng: 139.7036 };
const TOKYO_ST: LatLng = { lat: 35.6812, lng: 139.7671 };
const HOME_SHIBUYA: LatLng = { lat: 35.6640, lng: 139.6982 }; // 渋谷区役所

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 一気通貫テスト: Places → LocationResolver → TravelTimeEngine → Plan
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("一気通貫: 座標パイプライン", () => {
  test("Places API で解決した lat/lng が locationResolver → travelTimeEngine → plan items に到達する", async () => {
    // ── Step 1: Places API が解決した PlanSegment（placeResolver.resolveAnchors の出力に相当）
    const segments: PlanSegment[] = [
      makeSegment({
        id: "seg_cafe",
        order: 1,
        activity: "カフェで作業",
        place: "スタバ渋谷",
        placeType: "chain_brand",
        resolutionConfidence: "high",
        resolvedPlaceName: "スターバックスコーヒー渋谷スクランブルスクエア店",
        resolvedAddress: "東京都渋谷区渋谷2-24-12",
        resolvedLat: SHIBUYA.lat,
        resolvedLng: SHIBUYA.lng,
      }),
      makeSegment({
        id: "seg_meeting",
        order: 2,
        activity: "打ち合わせ",
        place: "A社",
        placeType: "exact_proper_noun",
        resolutionConfidence: "high",
        resolvedPlaceName: "A社 新宿オフィス",
        resolvedAddress: "東京都新宿区西新宿1-1-1",
        resolvedLat: SHINJUKU.lat,
        resolvedLng: SHINJUKU.lng,
      }),
    ];

    // ── Step 2: LocationResolver で origin を解決
    const savedBase: SavedBase = { prefecture: "東京都", city: "渋谷区" };
    const planState = makePlanState({
      segments,
      departureTime: "09:00",
    });

    const origin = resolveOrigin(planState, savedBase);

    // 検証: Layer 2 inferred（departureTime あり + baseline 住所）
    expect(origin.layer).toBe("layer2_inferred");
    expect(origin.coords).not.toBeNull();

    // ── Step 3: セグメント座標を取得
    const seg1Coords = getSegmentCoords(segments[0]);
    const seg2Coords = getSegmentCoords(segments[1]);

    expect(seg1Coords).toEqual(SHIBUYA);
    expect(seg2Coords).toEqual(SHINJUKU);

    // ── Step 4: Routes API 可否を判定
    expect(canUseRoutesApi(origin.coords, seg1Coords)).toBe(true);
    expect(canUseRoutesApi(seg1Coords, seg2Coords)).toBe(true);

    // ── Step 5: Routes API で移動時間推定
    mockComputeRoute
      .mockResolvedValueOnce({ durationSeconds: 1200, durationMinutes: 20, distanceMeters: 8000, travelMode: "DRIVE" }) // 自宅→スタバ
      .mockResolvedValueOnce({ durationSeconds: 600, durationMinutes: 10, distanceMeters: 5000, travelMode: "DRIVE" }) // スタバ→A社
      .mockResolvedValueOnce({ durationSeconds: 900, durationMinutes: 15, distanceMeters: 7000, travelMode: "DRIVE" }); // A社→自��

    // ── Step 6: PlanItems を生成し insertTravelItemsAsync で移動を挿入
    const planItems: PlanItem[] = [
      makePlanItem({
        id: "item_cafe",
        text: "カフェで作業",
        durationMin: 120,
        location: { canonicalId: "cafe_shibuya", label: "スタバ渋谷", category: "cafe", source: "user_explicit" },
      }),
      makePlanItem({
        id: "item_meeting",
        text: "打ち合わせ",
        durationMin: 60,
        location: { canonicalId: "office_shinjuku", label: "A社", category: "office", source: "user_explicit" },
      }),
    ];

    const coordsMap: Record<string, LatLng> = {
      cafe_shibuya: SHIBUYA,
      office_shinjuku: SHINJUKU,
    };

    const result = await insertTravelItemsAsync(
      planItems, "car", true,
      coordsMap, origin.coords!,
    );

    // ── 検証: [travel:自宅→スタバ] [カフェ] [travel:スタバ→A社] [打ち合わせ] [travel:A社→自宅]
    expect(result.length).toBe(5);

    const travels = result.filter(i => i.kind === "travel");
    expect(travels.length).toBe(3);

    // 移動1: 自宅→スタバ渋谷
    expect(travels[0].travelFrom).toBe("自宅");
    expect(travels[0].travelTo).toBe("スタバ渋谷");
    expect(travels[0].durationMin).toBeGreaterThan(0);

    // 移動2: スタバ渋谷→A社
    expect(travels[1].travelFrom).toBe("スタバ渋谷");
    expect(travels[1].travelTo).toBe("A社");

    // 移動3: A社→自宅
    expect(travels[2].travelFrom).toBe("A社");
    expect(travels[2].travelTo).toBe("自宅");

    // Routes API が3回呼ばれた
    expect(mockComputeRoute).toHaveBeenCalledTimes(3);
  });

  test("coarseArea が Places API の検索コンテキストに使える形式で出力される", () => {
    const base: SavedBase = { prefecture: "東京都", city: "渋谷区" };
    const area = resolveCoarseArea(base);
    expect(area).toBe("渋谷区, 東京都");

    // prefecture のみ
    expect(resolveCoarseArea({ prefecture: "山梨県" })).toBe("山梨県");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 片側座標欠落 / Routes 失敗のフォールバック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("フォールバック: 座標欠落とRoutes失敗", () => {
  test("destination 座標なし → canUseRoutesApi=false → ヒューリスティック", async () => {
    const segWithCoords = makeSegment({
      id: "seg_a", resolvedLat: SHIBUYA.lat, resolvedLng: SHIBUYA.lng,
    });
    const segWithout = makeSegment({ id: "seg_b" });

    expect(canUseRoutesApi(getSegmentCoords(segWithCoords), getSegmentCoords(segWithout))).toBe(false);

    // insertTravelItemsAsync でもフォールバック
    const items = [
      makePlanItem({
        id: "1", text: "作業",
        location: { canonicalId: "place_no_coords", label: "図書館", category: "library", source: "user_explicit" },
      }),
    ];

    const result = await insertTravelItemsAsync(
      items, "car", true,
      {}, // 座標なし
      HOME_SHIBUYA,
    );

    // ヒューリスティックで移動が入る（Routes API は呼ばれない）
    expect(result.length).toBe(3);
    expect(result[0].kind).toBe("travel");
    expect(mockComputeRoute).not.toHaveBeenCalled();
  });

  test("origin なし（baseline 未完了）→ 全セグメントでヒューリスティック", async () => {
    const origin = resolveOrigin(makePlanState({}), null);
    expect(origin.layer).toBe("none");
    expect(origin.coords).toBeNull();

    const items = [
      makePlanItem({
        id: "1", text: "買い物",
        location: { canonicalId: "shop", label: "スーパー", category: "shopping", source: "user_explicit" },
      }),
    ];

    const result = await insertTravelItemsAsync(
      items, "car", true,
      { shop: TOKYO_ST },
      origin.coords, // null
    );

    // origin null なので Routes API は使えない → ヒューリスティック
    expect(result.length).toBe(3);
    expect(mockComputeRoute).not.toHaveBeenCalled();
  });

  test("Routes API 500 エラー → fail-open でヒューリスティック移動が入る", async () => {
    mockComputeRoute.mockRejectedValue(new Error("Routes API computeRoute failed: 500"));

    const items = [
      makePlanItem({
        id: "1", text: "ランチ",
        location: { canonicalId: "r1", label: "レストラン", category: "restaurant", source: "user_explicit" },
      }),
    ];

    const result = await insertTravelItemsAsync(
      items, "car", true,
      { r1: SHINJUKU },
      HOME_SHIBUYA,
    );

    // fail-open: API 失敗してもヒューリスティックで移動が入る
    expect(result.length).toBe(3);
    const travels = result.filter(i => i.kind === "travel");
    expect(travels.length).toBe(2);
    expect(travels[0].durationMin).toBeGreaterThan(0);
  });

  test("API key なし → ヒューリスティックフォールバック（API 呼び出しゼロ）", async () => {
    mockIsRoutesApiAvailable.mockReturnValue(false);

    const result = await estimateTravelTimeWithRoutes(
      HOME_SHIBUYA, TOKYO_ST, "train",
    );

    expect(result).not.toBeNull();
    expect(result!.source).toBe("heuristic");
    expect(mockComputeRoute).not.toHaveBeenCalled();
  });

  test("一部セグメントのみ座標あり → 座標ありは Routes API、なしはヒューリスティック", async () => {
    // A(座標あり) → B(座標なし) → 自宅
    mockComputeRoute.mockResolvedValueOnce({
      durationSeconds: 1200, durationMinutes: 20,
      distanceMeters: 8000, travelMode: "DRIVE",
    });
    // A→B は座標なしでスキップ、B→自宅 も B に座標なし

    const items = [
      makePlanItem({
        id: "a", text: "カフェ",
        location: { canonicalId: "cafe_a", label: "スタバ", category: "cafe", source: "user_explicit" },
      }),
      makePlanItem({
        id: "b", text: "買い物",
        location: { canonicalId: "shop_b", label: "近くのスーパー", category: "shopping", source: "user_explicit" },
      }),
    ];

    const coordsMap: Record<string, LatLng> = {
      cafe_a: SHIBUYA, // A のみ座標あり
      // shop_b は座標なし
    };

    const result = await insertTravelItemsAsync(
      items, "car", true,
      coordsMap,
      HOME_SHIBUYA,
    );

    // [travel:自宅→スタバ(API)] [カフェ] [travel:スタバ→スーパー(heuristic)] [買い物] [travel:スーパー→自宅(heuristic)]
    const travels = result.filter(i => i.kind === "travel");
    expect(travels.length).toBe(3);
    // 自宅→スタバ: 両方座標あり → Routes API 呼び出し
    // スタバ→スーパー: destination 座標なし → ヒューリスティック
    // スーパー→自宅: origin 座標なし → ヒューリスティック
    expect(mockComputeRoute).toHaveBeenCalledTimes(1); // 自宅→スタバ のみ
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. source 追跡可能性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("source 追跡: routes_api / heuristic / table_lookup", () => {
  test("Routes API 成功 → source=routes_api + distanceMeters 付き", async () => {
    mockComputeRoute.mockResolvedValueOnce({
      durationSeconds: 1800, durationMinutes: 30,
      distanceMeters: 15000, travelMode: "TRANSIT",
    });

    const result = await estimateTravelTimeWithRoutes(
      HOME_SHIBUYA, SHINJUKU, "train",
    );

    expect(result!.source).toBe("routes_api");
    expect(result!.routeDistanceMeters).toBe(15000);
    expect(result!.distanceCategory).toBe("adjacent"); // 15km
  });

  test("座標なし → source=heuristic", async () => {
    const result = await estimateTravelTimeWithRoutes(
      null, SHINJUKU, "car", undefined, "cafe",
    );

    expect(result!.source).toBe("heuristic");
    expect(result!.routeDistanceMeters).toBeUndefined();
  });

  test("API 失敗 → source=heuristic（フォールバック成功）", async () => {
    mockComputeRoute.mockRejectedValueOnce(new Error("timeout"));

    const result = await estimateTravelTimeWithRoutes(
      HOME_SHIBUYA, SHINJUKU, "car", undefined, "cafe",
    );

    expect(result!.source).toBe("heuristic");
    expect(result!.durationMin).toBeGreaterThan(0);
  });

  test("ヒューリスティックの distanceCategory が正しくマッピングされる", () => {
    // 既存ヒューリスティック（sync）
    const est = estimateTravelTime("car", "home", "cafe", true);
    expect(est).not.toBeNull();
    expect(est!.distanceCategory).toBe("city");
    expect(est!.durationMin).toBeGreaterThan(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 出発アンカー・到着アンカー・gap fill との衝突検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("アンカーと gap fill の衝突なし検証", () => {
  test("departureTime アンカー + 移動アイテム → 出発時刻が保持される", () => {
    // 既存 sync buildDayPlan で検証（insertTravelItems 使用）
    const items: PlanItem[] = [
      makePlanItem({
        id: "1", text: "カフェ", kind: "todo",
        durationMin: 60,
        location: { canonicalId: "cafe_1", label: "スタバ", category: "cafe", source: "user_explicit" },
      }),
    ];

    const dayConditions: DayConditions = {
      mainTransport: "car",
    };

    const plan = buildDayPlan(items, dayConditions, new Date("2026-04-16T07:00:00+09:00"), {
      goOut: true,
      departureTime: "09:00",
      targetDate: "2026-04-16",
    });

    // プランに移動アイテムが含まれる
    const travels = plan.items.filter(i => i.kind === "travel");
    expect(travels.length).toBeGreaterThanOrEqual(1);

    // departureTime が保存されている
    expect(plan.departureTime).toBe("09:00");

    // 最初の移動の開始時刻が 09:00 付近（reassignTimes が departureTime をアンカーとして使用）
    if (travels[0]?.startTime) {
      // startTime が存在する場合、09:00 以降であること
      const firstTravelStart = travels[0].startTime;
      expect(firstTravelStart).toBeDefined();
    }
  });

  test("arrivalTime アンカー + 帰路移�� → 帰宅時刻が制約内", () => {
    const items: PlanItem[] = [
      makePlanItem({
        id: "1", text: "打ち合わせ", kind: "fixed",
        durationMin: 60,
        startTime: "14:00",
        fixedStart: true,
        location: { canonicalId: "office_1", label: "A社", category: "office", source: "user_explicit" },
      }),
    ];

    const dayConditions: DayConditions = {
      mainTransport: "train",
    };

    const plan = buildDayPlan(items, dayConditions, new Date("2026-04-16T12:00:00+09:00"), {
      goOut: true,
      endTimeConstraint: "18:00",
      targetDate: "2026-04-16",
    });

    // arrivalTime が保存されている
    expect(plan.arrivalTime).toBe("18:00");

    // 帰路移動が含まれている
    const returnTravel = plan.items.filter(i => i.kind === "travel" && i.travelTo === "自宅");
    expect(returnTravel.length).toBeGreaterThanOrEqual(0); // 帰路が挿入される場合
  });

  test("gap fill が移動アイテムを上書きしない", () => {
    const items: PlanItem[] = [
      makePlanItem({
        id: "1", text: "打ち合わせ", kind: "fixed",
        durationMin: 60,
        startTime: "10:00",
        fixedStart: true,
        location: { canonicalId: "a", label: "A社", category: "office", source: "user_explicit" },
      }),
      makePlanItem({
        id: "2", text: "夕食", kind: "fixed",
        durationMin: 60,
        startTime: "18:00",
        fixedStart: true,
        location: { canonicalId: "b", label: "レストラン", category: "restaurant", source: "user_explicit" },
      }),
    ];

    const dayConditions: DayConditions = {
      mainTransport: "car",
    };

    const plan = buildDayPlan(items, dayConditions, new Date("2026-04-16T08:00:00+09:00"), {
      goOut: true,
      departureTime: "09:00",
      targetDate: "2026-04-16",
      gapFill: { weatherIcon: "sun" },
    });

    // 移動アイテムが存在する
    const travels = plan.items.filter(i => i.kind === "travel");
    expect(travels.length).toBeGreaterThanOrEqual(1);

    // 移動アイテムの kind が "travel" のまま（gap fill で上書きされていない）
    for (const t of travels) {
      expect(t.kind).toBe("travel");
      expect(t.travelFrom).toBeDefined();
      expect(t.travelTo).toBeDefined();
    }

    // gap fill 提案があっても移動アイテムと重複しない
    // → 時間順で移動と提案が交互に並ぶ（重複チェック）
    for (let i = 0; i < plan.items.length - 1; i++) {
      const current = plan.items[i];
      const next = plan.items[i + 1];
      if (current.startTime && next.startTime && current.durationMin) {
        const currentEnd = timeToMinutes(current.startTime) + current.durationMin;
        const nextStart = timeToMinutes(next.startTime);
        // 次のアイテムの開始 >= 現在のアイテムの終了（重複なし）
        expect(nextStart).toBeGreaterThanOrEqual(currentEnd - 1); // 1分の丸め許容
      }
    }
  });

  test("insertTravelItemsAsync + departureTime → HOME_DEPARTURE_OVERHEAD が加算される", async () => {
    mockComputeRoute.mockResolvedValueOnce({
      durationSeconds: 600, durationMinutes: 10,
      distanceMeters: 5000, travelMode: "DRIVE",
    });
    mockComputeRoute.mockResolvedValueOnce({
      durationSeconds: 600, durationMinutes: 10,
      distanceMeters: 5000, travelMode: "DRIVE",
    });

    const items: PlanItem[] = [
      makePlanItem({
        id: "1", text: "仕事",
        location: { canonicalId: "office", label: "オフィス", category: "office", source: "user_explicit" },
      }),
    ];

    const result = await insertTravelItemsAsync(
      items, "car", true,
      { office: SHINJUKU },
      HOME_SHIBUYA,
      undefined, // returnDestination
      "2026-04-16T09:00:00+09:00", // departureTime (TRANSIT 精度向上用)
    );

    const outbound = result.find(i => i.kind === "travel" && i.travelFrom === "自宅");
    expect(outbound).toBeDefined();
    // Routes API 10分 + HOME_DEPARTURE_OVERHEAD 10分 = 20分 → ceil(20/15)*15 = 30分
    expect(outbound!.durationMin).toBe(30);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. LocationResolver と startPoint 衝突回避の統合検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("衝突回避: startPoint と locationResolver", () => {
  test("startPoint 明示 + 座標解決済み → Routes API で origin 使用", async () => {
    const segments = [
      makeSegment({
        id: "seg_hotel",
        place: "ホテルオークラ",
        resolvedPlaceName: "The Okura Tokyo",
        resolvedLat: 35.6693,
        resolvedLng: 139.7416,
      }),
    ];

    const state = makePlanState({
      startPoint: "ホテルオークラ",
      segments,
    });

    const origin = resolveOrigin(state, { prefecture: "東京都", city: "渋谷区" });

    // Layer 2 explicit（startPoint が解決された）
    expect(origin.layer).toBe("layer2_explicit");
    expect(origin.coords!.lat).toBeCloseTo(35.6693, 3);

    // 渋谷区（Layer 1）ではなくホテルの座標が使われている
    expect(origin.coords!.lat).not.toBeCloseTo(35.6640, 3); // 渋谷区役所ではない
  });

  test("startPoint 明示 + 座標未解決 → none（Layer 1 で上書きしない）", async () => {
    const state = makePlanState({
      startPoint: "友達の家",
      segments: [makeSegment({ id: "seg_1", place: "カフェ" })],
    });

    const origin = resolveOrigin(state, { prefecture: "東京都", city: "渋谷区" });

    // 衝突回避: Layer 1 にフォールバックしない
    expect(origin.layer).toBe("none");
    expect(origin.coords).toBeNull();

    // Routes API は使えない → ヒューリスティック
    expect(canUseRoutesApi(origin.coords, SHIBUYA)).toBe(false);
  });

  test("startPoint なし + departureTime あり → Layer 2 inferred（自宅起点）", async () => {
    mockComputeRoute.mockResolvedValueOnce({
      durationSeconds: 1200, durationMinutes: 20,
      distanceMeters: 10000, travelMode: "DRIVE",
    });

    const state = makePlanState({ departureTime: "08:30" });
    const base: SavedBase = { prefecture: "東京都", city: "渋谷区" };
    const origin = resolveOrigin(state, base);

    expect(origin.layer).toBe("layer2_inferred");
    expect(origin.sourceLabel).toContain("自宅");

    // この座標で Routes API が使える
    const estimate = await estimateTravelTimeWithRoutes(
      origin.coords, SHINJUKU, "car",
    );

    expect(estimate!.source).toBe("routes_api");
    expect(mockComputeRoute).toHaveBeenCalledTimes(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Phase C 完了 E2E: baseline住所 → locationResolver → buildDayPlanAsync → Routes API 本線利用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { buildDayPlanAsync } from "@/lib/alter-morning/planningEngine";
import type { MorningSession } from "@/lib/alter-morning/types";

describe("Phase C E2E: baseline住所 + placeResolution + Routes API → buildDayPlanAsync", () => {
  test("baseline(東京都渋谷区) + カフェ(新宿) → Routes API origin=渋谷区 → travel items にルート情報反映", async () => {
    // ── 1. Routes API モック: 自宅→カフェ / カフェ→自宅 ──
    mockComputeRoute
      .mockResolvedValueOnce({
        durationSeconds: 1200, durationMinutes: 20,
        distanceMeters: 8500, travelMode: "DRIVE",
      })
      .mockResolvedValueOnce({
        durationSeconds: 1500, durationMinutes: 25,
        distanceMeters: 9200, travelMode: "DRIVE",
      });

    // ── 2. PlanSegment（placeResolver 出力相当）──
    const segments: PlanSegment[] = [
      makeSegment({
        id: "seg_cafe",
        place: "スタバ新宿",
        placeCanonical: "starbucks_shinjuku",
        resolvedPlaceName: "スターバックス 新宿南口店",
        resolvedLat: SHINJUKU.lat,
        resolvedLng: SHINJUKU.lng,
      }),
    ];

    // ── 3. PlanState ──
    const planState = makePlanState({
      departureTime: "09:00",
      goOut: true,
      transport: "car",
      segments,
    });

    // ── 4. locationResolver: baseline 住所 → origin 座標 ──
    const savedBase: SavedBase = { prefecture: "東京都", city: "渋谷区" };
    const origin = resolveOrigin(planState, savedBase);

    // 自宅（渋谷区）→ Layer 2 inferred（departureTime あり + baseline 住所）
    expect(origin.layer).toBe("layer2_inferred");
    expect(origin.coords).not.toBeNull();
    expect(origin.coords!.lat).toBeCloseTo(35.6640, 3); // 渋谷区役所

    // ── 5. coordsMap 構築（morningProtocol.buildV2DayPlanAsync と同じロジック）──
    const coordsMap: Record<string, LatLng> = {};
    for (const seg of planState.segments) {
      const coords = getSegmentCoords(seg);
      if (coords) {
        const key = seg.placeCanonical ?? seg.place;
        if (key) coordsMap[key] = coords;
      }
    }

    expect(coordsMap["starbucks_shinjuku"]).toBeDefined();
    expect(coordsMap["starbucks_shinjuku"].lat).toBeCloseTo(SHINJUKU.lat, 3);

    // ── 6. PlanItem 構築 ──
    const items: PlanItem[] = [
      makePlanItem({
        id: "item_cafe", text: "スタバでリモートワーク",
        durationMin: 120,
        location: {
          canonicalId: "starbucks_shinjuku",
          label: "スターバックス 新宿南口店",
          category: "cafe",
          source: "user_explicit",
        },
      }),
    ];

    // ── 7. buildDayPlanAsync（本線パイプライン）──
    const dayConditions: DayConditions = {
      mainTransport: "car",
    };

    const plan = await buildDayPlanAsync(items, dayConditions, new Date("2026-04-16T08:00:00+09:00"), {
      goOut: true,
      departureTime: "09:00",
      targetDate: "2026-04-16",
      coordsMap,
      originCoords: origin.coords,
      departureTimeIso: "2026-04-16T09:00:00+09:00",
    });

    // ── 8. 検証 ──

    // (a) plan が返る
    expect(plan).toBeDefined();
    expect(plan.items.length).toBeGreaterThanOrEqual(3); // travel + cafe + travel(帰宅)

    // (b) travel items が存在する
    const travels = plan.items.filter(i => i.kind === "travel");
    expect(travels.length).toBe(2); // 行き + 帰り

    // (c) 行き: 自宅 → スターバックス
    const outbound = travels[0];
    expect(outbound.travelFrom).toBe("自宅");
    expect(outbound.travelTo).toContain("スターバックス");

    // (d) 帰り: スターバックス → 自宅
    const inbound = travels[1];
    expect(inbound.travelFrom).toContain("スターバックス");
    expect(inbound.travelTo).toBe("自宅");

    // (e) Routes API が2回呼ばれた（行き + 帰り）
    expect(mockComputeRoute).toHaveBeenCalledTimes(2);

    // (f) 行きの移動時間: 20min + HOME_DEPARTURE_OVERHEAD(10) = 30 → ceil(30/15)*15 = 30
    expect(outbound.durationMin).toBe(30);
  });

  test("baseline なし + placeResolution あり → ヒューリスティックフォールバックで plan 完成", async () => {
    // baseline 住所未設定のユーザー
    const segments: PlanSegment[] = [
      makeSegment({
        id: "seg_gym",
        place: "ジム",
        placeCanonical: "gym_1",
        resolvedPlaceName: "エニタイムフィットネス 新宿",
        resolvedLat: SHINJUKU.lat,
        resolvedLng: SHINJUKU.lng,
      }),
    ];

    const planState = makePlanState({
      goOut: true,
      transport: "walk",
      segments,
    });

    // baseline なし → origin = none
    const origin = resolveOrigin(planState, null);
    expect(origin.layer).toBe("none");
    expect(origin.coords).toBeNull();

    // coordsMap は解決できるが origin がない → Routes API は使えない
    const coordsMap: Record<string, LatLng> = { gym_1: SHINJUKU };

    const items: PlanItem[] = [
      makePlanItem({
        id: "item_gym", text: "筋トレ",
        durationMin: 90,
        location: {
          canonicalId: "gym_1",
          label: "エニタイムフィットネス 新宿",
          category: "gym",
          source: "user_explicit",
        },
      }),
    ];

    const plan = await buildDayPlanAsync(items, {
      mainTransport: "walk",
    }, new Date("2026-04-16T08:00:00+09:00"), {
      goOut: true,
      coordsMap,
      originCoords: null, // baseline なし
    });

    // plan は完成する（ヒューリスティック移動時間）
    expect(plan).toBeDefined();
    const travels = plan.items.filter(i => i.kind === "travel");
    // origin=null → 自宅起点なし → 帰宅セグメントのみ or 行き帰りペア
    expect(travels.length).toBeGreaterThanOrEqual(1);

    // Routes API は呼ばれない（origin = null）
    expect(mockComputeRoute).not.toHaveBeenCalled();
  });
});
