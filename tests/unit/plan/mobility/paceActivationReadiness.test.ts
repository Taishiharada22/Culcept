import { describe, it, expect } from "vitest";
import {
  buildPaceActivationReadiness,
  DEFAULT_PACE_READINESS_CONFIG,
} from "@/lib/plan/mobility/paceActivationReadiness";
import type { PersonalPaceRatioResult } from "@/lib/plan/mobility/personalPaceRatio";

function ready(n: number, over: Partial<PersonalPaceRatioResult> = {}): PersonalPaceRatioResult {
  return {
    groupKey: `od:g${n}|train`,
    odKey: `g${n}`,
    mode: "train",
    status: "ready",
    medianRatio: 1.2,
    tendency: "tends_longer",
    strength: n >= 5 ? "established" : "emerging",
    n,
    ...over,
  };
}
const notEnough: PersonalPaceRatioResult = { groupKey: "od:x|walk", odKey: "x", mode: "walk", status: "not_enough_signal", n: 2 };
const unknown: PersonalPaceRatioResult = { groupKey: "od:y|bus", odKey: "y", mode: "bus", status: "unknown" };

describe("buildPaceActivationReadiness — group 分類", () => {
  it("A1-4 ready かつ n≥minForActivation(8) → ready_for_activation", () => {
    const r = buildPaceActivationReadiness([ready(8)]);
    expect(r.groups[0].status).toBe("ready_for_activation");
  });
  it("A1-4 ready だが n<8（3-7）→ ready_for_shadow", () => {
    expect(buildPaceActivationReadiness([ready(4)]).groups[0].status).toBe("ready_for_shadow");
  });
  it("not_enough_signal / unknown → not_enough", () => {
    const r = buildPaceActivationReadiness([notEnough, unknown]);
    expect(r.groups.map((g) => g.status)).toEqual(["not_enough", "not_enough"]);
  });
});

describe("buildPaceActivationReadiness — overall（★sparse は activation しない）", () => {
  it("activation-level group が 1 つ以上 → overall ready_for_activation", () => {
    expect(buildPaceActivationReadiness([ready(8), ready(4), notEnough]).overall).toBe("ready_for_activation");
  });
  it("shadow-level のみ → overall ready_for_shadow（activation しない）", () => {
    const r = buildPaceActivationReadiness([ready(4), notEnough]);
    expect(r.overall).toBe("ready_for_shadow");
    expect(r.readyForActivationCount).toBe(0);
  });
  it("★全部 not_enough（sparse）→ overall not_enough（絶対 activation しない）", () => {
    expect(buildPaceActivationReadiness([notEnough, unknown]).overall).toBe("not_enough");
  });
  it("空 → not_enough", () => {
    expect(buildPaceActivationReadiness([]).overall).toBe("not_enough");
  });
  it("count が正しい", () => {
    const r = buildPaceActivationReadiness([ready(8), ready(10), ready(4)]);
    expect(r.readyForActivationCount).toBe(2);
    expect(r.readyForShadowCount).toBe(1);
  });
});

describe("DEFAULT_PACE_READINESS_CONFIG", () => {
  it("minForActivation は shadow(=A1-4 ready の 3)より厳しい", () => {
    expect(DEFAULT_PACE_READINESS_CONFIG.minForActivation).toBeGreaterThan(3);
  });
});
