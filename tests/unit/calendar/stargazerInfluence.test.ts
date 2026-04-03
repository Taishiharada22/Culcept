/**
 * Stargazer 影響度計測のテスト
 */
import { describe, it, expect } from "vitest";
import {
  computeStargazerInfluence,
  getInfluenceLevel,
} from "@/app/(culcept)/calendar/_lib/stargazerInfluence";
import type { CalendarPersonaProfile } from "@/app/(culcept)/calendar/_lib/personaBoost";
import type { SatisfactionProfile } from "@/app/(culcept)/calendar/_lib/types";
import type { GapAnalysis } from "@/app/(culcept)/calendar/_lib/wardrobeGapDetector";
import type { ObservationContext, OutfitAdaptation } from "@/app/(culcept)/calendar/_lib/aneurasyncIntegration";

const basePersona: CalendarPersonaProfile = {
  pcSeason4: "autumn",
  bodySubtype: null,
  silhouettePref: {},
  materialPref: {},
  dominantColorAxis: "neutral",
  dominantSilhouetteAxis: "neutral",
  styleAxis: {
    minimal_vs_maximal: -0.4,
    classic_vs_trendy: -0.3,
    cautious_vs_bold: 0,
    function_vs_expression: 0,
  },
  completeness: 65,
};

const baseSatisfaction: SatisfactionProfile = {
  itemScores: new Map([
    ["item-1", { avg: 4.2, count: 5, lastWorn: "2026-04-01" }],
    ["item-2", { avg: 3.8, count: 3, lastWorn: "2026-03-28" }],
  ]),
  comboScores: new Map(),
  conditionScores: new Map(),
  dataPoints: 14,
  oldestDate: "2026-03-01",
};

const baseGap: GapAnalysis = {
  gaps: [{ type: "missing_category" as any, severity: "high", title: "靴が足りない", description: "", suggestion: "", icon: "👟" }],
  overallScore: 60,
  strongPoints: ["tops"],
};

const baseObservation: ObservationContext = {
  moodLevel: 0.3,
  stressLevel: 0.7,
  energyLevel: 0.5,
  socialReadiness: 0.5,
  decisionStyle: "balanced",
  changeOpenness: 0.5,
  emotionalStability: 0.5,
  observationCount: 10,
  lastObservationDate: "2026-04-01",
  confidence: 0.7,
};

const baseAdaptation: OutfitAdaptation = {
  formalityShift: -0.1,
  colorIntensityShift: -0.2,
  comfortPriority: 0.7,
  noveltyTolerance: 0.3,
  reason: "ストレス高め → コンフォート重視",
};

describe("computeStargazerInfluence", () => {
  it("全データが揃うとtotalScore > 0", () => {
    const result = computeStargazerInfluence({
      persona: basePersona,
      satisfaction: baseSatisfaction,
      adaptation: baseAdaptation,
      observation: baseObservation,
      gap: baseGap,
    });

    expect(result.totalScore).toBeGreaterThan(0);
    expect(result.activeCount).toBeGreaterThanOrEqual(3);
    expect(result.summary).toContain("をもとに提案しています");
  });

  it("全データなし → totalScore = 0, activeCount = 0", () => {
    const result = computeStargazerInfluence({
      persona: null,
      satisfaction: null,
      adaptation: null,
      observation: null,
      gap: null,
    });

    expect(result.totalScore).toBe(0);
    expect(result.activeCount).toBe(0);
    expect(result.summary).toBe("まだデータが少ないため、汎用的な提案です");
  });

  it("persona のみ → persona dimension > 0, 他は 0", () => {
    const result = computeStargazerInfluence({
      persona: basePersona,
      satisfaction: null,
      adaptation: null,
      observation: null,
      gap: null,
    });

    expect(result.dimensions.persona).toBeGreaterThan(0);
    expect(result.dimensions.satisfaction).toBe(0);
    expect(result.dimensions.adaptation).toBe(0);
    expect(result.dimensions.gap).toBe(0);
  });

  it("completeness が低い persona → 影響度も低い", () => {
    const lowComplete = computeStargazerInfluence({
      persona: { ...basePersona, completeness: 15 },
      satisfaction: null, adaptation: null, observation: null, gap: null,
    });
    const highComplete = computeStargazerInfluence({
      persona: { ...basePersona, completeness: 80 },
      satisfaction: null, adaptation: null, observation: null, gap: null,
    });

    expect(highComplete.dimensions.persona).toBeGreaterThan(lowComplete.dimensions.persona);
  });

  it("persona.completeness < 10 → persona影響 0", () => {
    const result = computeStargazerInfluence({
      persona: { ...basePersona, completeness: 5 },
      satisfaction: null, adaptation: null, observation: null, gap: null,
    });

    expect(result.dimensions.persona).toBe(0);
  });

  it("satisfaction データポイント不足 → 影響 0", () => {
    const result = computeStargazerInfluence({
      persona: null,
      satisfaction: { ...baseSatisfaction, dataPoints: 3 },
      adaptation: null, observation: null, gap: null,
    });

    expect(result.dimensions.satisfaction).toBe(0);
  });

  it("satisfaction データ十分 → 影響 > 0", () => {
    const result = computeStargazerInfluence({
      persona: null,
      satisfaction: baseSatisfaction,
      adaptation: null, observation: null, gap: null,
    });

    expect(result.dimensions.satisfaction).toBeGreaterThan(0);
  });

  it("adaptation + observation → adaptation影響 > 0", () => {
    const result = computeStargazerInfluence({
      persona: null, satisfaction: null,
      adaptation: baseAdaptation,
      observation: baseObservation,
      gap: null,
    });

    expect(result.dimensions.adaptation).toBeGreaterThan(0);
  });

  it("adaptation without observation → 影響 0", () => {
    const result = computeStargazerInfluence({
      persona: null, satisfaction: null,
      adaptation: baseAdaptation,
      observation: null,
      gap: null,
    });

    expect(result.dimensions.adaptation).toBe(0);
  });

  it("observation confidence 低い → adaptation影響 小さい", () => {
    const low = computeStargazerInfluence({
      persona: null, satisfaction: null,
      adaptation: baseAdaptation,
      observation: { ...baseObservation, confidence: 0.15 },
      gap: null,
    });

    expect(low.dimensions.adaptation).toBe(0);
  });

  it("gap high severity → gap影響 > 0", () => {
    const result = computeStargazerInfluence({
      persona: null, satisfaction: null, adaptation: null, observation: null,
      gap: baseGap,
    });

    expect(result.dimensions.gap).toBeGreaterThan(0);
  });

  it("gap no gaps → gap影響 0", () => {
    const result = computeStargazerInfluence({
      persona: null, satisfaction: null, adaptation: null, observation: null,
      gap: { ...baseGap, gaps: [] },
    });

    expect(result.dimensions.gap).toBe(0);
  });

  it("totalScore は 0-100 の範囲", () => {
    const result = computeStargazerInfluence({
      persona: basePersona,
      satisfaction: baseSatisfaction,
      adaptation: baseAdaptation,
      observation: baseObservation,
      gap: baseGap,
    });

    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it("summary は最も影響の大きい軸を含む", () => {
    const result = computeStargazerInfluence({
      persona: basePersona,
      satisfaction: null, adaptation: null, observation: null, gap: null,
    });

    expect(result.summary).toContain("似合う色・スタイル傾向");
  });
});

describe("getInfluenceLevel", () => {
  it("0-5 → none", () => {
    expect(getInfluenceLevel(0)).toBe("none");
    expect(getInfluenceLevel(5)).toBe("none");
  });

  it("6-30 → low", () => {
    expect(getInfluenceLevel(6)).toBe("low");
    expect(getInfluenceLevel(30)).toBe("low");
  });

  it("31-60 → medium", () => {
    expect(getInfluenceLevel(31)).toBe("medium");
    expect(getInfluenceLevel(60)).toBe("medium");
  });

  it("61-100 → high", () => {
    expect(getInfluenceLevel(61)).toBe("high");
    expect(getInfluenceLevel(100)).toBe("high");
  });
});
