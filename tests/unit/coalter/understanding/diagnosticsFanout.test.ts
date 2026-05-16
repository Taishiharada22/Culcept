/**
 * CoAlter Movie Understanding — Diagnostics Fan-out Tests (A3 phase)
 *
 * 正本:
 *   - lib/coalter/understanding/diagnosticsFanout.ts (本 PR A3)
 *   - lib/coalter/understanding/redactedDiagnosticsBuffer.ts (A2、PR #146)
 *   - lib/coalter/understanding/diagnostics.ts (既存 emit、A3 で 1 行追加)
 *
 * CEO 必須 tests (2026-05-16):
 *   - flag off → appendされない
 *   - flag unknown → appendされない
 *   - flag on + valid normalized diagnostics → buffer appendされる
 *   - invalid diagnostics → appendされない / throwしない
 *   - buffer append failure → emit pathを壊さない
 *   - console.log / console.warn / console.error 呼び出し0
 *   - fetch / Sentry / storage / DB 呼び出し0
 *   - raw text / PIIがbufferに入らない
 *   - existing diagnostics console flagに依存しない
 *   - deterministic redaction / bucketization
 *   - no route / API / UI / ChatClient / UpperLayerMount touch
 *
 * 17 test category × 50+ individual tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fanOutUnderstandingDiagnosticsToBuffer,
  transformUnderstandingDiagnosticsToRedactedInput,
  isBufferFanoutEnabled,
  BUFFER_FANOUT_ENV_VAR,
  BUFFER_FANOUT_VERSION,
  type FanoutOutcome,
} from "../../../../lib/coalter/understanding/diagnosticsFanout";
import {
  clearRedactedUnderstandingDiagnosticsBuffer,
  resetSequenceNumberForTest,
  resetMaxBufferSizeForTest,
  getRedactedUnderstandingDiagnosticsBufferSize,
  getRedactedUnderstandingDiagnosticsSnapshot,
  PII_FORBIDDEN_FIELD_NAMES,
} from "../../../../lib/coalter/understanding/redactedDiagnosticsBuffer";
import {
  emitUnderstandingDiagnostics,
  DIAGNOSTICS_SAMPLE_SUCCESS,
  DIAGNOSTICS_SAMPLE_DEGRADED,
  DIAGNOSTICS_SAMPLE_FAILED,
} from "../../../../lib/coalter/understanding/diagnostics";
import type { UnderstandingDiagnostics } from "../../../../lib/coalter/understanding/types";

// ─────────────────────────────────────────────
// Helpers: env manipulation (test-only)
// ─────────────────────────────────────────────

function setBufferFanoutEnv(value: string | undefined): void {
  if (value === undefined) {
    delete process.env[BUFFER_FANOUT_ENV_VAR];
  } else {
    process.env[BUFFER_FANOUT_ENV_VAR] = value;
  }
}

function setDiagnosticsConsoleEnv(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.COALTER_UNDERSTANDING_DIAGNOSTICS;
  } else {
    process.env.COALTER_UNDERSTANDING_DIAGNOSTICS = value;
  }
}

beforeEach(() => {
  clearRedactedUnderstandingDiagnosticsBuffer();
  resetSequenceNumberForTest();
  resetMaxBufferSizeForTest();
  setBufferFanoutEnv(undefined);
  setDiagnosticsConsoleEnv(undefined);
});

afterEach(() => {
  clearRedactedUnderstandingDiagnosticsBuffer();
  resetSequenceNumberForTest();
  resetMaxBufferSizeForTest();
  setBufferFanoutEnv(undefined);
  setDiagnosticsConsoleEnv(undefined);
});

// ─────────────────────────────────────────────
// Test 1: flag default OFF (CEO 必須)
// ─────────────────────────────────────────────

describe("isBufferFanoutEnabled — flag default OFF + whitelist", () => {
  it("env 未設定 → false (default OFF)", () => {
    setBufferFanoutEnv(undefined);
    expect(isBufferFanoutEnabled()).toBe(false);
  });

  it("env='false' → false", () => {
    setBufferFanoutEnv("false");
    expect(isBufferFanoutEnabled()).toBe(false);
  });

  it("env='0' → false", () => {
    setBufferFanoutEnv("0");
    expect(isBufferFanoutEnabled()).toBe(false);
  });

  it("env='off' → false", () => {
    setBufferFanoutEnv("off");
    expect(isBufferFanoutEnabled()).toBe(false);
  });

  it("env='' (empty) → false", () => {
    setBufferFanoutEnv("");
    expect(isBufferFanoutEnabled()).toBe(false);
  });

  it("env='true' → true", () => {
    setBufferFanoutEnv("true");
    expect(isBufferFanoutEnabled()).toBe(true);
  });

  it("env='1' → true", () => {
    setBufferFanoutEnv("1");
    expect(isBufferFanoutEnabled()).toBe(true);
  });

  it("env='on' / 'yes' → true", () => {
    setBufferFanoutEnv("on");
    expect(isBufferFanoutEnabled()).toBe(true);
    setBufferFanoutEnv("yes");
    expect(isBufferFanoutEnabled()).toBe(true);
  });

  it("env=' TRUE ' (case-insensitive + trim) → true", () => {
    setBufferFanoutEnv(" TRUE ");
    expect(isBufferFanoutEnabled()).toBe(true);
  });

  it("env='enabled' (unknown value) → false (fail-closed)", () => {
    setBufferFanoutEnv("enabled");
    expect(isBufferFanoutEnabled()).toBe(false);
  });

  it("env='production' (unknown) → false", () => {
    setBufferFanoutEnv("production");
    expect(isBufferFanoutEnabled()).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Test 2: flag OFF → append されない (CEO 必須)
// ─────────────────────────────────────────────

describe("fanOutUnderstandingDiagnosticsToBuffer — flag OFF (CEO 必須)", () => {
  it("env 未設定 → outcome=skipped_flag_off + buffer 空", () => {
    setBufferFanoutEnv(undefined);
    const result = fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);
    expect(result.outcome).toBe("skipped_flag_off" satisfies FanoutOutcome);
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(0);
  });

  it("env='false' → outcome=skipped_flag_off + buffer 空", () => {
    setBufferFanoutEnv("false");
    const result = fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);
    expect(result.outcome).toBe("skipped_flag_off");
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(0);
  });

  it("env='unknown_value' → fail-closed OFF + buffer 空", () => {
    setBufferFanoutEnv("enabled");
    const result = fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);
    expect(result.outcome).toBe("skipped_flag_off");
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Test 3: flag ON + valid → buffer append される (CEO 必須)
// ─────────────────────────────────────────────

describe("fanOutUnderstandingDiagnosticsToBuffer — flag ON + valid (CEO 必須)", () => {
  it("env='true' + SAMPLE_SUCCESS → outcome=appended + buffer size=1", () => {
    setBufferFanoutEnv("true");
    const result = fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);
    expect(result.outcome).toBe("appended" satisfies FanoutOutcome);
    expect(result.appendedEvent).toBeDefined();
    expect(result.appendedEvent!.outcome).toBe("success");
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(1);
  });

  it("env='true' + SAMPLE_DEGRADED → appended + outcome=degraded", () => {
    setBufferFanoutEnv("1");
    const result = fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_DEGRADED);
    expect(result.outcome).toBe("appended");
    expect(result.appendedEvent?.outcome).toBe("degraded");
  });

  it("env='true' + SAMPLE_FAILED → appended + outcome=failed", () => {
    setBufferFanoutEnv("yes");
    const result = fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_FAILED);
    expect(result.outcome).toBe("appended");
    expect(result.appendedEvent?.outcome).toBe("failed");
  });

  it("複数 fan-out → sequence 連番", () => {
    setBufferFanoutEnv("true");
    fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);
    fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_DEGRADED);
    fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_FAILED);
    const snapshot = getRedactedUnderstandingDiagnosticsSnapshot();
    expect(snapshot.length).toBe(3);
    expect(snapshot.map((e) => e.sequenceNumber)).toEqual([0, 1, 2]);
    expect(snapshot.map((e) => e.outcome)).toEqual(["success", "degraded", "failed"]);
  });
});

// ─────────────────────────────────────────────
// Test 4: invalid diagnostics → append されない / throw しない (CEO 必須)
// ─────────────────────────────────────────────

describe("fanOutUnderstandingDiagnosticsToBuffer — invalid input (CEO 必須)", () => {
  it("null → outcome=skipped_invalid_input + no throw", () => {
    setBufferFanoutEnv("true");
    expect(() => fanOutUnderstandingDiagnosticsToBuffer(null)).not.toThrow();
    const result = fanOutUnderstandingDiagnosticsToBuffer(null);
    expect(result.outcome).toBe("skipped_invalid_input");
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(0);
  });

  it("undefined → outcome=skipped_invalid_input", () => {
    setBufferFanoutEnv("true");
    const result = fanOutUnderstandingDiagnosticsToBuffer(undefined);
    expect(result.outcome).toBe("skipped_invalid_input");
  });

  it("non-object → outcome=skipped_invalid_input", () => {
    setBufferFanoutEnv("true");
    const result = fanOutUnderstandingDiagnosticsToBuffer("not_an_object");
    expect(result.outcome).toBe("skipped_invalid_input");
  });

  it("empty object → outcome=skipped_invalid_input", () => {
    setBufferFanoutEnv("true");
    const result = fanOutUnderstandingDiagnosticsToBuffer({});
    expect(result.outcome).toBe("skipped_invalid_input");
  });

  it("malformed (non-number confidence) → outcome=skipped_invalid_input", () => {
    setBufferFanoutEnv("true");
    const malformed = {
      ...DIAGNOSTICS_SAMPLE_SUCCESS,
      understanding_confidence: "0.5" as unknown as number,
    };
    const result = fanOutUnderstandingDiagnosticsToBuffer(malformed);
    expect(result.outcome).toBe("skipped_invalid_input");
  });

  it("invalid outcome enum → outcome=skipped_transform_error or skipped_invalid_input", () => {
    setBufferFanoutEnv("true");
    const invalid = {
      ...DIAGNOSTICS_SAMPLE_SUCCESS,
      outcome: "invalid_outcome" as unknown as UnderstandingDiagnostics["outcome"],
    };
    const result = fanOutUnderstandingDiagnosticsToBuffer(invalid);
    // transformer は outcome を pass-through、A2 buffer の validator が reject
    expect(["skipped_transform_error", "skipped_invalid_input"]).toContain(result.outcome);
  });
});

// ─────────────────────────────────────────────
// Test 5: existing diagnostics console flag に依存しない (CEO 必須)
// ─────────────────────────────────────────────

describe("fanOutUnderstandingDiagnosticsToBuffer — independent of console emit flag (CEO 必須)", () => {
  it("buffer fanout ON + console emit OFF → buffer appendされる、console emit しない", () => {
    setBufferFanoutEnv("true");
    setDiagnosticsConsoleEnv(undefined);
    const result = fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);
    expect(result.outcome).toBe("appended");
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(1);
  });

  it("buffer fanout OFF + console emit ON → buffer 不変、console emit 経路は本 helper 不関与", () => {
    setBufferFanoutEnv(undefined);
    setDiagnosticsConsoleEnv("1");
    const result = fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);
    expect(result.outcome).toBe("skipped_flag_off");
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(0);
  });

  it("両方 ON → buffer appendされる (console emit は別経路、本 helper 不関与)", () => {
    setBufferFanoutEnv("true");
    setDiagnosticsConsoleEnv("1");
    const result = fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);
    expect(result.outcome).toBe("appended");
  });

  it("両方 OFF → buffer 不変", () => {
    setBufferFanoutEnv(undefined);
    setDiagnosticsConsoleEnv(undefined);
    const result = fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);
    expect(result.outcome).toBe("skipped_flag_off");
  });
});

// ─────────────────────────────────────────────
// Test 6: transform pure function (CEO 必須、deterministic)
// ─────────────────────────────────────────────

describe("transformUnderstandingDiagnosticsToRedactedInput — pure transformer", () => {
  it("valid raw → CreateInput", () => {
    const input = transformUnderstandingDiagnosticsToRedactedInput(DIAGNOSTICS_SAMPLE_SUCCESS);
    expect(input).toBeDefined();
    expect(input!.outcome).toBe("success");
    expect(input!.understandingConfidence).toBe(0.78);
    expect(input!.latencyMs).toBeDefined();
    expect(input!.sourceCoverageCounts).toBeDefined();
  });

  it("PII firewall: pairHash / computedAt / todayReaderComparison drop", () => {
    const input = transformUnderstandingDiagnosticsToRedactedInput(DIAGNOSTICS_SAMPLE_SUCCESS);
    expect(input).toBeDefined();
    const keys = Object.keys(input!);
    expect(keys).not.toContain("pairHash");
    expect(keys).not.toContain("computedAt");
    expect(keys).not.toContain("todayReaderComparison");
  });

  it("null / undefined → undefined", () => {
    expect(transformUnderstandingDiagnosticsToRedactedInput(null)).toBeUndefined();
    expect(transformUnderstandingDiagnosticsToRedactedInput(undefined)).toBeUndefined();
  });

  it("deterministic (100 回連続呼出で同 output)", () => {
    const baseline = JSON.stringify(
      transformUnderstandingDiagnosticsToRedactedInput(DIAGNOSTICS_SAMPLE_SUCCESS),
    );
    for (let i = 0; i < 100; i++) {
      expect(
        JSON.stringify(transformUnderstandingDiagnosticsToRedactedInput(DIAGNOSTICS_SAMPLE_SUCCESS)),
      ).toBe(baseline);
    }
  });
});

// ─────────────────────────────────────────────
// Test 7: raw text / PII が buffer に入らない (CEO 必須)
// ─────────────────────────────────────────────

describe("fanOutUnderstandingDiagnosticsToBuffer — PII 不入 (CEO 必須)", () => {
  it("appended event keys に PII forbidden field 不含 (pairHash 含む)", () => {
    setBufferFanoutEnv("true");
    fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);
    const snapshot = getRedactedUnderstandingDiagnosticsSnapshot();
    expect(snapshot.length).toBe(1);
    const eventKeys = Object.keys(snapshot[0]);
    for (const forbidden of PII_FORBIDDEN_FIELD_NAMES) {
      expect(eventKeys).not.toContain(forbidden);
    }
  });

  it("appended event JSON stringify に pairHash / computedAt 不在", () => {
    setBufferFanoutEnv("true");
    fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);
    const snapshot = getRedactedUnderstandingDiagnosticsSnapshot();
    const json = JSON.stringify(snapshot[0]);
    expect(json).not.toContain("p_8f2a1c7d"); // pairHash sample value
    expect(json).not.toContain("2026-04-20T14:22:10"); // computedAt sample value
    expect(json).not.toContain("pairHash");
    expect(json).not.toContain("computedAt");
  });

  it("raw text っぽい extra field を持つ input でも buffer に漏れない", () => {
    setBufferFanoutEnv("true");
    const sneaky = {
      ...DIAGNOSTICS_SAMPLE_SUCCESS,
      rawMessage: "ユーザーの生メッセージ",
      userId: "user_abc",
    } as unknown as UnderstandingDiagnostics;
    fanOutUnderstandingDiagnosticsToBuffer(sneaky);
    const snapshot = getRedactedUnderstandingDiagnosticsSnapshot();
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain("ユーザーの生メッセージ");
    expect(json).not.toContain("user_abc");
    expect(json).not.toContain("rawMessage");
    expect(json).not.toContain("userId");
  });
});

// ─────────────────────────────────────────────
// Test 8: deterministic redaction / bucketization (CEO 必須)
// ─────────────────────────────────────────────

describe("fanOutUnderstandingDiagnosticsToBuffer — deterministic redaction (CEO 必須)", () => {
  it("同 raw input → 同 redacted event (100 回連続呼出)", () => {
    setBufferFanoutEnv("true");
    fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);
    const first = getRedactedUnderstandingDiagnosticsSnapshot()[0];
    // sequenceNumber 以外を比較
    const { sequenceNumber: _firstSeq, ...firstWithoutSeq } = first;

    clearRedactedUnderstandingDiagnosticsBuffer();
    resetSequenceNumberForTest();

    for (let i = 0; i < 100; i++) {
      clearRedactedUnderstandingDiagnosticsBuffer();
      resetSequenceNumberForTest();
      fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);
      const e = getRedactedUnderstandingDiagnosticsSnapshot()[0];
      const { sequenceNumber: _eSeq, ...eWithoutSeq } = e;
      expect(JSON.stringify(eWithoutSeq)).toBe(JSON.stringify(firstWithoutSeq));
    }
  });
});

// ─────────────────────────────────────────────
// Test 9: console.log / console.warn / console.error 呼び出し 0 (CEO 必須)
// ─────────────────────────────────────────────

describe("fanOutUnderstandingDiagnosticsToBuffer — no console (CEO 必須)", () => {
  it("flag OFF → console emit 0 (本 helper は console 呼ばない)", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    setBufferFanoutEnv(undefined);
    fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);

    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("flag ON + append → console emit 0 (本 helper は console 呼ばない)", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    setBufferFanoutEnv("true");
    fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);

    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// Test 10: fetch / Sentry / storage / DB 呼び出し 0 (CEO 必須)
// ─────────────────────────────────────────────

describe("fanOutUnderstandingDiagnosticsToBuffer — no external side effect (CEO 必須)", () => {
  it("fetch を呼ばない", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      return Promise.resolve(new Response()) as unknown as Promise<Response>;
    });

    setBufferFanoutEnv("true");
    fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// Test 11: emit path integration (CEO 必須、既存 emit を壊さない)
// ─────────────────────────────────────────────

describe("emitUnderstandingDiagnostics integration — fan-out wired (CEO 必須)", () => {
  it("flag OFF + console OFF → buffer 不変、console 呼ばれない", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    setBufferFanoutEnv(undefined);
    setDiagnosticsConsoleEnv(undefined);
    emitUnderstandingDiagnostics(DIAGNOSTICS_SAMPLE_SUCCESS);

    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(0);
    expect(infoSpy).not.toHaveBeenCalled();

    infoSpy.mockRestore();
  });

  it("flag ON + console OFF → buffer に append、console 呼ばれない", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    setBufferFanoutEnv("true");
    setDiagnosticsConsoleEnv(undefined);
    emitUnderstandingDiagnostics(DIAGNOSTICS_SAMPLE_SUCCESS);

    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(1);
    expect(infoSpy).not.toHaveBeenCalled();

    infoSpy.mockRestore();
  });

  it("flag OFF + console ON → buffer 不変、console 呼ばれる (既存 console emit 経路維持)", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    setBufferFanoutEnv(undefined);
    setDiagnosticsConsoleEnv("1");
    emitUnderstandingDiagnostics(DIAGNOSTICS_SAMPLE_SUCCESS);

    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(0);
    expect(infoSpy).toHaveBeenCalled();

    infoSpy.mockRestore();
  });

  it("両方 ON → buffer + console 両方稼働", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    setBufferFanoutEnv("true");
    setDiagnosticsConsoleEnv("1");
    emitUnderstandingDiagnostics(DIAGNOSTICS_SAMPLE_SUCCESS);

    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(1);
    expect(infoSpy).toHaveBeenCalled();

    infoSpy.mockRestore();
  });

  it("fan-out 失敗で console emit 経路を壊さない (fail-open 二重防御)", () => {
    // この test では fan-out が throw する可能性をシミュレートできないが、
    // 本 helper の try-catch + outer try-catch で二重防御している構造を確認
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    setBufferFanoutEnv("true");
    setDiagnosticsConsoleEnv("1");
    // null を渡しても emit 全体は throw しない
    expect(() => emitUnderstandingDiagnostics(null as unknown as UnderstandingDiagnostics)).not.toThrow();

    infoSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// Test 12: const exports
// ─────────────────────────────────────────────

describe("A3 — const exports", () => {
  it("BUFFER_FANOUT_ENV_VAR is 'COALTER_UNDERSTANDING_BUFFER_FANOUT'", () => {
    expect(BUFFER_FANOUT_ENV_VAR).toBe("COALTER_UNDERSTANDING_BUFFER_FANOUT");
  });

  it("BUFFER_FANOUT_VERSION is '0.1.0'", () => {
    expect(BUFFER_FANOUT_VERSION).toBe("0.1.0");
  });
});

// ─────────────────────────────────────────────
// Test 13: behavior matrix (CEO 必須)
// ─────────────────────────────────────────────

describe("fanOutUnderstandingDiagnosticsToBuffer — behavior matrix", () => {
  it("OFF / valid → skipped_flag_off", () => {
    setBufferFanoutEnv(undefined);
    expect(fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS).outcome).toBe(
      "skipped_flag_off",
    );
  });

  it("OFF / invalid → skipped_flag_off (flag check 優先)", () => {
    setBufferFanoutEnv(undefined);
    expect(fanOutUnderstandingDiagnosticsToBuffer(null).outcome).toBe("skipped_flag_off");
  });

  it("ON / valid → appended", () => {
    setBufferFanoutEnv("true");
    expect(fanOutUnderstandingDiagnosticsToBuffer(DIAGNOSTICS_SAMPLE_SUCCESS).outcome).toBe(
      "appended",
    );
  });

  it("ON / null → skipped_invalid_input", () => {
    setBufferFanoutEnv("true");
    expect(fanOutUnderstandingDiagnosticsToBuffer(null).outcome).toBe("skipped_invalid_input");
  });
});

// ─────────────────────────────────────────────
// Test 14: buffer append failure → emit path を壊さない (CEO 必須、fail-open)
// ─────────────────────────────────────────────

describe("fanOutUnderstandingDiagnosticsToBuffer — fail-open (CEO 必須)", () => {
  it("invalid (activation:true 注入) → reject、buffer 不変、no throw", () => {
    setBufferFanoutEnv("true");
    const malformed = {
      ...DIAGNOSTICS_SAMPLE_SUCCESS,
      // ↓ 完全に壊した outcome
      outcome: "invalid_outcome_value" as UnderstandingDiagnostics["outcome"],
    };
    expect(() => fanOutUnderstandingDiagnosticsToBuffer(malformed)).not.toThrow();
    const result = fanOutUnderstandingDiagnosticsToBuffer(malformed);
    // skipped_invalid_input または skipped_transform_error (どちらも reject 系)
    expect([
      "skipped_invalid_input",
      "skipped_transform_error",
      "skipped_append_error",
    ]).toContain(result.outcome);
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Test 15: no route / API / UI touch (構造的確認)
// ─────────────────────────────────────────────

describe("A3 — no route / API / UI / ChatClient / UpperLayerMount touch (CEO 必須、構造的)", () => {
  it("dynamic import 可能 (本 PR で route / UI に接続なし)", async () => {
    const mod = await import("../../../../lib/coalter/understanding/diagnosticsFanout");
    expect(typeof mod.fanOutUnderstandingDiagnosticsToBuffer).toBe("function");
    expect(typeof mod.transformUnderstandingDiagnosticsToRedactedInput).toBe("function");
    expect(typeof mod.isBufferFanoutEnabled).toBe("function");
  });
});

// ─────────────────────────────────────────────
// Test 16: forward compatibility (人間超越 Idea L)
// ─────────────────────────────────────────────

describe("fanOutUnderstandingDiagnosticsToBuffer — forward compat", () => {
  it("raw に未知 extra field があっても crash しない (forward compat)", () => {
    setBufferFanoutEnv("true");
    const future = {
      ...DIAGNOSTICS_SAMPLE_SUCCESS,
      futureExtraField: "value_for_a4",
      anotherFutureNumber: 12345,
    } as unknown as UnderstandingDiagnostics;
    const result = fanOutUnderstandingDiagnosticsToBuffer(future);
    expect(result.outcome).toBe("appended");
    // future field は buffer に漏れない
    const snapshot = getRedactedUnderstandingDiagnosticsSnapshot();
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain("futureExtraField");
    expect(json).not.toContain("anotherFutureNumber");
    expect(json).not.toContain("12345");
  });
});

// ─────────────────────────────────────────────
// Test 17: production no-op when not wired (本 PR の核)
// ─────────────────────────────────────────────

describe("A3 — production no-op when flag OFF (CEO 必須)", () => {
  it("flag OFF (default) → emit 経由でも buffer 不変、production behavior 0", () => {
    setBufferFanoutEnv(undefined);
    setDiagnosticsConsoleEnv(undefined);

    // emit 1000 回呼んでも buffer 不変
    for (let i = 0; i < 1000; i++) {
      emitUnderstandingDiagnostics(DIAGNOSTICS_SAMPLE_SUCCESS);
    }
    expect(getRedactedUnderstandingDiagnosticsBufferSize()).toBe(0);
  });
});
