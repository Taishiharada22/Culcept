/**
 * Phase 3-L L-1 (pure) — transportTypes + transportIntegrityContract tests
 *
 * 設計書: docs/alter-plan-phase3-l-transport-design.md §4
 *
 * 検証範囲:
 *   - type 露出 (= compile-time + runtime literal 確認)
 *   - TRANSPORT_INTEGRITY_CONTRACT: 8 invariant 全 literal true
 *   - assertMovementSegmentCompliance: 各 invariant の違反検出
 *   - MovementSegmentIntegrityError: violation key + segment snapshot 保持
 *   - exhaustiveMovementResolutionStatus: runtime error
 *   - discriminated union narrowing が type-safe に動く
 *
 * 不変原則:
 *   - LLM 不使用
 *   - pure (= no side effects)
 *   - no DB / API / network / localStorage / env access
 *   - no UI import
 */

import { describe, expect, it } from "vitest";

import {
  MovementSegmentIntegrityError,
  TRANSPORT_INTEGRITY_CONTRACT,
  assertMovementSegmentCompliance,
  assertMovementSegmentsCompliance,
  type TransportIntegrityContract,
} from "@/lib/plan/transport/transportIntegrityContract";
import {
  exhaustiveMovementResolutionStatus,
  type ConfidenceLevel,
  type ConfidenceReason,
  type MovementConfidence,
  type MovementPrivacyClass,
  type MovementResolutionInput,
  type MovementResolutionResult,
  type MovementResolutionStatus,
  type MovementResolutionTelemetry,
  type MovementSegment,
  type MovementSegmentResolved,
  type MovementSegmentUnresolved,
  type MovementUnresolvedReason,
  type ProviderHealth,
  type TransportMode,
  type TransportModeCandidate,
  type TransportProvider,
  type TransportResolutionProvider,
} from "@/lib/plan/transport/transportTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VALID_CONFIDENCE: MovementConfidence = {
  level: "low",
  reason: "heuristic_distance_only",
};

const VALID_MODE_CANDIDATE: TransportModeCandidate = {
  mode: "unknown",
  confidence: VALID_CONFIDENCE,
};

function makeResolved(
  overrides: Partial<MovementSegmentResolved> = {},
): MovementSegmentResolved {
  return {
    fromNodeId: "node-1",
    toNodeId: "node-2",
    fromLocationText: "Tokyo Station",
    toLocationText: "Shinjuku Station",
    sensitiveProximity: false,
    timingStatus: "resolved",
    estimatedDurationMin: 25,
    modeCandidate: VALID_MODE_CANDIDATE,
    source: "heuristic_distance",
    confidence: VALID_CONFIDENCE,
    privacyClass: "normal",
    ...overrides,
  };
}

function makeUnresolved(
  overrides: Partial<MovementSegmentUnresolved> = {},
): MovementSegmentUnresolved {
  return {
    fromNodeId: "node-1",
    toNodeId: "node-2",
    sensitiveProximity: false,
    timingStatus: "unresolved",
    unresolvedReason: "location_unknown",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. Type 露出 (= compile-time + literal 確認)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L-1 type exports — literal values", () => {
  it("MovementResolutionStatus has 2 literal values", () => {
    const statuses: MovementResolutionStatus[] = ["unresolved", "resolved"];
    expect(statuses).toHaveLength(2);
  });

  it("TransportProvider includes 4 literals", () => {
    const providers: TransportProvider[] = [
      "google_routes",
      "heuristic_distance",
      "manual_user",
      "none",
    ];
    expect(providers).toHaveLength(4);
  });

  it("TransportMode includes 5 literals (= walking / driving / transit / flight / unknown)", () => {
    const modes: TransportMode[] = [
      "walking",
      "driving",
      "transit",
      "flight",
      "unknown",
    ];
    expect(modes).toHaveLength(5);
  });

  it("ConfidenceLevel has 4 literals (= low / medium / high / very_high)", () => {
    const levels: ConfidenceLevel[] = ["low", "medium", "high", "very_high"];
    expect(levels).toHaveLength(4);
  });

  it("ConfidenceReason includes 6 literals", () => {
    const reasons: ConfidenceReason[] = [
      "heuristic_distance_only",
      "heuristic_default",
      "routes_api_response",
      "routes_api_with_traffic",
      "user_explicit",
      "cross_provider_match",
    ];
    expect(reasons).toHaveLength(6);
  });

  it("MovementPrivacyClass has 4 literals", () => {
    const classes: MovementPrivacyClass[] = [
      "normal",
      "sensitive_adjacent",
      "sensitive_both",
      "location_unknown",
    ];
    expect(classes).toHaveLength(4);
  });

  it("MovementUnresolvedReason includes 8 literals", () => {
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
    expect(reasons).toHaveLength(8);
  });

  it("ProviderHealth has 4 literals", () => {
    const states: ProviderHealth[] = ["healthy", "degraded", "down", "unknown"];
    expect(states).toHaveLength(4);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. Discriminated union narrowing (= type-safe)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MovementSegment discriminated union", () => {
  it("resolved branch exposes estimatedDurationMin / source / confidence", () => {
    const segment: MovementSegment = makeResolved();
    if (segment.timingStatus === "resolved") {
      expect(typeof segment.estimatedDurationMin).toBe("number");
      expect(segment.source).toBe("heuristic_distance");
      expect(segment.confidence.level).toBe("low");
      expect(segment.modeCandidate.mode).toBe("unknown");
    } else {
      throw new Error("expected resolved branch");
    }
  });

  it("unresolved branch exposes unresolvedReason", () => {
    const segment: MovementSegment = makeUnresolved({
      unresolvedReason: "sensitive_proximity",
    });
    if (segment.timingStatus === "unresolved") {
      expect(segment.unresolvedReason).toBe("sensitive_proximity");
      // resolved-only field は型レベルで存在しない (= compile time check)
      expect((segment as unknown as { estimatedDurationMin?: unknown }).estimatedDurationMin).toBeUndefined();
    } else {
      throw new Error("expected unresolved branch");
    }
  });

  it("resolved segments preserve MovementTransition base fields", () => {
    const segment = makeResolved({
      fromLocationText: "Tokyo Station",
      toLocationText: "Shinjuku Station",
      sensitiveProximity: false,
    });
    expect(segment.fromNodeId).toBe("node-1");
    expect(segment.toNodeId).toBe("node-2");
    expect(segment.fromLocationText).toBe("Tokyo Station");
    expect(segment.toLocationText).toBe("Shinjuku Station");
    expect(segment.sensitiveProximity).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. TRANSPORT_INTEGRITY_CONTRACT (= 8 invariants 全 true)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TRANSPORT_INTEGRITY_CONTRACT", () => {
  it("exposes exactly 8 invariants, all true (= literal type)", () => {
    const keys = Object.keys(TRANSPORT_INTEGRITY_CONTRACT) as Array<
      keyof TransportIntegrityContract
    >;
    expect(keys.sort()).toEqual(
      [
        "resolvedHasDuration",
        "resolvedHasMode",
        "resolvedHasSource",
        "resolvedHasConfidence",
        "unresolvedHasReason",
        "sensitiveBothIsUnresolved",
        "providerNoneOnlyUnresolved",
        "locationUnknownIsUnresolved",
      ].sort(),
    );
    for (const key of keys) {
      expect(TRANSPORT_INTEGRITY_CONTRACT[key]).toBe(true);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. assertMovementSegmentCompliance — happy path
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("assertMovementSegmentCompliance — happy path", () => {
  it("accepts a fully-formed resolved segment", () => {
    expect(() => assertMovementSegmentCompliance(makeResolved())).not.toThrow();
  });

  it("accepts a fully-formed unresolved segment", () => {
    expect(() => assertMovementSegmentCompliance(makeUnresolved())).not.toThrow();
  });

  it("accepts each valid unresolvedReason", () => {
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
      expect(() =>
        assertMovementSegmentCompliance(makeUnresolved({ unresolvedReason: reason })),
      ).not.toThrow();
    }
  });

  it("accepts each valid resolved provider", () => {
    const providers: TransportProvider[] = [
      "google_routes",
      "heuristic_distance",
      "manual_user",
    ];
    for (const source of providers) {
      expect(() =>
        assertMovementSegmentCompliance(
          makeResolved({ source: source as Exclude<TransportProvider, "none"> }),
        ),
      ).not.toThrow();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. Invariant violations (= 各 invariant が単独で fire する)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Invariant 1: resolvedHasDuration", () => {
  it("rejects NaN", () => {
    const bad = makeResolved({ estimatedDurationMin: Number.NaN });
    expect(() => assertMovementSegmentCompliance(bad)).toThrow(
      MovementSegmentIntegrityError,
    );
  });

  it("rejects Infinity", () => {
    const bad = makeResolved({ estimatedDurationMin: Number.POSITIVE_INFINITY });
    expect(() => assertMovementSegmentCompliance(bad)).toThrow(
      MovementSegmentIntegrityError,
    );
  });

  it("rejects negative duration", () => {
    const bad = makeResolved({ estimatedDurationMin: -1 });
    expect(() => assertMovementSegmentCompliance(bad)).toThrow(
      MovementSegmentIntegrityError,
    );
  });

  it("rejects non-number (= cast hack to simulate runtime bug)", () => {
    const bad = makeResolved({
      estimatedDurationMin: undefined as unknown as number,
    });
    expect(() => assertMovementSegmentCompliance(bad)).toThrow(
      MovementSegmentIntegrityError,
    );
  });

  it("includes violation=resolvedHasDuration", () => {
    const bad = makeResolved({ estimatedDurationMin: Number.NaN });
    try {
      assertMovementSegmentCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MovementSegmentIntegrityError);
      const ce = err as MovementSegmentIntegrityError;
      expect(ce.violation).toBe("resolvedHasDuration");
    }
  });
});

describe("Invariant 2: resolvedHasMode", () => {
  it("rejects missing modeCandidate", () => {
    const bad = makeResolved({
      modeCandidate: undefined as unknown as TransportModeCandidate,
    });
    try {
      assertMovementSegmentCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MovementSegmentIntegrityError);
      expect((err as MovementSegmentIntegrityError).violation).toBe(
        "resolvedHasMode",
      );
    }
  });
});

describe("Invariant 3/7: providerNoneOnlyUnresolved (= 'none' で resolved を作れない)", () => {
  it("rejects source 'none' on resolved", () => {
    const bad = makeResolved({
      source: "none" as unknown as Exclude<TransportProvider, "none">,
    });
    try {
      assertMovementSegmentCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MovementSegmentIntegrityError);
      expect((err as MovementSegmentIntegrityError).violation).toBe(
        "providerNoneOnlyUnresolved",
      );
    }
  });

  it("rejects unknown provider value", () => {
    const bad = makeResolved({
      source: "fake_provider" as unknown as Exclude<TransportProvider, "none">,
    });
    expect(() => assertMovementSegmentCompliance(bad)).toThrow(
      MovementSegmentIntegrityError,
    );
  });
});

describe("Invariant 4: resolvedHasConfidence", () => {
  it("rejects missing confidence", () => {
    const bad = makeResolved({
      confidence: undefined as unknown as MovementConfidence,
    });
    try {
      assertMovementSegmentCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MovementSegmentIntegrityError);
      expect((err as MovementSegmentIntegrityError).violation).toBe(
        "resolvedHasConfidence",
      );
    }
  });
});

describe("Invariant 5: unresolvedHasReason", () => {
  it("rejects invalid reason literal", () => {
    const bad = makeUnresolved({
      unresolvedReason: "bogus_reason" as unknown as MovementUnresolvedReason,
    });
    try {
      assertMovementSegmentCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MovementSegmentIntegrityError);
      expect((err as MovementSegmentIntegrityError).violation).toBe(
        "unresolvedHasReason",
      );
    }
  });
});

describe("Invariant 6: sensitiveBothIsUnresolved", () => {
  it("rejects resolved + privacyClass sensitive_both", () => {
    const bad = makeResolved({ privacyClass: "sensitive_both" });
    try {
      assertMovementSegmentCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MovementSegmentIntegrityError);
      expect((err as MovementSegmentIntegrityError).violation).toBe(
        "sensitiveBothIsUnresolved",
      );
    }
  });
});

describe("Invariant 8: locationUnknownIsUnresolved", () => {
  it("rejects resolved + privacyClass location_unknown", () => {
    const bad = makeResolved({ privacyClass: "location_unknown" });
    try {
      assertMovementSegmentCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MovementSegmentIntegrityError);
      expect((err as MovementSegmentIntegrityError).violation).toBe(
        "locationUnknownIsUnresolved",
      );
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. Error class shape
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MovementSegmentIntegrityError", () => {
  it("retains segment snapshot for debugging", () => {
    const bad = makeResolved({ estimatedDurationMin: Number.NaN });
    try {
      assertMovementSegmentCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      const ce = err as MovementSegmentIntegrityError;
      expect(ce.name).toBe("MovementSegmentIntegrityError");
      expect(ce.segmentSnapshot).toBe(bad);
      expect(ce.message).toContain("[L-1]");
      expect(ce.message).toContain("resolvedHasDuration");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. Bulk helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("assertMovementSegmentsCompliance (bulk)", () => {
  it("passes on a mixed valid array", () => {
    const segments: MovementSegment[] = [
      makeResolved(),
      makeUnresolved(),
      makeResolved({ source: "manual_user", confidence: { level: "high", reason: "user_explicit" } }),
    ];
    expect(() => assertMovementSegmentsCompliance(segments)).not.toThrow();
  });

  it("throws on the first invalid segment in array", () => {
    const segments: MovementSegment[] = [
      makeResolved(),
      makeResolved({ estimatedDurationMin: Number.NaN }),
      makeResolved(),
    ];
    expect(() => assertMovementSegmentsCompliance(segments)).toThrow(
      MovementSegmentIntegrityError,
    );
  });

  it("accepts empty array", () => {
    expect(() => assertMovementSegmentsCompliance([])).not.toThrow();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. exhaustiveMovementResolutionStatus
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("exhaustiveMovementResolutionStatus", () => {
  it("throws with informative message when called", () => {
    expect(() =>
      exhaustiveMovementResolutionStatus("future_state" as never),
    ).toThrow(/Non-exhaustive MovementResolutionStatus/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9. Provider interface / result / input shape (= type-level smoke)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Provider interface type shape", () => {
  it("MovementResolutionResult is discriminated ok flag", async () => {
    const okResult: MovementResolutionResult = {
      ok: true,
      segment: makeResolved(),
    };
    const failResult: MovementResolutionResult = {
      ok: false,
      reason: "heuristic_failed",
    };
    expect(okResult.ok).toBe(true);
    expect(failResult.ok).toBe(false);
    if (okResult.ok) {
      expect(okResult.segment.timingStatus).toBe("resolved");
    }
    if (!failResult.ok) {
      expect(failResult.reason).toBe("heuristic_failed");
    }
  });

  it("TransportResolutionProvider can be implemented inline", async () => {
    const stub: TransportResolutionProvider = {
      id: "none",
      health: "healthy",
      async resolveDuration(_input: MovementResolutionInput) {
        return { ok: false, reason: "no_provider_available" as const };
      },
    };
    const out = await stub.resolveDuration({ privacyClass: "normal" });
    expect(out.ok).toBe(false);
  });

  it("MovementResolutionTelemetry contains no PII fields (= structural check)", () => {
    const telemetry: MovementResolutionTelemetry = {
      date: "2026-05-22",
      resolvedBy: "heuristic_distance",
      status: "resolved",
      confidenceLevel: "low",
      privacyClass: "normal",
      mode: "unknown",
    };
    // type-level: title / locationText / coords / userId / anchorId field 不存在
    expect("title" in telemetry).toBe(false);
    expect("locationText" in telemetry).toBe(false);
    expect("fromCoords" in telemetry).toBe(false);
    expect("userId" in telemetry).toBe(false);
    expect("anchorId" in telemetry).toBe(false);
  });
});
