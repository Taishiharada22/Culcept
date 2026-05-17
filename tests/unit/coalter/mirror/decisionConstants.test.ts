/**
 * CoAlter AOO Phase B B-4a — Decision constants invariant test
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §3 / §4 / §10.2
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2 / §3
 *   - 実装: lib/coalter/mirror/decisionConstants.ts
 *
 * test 範囲:
 *   - threshold const 値の正確性 (B-0 plan §3.3 / §4.2 / §10.2 と一致)
 *   - reason enum (MIRROR_STAY_SILENT_REASON):
 *     - 17 値存在 (Observe 5 + Worth 4 + Safe 4 + ERV 1 + Counterfactual 3)
 *     - 値重複なし
 *     - snake_case 命名規則 (^[a-z_]+$)
 *     - 期待される全 reason 値が含まれる
 *   - 型レベル literal union narrowing (MirrorStaySilentReason)
 */

import { describe, it, expect } from "vitest";
import {
  SPEAK_THRESHOLD_BASE,
  COUNTERFACTUAL_ERV_BAR,
  WORTH_NOVELTY_MIN,
  WORTH_TIME_SINCE_MIN_TURNS,
  MIRROR_STAY_SILENT_REASON,
  type MirrorStaySilentReason,
} from "@/lib/coalter/mirror/decisionConstants";

describe("B-4a decisionConstants — threshold values (B-0 plan §3.3 / §4.2 / §10.2)", () => {
  it("SPEAK_THRESHOLD_BASE === 0.75 (B-0 plan §3.3 CEO 確定)", () => {
    expect(SPEAK_THRESHOLD_BASE).toBe(0.75);
  });

  it("COUNTERFACTUAL_ERV_BAR === 0.85 (B-0 plan §10.2 CEO 確定)", () => {
    expect(COUNTERFACTUAL_ERV_BAR).toBe(0.85);
  });

  it("COUNTERFACTUAL_ERV_BAR > SPEAK_THRESHOLD_BASE (defense-in-depth)", () => {
    expect(COUNTERFACTUAL_ERV_BAR).toBeGreaterThan(SPEAK_THRESHOLD_BASE);
  });

  it("WORTH_NOVELTY_MIN === 0.5 (B-0 plan §4.2)", () => {
    expect(WORTH_NOVELTY_MIN).toBe(0.5);
  });

  it("WORTH_TIME_SINCE_MIN_TURNS === 5 (B-0 plan §2.3 / §4.2)", () => {
    expect(WORTH_TIME_SINCE_MIN_TURNS).toBe(5);
  });

  it("all numeric thresholds within sensible bounds", () => {
    // ERV-based thresholds: (0, 1]
    expect(SPEAK_THRESHOLD_BASE).toBeGreaterThan(0);
    expect(SPEAK_THRESHOLD_BASE).toBeLessThanOrEqual(1);
    expect(COUNTERFACTUAL_ERV_BAR).toBeGreaterThan(0);
    expect(COUNTERFACTUAL_ERV_BAR).toBeLessThanOrEqual(1);
    // novelty: [0, 1]
    expect(WORTH_NOVELTY_MIN).toBeGreaterThanOrEqual(0);
    expect(WORTH_NOVELTY_MIN).toBeLessThanOrEqual(1);
    // turn count: non-negative integer
    expect(WORTH_TIME_SINCE_MIN_TURNS).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(WORTH_TIME_SINCE_MIN_TURNS)).toBe(true);
  });
});

describe("B-4a MIRROR_STAY_SILENT_REASON — enum invariant", () => {
  const allReasons = Object.values(MIRROR_STAY_SILENT_REASON);

  it("17 reason values total (Observe 5 + Worth 4 + Safe 4 + ERV 1 + Counterfactual 3)", () => {
    expect(allReasons.length).toBe(17);
  });

  it("all reason values are non-empty strings", () => {
    for (const value of allReasons) {
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(0);
    }
  });

  it("reason values are unique (no duplicates)", () => {
    const uniqueValues = new Set(allReasons);
    expect(uniqueValues.size).toBe(allReasons.length);
  });

  it("reason values follow snake_case convention (^[a-zA-Z_]+$, lowercase + camelCase tail)", () => {
    // observe_gate_unknown_modeContext 等で camelCase が一部含まれるため、
    // 厳密 snake_case ではなく lowercase + 数字なしの英字 + _ + (camelCase 識別子部分許可)
    for (const value of allReasons) {
      expect(value).toMatch(/^[a-zA-Z_]+$/);
      // 必ず小文字始まり
      expect((value as string)[0]).toMatch(/[a-z]/);
    }
  });

  it("all expected reason values present (exhaustive list)", () => {
    const expected = [
      // Observe Gate (5)
      "observe_gate_unknown_modeContext",
      "observe_gate_unknown_alignment",
      "observe_gate_unknown_uncertainty",
      "observe_gate_unknown_silence_budget",
      "observe_gate_unknown_pattern_category",
      // Worth Gate (4)
      "worth_gate_silence_budget_high",
      "worth_gate_novelty_low",
      "worth_gate_conversation_phase_unsuitable",
      "worth_gate_time_since_last_speak_too_recent",
      // Safe Gate (4)
      "safe_gate_safety_concern",
      "safe_gate_rupture_high",
      "safe_gate_uncertainty_high",
      "safe_gate_user_override_sleep",
      // ERV (1)
      "erv_below_threshold",
      // Counterfactual (3)
      "counterfactual_user_misses_small_observation",
      "counterfactual_user_takes_harmful_action",
      "counterfactual_no_difference",
    ];
    expect([...allReasons].sort()).toEqual([...expected].sort());
  });

  it("expected key naming convention (UPPER_SNAKE_CASE key → snake_case value)", () => {
    const keys = Object.keys(MIRROR_STAY_SILENT_REASON);
    expect(keys.length).toBe(17);
    for (const key of keys) {
      expect(key).toMatch(/^[A-Z_]+$/);
    }
  });

  it("specific Observe Gate reason values", () => {
    expect(MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_MODE_CONTEXT).toBe(
      "observe_gate_unknown_modeContext",
    );
    expect(MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_ALIGNMENT).toBe(
      "observe_gate_unknown_alignment",
    );
    expect(MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_PATTERN_CATEGORY).toBe(
      "observe_gate_unknown_pattern_category",
    );
  });

  it("specific Safe Gate reason values", () => {
    expect(MIRROR_STAY_SILENT_REASON.SAFE_SAFETY_CONCERN).toBe("safe_gate_safety_concern");
    expect(MIRROR_STAY_SILENT_REASON.SAFE_RUPTURE_HIGH).toBe("safe_gate_rupture_high");
    expect(MIRROR_STAY_SILENT_REASON.SAFE_USER_OVERRIDE_SLEEP).toBe(
      "safe_gate_user_override_sleep",
    );
  });

  it("specific Counterfactual reason values", () => {
    expect(MIRROR_STAY_SILENT_REASON.COUNTERFACTUAL_USER_MISSES_SMALL_OBSERVATION).toBe(
      "counterfactual_user_misses_small_observation",
    );
    expect(MIRROR_STAY_SILENT_REASON.COUNTERFACTUAL_USER_TAKES_HARMFUL_ACTION).toBe(
      "counterfactual_user_takes_harmful_action",
    );
    expect(MIRROR_STAY_SILENT_REASON.COUNTERFACTUAL_NO_DIFFERENCE).toBe(
      "counterfactual_no_difference",
    );
  });
});

describe("B-4a MirrorStaySilentReason — type-level literal union", () => {
  it("type narrowing accepts all enum values", () => {
    // 全 enum 値が MirrorStaySilentReason 型として代入可能であることを compile-time + runtime で確認
    const samples: MirrorStaySilentReason[] = [
      MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_MODE_CONTEXT,
      MIRROR_STAY_SILENT_REASON.WORTH_SILENCE_BUDGET_HIGH,
      MIRROR_STAY_SILENT_REASON.SAFE_SAFETY_CONCERN,
      MIRROR_STAY_SILENT_REASON.ERV_BELOW_THRESHOLD,
      MIRROR_STAY_SILENT_REASON.COUNTERFACTUAL_NO_DIFFERENCE,
    ];
    expect(samples.length).toBe(5);
    for (const s of samples) {
      expect(typeof s).toBe("string");
    }
  });

  it("type derives from MIRROR_STAY_SILENT_REASON values (single source of truth)", () => {
    // MIRROR_STAY_SILENT_REASON の全値が MirrorStaySilentReason 型として narrow 可能
    // (typeof X[keyof typeof X] パターンの runtime 確認)
    for (const value of Object.values(MIRROR_STAY_SILENT_REASON)) {
      const reason: MirrorStaySilentReason = value;
      expect(typeof reason).toBe("string");
    }
  });
});

describe("B-4a decisionConstants — module purity (no side effects on import)", () => {
  it("re-importing module yields equal const reference (idempotent)", async () => {
    const m1 = await import("@/lib/coalter/mirror/decisionConstants");
    const m2 = await import("@/lib/coalter/mirror/decisionConstants");
    expect(m1.SPEAK_THRESHOLD_BASE).toBe(m2.SPEAK_THRESHOLD_BASE);
    expect(m1.MIRROR_STAY_SILENT_REASON).toBe(m2.MIRROR_STAY_SILENT_REASON);
  });
});
