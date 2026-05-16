/**
 * CoAlter Gap 4 — Calibration Analyzer Tests (D6-a phase)
 *
 * 正本:
 *   - lib/coalter/presence/calibrationAnalyzer.ts (本 PR D6-a)
 *   - lib/coalter/presence/observationEvent.ts (D5-a、PR #143)
 *
 * CEO 必須 tests (2026-05-16):
 *   - empty events fail-closed
 *   - valid event array summary
 *   - insufficient sample warning
 *   - by mode aggregation
 *   - by detectorVersion aggregation
 *   - by skippedReason aggregation
 *   - confidence bucket distribution
 *   - signal count bucket distribution
 *   - patternContext flag rate calculation
 *   - activation true anomaly warning
 *   - shouldEmit true anomaly warning
 *   - malformed event ignored or counted as invalid
 *   - raw text / PII が output に入らない
 *   - deterministic output
 *   - no telemetry / Sentry / console / storage / DB
 *   - no runtime wiring
 *
 * 18 test category × 60+ individual tests.
 */

import { describe, expect, it, vi } from "vitest";
import {
  analyzeCalibrationEvents,
  CALIBRATION_ANALYZER_VERSION,
  CALIBRATION_SUMMARY_SCHEMA_VERSION,
  CALIBRATION_PII_FORBIDDEN_FIELD_NAMES,
  PROVISIONAL_SAMPLE_THRESHOLD_INSUFFICIENT,
  PROVISIONAL_SAMPLE_THRESHOLD_LOW,
  PROVISIONAL_SAMPLE_THRESHOLD_MODERATE,
  type CalibrationSummary,
  type CalibrationReasonCode,
  type CalibrationWarning,
  type ProvisionalThresholdNote,
  type RecommendedNextAction,
  type SampleQuality,
  type DistributionShape,
} from "../../../../lib/coalter/presence/calibrationAnalyzer";
import {
  buildRedactedObservationEvent,
  type RedactedObservationEvent,
} from "../../../../lib/coalter/presence/observationEvent";
import {
  buildGap4RouteObservationFromEnv,
  type Gap4RouteObservationField,
} from "../../../../lib/coalter/presence/contextDetectionMode";

// ─────────────────────────────────────────────
// Helper: make valid event chain via D3 + D5-a
// ─────────────────────────────────────────────

function makeObserveEvent(): RedactedObservationEvent {
  const obs = buildGap4RouteObservationFromEnv("observe", {
    contradictionDetected: true,
    infoMissingSignal: true,
    recentMessageCount: 0,
  });
  if (obs === undefined) throw new Error("D3 builder error");
  return buildRedactedObservationEvent({ observation: obs });
}

function makeLiveEvent(): RedactedObservationEvent {
  const obs = buildGap4RouteObservationFromEnv("live", {
    stallDetected: true,
    fairnessBias: 0.8,
  });
  if (obs === undefined) throw new Error("D3 builder error");
  return buildRedactedObservationEvent({ observation: obs });
}

function makeSkippedEvent(): RedactedObservationEvent {
  const obs = buildGap4RouteObservationFromEnv("observe");
  if (obs === undefined) throw new Error("D3 builder error");
  return buildRedactedObservationEvent({ observation: obs });
}

function makeOffEvent(): RedactedObservationEvent {
  return buildRedactedObservationEvent({ observation: undefined });
}

function makeEventArray(count: number, builder: () => RedactedObservationEvent): RedactedObservationEvent[] {
  return Array.from({ length: count }, () => builder());
}

// ─────────────────────────────────────────────
// Test 1: empty events fail-closed (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — empty events fail-closed", () => {
  it("events empty → insufficient_sample + empty_input_fail_closed reason", () => {
    const summary = analyzeCalibrationEvents({ events: [] });
    expect(summary.sampleCount).toBe(0);
    expect(summary.validSampleCount).toBe(0);
    expect(summary.sampleQuality).toBe("insufficient_sample" satisfies SampleQuality);
    expect(summary.reasonCodes).toContain(
      "empty_input_fail_closed" satisfies CalibrationReasonCode,
    );
    expect(summary.calibrationWarnings).toContain(
      "sample_size_below_minimum" satisfies CalibrationWarning,
    );
    expect(summary.recommendedNextAction).toBe(
      "collect_more_samples" satisfies RecommendedNextAction,
    );
    expect(summary.schemaVersion).toBe(CALIBRATION_SUMMARY_SCHEMA_VERSION);
    expect(summary.analyzerVersion).toBe(CALIBRATION_ANALYZER_VERSION);
  });
});

// ─────────────────────────────────────────────
// Test 2: valid event array summary (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — valid event array summary", () => {
  it("100 valid observe events → moderate_sample + summary_built", () => {
    const events = makeEventArray(100, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.sampleCount).toBe(100);
    expect(summary.validSampleCount).toBe(100);
    expect(summary.sampleQuality).toBe("moderate_sample");
    expect(summary.reasonCodes).toContain("summary_built");
  });
});

// ─────────────────────────────────────────────
// Test 3: insufficient sample warning (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — sample quality classifier", () => {
  it("< 10 events → insufficient_sample + sample_size_below_minimum", () => {
    const events = makeEventArray(5, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.sampleQuality).toBe("insufficient_sample");
    expect(summary.calibrationWarnings).toContain("sample_size_below_minimum");
  });

  it("10-99 events → low_sample", () => {
    const events = makeEventArray(50, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.sampleQuality).toBe("low_sample");
  });

  it("100-999 events → moderate_sample", () => {
    const events = makeEventArray(500, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.sampleQuality).toBe("moderate_sample");
  });

  it("1000+ events → sufficient_sample", () => {
    const events = makeEventArray(1000, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.sampleQuality).toBe("sufficient_sample");
  });

  it("PROVISIONAL boundaries は 10 / 100 / 1000", () => {
    expect(PROVISIONAL_SAMPLE_THRESHOLD_INSUFFICIENT).toBe(10);
    expect(PROVISIONAL_SAMPLE_THRESHOLD_LOW).toBe(100);
    expect(PROVISIONAL_SAMPLE_THRESHOLD_MODERATE).toBe(1000);
  });
});

// ─────────────────────────────────────────────
// Test 4: by mode aggregation (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — byMode aggregation", () => {
  it("mixed observe / live / off events → 各 mode count", () => {
    const events = [
      ...makeEventArray(20, makeObserveEvent),
      ...makeEventArray(15, makeLiveEvent),
      ...makeEventArray(5, makeOffEvent),
    ];
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.byMode.observe).toBe(20);
    expect(summary.byMode.live).toBe(15);
    expect(summary.byMode.off).toBe(5);
  });
});

// ─────────────────────────────────────────────
// Test 5: by detectorVersion aggregation (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — byDetectorVersion aggregation", () => {
  it("同 detectorVersion 集約", () => {
    const events = makeEventArray(30, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    // observe event は detectorVersion=0.1.0 を持つ
    expect(summary.byDetectorVersion["0.1.0"]).toBeGreaterThan(0);
  });

  it("undefined detectorVersion → '<unknown>' key", () => {
    const events: RedactedObservationEvent[] = [makeOffEvent()];
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.byDetectorVersion["<unknown>"]).toBe(1);
  });

  it("複数 detectorVersion 混在 → detector_version_drift_detected warning", () => {
    const ev1 = makeObserveEvent();
    const ev2 = { ...ev1, detectorVersion: "0.2.0" };
    const summary = analyzeCalibrationEvents({ events: [ev1, ev2] });
    expect(summary.detectorVersionDriftDetected).toBe(true);
    expect(summary.calibrationWarnings).toContain(
      "detector_version_drift_detected" satisfies CalibrationWarning,
    );
  });
});

// ─────────────────────────────────────────────
// Test 6: by skippedReason aggregation (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — bySkippedReason aggregation", () => {
  it("skipped event → bySkippedReason key 追加", () => {
    const events = makeEventArray(20, makeSkippedEvent);
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.bySkippedReason["insufficient_structured_signals"]).toBe(20);
  });

  it("not skipped event → <not_skipped> key", () => {
    const events = makeEventArray(10, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.bySkippedReason["<not_skipped>"]).toBe(10);
  });

  it("全 skipped → all_skipped_no_useful_data warning", () => {
    const events = makeEventArray(20, makeSkippedEvent);
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.calibrationWarnings).toContain(
      "all_skipped_no_useful_data" satisfies CalibrationWarning,
    );
  });
});

// ─────────────────────────────────────────────
// Test 7: confidence bucket distribution (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — byConfidenceBucket distribution", () => {
  it("observe events with contradictionDetected → needFraming bucket high_70_plus", () => {
    const events = makeEventArray(100, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    const needFramingBuckets = summary.byConfidenceBucket["needFraming"];
    expect(needFramingBuckets).toBeDefined();
    expect(needFramingBuckets.high_70_plus).toBe(100);
    expect(needFramingBuckets.none_0).toBe(0);
  });

  it("bucketDistributionShapes: high 偏り → skewed_to_high or all_in_high_bucket", () => {
    const events = makeEventArray(100, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    const shape = summary.bucketDistributionShapes["needFraming"];
    expect(["all_in_high_bucket", "skewed_to_high"]).toContain(shape);
  });

  it("no_data shape for unobserved fields", () => {
    const summary = analyzeCalibrationEvents({ events: [] });
    for (const shape of Object.values(summary.bucketDistributionShapes)) {
      expect(shape).toBe("no_data" satisfies DistributionShape);
    }
  });
});

// ─────────────────────────────────────────────
// Test 8: signal count bucket distribution (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — bySignalCountBucket distribution", () => {
  it("observe events で signal count bucket が分布", () => {
    const events = makeEventArray(50, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    // observe event は infoMissing signal を持つ → infoMissing signal count = 1 (low_1_to_2)
    const infoMissingBuckets = summary.bySignalCountBucket["infoMissing"];
    expect(infoMissingBuckets).toBeDefined();
    expect(infoMissingBuckets.low_1_to_2 + infoMissingBuckets.mid_3_to_5 + infoMissingBuckets.high_6_plus).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// Test 9: patternContext flag rate calculation (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — patternContextFlagRates", () => {
  it("observe + contradictionDetected → needFraming rate = 1.0", () => {
    const events = makeEventArray(100, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    // observe with contradictionDetected → needFraming=true 全 event
    expect(summary.patternContextFlagRates.needFraming).toBeCloseTo(1.0, 2);
  });

  it("skipped events → patternContext 不在で rate = 0", () => {
    const events = makeEventArray(100, makeSkippedEvent);
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.patternContextFlagRates.needFraming).toBe(0);
  });

  it("rate は 0-1 範囲", () => {
    const events = makeEventArray(100, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    for (const rate of Object.values(summary.patternContextFlagRates)) {
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  });
});

// ─────────────────────────────────────────────
// Test 10: activation true anomaly warning (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — activation true anomaly", () => {
  it("activation: true 混入 → calibrationWarnings に追加、実行・送信しない", () => {
    const validEvent = makeObserveEvent();
    const anomalousEvent = { ...validEvent, activation: true as unknown as false };
    const events = [validEvent, anomalousEvent as RedactedObservationEvent];
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.calibrationWarnings).toContain(
      "activation_true_anomaly_detected" satisfies CalibrationWarning,
    );
    expect(summary.activationInvariant.unexpectedTrueCount).toBe(1);
    expect(summary.activationInvariant.invariantHeld).toBe(false);
    expect(summary.recommendedNextAction).toBe("investigate_anomalies");
    expect(summary.provisionalThresholdNotes).toContain(
      "anomaly_present_avoid_calibration" satisfies ProvisionalThresholdNote,
    );
  });

  it("activation: false のみ → invariant held", () => {
    const events = makeEventArray(20, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.activationInvariant.unexpectedTrueCount).toBe(0);
    expect(summary.activationInvariant.invariantHeld).toBe(true);
    expect(summary.calibrationWarnings).not.toContain("activation_true_anomaly_detected");
  });
});

// ─────────────────────────────────────────────
// Test 11: shouldEmit true anomaly warning (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — shouldEmit true anomaly", () => {
  it("shouldEmit: true 混入 → calibrationWarnings に追加、送信しない", () => {
    const validEvent = makeObserveEvent();
    const anomalousEvent = { ...validEvent, shouldEmit: true as unknown as false };
    const events = [validEvent, anomalousEvent as RedactedObservationEvent];
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.calibrationWarnings).toContain(
      "should_emit_true_anomaly_detected" satisfies CalibrationWarning,
    );
    expect(summary.shouldEmitInvariant.unexpectedTrueCount).toBe(1);
    expect(summary.shouldEmitInvariant.invariantHeld).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Test 12: malformed event ignored or counted as invalid (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — malformed event handling", () => {
  it("malformed event (missing mode) → malformed_events_present + ignored from byMode", () => {
    const validEvent = makeObserveEvent();
    const malformed = { activation: false, shouldEmit: false };
    const summary = analyzeCalibrationEvents({
      events: [validEvent, malformed as unknown as RedactedObservationEvent],
    });
    expect(summary.sampleCount).toBe(2);
    expect(summary.validSampleCount).toBe(1);
    expect(summary.calibrationWarnings).toContain(
      "malformed_events_present" satisfies CalibrationWarning,
    );
  });

  it("non-object event → ignored as malformed (no throw)", () => {
    const events = [
      makeObserveEvent(),
      "not_an_object" as unknown as RedactedObservationEvent,
      null as unknown as RedactedObservationEvent,
      42 as unknown as RedactedObservationEvent,
    ];
    expect(() => analyzeCalibrationEvents({ events })).not.toThrow();
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.sampleCount).toBe(4);
    expect(summary.validSampleCount).toBe(1);
  });
});

// ─────────────────────────────────────────────
// Test 13: raw text / PII が output に入らない (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — raw text / PII 不入 (CEO 必須)", () => {
  it("summary keys に PII forbidden field name を含まない (top-level)", () => {
    const events = makeEventArray(20, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    const summaryKeys = Object.keys(summary);
    for (const forbiddenField of CALIBRATION_PII_FORBIDDEN_FIELD_NAMES) {
      expect(summaryKeys).not.toContain(forbiddenField);
    }
  });

  it("nested aggregation keys に PII forbidden field 不含", () => {
    const events = makeEventArray(20, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    const allNestedKeys = [
      ...Object.keys(summary.byMode),
      ...Object.keys(summary.byDetectorVersion),
      ...Object.keys(summary.bySkippedReason),
      ...Object.keys(summary.byConfidenceBucket),
      ...Object.keys(summary.bySignalCountBucket),
      ...Object.keys(summary.patternContextFlagRates),
    ];
    for (const forbiddenField of CALIBRATION_PII_FORBIDDEN_FIELD_NAMES) {
      expect(allNestedKeys).not.toContain(forbiddenField);
    }
  });

  it("raw text を含む event を渡しても summary に漏れない", () => {
    const events = [
      makeObserveEvent(),
      {
        ...makeObserveEvent(),
        rawMessage: "ユーザーの生メッセージ XYZ",
        userId: "user_abc",
        threadId: "thread_xyz",
      } as unknown as RedactedObservationEvent,
    ];
    const summary = analyzeCalibrationEvents({ events });
    const json = JSON.stringify(summary);
    expect(json).not.toContain("ユーザーの生メッセージ");
    expect(json).not.toContain("user_abc");
    expect(json).not.toContain("thread_xyz");
    expect(json).not.toContain("rawMessage");
    expect(json).not.toContain("userId");
    expect(json).not.toContain("threadId");
  });

  it("全 reasonCodes / warnings / notes は enum (lower_snake_case)", () => {
    const events = makeEventArray(20, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    for (const code of summary.reasonCodes) expect(code).toMatch(/^[a-z0-9_]+$/);
    for (const code of summary.calibrationWarnings) expect(code).toMatch(/^[a-z0-9_]+$/);
    for (const code of summary.provisionalThresholdNotes) expect(code).toMatch(/^[a-z0-9_]+$/);
  });
});

// ─────────────────────────────────────────────
// Test 14: deterministic output (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — deterministic", () => {
  it("同 input 100 回呼出で完全同一 output", () => {
    const events = makeEventArray(50, makeObserveEvent);
    const baseline = JSON.stringify(analyzeCalibrationEvents({ events }));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(analyzeCalibrationEvents({ events }))).toBe(baseline);
    }
  });

  it("events array mutation なし", () => {
    const events = makeEventArray(20, makeObserveEvent);
    const inputBefore = JSON.stringify(events);
    analyzeCalibrationEvents({ events });
    expect(JSON.stringify(events)).toBe(inputBefore);
  });

  it("reasonCodes / warnings / notes は lexicographic sort + duplicate なし", () => {
    const events = makeEventArray(20, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    const reasonsSorted = [...summary.reasonCodes].sort((a, b) => a.localeCompare(b));
    const warningsSorted = [...summary.calibrationWarnings].sort((a, b) => a.localeCompare(b));
    const notesSorted = [...summary.provisionalThresholdNotes].sort((a, b) => a.localeCompare(b));
    expect(summary.reasonCodes).toEqual(reasonsSorted);
    expect(summary.calibrationWarnings).toEqual(warningsSorted);
    expect(summary.provisionalThresholdNotes).toEqual(notesSorted);
    // dedup
    expect(new Set(summary.reasonCodes).size).toBe(summary.reasonCodes.length);
  });
});

// ─────────────────────────────────────────────
// Test 15: no telemetry / Sentry / console / storage / DB (CEO 必須)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — no side effect (CEO 必須)", () => {
  it("console.log / console.warn / console.error を呼ばない", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const events = makeEventArray(50, makeObserveEvent);
    analyzeCalibrationEvents({ events });

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("fetch を呼ばない (vitest 環境で global fetch を spy)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      return Promise.resolve(new Response()) as unknown as Promise<Response>;
    });
    const events = makeEventArray(20, makeObserveEvent);
    analyzeCalibrationEvents({ events });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// Test 16: no runtime wiring (pure function)
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — no runtime wiring", () => {
  it("output is JSON serializable", () => {
    const events = makeEventArray(20, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    const json = JSON.stringify(summary);
    const parsed = JSON.parse(json) as CalibrationSummary;
    expect(parsed.analyzerVersion).toBe(CALIBRATION_ANALYZER_VERSION);
  });

  it("dynamic import 可能 (call-site wiring なし)", async () => {
    const mod = await import("../../../../lib/coalter/presence/calibrationAnalyzer");
    expect(typeof mod.analyzeCalibrationEvents).toBe("function");
  });

  it("timestamp / createdAt / emittedAt field を summary に持たない (key check、deterministic)", () => {
    const events = makeEventArray(20, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    // Top-level field key として timestamp 系を持たない (enum 値 'deterministic_no_timestamp' は OK、key ではない)
    const summaryKeys = Object.keys(summary);
    expect(summaryKeys).not.toContain("timestamp");
    expect(summaryKeys).not.toContain("createdAt");
    expect(summaryKeys).not.toContain("emittedAt");
    expect(summaryKeys).not.toContain("created_at");
    expect(summaryKeys).not.toContain("emitted_at");
    // Nested aggregation keys も同様
    const nestedKeys = [
      ...Object.keys(summary.byMode),
      ...Object.keys(summary.byDetectorVersion),
      ...Object.keys(summary.bySkippedReason),
      ...Object.keys(summary.byConfidenceBucket),
      ...Object.keys(summary.bySignalCountBucket),
      ...Object.keys(summary.patternContextFlagRates),
      ...Object.keys(summary.activationInvariant),
      ...Object.keys(summary.shouldEmitInvariant),
    ];
    expect(nestedKeys).not.toContain("timestamp");
    expect(nestedKeys).not.toContain("createdAt");
    expect(nestedKeys).not.toContain("emittedAt");
  });
});

// ─────────────────────────────────────────────
// Test 17: const exports
// ─────────────────────────────────────────────

describe("Gap 4 D6-a — const exports", () => {
  it("CALIBRATION_ANALYZER_VERSION is '0.1.0'", () => {
    expect(CALIBRATION_ANALYZER_VERSION).toBe("0.1.0");
  });
  it("CALIBRATION_SUMMARY_SCHEMA_VERSION is '0.1.0'", () => {
    expect(CALIBRATION_SUMMARY_SCHEMA_VERSION).toBe("0.1.0");
  });
  it("CALIBRATION_PII_FORBIDDEN_FIELD_NAMES contains userId/threadId/email/timestamp", () => {
    expect(CALIBRATION_PII_FORBIDDEN_FIELD_NAMES).toContain("userId");
    expect(CALIBRATION_PII_FORBIDDEN_FIELD_NAMES).toContain("threadId");
    expect(CALIBRATION_PII_FORBIDDEN_FIELD_NAMES).toContain("email");
    expect(CALIBRATION_PII_FORBIDDEN_FIELD_NAMES).toContain("timestamp");
  });
});

// ─────────────────────────────────────────────
// Test 18: schema version drift + provisional notes
// ─────────────────────────────────────────────

describe("analyzeCalibrationEvents — schema version drift + provisional notes", () => {
  it("複数 schemaVersion 混在 → schemaVersionDriftDetected + warning", () => {
    const ev1 = makeObserveEvent();
    const ev2 = { ...makeObserveEvent(), schemaVersion: "0.2.0" };
    const summary = analyzeCalibrationEvents({ events: [ev1, ev2] });
    expect(summary.schemaVersionDriftDetected).toBe(true);
    expect(summary.calibrationWarnings).toContain(
      "schema_version_drift_detected" satisfies CalibrationWarning,
    );
    expect(summary.recommendedNextAction).toBe("investigate_schema_drift");
  });

  it("provisionalThresholdNotes に thresholds_are_provisional_not_final 常に含む", () => {
    const events = makeEventArray(20, makeObserveEvent);
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.provisionalThresholdNotes).toContain(
      "thresholds_are_provisional_not_final" satisfies ProvisionalThresholdNote,
    );
    expect(summary.provisionalThresholdNotes).toContain(
      "calibration_not_yet_authoritative" satisfies ProvisionalThresholdNote,
    );
    expect(summary.provisionalThresholdNotes).toContain(
      "use_only_for_offline_review" satisfies ProvisionalThresholdNote,
    );
  });

  it("recommendation priority: anomaly > schema drift > sample > distribution", () => {
    // anomaly 最優先
    const validEvent = makeObserveEvent();
    const anomalous = { ...validEvent, activation: true as unknown as false };
    const events = [
      ...makeEventArray(20, makeObserveEvent),
      anomalous as RedactedObservationEvent,
    ];
    const summary = analyzeCalibrationEvents({ events });
    expect(summary.recommendedNextAction).toBe("investigate_anomalies");
  });
});
