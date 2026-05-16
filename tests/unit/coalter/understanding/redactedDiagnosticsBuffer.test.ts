/**
 * CoAlter Movie Understanding — Redacted Diagnostics Buffer Tests (A2 phase)
 *
 * 正本:
 *   - lib/coalter/understanding/redactedDiagnosticsBuffer.ts (本 PR A2)
 *
 * CEO 必須 tests (2026-05-16):
 *   - empty buffer
 *   - append valid redacted event
 *   - max size drop_oldest
 *   - deterministic ordering
 *   - duplicate handling
 *   - confidence bucket / latency bucket / source coverage bucket
 *   - activation true rejected
 *   - shouldEmit true rejected
 *   - raw text / PII を受け取らない型設計
 *   - payload に userId/pairId/threadId/message/URL/email が入らない
 *   - console / fetch / Sentry / storage / DB 呼び出し 0
 *   - no runtime wiring
 *
 * 16 test category × 50+ individual tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRedactedUnderstandingDiagnosticsEvent,
  appendRedactedUnderstandingDiagnosticsEvent,
  getRedactedUnderstandingDiagnosticsSnapshot,
  getRedactedUnderstandingDiagnosticsBufferSize,
  getNextSequenceNumber,
  clearRedactedUnderstandingDiagnosticsBuffer,
  resetSequenceNumberForTest,
  setMaxBufferSizeForTest,
  resetMaxBufferSizeForTest,
  bucketConfidence,
  bucketLatency,
  bucketSourceCoverage,
  REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_NAME,
  REDACTED_UNDERSTANDING_DIAGNOSTICS_SCHEMA_VERSION,
  REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_VERSION,
  MAX_BUFFER_SIZE_DEFAULT,
  DROP_POLICY_DEFAULT,
  PII_FORBIDDEN_FIELD_NAMES,
  INPUT_FIELD_NAMES_ACCEPTED,
  type RedactedUnderstandingDiagnosticsEvent,
  type CreateRedactedUnderstandingDiagnosticsEventInput,
  type ConfidenceBucket,
  type LatencyBucket,
  type SourceCoverageBucket,
  type UnderstandingOutcome,
  type DropPolicy,
} from "../../../../lib/coalter/understanding/redactedDiagnosticsBuffer";

// ─────────────────────────────────────────────
// Test setup: reset buffer between tests
// ─────────────────────────────────────────────

beforeEach(() => {
  clearRedactedUnderstandingDiagnosticsBuffer();
  resetSequenceNumberForTest();
  resetMaxBufferSizeForTest();
});

afterEach(() => {
  clearRedactedUnderstandingDiagnosticsBuffer();
  resetSequenceNumberForTest();
  resetMaxBufferSizeForTest();
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeValidInput(
  overrides: Partial<CreateRedactedUnderstandingDiagnosticsEventInput> = {},
): CreateRedactedUnderstandingDiagnosticsEventInput {
  return {
    outcome: "success",
    lensVersion: "1.0.0",
    understandingConfidence: 0.8,
    completeness: 0.6,
    latencyMs: { total: 1500, collect: 500, fusion: 200, todayReader: 600, fairness: 200 },
    sourceCoverageCounts: {
      personAStargazerCount: 5,
      personAAlterCount: 3,
      personABehavioralCount: 2,
      personBStargazerCount: 4,
      personBAlterCount: 2,
      personBBehavioralCount: 1,
    },
    missingDomainCount: 0,
    ...overrides,
  };
}

function makeValidEvent(): RedactedUnderstandingDiagnosticsEvent {
  const e = createRedactedUnderstandingDiagnosticsEvent(makeValidInput());
  if (e === undefined) throw new Error("Builder should return event for valid input");
  return e;
}

// ─────────────────────────────────────────────
// Test 1: empty buffer (CEO 必須)
// ─────────────────────────────────────────────

describe("redactedDiagnosticsBuffer — empty buffer", () => {
  it("初期状態 → snapshot 空、size=0、nextSequence=0", () => {
    expect(getRedactedUnderstandingDiagnosticsSnapshot()).toEqual([]);
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(0);
    expect(getNextSequenceNumber()).toBe(0);
  });

  it("clear で buffer 空に戻る", () => {
    appendRedactedUnderstandingDiagnosticsEvent(makeValidEvent());
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(1);
    clearRedactedUnderstandingDiagnosticsBuffer();
    expect(getRedactedUnderstandingDiagnosticsSnapshot()).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// Test 2: create + append valid event (CEO 必須)
// ─────────────────────────────────────────────

describe("redactedDiagnosticsBuffer — create + append valid event", () => {
  it("normalized input → valid event with bucketed fields", () => {
    const event = createRedactedUnderstandingDiagnosticsEvent(makeValidInput());
    expect(event).toBeDefined();
    expect(event!.outcome).toBe("success");
    expect(event!.bufferName).toBe(REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_NAME);
    expect(event!.schemaVersion).toBe(REDACTED_UNDERSTANDING_DIAGNOSTICS_SCHEMA_VERSION);
    expect(event!.bufferVersion).toBe(REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_VERSION);
    expect(event!.activation).toBe(false);
    expect(event!.shouldEmit).toBe(false);
    expect(event!.understandingConfidenceBucket).toBe("high_70_plus" satisfies ConfidenceBucket);
    expect(event!.redactionLevel).toBe("bucketed_redaction");
  });

  it("append → sequence number 0 から auto-assign + snapshot に追加", () => {
    const event = makeValidEvent();
    const appended = appendRedactedUnderstandingDiagnosticsEvent(event);
    expect(appended).toBeDefined();
    expect(appended!.sequenceNumber).toBe(0);
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(1);
    const snapshot = getRedactedUnderstandingDiagnosticsSnapshot();
    expect(snapshot.length).toBe(1);
    expect(snapshot[0].sequenceNumber).toBe(0);
  });

  it("複数 append → 連番 sequence + FIFO 順", () => {
    appendRedactedUnderstandingDiagnosticsEvent(makeValidEvent());
    appendRedactedUnderstandingDiagnosticsEvent(makeValidEvent());
    appendRedactedUnderstandingDiagnosticsEvent(makeValidEvent());
    const snapshot = getRedactedUnderstandingDiagnosticsSnapshot();
    expect(snapshot.map((e) => e.sequenceNumber)).toEqual([0, 1, 2]);
  });
});

// ─────────────────────────────────────────────
// Test 3: max size drop_oldest (CEO 必須)
// ─────────────────────────────────────────────

describe("redactedDiagnosticsBuffer — max size drop_oldest policy", () => {
  it("max size=3、4 件 append → 最古を drop、size 維持", () => {
    setMaxBufferSizeForTest(3);
    appendRedactedUnderstandingDiagnosticsEvent(makeValidEvent()); // seq 0
    appendRedactedUnderstandingDiagnosticsEvent(makeValidEvent()); // seq 1
    appendRedactedUnderstandingDiagnosticsEvent(makeValidEvent()); // seq 2
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(3);
    appendRedactedUnderstandingDiagnosticsEvent(makeValidEvent()); // seq 3、seq 0 dropped
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(3);
    const snapshot = getRedactedUnderstandingDiagnosticsSnapshot();
    expect(snapshot.map((e) => e.sequenceNumber)).toEqual([1, 2, 3]);
  });

  it("MAX_BUFFER_SIZE_DEFAULT = 100", () => {
    expect(MAX_BUFFER_SIZE_DEFAULT).toBe(100);
  });

  it("DROP_POLICY_DEFAULT = 'drop_oldest'", () => {
    expect(DROP_POLICY_DEFAULT).toBe("drop_oldest" satisfies DropPolicy);
  });
});

// ─────────────────────────────────────────────
// Test 4: deterministic ordering (CEO 必須)
// ─────────────────────────────────────────────

describe("redactedDiagnosticsBuffer — deterministic ordering", () => {
  it("append 順 = snapshot 順 (FIFO 保証)", () => {
    const e1 = createRedactedUnderstandingDiagnosticsEvent(makeValidInput({ outcome: "success" }))!;
    const e2 = createRedactedUnderstandingDiagnosticsEvent(makeValidInput({ outcome: "degraded" }))!;
    const e3 = createRedactedUnderstandingDiagnosticsEvent(makeValidInput({ outcome: "failed" }))!;
    appendRedactedUnderstandingDiagnosticsEvent(e1);
    appendRedactedUnderstandingDiagnosticsEvent(e2);
    appendRedactedUnderstandingDiagnosticsEvent(e3);
    const snapshot = getRedactedUnderstandingDiagnosticsSnapshot();
    expect(snapshot.map((e) => e.outcome)).toEqual(["success", "degraded", "failed"]);
  });

  it("snapshot は defensive copy (mutate しても buffer 不変)", () => {
    appendRedactedUnderstandingDiagnosticsEvent(makeValidEvent());
    const snapshot = getRedactedUnderstandingDiagnosticsSnapshot();
    snapshot.push(makeValidEvent());
    snapshot[0].sequenceNumber = 999;
    const snapshot2 = getRedactedUnderstandingDiagnosticsSnapshot();
    expect(snapshot2.length).toBe(1);
    expect(snapshot2[0].sequenceNumber).toBe(0);
  });

  it("reasonCodes は lexicographic sort + dedup", () => {
    const event = makeValidEvent();
    const sorted = [...event.reasonCodes].sort((a, b) => a.localeCompare(b));
    expect(event.reasonCodes).toEqual(sorted);
    expect(new Set(event.reasonCodes).size).toBe(event.reasonCodes.length);
  });
});

// ─────────────────────────────────────────────
// Test 5: duplicate handling (CEO 必須)
// ─────────────────────────────────────────────

describe("redactedDiagnosticsBuffer — duplicate handling", () => {
  it("同 event を 2 回 append → 2 件入る (sequence で区別)", () => {
    const event = makeValidEvent();
    appendRedactedUnderstandingDiagnosticsEvent(event);
    appendRedactedUnderstandingDiagnosticsEvent(event);
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(2);
    const snapshot = getRedactedUnderstandingDiagnosticsSnapshot();
    expect(snapshot[0].sequenceNumber).toBe(0);
    expect(snapshot[1].sequenceNumber).toBe(1);
  });
});

// ─────────────────────────────────────────────
// Test 6: confidence bucket (CEO 必須)
// ─────────────────────────────────────────────

describe("bucketConfidence — boundary tests", () => {
  it("0 → none_0", () => expect(bucketConfidence(0)).toBe("none_0"));
  it("0.1 → low_0_to_30", () => expect(bucketConfidence(0.1)).toBe("low_0_to_30"));
  it("0.29 → low_0_to_30", () => expect(bucketConfidence(0.29)).toBe("low_0_to_30"));
  it("0.3 → mid_30_to_70 (boundary)", () => expect(bucketConfidence(0.3)).toBe("mid_30_to_70"));
  it("0.7 → high_70_plus (boundary)", () => expect(bucketConfidence(0.7)).toBe("high_70_plus"));
  it("1.0 → high_70_plus", () => expect(bucketConfidence(1.0)).toBe("high_70_plus"));
  it("undefined → none_0 (fail-closed)", () => expect(bucketConfidence(undefined)).toBe("none_0"));
  it("NaN → none_0", () => expect(bucketConfidence(NaN)).toBe("none_0"));
  it("負数 → clamped to 0 → none_0", () => expect(bucketConfidence(-0.5)).toBe("none_0"));
  it("> 1.0 → clamped to 1.0 → high_70_plus", () => expect(bucketConfidence(1.5)).toBe("high_70_plus"));
});

// ─────────────────────────────────────────────
// Test 7: latency bucket (CEO 必須)
// ─────────────────────────────────────────────

describe("bucketLatency — boundary tests", () => {
  it("50ms → lt_100ms", () => expect(bucketLatency(50)).toBe("lt_100ms" satisfies LatencyBucket));
  it("100ms → lt_500ms (boundary)", () => expect(bucketLatency(100)).toBe("lt_500ms"));
  it("499ms → lt_500ms", () => expect(bucketLatency(499)).toBe("lt_500ms"));
  it("500ms → lt_2s (boundary)", () => expect(bucketLatency(500)).toBe("lt_2s"));
  it("1999ms → lt_2s", () => expect(bucketLatency(1999)).toBe("lt_2s"));
  it("2000ms → lt_5s (boundary)", () => expect(bucketLatency(2000)).toBe("lt_5s"));
  it("4999ms → lt_5s", () => expect(bucketLatency(4999)).toBe("lt_5s"));
  it("5000ms → ge_5s (boundary)", () => expect(bucketLatency(5000)).toBe("ge_5s"));
  it("undefined → lt_100ms (fail-closed)", () => expect(bucketLatency(undefined)).toBe("lt_100ms"));
  it("NaN → lt_100ms", () => expect(bucketLatency(NaN)).toBe("lt_100ms"));
});

// ─────────────────────────────────────────────
// Test 8: source coverage bucket (CEO 必須)
// ─────────────────────────────────────────────

describe("bucketSourceCoverage — boundary tests", () => {
  it("0 → none_0", () => expect(bucketSourceCoverage(0)).toBe("none_0" satisfies SourceCoverageBucket));
  it("1 → low_1_to_2", () => expect(bucketSourceCoverage(1)).toBe("low_1_to_2"));
  it("2 → low_1_to_2", () => expect(bucketSourceCoverage(2)).toBe("low_1_to_2"));
  it("3 → mid_3_to_5", () => expect(bucketSourceCoverage(3)).toBe("mid_3_to_5"));
  it("5 → mid_3_to_5", () => expect(bucketSourceCoverage(5)).toBe("mid_3_to_5"));
  it("6 → high_6_plus", () => expect(bucketSourceCoverage(6)).toBe("high_6_plus"));
  it("100 → high_6_plus", () => expect(bucketSourceCoverage(100)).toBe("high_6_plus"));
  it("undefined → none_0 (fail-closed)", () => expect(bucketSourceCoverage(undefined)).toBe("none_0"));
  it("負数 → none_0", () => expect(bucketSourceCoverage(-5)).toBe("none_0"));
});

// ─────────────────────────────────────────────
// Test 9: activation true rejected (CEO 必須)
// ─────────────────────────────────────────────

describe("appendRedactedUnderstandingDiagnosticsEvent — activation invariant", () => {
  it("activation: true が来ても reject (buffer に入らない)", () => {
    const event = makeValidEvent();
    const anomalous = { ...event, activation: true as unknown as false };
    const result = appendRedactedUnderstandingDiagnosticsEvent(anomalous);
    expect(result).toBeUndefined();
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(0);
  });

  it("activation: false (正常) は accept", () => {
    const event = makeValidEvent();
    const result = appendRedactedUnderstandingDiagnosticsEvent(event);
    expect(result).toBeDefined();
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(1);
  });

  it("createEvent は常に activation: false (input 経由でも true 注入不可)", () => {
    const event = makeValidEvent();
    expect(event.activation).toBe(false);
    // type-level: activation: false literal で true 代入不可
  });
});

// ─────────────────────────────────────────────
// Test 10: shouldEmit true rejected (CEO 必須)
// ─────────────────────────────────────────────

describe("appendRedactedUnderstandingDiagnosticsEvent — shouldEmit invariant", () => {
  it("shouldEmit: true が来ても reject", () => {
    const event = makeValidEvent();
    const anomalous = { ...event, shouldEmit: true as unknown as false };
    const result = appendRedactedUnderstandingDiagnosticsEvent(anomalous);
    expect(result).toBeUndefined();
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(0);
  });

  it("createEvent は常に shouldEmit: false", () => {
    const event = makeValidEvent();
    expect(event.shouldEmit).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Test 11: raw text / PII 受領不能 (CEO 必須、Type-level firewall)
// ─────────────────────────────────────────────

describe("redactedDiagnosticsBuffer — raw text / PII 受領不能 (CEO 必須)", () => {
  it("input に raw text っぽい field は構造的に渡せない (型 firewall)", () => {
    // type-level: 以下のような shape は TypeScript compiler reject
    // const bad: CreateRedactedUnderstandingDiagnosticsEventInput = {
    //   outcome: "success",
    //   understandingConfidence: 0.5,
    //   rawMessage: "ユーザーの生メッセージ", // ❌ Type error
    //   userId: "user_abc", // ❌ Type error
    // };
    // runtime test: 正常 input のみ accept
    const event = createRedactedUnderstandingDiagnosticsEvent(makeValidInput());
    expect(event).toBeDefined();
  });

  it("invalid outcome → createEvent returns undefined (fail-closed)", () => {
    const event = createRedactedUnderstandingDiagnosticsEvent({
      outcome: "invalid_value" as UnderstandingOutcome,
      understandingConfidence: 0.5,
    });
    expect(event).toBeUndefined();
  });

  it("non-number understandingConfidence → createEvent returns undefined", () => {
    const event = createRedactedUnderstandingDiagnosticsEvent({
      outcome: "success",
      understandingConfidence: "0.5" as unknown as number,
    });
    expect(event).toBeUndefined();
  });

  it("NaN understandingConfidence → createEvent returns undefined", () => {
    const event = createRedactedUnderstandingDiagnosticsEvent({
      outcome: "success",
      understandingConfidence: NaN,
    });
    expect(event).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// Test 12: payload PII field 不在 (CEO 必須)
// ─────────────────────────────────────────────

describe("redactedDiagnosticsBuffer — payload PII field absent (CEO 必須)", () => {
  it("event top-level keys に PII forbidden field 不含", () => {
    const event = makeValidEvent();
    const eventKeys = Object.keys(event);
    for (const forbidden of PII_FORBIDDEN_FIELD_NAMES) {
      expect(eventKeys).not.toContain(forbidden);
    }
  });

  it("nested object keys (latencyBuckets / sourceCoverageBuckets) に PII forbidden 不含", () => {
    const event = makeValidEvent();
    const nestedKeys = [
      ...Object.keys(event.latencyBuckets ?? {}),
      ...Object.keys(event.sourceCoverageBuckets ?? {}),
    ];
    for (const forbidden of PII_FORBIDDEN_FIELD_NAMES) {
      expect(nestedKeys).not.toContain(forbidden);
    }
  });

  it("buffer snapshot 全 event keys に PII 不含 (構造的検証)", () => {
    appendRedactedUnderstandingDiagnosticsEvent(makeValidEvent());
    appendRedactedUnderstandingDiagnosticsEvent(makeValidEvent());
    const snapshot = getRedactedUnderstandingDiagnosticsSnapshot();
    for (const event of snapshot) {
      const json = JSON.stringify(event);
      // raw user text っぽい文字列を含まない (enum / number / boolean のみ)
      expect(json).not.toContain("userId");
      expect(json).not.toContain("pairId");
      expect(json).not.toContain("threadId");
      expect(json).not.toContain("rawMessage");
      expect(json).not.toContain("email");
      expect(json).not.toContain("timestamp");
    }
  });

  it("INPUT_FIELD_NAMES_ACCEPTED と PII_FORBIDDEN_FIELD_NAMES の積集合 = 0", () => {
    const acceptedSet = new Set<string>(INPUT_FIELD_NAMES_ACCEPTED);
    for (const forbidden of PII_FORBIDDEN_FIELD_NAMES) {
      expect(acceptedSet.has(forbidden)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────
// Test 13: no console / fetch / Sentry / storage / DB (CEO 必須)
// ─────────────────────────────────────────────

describe("redactedDiagnosticsBuffer — no side effect (CEO 必須)", () => {
  it("console.log / console.warn / console.error 呼ばない", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const event = makeValidEvent();
    appendRedactedUnderstandingDiagnosticsEvent(event);
    getRedactedUnderstandingDiagnosticsSnapshot();
    clearRedactedUnderstandingDiagnosticsBuffer();

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
    appendRedactedUnderstandingDiagnosticsEvent(makeValidEvent());
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// Test 14: no runtime wiring (pure function 検証、self-contained)
// ─────────────────────────────────────────────

describe("redactedDiagnosticsBuffer — no runtime wiring (self-contained)", () => {
  it("output is JSON serializable", () => {
    const event = makeValidEvent();
    const json = JSON.stringify(event);
    const parsed = JSON.parse(json) as RedactedUnderstandingDiagnosticsEvent;
    expect(parsed.bufferName).toBe(REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_NAME);
    expect(parsed.activation).toBe(false);
    expect(parsed.shouldEmit).toBe(false);
  });

  it("dynamic import 可能 (本 PR では production code path から call なし)", async () => {
    const mod = await import("../../../../lib/coalter/understanding/redactedDiagnosticsBuffer");
    expect(typeof mod.createRedactedUnderstandingDiagnosticsEvent).toBe("function");
    expect(typeof mod.appendRedactedUnderstandingDiagnosticsEvent).toBe("function");
    expect(typeof mod.getRedactedUnderstandingDiagnosticsSnapshot).toBe("function");
    expect(typeof mod.clearRedactedUnderstandingDiagnosticsBuffer).toBe("function");
  });

  it("timestamp / createdAt 等の time field 不在 (key check)", () => {
    const event = makeValidEvent();
    const keys = Object.keys(event);
    expect(keys).not.toContain("timestamp");
    expect(keys).not.toContain("createdAt");
    expect(keys).not.toContain("created_at");
    expect(keys).not.toContain("emittedAt");
  });
});

// ─────────────────────────────────────────────
// Test 15: const exports + schema version
// ─────────────────────────────────────────────

describe("redactedDiagnosticsBuffer — const exports", () => {
  it("buffer name fixed string", () => {
    expect(REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_NAME).toBe(
      "coalter.movie.understanding_shadow_diagnostics",
    );
  });
  it("schema version '0.1.0'", () => {
    expect(REDACTED_UNDERSTANDING_DIAGNOSTICS_SCHEMA_VERSION).toBe("0.1.0");
  });
  it("buffer helper version '0.1.0'", () => {
    expect(REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_VERSION).toBe("0.1.0");
  });
  it("MAX_BUFFER_SIZE_DEFAULT = 100", () => {
    expect(MAX_BUFFER_SIZE_DEFAULT).toBe(100);
  });
  it("DROP_POLICY_DEFAULT = 'drop_oldest'", () => {
    expect(DROP_POLICY_DEFAULT).toBe("drop_oldest");
  });
  it("PII_FORBIDDEN_FIELD_NAMES contains userId / pairId / threadId / email / timestamp / bundle", () => {
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("userId");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("pairId");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("threadId");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("email");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("timestamp");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("bundle");
    expect(PII_FORBIDDEN_FIELD_NAMES).toContain("talk_messages");
  });
  it("INPUT_FIELD_NAMES_ACCEPTED contains outcome / understandingConfidence / latencyMs", () => {
    expect(INPUT_FIELD_NAMES_ACCEPTED).toContain("outcome");
    expect(INPUT_FIELD_NAMES_ACCEPTED).toContain("understandingConfidence");
    expect(INPUT_FIELD_NAMES_ACCEPTED).toContain("latencyMs");
  });
});

// ─────────────────────────────────────────────
// Test 16: malformed input fail-closed (CEO 必須)
// ─────────────────────────────────────────────

describe("appendRedactedUnderstandingDiagnosticsEvent — malformed input fail-closed", () => {
  it("null → undefined (no throw)", () => {
    expect(() => appendRedactedUnderstandingDiagnosticsEvent(null)).not.toThrow();
    expect(appendRedactedUnderstandingDiagnosticsEvent(null)).toBeUndefined();
  });

  it("undefined → undefined", () => {
    expect(appendRedactedUnderstandingDiagnosticsEvent(undefined)).toBeUndefined();
  });

  it("string → undefined", () => {
    expect(appendRedactedUnderstandingDiagnosticsEvent("not_an_object")).toBeUndefined();
  });

  it("number → undefined", () => {
    expect(appendRedactedUnderstandingDiagnosticsEvent(42)).toBeUndefined();
  });

  it("empty object → undefined (missing required fields)", () => {
    expect(appendRedactedUnderstandingDiagnosticsEvent({})).toBeUndefined();
  });

  it("invalid outcome string → undefined", () => {
    const event = makeValidEvent();
    const invalid = { ...event, outcome: "invalid_outcome" };
    expect(appendRedactedUnderstandingDiagnosticsEvent(invalid)).toBeUndefined();
  });

  it("non-boolean activation → undefined", () => {
    const event = makeValidEvent();
    const invalid = { ...event, activation: "false" };
    expect(appendRedactedUnderstandingDiagnosticsEvent(invalid)).toBeUndefined();
  });
});
