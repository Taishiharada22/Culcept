/**
 * Location Resolver テスト — Phase C-3
 *
 * 3-layer location resolution のユニットテスト。
 * Layer 1 (Saved Base) / Layer 2 (Session Origin) / 統合優先順位 / 衝突回避を検証。
 */

import { describe, test, expect } from "vitest";
import {
  resolveLayer1,
  resolveLayer2,
  resolveOrigin,
  resolveEndpoint,
  getSegmentCoords,
  canUseRoutesApi,
  resolveCoarseArea,
  type SavedBase,
  type LatLng,
} from "@/lib/alter-morning/locationResolver";
import type { PlanState, PlanSegment } from "@/lib/alter-morning/planState";
import type { EndpointAnchor } from "@/lib/alter-morning/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: PlanState ファクトリ
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
    id: "seg_1",
    order: 1,
    activity: "ランチ",
    companions: [],
    status: "confirmed",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. resolveLayer1 — Saved Base
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveLayer1", () => {
  test("null base → none", () => {
    const result = resolveLayer1(null);
    expect(result.layer).toBe("none");
    expect(result.coords).toBeNull();
  });

  test("prefecture のみ → layer1_prefecture + 県庁所在地座標", () => {
    const result = resolveLayer1({ prefecture: "東京都" });
    expect(result.layer).toBe("layer1_prefecture");
    expect(result.coords).not.toBeNull();
    expect(result.coords!.lat).toBeCloseTo(35.6762, 2);
    expect(result.coords!.lng).toBeCloseTo(139.6503, 2);
    expect(result.sourceLabel).toBe("東京都");
  });

  test("prefecture + city（収録済み）→ layer1_city + 市区町村レベル座標", () => {
    const result = resolveLayer1({ prefecture: "東京都", city: "渋谷区" });
    expect(result.layer).toBe("layer1_city");
    expect(result.coords).not.toBeNull();
    // 渋谷区の座標 ≠ 都庁の座標（35.6762）— 市区町村レベルで解決されている
    expect(result.coords!.lat).toBeCloseTo(35.6640, 2);
    expect(result.coords!.lng).toBeCloseTo(139.6982, 2);
    expect(result.sourceLabel).toBe("東京都渋谷区");
  });

  test("prefecture + city（未収録）→ layer1_city + 県庁フォールバック", () => {
    const result = resolveLayer1({ prefecture: "東京都", city: "あきる野市" });
    expect(result.layer).toBe("layer1_city");
    expect(result.coords).not.toBeNull();
    // 未収録 → 都庁座標にフォールバック
    expect(result.coords!.lat).toBeCloseTo(35.6762, 2);
    expect(result.sourceLabel).toBe("東京都あきる野市");
  });

  test("不明な prefecture → none", () => {
    const result = resolveLayer1({ prefecture: "アトランティス" });
    expect(result.layer).toBe("none");
    expect(result.coords).toBeNull();
  });

  test("山梨県 → 甲府の座標", () => {
    const result = resolveLayer1({ prefecture: "山梨県" });
    expect(result.layer).toBe("layer1_prefecture");
    expect(result.coords!.lat).toBeCloseTo(35.6642, 2);
  });

  test("渋谷区 と 八王子市 は異なる座標を返す", () => {
    const shibuya = resolveLayer1({ prefecture: "東京都", city: "渋谷区" });
    const hachioji = resolveLayer1({ prefecture: "東京都", city: "八王子市" });
    expect(shibuya.coords).not.toBeNull();
    expect(hachioji.coords).not.toBeNull();
    // 渋谷区(139.70) vs 八王子市(139.32) — 経度が明確に異なる
    expect(Math.abs(shibuya.coords!.lng - hachioji.coords!.lng)).toBeGreaterThan(0.3);
  });

  test("大阪市北区 → 市区町村レベル座標", () => {
    const result = resolveLayer1({ prefecture: "大阪府", city: "大阪市北区" });
    expect(result.layer).toBe("layer1_city");
    expect(result.coords!.lat).toBeCloseTo(34.7055, 2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. resolveLayer2 — Session Origin
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveLayer2", () => {
  const layer1Tokyo = resolveLayer1({ prefecture: "東京都", city: "渋谷区" });

  test("startPoint あり + セグメントに座標あり → layer2_explicit", () => {
    const state = makePlanState({
      startPoint: "ホテルオークラ",
      segments: [
        makeSegment({
          place: "ホテルオークラ",
          resolvedPlaceName: "The Okura Tokyo",
          resolvedLat: 35.6693,
          resolvedLng: 139.7416,
        }),
      ],
    });
    const result = resolveLayer2(state, layer1Tokyo);
    expect(result).not.toBeNull();
    expect(result!.layer).toBe("layer2_explicit");
    expect(result!.coords!.lat).toBeCloseTo(35.6693, 4);
    expect(result!.sourceLabel).toBe("ホテルオークラ");
  });

  test("startPoint あり + 座標なし → null（Layer 1 フォールバック禁止）", () => {
    const state = makePlanState({
      startPoint: "会社",
      segments: [makeSegment({ place: "レストラン" })],
    });
    const result = resolveLayer2(state, layer1Tokyo);
    expect(result).toBeNull();
  });

  test("departureTime あり + Layer 1 座標あり → layer2_inferred（自宅）", () => {
    const state = makePlanState({ departureTime: "08:00" });
    const result = resolveLayer2(state, layer1Tokyo);
    expect(result).not.toBeNull();
    expect(result!.layer).toBe("layer2_inferred");
    expect(result!.coords).toEqual(layer1Tokyo.coords);
    expect(result!.sourceLabel).toContain("自宅");
  });

  test("departureTime あり + Layer 1 座標なし → null", () => {
    const state = makePlanState({ departureTime: "08:00" });
    const layer1None = resolveLayer1(null);
    const result = resolveLayer2(state, layer1None);
    expect(result).toBeNull();
  });

  test("startPoint も departureTime もなし → null", () => {
    const state = makePlanState({});
    const result = resolveLayer2(state, layer1Tokyo);
    expect(result).toBeNull();
  });

  test("startPoint 部分一致: 「スタバ」→ 「スターバックスコーヒー渋谷店」", () => {
    const state = makePlanState({
      startPoint: "スタバ",
      segments: [
        makeSegment({
          place: "スタバ",
          resolvedPlaceName: "スターバックスコーヒー渋谷店",
          resolvedLat: 35.6592,
          resolvedLng: 139.7006,
        }),
      ],
    });
    const result = resolveLayer2(state, layer1Tokyo);
    expect(result).not.toBeNull();
    expect(result!.layer).toBe("layer2_explicit");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. resolveOrigin — 統合優先順位
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveOrigin", () => {
  const base: SavedBase = { prefecture: "東京都", city: "渋谷区" };

  test("Layer 2 explicit > Layer 1", () => {
    const state = makePlanState({
      startPoint: "ホテル",
      segments: [
        makeSegment({
          place: "ホテル",
          resolvedPlaceName: "ホテル東京",
          resolvedLat: 35.68,
          resolvedLng: 139.76,
        }),
      ],
    });
    const result = resolveOrigin(state, base);
    expect(result.layer).toBe("layer2_explicit");
    expect(result.coords!.lat).toBeCloseTo(35.68, 2);
  });

  test("Layer 2 inferred (departureTime + 自宅)", () => {
    const state = makePlanState({ departureTime: "09:00" });
    const result = resolveOrigin(state, base);
    expect(result.layer).toBe("layer2_inferred");
  });

  test("Layer 1 フォールバック（startPoint も departureTime もなし）", () => {
    const state = makePlanState({});
    const result = resolveOrigin(state, base);
    expect(result.layer).toBe("layer1_city");
    expect(result.coords).not.toBeNull();
  });

  test("衝突回避: startPoint あり + 座標未解決 → none（Layer 1 で上書きしない）", () => {
    const state = makePlanState({
      startPoint: "会社",
      segments: [makeSegment({ place: "カフェ" })],
    });
    const result = resolveOrigin(state, base);
    expect(result.layer).toBe("none");
    expect(result.coords).toBeNull();
    expect(result.sourceLabel).toBe("会社");
  });

  test("baseline 未完了 → none", () => {
    const state = makePlanState({});
    const result = resolveOrigin(state, null);
    expect(result.layer).toBe("none");
    expect(result.coords).toBeNull();
  });

  test("prefecture のみ（city なし）→ layer1_prefecture", () => {
    const state = makePlanState({});
    const result = resolveOrigin(state, { prefecture: "大阪府" });
    expect(result.layer).toBe("layer1_prefecture");
    expect(result.sourceLabel).toBe("大阪府");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. getSegmentCoords
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getSegmentCoords", () => {
  test("座標あり → LatLng", () => {
    const seg = makeSegment({ resolvedLat: 35.68, resolvedLng: 139.76 });
    const coords = getSegmentCoords(seg);
    expect(coords).toEqual({ lat: 35.68, lng: 139.76 });
  });

  test("座標なし → null", () => {
    const seg = makeSegment({});
    expect(getSegmentCoords(seg)).toBeNull();
  });

  test("lat のみ（lng なし） → null", () => {
    const seg = makeSegment({ resolvedLat: 35.68 });
    expect(getSegmentCoords(seg)).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. canUseRoutesApi
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("canUseRoutesApi", () => {
  const kofu: LatLng = { lat: 35.66, lng: 138.57 };
  const tokyo: LatLng = { lat: 35.68, lng: 139.65 };

  test("両方あり → true", () => {
    expect(canUseRoutesApi(kofu, tokyo)).toBe(true);
  });

  test("origin null → false", () => {
    expect(canUseRoutesApi(null, tokyo)).toBe(false);
  });

  test("destination null → false", () => {
    expect(canUseRoutesApi(kofu, null)).toBe(false);
  });

  test("両方 null → false", () => {
    expect(canUseRoutesApi(null, null)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. resolveCoarseArea
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveCoarseArea", () => {
  test("prefecture + city → 「市, 県」", () => {
    expect(resolveCoarseArea({ prefecture: "東京都", city: "渋谷区" }))
      .toBe("渋谷区, 東京都");
  });

  test("prefecture のみ → 県名", () => {
    expect(resolveCoarseArea({ prefecture: "山梨県" })).toBe("山梨県");
  });

  test("null → undefined", () => {
    expect(resolveCoarseArea(null)).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. Bug 6+1 (CEO方針 2026-04-18): 4層 origin 優先順位
//    explicit startPoint > currentLocation > todayOrigin > baseline home
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Bug 6+1 (2026-04-18): 4層 origin 優先順位", () => {
  const BASELINE: SavedBase = { prefecture: "山梨県", city: "甲府市" };
  const HOTEL_COORDS: LatLng = { lat: 35.6895, lng: 139.6917 }; // 東京
  const OFFICE_COORDS: LatLng = { lat: 35.6586, lng: 139.7454 };

  test("explicit startPoint（解決済み）は currentLocation / todayOrigin / baseline より優先", () => {
    const planState = makePlanState({
      startPoint: "ホテル",
      segments: [
        makeSegment({
          place: "ホテル",
          resolvedPlaceName: "ホテルオークラ東京",
          resolvedLat: HOTEL_COORDS.lat,
          resolvedLng: HOTEL_COORDS.lng,
        }),
      ],
      currentLocation: { label: "オフィス", coords: OFFICE_COORDS, source: "gps" },
      todayOrigin: { label: "別の場所", coords: { lat: 35.7, lng: 139.7 }, source: "user_declared" },
    });
    const result = resolveOrigin(planState, BASELINE);
    expect(result.layer).toBe("layer2_explicit");
    expect(result.coords).toEqual(HOTEL_COORDS);
  });

  test("explicit startPoint（未解決）→ null 返却（下位に退かない）", () => {
    // startPoint="会社" に対応する resolvedPlaceName="会社..." を持つセグメント無し
    const planState = makePlanState({
      startPoint: "会社",  // 座標未解決
      segments: [makeSegment({
        place: "カフェ",
        resolvedPlaceName: "ブルーボトルコーヒー",
        resolvedLat: 35.6,
        resolvedLng: 139.6,
      })],
      currentLocation: { label: "オフィス", coords: OFFICE_COORDS, source: "gps" },
      todayOrigin: { label: "ホテル", coords: HOTEL_COORDS, source: "user_declared" },
    });
    const result = resolveOrigin(planState, BASELINE);
    expect(result.layer).toBe("none");
    expect(result.coords).toBeNull();
    expect(result.sourceLabel).toBe("会社");
  });

  test("startPoint なし + currentLocation あり → current_location が勝つ", () => {
    const planState = makePlanState({
      currentLocation: { label: "現在地", coords: OFFICE_COORDS, source: "gps" },
      todayOrigin: { label: "ホテル", coords: HOTEL_COORDS, source: "user_declared" },
    });
    const result = resolveOrigin(planState, BASELINE);
    expect(result.layer).toBe("current_location");
    expect(result.coords).toEqual(OFFICE_COORDS);
  });

  test("startPoint なし + currentLocation なし + todayOrigin あり → today_origin が勝つ", () => {
    const planState = makePlanState({
      todayOrigin: { label: "ホテル", coords: HOTEL_COORDS, source: "user_declared" },
    });
    const result = resolveOrigin(planState, BASELINE);
    expect(result.layer).toBe("today_origin");
    expect(result.coords).toEqual(HOTEL_COORDS);
    expect(result.sourceLabel).toBe("ホテル");
  });

  test("todayOrigin は baseline home より優先される（Bug 6 の核）", () => {
    // 実機ケース: 甲府 baseline のユーザーが東京のホテル滞在中。
    // startPoint 落ちても todayOrigin が甲府座標への退避を防ぐ。
    const planState = makePlanState({
      todayOrigin: { label: "ホテルオークラ", coords: HOTEL_COORDS, source: "user_declared" },
    });
    const result = resolveOrigin(planState, BASELINE);
    expect(result.coords).toEqual(HOTEL_COORDS);
    expect(result.layer).not.toBe("layer1_city");
    expect(result.layer).not.toBe("layer1_prefecture");
  });

  test("startPoint なし + departureTime + baseline あり → layer2_inferred（既存挙動保持）", () => {
    const planState = makePlanState({
      departureTime: "08:00",
    });
    const result = resolveOrigin(planState, BASELINE);
    expect(result.layer).toBe("layer2_inferred");
    expect(result.coords).not.toBeNull();
  });

  test("何もなし → baseline home にフォールバック（最終フォールバック）", () => {
    const planState = makePlanState({});
    const result = resolveOrigin(planState, BASELINE);
    expect(result.layer).toBe("layer1_city");
    expect(result.coords).not.toBeNull();
  });

  test("startPoint 未解決 + todayOrigin あり でも null を返す（勝手に上書き禁止）", () => {
    // CEO方針: 明示意図 > 過去の起点。startPoint=「会社」の意図を
    // 前セッションの todayOrigin（ホテル）で上書きしない。
    const planState = makePlanState({
      startPoint: "会社",  // 未解決（対応セグメントなし）
      todayOrigin: { label: "ホテル", coords: HOTEL_COORDS, source: "user_declared" },
    });
    const result = resolveOrigin(planState, BASELINE);
    expect(result.layer).toBe("none");
    expect(result.coords).toBeNull();
    expect(result.sourceLabel).toBe("会社");
  });

  test("currentLocation.coords が欠けている場合はスキップ → todayOrigin に降りる", () => {
    const planState = makePlanState({
      currentLocation: { label: "推定位置", source: "recent_segment" }, // coords なし
      todayOrigin: { label: "ホテル", coords: HOTEL_COORDS, source: "user_declared" },
    });
    const result = resolveOrigin(planState, BASELINE);
    expect(result.layer).toBe("today_origin");
    expect(result.coords).toEqual(HOTEL_COORDS);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. W2-2 (CEO方針 2026-04-19): Endpoint 優先順位
//    endpointAnchor > endAction/endpointType=home > baseline home
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("W2-2 (2026-04-19): resolveEndpoint 終点優先順位", () => {
  const BASELINE_TOKYO: SavedBase = { prefecture: "東京都", city: "渋谷区" };
  const HOTEL_COORDS: LatLng = { lat: 35.6693, lng: 139.7416 }; // ホテルオークラ相当
  const FRIEND_COORDS: LatLng = { lat: 35.7000, lng: 139.7500 };

  test("endpointAnchor が segments で解決済み → endpoint_anchor_resolved", () => {
    const endpointAnchor: EndpointAnchor = {
      type: "hotel",
      label: "ホテルオークラ",
      needsAreaConfirm: false,
    };
    const planState = makePlanState({
      segments: [
        makeSegment({
          place: "ホテルオークラ",
          resolvedPlaceName: "ホテルオークラ東京",
          resolvedLat: HOTEL_COORDS.lat,
          resolvedLng: HOTEL_COORDS.lng,
        }),
      ],
    });
    const result = resolveEndpoint(planState, endpointAnchor, BASELINE_TOKYO);
    expect(result.source).toBe("endpoint_anchor_resolved");
    expect(result.label).toBe("ホテルオークラ");
    expect(result.coords).toEqual(HOTEL_COORDS);
  });

  test("endpointAnchor canonicalId で解決", () => {
    const endpointAnchor: EndpointAnchor = {
      type: "friend_home",
      label: "田中さん家",
      canonicalId: "friend_tanaka_home",
      needsAreaConfirm: false,
    };
    const planState = makePlanState({
      segments: [
        makeSegment({
          place: "田中さん家",
          placeCanonical: "friend_tanaka_home",
          resolvedLat: FRIEND_COORDS.lat,
          resolvedLng: FRIEND_COORDS.lng,
        }),
      ],
    });
    const result = resolveEndpoint(planState, endpointAnchor, BASELINE_TOKYO);
    expect(result.source).toBe("endpoint_anchor_resolved");
    expect(result.coords).toEqual(FRIEND_COORDS);
  });

  test("endpointAnchor type=home、未解決 → baseline home にフォールバック (endpoint_anchor_home)", () => {
    const endpointAnchor: EndpointAnchor = {
      type: "home",
      label: "家",
      needsAreaConfirm: false,
    };
    const planState = makePlanState({});
    const result = resolveEndpoint(planState, endpointAnchor, BASELINE_TOKYO);
    expect(result.source).toBe("endpoint_anchor_home");
    expect(result.coords).not.toBeNull();
    // 渋谷区の座標が返る
    expect(result.coords!.lat).toBeCloseTo(35.6640, 2);
  });

  test("endpointAnchor 未解決 + type ≠ home → label のみ (endpoint_anchor_label_only)", () => {
    const endpointAnchor: EndpointAnchor = {
      type: "other",
      label: "どこか知らない場所",
      needsAreaConfirm: true,
    };
    const planState = makePlanState({});
    const result = resolveEndpoint(planState, endpointAnchor, BASELINE_TOKYO);
    expect(result.source).toBe("endpoint_anchor_label_only");
    expect(result.label).toBe("どこか知らない場所");
    expect(result.coords).toBeNull();
  });

  test("endpointAnchor なし + endAction='帰宅' → end_action_home", () => {
    const planState = makePlanState({ endAction: "帰宅" } as any);
    const result = resolveEndpoint(planState, undefined, BASELINE_TOKYO);
    expect(result.source).toBe("end_action_home");
    expect(result.label).toBe("自宅");
    expect(result.coords).not.toBeNull();
  });

  test("endpointAnchor なし + endpointType='home' → end_action_home", () => {
    const planState = makePlanState({ endpointType: "home" } as any);
    const result = resolveEndpoint(planState, undefined, BASELINE_TOKYO);
    expect(result.source).toBe("end_action_home");
    expect(result.coords).not.toBeNull();
  });

  test("endpointAnchor / endAction なし + baseline あり → baseline_home (implicit 帰宅)", () => {
    const planState = makePlanState({});
    const result = resolveEndpoint(planState, undefined, BASELINE_TOKYO);
    expect(result.source).toBe("baseline_home");
    expect(result.label).toBe("自宅");
    expect(result.coords).not.toBeNull();
  });

  test("baseline 未設定 + endpointAnchor なし → none", () => {
    const planState = makePlanState({});
    const result = resolveEndpoint(planState, undefined, null);
    expect(result.source).toBe("none");
    expect(result.coords).toBeNull();
  });

  test("endpointAnchor type=home + baseline 未設定 → label_only（coords なし）", () => {
    // home フォールバックの元座標がないため、label のみ
    const endpointAnchor: EndpointAnchor = {
      type: "home",
      label: "家",
      needsAreaConfirm: false,
    };
    const planState = makePlanState({});
    const result = resolveEndpoint(planState, endpointAnchor, null);
    expect(result.source).toBe("endpoint_anchor_label_only");
    expect(result.coords).toBeNull();
  });

  test("endpointAnchor は endAction より優先（CEO ケース2: 終点把握）", () => {
    // endAction=帰宅 でも endpointAnchor=hotel があればホテルに戻る
    const endpointAnchor: EndpointAnchor = {
      type: "hotel",
      label: "ホテルオークラ",
      needsAreaConfirm: false,
    };
    const planState = makePlanState({
      endAction: "帰宅",
      segments: [
        makeSegment({
          place: "ホテルオークラ",
          resolvedLat: HOTEL_COORDS.lat,
          resolvedLng: HOTEL_COORDS.lng,
        }),
      ],
    } as any);
    const result = resolveEndpoint(planState, endpointAnchor, BASELINE_TOKYO);
    expect(result.source).toBe("endpoint_anchor_resolved");
    expect(result.coords).toEqual(HOTEL_COORDS);
  });
});
