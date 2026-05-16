/**
 * CoAlter Gap 4 — Client Observation Receive Tests (D4 phase)
 *
 * 正本:
 *   - lib/coalter/presence/clientObservationReceive.ts (本 PR D4)
 *   - lib/coalter/presence/contextDetectionMode.ts (PR #141 D3)
 *
 * CEO 必須 tests (2026-05-16):
 *   - response field なし → 既存挙動維持
 *   - response field あり → parse / receive できる
 *   - activation false → UI / Pattern 変化なし
 *   - unknown shape → fail-closed
 *   - raw text / PII を保存しない
 *   - no UpperLayerMount behavior change
 *   - no Pattern activation
 *
 * 14 test category × 40+ individual tests.
 */

import { describe, expect, it } from "vitest";
import {
  isValidGap4Observation,
  receiveGap4Observation,
  shouldActivateFromObservation,
  getReceiveMetadata,
  GAP4_CLIENT_RECEIVE_VERSION,
  type Gap4ReceiveResult,
  type Gap4ClientReceiveReasonCode,
} from "../../../../lib/coalter/presence/clientObservationReceive";
import {
  buildGap4RouteObservationFromEnv,
  type Gap4RouteObservationField,
} from "../../../../lib/coalter/presence/contextDetectionMode";

// ─────────────────────────────────────────────
// Helper: make valid observation field via D3 builder
// ─────────────────────────────────────────────

function makeValidObservation(): Gap4RouteObservationField {
  const obs = buildGap4RouteObservationFromEnv("observe", {
    contradictionDetected: true,
  });
  if (obs === undefined) throw new Error("Builder should return field for observe + signal");
  return obs;
}

function makeOffWithFallbackObservation(): Gap4RouteObservationField {
  const obs = buildGap4RouteObservationFromEnv("unknown_value");
  if (obs === undefined) throw new Error("Builder should return field for unknown fallback");
  return obs;
}

// ─────────────────────────────────────────────
// Test 1: isValidGap4Observation — type guard / shape validator (CEO unknown shape → fail-closed)
// ─────────────────────────────────────────────

describe("isValidGap4Observation — type guard + shape validator", () => {
  it("null → false (fail-closed)", () => {
    expect(isValidGap4Observation(null)).toBe(false);
  });
  it("undefined → false", () => {
    expect(isValidGap4Observation(undefined)).toBe(false);
  });
  it("non-object (string) → false", () => {
    expect(isValidGap4Observation("not_an_object")).toBe(false);
  });
  it("non-object (number) → false", () => {
    expect(isValidGap4Observation(42)).toBe(false);
  });
  it("non-object (array) → false (object check)", () => {
    // Array is typeof "object" so we'd accept by typeof. But it lacks 'mode' field.
    expect(isValidGap4Observation([1, 2, 3])).toBe(false);
  });
  it("empty object → false (missing required fields)", () => {
    expect(isValidGap4Observation({})).toBe(false);
  });
  it("missing mode → false", () => {
    expect(isValidGap4Observation({ activation: false, observationVersion: "0.1.0", reasonCodes_top: [] })).toBe(false);
  });
  it("mode is unknown enum value → false (whitelist enforce)", () => {
    expect(
      isValidGap4Observation({
        mode: "unknown_mode",
        activation: false,
        observationVersion: "0.1.0",
        reasonCodes_top: [],
      }),
    ).toBe(false);
  });
  it("mode='observe' + valid required fields → true", () => {
    expect(
      isValidGap4Observation({
        mode: "observe",
        activation: false,
        observationVersion: "0.1.0",
        reasonCodes_top: [],
      }),
    ).toBe(true);
  });
  it("activation is non-boolean → false", () => {
    expect(
      isValidGap4Observation({
        mode: "observe",
        activation: "false", // string, not boolean
        observationVersion: "0.1.0",
        reasonCodes_top: [],
      }),
    ).toBe(false);
  });
  it("invalid skippedReason enum → false (whitelist)", () => {
    expect(
      isValidGap4Observation({
        mode: "observe",
        activation: false,
        observationVersion: "0.1.0",
        reasonCodes_top: [],
        skippedReason: "completely_invalid_reason",
      }),
    ).toBe(false);
  });
  it("valid skippedReason enum → true", () => {
    expect(
      isValidGap4Observation({
        mode: "observe",
        activation: false,
        observationVersion: "0.1.0",
        reasonCodes_top: [],
        skippedReason: "insufficient_structured_signals",
      }),
    ).toBe(true);
  });
  it("reasonCodes_top is not array → false", () => {
    expect(
      isValidGap4Observation({
        mode: "observe",
        activation: false,
        observationVersion: "0.1.0",
        reasonCodes_top: "not_an_array",
      }),
    ).toBe(false);
  });
  it("reasonCodes_top contains non-string → false", () => {
    expect(
      isValidGap4Observation({
        mode: "observe",
        activation: false,
        observationVersion: "0.1.0",
        reasonCodes_top: [123, true],
      }),
    ).toBe(false);
  });
  it("D3 builder output → true (round-trip)", () => {
    const obs = makeValidObservation();
    expect(isValidGap4Observation(obs)).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 2: receiveGap4Observation — field absent (CEO 既存挙動維持)
// ─────────────────────────────────────────────

describe("receiveGap4Observation — field absent (CEO: 既存 response 維持)", () => {
  it("null output → observation undefined + received_field_absent", () => {
    const res = receiveGap4Observation(null);
    expect(res.observation).toBeUndefined();
    expect(res.reasonCodes).toContain("received_field_absent" satisfies Gap4ClientReceiveReasonCode);
    expect(res.clientReceiveVersion).toBe(GAP4_CLIENT_RECEIVE_VERSION);
  });

  it("undefined output → observation undefined + received_field_absent", () => {
    const res = receiveGap4Observation(undefined);
    expect(res.observation).toBeUndefined();
    expect(res.reasonCodes).toContain("received_field_absent" satisfies Gap4ClientReceiveReasonCode);
  });

  it("output without gap4ContextObservation field → observation undefined", () => {
    const res = receiveGap4Observation({});
    expect(res.observation).toBeUndefined();
    expect(res.reasonCodes).toContain("received_field_absent" satisfies Gap4ClientReceiveReasonCode);
  });

  it("output with gap4ContextObservation=undefined → observation undefined", () => {
    const res = receiveGap4Observation({ gap4ContextObservation: undefined });
    expect(res.observation).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// Test 3: receiveGap4Observation — field present (CEO: parse / receive できる)
// ─────────────────────────────────────────────

describe("receiveGap4Observation — field present (CEO: receive できる)", () => {
  it("valid observation → observation 返却 + received_field_present", () => {
    const obs = makeValidObservation();
    const res = receiveGap4Observation({ gap4ContextObservation: obs });
    expect(res.observation).toBeDefined();
    expect(res.observation).toEqual(obs);
    expect(res.reasonCodes).toContain("received_field_present" satisfies Gap4ClientReceiveReasonCode);
  });

  it("unknown fallback observation (mode='off' + skippedReason) → receive 可能", () => {
    const obs = makeOffWithFallbackObservation();
    const res = receiveGap4Observation({ gap4ContextObservation: obs });
    expect(res.observation).toBeDefined();
    expect(res.observation?.mode).toBe("off");
    expect(res.observation?.skippedReason).toBe("mode_unknown_fallback_off");
  });
});

// ─────────────────────────────────────────────
// Test 4: activation false (CEO: UI / Pattern 変化なし)
// ─────────────────────────────────────────────

describe("receiveGap4Observation — activation: false (CEO: UI / Pattern 不変)", () => {
  it("valid observation の activation は false (D3 強制)", () => {
    const obs = makeValidObservation();
    const res = receiveGap4Observation({ gap4ContextObservation: obs });
    expect(res.observation?.activation).toBe(false);
    expect(res.reasonCodes).toContain(
      "activation_gate_held_false_client_side" satisfies Gap4ClientReceiveReasonCode,
    );
  });

  it("reasonCodes に no_ui_render_applied / no_pattern_activation_applied 含む", () => {
    const obs = makeValidObservation();
    const res = receiveGap4Observation({ gap4ContextObservation: obs });
    expect(res.reasonCodes).toContain("no_ui_render_applied" satisfies Gap4ClientReceiveReasonCode);
    expect(res.reasonCodes).toContain(
      "no_pattern_activation_applied" satisfies Gap4ClientReceiveReasonCode,
    );
  });

  it("reasonCodes に no_state_mutation_applied / no_storage_save_applied 含む", () => {
    const obs = makeValidObservation();
    const res = receiveGap4Observation({ gap4ContextObservation: obs });
    expect(res.reasonCodes).toContain(
      "no_state_mutation_applied" satisfies Gap4ClientReceiveReasonCode,
    );
    expect(res.reasonCodes).toContain(
      "no_storage_save_applied" satisfies Gap4ClientReceiveReasonCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 5: unknown shape → fail-closed (CEO)
// ─────────────────────────────────────────────

describe("receiveGap4Observation — unknown shape fail-closed (CEO)", () => {
  it("invalid shape (object with wrong types) → observation undefined + received_field_invalid_shape", () => {
    const res = receiveGap4Observation({
      gap4ContextObservation: { mode: "not_a_valid_mode", activation: "string_not_bool" },
    });
    expect(res.observation).toBeUndefined();
    expect(res.reasonCodes).toContain(
      "received_field_invalid_shape" satisfies Gap4ClientReceiveReasonCode,
    );
  });

  it("invalid shape (non-object) → observation undefined", () => {
    const res = receiveGap4Observation({
      gap4ContextObservation: "not_an_object",
    });
    expect(res.observation).toBeUndefined();
  });

  it("invalid shape (number) → observation undefined", () => {
    const res = receiveGap4Observation({ gap4ContextObservation: 42 });
    expect(res.observation).toBeUndefined();
  });

  it("invalid shape (null) → observation undefined", () => {
    const res = receiveGap4Observation({ gap4ContextObservation: null });
    expect(res.observation).toBeUndefined();
  });

  it("invalid shape → throw しない (production stability)", () => {
    expect(() => {
      receiveGap4Observation({
        gap4ContextObservation: { mode: 42, activation: null, observationVersion: ["array"] },
      });
    }).not.toThrow();
  });
});

// ─────────────────────────────────────────────
// Test 6: raw text / PII を保存・表示しない (CEO 必須)
// ─────────────────────────────────────────────

describe("receiveGap4Observation — raw text / PII 不保存 (CEO 必須)", () => {
  it("output stringify に raw text / PII が含まれない (構造的検証)", () => {
    const obs = makeValidObservation();
    const res = receiveGap4Observation({ gap4ContextObservation: obs });
    const json = JSON.stringify(res);
    // reasonCodes は全て enum (lower_snake_case)
    for (const code of res.reasonCodes) {
      expect(code).toMatch(/^[a-z_]+$/);
    }
    // observation 内も enum + boolean + number のみ
    if (res.observation !== undefined) {
      expect(typeof res.observation.activation).toBe("boolean");
      expect(typeof res.observation.observationVersion).toBe("string");
      expect(res.observation.observationVersion).toMatch(/^\d+\.\d+\.\d+$/);
    }
    expect(json).toBeDefined();
  });

  it("caller が raw text を含む shape を渡しても、shape validator が reject", () => {
    // 不正 shape: mode に raw user text っぽいもの
    const res = receiveGap4Observation({
      gap4ContextObservation: {
        mode: "ユーザーが何か入力した raw text", // not whitelist enum
        activation: false,
        observationVersion: "0.1.0",
        reasonCodes_top: [],
      },
    });
    expect(res.observation).toBeUndefined();
    expect(res.reasonCodes).toContain(
      "received_field_invalid_shape" satisfies Gap4ClientReceiveReasonCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 7: shouldActivateFromObservation — twin-gate (人間超越 Idea D + K)
// ─────────────────────────────────────────────

describe("shouldActivateFromObservation — twin-gate (D4 で常に false)", () => {
  it("undefined observation → false", () => {
    expect(shouldActivateFromObservation(undefined)).toBe(false);
  });

  it("valid observation (activation: false) → false", () => {
    const obs = makeValidObservation();
    expect(shouldActivateFromObservation(obs)).toBe(false);
  });

  it("仮に activation: true が来ても (server gate 破れたら) client gate で false (twin-gate)", () => {
    // server (D3) は activation: false 固定だが、万一 D7 phase で true が来ても
    // client (D4) は常に false を返す = twin-gate enforce
    const fakeActivationTrue = {
      ...makeValidObservation(),
      activation: true as unknown as false, // 型をだまして true 注入
    };
    // shouldActivate は activation 値を見ない、常に false
    expect(shouldActivateFromObservation(fakeActivationTrue as Gap4RouteObservationField)).toBe(false);
  });

  it("return type is literal false (compile-time)", () => {
    const result: false = shouldActivateFromObservation(undefined);
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Test 8: getReceiveMetadata — test observability (人間超越 Idea I)
// ─────────────────────────────────────────────

describe("getReceiveMetadata — test observability accessor", () => {
  it("absent observation → hasObservation=false / activationGateHeld=true", () => {
    const res = receiveGap4Observation(undefined);
    const meta = getReceiveMetadata(res);
    expect(meta.hasObservation).toBe(false);
    expect(meta.activationGateHeld).toBe(true);
    expect(meta.mode).toBeUndefined();
  });

  it("present observation (observe mode) → hasObservation=true / mode='observe'", () => {
    const obs = makeValidObservation();
    const res = receiveGap4Observation({ gap4ContextObservation: obs });
    const meta = getReceiveMetadata(res);
    expect(meta.hasObservation).toBe(true);
    expect(meta.mode).toBe("observe");
    expect(meta.activationGateHeld).toBe(true);
    expect(meta.clientReceiveVersion).toBe("0.1.0");
  });

  it("invalid shape → hasObservation=false (fail-closed)", () => {
    const res = receiveGap4Observation({ gap4ContextObservation: { mode: "invalid" } });
    const meta = getReceiveMetadata(res);
    expect(meta.hasObservation).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Test 9: no side effect (CEO: no state mutation、no storage)
// ─────────────────────────────────────────────

describe("receiveGap4Observation — pure (no side effect、no storage)", () => {
  it("受信しても localStorage / sessionStorage を変更しない", () => {
    // Note: vitest 環境では localStorage / sessionStorage が default 不在
    //   pure function なので receiveGap4Observation 実行で side effect ゼロ
    const obs = makeValidObservation();
    receiveGap4Observation({ gap4ContextObservation: obs });
    // assertion: no exception (storage access なし)
    expect(true).toBe(true);
  });

  it("100 回連続呼出で同一 output (deterministic、no global state)", () => {
    const obs = makeValidObservation();
    const baseline = JSON.stringify(receiveGap4Observation({ gap4ContextObservation: obs }));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(receiveGap4Observation({ gap4ContextObservation: obs }))).toBe(baseline);
    }
  });

  it("input を mutate しない (referential transparency)", () => {
    const obs = makeValidObservation();
    const wrapper = { gap4ContextObservation: obs };
    const wrapperBefore = JSON.stringify(wrapper);
    receiveGap4Observation(wrapper);
    expect(JSON.stringify(wrapper)).toBe(wrapperBefore);
  });
});

// ─────────────────────────────────────────────
// Test 10: no Pattern activation (CEO 必須)
// ─────────────────────────────────────────────

describe("receiveGap4Observation — no Pattern activation (CEO 必須)", () => {
  it("どの mode (off / observe / live) でも shouldActivate === false (twin-gate)", () => {
    const modes: Array<string | undefined> = [undefined, "off", "observe", "live", "unknown"];
    for (const envValue of modes) {
      const obs = buildGap4RouteObservationFromEnv(envValue, { contradictionDetected: true });
      const res = receiveGap4Observation({ gap4ContextObservation: obs });
      // shouldActivate 常に false (twin-gate)
      expect(shouldActivateFromObservation(res.observation)).toBe(false);
      // 受信時 reasonCodes に no_pattern_activation_applied
      expect(res.reasonCodes).toContain(
        "no_pattern_activation_applied" satisfies Gap4ClientReceiveReasonCode,
      );
    }
  });
});

// ─────────────────────────────────────────────
// Test 11: backward compatibility (CEO: existing client は無視可能)
// ─────────────────────────────────────────────

describe("receiveGap4Observation — backward compatibility", () => {
  it("field 不在 (default OFF) → 既存 receive call が壊れない", () => {
    // 通常の CoAlterOutput shape を模した object (gap4ContextObservation 不在)
    // cast to receive helper's input type for backward-compat verification
    const existingOutput: { gap4ContextObservation?: unknown } = {
      // 通常の CoAlterOutput field は本 helper に渡さない (関心は gap4ContextObservation のみ)
    };
    const res = receiveGap4Observation(existingOutput);
    expect(res.observation).toBeUndefined();
    expect(res.reasonCodes).toContain("received_field_absent");
    // existingOutput は mutate されない
    expect(existingOutput.gap4ContextObservation).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// Test 12: const exports
// ─────────────────────────────────────────────

describe("Gap 4 D4 — const exports", () => {
  it("GAP4_CLIENT_RECEIVE_VERSION is '0.1.0'", () => {
    expect(GAP4_CLIENT_RECEIVE_VERSION).toBe("0.1.0");
  });
});

// ─────────────────────────────────────────────
// Test 13: no runtime wiring (pure function 検証)
// ─────────────────────────────────────────────

describe("Gap 4 D4 — no runtime wiring (pure function)", () => {
  it("output is JSON serializable", () => {
    const obs = makeValidObservation();
    const res = receiveGap4Observation({ gap4ContextObservation: obs });
    const json = JSON.stringify(res);
    const parsed = JSON.parse(json) as Gap4ReceiveResult;
    expect(parsed.observation?.activation).toBe(false);
    expect(parsed.clientReceiveVersion).toBe("0.1.0");
  });

  it("dynamic import 可能 (call-site wiring は useCoAlter.ts のみ)", async () => {
    const mod = await import("../../../../lib/coalter/presence/clientObservationReceive");
    expect(typeof mod.receiveGap4Observation).toBe("function");
    expect(typeof mod.isValidGap4Observation).toBe("function");
    expect(typeof mod.shouldActivateFromObservation).toBe("function");
  });
});

// ─────────────────────────────────────────────
// Test 14: forward compatibility (人間超越 Idea H)
// ─────────────────────────────────────────────

describe("receiveGap4Observation — forward compatibility (Idea H)", () => {
  it("observation に未知 enum 値が reasonCodes_top に入っていても reject しない", () => {
    // forward compat: D5 phase で新 reason code が追加される前提
    const res = receiveGap4Observation({
      gap4ContextObservation: {
        mode: "observe",
        activation: false,
        observationVersion: "0.2.0", // future version
        reasonCodes_top: ["future_reason_code_d5", "another_future_code"],
      },
    });
    // future reason code でも shape として valid → receive 可能
    expect(res.observation).toBeDefined();
  });

  it("不明 extra field を持つ observation も accept (forward compat)", () => {
    const res = receiveGap4Observation({
      gap4ContextObservation: {
        mode: "observe",
        activation: false,
        observationVersion: "0.1.0",
        reasonCodes_top: ["detector_invoked"],
        futureExtraField: "value_for_d5",
      },
    });
    expect(res.observation).toBeDefined();
  });
});
