/**
 * placesHandoffCache — PR-9 commit 4 L1 best-effort cache tests
 *
 * 検証観点:
 *   - 基本 get/set の hit/miss
 *   - TTL 期限切れで purge
 *   - LRU 近似: 再 set で末尾へ、overflow で先頭 evict
 *   - success / zero 両方保存、混在時も正しく返す
 *   - 空 userId / 空 fingerprint で no-op
 *   - invalidateHandoffCacheForUser が特定 user のみ削除
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __clearHandoffCache,
  __handoffCacheSize,
  getHandoffCache,
  invalidateHandoffCacheForUser,
  setHandoffCacheSuccess,
  setHandoffCacheZero,
} from "@/lib/alter-morning/search/placesHandoffCache";
import type { NormalizedPlaceCandidate } from "@/lib/alter-morning/search/normalizedPlace";

function mkCandidate(id: string): NormalizedPlaceCandidate {
  return {
    placeId: id,
    displayName: `店舗 ${id}`,
    address: "山梨県甲府市",
    coordinates: { lat: 35.66, lng: 138.56 },
    distanceFromAnchor: null,
    category: "cafe",
    chainToken: "スタバ",
    rawRef: { provider: "google_places", placeId: id },
  };
}

beforeEach(() => {
  __clearHandoffCache();
});

afterEach(() => {
  vi.useRealTimers();
  __clearHandoffCache();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getHandoffCache / setHandoffCacheSuccess", () => {
  it("stores and retrieves success entry", () => {
    const candidates = [mkCandidate("p1"), mkCandidate("p2")];
    setHandoffCacheSuccess("u1", "pf:v1|a=甲府|ch=スタバ|cat=-", candidates);
    const got = getHandoffCache("u1", "pf:v1|a=甲府|ch=スタバ|cat=-");
    expect(got?.kind).toBe("success");
    if (got?.kind === "success") {
      expect(got.candidates).toHaveLength(2);
      expect(got.candidates[0]!.placeId).toBe("p1");
    }
  });

  it("returns null for cache miss", () => {
    expect(getHandoffCache("u1", "pf:v1|a=-|ch=-|cat=-")).toBeNull();
  });

  it("scopes by userId", () => {
    setHandoffCacheSuccess("u1", "fp1", [mkCandidate("p1")]);
    expect(getHandoffCache("u2", "fp1")).toBeNull();
  });

  it("scopes by fingerprint", () => {
    setHandoffCacheSuccess("u1", "fp1", [mkCandidate("p1")]);
    expect(getHandoffCache("u1", "fp2")).toBeNull();
  });

  it("rejects empty candidates (use zero setter instead)", () => {
    setHandoffCacheSuccess("u1", "fp1", []);
    expect(getHandoffCache("u1", "fp1")).toBeNull();
  });
});

describe("setHandoffCacheZero", () => {
  it("stores and retrieves zero entry", () => {
    setHandoffCacheZero("u1", "fp1");
    const got = getHandoffCache("u1", "fp1");
    expect(got?.kind).toBe("zero");
    if (got?.kind === "zero") {
      expect(got.queryFingerprint).toBe("fp1");
    }
  });

  it("can coexist with success entries", () => {
    setHandoffCacheSuccess("u1", "fp1", [mkCandidate("p1")]);
    setHandoffCacheZero("u1", "fp2");
    expect(getHandoffCache("u1", "fp1")?.kind).toBe("success");
    expect(getHandoffCache("u1", "fp2")?.kind).toBe("zero");
  });
});

describe("TTL / expiry", () => {
  it("returns null for expired entry and purges it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T10:00:00Z"));
    setHandoffCacheSuccess("u1", "fp1", [mkCandidate("p1")], 60_000);
    expect(getHandoffCache("u1", "fp1")?.kind).toBe("success");

    vi.setSystemTime(new Date("2026-04-23T10:01:01Z")); // 61s later
    expect(getHandoffCache("u1", "fp1")).toBeNull();
    expect(__handoffCacheSize()).toBe(0);
  });

  it("ttl 0 or negative immediately expires", () => {
    setHandoffCacheSuccess("u1", "fp1", [mkCandidate("p1")], 0);
    expect(getHandoffCache("u1", "fp1")).toBeNull();
  });
});

describe("LRU / overflow", () => {
  it("re-set moves entry to end (freshness update)", () => {
    setHandoffCacheSuccess("u1", "fp1", [mkCandidate("p1")]);
    setHandoffCacheSuccess("u1", "fp2", [mkCandidate("p2")]);
    setHandoffCacheSuccess("u1", "fp1", [mkCandidate("p1b")]); // update
    const got = getHandoffCache("u1", "fp1");
    expect(got?.kind).toBe("success");
    if (got?.kind === "success") {
      expect(got.candidates[0]!.placeId).toBe("p1b");
    }
  });

  it("evicts oldest when exceeding MAX_ENTRIES (200)", () => {
    for (let i = 0; i < 205; i++) {
      setHandoffCacheSuccess("u1", `fp${i}`, [mkCandidate(`p${i}`)]);
    }
    expect(__handoffCacheSize()).toBe(200);
    // first 5 should be evicted
    expect(getHandoffCache("u1", "fp0")).toBeNull();
    expect(getHandoffCache("u1", "fp4")).toBeNull();
    // last ones present
    expect(getHandoffCache("u1", "fp204")).not.toBeNull();
  });
});

describe("fail-open on bad input", () => {
  it("empty userId does nothing", () => {
    setHandoffCacheSuccess("", "fp1", [mkCandidate("p1")]);
    expect(__handoffCacheSize()).toBe(0);
    expect(getHandoffCache("", "fp1")).toBeNull();
  });

  it("empty fingerprint does nothing", () => {
    setHandoffCacheSuccess("u1", "", [mkCandidate("p1")]);
    expect(__handoffCacheSize()).toBe(0);
  });
});

describe("invalidateHandoffCacheForUser", () => {
  it("removes only target user entries", () => {
    setHandoffCacheSuccess("u1", "fp1", [mkCandidate("p1")]);
    setHandoffCacheSuccess("u1", "fp2", [mkCandidate("p2")]);
    setHandoffCacheSuccess("u2", "fp1", [mkCandidate("p3")]);
    invalidateHandoffCacheForUser("u1");
    expect(getHandoffCache("u1", "fp1")).toBeNull();
    expect(getHandoffCache("u1", "fp2")).toBeNull();
    expect(getHandoffCache("u2", "fp1")).not.toBeNull();
  });
});
