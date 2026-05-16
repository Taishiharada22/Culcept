/**
 * CoAlter Gap 4 — Redacted Observation Event Builder Tests (D5-a phase)
 *
 * 正本:
 *   - lib/coalter/presence/observationEvent.ts (本 PR D5-a)
 *   - lib/coalter/presence/contextDetectionMode.ts (D3、PR #141)
 *   - lib/coalter/presence/clientObservationReceive.ts (D4、PR #142)
 *
 * CEO 必須 tests (2026-05-16):
 *   - empty input fail-closed
 *   - valid observation to redacted event
 *   - skipped observation to redacted event
 *   - activation true が来ても false 扱い or no emit
 *   - raw text / PII が payload に入らない
 *   - userId / pairId / threadId を含めない
 *   - unknown shape fail-closed
 *   - confidence bucket deterministic
 *   - reasonCodes fixed only
 *   - deterministic output
 *   - no storage / console / Sentry / telemetry send
 *   - no runtime wiring
 *
 * 17 test category × 50+ individual tests.
 */

import { describe, expect, it, vi } from "vitest";
import {
  buildRedactedObservationEvent,
  bucketConfidence,
  bucketSignalCount,
  getEventEmitDecision,
  OBSERVATION_EVENT_NAME,
  OBSERVATION_EVENT_SCHEMA_VERSION,
  OBSERVATION_EVENT_BUILDER_VERSION,
  PII_FORBIDDEN_FIELD_NAMES,
  type RedactedObservationEvent,
  type RedactedEventReasonCode,
  type ConfidenceBucket,
  type SignalCountBucket,
  type RedactionLevel,
} from "../../../../lib/coalter/presence/observationEvent";
import {
  buildGap4RouteObservationFromEnv,
  type Gap4RouteObservationField,
} from "../../../../lib/coalter/presence/contextDetectionMode";

// ─────────────────────────────────────────────
// Helper: make valid observation via D3 builder
// ─────────────────────────────────────────────

function makeValidObservation(): Gap4RouteObservationField {
  const obs = buildGap4RouteObservationFromEnv("observe", {
    contradictionDetected: true,
    infoMissingSignal: true,
    recentMessageCount: 0,
  });
  if (obs === undefined) throw new Error("D3 builder should return field");
  return obs;
}

function makeSkippedObservation(): Gap4RouteObservationField {
  const obs = buildGap4RouteObservationFromEnv("observe");
  if (obs === undefined) throw new Error("D3 builder should return field");
  return obs;
}

function makeUnknownFallbackObservation(): Gap4RouteObservationField {
  const obs = buildGap4RouteObservationFromEnv("unknown_value");
  if (obs === undefined) throw new Error("D3 builder should return field");
  return obs;
}

// ─────────────────────────────────────────────
// Test 1: empty input fail-closed (CEO 必須)
// ─────────────────────────────────────────────

describe("buildRedactedObservationEvent — empty input fail-closed", () => {
  it("observation undefined → minimal event + missing_observation reason", () => {
    const event = buildRedactedObservationEvent({ observation: undefined });
    expect(event).toBeDefined();
    expect(event.shouldEmit).toBe(false);
    expect(event.activation).toBe(false);
    expect(event.redactionLevel).toBe("minimal_redaction" satisfies RedactionLevel);
    expect(event.reasonCodes).toContain("missing_observation" satisfies RedactedEventReasonCode);
    expect(event.mode).toBe("off");
  });

  it("observation null → minimal event (fail-closed、throw しない)", () => {
    expect(() => {
      buildRedactedObservationEvent({ observation: null as unknown as undefined });
    }).not.toThrow();
    const event = buildRedactedObservationEvent({ observation: null as unknown as undefined });
    expect(event.reasonCodes).toContain("missing_observation");
  });
});

// ─────────────────────────────────────────────
// Test 2: valid observation to redacted event (CEO 必須)
// ─────────────────────────────────────────────

describe("buildRedactedObservationEvent — valid observation → redacted event", () => {
  it("valid observation → fixed-shape event + valid_observation_redacted reason", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    expect(event.eventName).toBe(OBSERVATION_EVENT_NAME);
    expect(event.schemaVersion).toBe(OBSERVATION_EVENT_SCHEMA_VERSION);
    expect(event.builderVersion).toBe(OBSERVATION_EVENT_BUILDER_VERSION);
    expect(event.mode).toBe("observe");
    expect(event.activation).toBe(false);
    expect(event.shouldEmit).toBe(false);
    expect(event.reasonCodes).toContain(
      "valid_observation_redacted" satisfies RedactedEventReasonCode,
    );
    expect(event.redactionLevel).toBe("bucketed_redaction");
  });

  it("detectorVersion を pass-through", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    expect(event.detectorVersion).toBe(obs.detectorVersion);
  });

  it("patternContextFlags が boolean snapshot として出る", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    expect(event.patternContextFlags).toBeDefined();
    // contradictionDetected → needFraming true
    expect(event.patternContextFlags?.needFraming).toBe(true);
    // 全 field boolean
    for (const v of Object.values(event.patternContextFlags!)) {
      expect(typeof v).toBe("boolean");
    }
  });

  it("confidenceBuckets が bucket 化されて出る", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    expect(event.confidenceBuckets).toBeDefined();
    // contradictionDetected=true → needFraming confidence 0.8 → high_70_plus
    expect(event.confidenceBuckets?.needFraming).toBe("high_70_plus" satisfies ConfidenceBucket);
    // 全 field 4 bucket enum のいずれか
    const validBuckets: ConfidenceBucket[] = ["none_0", "low_0_to_30", "mid_30_to_70", "high_70_plus"];
    for (const bucket of Object.values(event.confidenceBuckets!)) {
      expect(validBuckets).toContain(bucket);
    }
  });

  it("signalCountBuckets が bucket 化されて出る", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    expect(event.signalCountBuckets).toBeDefined();
    const validBuckets: SignalCountBucket[] = ["none_0", "low_1_to_2", "mid_3_to_5", "high_6_plus"];
    for (const bucket of Object.values(event.signalCountBuckets!)) {
      expect(validBuckets).toContain(bucket);
    }
  });
});

// ─────────────────────────────────────────────
// Test 3: skipped observation to redacted event (CEO 必須)
// ─────────────────────────────────────────────

describe("buildRedactedObservationEvent — skipped observation → redacted event", () => {
  it("skipped (signals 不足) → skipped_observation_redacted reason + skippedReason 含む", () => {
    const obs = makeSkippedObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    expect(event.reasonCodes).toContain(
      "skipped_observation_redacted" satisfies RedactedEventReasonCode,
    );
    expect(event.skippedReason).toBe("insufficient_structured_signals");
    expect(event.mode).toBe("observe");
    expect(event.activation).toBe(false);
    expect(event.shouldEmit).toBe(false);
  });

  it("unknown fallback → skipped reason + mode=off", () => {
    const obs = makeUnknownFallbackObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    expect(event.mode).toBe("off");
    expect(event.skippedReason).toBe("mode_unknown_fallback_off");
  });
});

// ─────────────────────────────────────────────
// Test 4: activation true → false 扱い (CEO 必須、三重 gate)
// ─────────────────────────────────────────────

describe("buildRedactedObservationEvent — activation true → false 強制 (三重 gate)", () => {
  it("仮に observation.activation === true が来ても event.activation === false", () => {
    const fakeObs = {
      ...makeValidObservation(),
      activation: true as unknown as false, // 型をだまして true 注入
    };
    const event = buildRedactedObservationEvent({ observation: fakeObs as Gap4RouteObservationField });
    // **D5-a 三重 gate: 必ず false 強制** (D3 + D4 + D5-a)
    expect(event.activation).toBe(false);
    expect(event.shouldEmit).toBe(false);
    expect(event.reasonCodes).toContain(
      "activation_held_false" satisfies RedactedEventReasonCode,
    );
  });

  it("getEventEmitDecision は always false (test-only accessor)", () => {
    const event = buildRedactedObservationEvent({ observation: makeValidObservation() });
    expect(getEventEmitDecision(event)).toBe(false);
  });

  it("仮に event.shouldEmit を mutate しようとしても accessor は false", () => {
    const event = buildRedactedObservationEvent({ observation: makeValidObservation() });
    const mutatedEvent = { ...event, shouldEmit: true as unknown as false };
    expect(getEventEmitDecision(mutatedEvent as RedactedObservationEvent)).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Test 5: raw text / PII が payload に入らない (CEO 必須)
// ─────────────────────────────────────────────

describe("buildRedactedObservationEvent — raw text / PII 不入 (CEO 必須)", () => {
  it("event payload stringify に raw text / 自由テキスト を含まない", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    const json = JSON.stringify(event);
    // 全 reasonCodes は enum (lower_snake_case + alphabetic + underscore のみ)
    for (const code of event.reasonCodes) {
      expect(code).toMatch(/^[a-z0-9_]+$/);
      expect(code).not.toContain(" ");
    }
    // mode / activation / shouldEmit / redactionLevel が enum / boolean
    expect(typeof event.mode).toBe("string");
    expect(event.mode).toMatch(/^[a-z_]+$/);
    expect(typeof event.activation).toBe("boolean");
    expect(typeof event.shouldEmit).toBe("boolean");
    expect(typeof event.redactionLevel).toBe("string");
    // schemaVersion / builderVersion は semver string
    expect(event.schemaVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(event.builderVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(json).toBeDefined();
  });

  it("payload に PII forbidden field name (userId/pairId/threadId/email/url 等) を含まない", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    const eventKeys = Object.keys(event);
    for (const forbiddenField of PII_FORBIDDEN_FIELD_NAMES) {
      expect(eventKeys).not.toContain(forbiddenField);
    }
  });

  it("nested objects (patternContextFlags / confidenceBuckets / signalCountBuckets) も PII forbidden field 不含", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    const allNestedKeys = [
      ...Object.keys(event.patternContextFlags ?? {}),
      ...Object.keys(event.confidenceBuckets ?? {}),
      ...Object.keys(event.signalCountBuckets ?? {}),
    ];
    for (const forbiddenField of PII_FORBIDDEN_FIELD_NAMES) {
      expect(allNestedKeys).not.toContain(forbiddenField);
    }
  });

  it("仮に observation に rawMessage 等 PII field を紛れ込ませても、event に出ない", () => {
    const obs = {
      ...makeValidObservation(),
      rawMessage: "ユーザーの生メッセージ XYZ",
      userId: "user_abc_123",
      threadId: "thread_xyz_456",
    } as unknown as Gap4RouteObservationField;
    const event = buildRedactedObservationEvent({ observation: obs });
    const json = JSON.stringify(event);
    expect(json).not.toContain("ユーザーの生メッセージ");
    expect(json).not.toContain("user_abc_123");
    expect(json).not.toContain("thread_xyz_456");
    expect(json).not.toContain("rawMessage");
    expect(json).not.toContain("userId");
    expect(json).not.toContain("threadId");
  });
});

// ─────────────────────────────────────────────
// Test 6: unknown shape fail-closed (CEO)
// ─────────────────────────────────────────────

describe("buildRedactedObservationEvent — unknown shape fail-closed (CEO)", () => {
  it("invalid observation (object without mode) → invalid_observation_input", () => {
    const event = buildRedactedObservationEvent({
      observation: { activation: false } as unknown as Gap4RouteObservationField,
    });
    expect(event.reasonCodes).toContain(
      "invalid_observation_input" satisfies RedactedEventReasonCode,
    );
    expect(event.redactionLevel).toBe("minimal_redaction");
    expect(event.shouldEmit).toBe(false);
  });

  it("non-object input → fail-closed minimal event", () => {
    const event = buildRedactedObservationEvent({
      observation: "not_an_object" as unknown as Gap4RouteObservationField,
    });
    expect(event.reasonCodes).toContain("invalid_observation_input");
  });

  it("throw しない (production stability)", () => {
    expect(() => {
      buildRedactedObservationEvent({
        observation: 42 as unknown as Gap4RouteObservationField,
      });
    }).not.toThrow();
  });
});

// ─────────────────────────────────────────────
// Test 7: confidence bucket deterministic (CEO 必須)
// ─────────────────────────────────────────────

describe("bucketConfidence — deterministic bucketing", () => {
  it("0 → none_0", () => {
    expect(bucketConfidence(0)).toBe("none_0" satisfies ConfidenceBucket);
  });
  it("0.1 → low_0_to_30", () => {
    expect(bucketConfidence(0.1)).toBe("low_0_to_30");
  });
  it("0.29 → low_0_to_30", () => {
    expect(bucketConfidence(0.29)).toBe("low_0_to_30");
  });
  it("0.3 → mid_30_to_70 (boundary)", () => {
    expect(bucketConfidence(0.3)).toBe("mid_30_to_70");
  });
  it("0.5 → mid_30_to_70", () => {
    expect(bucketConfidence(0.5)).toBe("mid_30_to_70");
  });
  it("0.69 → mid_30_to_70", () => {
    expect(bucketConfidence(0.69)).toBe("mid_30_to_70");
  });
  it("0.7 → high_70_plus (boundary)", () => {
    expect(bucketConfidence(0.7)).toBe("high_70_plus");
  });
  it("1.0 → high_70_plus", () => {
    expect(bucketConfidence(1.0)).toBe("high_70_plus");
  });
  it("undefined → none_0", () => {
    expect(bucketConfidence(undefined)).toBe("none_0");
  });
  it("NaN → none_0 (fail-closed)", () => {
    expect(bucketConfidence(NaN)).toBe("none_0");
  });
  it("out-of-range (-0.5) → clamped to 0 → none_0", () => {
    expect(bucketConfidence(-0.5)).toBe("none_0");
  });
  it("out-of-range (1.5) → clamped to 1 → high_70_plus", () => {
    expect(bucketConfidence(1.5)).toBe("high_70_plus");
  });
});

// ─────────────────────────────────────────────
// Test 8: signal count bucket deterministic
// ─────────────────────────────────────────────

describe("bucketSignalCount — deterministic bucketing", () => {
  it("0 → none_0", () => {
    expect(bucketSignalCount(0)).toBe("none_0" satisfies SignalCountBucket);
  });
  it("1 → low_1_to_2", () => {
    expect(bucketSignalCount(1)).toBe("low_1_to_2");
  });
  it("2 → low_1_to_2", () => {
    expect(bucketSignalCount(2)).toBe("low_1_to_2");
  });
  it("3 → mid_3_to_5", () => {
    expect(bucketSignalCount(3)).toBe("mid_3_to_5");
  });
  it("5 → mid_3_to_5", () => {
    expect(bucketSignalCount(5)).toBe("mid_3_to_5");
  });
  it("6 → high_6_plus", () => {
    expect(bucketSignalCount(6)).toBe("high_6_plus");
  });
  it("100 → high_6_plus", () => {
    expect(bucketSignalCount(100)).toBe("high_6_plus");
  });
  it("undefined → none_0", () => {
    expect(bucketSignalCount(undefined)).toBe("none_0");
  });
  it("NaN → none_0", () => {
    expect(bucketSignalCount(NaN)).toBe("none_0");
  });
  it("負数 → none_0 (fail-closed)", () => {
    expect(bucketSignalCount(-5)).toBe("none_0");
  });
});

// ─────────────────────────────────────────────
// Test 9: reasonCodes fixed only (CEO 必須)
// ─────────────────────────────────────────────

describe("buildRedactedObservationEvent — reasonCodes fixed enum only", () => {
  it("reasonCodes は全 enum (lower_snake_case)", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    for (const code of event.reasonCodes) {
      expect(code).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("reasonCodes は lexicographic sort (deterministic)", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    const sorted = [...event.reasonCodes].sort((a, b) => a.localeCompare(b));
    expect(event.reasonCodes).toEqual(sorted);
  });

  it("reasonCodes に duplicate なし", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    const unique = new Set(event.reasonCodes);
    expect(unique.size).toBe(event.reasonCodes.length);
  });

  it("constraint markers 常に含む (raw_text_forbidden_by_design / pii_forbidden_by_design / no_emit_in_d5a)", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    expect(event.reasonCodes).toContain("raw_text_forbidden_by_design");
    expect(event.reasonCodes).toContain("pii_forbidden_by_design");
    expect(event.reasonCodes).toContain("no_emit_in_d5a");
    expect(event.reasonCodes).toContain("fixed_schema_applied");
    expect(event.reasonCodes).toContain("activation_held_false");
    expect(event.reasonCodes).toContain("deterministic_no_timestamp");
  });
});

// ─────────────────────────────────────────────
// Test 10: deterministic output (CEO 必須)
// ─────────────────────────────────────────────

describe("buildRedactedObservationEvent — deterministic", () => {
  it("同 input 100 回呼出で完全同一 output", () => {
    const obs = makeValidObservation();
    const baseline = JSON.stringify(buildRedactedObservationEvent({ observation: obs }));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(buildRedactedObservationEvent({ observation: obs }))).toBe(baseline);
    }
  });

  it("input を mutate しない (referential transparency)", () => {
    const obs = makeValidObservation();
    const inputBefore = JSON.stringify(obs);
    buildRedactedObservationEvent({ observation: obs });
    expect(JSON.stringify(obs)).toBe(inputBefore);
  });
});

// ─────────────────────────────────────────────
// Test 11: no storage / console / Sentry / telemetry send (CEO 必須)
// ─────────────────────────────────────────────

describe("buildRedactedObservationEvent — no side effect (CEO 必須)", () => {
  it("console.log / console.warn / console.error を呼ばない", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const obs = makeValidObservation();
    buildRedactedObservationEvent({ observation: obs });

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("storage 系 API を一切呼ばない (vitest 環境では存在しないが、構造的に依存なし)", () => {
    const obs = makeValidObservation();
    expect(() => {
      buildRedactedObservationEvent({ observation: obs });
    }).not.toThrow();
  });

  it("fetch を呼ばない (vitest 環境で global fetch を spy)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      return Promise.resolve(new Response()) as unknown as Promise<Response>;
    });

    const obs = makeValidObservation();
    buildRedactedObservationEvent({ observation: obs });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// Test 12: no runtime wiring (pure function)
// ─────────────────────────────────────────────

describe("buildRedactedObservationEvent — no runtime wiring", () => {
  it("output is JSON serializable", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    const json = JSON.stringify(event);
    const parsed = JSON.parse(json) as RedactedObservationEvent;
    expect(parsed.eventName).toBe(OBSERVATION_EVENT_NAME);
    expect(parsed.shouldEmit).toBe(false);
    expect(parsed.activation).toBe(false);
  });

  it("dynamic import 可能 (本 D5-a では call-site wiring なし)", async () => {
    const mod = await import("../../../../lib/coalter/presence/observationEvent");
    expect(typeof mod.buildRedactedObservationEvent).toBe("function");
    expect(typeof mod.bucketConfidence).toBe("function");
    expect(typeof mod.bucketSignalCount).toBe("function");
    expect(typeof mod.getEventEmitDecision).toBe("function");
  });

  it("timestamp / Date.now / Math.random 一切使わない", () => {
    const obs = makeValidObservation();
    // event に timestamp 系 field なし
    const event = buildRedactedObservationEvent({ observation: obs });
    const eventKeys = Object.keys(event);
    expect(eventKeys).not.toContain("timestamp");
    expect(eventKeys).not.toContain("createdAt");
    expect(eventKeys).not.toContain("emittedAt");
    expect(eventKeys).not.toContain("receivedAt");
  });
});

// ─────────────────────────────────────────────
// Test 13: const exports
// ─────────────────────────────────────────────

describe("Gap 4 D5-a — const exports", () => {
  it("OBSERVATION_EVENT_NAME is fixed string", () => {
    expect(OBSERVATION_EVENT_NAME).toBe("coalter.gap4.context_observation");
  });
  it("OBSERVATION_EVENT_SCHEMA_VERSION is '0.1.0'", () => {
    expect(OBSERVATION_EVENT_SCHEMA_VERSION).toBe("0.1.0");
  });
  it("OBSERVATION_EVENT_BUILDER_VERSION is '0.1.0'", () => {
    expect(OBSERVATION_EVENT_BUILDER_VERSION).toBe("0.1.0");
  });
  it("PII_FORBIDDEN_FIELD_NAMES contains expected fields", () => {
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("userId");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("pairId");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("threadId");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("email");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("url");
  });
});

// ─────────────────────────────────────────────
// Test 14: schema version + builder version (forward compat、人間超越 Idea C + L)
// ─────────────────────────────────────────────

describe("buildRedactedObservationEvent — schema / builder version", () => {
  it("event.schemaVersion / builderVersion が semver", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    expect(event.schemaVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(event.builderVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("eventName は constant typeof literal type", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    // type-level: typeof OBSERVATION_EVENT_NAME literal
    const name: typeof OBSERVATION_EVENT_NAME = event.eventName;
    expect(name).toBe("coalter.gap4.context_observation");
  });
});

// ─────────────────────────────────────────────
// Test 15: redactionLevel marker (人間超越 Idea D)
// ─────────────────────────────────────────────

describe("buildRedactedObservationEvent — redactionLevel marker", () => {
  it("valid observation with bucketing → bucketed_redaction", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    expect(event.redactionLevel).toBe("bucketed_redaction" satisfies RedactionLevel);
  });

  it("undefined observation → minimal_redaction", () => {
    const event = buildRedactedObservationEvent({ observation: undefined });
    expect(event.redactionLevel).toBe("minimal_redaction");
  });

  it("invalid observation → minimal_redaction", () => {
    const event = buildRedactedObservationEvent({
      observation: {} as unknown as Gap4RouteObservationField,
    });
    expect(event.redactionLevel).toBe("minimal_redaction");
  });
});

// ─────────────────────────────────────────────
// Test 16: getEventEmitDecision (CEO 重要、test-only accessor)
// ─────────────────────────────────────────────

describe("getEventEmitDecision — always false (D5-a phase)", () => {
  it("valid event → false", () => {
    const obs = makeValidObservation();
    const event = buildRedactedObservationEvent({ observation: obs });
    expect(getEventEmitDecision(event)).toBe(false);
  });

  it("minimal event → false", () => {
    const event = buildRedactedObservationEvent({ observation: undefined });
    expect(getEventEmitDecision(event)).toBe(false);
  });

  it("return type is literal false", () => {
    const event = buildRedactedObservationEvent({ observation: undefined });
    const result: false = getEventEmitDecision(event);
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Test 17: forward compatibility + bucketing edge cases
// ─────────────────────────────────────────────

describe("buildRedactedObservationEvent — forward compat + edge cases", () => {
  it("observation に未知 extra field があっても event に漏れない", () => {
    const obs = {
      ...makeValidObservation(),
      futureExtraField: "value_for_d6",
      anotherExtraNumber: 12345,
    } as unknown as Gap4RouteObservationField;
    const event = buildRedactedObservationEvent({ observation: obs });
    const json = JSON.stringify(event);
    expect(json).not.toContain("futureExtraField");
    expect(json).not.toContain("value_for_d6");
    expect(json).not.toContain("anotherExtraNumber");
    expect(json).not.toContain("12345");
  });

  it("partial observation (confidence 不在) → confidenceBuckets 不在", () => {
    const obs = {
      mode: "observe" as const,
      activation: false as const,
      observationVersion: "0.1.0",
      reasonCodes_top: ["mode_observe_applied" as const],
      // confidence / signalCounts / patternContext 不在
    } as Gap4RouteObservationField;
    const event = buildRedactedObservationEvent({ observation: obs });
    expect(event.confidenceBuckets).toBeUndefined();
    expect(event.signalCountBuckets).toBeUndefined();
    expect(event.patternContextFlags).toBeUndefined();
    expect(event.shouldEmit).toBe(false);
  });
});
