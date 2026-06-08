/**
 * R2-1 Empty-day Input Contract（pure）— 正規化 + memory hint 防御フィルタ。
 *   energy clamp[0,1]・無効 window 除外・permission clamp・usableContexts のみ(ready∧!suppressed∧!excluded)。
 */
import { describe, it, expect } from "vitest";
import {
  effectiveMemoryContexts,
  normalizeEmptyDayInput,
  totalAvailableMinutes,
  type EmptyDayInput,
  type EmptyDayPermissionLevel,
} from "@/lib/plan/reality/empty-day/empty-day-input";
import type { SynthesizedContext } from "@/lib/plan/reality/learning/memory-synthesis";

function sc(value: string, over: Partial<SynthesizedContext> = {}): SynthesizedContext {
  return {
    context: { dimension: "band", value },
    leaning: "toward_declining",
    userVerdict: null,
    suppressed: false,
    confidence: "tentative",
    readiness: "ready",
    recentEpisodes: 1,
    totalEpisodes: 2,
    evidenceCount: 6,
    notes: [],
    ...over,
  };
}
function input(over: Partial<EmptyDayInput> = {}): EmptyDayInput {
  return {
    date: "2026-06-20",
    availableWindows: [{ startMinute: 600, endMinute: 720, meaning: null }],
    hardConstraints: [],
    energy: 0.5,
    weather: null,
    mobility: null,
    memoryUsableContexts: [sc("evening")],
    userIntent: null,
    permissionLevel: 1,
    excludedContexts: [],
    ...over,
  };
}

describe("R2-1 effectiveMemoryContexts — usable のみ", () => {
  it("ready ∧ 非 suppressed ∧ 非 excluded のみ通す", () => {
    const out = effectiveMemoryContexts(
      [sc("evening", { readiness: "ready" }), sc("morning", { readiness: "emerging" }), sc("afternoon", { suppressed: true }), sc("night", { readiness: "ready" })],
      [{ dimension: "band", value: "night" }],
    );
    expect(out.map((c) => c.context.value)).toEqual(["evening"]); // morning(emerging)/afternoon(suppressed)/night(excluded) 除外
  });
});

describe("R2-1 normalizeEmptyDayInput", () => {
  it("energy を [0,1] に clamp・NaN→null", () => {
    expect(normalizeEmptyDayInput(input({ energy: 1.5 })).energy).toBe(1);
    expect(normalizeEmptyDayInput(input({ energy: -0.2 })).energy).toBe(0);
    expect(normalizeEmptyDayInput(input({ energy: Number.NaN })).energy).toBeNull();
    expect(normalizeEmptyDayInput(input({ energy: null })).energy).toBeNull();
  });
  it("無効 window を除外（start<end ∧ 0..1440）", () => {
    const out = normalizeEmptyDayInput(
      input({
        availableWindows: [
          { startMinute: 600, endMinute: 720, meaning: null }, // 有効
          { startMinute: 100, endMinute: 50, meaning: null }, // start>end
          { startMinute: -10, endMinute: 30, meaning: null }, // 範囲外
          { startMinute: 1400, endMinute: 1500, meaning: null }, // >1440
        ],
      }),
    );
    expect(out.availableWindows).toHaveLength(1);
  });
  it("permissionLevel を [0,5] に clamp", () => {
    expect(normalizeEmptyDayInput(input({ permissionLevel: 9 as EmptyDayPermissionLevel })).permissionLevel).toBe(5);
    expect(normalizeEmptyDayInput(input({ permissionLevel: -1 as EmptyDayPermissionLevel })).permissionLevel).toBe(0);
  });
  it("memoryUsableContexts を防御的に絞る（suppressed/emerging/excluded を落とす）", () => {
    const out = normalizeEmptyDayInput(
      input({
        memoryUsableContexts: [sc("evening"), sc("afternoon", { suppressed: true }), sc("morning", { readiness: "emerging" })],
        excludedContexts: [],
      }),
    );
    expect(out.memoryUsableContexts.map((c) => c.context.value)).toEqual(["evening"]);
  });
});

describe("R2-1 totalAvailableMinutes", () => {
  it("空き枠の合計分", () => {
    expect(
      totalAvailableMinutes(input({ availableWindows: [{ startMinute: 0, endMinute: 60, meaning: null }, { startMinute: 120, endMinute: 180, meaning: null }] })),
    ).toBe(120);
  });
});
