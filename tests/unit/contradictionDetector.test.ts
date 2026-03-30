import { describe, it, expect } from "vitest";
import {
  detectCrossAxisContradictions,
  detectTemporalContradictions,
  detectSelfReportVsBehavior,
  detectStatedVsChosen,
  runContradictionDetection,
  prioritizeContradictionAxes,
  type TemporalScoreEntry,
  type BehaviorSignalInput,
  type ScenarioResponse,
} from "@/lib/stargazer/contradictionDetector";

describe("contradictionDetector", () => {
  // ── detectCrossAxisContradictions ──

  describe("detectCrossAxisContradictions", () => {
    it("独立性が高く安心確認も高い場合に矛盾検出", () => {
      const results = detectCrossAxisContradictions({
        independence_vs_harmony: -0.5,
        reassurance_need: 0.5,
      });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].type).toBe("cross_axis");
      expect(results[0].axisA).toBe("independence_vs_harmony");
    });

    it("大胆 × 計画的の矛盾を検出", () => {
      const results = detectCrossAxisContradictions({
        cautious_vs_bold: 0.5,
        plan_vs_spontaneous: -0.5,
      });
      expect(results.length).toBe(1);
      expect(results[0].severity).toBeGreaterThan(0);
    });

    it("閾値未満のスコアでは矛盾を検出しない", () => {
      const results = detectCrossAxisContradictions({
        independence_vs_harmony: -0.2,  // 閾値 0.4 未満
        reassurance_need: 0.2,          // 閾値 0.4 未満
      });
      expect(results).toHaveLength(0);
    });

    it("一貫したプロフィールでは偽陽性なし", () => {
      const results = detectCrossAxisContradictions({
        independence_vs_harmony: 0.6,   // 調和型
        reassurance_need: 0.6,          // 安心確認型 → 一貫
        introvert_vs_extrovert: 0.5,    // 外向的
        social_initiative: 0.5,         // 社交積極的 → 一貫
      });
      expect(results).toHaveLength(0);
    });

    it("未定義の軸はスキップする", () => {
      const results = detectCrossAxisContradictions({
        independence_vs_harmony: -0.5,
        // reassurance_need が undefined → ルールをスキップ
      });
      const hasRule = results.some(
        (r) => r.axisA === "independence_vs_harmony" && r.axisB === "reassurance_need"
      );
      expect(hasRule).toBe(false);
    });

    it("結果は severity 降順でソートされる", () => {
      const results = detectCrossAxisContradictions({
        independence_vs_harmony: -0.5,
        reassurance_need: 0.5,
        cautious_vs_bold: 0.8,
        plan_vs_spontaneous: -0.8,
        emotional_variability: 0.6,
        emotional_regulation: 0.6,
      });
      if (results.length >= 2) {
        expect(results[0].severity).toBeGreaterThanOrEqual(results[1].severity);
      }
    });

    it("severity は 0-1 の範囲", () => {
      const results = detectCrossAxisContradictions({
        independence_vs_harmony: -1.0,
        reassurance_need: 1.0,
      });
      for (const r of results) {
        expect(r.severity).toBeGreaterThanOrEqual(0);
        expect(r.severity).toBeLessThanOrEqual(1);
      }
    });
  });

  // ── detectTemporalContradictions ──

  describe("detectTemporalContradictions", () => {
    it("データが4件未満では空を返す", () => {
      const results = detectTemporalContradictions([
        { axisId: "introvert_vs_extrovert", score: 0.5, date: "2026-01-01" },
        { axisId: "introvert_vs_extrovert", score: -0.5, date: "2026-01-02" },
      ]);
      expect(results).toHaveLength(0);
    });

    it("安定したスコアでは矛盾を検出しない", () => {
      const history: TemporalScoreEntry[] = [
        { axisId: "introvert_vs_extrovert", score: 0.5, date: "2026-01-01" },
        { axisId: "introvert_vs_extrovert", score: 0.55, date: "2026-01-02" },
        { axisId: "introvert_vs_extrovert", score: 0.48, date: "2026-01-03" },
        { axisId: "introvert_vs_extrovert", score: 0.52, date: "2026-01-04" },
      ];
      const results = detectTemporalContradictions(history);
      expect(results).toHaveLength(0);
    });

    it("大きく揺れ動くスコアで矛盾を検出", () => {
      const history: TemporalScoreEntry[] = [
        { axisId: "introvert_vs_extrovert", score: -0.8, date: "2026-01-01" },
        { axisId: "introvert_vs_extrovert", score: 0.7, date: "2026-01-02" },
        { axisId: "introvert_vs_extrovert", score: -0.6, date: "2026-01-03" },
        { axisId: "introvert_vs_extrovert", score: 0.8, date: "2026-01-04" },
        { axisId: "introvert_vs_extrovert", score: -0.7, date: "2026-01-05" },
      ];
      const results = detectTemporalContradictions(history);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].type).toBe("temporal");
    });

    it("一方向への大きな変化を検出", () => {
      const history: TemporalScoreEntry[] = [
        { axisId: "cautious_vs_bold", score: -0.8, date: "2026-01-01" },
        { axisId: "cautious_vs_bold", score: -0.5, date: "2026-01-02" },
        { axisId: "cautious_vs_bold", score: -0.1, date: "2026-01-03" },
        { axisId: "cautious_vs_bold", score: 0.3, date: "2026-01-04" },
      ];
      const results = detectTemporalContradictions(history);
      // stdDev が 0.3 以上で、overallShift > 0.5
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── detectSelfReportVsBehavior ──

  describe("detectSelfReportVsBehavior", () => {
    it("極端なスコアと長い応答時間で矛盾検出", () => {
      const results = detectSelfReportVsBehavior(
        { cautious_vs_bold: 0.8 },
        [
          {
            axisId: "cautious_vs_bold",
            responseTimeRatio: 3.0,
            answerChangeCount: 0,
            backNavigationCount: 0,
            totalQuestions: 10,
          },
        ]
      );
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].type).toBe("self_report_vs_behavior");
    });

    it("穏やかなスコアでは矛盾を検出しない", () => {
      const results = detectSelfReportVsBehavior(
        { cautious_vs_bold: 0.2 },
        [
          {
            axisId: "cautious_vs_bold",
            responseTimeRatio: 3.0,
            answerChangeCount: 0,
            backNavigationCount: 0,
            totalQuestions: 10,
          },
        ]
      );
      expect(results).toHaveLength(0);
    });
  });

  // ── detectStatedVsChosen ──

  describe("detectStatedVsChosen", () => {
    it("シナリオ回答が 2 件未満なら空を返す", () => {
      const results = detectStatedVsChosen(
        { cautious_vs_bold: 0.8 },
        [{ scenarioId: "s1", axisId: "cautious_vs_bold", chosenScore: -0.5 }]
      );
      expect(results).toHaveLength(0);
    });

    it("自己申告とシナリオ選択が逆方向の場合に矛盾検出", () => {
      const results = detectStatedVsChosen(
        { cautious_vs_bold: 0.7 },
        [
          { scenarioId: "s1", axisId: "cautious_vs_bold", chosenScore: -0.5 },
          { scenarioId: "s2", axisId: "cautious_vs_bold", chosenScore: -0.4 },
        ]
      );
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].type).toBe("stated_vs_chosen");
    });
  });

  // ── runContradictionDetection ──

  describe("runContradictionDetection", () => {
    it("4種類の検出を統合し最大10件を返す", () => {
      const results = runContradictionDetection({
        axisScores: {
          independence_vs_harmony: -0.5,
          reassurance_need: 0.5,
          cautious_vs_bold: 0.5,
          plan_vs_spontaneous: -0.5,
        },
        scoreHistory: [],
        behaviorSignals: [],
        scenarioResponses: [],
      });
      expect(results.length).toBeLessThanOrEqual(10);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("重複する軸ペアは深刻度が高い方のみ残す", () => {
      const results = runContradictionDetection({
        axisScores: {
          independence_vs_harmony: -0.6,
          reassurance_need: 0.6,
        },
        scoreHistory: [],
        behaviorSignals: [],
        scenarioResponses: [],
      });
      const crossAxisResults = results.filter(
        (r) =>
          r.type === "cross_axis" &&
          r.axisA === "independence_vs_harmony" &&
          r.axisB === "reassurance_need"
      );
      expect(crossAxisResults.length).toBeLessThanOrEqual(1);
    });
  });

  // ── prioritizeContradictionAxes ──

  describe("prioritizeContradictionAxes", () => {
    it("矛盾が多い軸ほど totalSeverity が高い", () => {
      const contradictions = [
        {
          axisA: "introvert_vs_extrovert",
          axisB: "social_initiative",
          type: "cross_axis" as const,
          severity: 0.8,
          description: "test",
          insightPotential: "test",
          probeQuestion: "test",
        },
        {
          axisA: "introvert_vs_extrovert",
          axisB: "introvert_vs_extrovert",
          type: "temporal" as const,
          severity: 0.5,
          description: "test",
          insightPotential: "test",
          probeQuestion: "test",
        },
      ];
      const prioritized = prioritizeContradictionAxes(contradictions);
      const introvert = prioritized.find(
        (p) => p.axisId === "introvert_vs_extrovert"
      );
      expect(introvert).toBeDefined();
      expect(introvert!.totalSeverity).toBeGreaterThan(0);
      // axisA と axisB の両方がカウントされるため、2以上
      expect(introvert!.contradictionCount).toBeGreaterThanOrEqual(2);
    });
  });
});
