/**
 * Recommendation Intent Resolver テスト — W2-3 (CEO方針 2026-04-19)
 *
 * `resolveRecommendationIntent` が generic_place と独立した経路として動作することを検証。
 *   - anchor_proximity 戦略（anchorHint が segments で解決済み）
 *   - anchor_proximity 戦略（anchorHint を geocode で解決）
 *   - category_only 戦略（anchor なし → currentLocation / areaCoords フォールバック）
 *   - category 推論（categoryHint なし → activity から推論）
 *   - fail-open（API 未設定 / API エラー）
 *   - 候補 0 件 → low confidence
 *   - 勝手に確定しない（confidence ≤ medium）
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Places API モック
vi.mock("@/lib/alter-morning/placesApiClient", () => ({
  searchPlacesByText: vi.fn(),
  isPlacesApiAvailable: vi.fn(() => true),
}));

// Supabase キャッシュストアをモック
vi.mock("@/lib/alter-morning/placeCacheStore", () => ({
  readFromSupabase: vi.fn(() => Promise.resolve(null)),
  writeToSupabase: vi.fn(() => Promise.resolve()),
}));

// Web 検索モック（geocodeAreaLabel が使う）
vi.mock("@/lib/stargazer/perspectiveEngine", () => ({
  executeSearch: vi.fn(),
}));

import {
  resolveRecommendationIntent,
  clearPlaceCache,
} from "@/lib/alter-morning/placeResolver";
import { searchPlacesByText, isPlacesApiAvailable } from "@/lib/alter-morning/placesApiClient";
import type { PlanSegment } from "@/lib/alter-morning/planState";
import type { RecommendationIntent } from "@/lib/alter-morning/types";

const mockPlacesTextSearch = vi.mocked(searchPlacesByText);
const mockPlacesAvailable = vi.mocked(isPlacesApiAvailable);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixture helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

function makeIntent(overrides: Partial<RecommendationIntent> = {}): RecommendationIntent {
  return {
    source: "explicit_ask",
    originalQuery: "おすすめある？",
    strategy: "anchor_proximity",
    ...overrides,
  };
}

const SHIBUYA: { lat: number; lng: number } = { lat: 35.6640, lng: 139.6982 };
const SHINJUKU: { lat: number; lng: number } = { lat: 35.6896, lng: 139.7006 };

function mockPlaceHits(count: number, baseCoords = SHIBUYA) {
  // すべて半径内に収まる候補を返す
  const places = Array.from({ length: count }, (_, i) => ({
    id: `pid_${i}`,
    displayName: { text: `候補 ${i + 1}`, languageCode: "ja" },
    formattedAddress: `東京都渋谷区 ${i + 1}-${i + 1}`,
    location: { latitude: baseCoords.lat + 0.0001 * i, longitude: baseCoords.lng + 0.0001 * i },
    businessStatus: "OPERATIONAL",
  }));
  mockPlacesTextSearch.mockResolvedValue(places as any);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("W2-3 resolveRecommendationIntent", () => {
  beforeEach(() => {
    clearPlaceCache();
    vi.clearAllMocks();
    mockPlacesAvailable.mockReturnValue(true);
  });

  test("anchor_proximity: anchorHint が segments で解決済み → 候補を返す", async () => {
    mockPlaceHits(3);
    const intent = makeIntent({
      anchorHint: "サドヤ",
      categoryHint: "カフェ",
      originalQuery: "サドヤ近くおすすめある？",
    });
    const segments: PlanSegment[] = [
      makeSegment({
        id: "seg_anchor",
        place: "サドヤ",
        resolvedPlaceName: "サドヤワイナリー",
        resolvedLat: 35.6640,
        resolvedLng: 139.6982,
        resolutionConfidence: "high",
      }),
    ];

    const result = await resolveRecommendationIntent(intent, segments, {}, "ランチ");

    expect(result.strategyUsed).toBe("anchor_proximity");
    expect(result.candidates.length).toBe(3);
    expect(result.confidence).toBe("medium"); // 勝手に確定しない
    expect(result.bestCandidate?.name).toBe("候補 1");
    // 候補に recommendationSource / strategy が乗る
    expect(result.candidates[0].recommendationSource).toBe("explicit_ask");
    expect(result.candidates[0].strategy).toBe("anchor_proximity");
  });

  test("category_only: anchor なし + currentLocation あり → currentLocation を中心に検索", async () => {
    mockPlaceHits(2, SHINJUKU);
    const intent = makeIntent({
      categoryHint: "カフェ",
      originalQuery: "おすすめある？",
      strategy: "category_only",
    });

    const result = await resolveRecommendationIntent(
      intent,
      [],
      { currentLocation: SHINJUKU },
      "ランチ",
    );

    expect(result.strategyUsed).toBe("category_only");
    expect(result.candidates.length).toBe(2);
    expect(result.anchorCoords).toEqual(SHINJUKU);
  });

  test("category_only: anchor/currentLocation なし + areaCoords あり → areaCoords を中心に", async () => {
    mockPlaceHits(1);
    const intent = makeIntent({
      categoryHint: "カフェ",
      strategy: "category_only",
    });
    const result = await resolveRecommendationIntent(
      intent,
      [],
      { areaCoords: SHIBUYA, areaLabel: "渋谷区" },
    );

    expect(result.strategyUsed).toBe("category_only");
    expect(result.candidates.length).toBe(1);
    expect(result.anchorCoords).toEqual(SHIBUYA);
    expect(result.reason).toContain("渋谷区");
  });

  test("全フォールバック失敗 → low confidence + no_anchor reason", async () => {
    const intent = makeIntent({
      categoryHint: "カフェ",
      strategy: "category_only",
    });
    const result = await resolveRecommendationIntent(intent, [], {}, "ランチ");

    expect(result.confidence).toBe("low");
    expect(result.candidates.length).toBe(0);
    expect(result.reason).toContain("recommendation_no_anchor");
  });

  test("categoryHint なし + activity から category 推論（ランチ → レストラン）", async () => {
    mockPlaceHits(2);
    const intent = makeIntent({
      // categoryHint 未設定
      anchorHint: undefined,
      strategy: "category_only",
    });

    const result = await resolveRecommendationIntent(
      intent,
      [],
      { areaCoords: SHIBUYA, areaLabel: "渋谷" },
      "ランチ",
    );

    expect(result.candidates.length).toBe(2);
    expect(result.reason).toMatch(/category=レストラン/);
  });

  test("categoryHint なし + activity も推論不能 → low confidence + no_category reason", async () => {
    const intent = makeIntent({
      anchorHint: undefined,
      strategy: "category_only",
    });
    const result = await resolveRecommendationIntent(
      intent,
      [],
      { areaCoords: SHIBUYA },
      "何か色々",
    );

    expect(result.confidence).toBe("low");
    expect(result.reason).toContain("recommendation_no_category");
  });

  test("Places API 未設定 → low confidence + api_unavailable（fail-open）", async () => {
    mockPlacesAvailable.mockReturnValue(false);
    const intent = makeIntent({ categoryHint: "カフェ", anchorHint: "サドヤ" });
    const segments: PlanSegment[] = [
      makeSegment({
        id: "a",
        place: "サドヤ",
        resolvedPlaceName: "サドヤ",
        resolvedLat: 35.66,
        resolvedLng: 139.70,
        resolutionConfidence: "high",
      }),
    ];
    const result = await resolveRecommendationIntent(intent, segments, {});
    expect(result.confidence).toBe("low");
    expect(result.reason).toContain("recommendation_api_unavailable");
  });

  test("Places API エラー → low confidence + api_error（fail-open）", async () => {
    mockPlacesTextSearch.mockRejectedValue(new Error("timeout"));
    const intent = makeIntent({ categoryHint: "カフェ", anchorHint: "サドヤ" });
    const segments: PlanSegment[] = [
      makeSegment({
        id: "a",
        place: "サドヤ",
        resolvedPlaceName: "サドヤ",
        resolvedLat: 35.66,
        resolvedLng: 139.70,
        resolutionConfidence: "high",
      }),
    ];
    const result = await resolveRecommendationIntent(intent, segments, {});
    expect(result.confidence).toBe("low");
    expect(result.reason).toContain("recommendation_api_error");
  });

  test("候補 0 件 → low confidence + zero_candidate reason", async () => {
    mockPlacesTextSearch.mockResolvedValue([]);
    const intent = makeIntent({ categoryHint: "カフェ", anchorHint: "サドヤ" });
    const segments: PlanSegment[] = [
      makeSegment({
        id: "a",
        place: "サドヤ",
        resolvedPlaceName: "サドヤ",
        resolvedLat: 35.66,
        resolvedLng: 139.70,
        resolutionConfidence: "high",
      }),
    ];
    const result = await resolveRecommendationIntent(intent, segments, {});
    expect(result.confidence).toBe("low");
    expect(result.candidates.length).toBe(0);
  });

  test("勝手に確定しない: 候補複数あっても confidence ≤ medium", async () => {
    mockPlaceHits(5);
    const intent = makeIntent({ categoryHint: "カフェ", anchorHint: "サドヤ" });
    const segments: PlanSegment[] = [
      makeSegment({
        id: "a",
        place: "サドヤ",
        resolvedPlaceName: "サドヤ",
        resolvedLat: 35.66,
        resolvedLng: 139.70,
        resolutionConfidence: "high",
      }),
    ];
    const result = await resolveRecommendationIntent(intent, segments, {});
    expect(["low", "medium"]).toContain(result.confidence);
    expect(result.confidence).not.toBe("high");
    // Top 3 に絞られる
    expect(result.candidates.length).toBeLessThanOrEqual(3);
  });

  test("anchor が low confidence → fromSegments 経路ではなく geocode 経路に退行", async () => {
    // seg は anchor ラベル一致するが confidence が high でない → geocode フォールバック
    // geocode も失敗 → currentLocation フォールバック
    mockPlaceHits(2, SHINJUKU);
    const intent = makeIntent({
      anchorHint: "よくわからない場所",
      categoryHint: "カフェ",
    });
    const segments: PlanSegment[] = [
      makeSegment({
        id: "a",
        place: "よくわからない場所",
        resolvedPlaceName: "よくわからない場所",
        resolvedLat: 35.66,
        resolvedLng: 139.70,
        resolutionConfidence: "low",
      }),
    ];

    // geocodeAreaLabel は Places API を使うので空を返す
    mockPlacesTextSearch.mockResolvedValueOnce([]);  // geocode 試行 → 0 件
    mockPlacesTextSearch.mockResolvedValueOnce([    // 本検索 → 2 件
      {
        id: "pid_0",
        displayName: { text: "新宿カフェ1", languageCode: "ja" },
        formattedAddress: "東京都新宿区 1-1",
        location: { latitude: SHINJUKU.lat, longitude: SHINJUKU.lng },
        businessStatus: "OPERATIONAL",
      } as any,
      {
        id: "pid_1",
        displayName: { text: "新宿カフェ2", languageCode: "ja" },
        formattedAddress: "東京都新宿区 2-2",
        location: { latitude: SHINJUKU.lat + 0.0001, longitude: SHINJUKU.lng },
        businessStatus: "OPERATIONAL",
      } as any,
    ]);

    const result = await resolveRecommendationIntent(
      intent,
      segments,
      { currentLocation: SHINJUKU },
    );

    // 戦略は category_only（anchor 取れなかった）
    expect(result.strategyUsed).toBe("category_only");
    expect(result.anchorCoords).toEqual(SHINJUKU);
    expect(result.candidates.length).toBe(2);
  });

  test("qualityHint が検索クエリに混入される", async () => {
    mockPlaceHits(1);
    const intent = makeIntent({
      categoryHint: "カフェ",
      anchorHint: "サドヤ",
      qualityHint: "静かな",
    });
    const segments: PlanSegment[] = [
      makeSegment({
        id: "a",
        place: "サドヤ",
        resolvedPlaceName: "サドヤ",
        resolvedLat: 35.66,
        resolvedLng: 139.70,
        resolutionConfidence: "high",
      }),
    ];
    await resolveRecommendationIntent(intent, segments, {});
    // 最後の呼び出し（本検索）の textQuery に qualityHint が含まれる
    const lastCall = mockPlacesTextSearch.mock.calls[mockPlacesTextSearch.mock.calls.length - 1];
    expect(lastCall[0].textQuery).toContain("静かな");
    expect(lastCall[0].textQuery).toContain("カフェ");
  });
});
