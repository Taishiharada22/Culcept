import { describe, it, expect } from "vitest";
import {
  applyStance,
  compareScenarios,
  scenarioComparisonReasonLines,
  DAY_REHEARSAL_SCENARIO_COMPARISON_ENABLED,
} from "@/lib/plan/dayRehearsal/scenarioComparison";
import type {
  RehearsalInput,
  RehearsalStep,
  RehearsalEventInput,
  RehearsalTransitionInput,
} from "@/lib/plan/dayRehearsal/dayRehearsalTypes";

function ev(id: string, over: Partial<RehearsalEventInput> = {}): RehearsalEventInput {
  return { id, timeBucket: "morning", durationMin: 60, durationAssumed: false, sensitive: false, ...over };
}
function trans(over: Partial<RehearsalTransitionInput> = {}): RehearsalTransitionInput {
  return { mode: "walk", travelMin: 10, travelKnown: true, bufferStatus: "sufficient", slackMin: 60, shortfallMin: null, gapMin: 60, ...over };
}
function mkInput(steps: RehearsalStep[], over: Partial<RehearsalInput> = {}): RehearsalInput {
  return { date: "2026-06-09", dayMood: "light", density: "balanced", baseEnergyLevel: null, steps, ...over };
}
// ★COMPARED: sufficient buffer + recovery（aggressive で薄くすると tight 方向に複数 signal が動く）
const FIXTURE_COMPARED = mkInput([
  { event: ev("a"), transitionAfter: trans({ bufferStatus: "sufficient", slackMin: 60, gapMin: 60 }) },
  { event: ev("b"), transitionAfter: null },
]);
// ★IDENTICAL: not_applicable buffer・travel known（outlook は出るが 3 案で差が出ない）
const FIXTURE_IDENTICAL = mkInput([
  { event: ev("a", { durationMin: 30 }), transitionAfter: trans({ bufferStatus: "not_applicable", slackMin: null, gapMin: null, travelMin: 10, travelKnown: true }) },
  { event: ev("b", { durationMin: 30 }), transitionAfter: null },
]);
// ★INSUFFICIENT: buffer も travel も signal なし → baseline outlook unknown
const FIXTURE_UNKNOWN = mkInput([
  { event: ev("a"), transitionAfter: trans({ bufferStatus: "not_applicable", slackMin: null, gapMin: null, travelMin: null, travelKnown: false, mode: "unknown" }) },
  { event: ev("b"), transitionAfter: null },
]);

describe("flag / gate", () => {
  it("★default OFF（production hard block）", () => {
    expect(DAY_REHEARSAL_SCENARIO_COMPARISON_ENABLED).toBe(false);
  });
});

describe("applyStance — 診断レンズ・event/order 不触・immutable", () => {
  it("★baseline は同一参照", () => {
    expect(applyStance(FIXTURE_COMPARED, "baseline")).toBe(FIXTURE_COMPARED);
  });
  it("★aggressive: sufficient→insufficient + slack/gap null・原入力は不変・event は不触", () => {
    const snapshot = JSON.parse(JSON.stringify(FIXTURE_COMPARED));
    const agg = applyStance(FIXTURE_COMPARED, "aggressive");
    expect(agg.steps[0]!.transitionAfter!.bufferStatus).toBe("insufficient");
    expect(agg.steps[0]!.transitionAfter!.slackMin).toBeNull();
    expect(agg.steps[0]!.transitionAfter!.gapMin).toBeNull();
    // ★event duration / order は変えない
    expect(agg.steps.map((s) => s.event.id)).toEqual(["a", "b"]);
    expect(agg.steps[0]!.event.durationMin).toBe(FIXTURE_COMPARED.steps[0]!.event.durationMin);
    expect(FIXTURE_COMPARED).toEqual(snapshot); // 原入力 mutate なし
  });
  it("★protective: insufficient→sufficient（null）", () => {
    const base = mkInput([{ event: ev("a"), transitionAfter: trans({ bufferStatus: "insufficient", slackMin: null, shortfallMin: 30 }) }, { event: ev("b"), transitionAfter: null }]);
    const prot = applyStance(base, "protective");
    expect(prot.steps[0]!.transitionAfter!.bufferStatus).toBe("sufficient");
    expect(prot.steps[0]!.transitionAfter!.shortfallMin).toBeNull();
  });
});

describe("compareScenarios — contrast gate・最適案/断定なし", () => {
  it("★3 案に明確な差 → compared（≥2 signal）+ ノート", () => {
    const r = compareScenarios(FIXTURE_COMPARED);
    expect(r.status).toBe("compared");
    expect(r.coherentSignals).toBeGreaterThanOrEqual(2);
    expect([r.protectiveNote, r.aggressiveNote].some(Boolean)).toBe(true);
  });
  it("★3 案がほぼ同じ → identical（沈黙）", () => {
    const r = compareScenarios(FIXTURE_IDENTICAL);
    expect(r.status).toBe("identical");
    expect(scenarioComparisonReasonLines(r)).toEqual([]);
  });
  it("★unknown → insufficient（沈黙）", () => {
    expect(compareScenarios(FIXTURE_UNKNOWN).status).toBe("insufficient");
  });
  it("★原入力を mutate しない", () => {
    const snapshot = JSON.parse(JSON.stringify(FIXTURE_COMPARED));
    compareScenarios(FIXTURE_COMPARED);
    expect(FIXTURE_COMPARED).toEqual(snapshot);
  });
});

describe("scenarioComparisonReasonLines — 数字/最適案/断定なし", () => {
  it("★compared のノートに「最適/失敗/危険/数字/%/スコア」を含まない・hedge あり", () => {
    const lines = scenarioComparisonReasonLines(compareScenarios(FIXTURE_COMPARED));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toMatch(/[0-9%]/);
      for (const w of ["最適", "失敗", "危険", "壊れ", "スコア", "改善します", "良くなります"]) {
        expect(line).not.toContain(w);
      }
    }
    expect(lines.join("")).toMatch(/見えます|かもしれません/); // hedge
  });
  it("★identical/insufficient → []（沈黙）", () => {
    expect(scenarioComparisonReasonLines(compareScenarios(FIXTURE_IDENTICAL))).toEqual([]);
    expect(scenarioComparisonReasonLines(compareScenarios(FIXTURE_UNKNOWN))).toEqual([]);
  });
});
