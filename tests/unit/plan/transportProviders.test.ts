/**
 * Phase 3-L L-2 (pure) — provider implementations tests
 *
 * 検証範囲:
 *   - createHeuristicDistanceProvider
 *     - privacy guard (= sensitive_both / location_unknown → unresolved)
 *     - coords missing → location_unknown
 *     - segmentBase missing → no_provider_available
 *     - heuristic null (= ≤0.2km) → heuristic_failed
 *     - happy path → resolved with confidence low / heuristic_distance_only
 *     - mode は常に "unknown" (= 設計 §8 「徒歩 default 採らない」)
 *     - distanceM field 注入
 *     - 既存 estimateNeutralDurationMin reuse (= 段階テーブル境界)
 *   - createUnresolvedProvider
 *     - 与えた reason をそのまま返す
 *     - id "none", health "healthy"
 *     - 全 privacy class で動く (= state-less)
 *   - createManualUserProvider (= shell only)
 *     - localStorage 不使用 (= shell 段階の最重要 invariant)
 *     - user 明示 duration を高 confidence で resolved 化
 *     - invalid user input は no_provider_available
 *     - privacy guard
 *
 * 不変原則:
 *   - LLM 不使用
 *   - no DB / no localStorage / no network / no env
 *   - 既存 alter-morning file 無変更 (= reuse のみ)
 */

import { describe, expect, it, vi } from "vitest";

import {
  createHeuristicDistanceProvider,
  type HeuristicResolveInput,
} from "@/lib/plan/transport/heuristicDistanceProvider";
import { createManualUserProvider } from "@/lib/plan/transport/manualUserProvider";
import { createUnresolvedProvider } from "@/lib/plan/transport/unresolvedProvider";
import type {
  MovementResolutionInput,
  MovementSegmentResolved,
  MovementUnresolvedReason,
} from "@/lib/plan/transport/transportTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Common fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TOKYO_STATION = { lat: 35.6812, lng: 139.7671 };
const SHINJUKU_STATION = { lat: 35.6896, lng: 139.7006 };
const FAR_AWAY_OSAKA = { lat: 34.7024, lng: 135.4959 };

const BASIC_BASE = {
  fromNodeId: "node-1",
  toNodeId: "node-2",
  fromLocationText: "Tokyo Station",
  toLocationText: "Shinjuku Station",
  sensitiveProximity: false,
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. HeuristicDistanceProvider — privacy guard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("HeuristicDistanceProvider — privacy guard", () => {
  it("returns sensitive_proximity for sensitive_both privacy class", async () => {
    const provider = createHeuristicDistanceProvider();
    const result = await provider.resolveDuration({
      privacyClass: "sensitive_both",
      fromCoords: TOKYO_STATION,
      toCoords: SHINJUKU_STATION,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("sensitive_proximity");
    }
  });

  it("returns location_unknown for location_unknown privacy class", async () => {
    const provider = createHeuristicDistanceProvider();
    const result = await provider.resolveDuration({
      privacyClass: "location_unknown",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("location_unknown");
    }
  });

  it("returns location_unknown when fromCoords missing", async () => {
    const provider = createHeuristicDistanceProvider();
    const result = await provider.resolveDuration({
      privacyClass: "normal",
      toCoords: SHINJUKU_STATION,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("location_unknown");
    }
  });

  it("returns location_unknown when toCoords missing", async () => {
    const provider = createHeuristicDistanceProvider();
    const result = await provider.resolveDuration({
      privacyClass: "normal",
      fromCoords: TOKYO_STATION,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("location_unknown");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. HeuristicDistanceProvider — happy path
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("HeuristicDistanceProvider — happy path", () => {
  it("resolves Tokyo → Shinjuku (~6km) to a finite duration with low confidence", async () => {
    const provider = createHeuristicDistanceProvider();
    const input: HeuristicResolveInput = {
      privacyClass: "normal",
      fromCoords: TOKYO_STATION,
      toCoords: SHINJUKU_STATION,
      segmentBase: BASIC_BASE,
    };
    const result = await provider.resolveDuration(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const s = result.segment;
      expect(s.timingStatus).toBe("resolved");
      expect(Number.isFinite(s.estimatedDurationMin)).toBe(true);
      expect(s.estimatedDurationMin).toBeGreaterThan(0);
      expect(s.source).toBe("heuristic_distance");
      expect(s.confidence.level).toBe("low");
      expect(s.confidence.reason).toBe("heuristic_distance_only");
      // mode 常に unknown (= §8 「徒歩 default 採らない」)
      expect(s.modeCandidate.mode).toBe("unknown");
      expect(s.modeCandidate.confidence.level).toBe("low");
      // privacy 継承
      expect(s.privacyClass).toBe("normal");
      // base 転写
      expect(s.fromNodeId).toBe("node-1");
      expect(s.toNodeId).toBe("node-2");
      expect(s.fromLocationText).toBe("Tokyo Station");
      // distance field 注入
      expect(typeof s.distanceM).toBe("number");
      expect(s.distanceM).toBeGreaterThan(5000);
      expect(s.distanceM).toBeLessThan(8000);
    }
  });

  it("resolves long distance (Tokyo → Osaka ~400km) to 90 min (= top bin)", async () => {
    const provider = createHeuristicDistanceProvider();
    const result = await provider.resolveDuration({
      privacyClass: "normal",
      fromCoords: TOKYO_STATION,
      toCoords: FAR_AWAY_OSAKA,
      segmentBase: BASIC_BASE,
    } as HeuristicResolveInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segment.estimatedDurationMin).toBe(90);
    }
  });

  it("returns heuristic_failed when distance ≤ 0.2km (= same-point cuttoff)", async () => {
    const provider = createHeuristicDistanceProvider();
    const samePoint = TOKYO_STATION;
    const veryClose = { lat: 35.6812, lng: 139.7672 }; // ~10m east
    const result = await provider.resolveDuration({
      privacyClass: "normal",
      fromCoords: samePoint,
      toCoords: veryClose,
      segmentBase: BASIC_BASE,
    } as HeuristicResolveInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("heuristic_failed");
    }
  });

  it("returns heuristic_failed when coords contain NaN", async () => {
    const provider = createHeuristicDistanceProvider();
    const result = await provider.resolveDuration({
      privacyClass: "normal",
      fromCoords: { lat: Number.NaN, lng: 139.7 },
      toCoords: SHINJUKU_STATION,
      segmentBase: BASIC_BASE,
    } as HeuristicResolveInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("heuristic_failed");
    }
  });

  it("returns no_provider_available when segmentBase is missing", async () => {
    const provider = createHeuristicDistanceProvider();
    const result = await provider.resolveDuration({
      privacyClass: "normal",
      fromCoords: TOKYO_STATION,
      toCoords: SHINJUKU_STATION,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_provider_available");
    }
  });

  it("inherits sensitive_adjacent privacy class but still resolves", async () => {
    const provider = createHeuristicDistanceProvider();
    const result = await provider.resolveDuration({
      privacyClass: "sensitive_adjacent",
      fromCoords: TOKYO_STATION,
      toCoords: SHINJUKU_STATION,
      segmentBase: BASIC_BASE,
    } as HeuristicResolveInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segment.privacyClass).toBe("sensitive_adjacent");
    }
  });

  it("id is 'heuristic_distance' and health is 'healthy'", () => {
    const provider = createHeuristicDistanceProvider();
    expect(provider.id).toBe("heuristic_distance");
    expect(provider.health).toBe("healthy");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. HeuristicDistanceProvider — reuses existing alter-morning durationHeuristic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("HeuristicDistanceProvider — alter-morning reuse契約", () => {
  it("matches estimateNeutralDurationMin 段階テーブル for representative distances", async () => {
    const provider = createHeuristicDistanceProvider();
    // ≤1km bin → 10 min
    const near = { lat: 35.6812, lng: 139.7771 }; // ~0.9km east of Tokyo Station
    const r1 = await provider.resolveDuration({
      privacyClass: "normal",
      fromCoords: TOKYO_STATION,
      toCoords: near,
      segmentBase: BASIC_BASE,
    } as HeuristicResolveInput);
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      // ~0.9km is just within ≤1km bin → 10
      // ※ 境界誤差で 15 になる可能性もあるため許容範囲を持たせる
      expect([10, 15]).toContain(r1.segment.estimatedDurationMin);
    }

    // Tokyo → Shinjuku ~6km → ≤7km bin → 25 min
    const r2 = await provider.resolveDuration({
      privacyClass: "normal",
      fromCoords: TOKYO_STATION,
      toCoords: SHINJUKU_STATION,
      segmentBase: BASIC_BASE,
    } as HeuristicResolveInput);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.segment.estimatedDurationMin).toBe(25);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. UnresolvedProvider
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("UnresolvedProvider", () => {
  it("returns the given reason verbatim", async () => {
    const reasons: MovementUnresolvedReason[] = [
      "location_unknown",
      "sensitive_proximity",
      "api_timeout",
      "api_error",
      "rate_limit",
      "cost_cap_exceeded",
      "heuristic_failed",
      "no_provider_available",
    ];
    for (const reason of reasons) {
      const provider = createUnresolvedProvider(reason);
      const result = await provider.resolveDuration({ privacyClass: "normal" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe(reason);
      }
    }
  });

  it("id is 'none' and health is 'healthy'", () => {
    const provider = createUnresolvedProvider("no_provider_available");
    expect(provider.id).toBe("none");
    expect(provider.health).toBe("healthy");
  });

  it("is state-less across calls (= same result for identical input)", async () => {
    const provider = createUnresolvedProvider("api_timeout");
    const r1 = await provider.resolveDuration({ privacyClass: "normal" });
    const r2 = await provider.resolveDuration({ privacyClass: "sensitive_both" });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    if (!r1.ok && !r2.ok) {
      expect(r1.reason).toBe("api_timeout");
      expect(r2.reason).toBe("api_timeout");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. ManualUserProvider (= shell only)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ManualUserProvider — shell only", () => {
  it("does NOT touch localStorage (= shell phase invariant)", async () => {
    // localStorage spy — provider が呼ぶと test が落ちる
    const localStorageGetSpy = vi.fn();
    const localStorageSetSpy = vi.fn();
    const originalLocalStorage = globalThis.localStorage;

    // Replace localStorage with spied stub
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: localStorageGetSpy,
        setItem: localStorageSetSpy,
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      },
    });

    try {
      const provider = createManualUserProvider();
      await provider.resolveDuration({
        privacyClass: "normal",
        fromCoords: TOKYO_STATION,
        toCoords: SHINJUKU_STATION,
        segmentBase: BASIC_BASE,
        userDurationMin: 30,
      } as MovementResolutionInput & {
        segmentBase: typeof BASIC_BASE;
        userDurationMin: number;
      });

      expect(localStorageGetSpy).not.toHaveBeenCalled();
      expect(localStorageSetSpy).not.toHaveBeenCalled();
    } finally {
      // Restore
      if (originalLocalStorage) {
        Object.defineProperty(globalThis, "localStorage", {
          configurable: true,
          value: originalLocalStorage,
        });
      }
    }
  });

  it("resolves user-explicit duration with confidence high / user_explicit", async () => {
    const provider = createManualUserProvider();
    const result = await provider.resolveDuration({
      privacyClass: "normal",
      segmentBase: BASIC_BASE,
      userDurationMin: 22,
      userMode: "walking",
    } as MovementResolutionInput & {
      segmentBase: typeof BASIC_BASE;
      userDurationMin: number;
      userMode: "walking";
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const s: MovementSegmentResolved = result.segment;
      expect(s.estimatedDurationMin).toBe(22);
      expect(s.source).toBe("manual_user");
      expect(s.confidence.level).toBe("high");
      expect(s.confidence.reason).toBe("user_explicit");
      expect(s.modeCandidate.mode).toBe("walking");
      expect(s.modeCandidate.confidence.level).toBe("high");
    }
  });

  it("defaults user mode to 'unknown' when not provided", async () => {
    const provider = createManualUserProvider();
    const result = await provider.resolveDuration({
      privacyClass: "normal",
      segmentBase: BASIC_BASE,
      userDurationMin: 15,
    } as MovementResolutionInput & {
      segmentBase: typeof BASIC_BASE;
      userDurationMin: number;
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segment.modeCandidate.mode).toBe("unknown");
    }
  });

  it("rejects sensitive_both privacy class", async () => {
    const provider = createManualUserProvider();
    const result = await provider.resolveDuration({
      privacyClass: "sensitive_both",
      segmentBase: BASIC_BASE,
      userDurationMin: 30,
    } as MovementResolutionInput & {
      segmentBase: typeof BASIC_BASE;
      userDurationMin: number;
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("sensitive_proximity");
    }
  });

  it("rejects location_unknown privacy class", async () => {
    const provider = createManualUserProvider();
    const result = await provider.resolveDuration({
      privacyClass: "location_unknown",
      segmentBase: BASIC_BASE,
      userDurationMin: 30,
    } as MovementResolutionInput & {
      segmentBase: typeof BASIC_BASE;
      userDurationMin: number;
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("location_unknown");
    }
  });

  it("rejects NaN / negative / non-finite user duration", async () => {
    const provider = createManualUserProvider();
    const baseInput = {
      privacyClass: "normal" as const,
      segmentBase: BASIC_BASE,
    };
    const bad = [Number.NaN, -1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const userDurationMin of bad) {
      const r = await provider.resolveDuration({
        ...baseInput,
        userDurationMin,
      } as MovementResolutionInput & {
        segmentBase: typeof BASIC_BASE;
        userDurationMin: number;
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe("no_provider_available");
      }
    }
  });

  it("rejects missing segmentBase", async () => {
    const provider = createManualUserProvider();
    const result = await provider.resolveDuration({
      privacyClass: "normal",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_provider_available");
    }
  });

  it("id is 'manual_user' and health is 'healthy'", () => {
    const provider = createManualUserProvider();
    expect(provider.id).toBe("manual_user");
    expect(provider.health).toBe("healthy");
  });
});
