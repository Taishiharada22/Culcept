/**
 * P3-0c — Future Simulator（薄い scenario 比較 aggregator）の不変条件テスト。
 *  - current 比の shift（better/same/worse/unknown）を出すだけ・判断器再実行なし
 *  - current 不足 / scenario 不足 → 該当軸 unknown shift + honestUnknown
 *  - permissionBoundary は緩めない（厳しい側=min を保持）
 *  - 各 comparison は confidence/reasonCodes/evidence を持つ
 */
import { describe, it, expect } from "vitest";
import {
  compareFutureScenarios,
  type FutureScenarioInputV0,
  type FutureSimulationInputV0,
} from "@/lib/plan/realityCore/futureSimulation";

const sc = (over: Partial<FutureScenarioInputV0> = {}): FutureScenarioInputV0 => ({
  scenarioId: "s",
  scenarioKind: "protect",
  feasibilityStatus: "feasible_with_risk",
  collapseRiskLevel: "elevated",
  overrunRiskLevel: "medium",
  permissionBoundary: 2,
  realityDiffSummary: null,
  dayRehearsalSummary: null,
  reasonCodes: [],
  evidence: ["e:s"],
  confidence: 0.5,
  ...over,
});
const current = (over: Partial<FutureScenarioInputV0> = {}): FutureScenarioInputV0 =>
  sc({ scenarioId: "current", scenarioKind: "current", evidence: ["e:cur"], ...over });

describe("Future Simulator — compareFutureScenarios", () => {
  it("#1 protect が成立↑/崩れ↓/超過↓ → better 群", () => {
    const input: FutureSimulationInputV0 = {
      current: current(),
      scenarios: [sc({ scenarioId: "p", scenarioKind: "protect", feasibilityStatus: "feasible", collapseRiskLevel: "low", overrunRiskLevel: "low" })],
    };
    const r = compareFutureScenarios(input);
    expect(r.scenarios[0].feasibilityShift).toBe("better");
    expect(r.scenarios[0].collapseRiskShift).toBe("better");
    expect(r.scenarios[0].overrunRiskShift).toBe("better");
    expect(r.honestUnknown).toBe(false);
  });

  it("#2 push が成立↓/超過↑ → worse", () => {
    const r = compareFutureScenarios({
      current: current(),
      scenarios: [sc({ scenarioKind: "push", feasibilityStatus: "infeasible", overrunRiskLevel: "high" })],
    });
    expect(r.scenarios[0].feasibilityShift).toBe("worse");
    expect(r.scenarios[0].overrunRiskShift).toBe("worse");
  });

  it("#3 同値 → same", () => {
    const r = compareFutureScenarios({ current: current(), scenarios: [sc()] });
    expect(r.scenarios[0].feasibilityShift).toBe("same");
    expect(r.scenarios[0].collapseRiskShift).toBe("same");
    expect(r.scenarios[0].overrunRiskShift).toBe("same");
  });

  it("#4 current 不足 → 該当軸 unknown + honestUnknown", () => {
    const r = compareFutureScenarios({
      current: current({ feasibilityStatus: "unknown" }),
      scenarios: [sc({ feasibilityStatus: "feasible" })],
    });
    expect(r.scenarios[0].feasibilityShift).toBe("unknown");
    expect(r.honestUnknown).toBe(true);
    expect(r.reasonCodes).toContain("current_incomplete");
    // 他軸は計算できる
    expect(r.scenarios[0].overrunRiskShift).not.toBe("unknown");
  });

  it("#5 scenario 不足 → その軸 unknown shift", () => {
    const r = compareFutureScenarios({
      current: current(),
      scenarios: [sc({ collapseRiskLevel: "unknown" })],
    });
    expect(r.scenarios[0].collapseRiskShift).toBe("unknown");
    expect(r.honestUnknown).toBe(true);
  });

  it("#6 permissionBoundary は緩めない（厳しい側=min を保持）", () => {
    const r = compareFutureScenarios({
      current: current({ permissionBoundary: 1 }),
      scenarios: [sc({ permissionBoundary: 4 })], // scenario が緩い → current の 1 を保持
    });
    expect(r.scenarios[0].permissionBoundary).toBe(1);
  });

  it("#7 各 comparison は confidence/reasonCodes/evidence を持つ・confidence は弱い方", () => {
    const r = compareFutureScenarios({
      current: current({ confidence: 0.3, evidence: ["e:cur"] }),
      scenarios: [sc({ confidence: 0.8, evidence: ["e:s"], reasonCodes: ["proposal:protect"] })],
    });
    const c = r.scenarios[0];
    expect(c.confidence).toBe(0.3);
    expect(c.reasonCodes).toContain("proposal:protect");
    expect(c.reasonCodes).toContain("feasibility_shift:same");
    expect(c.evidence).toEqual(expect.arrayContaining(["e:cur", "e:s"]));
  });

  it("#8 scenarios 空でも honestUnknown は current の完全性で決まる", () => {
    expect(compareFutureScenarios({ current: current(), scenarios: [] }).honestUnknown).toBe(false);
    expect(compareFutureScenarios({ current: current({ overrunRiskLevel: "unknown" }), scenarios: [] }).honestUnknown).toBe(true);
  });
});
