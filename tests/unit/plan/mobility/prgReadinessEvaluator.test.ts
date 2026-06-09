import { describe, it, expect } from "vitest";
import {
  derivePrgAxisState,
  evaluatePrgReadiness,
  collectMobilityObservationAxes,
  type PrgAxisInput,
} from "@/lib/plan/mobility/prgReadinessEvaluator";
import type { MobilityObservation, Timeband } from "@/lib/plan/mobility/mobilityObservationStore";

function input(over: Partial<PrgAxisInput>): PrgAxisInput {
  return { axis: "movement_tolerance", flagOn: true, dataReady: true, stable: null, observed: 10, ...over };
}

describe("derivePrgAxisState — 5 状態（CEO 4 bucket + safety）", () => {
  it("★flag OFF → dormant", () => {
    expect(derivePrgAxisState(input({ flagOn: false, dataReady: true }))).toBe("dormant");
  });
  it("★flag ON ∧ data 不足 → accumulating（薄くて沈黙＝正常）", () => {
    expect(derivePrgAxisState(input({ flagOn: true, dataReady: false }))).toBe("accumulating");
  });
  it("★flag ON ∧ ready ∧ stability なし(null) → dogfooding", () => {
    expect(derivePrgAxisState(input({ dataReady: true, stable: null }))).toBe("dogfooding");
  });
  it("★flag ON ∧ ready ∧ concern(false) → needs_attention（safety: activation せず）", () => {
    expect(derivePrgAxisState(input({ dataReady: true, stable: false }))).toBe("needs_attention");
  });
  it("★flag ON ∧ ready ∧ stable_safe(true) → activation_candidate", () => {
    expect(derivePrgAxisState(input({ dataReady: true, stable: true }))).toBe("activation_candidate");
  });
});

describe("evaluatePrgReadiness — 横断集計", () => {
  it("★状態別 counts を集計", () => {
    const report = evaluatePrgReadiness([
      input({ axis: "movement_tolerance", flagOn: true, dataReady: false }), // accumulating
      input({ axis: "energy_rhythm", flagOn: true, dataReady: true, stable: null }), // dogfooding
      input({ axis: "place_affinity", flagOn: true, dataReady: true, stable: true }), // activation_candidate
      input({ axis: "personal_pace", flagOn: false }), // dormant
    ]);
    expect(report.counts).toEqual({
      dormant: 1,
      accumulating: 1,
      dogfooding: 1,
      needs_attention: 0,
      activation_candidate: 1,
    });
    expect(report.axes.find((a) => a.axis === "place_affinity")?.state).toBe("activation_candidate");
  });
});

describe("collectMobilityObservationAxes — 3 軸を共有観測から（pure・DRY）", () => {
  function obs(timeband: Timeband): MobilityObservation {
    return { mode: "train", timeband, weekday: "weekday", originKey: "home", destKey: "cafe", privacyClass: "normal" };
  }
  const FLAGS = { movementTolerance: true, energyRhythm: true, placeAffinity: false };

  it("★空観測 → 3 軸とも dataReady=false・observed=0", () => {
    const inputs = collectMobilityObservationAxes({ observations: [], flags: FLAGS });
    expect(inputs).toHaveLength(3);
    for (const i of inputs) {
      expect(i.dataReady).toBe(false);
      expect(i.observed).toBe(0);
    }
  });

  it("★十分な観測 → movement_tolerance(≥8)・energy_rhythm(≥12) は dataReady=true", () => {
    const obsList = Array.from({ length: 12 }, () => obs("morning"));
    const inputs = collectMobilityObservationAxes({ observations: obsList, flags: FLAGS });
    expect(inputs.find((i) => i.axis === "movement_tolerance")?.dataReady).toBe(true);
    expect(inputs.find((i) => i.axis === "energy_rhythm")?.dataReady).toBe(true);
  });

  it("★flag passthrough + place affinity stability passthrough", () => {
    const inputs = collectMobilityObservationAxes({
      observations: [],
      flags: { movementTolerance: false, energyRhythm: true, placeAffinity: true },
      placeAffinityStable: true,
    });
    expect(inputs.find((i) => i.axis === "movement_tolerance")?.flagOn).toBe(false);
    expect(inputs.find((i) => i.axis === "energy_rhythm")?.flagOn).toBe(true);
    expect(inputs.find((i) => i.axis === "place_affinity")?.stable).toBe(true);
  });
});
