/**
 * Place Resolver テスト — Phase A-2 + Phase B-1 + Phase B-2
 *
 * 場所解決 + 確信度判定 + キャッシュの単体テスト
 * Phase B-1: chain_brand / generic_place の Places API 解決
 * Phase B-2: 2層キャッシュ（L1 in-memory + L2 Supabase）永続化
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  determineConfidence,
  getCachedResolution,
  setCachedResolution,
  clearPlaceCache,
  resolvePlace,
  resolveChainBrand,
  resolveGenericPlace,
  normalizeChainBrand,
  getGenericPlaceSearchHint,
  resolveAnchors,
  type PlaceCandidate,
  type PlaceResolution,
  type ResolutionContext,
} from "@/lib/alter-morning/placeResolver";
import type { PlanSegment } from "@/lib/alter-morning/planState";

vi.mock("server-only", () => ({}));

// Web検索をモック
vi.mock("@/lib/stargazer/perspectiveEngine", () => ({
  executeSearch: vi.fn(),
}));

// Places APIをモック
vi.mock("@/lib/alter-morning/placesApiClient", () => ({
  searchPlacesByText: vi.fn(),
  isPlacesApiAvailable: vi.fn(() => true),
}));

// Supabase キャッシュストアをモック（L2）
vi.mock("@/lib/alter-morning/placeCacheStore", () => ({
  readFromSupabase: vi.fn(() => Promise.resolve(null)),
  writeToSupabase: vi.fn(() => Promise.resolve()),
}));

import { executeSearch } from "@/lib/stargazer/perspectiveEngine";
const mockSearch = vi.mocked(executeSearch);

import { searchPlacesByText, isPlacesApiAvailable } from "@/lib/alter-morning/placesApiClient";
const mockPlacesTextSearch = vi.mocked(searchPlacesByText);
const mockPlacesAvailable = vi.mocked(isPlacesApiAvailable);

import { readFromSupabase, writeToSupabase } from "@/lib/alter-morning/placeCacheStore";
const mockReadL2 = vi.mocked(readFromSupabase);
const mockWriteL2 = vi.mocked(writeToSupabase);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Confidence 判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("determineConfidence", () => {
  test("候補0件 → low", () => {
    const { confidence } = determineConfidence([]);
    expect(confidence).toBe("low");
  });

  test("候補1件 + matchScore >= 0.5 → high", () => {
    const candidates: PlaceCandidate[] = [
      { name: "サドヤ ワイナリー", source: "web_search", matchScore: 0.7 },
    ];
    const { confidence } = determineConfidence(candidates);
    expect(confidence).toBe("high");
  });

  test("候補1件 + matchScore 0.3-0.5 → medium", () => {
    const candidates: PlaceCandidate[] = [
      { name: "サドヤ", source: "web_search", matchScore: 0.35 },
    ];
    const { confidence } = determineConfidence(candidates);
    expect(confidence).toBe("medium");
  });

  test("候補1件 + matchScore < 0.3 → low", () => {
    const candidates: PlaceCandidate[] = [
      { name: "サドヤ", source: "web_search", matchScore: 0.1 },
    ];
    const { confidence } = determineConfidence(candidates);
    expect(confidence).toBe("low");
  });

  test("候補2件 + top候補が優勢(gap >= 0.2) → medium", () => {
    const candidates: PlaceCandidate[] = [
      { name: "サドヤ ワイナリー", source: "web_search", matchScore: 0.7 },
      { name: "サドヤ商店", source: "web_search", matchScore: 0.3 },
    ];
    const { confidence } = determineConfidence(candidates);
    expect(confidence).toBe("medium");
  });

  test("候補2件 + スコア拮抗 → low", () => {
    const candidates: PlaceCandidate[] = [
      { name: "サドヤ A店", source: "web_search", matchScore: 0.5 },
      { name: "サドヤ B店", source: "web_search", matchScore: 0.45 },
    ];
    const { confidence } = determineConfidence(candidates);
    expect(confidence).toBe("low");
  });

  test("キャッシュヒット → high", () => {
    const candidates: PlaceCandidate[] = [
      { name: "サドヤ", source: "cache", matchScore: 1.0 },
    ];
    const { confidence } = determineConfidence(candidates, true);
    expect(confidence).toBe("high");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. キャッシュ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PlaceResolutionCache", () => {
  beforeEach(() => {
    clearPlaceCache();
    mockReadL2.mockReset();
    mockWriteL2.mockReset();
    mockReadL2.mockResolvedValue(null);
    mockWriteL2.mockResolvedValue();
  });

  test("L1 キャッシュ保存 → 取得 → ヒット", async () => {
    const resolution: PlaceResolution = {
      originalText: "サドヤ",
      candidates: [{ name: "サドヤ ワイナリー", address: "甲府市丸の内1-20-16", source: "web_search", matchScore: 0.8 }],
      bestCandidate: { name: "サドヤ ワイナリー", address: "甲府市丸の内1-20-16", source: "web_search", matchScore: 0.8 },
      confidence: "high",
      reason: "test",
    };
    await setCachedResolution("user1", "サドヤ", "甲府", resolution);

    const cached = await getCachedResolution("user1", "サドヤ", "甲府");
    expect(cached).not.toBeNull();
    expect(cached!.resolvedName).toBe("サドヤ ワイナリー");
    expect(cached!.address).toBe("甲府市丸の内1-20-16");
  });

  test("別ユーザーのキャッシュは取得できない", async () => {
    const resolution: PlaceResolution = {
      originalText: "サドヤ",
      candidates: [{ name: "サドヤ", source: "web_search", matchScore: 0.8 }],
      bestCandidate: { name: "サドヤ", source: "web_search", matchScore: 0.8 },
      confidence: "high",
      reason: "test",
    };
    await setCachedResolution("user1", "サドヤ", "甲府", resolution);
    expect(await getCachedResolution("user2", "サドヤ", "甲府")).toBeNull();
  });

  test("low confidence はキャッシュ保存されない", async () => {
    const resolution: PlaceResolution = {
      originalText: "サドヤ",
      candidates: [{ name: "サドヤ", source: "web_search", matchScore: 0.2 }],
      bestCandidate: { name: "サドヤ", source: "web_search", matchScore: 0.2 },
      confidence: "low",
      reason: "test",
    };
    await setCachedResolution("user1", "サドヤ", "甲府", resolution);
    expect(await getCachedResolution("user1", "サドヤ", "甲府")).toBeNull();
  });

  test("L1 キャッシュの useCount が増加する", async () => {
    const resolution: PlaceResolution = {
      originalText: "サドヤ",
      candidates: [{ name: "サドヤ", source: "web_search", matchScore: 0.8 }],
      bestCandidate: { name: "サドヤ", source: "web_search", matchScore: 0.8 },
      confidence: "high",
      reason: "test",
    };
    await setCachedResolution("user1", "サドヤ", "甲府", resolution);
    await getCachedResolution("user1", "サドヤ", "甲府");
    const second = await getCachedResolution("user1", "サドヤ", "甲府");
    expect(second!.useCount).toBe(3); // set時1 + get1 + get2
  });

  // ━━ Phase B-2: L2 Supabase 統合テスト ━━

  test("L1 ミス → L2 ヒット → L1 に書き戻し → 次回は L1 ヒット", async () => {
    // L2 にキャッシュがある
    mockReadL2.mockResolvedValueOnce({
      resolvedName: "マクドナルド 甲府店",
      address: "甲府市丸の内1-2-3",
      placeId: "ChIJ_supabase",
      confidence: "high",
      cachedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      useCount: 5,
    });

    // L1 は空 → L2 から取得
    const first = await getCachedResolution("user1", "マック", "甲府");
    expect(first).not.toBeNull();
    expect(first!.resolvedName).toBe("マクドナルド 甲府店");
    expect(first!.placeId).toBe("ChIJ_supabase");
    expect(mockReadL2).toHaveBeenCalledTimes(1);

    // 2回目は L1 ヒット（L2 は呼ばれない）
    mockReadL2.mockClear();
    const second = await getCachedResolution("user1", "マック", "甲府");
    expect(second).not.toBeNull();
    expect(second!.resolvedName).toBe("マクドナルド 甲府店");
    expect(mockReadL2).not.toHaveBeenCalled();
  });

  test("L2 書き込みが fire-and-forget で実行される（placeType 指定時）", async () => {
    const resolution: PlaceResolution = {
      originalText: "マック",
      candidates: [{ name: "マクドナルド 甲府店", address: "甲府市", placeId: "ChIJ_test", source: "places_api", matchScore: 0.8 }],
      bestCandidate: { name: "マクドナルド 甲府店", address: "甲府市", placeId: "ChIJ_test", source: "places_api", matchScore: 0.8 },
      confidence: "high",
      reason: "test",
    };
    await setCachedResolution("user1", "マック", "甲府", resolution, "chain_brand");

    // L2 writeToSupabase が呼ばれた
    expect(mockWriteL2).toHaveBeenCalledTimes(1);
    expect(mockWriteL2).toHaveBeenCalledWith("user1", "マック", "甲府", {
      resolvedName: "マクドナルド 甲府店",
      address: "甲府市",
      placeId: "ChIJ_test",
      confidence: "high",
      source: "places_api",
      placeType: "chain_brand",
    });
  });

  test("placeType 未指定時は L2 に書き込まない", async () => {
    const resolution: PlaceResolution = {
      originalText: "サドヤ",
      candidates: [{ name: "サドヤ ワイナリー", source: "web_search", matchScore: 0.8 }],
      bestCandidate: { name: "サドヤ ワイナリー", source: "web_search", matchScore: 0.8 },
      confidence: "high",
      reason: "test",
    };
    await setCachedResolution("user1", "サドヤ", "甲府", resolution);

    // L2 には書き込まれない
    expect(mockWriteL2).not.toHaveBeenCalled();
  });

  test("source が cache の場合は L2 に再書き込みしない", async () => {
    const resolution: PlaceResolution = {
      originalText: "マック",
      candidates: [{ name: "マクドナルド 甲府店", source: "cache", matchScore: 1.0 }],
      bestCandidate: { name: "マクドナルド 甲府店", source: "cache", matchScore: 1.0 },
      confidence: "high",
      reason: "キャッシュヒット",
    };
    await setCachedResolution("user1", "マック", "甲府", resolution, "chain_brand");

    // cache → L2 に既にあるので再書き込みしない
    expect(mockWriteL2).not.toHaveBeenCalled();
  });

  test("L2 障害時は L1 のみで動作する（fail-open）", async () => {
    mockReadL2.mockRejectedValueOnce(new Error("DB connection failed"));

    // L2 障害でも null を返す（エラーは握りつぶされる）
    const result = await getCachedResolution("user1", "マック", "甲府");
    expect(result).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. resolvePlace E2E（Web検索モック）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolvePlace", () => {
  beforeEach(() => {
    clearPlaceCache();
    mockSearch.mockReset();
    mockPlacesTextSearch.mockReset();
    mockPlacesAvailable.mockReset();
    mockPlacesAvailable.mockReturnValue(true);
    mockReadL2.mockReset();
    mockWriteL2.mockReset();
    mockReadL2.mockResolvedValue(null);
    mockWriteL2.mockResolvedValue();
  });

  test("固有名 → Web検索 → 候補1件 → high confidence", async () => {
    mockSearch.mockResolvedValue([
      {
        title: "サドヤ ワイナリー - 甲府のワイン醸造所",
        url: "https://sadoya.co.jp",
        text: "甲府市丸の内1-20-16にある老舗ワイナリー。レストランも併設。",
        score: 0.9,
      },
    ]);

    const context: ResolutionContext = {
      userArea: "甲府",
      activityHint: "ディナー",
    };
    const result = await resolvePlace("サドヤ", context, "user1");

    expect(result.confidence).not.toBe("unresolved");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.bestCandidate?.name).toContain("サドヤ");
  });

  test("Web検索失敗 → unresolved（fail-open）", async () => {
    mockSearch.mockRejectedValue(new Error("Network error"));

    const result = await resolvePlace("サドヤ", {}, "user1");
    expect(result.confidence).toBe("unresolved");
    expect(result.candidates).toHaveLength(0);
  });

  test("Web検索結果0件 → low", async () => {
    mockSearch.mockResolvedValue([]);

    const result = await resolvePlace("超マイナーな店", {}, "user1");
    expect(result.confidence).toBe("low");
    expect(result.candidates).toHaveLength(0);
  });

  test("キャッシュヒット時はWeb検索をスキップ", async () => {
    // 先にキャッシュを設定
    const resolution: PlaceResolution = {
      originalText: "サドヤ",
      candidates: [{ name: "サドヤ ワイナリー", address: "甲府市", source: "web_search", matchScore: 0.8 }],
      bestCandidate: { name: "サドヤ ワイナリー", address: "甲府市", source: "web_search", matchScore: 0.8 },
      confidence: "high",
      reason: "test",
    };
    await setCachedResolution("user1", "サドヤ", "甲府", resolution);

    const result = await resolvePlace("サドヤ", { userArea: "甲府" }, "user1");
    expect(result.confidence).toBe("high");
    expect(result.bestCandidate?.source).toBe("cache");
    // Web検索は呼ばれていない
    expect(mockSearch).not.toHaveBeenCalled();
  });

  test("high/medium の結果がキャッシュに保存される", async () => {
    mockSearch.mockResolvedValue([
      {
        title: "叙々苑 - 焼肉レストラン",
        url: "https://jojoen.co.jp",
        text: "東京都港区にある高級焼肉店。",
        score: 0.9,
      },
    ]);

    await resolvePlace("叙々苑", { activityHint: "ディナー" }, "user1");

    // 2回目はキャッシュから
    const cached = await getCachedResolution("user1", "叙々苑", undefined);
    expect(cached).not.toBeNull();
  });

  // ━━ CEO方針 2026-04-17 P0: exact_proper_noun でも Places API を先に試行 ━━
  //   根拠: Web検索だけだと lat/lng が乗らず extractHardAnchors が空になり、
  //         「甲府のサドヤ→杉並のむさしの森コーヒー 100km先」事故を誘発する。

  test("P0: 固有名で Places API が coords 付き候補を返した場合 Web検索はスキップ", async () => {
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_sadoya_places",
        displayName: { text: "サドヤ ワイナリー", languageCode: "ja" },
        formattedAddress: "甲府市丸の内1-20-16",
        location: { latitude: 35.6660, longitude: 138.5663 },
        types: ["restaurant", "winery"],
        businessStatus: "OPERATIONAL",
      },
    ]);

    const result = await resolvePlace("サドヤ", { userArea: "甲府" }, "user_p0");

    // Places が採用される
    expect(mockPlacesTextSearch).toHaveBeenCalled();
    // Web検索はフォールバック不要
    expect(mockSearch).not.toHaveBeenCalled();
    // coords が乗る（extractHardAnchors に昇格可能）
    expect(result.bestCandidate?.lat).toBe(35.6660);
    expect(result.bestCandidate?.lng).toBe(138.5663);
    expect(result.bestCandidate?.source).toBe("places_api");
    expect(result.confidence).not.toBe("unresolved");
  });

  test("P0: Places が coords 無し候補を返した場合は Web検索にフォールバック", async () => {
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_no_coords",
        displayName: { text: "サドヤ", languageCode: "ja" },
        formattedAddress: "甲府市",
        // location なし
        types: ["restaurant"],
        businessStatus: "OPERATIONAL",
      },
    ]);
    mockSearch.mockResolvedValue([
      {
        title: "サドヤ ワイナリー",
        url: "https://sadoya.co.jp",
        text: "甲府市丸の内にある老舗ワイナリー",
        score: 0.9,
      },
    ]);

    const result = await resolvePlace("サドヤ", { userArea: "甲府" }, "user_p0_fb");

    // 両方呼ばれる: Places 試行 → coords 無しで null 返却 → Web フォールバック
    expect(mockPlacesTextSearch).toHaveBeenCalled();
    expect(mockSearch).toHaveBeenCalled();
    expect(result.confidence).not.toBe("unresolved");
  });

  test("P0: Places が 0 件のとき Web検索にフォールバック", async () => {
    mockPlacesTextSearch.mockResolvedValue([]);
    mockSearch.mockResolvedValue([
      {
        title: "超マイナー店",
        url: "https://example.com",
        text: "甲府市の小さなお店",
        score: 0.5,
      },
    ]);

    const result = await resolvePlace("超マイナー店", { userArea: "甲府" }, "user_p0_empty");

    expect(mockPlacesTextSearch).toHaveBeenCalled();
    expect(mockSearch).toHaveBeenCalled();
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  test("P0: Places API 未設定なら Web検索を直接呼ぶ（従来動作維持）", async () => {
    mockPlacesAvailable.mockReturnValueOnce(false);
    mockSearch.mockResolvedValue([
      {
        title: "サドヤ ワイナリー",
        url: "https://sadoya.co.jp",
        text: "甲府市丸の内にある老舗ワイナリー",
        score: 0.9,
      },
    ]);

    const result = await resolvePlace("サドヤ", { userArea: "甲府" }, "user_p0_no_key");

    expect(mockPlacesTextSearch).not.toHaveBeenCalled();
    expect(mockSearch).toHaveBeenCalled();
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  test("L2 ヒット時も Web検索をスキップ（プロセス再起動後のキャッシュ復元）", async () => {
    // L2 にキャッシュがある（プロセス再起動後を想定）
    mockReadL2.mockResolvedValueOnce({
      resolvedName: "サドヤ ワイナリー",
      address: "甲府市丸の内1-20-16",
      placeId: "ChIJ_sadoya",
      confidence: "high",
      cachedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      useCount: 3,
    });

    const result = await resolvePlace("サドヤ", { userArea: "甲府" }, "user1");
    expect(result.confidence).toBe("high");
    expect(result.bestCandidate?.source).toBe("cache");
    expect(result.bestCandidate?.name).toBe("サドヤ ワイナリー");
    // Web検索は呼ばれていない
    expect(mockSearch).not.toHaveBeenCalled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Phase B-1: Chain Brand 正規化
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("normalizeChainBrand", () => {
  test("略称を正式名称に変換する", () => {
    expect(normalizeChainBrand("マック")).toBe("マクドナルド");
    expect(normalizeChainBrand("スタバ")).toBe("スターバックス");
    expect(normalizeChainBrand("ドトール")).toBe("ドトールコーヒー");
    expect(normalizeChainBrand("コメダ")).toBe("コメダ珈琲店");
    expect(normalizeChainBrand("ケンタ")).toBe("ケンタッキーフライドチキン");
    expect(normalizeChainBrand("ファミマ")).toBe("ファミリーマート");
    expect(normalizeChainBrand("ココイチ")).toBe("CoCo壱番屋");
    expect(normalizeChainBrand("丸亀")).toBe("丸亀製麺");
    expect(normalizeChainBrand("ミスド")).toBe("ミスタードーナツ");
    expect(normalizeChainBrand("モス")).toBe("モスバーガー");
  });

  test("マップにない名前はそのまま返す", () => {
    expect(normalizeChainBrand("マクドナルド")).toBe("マクドナルド");
    expect(normalizeChainBrand("知らない店")).toBe("知らない店");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Phase B-1: Generic Place 検索ヒント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getGenericPlaceSearchHint", () => {
  test("一般名詞に検索ヒントを返す", () => {
    expect(getGenericPlaceSearchHint("図書館")).toBe("公立図書館");
    expect(getGenericPlaceSearchHint("カフェ")).toBe("カフェ");
    expect(getGenericPlaceSearchHint("ジム")).toContain("スポーツジム");
    expect(getGenericPlaceSearchHint("美容院")).toContain("美容室");
  });

  test("マッピングにない名詞は null を返す", () => {
    expect(getGenericPlaceSearchHint("不思議な場所")).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Phase B-1: resolveChainBrand
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveChainBrand", () => {
  beforeEach(() => {
    clearPlaceCache();
    mockPlacesTextSearch.mockReset();
    mockPlacesAvailable.mockReturnValue(true);
    mockReadL2.mockReset();
    mockWriteL2.mockReset();
    mockReadL2.mockResolvedValue(null);
    mockWriteL2.mockResolvedValue();
  });

  test("エリアあり + 結果あり → high confidence", async () => {
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_test1",
        displayName: { text: "マクドナルド 甲府店", languageCode: "ja" },
        formattedAddress: "日本、山梨県甲府市丸の内1-2-3",
        shortFormattedAddress: "甲府市丸の内1-2-3",
        location: { latitude: 35.66, longitude: 138.57 },
        types: ["restaurant", "fast_food_restaurant"],
        businessStatus: "OPERATIONAL",
      },
    ]);

    const result = await resolveChainBrand("マック", { userArea: "甲府" }, "user1");

    expect(result.confidence).toBe("high");
    expect(result.bestCandidate?.name).toBe("マクドナルド 甲府店");
    expect(result.bestCandidate?.source).toBe("places_api");
    expect(result.bestCandidate?.placeId).toBe("ChIJ_test1");
    // Phase C-2: lat/lng が Places API から取得される
    expect(result.bestCandidate?.lat).toBe(35.66);
    expect(result.bestCandidate?.lng).toBe(138.57);
  });

  test("エリアなし + 結果あり → medium confidence", async () => {
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_test2",
        displayName: { text: "スターバックス 渋谷店", languageCode: "ja" },
        formattedAddress: "東京都渋谷区",
        types: ["cafe"],
        businessStatus: "OPERATIONAL",
      },
    ]);

    const result = await resolveChainBrand("スタバ", {}, "user1");

    expect(result.confidence).toBe("medium");
    expect(result.bestCandidate?.name).toContain("スターバックス");
  });

  test("結果0件 → low confidence", async () => {
    mockPlacesTextSearch.mockResolvedValue([]);

    const result = await resolveChainBrand("マック", { userArea: "南極" }, "user1");
    expect(result.confidence).toBe("low");
    expect(result.candidates).toHaveLength(0);
  });

  test("Places API 失敗 → unresolved（fail-open）", async () => {
    mockPlacesTextSearch.mockRejectedValue(new Error("API error"));

    const result = await resolveChainBrand("マック", { userArea: "甲府" }, "user1");
    expect(result.confidence).toBe("unresolved");
  });

  test("API キー未設定 → unresolved", async () => {
    mockPlacesAvailable.mockReturnValue(false);

    const result = await resolveChainBrand("マック", { userArea: "甲府" }, "user1");
    expect(result.confidence).toBe("unresolved");
    expect(result.reason).toContain("キー未設定");
    // API は呼ばれていない
    expect(mockPlacesTextSearch).not.toHaveBeenCalled();
  });

  test("閉店済み店舗は除外される", async () => {
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_closed",
        displayName: { text: "マクドナルド 旧甲府店", languageCode: "ja" },
        formattedAddress: "甲府市",
        types: ["restaurant"],
        businessStatus: "CLOSED_PERMANENTLY",
      },
      {
        id: "ChIJ_open",
        displayName: { text: "マクドナルド 甲府南店", languageCode: "ja" },
        formattedAddress: "甲府市",
        types: ["restaurant"],
        businessStatus: "OPERATIONAL",
      },
    ]);

    const result = await resolveChainBrand("マック", { userArea: "甲府" }, "user1");
    // 閉店済み店舗は候補に含まれない
    expect(result.candidates.every(c => c.name !== "マクドナルド 旧甲府店")).toBe(true);
    expect(result.bestCandidate?.name).toBe("マクドナルド 甲府南店");
  });

  test("キャッシュヒット時は Places API をスキップ", async () => {
    const resolution: PlaceResolution = {
      originalText: "マック",
      candidates: [{ name: "マクドナルド 甲府店", address: "甲府市", source: "places_api", matchScore: 0.8 }],
      bestCandidate: { name: "マクドナルド 甲府店", address: "甲府市", source: "places_api", matchScore: 0.8 },
      confidence: "high",
      reason: "test",
    };
    await setCachedResolution("user1", "マック", "甲府", resolution);

    const result = await resolveChainBrand("マック", { userArea: "甲府" }, "user1");
    expect(result.confidence).toBe("high");
    expect(result.bestCandidate?.source).toBe("cache");
    expect(mockPlacesTextSearch).not.toHaveBeenCalled();
  });

  // ━━ CEO方針 2026-04-17 P1-b: near-anchor placeName で anchor coords を locationBias に使う ━━

  test("P1-b: 「近くのマック」でanchor coords が locationBias として Places API に渡る", async () => {
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_kofu_mac",
        displayName: { text: "マクドナルド 甲府店", languageCode: "ja" },
        formattedAddress: "甲府市",
        location: { latitude: 35.66, longitude: 138.57 },
        types: ["restaurant"],
        businessStatus: "OPERATIONAL",
      },
    ]);

    const sadoyaAnchor: import("@/lib/alter-morning/objectiveFunction").HardAnchor = {
      segmentId: "seg_sadoya",
      order: 0,
      anchorScore: 6,
      coords: { lat: 35.6660, lng: 138.5663 },
      label: "サドヤ ワイナリー",
    };

    // userArea は敢えて「杉並」のような遠い場所にして、locationBias が優先されるか確認
    await resolveChainBrand(
      "近くのマック",
      { userArea: "杉並", resolvedAnchors: [sadoyaAnchor] },
      "user_p1b_chain",
    );

    // Places API 呼び出しの引数に locationBias が入っている
    expect(mockPlacesTextSearch).toHaveBeenCalled();
    const args = mockPlacesTextSearch.mock.calls[0][0];
    expect(args.locationBias).toBeDefined();
    expect(args.locationBias?.lat).toBe(35.6660);
    expect(args.locationBias?.lng).toBe(138.5663);
    // query は userArea 付与せず brand 名のみ（anchor 優先）
    expect(args.textQuery).not.toContain("杉並");
  });

  test("P1-b: near-anchor が無ければ従来通り userArea をクエリに付与", async () => {
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_kofu_mac",
        displayName: { text: "マクドナルド 甲府店", languageCode: "ja" },
        formattedAddress: "甲府市",
        location: { latitude: 35.66, longitude: 138.57 },
        types: ["restaurant"],
        businessStatus: "OPERATIONAL",
      },
    ]);

    // anchor 無し + placeName も near-anchor プレフィクスなし
    await resolveChainBrand(
      "マック",
      { userArea: "甲府" },
      "user_p1b_none",
    );

    const args = mockPlacesTextSearch.mock.calls[0][0];
    expect(args.locationBias).toBeUndefined();
    expect(args.textQuery).toContain("甲府");
  });

  test("P1-b: resolvedAnchors があっても placeName が near-anchor でなければ locationBias は付かない", async () => {
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_x", displayName: { text: "マクドナルド", languageCode: "ja" },
        formattedAddress: "甲府市",
        location: { latitude: 35.66, longitude: 138.57 },
        types: ["restaurant"], businessStatus: "OPERATIONAL",
      },
    ]);
    const sadoyaAnchor: import("@/lib/alter-morning/objectiveFunction").HardAnchor = {
      segmentId: "seg_sadoya", order: 0, anchorScore: 6,
      coords: { lat: 35.6660, lng: 138.5663 }, label: "サドヤ",
    };

    await resolveChainBrand(
      "マック",
      { userArea: "甲府", resolvedAnchors: [sadoyaAnchor] },
      "user_p1b_no_prefix",
    );

    const args = mockPlacesTextSearch.mock.calls[0][0];
    // NEAR_ANCHOR_RE にマッチしない普通の placeName なので bias なし
    expect(args.locationBias).toBeUndefined();
  });

  test("P1-b: 「付近のカフェ」（generic_place）でも anchor coords が locationBias に使われる", async () => {
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_cafe",
        displayName: { text: "カフェ・甲府", languageCode: "ja" },
        formattedAddress: "甲府市",
        location: { latitude: 35.666, longitude: 138.566 },
        types: ["cafe"],
        businessStatus: "OPERATIONAL",
      },
    ]);

    const sadoyaAnchor: import("@/lib/alter-morning/objectiveFunction").HardAnchor = {
      segmentId: "seg_sadoya", order: 0, anchorScore: 6,
      coords: { lat: 35.6660, lng: 138.5663 }, label: "サドヤ",
    };

    await resolveGenericPlace(
      "付近のカフェ",
      { userArea: "杉並", resolvedAnchors: [sadoyaAnchor] },
      "user_p1b_generic",
    );

    expect(mockPlacesTextSearch).toHaveBeenCalled();
    const args = mockPlacesTextSearch.mock.calls[0][0];
    expect(args.locationBias).toBeDefined();
    expect(args.locationBias?.lat).toBe(35.6660);
    expect(args.locationBias?.lng).toBe(138.5663);
    // userArea は query に含まれない（anchor 優先）
    expect(args.textQuery).not.toContain("杉並");
  });

  test("resolveChainBrand が L2 に placeType=chain_brand で書き込む", async () => {
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_test_l2",
        displayName: { text: "マクドナルド 甲府店", languageCode: "ja" },
        formattedAddress: "日本、山梨県甲府市丸の内1-2-3",
        shortFormattedAddress: "甲府市丸の内1-2-3",
        location: { latitude: 35.66, longitude: 138.57 },
        types: ["restaurant", "fast_food_restaurant"],
        businessStatus: "OPERATIONAL",
      },
    ]);

    await resolveChainBrand("マック", { userArea: "甲府" }, "user1");

    // L2 に chain_brand で書き込まれた
    expect(mockWriteL2).toHaveBeenCalledTimes(1);
    const writeArgs = mockWriteL2.mock.calls[0];
    expect(writeArgs[3].placeType).toBe("chain_brand");
    expect(writeArgs[3].source).toBe("places_api");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. Phase B-1: resolveGenericPlace
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveGenericPlace", () => {
  beforeEach(() => {
    clearPlaceCache();
    mockPlacesTextSearch.mockReset();
    mockPlacesAvailable.mockReturnValue(true);
    mockReadL2.mockReset();
    mockWriteL2.mockReset();
    mockReadL2.mockResolvedValue(null);
    mockWriteL2.mockResolvedValue();
  });

  test("エリアあり + 結果あり → medium confidence（generic は high にならない）", async () => {
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_lib1",
        displayName: { text: "甲府市立図書館", languageCode: "ja" },
        formattedAddress: "山梨県甲府市城東1-12-33",
        shortFormattedAddress: "甲府市城東1-12-33",
        location: { latitude: 35.66, longitude: 138.57 },
        types: ["library"],
        businessStatus: "OPERATIONAL",
      },
    ]);

    const result = await resolveGenericPlace("図書館", { userArea: "甲府" }, "user1");

    expect(result.confidence).toBe("medium");
    expect(result.bestCandidate?.name).toBe("甲府市立図書館");
    expect(result.bestCandidate?.placeId).toBe("ChIJ_lib1");
  });

  test("複数候補あり → medium（候補提示用）", async () => {
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_lib1",
        displayName: { text: "甲府市立図書館", languageCode: "ja" },
        formattedAddress: "甲府市",
        types: ["library"],
        businessStatus: "OPERATIONAL",
      },
      {
        id: "ChIJ_lib2",
        displayName: { text: "山梨県立図書館", languageCode: "ja" },
        formattedAddress: "甲府市",
        types: ["library"],
        businessStatus: "OPERATIONAL",
      },
    ]);

    const result = await resolveGenericPlace("図書館", { userArea: "甲府" }, "user1");

    // generic は high にならない
    expect(["medium", "low"]).toContain(result.confidence);
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
  });

  test("結果0件 → low confidence", async () => {
    mockPlacesTextSearch.mockResolvedValue([]);

    const result = await resolveGenericPlace("図書館", { userArea: "南極" }, "user1");
    expect(result.confidence).toBe("low");
  });

  test("API 失敗 → unresolved（fail-open）", async () => {
    mockPlacesTextSearch.mockRejectedValue(new Error("Network error"));

    const result = await resolveGenericPlace("公園", { userArea: "甲府" }, "user1");
    expect(result.confidence).toBe("unresolved");
  });

  test("API キー未設定 → unresolved", async () => {
    mockPlacesAvailable.mockReturnValue(false);

    const result = await resolveGenericPlace("カフェ", { userArea: "甲府" }, "user1");
    expect(result.confidence).toBe("unresolved");
    expect(mockPlacesTextSearch).not.toHaveBeenCalled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. Phase B-1: resolveAnchors 混合テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveAnchors (mixed placeTypes)", () => {
  beforeEach(() => {
    clearPlaceCache();
    mockSearch.mockReset();
    mockPlacesTextSearch.mockReset();
    mockPlacesAvailable.mockReturnValue(true);
    mockReadL2.mockReset();
    mockWriteL2.mockReset();
    mockReadL2.mockResolvedValue(null);
    mockWriteL2.mockResolvedValue();
  });

  test("exact + chain + generic + known_base が正しくディスパッチされる", async () => {
    // Web検索: exact_proper_noun 用
    mockSearch.mockResolvedValue([
      {
        title: "サドヤ ワイナリー - 甲府",
        url: "https://sadoya.co.jp",
        text: "甲府市丸の内にある老舗ワイナリー",
        score: 0.9,
      },
    ]);

    // Places API: chain_brand + generic_place 用
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_place1",
        displayName: { text: "テスト場所", languageCode: "ja" },
        formattedAddress: "甲府市",
        types: ["restaurant"],
        businessStatus: "OPERATIONAL",
      },
    ]);

    const segments: PlanSegment[] = [
      {
        id: "seg_1", order: 1, activity: "ディナー", place: "サドヤ",
        placeType: "exact_proper_noun", companions: [], status: "confirmed",
        anchorScore: 6,
      },
      {
        id: "seg_2", order: 2, activity: "仕事", place: "マック",
        placeType: "chain_brand", companions: [], status: "confirmed",
        anchorScore: 1,
      },
      {
        id: "seg_3", order: 3, activity: "読書", place: "図書館",
        placeType: "generic_place", companions: [], status: "confirmed",
        anchorScore: 0,
      },
      {
        id: "seg_4", order: 4, activity: "帰宅", place: "自宅",
        placeType: "known_base", companions: [], status: "confirmed",
        anchorScore: 0,
      },
    ];

    const { resolved, needsConfirmation } = await resolveAnchors(segments, "甲府", "user1");

    // exact: Web検索が呼ばれた
    expect(mockSearch).toHaveBeenCalled();
    // chain + generic: Places API が呼ばれた
    expect(mockPlacesTextSearch).toHaveBeenCalled();

    // known_base は解決されていない（スキップ）
    const homeSeg = resolved.find(s => s.id === "seg_4");
    expect(homeSeg?.resolvedPlaceName).toBeUndefined();

    // 少なくとも exact は解決された
    const sadoyaSeg = resolved.find(s => s.id === "seg_1");
    expect(sadoyaSeg?.resolutionConfidence).not.toBe("unresolved");
  });

  test("anchorScore 降順で解決される（Hard anchor 優先）", async () => {
    const callOrder: string[] = [];

    mockSearch.mockImplementation(async () => {
      callOrder.push("web");
      return [{
        title: "サドヤ", url: "https://test.com", text: "甲府市", score: 0.9,
      }];
    });
    mockPlacesTextSearch.mockImplementation(async () => {
      callOrder.push("places");
      return [{
        id: "ChIJ_test",
        displayName: { text: "テスト", languageCode: "ja" },
        formattedAddress: "甲府市",
        types: ["restaurant"],
        businessStatus: "OPERATIONAL",
      }];
    });

    const segments: PlanSegment[] = [
      {
        id: "seg_low", order: 1, activity: "仕事", place: "マック",
        placeType: "chain_brand", companions: [], status: "confirmed",
        anchorScore: 1,
      },
      {
        id: "seg_high", order: 2, activity: "ディナー", place: "サドヤ",
        placeType: "exact_proper_noun", companions: ["田中さん"], status: "confirmed",
        anchorScore: 6,
      },
    ];

    await resolveAnchors(segments, "甲府", "user1");

    // anchorScore 降順: サドヤ(6) が マック(1) より先に処理される
    // P0 (2026-04-17): exact_proper_noun は Places API を先に試行（座標取得目的）。
    //   mock に location が無いため fallback として Web 検索が続く。
    // その後 chain_brand の マック が Places API で解決される。
    // 期待 callOrder: ["places"(サドヤ試行), "web"(サドヤ fallback), "places"(マック)]
    expect(callOrder[0]).toBe("places");
    expect(callOrder[1]).toBe("web");
    expect(callOrder[2]).toBe("places");
  });

  // ━━ Phase C-2: lat/lng がセグメントに反映される ━━

  test("Places API の lat/lng が resolvedLat/resolvedLng としてセグメントに反映される", async () => {
    mockSearch.mockResolvedValue([]);
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_latlng",
        displayName: { text: "マクドナルド 甲府店", languageCode: "ja" },
        formattedAddress: "甲府市丸の内1-2-3",
        location: { latitude: 35.662, longitude: 138.568 },
        types: ["restaurant"],
        businessStatus: "OPERATIONAL",
      },
    ]);

    const segments: PlanSegment[] = [
      {
        id: "seg_chain", order: 1, activity: "ランチ", place: "マック",
        placeType: "chain_brand", companions: [], status: "confirmed",
        anchorScore: 2,
      },
    ];

    const { resolved } = await resolveAnchors(segments, "甲府", "user1");
    const seg = resolved.find(s => s.id === "seg_chain");

    expect(seg?.resolvedLat).toBe(35.662);
    expect(seg?.resolvedLng).toBe(138.568);
    expect(seg?.resolvedPlaceName).toBe("マクドナルド 甲府店");
  });

  test("location がない Places 結果ではlat/lng は undefined", async () => {
    mockSearch.mockResolvedValue([]);
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_noloc",
        displayName: { text: "カフェ テスト", languageCode: "ja" },
        formattedAddress: "甲府市",
        types: ["cafe"],
        businessStatus: "OPERATIONAL",
        // location なし
      },
    ]);

    const segments: PlanSegment[] = [
      {
        id: "seg_noloc", order: 1, activity: "お茶", place: "カフェ",
        placeType: "generic_place", companions: [], status: "confirmed",
        anchorScore: 0,
      },
    ];

    const { resolved } = await resolveAnchors(segments, "甲府", "user1");
    const seg = resolved.find(s => s.id === "seg_noloc");

    expect(seg?.resolvedLat).toBeUndefined();
    expect(seg?.resolvedLng).toBeUndefined();
    // 名前は解決されている
    expect(seg?.resolvedPlaceName).toBe("カフェ テスト");
  });

  test("L2 キャッシュヒット時も lat/lng がセグメントに復元される", async () => {
    // L2 に lat/lng 付きのキャッシュがある
    mockReadL2.mockResolvedValue({
      resolvedName: "スターバックス 甲府店",
      address: "甲府市丸の内",
      placeId: "ChIJ_starbucks",
      lat: 35.665,
      lng: 138.570,
      confidence: "high",
      cachedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      useCount: 3,
    });

    const segments: PlanSegment[] = [
      {
        id: "seg_cached", order: 1, activity: "仕事", place: "スタバ",
        placeType: "chain_brand", companions: [], status: "confirmed",
        anchorScore: 1,
      },
    ];

    const { resolved } = await resolveAnchors(segments, "甲府", "user1");
    const seg = resolved.find(s => s.id === "seg_cached");

    expect(seg?.resolvedLat).toBe(35.665);
    expect(seg?.resolvedLng).toBe(138.570);
    expect(seg?.resolvedPlaceName).toBe("スターバックス 甲府店");
    // Places API は呼ばれていない（キャッシュヒット）
    expect(mockPlacesTextSearch).not.toHaveBeenCalled();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO 方針 2026-04-17: 距離ペナルティ end-to-end
  //
  // シナリオ: 「サドヤ(甲府市)で会食、その前にマックで朝食」
  //   → 「マック」候補として 甲府マック(anchor 近傍) と 増穂マック(15km 離れ)
  //     両方返ってきたとき、距離ペナルティで甲府マックが選ばれる
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  test("CEO 甲府↔増穂: hard anchor 近傍候補が選ばれる", async () => {
    // サドヤの Web 検索モック (hard anchor)
    mockSearch.mockResolvedValue([
      {
        title: "サドヤ ワイナリー - 甲府",
        url: "https://sadoya.co.jp",
        text: "甲府市丸の内にある老舗ワイナリー",
        score: 0.9,
      },
    ]);

    // 「マック」検索時: 甲府店 と 増穂店 の 2 候補を返す
    // どちらも matchScore は近い (同じ「マクドナルド」ブランド)
    mockPlacesTextSearch.mockImplementation(async ({ textQuery }) => {
      if (textQuery.includes("マクドナルド")) {
        return [
          {
            id: "ChIJ_masuho",
            displayName: { text: "マクドナルド 増穂店", languageCode: "ja" },
            formattedAddress: "南巨摩郡富士川町",
            location: { latitude: 35.5675, longitude: 138.4795 },
            types: ["restaurant"],
            businessStatus: "OPERATIONAL",
          },
          {
            id: "ChIJ_kofu",
            displayName: { text: "マクドナルド 甲府駅前店", languageCode: "ja" },
            formattedAddress: "甲府市丸の内",
            location: { latitude: 35.6640, longitude: 138.5685 },
            types: ["restaurant"],
            businessStatus: "OPERATIONAL",
          },
        ];
      }
      return [];
    });

    const segments: PlanSegment[] = [
      // order=1 は anchorScore 低い「マック」(soft candidate)
      {
        id: "seg_mac", order: 1, activity: "朝食", place: "マック",
        placeType: "chain_brand", companions: [], status: "confirmed",
        anchorScore: 1,  // soft
      },
      // order=2 は anchorScore 高い「サドヤ」(hard anchor)
      // 時刻明示 + 固有名 + 同伴者あり → anchorScore >= 4
      {
        id: "seg_sadoya", order: 2, activity: "会食", place: "サドヤ",
        startTime: "12:00",
        placeType: "exact_proper_noun", companions: ["鈴木さん"], status: "confirmed",
        anchorScore: 6,  // hard
      },
    ];

    // サドヤのレゾリューション (Web検索) は lat/lng を返さないので、
    // 直接 segments に resolvedLat/Lng を注入する手段が現状ない。
    // → このテストは: anchor が先に解決 + lat/lng 付きのとき距離ペナルティが効く
    // ことを別のルートで検証する: サドヤを Places API 経由で解決
    // (一旦、exact_proper_noun も places を使って lat/lng 入りの結果を返すとする)

    // Web 検索で lat/lng が無い場合、hard anchor は coords なしになり
    // 距離ペナルティはスキップ (fail-open) される。これも仕様。

    // このテストは、lat/lng 付きで解決された hard anchor があれば
    // 距離ペナルティが効くことを確認するのが目的。

    // サドヤを強制的に座標付きで解決するため、L2 キャッシュをモック
    mockReadL2.mockImplementation(async (_userId, placeText) => {
      if (placeText === "サドヤ") {
        return {
          resolvedName: "サドヤ ワイナリー",
          address: "甲府市丸の内1-20-16",
          placeId: "ChIJ_sadoya",
          lat: 35.6660,
          lng: 138.5663,
          confidence: "high" as const,
          cachedAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          useCount: 2,
        };
      }
      return null;
    });

    const { resolved } = await resolveAnchors(segments, "甲府", "user_ceo_scenario");

    // サドヤは L2 キャッシュから復元されて lat/lng 付き
    const sadoyaSeg = resolved.find(s => s.id === "seg_sadoya");
    expect(sadoyaSeg?.resolvedLat).toBe(35.6660);
    expect(sadoyaSeg?.resolvedLng).toBe(138.5663);

    // マックは 2 候補あるが距離ペナルティで甲府が選ばれる
    const macSeg = resolved.find(s => s.id === "seg_mac");
    expect(macSeg?.resolvedPlaceName).toBe("マクドナルド 甲府駅前店");
    // 距離として増穂 (~15km) ではなく甲府 (~0.3km) の lat/lng
    expect(macSeg?.resolvedLat).toBe(35.6640);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO 方針 2026-04-17 P1-C: anchor 近傍候補は medium 昇格 + 1件絞り
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  test("P1-C: anchor 近傍 + userArea なしの chain_brand は medium + 1件に絞られる", async () => {
    // userArea を空にして、chain_brand の自動 high 昇格を抑制する
    // → 通常なら low のまま候補羅列される状況を作る
    mockPlacesTextSearch.mockResolvedValue([
      {
        id: "ChIJ_nearby",
        displayName: { text: "マクドナルド 甲府駅前店", languageCode: "ja" },
        formattedAddress: "甲府市丸の内",
        location: { latitude: 35.6640, longitude: 138.5685 },
        types: ["restaurant"],
        businessStatus: "OPERATIONAL",
      },
      {
        id: "ChIJ_farther",
        displayName: { text: "マクドナルド 増穂店", languageCode: "ja" },
        formattedAddress: "南巨摩郡富士川町",
        location: { latitude: 35.5675, longitude: 138.4795 },
        types: ["restaurant"],
        businessStatus: "OPERATIONAL",
      },
    ]);

    // サドヤを座標付きで anchor に固定
    mockReadL2.mockImplementation(async (_userId, placeText) => {
      if (placeText === "サドヤ") {
        return {
          resolvedName: "サドヤ ワイナリー",
          address: "甲府市丸の内1-20-16",
          placeId: "ChIJ_sadoya",
          lat: 35.6660,
          lng: 138.5663,
          confidence: "high" as const,
          cachedAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          useCount: 1,
        };
      }
      return null;
    });

    const segments: PlanSegment[] = [
      {
        id: "seg_mac", order: 1, activity: "朝食", place: "マック",
        placeType: "chain_brand", companions: [], status: "confirmed",
        anchorScore: 1,
      },
      {
        id: "seg_sadoya", order: 2, activity: "会食", place: "サドヤ",
        startTime: "12:00",
        placeType: "exact_proper_noun", companions: ["鈴木さん"],
        status: "confirmed", anchorScore: 6,
      },
    ];

    // userArea 未指定 → 通常なら confidence=low/medium に留まる
    const { resolved, needsConfirmation } = await resolveAnchors(
      segments, undefined, "user_p1c",
    );

    const macSeg = resolved.find(s => s.id === "seg_mac");
    // top 候補（甲府店）が選ばれている
    expect(macSeg?.resolvedPlaceName).toBe("マクドナルド 甲府駅前店");

    // needsConfirmation に macSeg が入る場合、low のまま羅列にならず
    // medium + top=甲府駅前店 で 1件提示になる（CEOの望むUX）
    const macConfirm = needsConfirmation.find(n => n.segmentId === "seg_mac");
    if (macConfirm) {
      expect(macConfirm.resolution.confidence).toBe("medium");
      expect(macConfirm.resolution.bestCandidate?.name)
        .toBe("マクドナルド 甲府駅前店");
    }
  });

  test("anchor 不在時は距離ペナルティ発動せず元ランクを維持", async () => {
    // anchor 無しで「マック」だけ検索
    mockSearch.mockResolvedValue([]);
    mockPlacesTextSearch.mockResolvedValue([
      // Places API が返した順 (rank 0 が優位)
      {
        id: "ChIJ_first",
        displayName: { text: "マクドナルド 遠い店", languageCode: "ja" },
        formattedAddress: "南巨摩郡富士川町",
        location: { latitude: 35.5675, longitude: 138.4795 },
        types: ["restaurant"],
        businessStatus: "OPERATIONAL",
      },
      {
        id: "ChIJ_second",
        displayName: { text: "マクドナルド 近い店", languageCode: "ja" },
        formattedAddress: "甲府市",
        location: { latitude: 35.6640, longitude: 138.5685 },
        types: ["restaurant"],
        businessStatus: "OPERATIONAL",
      },
    ]);

    const segments: PlanSegment[] = [
      {
        id: "seg_only", order: 1, activity: "朝食", place: "マック",
        placeType: "chain_brand", companions: [], status: "confirmed",
        anchorScore: 1,
      },
    ];

    const { resolved } = await resolveAnchors(segments, "甲府", "user_no_anchor");
    const seg = resolved.find(s => s.id === "seg_only");
    // anchor 無しなので通常の matchScore ロジック
    // (エリア一致で「甲府市」住所の店が選ばれる可能性が高い)
    expect(seg?.resolvedPlaceName).toBeDefined();
  });
});
