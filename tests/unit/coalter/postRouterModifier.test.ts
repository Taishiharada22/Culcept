/**
 * CoAlter Phase 2 — postRouterModifier unit test (2026-04-19 v0.3 gate 6.B)
 *
 * 固定する契約:
 *  - emotion_heat mid → { softenClosing: true, maxQuestion: 0 }
 *  - emotion_heat low → { softenClosing: false, maxQuestion: 1 }
 *  - emotion_heat high（来る想定はないが） → low と同扱い
 *  - 関数は mode を触らない（入力にも出力にも mode が存在しないことで型レベル保証）
 */

import { describe, it, expect } from "vitest";

import { deriveToneModifier } from "@/lib/coalter/postRouterModifier";
import type { EmotionHeat } from "@/lib/coalter/types";

describe("deriveToneModifier — emotion_heat mid で questionBudget=0", () => {
  it("mid → maxQuestion=0 かつ softenClosing=true", () => {
    const m: EmotionHeat = { severity: "mid", reason: null };
    expect(deriveToneModifier(m)).toEqual({ softenClosing: true, maxQuestion: 0 });
  });
});

describe("deriveToneModifier — 通常系", () => {
  it("low → maxQuestion=1 かつ softenClosing=false", () => {
    const m: EmotionHeat = { severity: "low", reason: null };
    expect(deriveToneModifier(m)).toEqual({ softenClosing: false, maxQuestion: 1 });
  });

  it("high（Pre-gate で弾かれる前提だが） → 寛容側 low と同扱い", () => {
    const m: EmotionHeat = { severity: "high", reason: "test" };
    expect(deriveToneModifier(m)).toEqual({ softenClosing: false, maxQuestion: 1 });
  });
});

describe("deriveToneModifier — 純関数性（入力不変、同一入力同一出力）", () => {
  it("同一入力なら同一出力", () => {
    const m: EmotionHeat = { severity: "mid", reason: null };
    expect(deriveToneModifier(m)).toEqual(deriveToneModifier(m));
  });

  it("入力を変更しない", () => {
    const m: EmotionHeat = { severity: "mid", reason: "x" };
    const snapshot = JSON.parse(JSON.stringify(m)) as unknown;
    deriveToneModifier(m);
    expect(JSON.parse(JSON.stringify(m))).toEqual(snapshot);
  });
});
