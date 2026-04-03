/**
 * proposalAxisChips — 「効いている自分の軸」チップ生成のテスト
 */
import { describe, it, expect } from "vitest";
import { buildProposalAxisChips } from "@/app/(culcept)/calendar/_lib/proposalAxisChips";
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

describe("buildProposalAxisChips", () => {
  it("全データが揃うと複数チップが生成される", () => {
    const chips = buildProposalAxisChips({
      persona: basePersona,
      satisfaction: baseSatisfaction,
      gap: baseGap,
      adaptation: baseAdaptation,
      observation: baseObservation,
    });

    expect(chips.length).toBeGreaterThanOrEqual(3);
    expect(chips.length).toBeLessThanOrEqual(5);

    const labels = chips.map(c => c.label);
    expect(labels).toContain("オータム向け配色");
    expect(labels).toContain("シンプル軸");
    expect(labels).toContain("きれいめ寄り");
  });

  it("PCシーズン — autumn → オータム向け配色", () => {
    const chips = buildProposalAxisChips({
      persona: { ...basePersona, pcSeason4: "autumn" },
      satisfaction: null, gap: null, adaptation: null, observation: null,
    });
    expect(chips.some(c => c.label === "オータム向け配色")).toBe(true);
  });

  it("PCシーズン — spring → スプリング向け配色", () => {
    const chips = buildProposalAxisChips({
      persona: { ...basePersona, pcSeason4: "spring" },
      satisfaction: null, gap: null, adaptation: null, observation: null,
    });
    expect(chips.some(c => c.label === "スプリング向け配色")).toBe(true);
  });

  it("PCシーズンなし → 配色チップなし", () => {
    const chips = buildProposalAxisChips({
      persona: { ...basePersona, pcSeason4: null },
      satisfaction: null, gap: null, adaptation: null, observation: null,
    });
    expect(chips.some(c => c.label.includes("配色"))).toBe(false);
  });

  it("スタイル軸 — minimal 方向 → シンプル軸", () => {
    const chips = buildProposalAxisChips({
      persona: { ...basePersona, styleAxis: { ...basePersona.styleAxis, minimal_vs_maximal: -0.4 } },
      satisfaction: null, gap: null, adaptation: null, observation: null,
    });
    expect(chips.some(c => c.label === "シンプル軸")).toBe(true);
  });

  it("スタイル軸 — maximal 方向 → 華やか軸", () => {
    const chips = buildProposalAxisChips({
      persona: { ...basePersona, styleAxis: { ...basePersona.styleAxis, minimal_vs_maximal: 0.5 } },
      satisfaction: null, gap: null, adaptation: null, observation: null,
    });
    expect(chips.some(c => c.label === "華やか軸")).toBe(true);
  });

  it("満足度高め → チップ生成", () => {
    const chips = buildProposalAxisChips({
      persona: null, satisfaction: baseSatisfaction,
      gap: null, adaptation: null, observation: null,
    });
    expect(chips.some(c => c.label === "直近満足度高め")).toBe(true);
  });

  it("満足度データ不足 → チップなし", () => {
    const chips = buildProposalAxisChips({
      persona: null,
      satisfaction: { ...baseSatisfaction, dataPoints: 3 },
      gap: null, adaptation: null, observation: null,
    });
    expect(chips.some(c => c.label.includes("満足度"))).toBe(false);
  });

  it("コンフォート重視 → チップ生成", () => {
    const chips = buildProposalAxisChips({
      persona: null, satisfaction: null, gap: null,
      adaptation: baseAdaptation,
      observation: baseObservation,
    });
    expect(chips.some(c => c.label === "コンフォート重視")).toBe(true);
  });

  it("observation confidence 不足 → Stargazer チップなし", () => {
    const chips = buildProposalAxisChips({
      persona: null, satisfaction: null, gap: null,
      adaptation: baseAdaptation,
      observation: { ...baseObservation, confidence: 0.2 },
    });
    expect(chips.some(c => c.label === "コンフォート重視")).toBe(false);
  });

  it("ギャップ high → クローゼット不足ありチップ", () => {
    const chips = buildProposalAxisChips({
      persona: null, satisfaction: null,
      gap: baseGap,
      adaptation: null, observation: null,
    });
    expect(chips.some(c => c.label === "クローゼット不足あり")).toBe(true);
  });

  it("ギャップ medium のみ → チップなし", () => {
    const chips = buildProposalAxisChips({
      persona: null, satisfaction: null,
      gap: { ...baseGap, gaps: [{ ...baseGap.gaps[0], severity: "medium" as const }] },
      adaptation: null, observation: null,
    });
    expect(chips.some(c => c.label === "クローゼット不足あり")).toBe(false);
  });

  it("全データなし → 空配列", () => {
    const chips = buildProposalAxisChips({
      persona: null, satisfaction: null, gap: null, adaptation: null, observation: null,
    });
    expect(chips).toEqual([]);
  });

  it("最大5個を超えない", () => {
    const chips = buildProposalAxisChips({
      persona: basePersona,
      satisfaction: baseSatisfaction,
      gap: baseGap,
      adaptation: baseAdaptation,
      observation: baseObservation,
    });
    expect(chips.length).toBeLessThanOrEqual(5);
  });
});
