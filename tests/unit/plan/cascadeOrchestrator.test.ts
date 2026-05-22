/**
 * Phase 3-L L-3a (pure) — cascadeOrchestrator tests
 *
 * 設計書: docs/alter-plan-phase3-l-3-readiness-audit.md §2.1 / §2.2
 *
 * 検証範囲 (= GPT 補正 6 件 + 自律補強 5 件):
 *   §1. Early-exit gates
 *       - sensitive_both → unresolved "sensitive_proximity" (= 補正 3)
 *       - location_unknown → unresolved "location_unknown" (= 補正 2)
 *       - 全 provider down → "no_provider_available"
 *       - providers 空配列 → "no_provider_available"
 *
 *   §2. Provider sequential try
 *       - 配列順序通り試行 (= deterministic)
 *       - 最初の ok で early-resolve、 後続 provider 不呼出
 *       - failure 時は次 provider へ continue
 *
 *   §3. Manual override gate (= 補正 1)
 *       - manualOverride undefined → manual_user provider が **skip** される (= attempted に含まれない)
 *       - manualOverride 存在 → manual_user 試行される
 *       - manual_user 失敗時は heuristic へ fallback
 *
 *   §4. Per-provider exception isolation (= 補正 6)
 *       - 1 provider throw → cascade を落とさず "api_error" trace 記録
 *       - 後続 provider が試行される
 *
 *   §5. Trace
 *       - attemptedProviders 順序通り
 *       - decidedBy が決定 provider と一致
 *       - earlyExitReason は early-exit 時のみ存在
 *       - raw title / locationText を含まない (= PII-free structural)
 *
 *   §6. Final fallback
 *       - 全 provider fail → "no_provider_available"
 *
 *   §7. Input immutability
 *       - cascade 実行で input が mutate されない
 *
 * 不変原則:
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用 / network 不使用
 *   - K phase 既存 file 変更 0
 */

import { describe, expect, it, vi } from "vitest";

import {
  runCascade,
  type CascadeInput,
  type CascadeOptions,
  type CascadeResult,
  type ManualOverride,
} from "@/lib/plan/transport/cascadeOrchestrator";
import { createHeuristicDistanceProvider } from "@/lib/plan/transport/heuristicDistanceProvider";
import { createManualUserProvider } from "@/lib/plan/transport/manualUserProvider";
import { createUnresolvedProvider } from "@/lib/plan/transport/unresolvedProvider";
import type {
  MovementResolutionInput,
  MovementResolutionResult,
  TransportProvider,
  TransportResolutionProvider,
} from "@/lib/plan/transport/transportTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const SHINJUKU = { lat: 35.6896, lng: 139.7006 };

const BASIC_SEGMENT_BASE = {
  fromNodeId: "node-1",
  toNodeId: "node-2",
  fromLocationText: "Tokyo",
  toLocationText: "Shinjuku",
  sensitiveProximity: false,
} as const;

function makeInput(
  overrides: Partial<CascadeInput> = {},
): CascadeInput {
  return {
    resolution: {
      privacyClass: "normal",
      fromCoords: TOKYO,
      toCoords: SHINJUKU,
    },
    segmentBase: BASIC_SEGMENT_BASE,
    ...overrides,
  };
}

const DEFAULT_PROVIDERS_NO_MANUAL: ReadonlyArray<TransportResolutionProvider> = [
  createHeuristicDistanceProvider(),
];

const DEFAULT_PROVIDERS_WITH_MANUAL: ReadonlyArray<TransportResolutionProvider> = [
  createManualUserProvider(),
  createHeuristicDistanceProvider(),
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test helpers (= controlled providers)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 任意挙動の provider を作る test helper。 cascade の logic を厳密検証する用。
 */
function makeFakeProvider(
  id: TransportProvider,
  behavior: (input: MovementResolutionInput) => Promise<MovementResolutionResult>,
  health: TransportResolutionProvider["health"] = "healthy",
): TransportResolutionProvider {
  return {
    id,
    health,
    resolveDuration: vi.fn(behavior),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. Early-exit gates
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. Early-exit gates", () => {
  it("sensitive_both → unresolved 'sensitive_proximity', no provider called", async () => {
    const heuristicSpy = vi.fn(async (): Promise<MovementResolutionResult> => ({
      ok: true,
      segment: {
        fromNodeId: "x",
        toNodeId: "y",
        sensitiveProximity: false,
        timingStatus: "resolved",
        estimatedDurationMin: 10,
        modeCandidate: { mode: "unknown", confidence: { level: "low", reason: "heuristic_distance_only" } },
        source: "heuristic_distance",
        confidence: { level: "low", reason: "heuristic_distance_only" },
        privacyClass: "normal",
      },
    }));
    const fakeHeuristic = makeFakeProvider("heuristic_distance", heuristicSpy);

    const result = await runCascade(
      makeInput({ resolution: { privacyClass: "sensitive_both", fromCoords: TOKYO, toCoords: SHINJUKU } }),
      { providers: [fakeHeuristic] },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("sensitive_proximity");
      expect(result.trace.earlyExitReason).toBe("sensitive_proximity");
      expect(result.trace.attemptedProviders).toEqual([]);
      expect(result.trace.decidedBy).toBe("none");
    }
    expect(heuristicSpy).not.toHaveBeenCalled();
  });

  it("location_unknown → unresolved 'location_unknown', no provider called", async () => {
    const heuristicSpy = vi.fn();
    const fakeHeuristic = makeFakeProvider("heuristic_distance", heuristicSpy);

    const result = await runCascade(
      makeInput({ resolution: { privacyClass: "location_unknown" } }),
      { providers: [fakeHeuristic] },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("location_unknown");
      expect(result.trace.earlyExitReason).toBe("location_unknown");
      expect(result.trace.attemptedProviders).toEqual([]);
    }
    expect(heuristicSpy).not.toHaveBeenCalled();
  });

  it("all providers 'down' → unresolved 'no_provider_available'", async () => {
    const downHeuristic = makeFakeProvider(
      "heuristic_distance",
      async () => ({ ok: false, reason: "no_provider_available" }),
      "down",
    );
    const downRoutes = makeFakeProvider(
      "google_routes",
      async () => ({ ok: false, reason: "no_provider_available" }),
      "down",
    );

    const result = await runCascade(makeInput(), {
      providers: [downHeuristic, downRoutes],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_provider_available");
      expect(result.trace.earlyExitReason).toBe("no_provider_available");
      expect(result.trace.attemptedProviders).toEqual([]);
    }
  });

  it("providers 空配列 → unresolved 'no_provider_available'", async () => {
    const result = await runCascade(makeInput(), { providers: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_provider_available");
      expect(result.trace.earlyExitReason).toBe("no_provider_available");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. Provider sequential try
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. Provider sequential try", () => {
  it("配列順序通り試行する (= deterministic order)", async () => {
    const callOrder: TransportProvider[] = [];
    const p1 = makeFakeProvider("heuristic_distance", async () => {
      callOrder.push("heuristic_distance");
      return { ok: false, reason: "heuristic_failed" };
    });
    const p2 = makeFakeProvider("google_routes", async () => {
      callOrder.push("google_routes");
      return { ok: false, reason: "api_error" };
    });

    await runCascade(makeInput(), { providers: [p2, p1] });
    expect(callOrder).toEqual(["google_routes", "heuristic_distance"]);
  });

  it("最初の ok provider で early-resolve、 後続 provider 不呼出", async () => {
    const heuristicSpy = vi.fn(
      async (): Promise<MovementResolutionResult> => ({
        ok: true,
        segment: {
          fromNodeId: "node-1",
          toNodeId: "node-2",
          sensitiveProximity: false,
          timingStatus: "resolved",
          estimatedDurationMin: 25,
          modeCandidate: { mode: "unknown", confidence: { level: "low", reason: "heuristic_distance_only" } },
          source: "heuristic_distance",
          confidence: { level: "low", reason: "heuristic_distance_only" },
          privacyClass: "normal",
        },
      }),
    );
    const routesSpy = vi.fn();

    const fakeHeuristic = makeFakeProvider("heuristic_distance", heuristicSpy);
    const fakeRoutes = makeFakeProvider("google_routes", routesSpy);

    const result = await runCascade(makeInput(), {
      providers: [fakeHeuristic, fakeRoutes],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segment.source).toBe("heuristic_distance");
      expect(result.trace.decidedBy).toBe("heuristic_distance");
      expect(result.trace.attemptedProviders).toEqual(["heuristic_distance"]);
    }
    expect(heuristicSpy).toHaveBeenCalledTimes(1);
    expect(routesSpy).not.toHaveBeenCalled();
  });

  it("失敗 → 次の provider に continue", async () => {
    const p1 = makeFakeProvider("heuristic_distance", async () => ({
      ok: false,
      reason: "heuristic_failed",
    }));
    const p2 = makeFakeProvider(
      "google_routes",
      async (): Promise<MovementResolutionResult> => ({
        ok: true,
        segment: {
          fromNodeId: "node-1",
          toNodeId: "node-2",
          sensitiveProximity: false,
          timingStatus: "resolved",
          estimatedDurationMin: 20,
          modeCandidate: { mode: "driving", confidence: { level: "high", reason: "routes_api_response" } },
          source: "google_routes",
          confidence: { level: "high", reason: "routes_api_response" },
          privacyClass: "normal",
        },
      }),
    );

    const result = await runCascade(makeInput(), { providers: [p1, p2] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segment.source).toBe("google_routes");
      expect(result.trace.attemptedProviders).toEqual([
        "heuristic_distance",
        "google_routes",
      ]);
      expect(result.trace.decidedBy).toBe("google_routes");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. Manual override gate (= GPT 補正 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. Manual override gate (= GPT 補正 1)", () => {
  it("manualOverride undefined → manual_user provider は **構造的に skip** される", async () => {
    const manualSpy = vi.fn(
      async (): Promise<MovementResolutionResult> => ({
        ok: true,
        segment: {
          fromNodeId: "node-1",
          toNodeId: "node-2",
          sensitiveProximity: false,
          timingStatus: "resolved",
          estimatedDurationMin: 99,
          modeCandidate: { mode: "walking", confidence: { level: "high", reason: "user_explicit" } },
          source: "manual_user",
          confidence: { level: "high", reason: "user_explicit" },
          privacyClass: "normal",
        },
      }),
    );
    const fakeManual = makeFakeProvider("manual_user", manualSpy);
    const realHeuristic = createHeuristicDistanceProvider();

    const result = await runCascade(makeInput(), {
      providers: [fakeManual, realHeuristic],
    });

    // manual_user は試行されない
    expect(manualSpy).not.toHaveBeenCalled();
    // heuristic で解決
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segment.source).toBe("heuristic_distance");
      expect(result.trace.attemptedProviders).toEqual(["heuristic_distance"]);
      expect(result.trace.decidedBy).toBe("heuristic_distance");
    }
  });

  it("manualOverride 存在 → manual_user 試行される、 ok なら勝つ", async () => {
    const realManual = createManualUserProvider();
    const realHeuristic = createHeuristicDistanceProvider();

    const override: ManualOverride = { userDurationMin: 12, userMode: "walking" };
    const result = await runCascade(
      makeInput({ manualOverride: override }),
      { providers: [realManual, realHeuristic] },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segment.source).toBe("manual_user");
      expect(result.segment.estimatedDurationMin).toBe(12);
      expect(result.segment.modeCandidate.mode).toBe("walking");
      expect(result.trace.attemptedProviders).toEqual(["manual_user"]);
      expect(result.trace.decidedBy).toBe("manual_user");
    }
  });

  it("manualOverride 存在だが manual_user が失敗 → heuristic に fallback", async () => {
    const manualFailing = makeFakeProvider("manual_user", async () => ({
      ok: false,
      reason: "no_provider_available",
    }));
    const realHeuristic = createHeuristicDistanceProvider();

    const result = await runCascade(
      makeInput({ manualOverride: { userDurationMin: 99 } }),
      { providers: [manualFailing, realHeuristic] },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segment.source).toBe("heuristic_distance");
      expect(result.trace.attemptedProviders).toEqual([
        "manual_user",
        "heuristic_distance",
      ]);
    }
  });

  it("manual_user 不在 + heuristic 失敗 → 'no_provider_available'", async () => {
    const heuristicAlwaysFail = makeFakeProvider(
      "heuristic_distance",
      async () => ({ ok: false, reason: "heuristic_failed" }),
    );

    const result = await runCascade(makeInput(), {
      providers: [heuristicAlwaysFail],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_provider_available");
      expect(result.trace.attemptedProviders).toEqual(["heuristic_distance"]);
      expect(result.trace.decidedBy).toBe("none");
      expect(result.trace.earlyExitReason).toBeUndefined();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. Per-provider exception isolation (= GPT 補正 6)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. Per-provider exception isolation (= GPT 補正 6)", () => {
  it("1 provider が throw しても cascade は落ちず、 次の provider に進む", async () => {
    const throwingProvider = makeFakeProvider("google_routes", async () => {
      throw new Error("simulated network failure");
    });
    const realHeuristic = createHeuristicDistanceProvider();

    const result = await runCascade(makeInput(), {
      providers: [throwingProvider, realHeuristic],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segment.source).toBe("heuristic_distance");
      expect(result.trace.attemptedProviders).toEqual([
        "google_routes",
        "heuristic_distance",
      ]);
    }
  });

  it("最後の provider が throw して unresolved → final fallback、 trace は記録", async () => {
    const throwingProvider = makeFakeProvider("heuristic_distance", async () => {
      throw new Error("boom");
    });

    const result = await runCascade(makeInput(), {
      providers: [throwingProvider],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_provider_available");
      expect(result.trace.attemptedProviders).toEqual(["heuristic_distance"]);
      expect(result.trace.decidedBy).toBe("none");
    }
  });

  it("複数 provider が連続 throw しても cascade は完走", async () => {
    const p1 = makeFakeProvider("google_routes", async () => {
      throw new Error("err1");
    });
    const p2 = makeFakeProvider("heuristic_distance", async () => {
      throw new Error("err2");
    });

    const result = await runCascade(makeInput(), { providers: [p1, p2] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_provider_available");
      expect(result.trace.attemptedProviders).toEqual([
        "google_routes",
        "heuristic_distance",
      ]);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. Trace shape (= PII-free structural)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. Trace shape — PII-free structural", () => {
  it("trace に raw title / locationText / coords が含まれない", async () => {
    const heuristic = createHeuristicDistanceProvider();
    const result = await runCascade(makeInput(), { providers: [heuristic] });

    // trace の serialize を見て、 想定外 field がないことを確認
    const traceKeys = Object.keys(result.trace);
    expect(traceKeys.sort()).toEqual(["attemptedProviders", "decidedBy"].sort());
    // 「fromLocationText」 等の field 不存在 (= type レベル + runtime)
    const traceJson = JSON.stringify(result.trace);
    expect(traceJson).not.toContain("Tokyo");
    expect(traceJson).not.toContain("Shinjuku");
    expect(traceJson).not.toContain("lat");
    expect(traceJson).not.toContain("lng");
  });

  it("earlyExit 時のみ earlyExitReason field 存在", async () => {
    const heuristic = createHeuristicDistanceProvider();
    const earlyResult = await runCascade(
      makeInput({ resolution: { privacyClass: "sensitive_both" } }),
      { providers: [heuristic] },
    );
    expect(earlyResult.trace.earlyExitReason).toBe("sensitive_proximity");

    const normalResult = await runCascade(makeInput(), { providers: [heuristic] });
    expect(normalResult.trace.earlyExitReason).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. Final fallback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. Final fallback", () => {
  it("全 provider が unresolved を返す → 'no_provider_available'", async () => {
    const p1 = makeFakeProvider("heuristic_distance", async () => ({
      ok: false,
      reason: "heuristic_failed",
    }));
    const p2 = makeFakeProvider("google_routes", async () => ({
      ok: false,
      reason: "api_timeout",
    }));

    const result = await runCascade(makeInput(), { providers: [p1, p2] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_provider_available");
      expect(result.trace.attemptedProviders).toEqual([
        "heuristic_distance",
        "google_routes",
      ]);
      expect(result.trace.decidedBy).toBe("none");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. Input immutability
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. Input immutability", () => {
  it("cascade 実行で input が mutate されない", async () => {
    const input = makeInput();
    const inputSnapshot = JSON.parse(JSON.stringify(input)) as CascadeInput;

    const heuristic = createHeuristicDistanceProvider();
    await runCascade(input, { providers: [heuristic] });

    expect(JSON.parse(JSON.stringify(input))).toEqual(inputSnapshot);
  });

  it("複数回 cascade を実行しても options.providers は無変更", async () => {
    const heuristic = createHeuristicDistanceProvider();
    const options: CascadeOptions = { providers: [heuristic] };
    const providersBefore = options.providers;

    await runCascade(makeInput(), options);
    await runCascade(makeInput(), options);

    expect(options.providers).toBe(providersBefore);
    expect(options.providers.length).toBe(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. Integration with real L-2 providers (= regression smoke)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8. Integration with real L-2 providers", () => {
  it("manual_user (override あり) → heuristic → unresolved の order で manual 勝つ", async () => {
    const providers = [
      createManualUserProvider(),
      createHeuristicDistanceProvider(),
      createUnresolvedProvider("no_provider_available"),
    ];
    const result = await runCascade(
      makeInput({ manualOverride: { userDurationMin: 17 } }),
      { providers },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segment.source).toBe("manual_user");
      expect(result.segment.estimatedDurationMin).toBe(17);
    }
  });

  it("override なし → heuristic が勝つ", async () => {
    const providers = [
      createManualUserProvider(),
      createHeuristicDistanceProvider(),
      createUnresolvedProvider("no_provider_available"),
    ];
    const result = await runCascade(makeInput(), { providers });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segment.source).toBe("heuristic_distance");
      expect(result.trace.attemptedProviders).toEqual(["heuristic_distance"]);
    }
  });

  it("coords なし + override なし → unresolved に到達", async () => {
    const providers = [
      createManualUserProvider(),
      createHeuristicDistanceProvider(),
      createUnresolvedProvider("location_unknown"),
    ];
    const result = await runCascade(
      makeInput({
        resolution: { privacyClass: "normal" }, // fromCoords/toCoords なし
      }),
      { providers },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // heuristic が "location_unknown" を返し、 unresolved sentinel が "location_unknown" を返す
      // 最終的に "no_provider_available" (= 全 provider が unresolved を返した final fallback)
      expect(result.reason).toBe("no_provider_available");
      expect(result.trace.attemptedProviders).toEqual([
        "heuristic_distance",
        "none",
      ]);
    }
  });
});
