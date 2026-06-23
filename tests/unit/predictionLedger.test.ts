/**
 * P2-1 — PredictionLedger pure runtime の不変条件テスト。
 *  1. predictedValue/predictedAt immutable（どの transition でも不変）
 *  2. T_freeze 後の本人補正は予測を変えず intervention(self_report) になる・actual を作らない
 *  3. actual は NightCheck 入口のみ・set-once
 *  4. isHeadlineEligible: user_confirmed は除外
 */
import { describe, it, expect } from "vitest";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { inferredAttribute } from "@/lib/plan/realityCore/realityAttribute";
import { REALITY_DERIVATION_VERSIONS } from "@/lib/plan/realityCore/graphIdentity";
import type { PredictionEntryV0 } from "@/lib/plan/realityCore/predictionLedgerTypes";
import {
  buildPredictionEntry,
  recordNightCheckActual,
  recordPostFreezeCorrection,
  assertPredictionImmutable,
  isHeadlineEligible,
  PredictionLedgerInvariantError,
  type PredictionFreezeInputV0,
} from "@/lib/plan/realityCore/predictionLedger";

const INSTANT = makeRealityInstantJst(new Date("2026-06-23T08:00:00+09:00"));
const NIGHT = makeRealityInstantJst(new Date("2026-06-23T22:00:00+09:00"));

const baseInput = (over: Partial<PredictionFreezeInputV0> = {}): PredictionFreezeInputV0 => ({
  predictionId: "pred:2026-06-23:day:energyLevel:day:rev0",
  predictionSchemaVersion: 0,
  targetNodeKind: "day",
  targetNodeId: "2026-06-23",
  targetField: "energyLevel",
  horizon: "day",
  frozenSnapshotId: "snap0",
  graphBaseId: "base0",
  inputRevisionSet: {
    dayGraphRevision: "dg0",
    recordRevision: "rec0",
    environmentRevision: "env0:none",
    hintsRevision: "hints0:none",
    shiftRevision: "shift0:none",
    derivationRevision: "der0",
    schemaVersion: 0,
  },
  derivationVersions: REALITY_DERIVATION_VERSIONS,
  predictor: { kind: "heuristic", version: "dayState@v0", modelId: null, calibration: null },
  predictedAt: INSTANT,
  frozenContext: { frozenEvidenceRefs: [], frozenSourceTrace: [], frozenInputSummary: "test" },
  predictedValue: inferredAttribute(0.6, 0.6, ["e1"]),
  evidenceRefs: ["e1"],
  gradingFunction: "gradeEnergyLevel",
  gradingFunctionVersion: "v0",
  ...over,
});

describe("PredictionLedger runtime — 不変条件", () => {
  it("#1 buildPredictionEntry は actual 未観測・補正なしで凍結する", () => {
    const e = buildPredictionEntry(baseInput());
    expect(e.actualValue).toBeNull();
    expect(e.actualSourceKind).toBeNull();
    expect(e.observedAt).toBeNull();
    expect(e.interventions).toEqual([]);
    expect(Object.isFrozen(e)).toBe(true);
  });

  it("#2 recordNightCheckActual は actual を NightCheck で入れ・予測を変えない", () => {
    const e = buildPredictionEntry(baseInput());
    const actual = inferredAttribute(0.4, 0.9, ["nc"]);
    const after = recordNightCheckActual(e, actual, NIGHT);
    expect(after.actualSourceKind).toBe("night_check");
    expect(after.actualValue).toBe(actual);
    expect(after.observedAt).toBe(NIGHT);
    // 不変条件1: predictedValue/predictedAt は同一参照のまま
    expect(after.predictedValue).toBe(e.predictedValue);
    expect(after.predictedAt).toBe(e.predictedAt);
    expect(after.predictionId).toBe(e.predictionId);
  });

  it("#3 actual は set-once（再観測は拒否）", () => {
    const e = recordNightCheckActual(buildPredictionEntry(baseInput()), inferredAttribute(0.4, 0.9, ["nc"]), NIGHT);
    expect(() => recordNightCheckActual(e, inferredAttribute(0.3, 0.9, ["nc2"]), NIGHT)).toThrow(
      PredictionLedgerInvariantError,
    );
  });

  it("#4 T_freeze 後の本人補正は intervention(self_report) になり actual を作らない・予測不変", () => {
    const e = buildPredictionEntry(baseInput());
    const after = recordPostFreezeCorrection(e, { at: "14:30", field: "energyLevel", evidenceRefs: ["tap"] });
    expect(after.interventions).toHaveLength(1);
    expect(after.interventions[0].kind).toBe("self_report");
    // actual は依然 null（補正は actual ではない）
    expect(after.actualValue).toBeNull();
    expect(after.actualSourceKind).toBeNull();
    // 予測は不変
    expect(after.predictedValue).toBe(e.predictedValue);
    expect(after.predictedAt).toBe(e.predictedAt);
  });

  it("#5 assertPredictionImmutable は予測差し替えを検知して throw", () => {
    const e = buildPredictionEntry(baseInput());
    const tampered: PredictionEntryV0 = { ...e, predictedValue: inferredAttribute(0.99, 0.6, ["x"]) };
    expect(() => assertPredictionImmutable(e, tampered)).toThrow(PredictionLedgerInvariantError);
    // 同一予測なら通る
    expect(() => assertPredictionImmutable(e, { ...e })).not.toThrow();
  });

  it("#6 isHeadlineEligible: heuristic=対象 / user_confirmed=除外", () => {
    expect(isHeadlineEligible(buildPredictionEntry(baseInput()))).toBe(true);
    const uc = buildPredictionEntry(
      baseInput({ predictor: { kind: "user_confirmed", version: "v0", modelId: null, calibration: null } }),
    );
    expect(isHeadlineEligible(uc)).toBe(false);
  });
});
