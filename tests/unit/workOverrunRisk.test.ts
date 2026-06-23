/**
 * P2-3 — OverrunRisk pure heuristic の不変条件テスト。
 *  - estimate/planned 欠如 → honest-unknown（low/medium/high を出さない）
 *  - ratio に応じた low/medium/high + modifier 引き上げ
 *  - high は evidence 必須・裸スコア禁止（RealityAttribute・conf 付き）
 *  - source 境界: heuristic(conf≤0.35) / user_confirmed(inferred)
 *  - collapseRisk 非参照（独立入力のみ）
 */
import { describe, it, expect } from "vitest";
import { realityAttributeViolations, HEURISTIC_CONFIDENCE_MAX } from "@/lib/plan/realityCore/realityAttribute";
import {
  evaluateWorkOverrunRisk,
  type WorkOverrunRiskInputV0,
} from "@/lib/plan/realityCore/workOverrunRisk";

const base = (over: Partial<WorkOverrunRiskInputV0> = {}): WorkOverrunRiskInputV0 => ({
  estimatedMinutes: 30,
  plannedMinutes: 60,
  flexibility: "flexible",
  cognitiveLoad: 0.3,
  energyFit: "medium",
  hasMinimalProgress: false,
  priorOverruns: 0,
  sourceKind: "heuristic",
  evidenceRefs: ["block:b1"],
  ...over,
});

describe("OverrunRisk evaluateWorkOverrunRisk — 不変条件", () => {
  it("#1 estimate/planned 欠如 → honest-unknown（断定しない）", () => {
    const r = evaluateWorkOverrunRisk(base({ estimatedMinutes: null }));
    expect(r.riskLevel).toBe("unknown");
    expect(r.confidence).toBe(0);
    expect(r.reasonCodes).toContain("insufficient_input");
    expect(r.attribute.status).toBe("unknown");
    expect(r.attribute.value).toBeNull();
    expect(evaluateWorkOverrunRisk(base({ plannedMinutes: 0 })).riskLevel).toBe("unknown");
  });

  it("#2 ample margin → low / 枠付近 → medium / 超過 → high", () => {
    expect(evaluateWorkOverrunRisk(base({ estimatedMinutes: 30, plannedMinutes: 60 })).riskLevel).toBe("low");
    expect(evaluateWorkOverrunRisk(base({ estimatedMinutes: 58, plannedMinutes: 60 })).riskLevel).toBe("medium");
    const high = evaluateWorkOverrunRisk(base({ estimatedMinutes: 80, plannedMinutes: 60 }));
    expect(high.riskLevel).toBe("high");
    expect(high.reasonCodes).toContain("estimate_exceeds_window");
  });

  it("#3 modifier（高負荷/過去超過/低energyFit/fixed）で1段引き上げ", () => {
    // medium ベース(58/60) + 高cognitiveLoad → high
    const r = evaluateWorkOverrunRisk(base({ estimatedMinutes: 58, plannedMinutes: 60, cognitiveLoad: 0.8 }));
    expect(r.riskLevel).toBe("high");
    expect(r.reasonCodes).toContain("high_cognitive_load_tight_window");
    // low ベース(30/60) + 過去超過 → medium
    const r2 = evaluateWorkOverrunRisk(base({ priorOverruns: 3 }));
    expect(r2.riskLevel).toBe("medium");
    expect(r2.reasonCodes).toContain("prior_overrun_pattern");
  });

  it("#4 high は evidence を持つ・裸スコア禁止（RealityAttribute・conf付）", () => {
    const r = evaluateWorkOverrunRisk(base({ estimatedMinutes: 90, plannedMinutes: 60 }));
    expect(r.riskLevel).toBe("high");
    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.attribute.value).toBe("high");
    expect(typeof r.attribute.confidence).toBe("number");
    expect(realityAttributeViolations("overrun", r.attribute)).toEqual([]);
    expect(r.recommendedActionHint).not.toBeNull();
  });

  it("#5 source 境界: heuristic は conf≤0.35 / user_confirmed は inferred", () => {
    const h = evaluateWorkOverrunRisk(base({ estimatedMinutes: 90, plannedMinutes: 60, sourceKind: "heuristic" }));
    expect(h.attribute.status).toBe("heuristic");
    expect(h.attribute.confidence).toBeLessThanOrEqual(HEURISTIC_CONFIDENCE_MAX);
    const u = evaluateWorkOverrunRisk(base({ estimatedMinutes: 90, plannedMinutes: 60, sourceKind: "user_confirmed" }));
    expect(u.attribute.status).toBe("inferred");
    expect(u.attribute.confidence).toBeGreaterThan(HEURISTIC_CONFIDENCE_MAX);
  });

  it("#6 hasMinimalProgress は high のヒントに反映（level は変えない）", () => {
    const withMp = evaluateWorkOverrunRisk(base({ estimatedMinutes: 90, plannedMinutes: 60, hasMinimalProgress: true }));
    const noMp = evaluateWorkOverrunRisk(base({ estimatedMinutes: 90, plannedMinutes: 60, hasMinimalProgress: false }));
    expect(withMp.riskLevel).toBe("high");
    expect(noMp.riskLevel).toBe("high");
    expect(withMp.recommendedActionHint).not.toBe(noMp.recommendedActionHint);
  });
});
