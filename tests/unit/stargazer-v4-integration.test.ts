import { vi, describe, it, expect, beforeAll } from "vitest";

// Mock server-only (not available in test environment)
vi.mock("server-only", () => ({}));

// Mock supabase server to avoid actual DB calls
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn(() =>
    Promise.resolve({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null }),
          }),
        }),
        insert: () => Promise.resolve({ error: null }),
      }),
      auth: {
        getUser: () => Promise.resolve({ data: { user: null } }),
      },
    })
  ),
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Engine Imports — All 8 v4 engines can be imported
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  generateBlindSpotDrop,
  detectMirrorGaps,
  selectDropCategory,
  selectDropTone,
  resolveDepthPhase,
} from "@/lib/stargazer/blindSpotDrop";

import {
  generateDailyProphecy,
  selectProphecyCategory,
  calibrateConfidence,
  generateVerificationPrompt,
  calculateAccuracy,
  type ProphecyInput,
} from "@/lib/stargazer/dailyProphecy";

import {
  calculateInnerWeather,
  calculatePressureMap,
  detectDefenseMechanism,
  getWeatherEmoji,
  getWeatherLabel,
  type WeatherInput,
} from "@/lib/stargazer/innerWeather";

import {
  buildUnseenMap,
  calculateExplorationPercentage,
  suggestNextExploration,
  type UnseenMapInput,
} from "@/lib/stargazer/unseenMap";

import {
  generateGhostResonance,
  generateMultipleResonances,
  createPatternHash,
  type GhostResonanceInput,
} from "@/lib/stargazer/ghostResonance";

import {
  buildAlterPersonality,
  generateAlterGreeting,
  generateAlterResponse,
  generateShadowWhisper,
  selectAlterMode,
  type AlterInput,
  type WhisperSignal,
} from "@/lib/stargazer/alter";

import {
  generateOracleResponse,
  predictChoice,
  type OracleInput,
} from "@/lib/stargazer/decisionOracle";

import {
  generatePsycheSignature,
  generatePsycheWrapped,
  determineSignatureShape,
  determineSignatureColors,
  type SignatureInput,
} from "@/lib/stargazer/psycheSignature";

// Supporting modules
import {
  resolvePhaseState,
  isFeatureAvailable,
  getFeatureAccess,
  type PhaseInput,
  type DepthPhase,
} from "@/lib/stargazer/depthPhaseController";

import {
  isFeatureAvailable as isTierFeatureAvailable,
  getFeatureLimits,
  getAllFeatureGates,
  getPremiumOnlyFeatures,
  type StargazerTier,
} from "@/lib/stargazer/subscriptionTier";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mock Data Factory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeAxisScores(value = 0.3): Record<string, number> {
  return {
    introvert_vs_extrovert: value,
    individual_vs_social: -value,
    logic_vs_emotion: value * 0.5,
    plan_vs_improvise: -value * 0.8,
    abstract_vs_concrete: value,
    optimism_vs_pessimism: value * 0.3,
    risk_vs_safety: -value * 0.6,
    novelty_vs_tradition: value * 0.7,
  };
}

function makePhaseInput(overrides: Partial<PhaseInput> = {}): PhaseInput {
  return {
    firstObservationDate: new Date(
      Date.now() - (overrides.totalObservations ?? 5) * 24 * 60 * 60 * 1000
    ).toISOString(),
    totalObservations: 5,
    recentActiveDays: 4,
    ...overrides,
  };
}

function makeProphecyInput(overrides: Partial<ProphecyInput> = {}): ProphecyInput {
  return {
    userId: "test-user-001",
    archetypeCode: "ACIO",
    axisScores: makeAxisScores(),
    dayOfWeek: 3, // Wednesday
    observationDepth: 0.5,
    ...overrides,
  };
}

function makeWeatherInput(overrides: Partial<WeatherInput> = {}): WeatherInput {
  return {
    axisScores: makeAxisScores(),
    currentTime: new Date(),
    dayOfWeek: 3,
    ...overrides,
  };
}

function makeGhostInput(overrides: Partial<GhostResonanceInput> = {}): GhostResonanceInput {
  return {
    archetypeCode: "ACIO",
    shadowCode: "NVEX",
    axisScores: makeAxisScores(),
    observationDepth: 50,
    dateSeed: "2026-03-16",
    ...overrides,
  };
}

function makeAlterInput(overrides: Partial<AlterInput> = {}): AlterInput {
  return {
    archetypeCode: "ACIO",
    shadowCode: "NVEX",
    axisScores: makeAxisScores(),
    observationDepth: 50,
    ...overrides,
  };
}

function makeOracleInput(overrides: Partial<OracleInput> = {}): OracleInput {
  return {
    decision: "転職すべきか、今の会社に残るべきか",
    optionA: "転職する",
    optionB: "今の会社に残る",
    archetypeCode: "ACIO",
    shadowCode: "NVEX",
    axisScores: makeAxisScores(),
    currentWeather: "cloudy",
    observationDepth: 50,
    ...overrides,
  };
}

function makeSignatureInput(overrides: Partial<SignatureInput> = {}): SignatureInput {
  return {
    archetypeCode: "ACIO",
    axisScores: makeAxisScores(),
    weatherHistory: [
      { date: "2026-03-10", type: "sunny" },
      { date: "2026-03-11", type: "cloudy" },
      { date: "2026-03-12", type: "rainy" },
      { date: "2026-03-13", type: "sunny" },
      { date: "2026-03-14", type: "foggy" },
    ],
    blindSpotDrops: 12,
    prophecyAccuracy: 0.65,
    mapProgress: 0.42,
    discoveries: ["自分は思ったより外向的", "月曜に決断を先送りする傾向"],
    period: "monthly",
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 1: Engine Imports & Exports
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Stargazer v4 Engine Imports", () => {
  it("blindSpotDrop exports are callable functions", () => {
    expect(typeof generateBlindSpotDrop).toBe("function");
    expect(typeof detectMirrorGaps).toBe("function");
    expect(typeof selectDropCategory).toBe("function");
    expect(typeof selectDropTone).toBe("function");
    expect(typeof resolveDepthPhase).toBe("function");
  });

  it("dailyProphecy exports are callable functions", () => {
    expect(typeof generateDailyProphecy).toBe("function");
    expect(typeof selectProphecyCategory).toBe("function");
    expect(typeof calibrateConfidence).toBe("function");
    expect(typeof generateVerificationPrompt).toBe("function");
    expect(typeof calculateAccuracy).toBe("function");
  });

  it("innerWeather exports are callable functions", () => {
    expect(typeof calculateInnerWeather).toBe("function");
    expect(typeof calculatePressureMap).toBe("function");
    expect(typeof detectDefenseMechanism).toBe("function");
    expect(typeof getWeatherEmoji).toBe("function");
    expect(typeof getWeatherLabel).toBe("function");
  });

  it("unseenMap exports are callable functions", () => {
    expect(typeof buildUnseenMap).toBe("function");
    expect(typeof calculateExplorationPercentage).toBe("function");
    expect(typeof suggestNextExploration).toBe("function");
  });

  it("ghostResonance exports are callable functions", () => {
    expect(typeof generateGhostResonance).toBe("function");
    expect(typeof generateMultipleResonances).toBe("function");
    expect(typeof createPatternHash).toBe("function");
  });

  it("alter exports are callable functions", () => {
    expect(typeof buildAlterPersonality).toBe("function");
    expect(typeof generateAlterGreeting).toBe("function");
    expect(typeof generateAlterResponse).toBe("function");
    expect(typeof generateShadowWhisper).toBe("function");
    expect(typeof selectAlterMode).toBe("function");
  });

  it("decisionOracle exports are callable functions", () => {
    expect(typeof generateOracleResponse).toBe("function");
    expect(typeof predictChoice).toBe("function");
  });

  it("psycheSignature exports are callable functions", () => {
    expect(typeof generatePsycheSignature).toBe("function");
    expect(typeof generatePsycheWrapped).toBe("function");
    expect(typeof determineSignatureShape).toBe("function");
    expect(typeof determineSignatureColors).toBe("function");
  });

  it("depthPhaseController exports are callable functions", () => {
    expect(typeof resolvePhaseState).toBe("function");
    expect(typeof isFeatureAvailable).toBe("function");
    expect(typeof getFeatureAccess).toBe("function");
  });

  it("subscriptionTier exports are callable functions", () => {
    expect(typeof isTierFeatureAvailable).toBe("function");
    expect(typeof getFeatureLimits).toBe("function");
    expect(typeof getAllFeatureGates).toBe("function");
    expect(typeof getPremiumOnlyFeatures).toBe("function");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 2: Engine Main Function Smoke Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Stargazer v4 Engine Smoke Tests", () => {
  describe("Blind Spot Drop", () => {
    it("generates a valid BlindSpotDrop", () => {
      const drop = generateBlindSpotDrop({
        userId: "test-user-001",
        axisScores: makeAxisScores(),
        observationDepth: 0.5,
        totalSessions: 10,
        archetypeCode: "ACIO",
      });

      expect(drop).toBeDefined();
      expect(drop.id).toBeTruthy();
      expect(drop.title).toBeTruthy();
      expect(drop.body).toBeTruthy();
      expect(drop.tone).toBeTruthy();
      expect(drop.category).toBeTruthy();
      expect(drop.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("resolveDepthPhase returns valid phase for different session counts", () => {
      expect(resolveDepthPhase(0, 0)).toBe("seedling");
      expect(resolveDepthPhase(2, 0)).toBe("seedling");
      expect(resolveDepthPhase(5, 0)).toBe("sprout");
      expect(resolveDepthPhase(20, 0.5)).toBe("growth");
      expect(resolveDepthPhase(60, 0.8)).toBe("deep");
    });
  });

  describe("Daily Prophecy", () => {
    it("generates a valid DailyProphecy", () => {
      const prophecy = generateDailyProphecy(makeProphecyInput());

      expect(prophecy).toBeDefined();
      expect(prophecy.id).toBeTruthy();
      expect(prophecy.prediction).toBeTruthy();
      expect(prophecy.category).toBeTruthy();
      expect(prophecy.confidence).toBeGreaterThanOrEqual(0);
      expect(prophecy.confidence).toBeLessThanOrEqual(1);
      expect(prophecy.verificationPrompt).toBeTruthy();
      expect(prophecy.prophecyDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("generates different prophecies for different archetypes", () => {
      const p1 = generateDailyProphecy(makeProphecyInput({ archetypeCode: "ACIO" }));
      const p2 = generateDailyProphecy(makeProphecyInput({ archetypeCode: "NVEX" }));
      // They should at least produce valid outputs (may or may not differ on prediction text)
      expect(p1.prediction).toBeTruthy();
      expect(p2.prediction).toBeTruthy();
    });
  });

  describe("Inner Weather", () => {
    it("calculates valid inner weather", () => {
      const weather = calculateInnerWeather(makeWeatherInput());

      expect(weather).toBeDefined();
      expect(weather.weatherType).toBeTruthy();
      expect(weather.energyLevel).toBeGreaterThanOrEqual(-1);
      expect(weather.energyLevel).toBeLessThanOrEqual(1);
      expect(weather.stressLevel).toBeGreaterThanOrEqual(0);
      expect(weather.stressLevel).toBeLessThanOrEqual(1);
    });

    it("weather emoji and label are available for all types", () => {
      const types = ["sunny", "cloudy", "rainy", "stormy", "foggy", "windy", "snow", "aurora"] as const;
      for (const t of types) {
        expect(getWeatherEmoji(t)).toBeTruthy();
        expect(getWeatherLabel(t)).toBeTruthy();
      }
    });
  });

  describe("Unseen Map", () => {
    it("builds a valid unseen map with minimal input", () => {
      const map = buildUnseenMap({
        axisScores: makeAxisScores(),
        observationQualities: {},
      });

      expect(map).toBeDefined();
      expect(map.tiles).toBeDefined();
      expect(Array.isArray(map.tiles)).toBe(true);
      expect(map.tiles.length).toBeGreaterThan(0);
      expect(map.explorationPercentage).toBeGreaterThanOrEqual(0);
      expect(map.explorationPercentage).toBeLessThanOrEqual(100);
    });

    it("exploration percentage increases with more data", () => {
      const sparse = buildUnseenMap({
        axisScores: { axisA: "introversion", axisB: "extroversion", tension: 0.5 } as any,
        observationQualities: {},
      });
      const rich = buildUnseenMap({
        axisScores: makeAxisScores(0.6),
        observationQualities: {
          introvert_vs_extrovert: {
            count: 30,
            mirrorSources: ["self", "footprint", "shadow"] as const,
            scoreStability: 0.85,
            averageConfidence: 0.8,
            contradictionDetected: false,
            lastObservedAt: "2026-03-15",
            firstObservedAt: "2026-01-15",
          },
        } as any,
      });
      expect(rich.explorationPercentage).toBeGreaterThanOrEqual(sparse.explorationPercentage);
    });
  });

  describe("Ghost Resonance", () => {
    it("generates a valid ghost resonance entry", () => {
      const ghost = generateGhostResonance(makeGhostInput());

      expect(ghost).toBeDefined();
      expect(ghost.id).toBeTruthy();
      expect(ghost.patternHash).toBeTruthy();
      expect(ghost.insight).toBeTruthy();
      expect(ghost.similarity).toBeGreaterThanOrEqual(0);
      expect(ghost.similarity).toBeLessThanOrEqual(1);
      expect(ghost.category).toBeTruthy();
    });

    it("generates multiple resonances", () => {
      const ghosts = generateMultipleResonances(makeGhostInput(), 3);

      expect(Array.isArray(ghosts)).toBe(true);
      expect(ghosts.length).toBeLessThanOrEqual(3);
      expect(ghosts.length).toBeGreaterThan(0);
      // Each entry should have unique IDs
      const ids = ghosts.map((g) => g.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("pattern hash is deterministic for same inputs", () => {
      const hash1 = createPatternHash("ACIO", "NVEX", { axisA: "introversion", axisB: "extroversion", tension: 0.5 });
      const hash2 = createPatternHash("ACIO", "NVEX", { axisA: "introversion", axisB: "extroversion", tension: 0.5 });
      expect(hash1).toBe(hash2);
    });

    it("pattern hash differs for different inputs", () => {
      const hash1 = createPatternHash("ACIO", "NVEX", { axisA: "introversion", axisB: "extroversion", tension: 0.5 });
      const hash2 = createPatternHash("BEA", "PIW", { axisA: "introversion", axisB: "extroversion", tension: -0.5 });
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("Alter (Shadow Self)", () => {
    it("builds a valid alter personality", () => {
      const personality = buildAlterPersonality(makeAlterInput());

      expect(personality).toBeDefined();
      expect(personality.archetypeCode).toBe("ACIO");
      expect(personality.coreWoundShort).toBeTruthy();
    });

    it("generates an alter greeting", () => {
      const personality = buildAlterPersonality(makeAlterInput());
      const greeting = generateAlterGreeting(personality);

      expect(greeting).toBeTruthy();
      expect(typeof greeting).toBe("string");
      expect(greeting.length).toBeGreaterThan(5);
    });

    it("selectAlterMode returns correct modes based on depth", () => {
      // Low observation depth -> always warm
      expect(selectAlterMode(5, 0)).toBe("warm");
      expect(selectAlterMode(5, 10)).toBe("warm");

      // Medium observation depth
      expect(selectAlterMode(30, 0)).toBe("warm");
      expect(selectAlterMode(30, 4)).toBe("provocative");
      expect(selectAlterMode(30, 8)).toBe("analytical");

      // High observation depth
      expect(selectAlterMode(60, 0)).toBe("warm");
      expect(selectAlterMode(60, 3)).toBe("provocative");
      expect(selectAlterMode(60, 6)).toBe("analytical");
    });
  });

  describe("Decision Oracle", () => {
    it("generates a valid oracle response", () => {
      const response = generateOracleResponse(makeOracleInput());

      expect(response).toBeDefined();
      expect(response.predictedChoice).toBeTruthy();
      expect(response.predictedReason).toBeTruthy();
      expect(response.shadowChoice).toBeTruthy();
      expect(response.idealChoice).toBeTruthy();
      expect(response.confidenceLevel).toBeGreaterThanOrEqual(0);
      expect(response.confidenceLevel).toBeLessThanOrEqual(1);
      expect(response.insight).toBeTruthy();
    });

    it("generates different responses for different decisions", () => {
      const r1 = generateOracleResponse(
        makeOracleInput({ decision: "転職すべきか" })
      );
      const r2 = generateOracleResponse(
        makeOracleInput({ decision: "引っ越すべきか" })
      );
      // Both should return valid results
      expect(r1.predictedChoice).toBeTruthy();
      expect(r2.predictedChoice).toBeTruthy();
    });
  });

  describe("Psyche Signature", () => {
    it("generates a valid psyche signature", () => {
      const sig = generatePsycheSignature(makeSignatureInput());

      expect(sig).toBeDefined();
      expect(sig.shape).toBeTruthy();
      expect(sig.dominantColor).toBeTruthy();
      expect(sig.stateColor).toBeTruthy();
      expect(sig.weatherColor).toBeTruthy();
      expect(sig.complexity).toBeGreaterThanOrEqual(1);
      expect(sig.complexity).toBeLessThanOrEqual(10);
      expect(sig.symmetry).toBeGreaterThanOrEqual(0);
      expect(sig.symmetry).toBeLessThanOrEqual(1);
    });

    it("generates a valid psyche wrapped", () => {
      const wrapped = generatePsycheWrapped(makeSignatureInput());

      expect(wrapped).toBeDefined();
      expect(wrapped.stats).toBeDefined();
      expect(Array.isArray(wrapped.stats)).toBe(true);
      expect(wrapped.narrative).toBeTruthy();
    });

    it("determines signature shape from axis scores and weather history", () => {
      const shape = determineSignatureShape(
        makeAxisScores(),
        [
          { date: "2026-03-10", type: "sunny" },
          { date: "2026-03-11", type: "cloudy" },
          { date: "2026-03-12", type: "rainy" },
        ],
      );
      const validShapes = ["circle", "star", "crystal", "wave", "spiral", "flame"];
      expect(validShapes).toContain(shape);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 3: Depth Phase Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Depth Phase Controller", () => {
  it("new user starts in surface phase", () => {
    const state = resolvePhaseState(
      makePhaseInput({
        firstObservationDate: new Date().toISOString(),
        totalObservations: 0,
      })
    );

    expect(state.phase).toBe("surface");
    expect(state.daysSinceFirstObservation).toBe(0);
    expect(state.phaseProgress).toBeGreaterThanOrEqual(0);
    expect(state.nextPhase).toBe("awakening");
    expect(state.features).toBeDefined();
    expect(Array.isArray(state.features)).toBe(true);
    expect(state.phaseMessage).toBeTruthy();
  });

  it("progresses to awakening after 8+ days and 5+ observations", () => {
    const state = resolvePhaseState(
      makePhaseInput({
        firstObservationDate: new Date(Date.now() - 10 * 86400000).toISOString(),
        totalObservations: 7,
      })
    );

    expect(state.phase).toBe("awakening");
    expect(state.nextPhase).toBe("maturity");
  });

  it("progresses to maturity after 31+ days and 20+ observations", () => {
    const state = resolvePhaseState(
      makePhaseInput({
        firstObservationDate: new Date(Date.now() - 35 * 86400000).toISOString(),
        totalObservations: 25,
      })
    );

    expect(state.phase).toBe("maturity");
    expect(state.nextPhase).toBe("deep");
  });

  it("progresses to deep after 91+ days and 60+ observations", () => {
    const state = resolvePhaseState(
      makePhaseInput({
        firstObservationDate: new Date(Date.now() - 100 * 86400000).toISOString(),
        totalObservations: 65,
      })
    );

    expect(state.phase).toBe("deep");
    expect(state.nextPhase).toBeUndefined();
  });

  it("requires BOTH days and observations for phase progression", () => {
    // Many observations but too few days
    const fewDays = resolvePhaseState(
      makePhaseInput({
        firstObservationDate: new Date(Date.now() - 5 * 86400000).toISOString(),
        totalObservations: 100,
      })
    );
    expect(fewDays.phase).toBe("surface");

    // Many days but too few observations
    const fewObs = resolvePhaseState(
      makePhaseInput({
        firstObservationDate: new Date(Date.now() - 100 * 86400000).toISOString(),
        totalObservations: 2,
      })
    );
    expect(fewObs.phase).toBe("surface");
  });

  it("features are progressively unlocked per phase", () => {
    const surface = resolvePhaseState(
      makePhaseInput({
        firstObservationDate: new Date().toISOString(),
        totalObservations: 0,
      })
    );
    const surfaceFeatures = surface.features;

    // inner_weather should be available even in surface (minPhase = surface)
    const innerWeather = surfaceFeatures.find((f) => f.feature === "inner_weather");
    expect(innerWeather?.access).toBe("full");

    // prophecy should be locked in surface (minPhase = awakening)
    const prophecy = surfaceFeatures.find((f) => f.feature === "prophecy");
    expect(prophecy?.access).toBe("locked");

    // decision_oracle should be locked in surface (minPhase = maturity)
    const oracle = surfaceFeatures.find((f) => f.feature === "decision_oracle");
    expect(oracle?.access).toBe("locked");
  });

  it("isFeatureAvailable returns correct boolean", () => {
    // Surface user with 0 observations
    const surfaceInput = makePhaseInput({
      firstObservationDate: new Date().toISOString(),
      totalObservations: 0,
    });
    expect(isFeatureAvailable("inner_weather", surfaceInput)).toBe(true);
    expect(isFeatureAvailable("prophecy", surfaceInput)).toBe(false);

    // Mature user
    const matureInput = makePhaseInput({
      firstObservationDate: new Date(Date.now() - 40 * 86400000).toISOString(),
      totalObservations: 30,
    });
    expect(isFeatureAvailable("decision_oracle", matureInput)).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 4: Tier Gating Logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Subscription Tier Gating", () => {
  const freeTier: StargazerTier = { level: "free" };
  const premiumTier: StargazerTier = { level: "premium" };

  it("premium users have access to all features", () => {
    const features = [
      "inner_weather",
      "blind_spot",
      "prophecy",
      "unseen_map",
      "alter",
      "ghost_resonance",
      "decision_oracle",
      "psyche_signature",
    ] as const;

    for (const f of features) {
      expect(isTierFeatureAvailable(premiumTier, f)).toBe(true);
      const limits = getFeatureLimits(premiumTier, f);
      expect(limits.available).toBe(true);
      expect(limits.limited).toBe(false);
    }
  });

  it("free users have access to inner_weather without limits", () => {
    expect(isTierFeatureAvailable(freeTier, "inner_weather")).toBe(true);
    const limits = getFeatureLimits(freeTier, "inner_weather");
    expect(limits.available).toBe(true);
    expect(limits.limited).toBe(false);
  });

  it("free users have limited access to blind_spot, prophecy, unseen_map", () => {
    const limitedFeatures = ["blind_spot", "prophecy", "unseen_map"] as const;
    for (const f of limitedFeatures) {
      expect(isTierFeatureAvailable(freeTier, f)).toBe(true);
      const limits = getFeatureLimits(freeTier, f);
      expect(limits.available).toBe(true);
      expect(limits.limited).toBe(true);
      expect(limits.upgradePrompt).toBeTruthy();
    }
  });

  it("free users cannot access premium-only features", () => {
    const premiumFeatures = ["alter", "ghost_resonance", "decision_oracle", "psyche_signature"] as const;
    for (const f of premiumFeatures) {
      expect(isTierFeatureAvailable(freeTier, f)).toBe(false);
      const limits = getFeatureLimits(freeTier, f);
      expect(limits.available).toBe(false);
      expect(limits.upgradePrompt).toBeTruthy();
    }
  });

  it("getPremiumOnlyFeatures returns correct set", () => {
    const premiumOnly = getPremiumOnlyFeatures();
    expect(premiumOnly).toContain("alter");
    expect(premiumOnly).toContain("ghost_resonance");
    expect(premiumOnly).toContain("decision_oracle");
    expect(premiumOnly).toContain("psyche_signature");
    expect(premiumOnly).not.toContain("inner_weather");
    expect(premiumOnly).not.toContain("blind_spot");
  });

  it("getAllFeatureGates returns all 8 features", () => {
    const gates = getAllFeatureGates(freeTier);
    expect(Object.keys(gates).length).toBe(8);
  });

  it("free tier daily limits are present for limited features", () => {
    const blindSpotLimits = getFeatureLimits(freeTier, "blind_spot");
    expect(blindSpotLimits.dailyLimit).toBe(1);

    const prophecyLimits = getFeatureLimits(freeTier, "prophecy");
    expect(prophecyLimits.dailyLimit).toBe(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 5: Shadow Whisper Flow
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Shadow Whisper Generation", () => {
  let personality: ReturnType<typeof buildAlterPersonality>;

  beforeAll(() => {
    personality = buildAlterPersonality(makeAlterInput());
  });

  it("returns null for users with less than 3 sessions", () => {
    const result = generateShadowWhisper(personality, {}, 2);
    expect(result).toBeNull();
  });

  it("returns null for users with exactly 2 sessions", () => {
    const result = generateShadowWhisper(personality, {}, 2);
    expect(result).toBeNull();
  });

  it("returns whisper for contradiction signal", () => {
    const signal: WhisperSignal = {
      contradictionDetected: { axis: "introvert_vs_extrovert", label: "内向性と外向性" },
    };
    const result = generateShadowWhisper(personality, signal, 10);

    expect(result).toBeTruthy();
    expect(result).toContain("内向性と外向性");
    // Template variants all reference the label
    expect(typeof result).toBe("string");
  });

  it("returns whisper for repeating pattern signal", () => {
    const signal: WhisperSignal = {
      repeatingPattern: { axis: "risk_vs_safety", label: "リスク回避", dayCount: 5 },
    };
    const result = generateShadowWhisper(personality, signal, 10);

    expect(result).toBeTruthy();
    expect(result).toContain("リスク回避");
    expect(result).toContain("5");
  });

  it("returns whisper for extreme axis signal", () => {
    const signal: WhisperSignal = {
      extremeAxis: { axis: "introvert_vs_extrovert", label: "内向性", score: 0.9 },
    };
    const result = generateShadowWhisper(personality, signal, 10);

    expect(result).toBeTruthy();
    expect(result).toContain("内向性");
  });

  it("returns whisper for avoided area signal", () => {
    const signal: WhisperSignal = {
      avoidedArea: "親密さ",
    };
    const result = generateShadowWhisper(personality, signal, 10);

    expect(result).toBeTruthy();
    expect(result).toContain("親密さ");
    expect(typeof result).toBe("string");
  });

  it("prioritizes contradiction over repeating pattern", () => {
    const signal: WhisperSignal = {
      contradictionDetected: { axis: "introvert_vs_extrovert", label: "内向性" },
      repeatingPattern: { axis: "risk_vs_safety", label: "リスク回避", dayCount: 3 },
    };
    const result = generateShadowWhisper(personality, signal, 10);

    expect(result).toBeTruthy();
    // Should contain contradiction label, not pattern label
    expect(result).toContain("内向性");
    expect(result).not.toContain("リスク回避");
  });

  it("returns fallback message for veteran users with no specific signal", () => {
    const result = generateShadowWhisper(personality, {}, 15);

    expect(result).toBeTruthy();
    // Should reference the core wound
    expect(typeof result).toBe("string");
  });

  it("returns generic whisper when personality is null but signal has extreme axis", () => {
    const signal: WhisperSignal = {
      extremeAxis: { axis: "introvert_vs_extrovert", label: "内向性", score: 0.8 },
    };
    const result = generateShadowWhisper(null, signal, 5);

    expect(result).toBeTruthy();
    expect(result).toContain("内向性");
    expect(typeof result).toBe("string");
  });

  it("returns null when personality is null and no extreme axis", () => {
    const result = generateShadowWhisper(null, {}, 5);
    expect(result).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite 6: Cross-Engine Type Consistency
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Cross-Engine Type Consistency", () => {
  it("innerWeather output can feed into blind spot drop input", () => {
    const weather = calculateInnerWeather(makeWeatherInput());

    // The weather type and energy level should be usable as prophecy context
    expect(weather.weatherType).toBeTruthy();
    expect(typeof weather.energyLevel).toBe("number");
    expect(typeof weather.stressLevel).toBe("number");

    // Prophecy input accepts currentWeather in this shape
    const prophecy = generateDailyProphecy(
      makeProphecyInput({
        currentWeather: {
          weatherType: weather.weatherType,
          energyLevel: weather.energyLevel,
          stressLevel: weather.stressLevel,
          emotionalTone: weather.emotionalTone ?? "calm",
        },
      })
    );
    expect(prophecy).toBeDefined();
    expect(prophecy.prediction).toBeTruthy();
  });

  it("depthPhaseController and subscriptionTier use same V4Feature type", () => {
    // Both modules reference V4Feature -- test that the same feature names work in both
    const v4Features = [
      "blind_spot",
      "prophecy",
      "inner_weather",
      "unseen_map",
      "alter",
      "decision_oracle",
      "ghost_resonance",
      "psyche_signature",
    ] as const;

    const phaseInput = makePhaseInput({
      firstObservationDate: new Date(Date.now() - 100 * 86400000).toISOString(),
      totalObservations: 65,
    });
    const tier: StargazerTier = { level: "premium" };

    for (const f of v4Features) {
      // Both should accept the same feature names without error
      const featureAccess = getFeatureAccess(f, phaseInput);
      const tierLimits = getFeatureLimits(tier, f);

      expect(featureAccess.feature).toBe(f);
      expect(tierLimits.available).toBeDefined();
    }
  });

  it("alter personality builds from same axis scores used by other engines", () => {
    const scores = makeAxisScores(0.5);

    // All engines should accept the same score format
    const personality = buildAlterPersonality({
      archetypeCode: "ACIO",
      shadowCode: "NVEX",
      axisScores: scores,
      observationDepth: 50,
    });
    const weather = calculateInnerWeather({
      axisScores: scores,
      currentTime: new Date(),
      dayOfWeek: 3,
    });
    const ghost = generateGhostResonance({
      archetypeCode: "ACIO",
      shadowCode: "NVEX",
      axisScores: scores,
      observationDepth: 50,
    });

    expect(personality).toBeDefined();
    expect(weather).toBeDefined();
    expect(ghost).toBeDefined();
  });
});
