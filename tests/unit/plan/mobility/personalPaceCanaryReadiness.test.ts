import { describe, it, expect } from "vitest";
import {
  buildCanaryReadiness,
  DEFAULT_CANARY_READINESS_CONFIG,
} from "@/lib/plan/mobility/personalPaceCanaryReadiness";
import type { DogfoodStabilityAssessment } from "@/lib/plan/mobility/dogfoodSafetyJournal";
import type { PersonalPaceDogfoodReadiness } from "@/lib/plan/mobility/personalPaceDogfoodReadiness";

const stableSafe: DogfoodStabilityAssessment = { daysObserved: 8, daysWithConcern: 0, daysReadyForDogfood: 8, stability: "stable_safe" };
const dogfoodReady: PersonalPaceDogfoodReadiness = { checks: [], overall: "ready_for_dogfood", blockers: [], watchItems: [], rollbackConditions: [] };

function build(over: Partial<Parameters<typeof buildCanaryReadiness>[0]> = {}) {
  return buildCanaryReadiness({ stability: stableSafe, dogfoodReadiness: dogfoodReady, activationReadyCount: 3, ...over });
}

describe("buildCanaryReadiness — 集約判定", () => {
  it("全 check pass → ready_for_canary_assessment・blockers なし", () => {
    const r = build();
    expect(r.overall).toBe("ready_for_canary_assessment");
    expect(r.blockers).toHaveLength(0);
    expect(r.checks).toHaveLength(4);
  });
  it("★stable_safe でない（unstable）→ not_ready", () => {
    expect(build({ stability: { ...stableSafe, stability: "unstable", daysWithConcern: 1 } }).overall).toBe("not_ready_for_canary");
  });
  it("★観測日数不足（<7）→ not_ready", () => {
    const r = build({ stability: { ...stableSafe, daysObserved: 4 } });
    expect(r.overall).toBe("not_ready_for_canary");
    expect(r.checks.find((c) => c.key === "enough_observed_days")?.passed).toBe(false);
  });
  it("dogfood not_ready → not_ready_for_canary", () => {
    expect(build({ dogfoodReadiness: { ...dogfoodReady, overall: "not_ready" } }).overall).toBe("not_ready_for_canary");
  });
  it("★単一区間（activationReadyCount<2）→ not_ready（複数区間の成熟を要求）", () => {
    const r = build({ activationReadyCount: 1 });
    expect(r.overall).toBe("not_ready_for_canary");
    expect(r.checks.find((c) => c.key === "multiple_activation_groups")?.passed).toBe(false);
  });
});

describe("buildCanaryReadiness — 安全", () => {
  it("★note で canary 実行 / production block 解除は CEO 判断と明示", () => {
    const r = build();
    expect(r.note).toContain("CEO 判断");
    expect(r.note).toContain("実行しない");
  });
  it("★raw 数値（ratio/friction/座標）を detail に含まない（status/件数のみ）", () => {
    const joined = JSON.stringify(build());
    expect(joined).not.toContain("ratio");
    expect(joined).not.toContain("friction");
    expect(joined).not.toContain("lat");
  });
  it("config 既定（観測7日・区間2）", () => {
    expect(DEFAULT_CANARY_READINESS_CONFIG.minObservedDays).toBe(7);
    expect(DEFAULT_CANARY_READINESS_CONFIG.minActivationGroups).toBe(2);
  });
});
