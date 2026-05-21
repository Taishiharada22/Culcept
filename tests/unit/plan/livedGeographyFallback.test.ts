/**
 * Phase 2-G: livedGeographyFallback.ts — pure helper tests
 *
 * 設計書: docs/alter-plan-phase2-g-lived-geography-confidence-fallback-mini-design.md §8 / §15
 *
 * 検証範囲 (= 20+ edge case):
 *   - confidence PASS (= 全 gate 通過、 重心 + dispersion 計算)
 *   - minSamples gate (= 2 件以下で null)
 *   - dispersion gate (= maxDistanceKm threshold で null)
 *   - sensitive exclude
 *   - stale exclude (= freshDays 超過 / 未来 anchor / recurring 期限切れ)
 *   - invalid coord exclude (= NaN / 範囲外)
 *   - recurring vs one_off 同等扱い (= 1 anchor = 1 sample)
 *   - options override
 *   - pure / mutation 不変 / deterministic
 */

import { describe, it, expect } from "vitest";

import type {
  ExternalAnchor,
  OneOffExternalAnchor,
  RecurringExternalAnchor,
  AnchorSensitiveCategory,
} from "@/lib/plan/external-anchor";
import type { AnchorResolution } from "@/app/(culcept)/plan/tabs/_usePlanGeocode";
import {
  computeLivedGeographyFallback,
  type LivedGeographyOptions,
} from "@/lib/plan/livedGeographyFallback";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Test "now" (= 2026-05-21 12:00 UTC、 deterministic)
const NOW = new Date("2026-05-21T12:00:00Z");

function oneOff(opts: {
  id: string;
  date: string;
  sensitive?: AnchorSensitiveCategory;
}): OneOffExternalAnchor {
  const a: OneOffExternalAnchor = {
    id: opts.id,
    userId: "u-test",
    title: `anchor-${opts.id}`,
    startTime: "09:00",
    endTime: "10:00",
    rigidity: "soft",
    sourceId: "src-test",
    confirmedAt: "2026-05-21T00:00:00Z",
    anchorKind: "one_off",
    date: opts.date,
  };
  if (opts.sensitive) a.sensitiveCategory = opts.sensitive;
  return a;
}

function recurring(opts: {
  id: string;
  validFrom: string;
  validUntil?: string;
}): RecurringExternalAnchor {
  const a: RecurringExternalAnchor = {
    id: opts.id,
    userId: "u-test",
    title: `recurring-${opts.id}`,
    startTime: "09:00",
    endTime: "10:00",
    rigidity: "soft",
    sourceId: "src-test",
    confirmedAt: "2026-05-21T00:00:00Z",
    anchorKind: "recurring",
    validFrom: opts.validFrom,
    recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
  };
  if (opts.validUntil) a.validUntil = opts.validUntil;
  return a;
}

/** AnchorResolution Map fixture builder */
function resolveMap(
  entries: Array<{ id: string; lat?: number; lng?: number; resolution?: null }>,
): Map<string, AnchorResolution | null> {
  const m = new Map<string, AnchorResolution | null>();
  for (const e of entries) {
    if (e.resolution === null || (e.lat === undefined && e.lng === undefined)) {
      m.set(e.id, null);
    } else {
      m.set(e.id, {
        lat: e.lat!,
        lng: e.lng!,
        confidence: "high",
        resolvedName: `place-${e.id}`,
      });
    }
  }
  return m;
}

// 渋谷 / 新宿 / 池袋 (= 近接、 maxDist ~5km、 PASS 想定)
const SHIBUYA = { lat: 35.658, lng: 139.7016 };
const SHINJUKU = { lat: 35.6896, lng: 139.7006 };
const IKEBUKURO = { lat: 35.7295, lng: 139.7109 };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeLivedGeographyFallback", () => {
  describe("confidence PASS (= 全 gate 通過)", () => {
    it("3 件の近接 resolved anchor → 重心 + confidence='medium' 返却", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-05-15" }),
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(r).not.toBeNull();
      expect(r!.sampleCount).toBe(3);
      expect(r!.freshDays).toBe(30);
      expect(r!.source).toBe("lived_geography");
      expect(r!.confidence).toBe("medium");
      // 重心は 3 点の mean
      expect(r!.lat).toBeCloseTo((35.658 + 35.6896 + 35.7295) / 3, 3);
      expect(r!.lng).toBeCloseTo((139.7016 + 139.7006 + 139.7109) / 3, 3);
      // maxDistance < 30km
      expect(r!.maxDistanceKm).toBeLessThan(30);
    });

    it("5 件すべて近接 → 全 5 件 sample 集計", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-05-15" }),
        oneOff({ id: "b", date: "2026-05-16" }),
        oneOff({ id: "c", date: "2026-05-17" }),
        oneOff({ id: "d", date: "2026-05-18" }),
        oneOff({ id: "e", date: "2026-05-19" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHIBUYA },
        { id: "c", ...SHIBUYA },
        { id: "d", ...SHIBUYA },
        { id: "e", ...SHIBUYA },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(r).not.toBeNull();
      expect(r!.sampleCount).toBe(5);
      // 同地点なので maxDistance = 0
      expect(r!.maxDistanceKm).toBe(0);
    });
  });

  describe("minSamples gate (= sample 不足 → null)", () => {
    it("resolved 2 件 → null (minSamples=3 default)", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-05-15" }),
        oneOff({ id: "b", date: "2026-05-18" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(r).toBeNull();
    });

    it("resolved 0 件 → null", () => {
      const r = computeLivedGeographyFallback([], new Map(), NOW);
      expect(r).toBeNull();
    });

    it("anchors 多数あれど resolutions が全 null → null", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-05-15" }),
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", resolution: null },
        { id: "b", resolution: null },
        { id: "c", resolution: null },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(r).toBeNull();
    });
  });

  describe("dispersion gate (= maxDistanceKm 超過 → null)", () => {
    it("成田 / 渋谷 / 横浜 (= 散らばり過ぎ) → null (default 30km threshold)", () => {
      const NARITA = { lat: 35.78, lng: 140.32 };
      const YOKOHAMA = { lat: 35.4437, lng: 139.638 };
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-05-15" }),
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...NARITA },
        { id: "b", ...SHIBUYA },
        { id: "c", ...YOKOHAMA },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(r).toBeNull();
    });

    it("maxDistanceKm option を緩めれば PASS 可能", () => {
      const NARITA = { lat: 35.78, lng: 140.32 };
      const YOKOHAMA = { lat: 35.4437, lng: 139.638 };
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-05-15" }),
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...NARITA },
        { id: "b", ...SHIBUYA },
        { id: "c", ...YOKOHAMA },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW, {
        maxDistanceKm: 100, // 100km まで許容
      });
      expect(r).not.toBeNull();
      expect(r!.sampleCount).toBe(3);
    });
  });

  describe("sensitive exclude (= privacy)", () => {
    it("sensitive anchor は sample 対象外", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-05-15", sensitive: "medical" }),
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      // a は除外、 b + c で 2 件 → minSamples 未達 → null
      expect(r).toBeNull();
    });

    it("全 sensitive → null", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-05-15", sensitive: "medical" }),
        oneOff({ id: "b", date: "2026-05-18", sensitive: "legal" }),
        oneOff({ id: "c", date: "2026-05-20", sensitive: "other" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(r).toBeNull();
    });
  });

  describe("stale exclude (= freshDays 超過 / 未来)", () => {
    it("30 日超過 anchor は sample 対象外", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-01-01" }), // 4 ヶ月前、 stale
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      // a は stale 除外 → 2 件 → minSamples 未達 → null
      expect(r).toBeNull();
    });

    it("未来 anchor は対象外 (= past only)", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-06-01" }), // 未来
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(r).toBeNull(); // a 除外、 2 件不足
    });

    it("freshDays=90 で 1 ヶ月以上の anchor を含めて PASS", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-03-01" }), // 81 日前、 30 日 default なら stale だが 90 日なら fresh
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW, {
        freshDays: 90,
      });
      expect(r).not.toBeNull();
      expect(r!.sampleCount).toBe(3);
      expect(r!.freshDays).toBe(90);
    });
  });

  describe("invalid coord exclude (= NaN / 範囲外)", () => {
    it("lat=NaN は sample 除外", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-05-15" }),
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", lat: NaN, lng: 139.7 },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      // a 除外 → 2 件不足 → null
      expect(r).toBeNull();
    });

    it("lat=999 (= 範囲外) は sample 除外", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-05-15" }),
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", lat: 999, lng: 139.7 },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(r).toBeNull();
    });
  });

  describe("recurring anchor (= 1 anchor = 1 sample)", () => {
    it("recurring (valid 期間内) + one_off 2 件 → 3 sample で PASS", () => {
      const anchors: ExternalAnchor[] = [
        recurring({ id: "a", validFrom: "2026-01-01" }),
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(r).not.toBeNull();
      expect(r!.sampleCount).toBe(3); // recurring は 1 sample (= occurrence overweight 回避)
    });

    it("recurring の validUntil が freshDays より前 → 除外", () => {
      const anchors: ExternalAnchor[] = [
        recurring({
          id: "a",
          validFrom: "2025-01-01",
          validUntil: "2025-12-01", // freshDays=30 で 30 日より前 → stale
        }),
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(r).toBeNull(); // a stale で 2 件不足
    });

    it("recurring の validFrom が未来 → 除外", () => {
      const anchors: ExternalAnchor[] = [
        recurring({ id: "a", validFrom: "2027-01-01" }),
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(r).toBeNull();
    });
  });

  describe("options override", () => {
    it("minSamples=2 でも PASS 可能", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-05-15" }),
        oneOff({ id: "b", date: "2026-05-18" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW, {
        minSamples: 2,
      });
      expect(r).not.toBeNull();
      expect(r!.sampleCount).toBe(2);
    });

    it("各 option default 値", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-05-15" }),
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(r!.freshDays).toBe(30); // default
    });
  });

  // ─── boundary / pure ───

  describe("boundary / pure / immutability", () => {
    it("date が malformed なら anchor 除外", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "not-a-date" }),
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const r = computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(r).toBeNull(); // a 除外 → 2 件不足
    });

    it("deterministic: 同入力で同出力", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-05-15" }),
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const r1 = computeLivedGeographyFallback(anchors, resolutions, NOW);
      const r2 = computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(r1).toEqual(r2);
    });

    it("入力 anchors / resolutions を mutate しない", () => {
      const anchors: ExternalAnchor[] = [
        oneOff({ id: "a", date: "2026-05-15" }),
        oneOff({ id: "b", date: "2026-05-18" }),
        oneOff({ id: "c", date: "2026-05-20" }),
      ];
      const resolutions = resolveMap([
        { id: "a", ...SHIBUYA },
        { id: "b", ...SHINJUKU },
        { id: "c", ...IKEBUKURO },
      ]);
      const anchorsSnap = JSON.stringify(anchors);
      const resolSnap = JSON.stringify(Array.from(resolutions.entries()));
      computeLivedGeographyFallback(anchors, resolutions, NOW);
      expect(JSON.stringify(anchors)).toBe(anchorsSnap);
      expect(JSON.stringify(Array.from(resolutions.entries()))).toBe(resolSnap);
    });
  });

  // ─── midnight cross / multi-day (= scope 外、 helper は単純に処理) ───
  describe("scope 外の defensive", () => {
    it("anchors 配列 0 件 → null", () => {
      const r = computeLivedGeographyFallback([], new Map(), NOW);
      expect(r).toBeNull();
    });
  });
});
