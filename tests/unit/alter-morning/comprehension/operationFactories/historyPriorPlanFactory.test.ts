/**
 * historyPriorPlanFactory (OP-3B) — pure factory test
 *
 * 検証観点:
 *   1. priorPlan null → 空配列
 *   2. samePlanDate=false → 空配列 (= 別日 plan は弱い fallback)
 *   3. priorPlan.journeyOrigin が unknown → 空配列
 *   4. priorPlan.journeyOrigin.source が STRONG_PRIOR_ORIGIN_SOURCES に含まれない → 空配列
 *   5. STRONG source (= user_declared / user_override / previous_day_endpoint /
 *      previous_day_assumed_endpoint) → 1 envelope (priority 900 / high)
 *   6. pure (= input mutate なし)
 */

import { describe, it, expect } from "vitest";
import {
  historyPriorPlanFactory,
  type HistoryPriorPlanInput,
} from "@/lib/alter-morning/comprehension/operationFactories/historyPriorPlanFactory";
import type { MorningPlan } from "@/lib/alter-morning/types";
import type { JourneyAnchorState } from "@/lib/alter-morning/journey/anchorState";

function makePlan(
  journeyOrigin: JourneyAnchorState,
  journeyEnd: JourneyAnchorState,
  date = "2026-05-05",
): MorningPlan {
  return {
    date,
    items: [],
    dayConditions: {} as MorningPlan["dayConditions"],
    createdAt: "2026-05-05T00:00:00.000Z",
    confirmed: false,
    status: "provisional",
    journeyOrigin,
    journeyEnd,
  };
}

const ORIGIN_USER_DECLARED: JourneyAnchorState = {
  kind: "known_exact",
  label: "自宅",
  lat: 35.6812,
  lng: 139.7671,
  source: "user_declared",
};

const ORIGIN_USER_OVERRIDE: JourneyAnchorState = {
  kind: "known_label_only",
  label: "東京駅丸の内口",
  source: "user_override",
};

const ORIGIN_REGISTERED_HOME: JourneyAnchorState = {
  kind: "known_exact",
  label: "自宅",
  lat: 35.6812,
  lng: 139.7671,
  source: "registered_home", // ← STRONG ではない
};

const ORIGIN_UNKNOWN: JourneyAnchorState = {
  kind: "unknown",
  reason: "no_baseline",
};

const END_UNKNOWN: JourneyAnchorState = {
  kind: "unknown",
  reason: "no_endpoint_signal",
};

describe("historyPriorPlanFactory (OP-3B)", () => {
  it("priorPlan null → 空配列", () => {
    const result = historyPriorPlanFactory({
      priorPlan: null,
      samePlanDate: true,
    });
    expect(result).toEqual([]);
  });

  it("priorPlan undefined → 空配列", () => {
    const result = historyPriorPlanFactory({
      priorPlan: undefined,
      samePlanDate: true,
    });
    expect(result).toEqual([]);
  });

  it("samePlanDate=false → 空配列 (= 別日 plan の prior は弱い fallback)", () => {
    const plan = makePlan(ORIGIN_USER_DECLARED, END_UNKNOWN);
    const result = historyPriorPlanFactory({
      priorPlan: plan,
      samePlanDate: false,
    });
    expect(result).toEqual([]);
  });

  it("priorPlan.journeyOrigin が unknown → 空配列", () => {
    const plan = makePlan(ORIGIN_UNKNOWN, END_UNKNOWN);
    const result = historyPriorPlanFactory({
      priorPlan: plan,
      samePlanDate: true,
    });
    expect(result).toEqual([]);
  });

  it("source が STRONG ではない (= registered_home) → 空配列", () => {
    const plan = makePlan(ORIGIN_REGISTERED_HOME, END_UNKNOWN);
    const result = historyPriorPlanFactory({
      priorPlan: plan,
      samePlanDate: true,
    });
    expect(result).toEqual([]);
  });

  it("source = user_declared + samePlanDate=true → 1 envelope (priority 900 / high)", () => {
    const plan = makePlan(ORIGIN_USER_DECLARED, END_UNKNOWN);
    const result = historyPriorPlanFactory({
      priorPlan: plan,
      samePlanDate: true,
    });
    expect(result).toHaveLength(1);
    const env = result[0];
    expect(env.type).toBe("set_journey_origin");
    expect(env.source).toBe("code_history");
    expect(env.priority).toBe(900);
    expect(env.confidence).toBe("high");
    expect(env.payload).toEqual(ORIGIN_USER_DECLARED);
  });

  it("source = user_override (known_label_only) + samePlanDate=true → 1 envelope", () => {
    const plan = makePlan(ORIGIN_USER_OVERRIDE, END_UNKNOWN);
    const result = historyPriorPlanFactory({
      priorPlan: plan,
      samePlanDate: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].payload).toEqual(ORIGIN_USER_OVERRIDE);
  });

  it("trace.ruleId = 'historyPriorPlan'", () => {
    const plan = makePlan(ORIGIN_USER_DECLARED, END_UNKNOWN);
    const result = historyPriorPlanFactory({
      priorPlan: plan,
      samePlanDate: true,
    });
    expect(result[0].trace?.ruleId).toBe("historyPriorPlan");
  });

  it("sourceTurnIndex 反映", () => {
    const plan = makePlan(ORIGIN_USER_DECLARED, END_UNKNOWN);
    const result = historyPriorPlanFactory({
      priorPlan: plan,
      samePlanDate: true,
      sourceTurnIndex: 7,
    });
    expect(result[0].trace?.sourceTurnIndex).toBe(7);
  });

  it("input mutate しない", () => {
    const plan = makePlan(ORIGIN_USER_DECLARED, END_UNKNOWN);
    const input: HistoryPriorPlanInput = {
      priorPlan: plan,
      samePlanDate: true,
    };
    const snapshot = JSON.stringify(input);
    historyPriorPlanFactory(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
