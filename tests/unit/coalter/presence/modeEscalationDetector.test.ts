/**
 * Stage 2 L2-h — modeEscalationDetector test
 *
 * plan v0.3 §5.8 Gate:
 *   - 明示 signal で昇格 / 暗黙 signal で昇格しない
 *   - state 優先昇格条件 (S5 + 長期構造化必要)
 */

import { describe, it, expect } from "vitest";

import {
  detectEscalation,
  type EscalationDetectionInput,
} from "@/lib/coalter/presence/modeEscalationDetector";
import type { PresenceSignal } from "@/lib/coalter/presence/types";

const sig = (
  kind: PresenceSignal["kind"],
  meta?: Record<string, unknown>,
): PresenceSignal => ({
  kind,
  strength: kind === "implicit" ? "soft" : "strong",
  detectedAt: 0,
  meta,
});

const baseInput = (
  over: Partial<EscalationDetectionInput> = {},
): EscalationDetectionInput => ({
  currentMode: "normal",
  presenceState: "S5",
  signal: sig("mode_promotion", { target: "daily" }),
  longTermStructuringNeeded: true,
  ...over,
});

describe("L2-h modeEscalationDetector — 4 条件全 true で昇格", () => {
  it("normal + S5 + mode_promotion(daily) + 長期構造化必要 → daily 昇格", () => {
    const r = detectEscalation(baseInput());
    expect(r.target).toBe("daily");
  });

  it("normal + S5 + mode_promotion(travel) + 長期構造化必要 → travel 昇格", () => {
    const r = detectEscalation(
      baseInput({
        signal: sig("mode_promotion", { target: "travel" }),
      }),
    );
    expect(r.target).toBe("travel");
  });
});

describe("L2-h modeEscalationDetector — currentMode != normal で昇格しない", () => {
  it("daily 中 → 昇格しない (通常からのみ)", () => {
    expect(detectEscalation(baseInput({ currentMode: "daily" })).target).toBeNull();
  });

  it("travel 中 → 昇格しない", () => {
    expect(detectEscalation(baseInput({ currentMode: "travel" })).target).toBeNull();
  });
});

describe("L2-h modeEscalationDetector — presenceState != S5 で昇格しない (§4.4)", () => {
  it("S0/S1/S2/S3/S4/S6/S7/S8 → 昇格しない", () => {
    for (const state of ["S0", "S1", "S2", "S3", "S4", "S6", "S7", "S8"] as const) {
      expect(
        detectEscalation(baseInput({ presenceState: state })).target,
      ).toBeNull();
    }
  });
});

describe("L2-h modeEscalationDetector — §11.5 暗黙 signal で昇格しない", () => {
  it("implicit signal → 昇格しない", () => {
    expect(
      detectEscalation(baseInput({ signal: sig("implicit") })).target,
    ).toBeNull();
  });

  it("critical signal → 昇格しない (緊急介入は urgent layer 経由、mode 昇格 trigger ではない)", () => {
    expect(
      detectEscalation(baseInput({ signal: sig("critical") })).target,
    ).toBeNull();
  });

  it("explicit signal → 昇格しない (explicit は手動切替経路)", () => {
    expect(
      detectEscalation(baseInput({ signal: sig("explicit") })).target,
    ).toBeNull();
  });

  it("manual_restart signal → 昇格しない", () => {
    expect(
      detectEscalation(baseInput({ signal: sig("manual_restart") })).target,
    ).toBeNull();
  });
});

describe("L2-h modeEscalationDetector — longTermStructuringNeeded=false で昇格しない", () => {
  it("4 条件のうち長期構造化のみ false → 昇格しない", () => {
    expect(
      detectEscalation(baseInput({ longTermStructuringNeeded: false })).target,
    ).toBeNull();
  });
});

describe("L2-h modeEscalationDetector — meta target 不在 / 不正値で昇格しない", () => {
  it("mode_promotion signal だが meta.target 未指定 → null (adapter 不整合)", () => {
    expect(
      detectEscalation(baseInput({ signal: sig("mode_promotion", {}) })).target,
    ).toBeNull();
  });

  it("meta.target が不正値 (例: 'normal') → null", () => {
    expect(
      detectEscalation(
        baseInput({ signal: sig("mode_promotion", { target: "normal" }) }),
      ).target,
    ).toBeNull();
  });
});

describe("L2-h modeEscalationDetector — reason の検証 (debug log 用)", () => {
  it("成功時の reason に target が含まれる", () => {
    const r = detectEscalation(baseInput());
    expect(r.reason).toContain("daily");
  });

  it("currentMode 不一致時の reason に currentMode が含まれる", () => {
    const r = detectEscalation(baseInput({ currentMode: "travel" }));
    expect(r.reason).toContain("currentMode");
  });

  it("§11.5 違反時の reason に kind が含まれる", () => {
    const r = detectEscalation(baseInput({ signal: sig("implicit") }));
    expect(r.reason).toContain("implicit");
  });
});
