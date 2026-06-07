import { describe, it, expect } from "vitest";
import {
  applyPersonalPaceToTravelMin,
  applyPersonalPaceToRehearsalInput,
  DEFAULT_PERSONAL_PACE_ADAPTER_CONFIG,
} from "@/lib/plan/dayRehearsal/personalPaceAdapter";
import { rehearseDay } from "@/lib/plan/dayRehearsal/dayRehearsal";
import { previewRepairSimulation } from "@/lib/plan/dayRehearsal/dayRepairSimulation";
import type {
  RehearsalInput,
  RehearsalStep,
  RehearsalTransitionInput,
} from "@/lib/plan/dayRehearsal/dayRehearsalTypes";
import type { PersonalPaceRatioResult } from "@/lib/plan/mobility/personalPaceRatio";

const ev = (id: string): RehearsalStep["event"] => ({
  id,
  timeBucket: "noon",
  durationMin: 60,
  durationAssumed: false,
  sensitive: false,
});
const tr = (over: Partial<RehearsalTransitionInput> = {}): RehearsalTransitionInput => ({
  mode: "public_transit",
  travelMin: 30,
  travelKnown: true,
  bufferStatus: "sufficient",
  slackMin: 60,
  shortfallMin: null,
  gapMin: 90,
  ...over,
});
const pace = (over: Partial<PersonalPaceRatioResult> = {}): PersonalPaceRatioResult => ({
  groupKey: "od:home->office|train",
  odKey: "home->office",
  mode: "train",
  status: "ready",
  medianRatio: 1.4,
  tendency: "tends_longer",
  strength: "established",
  n: 5,
  ...over,
});

describe("applyPersonalPaceToTravelMin — core / fallback / clamp", () => {
  it("travelMin null → no_travel・捏造しない(null)", () => {
    const r = applyPersonalPaceToTravelMin(null, pace());
    expect(r).toEqual({ adjustedMin: null, applied: false, reason: "no_travel" });
  });
  it("pace null → no_ready_pace・そのまま(fallback)", () => {
    expect(applyPersonalPaceToTravelMin(30, null)).toEqual({ adjustedMin: 30, applied: false, reason: "no_ready_pace" });
  });
  it("not_enough_signal → そのまま", () => {
    expect(applyPersonalPaceToTravelMin(30, pace({ status: "not_enough_signal", medianRatio: undefined, strength: undefined })).applied).toBe(false);
  });
  it("unknown → そのまま", () => {
    expect(applyPersonalPaceToTravelMin(30, pace({ status: "unknown", medianRatio: undefined, strength: undefined })).applied).toBe(false);
  });
  it("established longer(1.4) → soft 長め（1+0.4×0.6=1.24 → 30×1.24=37）", () => {
    const r = applyPersonalPaceToTravelMin(30, pace({ medianRatio: 1.4, strength: "established" }));
    expect(r.adjustedMin).toBe(37);
    expect(r.reason).toBe("applied_established");
  });
  it("emerging longer(1.4) → established より弱い（1+0.4×0.35=1.14 → 34）", () => {
    const r = applyPersonalPaceToTravelMin(30, pace({ medianRatio: 1.4, strength: "emerging" }));
    expect(r.adjustedMin).toBe(34);
    expect(r.reason).toBe("applied_emerging");
  });
  it("★established shorter(0.6) でも過剰に短くしない（damped 0.76 → clampMin 0.85 → 30×0.85=26）", () => {
    const r = applyPersonalPaceToTravelMin(30, pace({ medianRatio: 0.6, tendency: "tends_shorter", strength: "established" }));
    expect(r.adjustedMin).toBe(26); // 0.85 clamp（0.76 ではない）
  });
  it("★established 極端 longer(2.0) でも clampMax 1.25 で頭打ち（30×1.25=38）", () => {
    const r = applyPersonalPaceToTravelMin(30, pace({ medianRatio: 2.0, strength: "established" }));
    expect(r.adjustedMin).toBe(38);
  });
  it("clamp 範囲は [0.85,1.25]", () => {
    expect(DEFAULT_PERSONAL_PACE_ADAPTER_CONFIG.clampMin).toBe(0.85);
    expect(DEFAULT_PERSONAL_PACE_ADAPTER_CONFIG.clampMax).toBe(1.25);
  });
});

describe("applyPersonalPaceToRehearsalInput — input transform", () => {
  const input: RehearsalInput = {
    date: "2026-06-08",
    dayMood: "light",
    density: "balanced",
    baseEnergyLevel: null,
    steps: [
      { event: ev("a"), transitionAfter: tr({ travelMin: 30 }) },
      { event: ev("b"), transitionAfter: tr({ travelMin: 20 }) },
      { event: ev("c"), transitionAfter: null },
    ],
  };

  it("★resolver が常に null → 同一参照（完全不変＝flag OFF/データ無の保証）", () => {
    expect(applyPersonalPaceToRehearsalInput(input, () => null)).toBe(input);
  });
  it("step0 だけ ready-longer → step0 の travelMin のみ増・他は不変", () => {
    const out = applyPersonalPaceToRehearsalInput(input, (i) => (i === 0 ? pace({ medianRatio: 1.4, strength: "established" }) : null));
    expect(out).not.toBe(input);
    expect(out.steps[0].transitionAfter?.travelMin).toBe(37); // 30→37
    expect(out.steps[1].transitionAfter?.travelMin).toBe(20); // 不変
    expect(out.steps[2].transitionAfter).toBeNull();
  });
  it("★bufferStatus/slackMin/shortfallMin/mode/gapMin は変えない（travelMin のみ）", () => {
    const out = applyPersonalPaceToRehearsalInput(input, () => pace({ medianRatio: 1.4, strength: "established" }));
    const t0 = out.steps[0].transitionAfter!;
    expect(t0.bufferStatus).toBe("sufficient");
    expect(t0.slackMin).toBe(60);
    expect(t0.shortfallMin).toBeNull();
    expect(t0.mode).toBe("public_transit");
    expect(t0.gapMin).toBe(90);
  });
  it("travelMin null の transition は pace ready でも不変", () => {
    const withNull: RehearsalInput = {
      ...input,
      steps: [{ event: ev("a"), transitionAfter: tr({ travelMin: null }) }, { event: ev("b"), transitionAfter: null }],
    };
    expect(applyPersonalPaceToRehearsalInput(withNull, () => pace())).toBe(withNull);
  });
});

describe("rehearseDay 効果 — friction 増 / 完全不変 / what-if 無副作用", () => {
  const input: RehearsalInput = {
    date: "2026-06-08",
    dayMood: "light",
    density: "balanced",
    baseEnergyLevel: null,
    steps: [
      { event: ev("a"), transitionAfter: tr({ travelMin: 30, bufferStatus: "sufficient", slackMin: 60, shortfallMin: null }) },
      { event: ev("b"), transitionAfter: null },
    ],
  };

  it("★null resolver → rehearseDay 出力が baseline と完全一致（marker/convergence 含む）", () => {
    const baseline = rehearseDay(input);
    const adjusted = applyPersonalPaceToRehearsalInput(input, () => null);
    expect(adjusted).toBe(input); // 同一参照
    expect(rehearseDay(adjusted)).toEqual(baseline);
  });

  it("ready-longer → 当該 transition の friction.score が baseline 以上（estimate が長くなる→friction 増）", () => {
    const baseline = rehearseDay(input);
    const out = applyPersonalPaceToRehearsalInput(input, () => pace({ medianRatio: 1.5, strength: "established" }));
    const adjusted = rehearseDay(out);
    const baseF = baseline.steps[0].friction?.score ?? 0;
    const adjF = adjusted.steps[0].friction?.score ?? 0;
    expect(adjF).toBeGreaterThan(baseF);
    // 構造健全性: step 数・viability は保たれる
    expect(adjusted.steps).toHaveLength(baseline.steps.length);
    expect(adjusted.viability.outlook).toBeDefined();
  });

  it("what-if（protect_buffer）は adjusted input でも preserves（改善捏造なし・無副作用）", () => {
    const out = applyPersonalPaceToRehearsalInput(input, () => pace({ medianRatio: 1.5, strength: "established" }));
    const sim = previewRepairSimulation(out, {
      kind: "protect_buffer",
      suggestion: "(test)",
      targetStepIndex: 0,
      evidence: { basis: [], known: [], unknown: [], inferred: [] },
    });
    expect(sim.status).toBe("preserves");
  });

  it("what-if（leave_earlier）は adjusted input でも throw せず分類を返す", () => {
    const insuff: RehearsalInput = {
      ...input,
      steps: [
        { event: ev("a"), transitionAfter: tr({ travelMin: 10, bufferStatus: "insufficient", slackMin: null, shortfallMin: 40 }) },
        { event: ev("b"), transitionAfter: null },
      ],
    };
    const out = applyPersonalPaceToRehearsalInput(insuff, () => pace({ medianRatio: 1.5, strength: "established" }));
    const sim = previewRepairSimulation(out, {
      kind: "leave_earlier",
      suggestion: "(test)",
      targetStepIndex: 0,
      evidence: { basis: [], known: [], unknown: [], inferred: [] },
    });
    expect(["eases_conditionally", "preserves", "uncertain", "ambiguous_target"]).toContain(sim.status);
  });
});
