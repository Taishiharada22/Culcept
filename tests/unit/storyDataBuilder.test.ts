// tests/unit/storyDataBuilder.test.ts
// 受け入れ基準 #2, #3 を検証
// #2: Story Core 5枚が欠損データでも破綻しない
// #3: Unlock 3枚が条件未達時に自然に落ちる
import { describe, it, expect } from "vitest";
import { buildStoryData } from "@/app/(immersive)/stargazer/_components/story/storyDataBuilder";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

// ── Helpers ──

function makeArchetype(overrides?: Record<string, unknown>) {
  return {
    code: "ACIO" as const,
    layer1: { code: "A" as const, score: 0.7, scores: { A: 0.7, N: 0.2, S: 0.1 } },
    layer2: { code: "C" as const, score: 0.6, scores: { C: 0.6, V: 0.4 } },
    layer3: { code: "I" as const, score: 0.5, scores: { I: 0.5, E: 0.5 } },
    layer4: { code: "O" as const, score: 0.6, scores: { O: 0.6, X: 0.4 } },
    confidence: 0.8,
    topMatches: [{ code: "ACIO" as const, score: 2.4 }],
    name: "テスト型",
    emoji: "🔮",
    tagline: "テストのタグライン",
    ...overrides,
  };
}

function makeMinimalAxisScores(): Partial<Record<TraitAxisKey, number>> {
  return {
    introvert_vs_extrovert: 0.6,
    analytical_vs_intuitive: -0.4,
  };
}

function makeContradictionMap() {
  return {
    entries: [
      {
        axisId: "introvert_vs_extrovert" as TraitAxisKey,
        axisLabel: "内向-外向",
        axisLabelLeft: "内向的",
        axisLabelRight: "外向的",
        divergenceType: "self_vs_footprint" as const,
        scores: { selfPortrait: 0.7, footprint: -0.3, shadowPlay: 0.1 },
        magnitude: 1.0,
        meaning: "ideal_gap" as const,
        insight: "自分では外向的と思っているが行動は内向的",
        explorationPrompt: "外向的に振る舞うとき、何を感じていますか？",
      },
    ],
    totalContradictions: 1,
    alignedAxes: 0,
    summary: "1つの軸で矛盾を検出",
    primaryTheme: "理想と現実のギャップ",
  };
}

// ═══════════════════════════════════════════════════════════════
// #2: Core 5枚が欠損データでも破綻しない
// ═══════════════════════════════════════════════════════════════
describe("buildStoryData — Core 5 resilience", () => {
  it("returns null when archetypeResult is null", () => {
    const result = buildStoryData({
      archetypeResult: null,
      axisScores: makeMinimalAxisScores(),
      contradictionMap: null,
      totalObservations: 20,
      todayObservationCount: 1,
    });
    expect(result).toBeNull();
  });

  it("returns null when axisScores is completely empty", () => {
    const result = buildStoryData({
      archetypeResult: makeArchetype(),
      axisScores: {},
      contradictionMap: null,
      totalObservations: 20,
      todayObservationCount: 1,
    });
    // No scored axes → topAxis is undefined → returns null
    expect(result).toBeNull();
  });

  it("builds Core 5 with minimal data (archetype + 1 axis)", () => {
    const result = buildStoryData({
      archetypeResult: makeArchetype(),
      axisScores: { introvert_vs_extrovert: 0.6 },
      contradictionMap: null,
      totalObservations: 15,
      todayObservationCount: 2,
    });

    expect(result).not.toBeNull();
    // Archetype slide
    expect(result!.archetype.emoji).toBe("🔮");
    expect(result!.archetype.archetypeLabel).toBe("テスト型");
    // Core trait slide
    expect(result!.coreTrait.axisId).toBe("introvert_vs_extrovert");
    expect(result!.coreTrait.score).toBe(0.6);
    // Duality — no contradiction map → undetermined
    expect(result!.duality.kind).toBe("undetermined");
    // Unobserved — should have many unobserved areas
    expect(result!.unobserved.observedCount).toBe(1);
    expect(result!.unobserved.totalCount).toBeGreaterThan(1);
    // Next slide
    expect(result!.next.totalObservations).toBe(15);
    expect(result!.next.todayCount).toBe(2);
  });

  it("builds duality as 'detected' when contradictionMap has entries", () => {
    const result = buildStoryData({
      archetypeResult: makeArchetype(),
      axisScores: makeMinimalAxisScores(),
      contradictionMap: makeContradictionMap(),
      totalObservations: 20,
      todayObservationCount: 1,
    });

    expect(result).not.toBeNull();
    expect(result!.duality.kind).toBe("detected");
    if (result!.duality.kind === "detected") {
      expect(result!.duality.axisId).toBe("introvert_vs_extrovert");
      expect(result!.duality.strength).toBe(1.0);
      expect(result!.duality.insight).toContain("外向的");
    }
  });

  it("handles archetype without emoji/name/tagline gracefully", () => {
    const result = buildStoryData({
      archetypeResult: makeArchetype({ name: undefined, emoji: undefined, tagline: undefined }),
      axisScores: makeMinimalAxisScores(),
      contradictionMap: null,
      totalObservations: 10,
      todayObservationCount: 0,
    });

    expect(result).not.toBeNull();
    expect(result!.archetype.emoji).toBe("◆"); // fallback
    expect(result!.archetype.archetypeLabel).toBe("ACIO"); // falls back to code
    expect(result!.archetype.familyTagline).toBeNull();
  });

  it("handles contradictionMap with empty entries array", () => {
    const result = buildStoryData({
      archetypeResult: makeArchetype(),
      axisScores: makeMinimalAxisScores(),
      contradictionMap: { entries: [], totalContradictions: 0, alignedAxes: 0, summary: "", primaryTheme: "" },
      totalObservations: 10,
      todayObservationCount: 0,
    });

    expect(result).not.toBeNull();
    // Should fall back to undetermined
    expect(result!.duality.kind).toBe("undetermined");
  });
});

// ═══════════════════════════════════════════════════════════════
// #3: Unlock 3枚が条件未達時に自然に落ちる
// ═══════════════════════════════════════════════════════════════
describe("buildStoryData — Unlock slides graceful degradation", () => {
  it("all unlock slides are null when no unlock data provided", () => {
    const result = buildStoryData({
      archetypeResult: makeArchetype(),
      axisScores: makeMinimalAxisScores(),
      contradictionMap: null,
      totalObservations: 10,
      todayObservationCount: 0,
    });

    expect(result).not.toBeNull();
    expect(result!.faces).toBeNull();
    expect(result!.mirror).toBeNull();
    expect(result!.drift).toBeNull();
  });

  it("faces is null when contextFaces has < 2 valid contexts", () => {
    const result = buildStoryData({
      archetypeResult: makeArchetype(),
      axisScores: makeMinimalAxisScores(),
      contradictionMap: null,
      totalObservations: 10,
      todayObservationCount: 0,
      contextFaces: {
        romance: { introvert_vs_extrovert: 0.5 },
        // only 1 context → not enough
      },
    });

    expect(result).not.toBeNull();
    expect(result!.faces).toBeNull();
  });

  it("faces is populated when contextFaces has >= 2 valid contexts", () => {
    const result = buildStoryData({
      archetypeResult: makeArchetype(),
      axisScores: makeMinimalAxisScores(),
      contradictionMap: null,
      totalObservations: 10,
      todayObservationCount: 0,
      contextFaces: {
        romance: { introvert_vs_extrovert: 0.5 },
        work: { analytical_vs_intuitive: -0.7 },
        friends: { introvert_vs_extrovert: -0.3 },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.faces).not.toBeNull();
    expect(result!.faces!.contexts).toHaveLength(3);
  });

  it("mirror is null when totalPredictions < 5", () => {
    const result = buildStoryData({
      archetypeResult: makeArchetype(),
      axisScores: makeMinimalAxisScores(),
      contradictionMap: null,
      totalObservations: 10,
      todayObservationCount: 0,
      predictionAccuracy: {
        overallAccuracy: 80,
        totalPredictions: 3, // < 5
        categoryAccuracy: {},
      },
    });

    expect(result).not.toBeNull();
    expect(result!.mirror).toBeNull();
  });

  it("mirror is populated when totalPredictions >= 5", () => {
    const result = buildStoryData({
      archetypeResult: makeArchetype(),
      axisScores: makeMinimalAxisScores(),
      contradictionMap: null,
      totalObservations: 10,
      todayObservationCount: 0,
      predictionAccuracy: {
        overallAccuracy: 72,
        totalPredictions: 10,
        categoryAccuracy: {
          "仕事": { accuracy: 60, totalPredictions: 5 },
          "恋愛": { accuracy: 85, totalPredictions: 5 },
        },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.mirror).not.toBeNull();
    expect(result!.mirror!.overallAccuracy).toBe(72);
    expect(result!.mirror!.worstCategory?.name).toBe("仕事");
  });

  it("drift is null when reobservationHistory has < 2 entries", () => {
    const result = buildStoryData({
      archetypeResult: makeArchetype(),
      axisScores: makeMinimalAxisScores(),
      contradictionMap: null,
      totalObservations: 10,
      todayObservationCount: 0,
      reobservationHistory: [
        { axisId: "introvert_vs_extrovert", currentScore: 0.5, previousScore: 0.3, currentDate: "2026-03-30", previousDate: "2026-03-20" },
      ],
    });

    expect(result).not.toBeNull();
    expect(result!.drift).toBeNull();
  });

  it("drift is populated when reobservationHistory has >= 2 entries", () => {
    const result = buildStoryData({
      archetypeResult: makeArchetype(),
      axisScores: makeMinimalAxisScores(),
      contradictionMap: null,
      totalObservations: 10,
      todayObservationCount: 0,
      reobservationHistory: [
        { axisId: "introvert_vs_extrovert", currentScore: 0.5, previousScore: 0.3, currentDate: "2026-03-30", previousDate: "2026-03-20" },
        { axisId: "analytical_vs_intuitive", currentScore: -0.8, previousScore: -0.2, currentDate: "2026-03-30", previousDate: "2026-03-15" },
      ],
    });

    expect(result).not.toBeNull();
    expect(result!.drift).not.toBeNull();
    // analytical_vs_intuitive has bigger delta (0.6 vs 0.2)
    expect(result!.drift!.axisId).toBe("analytical_vs_intuitive");
  });
});
