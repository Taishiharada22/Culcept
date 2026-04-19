/**
 * CoAlter Phase 2 — preRouterGate unit test (2026-04-19 v0.3 gate 6.A)
 *
 * 目的:
 *   起動可否（consent）と安全ブロック（emotion_heat high）の二値判定を固定する。
 *   mid / low / undefined は通す（mid は Post-router modifier の責務）。
 */

import { describe, it, expect } from "vitest";

import { evaluatePreRouterGate } from "@/lib/coalter/preRouterGate";
import type { EmotionHeat } from "@/lib/coalter/types";

const low: EmotionHeat = { severity: "low", reason: null };
const mid: EmotionHeat = { severity: "mid", reason: null };
const high: EmotionHeat = { severity: "high", reason: "control_signal" };

describe("evaluatePreRouterGate — 通過", () => {
  it("active + low → pass", () => {
    expect(evaluatePreRouterGate({ consent: "active", emotionHeat: low })).toEqual({
      pass: true,
    });
  });

  it("active + mid → pass（mid は Post-modifier 扱い、ここでは止めない）", () => {
    expect(evaluatePreRouterGate({ consent: "active", emotionHeat: mid })).toEqual({
      pass: true,
    });
  });
});

describe("evaluatePreRouterGate — 同意なし", () => {
  it("completed は通さない", () => {
    const result = evaluatePreRouterGate({ consent: "completed", emotionHeat: low });
    expect(result).toEqual({ pass: false, reason: "consent_not_active" });
  });

  it("cancelled は通さない", () => {
    const result = evaluatePreRouterGate({ consent: "cancelled", emotionHeat: low });
    expect(result).toEqual({ pass: false, reason: "consent_not_active" });
  });
});

describe("evaluatePreRouterGate — 安全ブロック (high)", () => {
  it("active + high → blocked with emotion_heat_high reason", () => {
    const result = evaluatePreRouterGate({ consent: "active", emotionHeat: high });
    expect(result).toEqual({
      pass: false,
      reason: "emotion_heat_high",
      emotionReason: "control_signal",
    });
  });

  it("emotion_heat.reason === null でも blocked", () => {
    const result = evaluatePreRouterGate({
      consent: "active",
      emotionHeat: { severity: "high", reason: null },
    });
    expect(result).toEqual({
      pass: false,
      reason: "emotion_heat_high",
      emotionReason: null,
    });
  });
});

describe("evaluatePreRouterGate — 優先順位（consent が先）", () => {
  it("consent 非 active かつ emotion_heat high でも reason は consent_not_active", () => {
    const result = evaluatePreRouterGate({
      consent: "completed",
      emotionHeat: high,
    });
    expect(result).toEqual({ pass: false, reason: "consent_not_active" });
  });
});
