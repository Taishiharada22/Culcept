/**
 * Phase 3-J-1e: Self-Contradiction Detector + Day Mood v0 + Pattern Repetition Counter
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-1e / §10.3 Smoke 29 / §10.4 Smoke 22
 *
 * 検証対象:
 *   - selfContradictionDetector: 反復 + 乖離検出 + 観測文生成
 *   - dayMood: heavy/light/recovery 推論 + entropyBudgetDelta
 *   - patternRepetition: count + threshold + testOverride
 *
 * 不変原則 (= 本 test で機械的に強制):
 *   - Invariant 24 Self-Contradiction → Observation
 *   - Invariant 29 Past-Self Voice (= 「最近 X が空いていますね」)
 *   - Idea ι Reverse-Engineered Pattern Highlight (= 3+ 回反復閾値)
 */

import { describe, it, expect } from "vitest";

import {
  detectSelfContradiction,
  type SelfContradictionInput,
} from "@/lib/plan/proposal/selfContradictionDetector";
import {
  DEFAULT_MIN_REPETITION,
  DEFAULT_WEEK_WINDOW,
  countPatternRepetition,
} from "@/lib/plan/proposal/patternRepetition";
import {
  entropyBudgetDelta,
  inferDayMood,
  type DayMood,
} from "@/lib/plan/dayGraph/dayMood";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test fixture
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildAnchor(title: string, overrides: Partial<ExternalAnchor> = {}): ExternalAnchor {
  return {
    id: `anchor_${title.replace(/\s/g, "_")}`,
    userId: "user_test",
    title,
    startTime: "10:00",
    rigidity: "soft",
    sourceId: "src_test",
    confirmedAt: "2026-05-21T00:00:00.000Z",
    anchorKind: "one_off",
    date: "2026-05-22",
    ...overrides,
  } as ExternalAnchor;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// selfContradictionDetector
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectSelfContradiction", () => {
  it("3 past repetitions + 2 recent deviations → contradiction", () => {
    const result = detectSelfContradiction({
      pastRepetitionCount: 3,
      recentDeviationCount: 2,
      featureLabel: "月曜のジム",
    });
    expect(result.hasContradiction).toBe(true);
    expect(result.observationCopy).toBe("最近 月曜のジム が空いていますね");
  });

  it("4+ past + 3 recent deviations → contradiction", () => {
    const result = detectSelfContradiction({
      pastRepetitionCount: 4,
      recentDeviationCount: 3,
      featureLabel: "火曜の朝カフェ",
    });
    expect(result.hasContradiction).toBe(true);
    expect(result.observationCopy).toBe("最近 火曜の朝カフェ が空いていますね");
  });

  it("2 past repetitions → no contradiction (= 閾値 3 未満)", () => {
    const result = detectSelfContradiction({
      pastRepetitionCount: 2,
      recentDeviationCount: 5,
      featureLabel: "金曜のジム",
    });
    expect(result.hasContradiction).toBe(false);
    expect(result.observationCopy).toBeNull();
  });

  it("3 past + 1 recent deviation → no contradiction (= 乖離 2 未満)", () => {
    const result = detectSelfContradiction({
      pastRepetitionCount: 3,
      recentDeviationCount: 1,
      featureLabel: "水曜の散歩",
    });
    expect(result.hasContradiction).toBe(false);
    expect(result.observationCopy).toBeNull();
  });

  it("input thresholds override", () => {
    const result = detectSelfContradiction({
      pastRepetitionCount: 2,
      recentDeviationCount: 1,
      featureLabel: "テスト",
      minRepetition: 1,
      minRecentDeviation: 1,
    });
    expect(result.hasContradiction).toBe(true);
  });

  it("echo back input counts in result", () => {
    const result = detectSelfContradiction({
      pastRepetitionCount: 5,
      recentDeviationCount: 3,
      featureLabel: "テスト",
    });
    expect(result.pastRepetitionCount).toBe(5);
    expect(result.recentDeviationCount).toBe(3);
  });

  it("observation copy never contains AI subject patterns", () => {
    const result = detectSelfContradiction({
      pastRepetitionCount: 3,
      recentDeviationCount: 2,
      featureLabel: "月曜のジム",
    });
    if (result.observationCopy) {
      expect(result.observationCopy).not.toMatch(/Alter[はがにを]/);
      expect(result.observationCopy).not.toMatch(/私[はがを]/);
      expect(result.observationCopy).not.toMatch(/\b(?:my|me)\b/i);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// dayMood
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("inferDayMood", () => {
  it("anchor 0 → recovery", () => {
    expect(inferDayMood({ anchors: [] })).toBe("recovery");
  });

  it("anchor 5+ → heavy", () => {
    const anchors = Array.from({ length: 5 }, (_, i) => buildAnchor(`ランチ ${i}`));
    expect(inferDayMood({ anchors })).toBe("heavy");
  });

  it("anchor 6+ → heavy", () => {
    const anchors = Array.from({ length: 6 }, (_, i) => buildAnchor(`カフェ ${i}`));
    expect(inferDayMood({ anchors })).toBe("heavy");
  });

  it("anchor 1-2 → light", () => {
    expect(inferDayMood({ anchors: [buildAnchor("散歩")] })).toBe("light");
    expect(
      inferDayMood({
        anchors: [buildAnchor("散歩"), buildAnchor("カフェ")],
      }),
    ).toBe("light");
  });

  it("anchor 3-4 + work < 3 → light", () => {
    expect(
      inferDayMood({
        anchors: [
          buildAnchor("カフェ"),
          buildAnchor("ランチ"),
          buildAnchor("散歩"),
        ],
      }),
    ).toBe("light");
  });

  it("anchor 3 + work 3 → heavy (= work 集中)", () => {
    expect(
      inferDayMood({
        anchors: [
          buildAnchor("朝会議"),
          buildAnchor("打ち合わせ"),
          buildAnchor("商談"),
        ],
      }),
    ).toBe("heavy");
  });

  it("anchor 4 + work 3 → heavy (= work 3+ trigger)", () => {
    expect(
      inferDayMood({
        anchors: [
          buildAnchor("会議"),
          buildAnchor("打ち合わせ"),
          buildAnchor("商談"),
          buildAnchor("カフェ"),
        ],
      }),
    ).toBe("heavy");
  });
});

describe("entropyBudgetDelta", () => {
  it("heavy → -1", () => {
    expect(entropyBudgetDelta("heavy")).toBe(-1);
  });

  it("light → 0", () => {
    expect(entropyBudgetDelta("light")).toBe(0);
  });

  it("recovery → -Infinity (= proposal 0)", () => {
    expect(entropyBudgetDelta("recovery")).toBe(-Number.POSITIVE_INFINITY);
  });

  it("all 3 moods covered (= exhaustive)", () => {
    const moods: DayMood[] = ["heavy", "light", "recovery"];
    moods.forEach((m) => {
      expect(typeof entropyBudgetDelta(m)).toBe("number");
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// patternRepetition
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("countPatternRepetition", () => {
  it("0 anchors → not meets threshold", () => {
    const result = countPatternRepetition({ anchors: [] });
    expect(result.count).toBe(0);
    expect(result.meetsThreshold).toBe(false);
  });

  it("2 anchors → not meets default 3", () => {
    const result = countPatternRepetition({
      anchors: [buildAnchor("カフェ"), buildAnchor("カフェ")],
    });
    expect(result.count).toBe(2);
    expect(result.meetsThreshold).toBe(false);
  });

  it("3 anchors → meets threshold", () => {
    const result = countPatternRepetition({
      anchors: [
        buildAnchor("カフェ"),
        buildAnchor("カフェ"),
        buildAnchor("カフェ"),
      ],
    });
    expect(result.count).toBe(3);
    expect(result.threshold).toBe(DEFAULT_MIN_REPETITION);
    expect(result.meetsThreshold).toBe(true);
  });

  it("5+ anchors → meets threshold", () => {
    const result = countPatternRepetition({
      anchors: Array.from({ length: 5 }, (_, i) => buildAnchor(`a ${i}`)),
    });
    expect(result.count).toBe(5);
    expect(result.meetsThreshold).toBe(true);
  });

  it("testOverride.forceRepetitionThreshold = 1 → 1 anchor satisfies", () => {
    const result = countPatternRepetition({
      anchors: [buildAnchor("カフェ")],
      testOverride: { forceRepetitionThreshold: 1 },
    });
    expect(result.threshold).toBe(1);
    expect(result.meetsThreshold).toBe(true);
  });

  it("testOverride.forceRepetitionThreshold = 10 → 5 anchors not enough", () => {
    const result = countPatternRepetition({
      anchors: Array.from({ length: 5 }, (_, i) => buildAnchor(`a ${i}`)),
      testOverride: { forceRepetitionThreshold: 10 },
    });
    expect(result.threshold).toBe(10);
    expect(result.meetsThreshold).toBe(false);
  });

  it("default weekWindow = 4", () => {
    const result = countPatternRepetition({ anchors: [] });
    expect(result.weekWindow).toBe(DEFAULT_WEEK_WINDOW);
  });

  it("custom weekWindow echoed back", () => {
    const result = countPatternRepetition({
      anchors: [],
      weekWindow: 8,
    });
    expect(result.weekWindow).toBe(8);
  });
});
