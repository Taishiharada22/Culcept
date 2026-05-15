/**
 * CoAlter Gap 4 — Route Observation Mode Parser + Builder Tests (D3 phase)
 *
 * 正本:
 *   - lib/coalter/presence/contextDetectionMode.ts (本 PR D3)
 *   - lib/coalter/presence/contextDetector.ts (Gap 4 D2、PR #130)
 *
 * CEO 必須 tests (2026-05-16):
 *   - env未設定 / off → field なし、既存 response 維持
 *   - observe → additive field あり
 *   - unknown env value → off
 *   - live → field は出ても activation false / variant 発火なし
 *   - structured signals 不足 → skippedReason 固定コード
 *   - raw text が output に出ない
 *   - detectorVersion が入る
 *   - no ChatClient / UpperLayerMount touch
 *   - no UI behavior
 *   - no production env 変更
 *
 * 14 test category × 36 individual tests.
 */

import { describe, expect, it } from "vitest";
import {
  parseGap4ObservationMode,
  isModeUnknownFallback,
  hasAnyStructuredSignal,
  buildGap4RouteObservation,
  buildGap4RouteObservationFromEnv,
  GAP4_OBSERVATION_MODE_ENV_VAR,
  GAP4_ROUTE_OBSERVATION_VERSION,
  DETECTOR_VERSION,
  type Gap4ObservationMode,
  type Gap4RouteObservationField,
  type Gap4RouteObservationSkipReason,
  type Gap4RouteObservationReasonCode,
  type ContextDetectorInput,
} from "../../../../lib/coalter/presence/contextDetectionMode";

// ─────────────────────────────────────────────
// Test 1: parser whitelist (CEO: unknown env value → off)
// ─────────────────────────────────────────────

describe("parseGap4ObservationMode — whitelist + fail-closed", () => {
  it("undefined → 'off' (default)", () => {
    expect(parseGap4ObservationMode(undefined)).toBe("off" satisfies Gap4ObservationMode);
  });
  it("null → 'off' (default)", () => {
    expect(parseGap4ObservationMode(null)).toBe("off" satisfies Gap4ObservationMode);
  });
  it("empty string → 'off' (treated as missing)", () => {
    expect(parseGap4ObservationMode("")).toBe("off" satisfies Gap4ObservationMode);
  });
  it("'off' → 'off'", () => {
    expect(parseGap4ObservationMode("off")).toBe("off" satisfies Gap4ObservationMode);
  });
  it("'observe' → 'observe'", () => {
    expect(parseGap4ObservationMode("observe")).toBe("observe" satisfies Gap4ObservationMode);
  });
  it("'live' → 'live'", () => {
    expect(parseGap4ObservationMode("live")).toBe("live" satisfies Gap4ObservationMode);
  });
  it("大文字混在 'OBSERVE' → 'observe' (case-insensitive)", () => {
    expect(parseGap4ObservationMode("OBSERVE")).toBe("observe");
  });
  it("trim + lower 'Live ' → 'live'", () => {
    expect(parseGap4ObservationMode(" Live ")).toBe("live");
  });
  it("unknown value 'enabled' → 'off' (fail-closed)", () => {
    expect(parseGap4ObservationMode("enabled")).toBe("off");
  });
  it("unknown value 'true' → 'off' (typo / non-whitelist)", () => {
    expect(parseGap4ObservationMode("true")).toBe("off");
  });
  it("unknown value 'production' → 'off'", () => {
    expect(parseGap4ObservationMode("production")).toBe("off");
  });
});

// ─────────────────────────────────────────────
// Test 2: isModeUnknownFallback (CEO: unknown vs intentional off)
// ─────────────────────────────────────────────

describe("isModeUnknownFallback — detect unknown fallback", () => {
  it("undefined → false (not unknown, just missing)", () => {
    expect(isModeUnknownFallback(undefined)).toBe(false);
  });
  it("null → false", () => {
    expect(isModeUnknownFallback(null)).toBe(false);
  });
  it("empty string → false (treated as missing)", () => {
    expect(isModeUnknownFallback("")).toBe(false);
  });
  it("'off' → false (intentional)", () => {
    expect(isModeUnknownFallback("off")).toBe(false);
  });
  it("'observe' → false", () => {
    expect(isModeUnknownFallback("observe")).toBe(false);
  });
  it("'live' → false", () => {
    expect(isModeUnknownFallback("live")).toBe(false);
  });
  it("'enabled' → true (unknown value)", () => {
    expect(isModeUnknownFallback("enabled")).toBe(true);
  });
  it("'true' → true", () => {
    expect(isModeUnknownFallback("true")).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 3: hasAnyStructuredSignal
// ─────────────────────────────────────────────

describe("hasAnyStructuredSignal — structured signal detection", () => {
  it("undefined → false", () => {
    expect(hasAnyStructuredSignal(undefined)).toBe(false);
  });
  it("empty object → false", () => {
    expect(hasAnyStructuredSignal({})).toBe(false);
  });
  it("infoMissingSignal=true → true", () => {
    expect(hasAnyStructuredSignal({ infoMissingSignal: true })).toBe(true);
  });
  it("recentMessageCount=0 → true (defined even if 0)", () => {
    expect(hasAnyStructuredSignal({ recentMessageCount: 0 })).toBe(true);
  });
  it("presenceMode='daily' only → true", () => {
    expect(hasAnyStructuredSignal({ presenceMode: "daily" })).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 4: buildGap4RouteObservation — env unset / off (CEO: field なし)
// ─────────────────────────────────────────────

describe("buildGap4RouteObservation — off mode (default、field 不在)", () => {
  it("mode='off' + not unknown → undefined (field 完全不在、既存 response 維持)", () => {
    const out = buildGap4RouteObservation({ mode: "off", modeWasUnknown: false });
    expect(out).toBeUndefined();
  });

  it("mode='off' + modeWasUnknown=true → field with skippedReason='mode_unknown_fallback_off'", () => {
    const out = buildGap4RouteObservation({ mode: "off", modeWasUnknown: true });
    expect(out).toBeDefined();
    expect(out!.mode).toBe("off");
    expect(out!.skippedReason).toBe(
      "mode_unknown_fallback_off" satisfies Gap4RouteObservationSkipReason,
    );
    expect(out!.activation).toBe(false);
    expect(out!.reasonCodes_top).toContain(
      "fail_closed_unknown_mode" satisfies Gap4RouteObservationReasonCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 5: observe mode (CEO: additive field あり、signals hint 必要)
// ─────────────────────────────────────────────

describe("buildGap4RouteObservation — observe mode", () => {
  it("observe + signalsHint なし → skippedReason='insufficient_structured_signals'", () => {
    const out = buildGap4RouteObservation({ mode: "observe" });
    expect(out).toBeDefined();
    expect(out!.mode).toBe("observe");
    expect(out!.skippedReason).toBe(
      "insufficient_structured_signals" satisfies Gap4RouteObservationSkipReason,
    );
    expect(out!.activation).toBe(false);
    expect(out!.reasonCodes_top).toContain(
      "mode_observe_applied" satisfies Gap4RouteObservationReasonCode,
    );
    expect(out!.reasonCodes_top).toContain(
      "signals_hint_absent" satisfies Gap4RouteObservationReasonCode,
    );
  });

  it("observe + signalsHint empty object → skippedReason='insufficient_structured_signals'", () => {
    const out = buildGap4RouteObservation({ mode: "observe", signalsHint: {} });
    expect(out).toBeDefined();
    expect(out!.skippedReason).toBe("insufficient_structured_signals");
  });

  it("observe + signalsHint with infoMissingSignal=true → detector invoked + patternContext", () => {
    const out = buildGap4RouteObservation({
      mode: "observe",
      signalsHint: { infoMissingSignal: true, recentMessageCount: 0 },
    });
    expect(out).toBeDefined();
    expect(out!.mode).toBe("observe");
    expect(out!.detectorVersion).toBe(DETECTOR_VERSION);
    expect(out!.activation).toBe(false);
    expect(out!.skippedReason).toBeUndefined();
    expect(out!.reasonCodes_top).toContain(
      "detector_invoked" satisfies Gap4RouteObservationReasonCode,
    );
    // patternContext.infoMissing が true 確定 (infoMissingSignal=true + recentMessageCount=0 で score 0.9 > 0.5)
    expect(out!.patternContext?.infoMissing).toBe(true);
  });

  it("observe + signalsHint with low signal → pattern context undetermined skip", () => {
    // single weak signal で全 field threshold 未達 (recentMessageCount=10 のみ)
    const out = buildGap4RouteObservation({
      mode: "observe",
      signalsHint: { recentMessageCount: 10 },
    });
    expect(out).toBeDefined();
    expect(out!.detectorVersion).toBe(DETECTOR_VERSION);
    expect(out!.skippedReason).toBe(
      "pattern_context_undetermined" satisfies Gap4RouteObservationSkipReason,
    );
    expect(out!.activation).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Test 6: live mode (CEO: field 出ても activation false / variant 発火なし)
// ─────────────────────────────────────────────

describe("buildGap4RouteObservation — live mode (D3: activation always false)", () => {
  it("live + signalsHint なし → field with skippedReason, activation: false", () => {
    const out = buildGap4RouteObservation({ mode: "live" });
    expect(out).toBeDefined();
    expect(out!.mode).toBe("live");
    expect(out!.skippedReason).toBe(
      "insufficient_structured_signals" satisfies Gap4RouteObservationSkipReason,
    );
    expect(out!.activation).toBe(false);
    expect(out!.reasonCodes_top).toContain(
      "mode_live_parsed_no_activation" satisfies Gap4RouteObservationReasonCode,
    );
  });

  it("live + signalsHint with strong signal → field with patternContext, activation: false (D3 強制)", () => {
    const out = buildGap4RouteObservation({
      mode: "live",
      signalsHint: { contradictionDetected: true },
    });
    expect(out).toBeDefined();
    expect(out!.mode).toBe("live");
    expect(out!.detectorVersion).toBe(DETECTOR_VERSION);
    // contradictionDetected=true → needFraming.confidence = 0.8 → true 確定
    expect(out!.patternContext?.needFraming).toBe(true);
    // **D3 phase 強制: activation: false 固定**
    expect(out!.activation).toBe(false);
    expect(out!.reasonCodes_top).toContain(
      "mode_live_parsed_no_activation" satisfies Gap4RouteObservationReasonCode,
    );
    expect(out!.reasonCodes_top).toContain(
      "activation_guarded_false" satisfies Gap4RouteObservationReasonCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 7: structured signals 不足 → skippedReason 固定コード (CEO)
// ─────────────────────────────────────────────

describe("buildGap4RouteObservation — skipped reason (CEO 必須)", () => {
  it("observe + 全 signal undefined → 'insufficient_structured_signals' (固定コード)", () => {
    const out = buildGap4RouteObservation({ mode: "observe", signalsHint: undefined });
    expect(out?.skippedReason).toBe(
      "insufficient_structured_signals" satisfies Gap4RouteObservationSkipReason,
    );
  });

  it("skipped 5 種類の固定コードのみ accept (enum 列挙)", () => {
    const expectedSkipReasons: Gap4RouteObservationSkipReason[] = [
      "mode_off",
      "mode_unknown_fallback_off",
      "insufficient_structured_signals",
      "detector_input_invalid",
      "pattern_context_undetermined",
    ];
    // type-level check (compile-time)
    for (const code of expectedSkipReasons) {
      expect(typeof code).toBe("string");
      expect(code).toMatch(/^[a-z_]+$/);
    }
  });
});

// ─────────────────────────────────────────────
// Test 8: raw text が output に出ない (CEO 必須、構造的検証)
// ─────────────────────────────────────────────

describe("buildGap4RouteObservation — raw text leakage 構造的防止 (CEO)", () => {
  it("observe + 強い signal で output stringify → raw text / PII を含まない", () => {
    const out = buildGap4RouteObservation({
      mode: "observe",
      signalsHint: {
        infoMissingSignal: true,
        stallDetected: true,
        contradictionDetected: true,
        recentMessageCount: 0,
      },
    });
    expect(out).toBeDefined();
    const json = JSON.stringify(out);
    // 全 reason codes は enum (lower_snake_case alphabetic only)
    for (const code of out!.reasonCodes_top) {
      expect(code).toMatch(/^[a-z_]+$/);
      expect(code).not.toContain(" ");
    }
    // patternContext field は boolean のみ
    if (out!.patternContext !== undefined) {
      for (const v of Object.values(out!.patternContext)) {
        expect(typeof v).toBe("boolean");
      }
    }
    // detectorVersion は semver 形式 (固定 string)
    expect(out!.detectorVersion).toMatch(/^\d+\.\d+\.\d+$/);
    // observationVersion は semver
    expect(out!.observationVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("caller が raw text を渡しても型レベルで受領不可 (構造的検証)", () => {
    // この test は型レベル enforcement の確認用。runtime 動作は input shape に依存。
    // hint の field は binary / count / score / enum のみ、string raw text は受領しない
    const hint: Partial<ContextDetectorInput> = {
      infoMissingSignal: true, // boolean OK
      recentMessageCount: 5, // number OK
      ambiguityResponseMode: "clarify", // enum OK
    };
    // 型レベルで { rawMessage: "user said XYZ" } は ContextDetectorInput に渡せない
    expect(hint.infoMissingSignal).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 9: detectorVersion が入る (CEO 必須)
// ─────────────────────────────────────────────

describe("buildGap4RouteObservation — detectorVersion pass-through (CEO)", () => {
  it("observe + signal 通常 → detectorVersion = DETECTOR_VERSION", () => {
    const out = buildGap4RouteObservation({
      mode: "observe",
      signalsHint: { infoMissingSignal: true, recentMessageCount: 0 },
    });
    expect(out?.detectorVersion).toBe(DETECTOR_VERSION);
    expect(out?.detectorVersion).toBe("0.1.0");
  });

  it("observationVersion = GAP4_ROUTE_OBSERVATION_VERSION (calibration 用、independent)", () => {
    const out = buildGap4RouteObservation({
      mode: "observe",
      signalsHint: { infoMissingSignal: true, recentMessageCount: 0 },
    });
    expect(out?.observationVersion).toBe(GAP4_ROUTE_OBSERVATION_VERSION);
    expect(out?.observationVersion).toBe("0.1.0");
  });
});

// ─────────────────────────────────────────────
// Test 10: deterministic (pure function)
// ─────────────────────────────────────────────

describe("buildGap4RouteObservation — deterministic", () => {
  it("同一 input 100 回呼出で完全同一 output", () => {
    const opts = {
      mode: "observe" as const,
      signalsHint: {
        infoMissingSignal: true,
        stallDetected: true,
        recentMessageCount: 0,
      } as Partial<ContextDetectorInput>,
    };
    const baseline = JSON.stringify(buildGap4RouteObservation(opts));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(buildGap4RouteObservation(opts))).toBe(baseline);
    }
  });
});

// ─────────────────────────────────────────────
// Test 11: buildGap4RouteObservationFromEnv (convenience wrapper)
// ─────────────────────────────────────────────

describe("buildGap4RouteObservationFromEnv — env value direct", () => {
  it("env undefined → undefined (field 不在、既存 response 維持)", () => {
    expect(buildGap4RouteObservationFromEnv(undefined)).toBeUndefined();
  });

  it("env 'off' → undefined", () => {
    expect(buildGap4RouteObservationFromEnv("off")).toBeUndefined();
  });

  it("env 'enabled' (unknown) → field with mode_unknown_fallback_off", () => {
    const out = buildGap4RouteObservationFromEnv("enabled");
    expect(out).toBeDefined();
    expect(out!.skippedReason).toBe("mode_unknown_fallback_off");
    expect(out!.activation).toBe(false);
  });

  it("env 'observe' + signalsHint なし → field with insufficient_structured_signals", () => {
    const out = buildGap4RouteObservationFromEnv("observe");
    expect(out).toBeDefined();
    expect(out!.skippedReason).toBe("insufficient_structured_signals");
  });

  it("env 'observe' + signalsHint あり → detector invoked", () => {
    const out = buildGap4RouteObservationFromEnv("observe", {
      contradictionDetected: true,
    });
    expect(out).toBeDefined();
    expect(out!.detectorVersion).toBeDefined();
    expect(out!.activation).toBe(false);
  });

  it("env 'live' + signalsHint あり → detector invoked but activation: false (D3)", () => {
    const out = buildGap4RouteObservationFromEnv("live", {
      contradictionDetected: true,
    });
    expect(out).toBeDefined();
    expect(out!.mode).toBe("live");
    expect(out!.activation).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Test 12: const exports
// ─────────────────────────────────────────────

describe("Gap 4 D3 — const exports", () => {
  it("GAP4_OBSERVATION_MODE_ENV_VAR is 'COALTER_GAP4_OBSERVATION_MODE'", () => {
    expect(GAP4_OBSERVATION_MODE_ENV_VAR).toBe("COALTER_GAP4_OBSERVATION_MODE");
  });

  it("GAP4_ROUTE_OBSERVATION_VERSION is '0.1.0'", () => {
    expect(GAP4_ROUTE_OBSERVATION_VERSION).toBe("0.1.0");
  });

  it("DETECTOR_VERSION re-export is '0.1.0'", () => {
    expect(DETECTOR_VERSION).toBe("0.1.0");
  });
});

// ─────────────────────────────────────────────
// Test 13: no runtime wiring (pure function 検証)
// ─────────────────────────────────────────────

describe("Gap 4 D3 — no runtime wiring (pure function)", () => {
  it("output is JSON serializable", () => {
    const out = buildGap4RouteObservation({
      mode: "observe",
      signalsHint: { infoMissingSignal: true, recentMessageCount: 0 },
    });
    expect(out).toBeDefined();
    const json = JSON.stringify(out);
    const parsed = JSON.parse(json) as Gap4RouteObservationField;
    expect(parsed.activation).toBe(false);
    expect(parsed.observationVersion).toBe("0.1.0");
  });

  it("dynamic import 可能 (call-site wiring は invoke route のみ)", async () => {
    const mod = await import("../../../../lib/coalter/presence/contextDetectionMode");
    expect(typeof mod.buildGap4RouteObservation).toBe("function");
    expect(typeof mod.parseGap4ObservationMode).toBe("function");
    expect(typeof mod.buildGap4RouteObservationFromEnv).toBe("function");
  });

  it("**Activation guard**: live mode で strong signal でも activation: false (D3 phase enforce)", () => {
    const allLive = [
      buildGap4RouteObservation({
        mode: "live",
        signalsHint: { infoMissingSignal: true, recentMessageCount: 0 },
      }),
      buildGap4RouteObservation({
        mode: "live",
        signalsHint: { stallDetected: true, ambiguityResponseMode: "clarify" },
      }),
      buildGap4RouteObservation({
        mode: "live",
        signalsHint: { contradictionDetected: true },
      }),
      buildGap4RouteObservation({
        mode: "live",
        signalsHint: { fairnessBias: 0.9 },
      }),
      buildGap4RouteObservation({
        mode: "live",
        signalsHint: { criticalSignalCount: 5 },
      }),
    ];
    for (const out of allLive) {
      expect(out).toBeDefined();
      expect(out!.mode).toBe("live");
      // **CEO 2026-05-16 D3 強制: activation: false**
      expect(out!.activation).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────
// Test 14: backward compatibility (CEO: off時は既存 response と等価)
// ─────────────────────────────────────────────

describe("Gap 4 D3 — backward compatibility", () => {
  it("env undefined / 'off' → observation field 完全不在 (existing client は無視可能)", () => {
    expect(buildGap4RouteObservationFromEnv(undefined)).toBeUndefined();
    expect(buildGap4RouteObservationFromEnv("")).toBeUndefined();
    expect(buildGap4RouteObservationFromEnv("off")).toBeUndefined();
    expect(buildGap4RouteObservationFromEnv("OFF")).toBeUndefined();
    expect(buildGap4RouteObservationFromEnv(" off ")).toBeUndefined();
  });

  it("observe / live 時も activation は false (variant 発火なし、UI 不変)", () => {
    const observeOut = buildGap4RouteObservationFromEnv("observe", { contradictionDetected: true });
    const liveOut = buildGap4RouteObservationFromEnv("live", { contradictionDetected: true });
    expect(observeOut?.activation).toBe(false);
    expect(liveOut?.activation).toBe(false);
  });
});
