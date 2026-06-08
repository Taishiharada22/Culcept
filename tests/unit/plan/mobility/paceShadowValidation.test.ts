import { describe, it, expect } from "vitest";
import { validatePaceShadow, DEFAULT_PACE_SHADOW_CONFIG } from "@/lib/plan/mobility/paceShadowValidation";
import type { RehearsalInput, RehearsalStep, RehearsalTransitionInput } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";
import type { PersonalPaceRatioResult } from "@/lib/plan/mobility/personalPaceRatio";

const ev = (id: string): RehearsalStep["event"] => ({ id, timeBucket: "noon", durationMin: 60, durationAssumed: false, sensitive: false });
const tr = (over: Partial<RehearsalTransitionInput> = {}): RehearsalTransitionInput => ({
  mode: "public_transit", travelMin: 30, travelKnown: true, bufferStatus: "sufficient", slackMin: 60, shortfallMin: null, gapMin: 90, ...over,
});
const input: RehearsalInput = {
  date: "2026-06-08", dayMood: "light", density: "balanced", baseEnergyLevel: null,
  steps: [{ event: ev("a"), transitionAfter: tr() }, { event: ev("b"), transitionAfter: null }],
};
const longerPace = (): PersonalPaceRatioResult => ({
  groupKey: "g", mode: "train", status: "ready", medianRatio: 1.5, tendency: "tends_longer", strength: "established", n: 5,
});

describe("validatePaceShadow — 反映なし（null resolver）", () => {
  const r = validatePaceShadow(input, () => null);
  it("changed=false（同一参照＝差分なし）", () => expect(r.changed).toBe(false));
  it("viability before==after・懸念なし", () => {
    expect(r.viabilityBefore).toBe(r.viabilityAfter);
    expect(r.anyConcern).toBe(false);
    expect(r.convergenceCountBefore).toBe(r.convergenceCountAfter);
  });
});

describe("validatePaceShadow — ready-longer 反映", () => {
  it("changed=true・friction が増える（before→after）", () => {
    const r = validatePaceShadow(input, () => longerPace());
    expect(r.changed).toBe(true);
    const d = r.legDiffs[0];
    expect(d.frictionBefore).not.toBeNull();
    expect(d.frictionAfter!).toBeGreaterThan(d.frictionBefore!);
  });
  it("★default config では over-change しない（adapter clamp[0.85,1.25] が過剰変化を防ぐ＝安全）", () => {
    const r = validatePaceShadow(input, () => longerPace()); // DEFAULT overChangeRatio 0.5
    expect(r.overChangeLegCount).toBe(0);
  });
  it("★閾値を極小にすると over-change を検出できる（検出ロジック自体の確認）", () => {
    const r = validatePaceShadow(input, () => longerPace(), {
      shadowConfig: { markerExplosionDelta: 2, overChangeRatio: 0.01 },
    });
    expect(r.overChangeLegCount).toBeGreaterThanOrEqual(1);
    expect(r.anyConcern).toBe(true);
  });
});

describe("validatePaceShadow — 構造", () => {
  it("viability/peakStrain/convergence/legDiffs を構造的に返す", () => {
    const r = validatePaceShadow(input, () => null);
    expect(["holds", "tight", "breaks", "unknown"]).toContain(r.viabilityBefore);
    expect(typeof r.viabilityRegressed).toBe("boolean");
    expect(typeof r.markerExplosion).toBe("boolean");
    expect(r.legDiffs.length).toBeGreaterThanOrEqual(1);
  });
  it("DEFAULT_PACE_SHADOW_CONFIG は markerExplosionDelta/overChangeRatio を持つ", () => {
    expect(DEFAULT_PACE_SHADOW_CONFIG.markerExplosionDelta).toBeGreaterThan(0);
    expect(DEFAULT_PACE_SHADOW_CONFIG.overChangeRatio).toBeGreaterThan(0);
  });
});
