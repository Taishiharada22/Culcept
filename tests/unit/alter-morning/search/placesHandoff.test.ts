/**
 * placesHandoff — PR-9 commit 3 unit tests
 *
 * 検証観点（CEO 2026-04-23 commit 3 成功条件）:
 *   - success / zero / provider_error の 3-kind 分岐が明確に返る
 *   - buildQueryFingerprint が (anchor, chain, category) の正規化結果で deterministic
 *   - buildTextQuery: chain 優先、anchor 欠落で null
 *   - source filter: web_search ソースを混ぜない（places_api 単一呼び出しであることを確認）
 *   - CLOSED_PERMANENTLY 除外、座標欠落除外、空 id 除外
 *   - anchorCoords 供給時 distanceFromAnchor 計算
 *   - reducer / route / UI に触らない（import しない）
 */

import { describe, expect, it, vi } from "vitest";
import type { SearchQueryDraft } from "@/lib/alter-morning/dialog/types";
import type { PlacesApiPlace, TextSearchOptions } from "@/lib/alter-morning/placesApiClient";
import {
  buildQueryFingerprint,
  classifyProviderErrorForLog,
  executePlacesHandoff,
  type PlacesHandoffDeps,
} from "@/lib/alter-morning/search/placesHandoff";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkDraft(partial: Partial<SearchQueryDraft> = {}): SearchQueryDraft {
  const anchor = "anchorRegion" in partial ? partial.anchorRegion! : "甲府";
  const chain = "chainToken" in partial ? partial.chainToken! : "スタバ";
  const category = "categoryToken" in partial ? partial.categoryToken! : null;
  const ready =
    partial.readyForHandoff !== undefined
      ? partial.readyForHandoff
      : !!anchor && (!!chain || !!category);
  return {
    anchorRegion: anchor,
    chainToken: chain,
    categoryToken: category,
    readyForHandoff: ready,
  };
}

function mkPlace(partial: Partial<PlacesApiPlace> & { id: string }): PlacesApiPlace {
  return {
    id: partial.id,
    displayName: partial.displayName ?? { text: `店舗 ${partial.id}`, languageCode: "ja" },
    formattedAddress: partial.formattedAddress ?? "山梨県甲府市1-1-1",
    shortFormattedAddress: partial.shortFormattedAddress,
    location:
      "location" in partial
        ? partial.location
        : { latitude: 35.66, longitude: 138.56 },
    types: partial.types ?? ["cafe"],
    businessStatus: partial.businessStatus ?? "OPERATIONAL",
  };
}

function mkDeps(overrides: Partial<PlacesHandoffDeps> = {}): PlacesHandoffDeps {
  return {
    isPlacesApiAvailable: overrides.isPlacesApiAvailable ?? (() => true),
    searchPlacesByText:
      overrides.searchPlacesByText ??
      (vi.fn(async () => []) as unknown as PlacesHandoffDeps["searchPlacesByText"]),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 buildQueryFingerprint
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildQueryFingerprint", () => {
  it("normalizes anchor + chain + category into stable token", () => {
    const fp = buildQueryFingerprint(
      mkDraft({ anchorRegion: "甲府", chainToken: "スタバ", categoryToken: null }),
    );
    expect(fp).toBe("pf:v1|a=甲府|ch=スタバ|cat=-");
  });

  it("normalizes case/whitespace", () => {
    const a = buildQueryFingerprint(
      mkDraft({ anchorRegion: "  Kofu  ", chainToken: "Starbucks", categoryToken: null }),
    );
    const b = buildQueryFingerprint(
      mkDraft({ anchorRegion: "kofu", chainToken: "starbucks", categoryToken: null }),
    );
    expect(a).toBe(b);
  });

  it("is deterministic for null fields (all '-')", () => {
    const fp = buildQueryFingerprint({
      anchorRegion: null,
      chainToken: null,
      categoryToken: null,
      readyForHandoff: false,
    });
    expect(fp).toBe("pf:v1|a=-|ch=-|cat=-");
  });

  it("distinguishes chain vs category fingerprint", () => {
    const a = buildQueryFingerprint(
      mkDraft({ anchorRegion: "甲府", chainToken: "スタバ", categoryToken: null }),
    );
    const b = buildQueryFingerprint(
      mkDraft({ anchorRegion: "甲府", chainToken: null, categoryToken: "カフェ" }),
    );
    expect(a).not.toBe(b);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 executePlacesHandoff — provider_error 群
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("executePlacesHandoff — provider_error", () => {
  it("returns draft_not_ready when readyForHandoff=false", async () => {
    const draft = mkDraft({ readyForHandoff: false });
    const searchSpy = vi.fn(async () => []);
    const result = await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: searchSpy as never }),
    );
    expect(result).toEqual({
      kind: "provider_error",
      queryFingerprint: buildQueryFingerprint(draft),
      reason: "draft_not_ready",
    });
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it("returns draft_not_ready when anchor is missing even if ready flag true", async () => {
    const draft: SearchQueryDraft = {
      anchorRegion: null,
      chainToken: "スタバ",
      categoryToken: null,
      readyForHandoff: true, // 上流バグで true が来た想定
    };
    const searchSpy = vi.fn(async () => []);
    const result = await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: searchSpy as never }),
    );
    expect(result.kind).toBe("provider_error");
    if (result.kind === "provider_error") {
      expect(result.reason).toBe("draft_not_ready");
    }
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it("returns draft_not_ready when chain + category both missing", async () => {
    const draft: SearchQueryDraft = {
      anchorRegion: "甲府",
      chainToken: null,
      categoryToken: null,
      readyForHandoff: true,
    };
    const searchSpy = vi.fn(async () => []);
    const result = await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: searchSpy as never }),
    );
    expect(result.kind).toBe("provider_error");
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it("returns api_key_missing when isPlacesApiAvailable=false", async () => {
    const draft = mkDraft();
    const searchSpy = vi.fn(async () => []);
    const result = await executePlacesHandoff(
      { draft },
      mkDeps({
        isPlacesApiAvailable: () => false,
        searchPlacesByText: searchSpy as never,
      }),
    );
    expect(result).toEqual({
      kind: "provider_error",
      queryFingerprint: buildQueryFingerprint(draft),
      reason: "api_key_missing",
    });
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it("returns api_throw when searchPlacesByText rejects", async () => {
    const draft = mkDraft();
    const searchSpy = vi.fn(async () => {
      throw new Error("Places Text Search failed: 500");
    });
    const result = await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: searchSpy as never }),
    );
    expect(result).toEqual({
      kind: "provider_error",
      queryFingerprint: buildQueryFingerprint(draft),
      reason: "api_throw",
    });
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 executePlacesHandoff — zero
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("executePlacesHandoff — zero", () => {
  it("returns zero when API returns empty array", async () => {
    const draft = mkDraft();
    const result = await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: (async () => []) as never }),
    );
    expect(result).toEqual({
      kind: "zero",
      queryFingerprint: buildQueryFingerprint(draft),
    });
  });

  it("returns zero when all candidates filtered out (closed permanently)", async () => {
    const draft = mkDraft();
    const places: PlacesApiPlace[] = [
      mkPlace({ id: "p1", businessStatus: "CLOSED_PERMANENTLY" }),
      mkPlace({ id: "p2", businessStatus: "CLOSED_PERMANENTLY" }),
    ];
    const result = await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: (async () => places) as never }),
    );
    expect(result.kind).toBe("zero");
  });

  it("returns zero when all candidates lack coordinates", async () => {
    const draft = mkDraft();
    const places: PlacesApiPlace[] = [
      mkPlace({ id: "p1", location: undefined }),
      {
        id: "p2",
        displayName: { text: "店", languageCode: "ja" },
        location: { latitude: NaN, longitude: 0 },
      },
    ];
    const result = await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: (async () => places) as never }),
    );
    expect(result.kind).toBe("zero");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 executePlacesHandoff — allowAnchorOnly (CEO/GPT 2026-05-03 PR #74)
//
// journey_origin grounding 経路で chain/category null でも anchor 単独 query を
// 通すための条件付き許可。 event_where 経路は **絶対に true を渡さない**。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("executePlacesHandoff — allowAnchorOnly (CEO/GPT 2026-05-03 PR #74)", () => {
  // 期待する text query を verify するため searchSpy で arg 確認
  // searchPlacesByText は { textQuery, ... } 形式の args を受け取る
  const captureTextQuery = () => {
    const captured: string[] = [];
    const spy = vi.fn(async (args: { textQuery: string }) => {
      captured.push(args.textQuery);
      return [
        mkPlace({
          id: "p_journey",
          displayName: { text: "東京駅丸の内口", languageCode: "ja" },
        }),
      ];
    });
    return { spy, captured };
  };

  it("[journey_origin] allowAnchorOnly: true + anchor only → success with anchor query", async () => {
    const draft: SearchQueryDraft = {
      anchorRegion: "東京駅",
      chainToken: null,
      categoryToken: null,
      readyForHandoff: true,
    };
    const { spy, captured } = captureTextQuery();
    const result = await executePlacesHandoff(
      { draft, allowAnchorOnly: true },
      mkDeps({ searchPlacesByText: spy as never }),
    );
    expect(result.kind).toBe("success");
    expect(captured).toEqual(["東京駅"]); // anchor 単独 query
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("[journey_origin] allowAnchorOnly: true + anchor + chain → success with combined query (= 既存 path)", async () => {
    const draft: SearchQueryDraft = {
      anchorRegion: "渋谷",
      chainToken: "スタバ",
      categoryToken: null,
      readyForHandoff: true,
    };
    const { spy, captured } = captureTextQuery();
    const result = await executePlacesHandoff(
      { draft, allowAnchorOnly: true },
      mkDeps({ searchPlacesByText: spy as never }),
    );
    expect(result.kind).toBe("success");
    expect(captured).toEqual(["渋谷 スタバ"]); // chain あり時は従来通り
  });

  it("[event_where] allowAnchorOnly 不指定 + anchor only → draft_not_ready (= 既存挙動完全維持)", async () => {
    const draft: SearchQueryDraft = {
      anchorRegion: "東京駅",
      chainToken: null,
      categoryToken: null,
      readyForHandoff: true,
    };
    const searchSpy = vi.fn(async () => []);
    const result = await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: searchSpy as never }),
    );
    expect(result.kind).toBe("provider_error");
    if (result.kind === "provider_error") {
      expect(result.reason).toBe("draft_not_ready");
    }
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it("[event_where] allowAnchorOnly: false 明示 + anchor only → draft_not_ready (= 既存挙動完全維持)", async () => {
    const draft: SearchQueryDraft = {
      anchorRegion: "東京駅",
      chainToken: null,
      categoryToken: null,
      readyForHandoff: true,
    };
    const searchSpy = vi.fn(async () => []);
    const result = await executePlacesHandoff(
      { draft, allowAnchorOnly: false },
      mkDeps({ searchPlacesByText: searchSpy as never }),
    );
    expect(result.kind).toBe("provider_error");
    if (result.kind === "provider_error") {
      expect(result.reason).toBe("draft_not_ready");
    }
  });

  it("[invariant] allowAnchorOnly: true でも anchor null → draft_not_ready (= anchor 必須)", async () => {
    const draft: SearchQueryDraft = {
      anchorRegion: null,
      chainToken: null,
      categoryToken: null,
      readyForHandoff: true,
    };
    const searchSpy = vi.fn(async () => []);
    const result = await executePlacesHandoff(
      { draft, allowAnchorOnly: true },
      mkDeps({ searchPlacesByText: searchSpy as never }),
    );
    expect(result.kind).toBe("provider_error");
    if (result.kind === "provider_error") {
      expect(result.reason).toBe("draft_not_ready");
    }
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it("[invariant] allowAnchorOnly: true でも anchor 空白文字 → draft_not_ready", async () => {
    const draft: SearchQueryDraft = {
      anchorRegion: "   ",
      chainToken: null,
      categoryToken: null,
      readyForHandoff: true,
    };
    const result = await executePlacesHandoff(
      { draft, allowAnchorOnly: true },
      mkDeps({ searchPlacesByText: (async () => []) as never }),
    );
    expect(result.kind).toBe("provider_error");
    if (result.kind === "provider_error") {
      expect(result.reason).toBe("draft_not_ready");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 executePlacesHandoff — success
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("executePlacesHandoff — success", () => {
  it("returns normalized candidates with success kind", async () => {
    const draft = mkDraft({ chainToken: "スタバ" });
    const places: PlacesApiPlace[] = [
      mkPlace({
        id: "place_1",
        displayName: { text: "スターバックス甲府駅前店", languageCode: "ja" },
        shortFormattedAddress: "山梨県甲府市丸の内1",
        location: { latitude: 35.6678, longitude: 138.5686 },
        types: ["cafe", "food"],
      }),
      mkPlace({
        id: "place_2",
        displayName: { text: "スターバックス昭和店", languageCode: "ja" },
        location: { latitude: 35.64, longitude: 138.55 },
      }),
    ];
    const result = await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: (async () => places) as never }),
    );
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]!.placeId).toBe("place_1");
    expect(result.candidates[0]!.coordinates).toEqual({
      lat: 35.6678,
      lng: 138.5686,
    });
    expect(result.candidates[0]!.chainToken).toBe("スタバ");
    expect(result.candidates[0]!.rawRef).toEqual({
      provider: "google_places",
      placeId: "place_1",
    });
    expect(result.candidates[0]!.category).toBe("cafe");
    expect(result.candidates[0]!.distanceFromAnchor).toBeNull();
    expect(result.queryFingerprint).toBe(buildQueryFingerprint(draft));
  });

  it("filters out CLOSED_PERMANENTLY while keeping others", async () => {
    const draft = mkDraft();
    const places: PlacesApiPlace[] = [
      mkPlace({ id: "ok", businessStatus: "OPERATIONAL" }),
      mkPlace({ id: "closed", businessStatus: "CLOSED_PERMANENTLY" }),
      mkPlace({ id: "temp_closed", businessStatus: "CLOSED_TEMPORARILY" }),
    ];
    const result = await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: (async () => places) as never }),
    );
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.candidates.map((c) => c.placeId)).toEqual(["ok", "temp_closed"]);
  });

  it("filters out empty id / missing displayName", async () => {
    const draft = mkDraft();
    const places: PlacesApiPlace[] = [
      mkPlace({ id: "keep" }),
      { id: "", displayName: { text: "x", languageCode: "ja" }, location: { latitude: 35, longitude: 138 } },
      { id: "no_name", displayName: { text: "", languageCode: "ja" }, location: { latitude: 35, longitude: 138 } },
    ];
    const result = await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: (async () => places) as never }),
    );
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.placeId).toBe("keep");
  });

  it("computes distanceFromAnchor when anchorCoords supplied", async () => {
    const draft = mkDraft();
    const anchorCoords = { lat: 35.6678, lng: 138.5686 };
    const places: PlacesApiPlace[] = [
      mkPlace({
        id: "near",
        location: { latitude: 35.6678, longitude: 138.5686 }, // 0m
      }),
      mkPlace({
        id: "far",
        location: { latitude: 35.6778, longitude: 138.5786 }, // ~1.3km
      }),
    ];
    const result = await executePlacesHandoff(
      { draft, anchorCoords },
      mkDeps({ searchPlacesByText: (async () => places) as never }),
    );
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.candidates[0]!.distanceFromAnchor).toBeCloseTo(0, 0);
    expect(result.candidates[1]!.distanceFromAnchor).toBeGreaterThan(500);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 query text assembly & Places API call parameters
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("executePlacesHandoff — call parameters", () => {
  it("uses chain when both chain and category present (chain is more specific)", async () => {
    const draft = mkDraft({
      anchorRegion: "甲府",
      chainToken: "スタバ",
      categoryToken: "カフェ",
    });
    const searchSpy = vi.fn(async (_opts: TextSearchOptions) => [] as PlacesApiPlace[]);
    await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: searchSpy as never }),
    );
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy.mock.calls[0]![0]).toMatchObject({
      textQuery: "甲府 スタバ",
    });
  });

  it("falls back to category when chain missing", async () => {
    const draft = mkDraft({
      anchorRegion: "甲府",
      chainToken: null,
      categoryToken: "カフェ",
    });
    const searchSpy = vi.fn(async (_opts: TextSearchOptions) => [] as PlacesApiPlace[]);
    await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: searchSpy as never }),
    );
    expect(searchSpy.mock.calls[0]![0]).toMatchObject({
      textQuery: "甲府 カフェ",
    });
  });

  it("passes locationBias when anchorCoords supplied", async () => {
    const draft = mkDraft();
    const searchSpy = vi.fn(async (_opts: TextSearchOptions) => [] as PlacesApiPlace[]);
    await executePlacesHandoff(
      { draft, anchorCoords: { lat: 35.66, lng: 138.56 }, anchorBiasRadiusMeters: 2000 },
      mkDeps({ searchPlacesByText: searchSpy as never }),
    );
    expect(searchSpy.mock.calls[0]![0]).toMatchObject({
      locationBias: { lat: 35.66, lng: 138.56, radius: 2000 },
    });
  });

  it("omits locationBias when anchorCoords not supplied", async () => {
    const draft = mkDraft();
    const searchSpy = vi.fn(async (_opts: TextSearchOptions) => [] as PlacesApiPlace[]);
    await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: searchSpy as never }),
    );
    expect(searchSpy.mock.calls[0]![0]).not.toHaveProperty("locationBias");
  });

  it("calls searchPlacesByText exactly once (no cache fallback in commit 3)", async () => {
    const draft = mkDraft();
    const places: PlacesApiPlace[] = [mkPlace({ id: "p1" })];
    const searchSpy = vi.fn(async () => places);
    await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: searchSpy as never }),
    );
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });

  it("uses Basic-tier maxResultCount default 5 unless overridden", async () => {
    const draft = mkDraft();
    const searchSpy = vi.fn(async (_opts: TextSearchOptions) => [] as PlacesApiPlace[]);
    await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: searchSpy as never }),
    );
    expect(searchSpy.mock.calls[0]![0]).toMatchObject({ maxResultCount: 5 });

    const searchSpy2 = vi.fn(async (_opts: TextSearchOptions) => [] as PlacesApiPlace[]);
    await executePlacesHandoff(
      { draft, maxResultCount: 3 },
      mkDeps({ searchPlacesByText: searchSpy2 as never }),
    );
    expect(searchSpy2.mock.calls[0]![0]).toMatchObject({ maxResultCount: 3 });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6 result kind discriminant integrity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("result kind discriminant", () => {
  it("always returns a queryFingerprint regardless of kind", async () => {
    const draft = mkDraft();

    const success = await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: (async () => [mkPlace({ id: "p" })]) as never }),
    );
    const zero = await executePlacesHandoff(
      { draft },
      mkDeps({ searchPlacesByText: (async () => []) as never }),
    );
    const err = await executePlacesHandoff(
      { draft },
      mkDeps({
        isPlacesApiAvailable: () => false,
        searchPlacesByText: (async () => []) as never,
      }),
    );
    const expected = buildQueryFingerprint(draft);
    expect(success.queryFingerprint).toBe(expected);
    expect(zero.queryFingerprint).toBe(expected);
    expect(err.queryFingerprint).toBe(expected);
  });

  it("same fingerprint across repeated identical drafts (stable)", async () => {
    const d1 = mkDraft();
    const d2 = mkDraft();
    expect(buildQueryFingerprint(d1)).toBe(buildQueryFingerprint(d2));
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7 classifyProviderErrorForLog
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyProviderErrorForLog", () => {
  it("classifies draft_not_ready as route_invariant_mismatch", () => {
    expect(classifyProviderErrorForLog("draft_not_ready")).toBe(
      "route_invariant_mismatch",
    );
  });

  it("classifies api_key_missing as provider_failure", () => {
    expect(classifyProviderErrorForLog("api_key_missing")).toBe(
      "provider_failure",
    );
  });

  it("classifies api_throw as provider_failure", () => {
    expect(classifyProviderErrorForLog("api_throw")).toBe("provider_failure");
  });
});
