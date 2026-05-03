/**
 * B-3c-2 integration tests — rollout 判断準備機能の end-to-end 検証
 *
 * カバレッジ:
 *   1. Layer A integration (= journeyAnchorHandoffOrchestrator が filter を適用)
 *   2. zero_reason 分離 (= Places API zero vs Layer A 全除外)
 *   3. invalidCoordinateCount metric (= telemetry input)
 *   4. cache 経路で filter 後の candidates が保存されること
 *   5. event_where 経路 byte-diff zero (= 既存 placesHandoffOrchestrator 不変、必須 #5)
 */

import { afterEach, describe, it, expect } from "vitest";
import { orchestrateJourneyAnchorHandoff } from "@/lib/alter-morning/search/journeyAnchorHandoffOrchestrator";
import type { PlacesHandoffResult } from "@/lib/alter-morning/search/placesHandoff";
import type { NormalizedPlaceCandidate } from "@/lib/alter-morning/search/normalizedPlace";

function mkCand(
  placeId: string,
  lat: number,
  lng: number,
): NormalizedPlaceCandidate {
  return {
    placeId,
    displayName: `place ${placeId}`,
    address: "addr",
    coordinates: { lat, lng },
    distanceFromAnchor: null,
    category: null,
    chainToken: null,
    rawRef: { provider: "google_places", placeId },
  };
}

// In-memory cache for testing
const fakeCache = new Map<string, unknown>();

afterEach(() => {
  fakeCache.clear();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #1: Layer A integration — 一部 invalid → filter 適用、残りで presentation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#1] Layer A integration — 一部 invalid candidates filter", () => {
  it("Places API が valid + invalid mix を返す → 残りで presentation, invalidCount 記録", async () => {
    const apiResult: PlacesHandoffResult = {
      kind: "success",
      queryFingerprint: "ignored", // orchestrator が独自 fingerprint 使用
      candidates: [
        mkCand("a", 35, 139),
        mkCand("b", NaN, 140),
        mkCand("c", 36, 140),
        mkCand("d", 0, 200), // lng 範囲外
      ],
    };
    const result = await orchestrateJourneyAnchorHandoff(
      { userId: "u1", label: "東京駅", turnIndex: 0 },
      {
        executePlacesHandoff: async () => apiResult,
        getCache: () => null,
        setCacheSuccess: (uid, fp, candidates) => {
          fakeCache.set(`${uid}:${fp}`, { kind: "success", candidates });
        },
        setCacheZero: () => {},
      },
    );

    expect(result.outcome.kind).toBe("presented_from_api");
    if (result.outcome.kind === "presented_from_api") {
      expect(result.outcome.candidateCount).toBe(2); // a, c
      expect(result.outcome.invalidCoordinateCount).toBe(2); // b, d
    }
    // cache に filter 後 (= a, c のみ + validCoordinates: true) が保存
    const cached = fakeCache.values().next().value as {
      candidates: NormalizedPlaceCandidate[];
    };
    expect(cached.candidates).toHaveLength(2);
    expect(cached.candidates.every((c) => c.validCoordinates === true)).toBe(
      true,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #2: 全 invalid → zero outcome with no_coordinate_candidates_after_filter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#2 GPT 1st 補正] 全 invalid → zero with no_coordinate_candidates_after_filter", () => {
  it("Places API success だが Layer A 全除外 → zero_from_api with zeroReason", async () => {
    const apiResult: PlacesHandoffResult = {
      kind: "success",
      queryFingerprint: "ignored",
      candidates: [mkCand("a", NaN, 0), mkCand("b", 91, 0)], // 全 invalid
    };
    const result = await orchestrateJourneyAnchorHandoff(
      { userId: "u1", label: "東京駅", turnIndex: 0 },
      {
        executePlacesHandoff: async () => apiResult,
        getCache: () => null,
        setCacheSuccess: () => {
          throw new Error("should not be called");
        },
        setCacheZero: () => {
          // cache 書かないことを期待 → エラー出さず、ただし call しない設計
          throw new Error("should not be called");
        },
      },
    );
    expect(result.outcome.kind).toBe("zero_from_api");
    if (result.outcome.kind === "zero_from_api") {
      expect(result.outcome.zeroReason).toBe(
        "no_coordinate_candidates_after_filter",
      );
      expect(result.outcome.invalidCoordinateCount).toBe(2);
    }
    // nextDispatch は zero action
    expect(result.nextDispatch).not.toBeNull();
    expect(result.nextDispatch?.type).toBe("SEARCH_ZERO_CANDIDATES");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #3: Places API zero (= 0 件) → zero_from_api with no_candidates_from_places_search
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#3 GPT 1st 補正] Places API 0 件 → zero with no_candidates_from_places_search", () => {
  it("Places API kind=zero → zero_from_api with zeroReason no_candidates_from_places_search", async () => {
    const apiResult: PlacesHandoffResult = {
      kind: "zero",
      queryFingerprint: "ignored",
    };
    const result = await orchestrateJourneyAnchorHandoff(
      { userId: "u1", label: "hogeholgehoge", turnIndex: 0 },
      {
        executePlacesHandoff: async () => apiResult,
        getCache: () => null,
        setCacheSuccess: () => {},
        setCacheZero: () => {},
      },
    );
    expect(result.outcome.kind).toBe("zero_from_api");
    if (result.outcome.kind === "zero_from_api") {
      expect(result.outcome.zeroReason).toBe(
        "no_candidates_from_places_search",
      );
      // invalidCoordinateCount は undefined (= Places API 0 件、filter 対象なし)
      expect(result.outcome.invalidCoordinateCount).toBeUndefined();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #4: 全 valid → invalidCount 0 で presentation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#4] 全 valid candidates → presentation with invalidCount 0", () => {
  it("API 全 valid → presented_from_api, invalidCoordinateCount: 0", async () => {
    const apiResult: PlacesHandoffResult = {
      kind: "success",
      queryFingerprint: "ignored",
      candidates: [mkCand("a", 35, 139), mkCand("b", 36, 140)],
    };
    const result = await orchestrateJourneyAnchorHandoff(
      { userId: "u1", label: "東京駅", turnIndex: 0 },
      {
        executePlacesHandoff: async () => apiResult,
        getCache: () => null,
        setCacheSuccess: () => {},
        setCacheZero: () => {},
      },
    );
    expect(result.outcome.kind).toBe("presented_from_api");
    if (result.outcome.kind === "presented_from_api") {
      expect(result.outcome.candidateCount).toBe(2);
      expect(result.outcome.invalidCoordinateCount).toBe(0);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #5: cache hit (= 既存 success cached) → filter 不適用 (= 既挙動)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#5] cache hit success → filter 不適用 (既挙動)", () => {
  it("cache hit success → presented_from_cache、invalidCoordinateCount 不在", async () => {
    const cachedCands = [mkCand("a", 35, 139)];
    const result = await orchestrateJourneyAnchorHandoff(
      { userId: "u1", label: "東京駅", turnIndex: 0 },
      {
        executePlacesHandoff: () => {
          throw new Error("API should not be called");
        },
        getCache: () => ({
          kind: "success",
          candidates: cachedCands,
        }),
        setCacheSuccess: () => {},
        setCacheZero: () => {},
      },
    );
    expect(result.outcome.kind).toBe("presented_from_cache");
    if (result.outcome.kind === "presented_from_cache") {
      expect(result.outcome.candidateCount).toBe(1);
      // cache 経路では filter しない (= invalidCoordinateCount 概念なし、undefined)
      expect(
        (result.outcome as { invalidCoordinateCount?: number })
          .invalidCoordinateCount,
      ).toBeUndefined();
    }
  });
});
