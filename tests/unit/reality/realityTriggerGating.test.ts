/**
 * R4-4 Trigger Gating（pure）— silence-by-default・閾値・priority・cap。
 */
import { describe, it, expect } from "vitest";
import { gateTriggers } from "@/lib/plan/reality/triggers/trigger-gating";
import type { FiredTrigger } from "@/lib/plan/reality/triggers/trigger-evaluator";

function f(kind: FiredTrigger["kind"], fireScore: number): FiredTrigger {
  return { kind, fireScore, leadMinutes: null, leaveByMinute: null, windowRef: null, coarse: false };
}

describe("R4-4 gateTriggers — silence-by-default", () => {
  it("閾値未満は全て沈黙（surfaced 空）", () => {
    const r = gateTriggers([f("empty_day", 0.3), f("wind_down", 0.4)]);
    expect(r.surfaced).toHaveLength(0);
    expect(r.silencedCount).toBe(2);
  });
  it("MAX_CONCURRENT=1 で cap・priority 順（preflight 最優先）", () => {
    const r = gateTriggers([f("empty_day", 0.6), f("preflight", 0.6), f("gap_opportunity", 0.6)]);
    expect(r.surfaced).toHaveLength(1);
    expect(r.surfaced[0]!.kind).toBe("preflight"); // 最優先
    expect(r.silencedCount).toBe(2);
  });
  it("同 priority は fireScore 順", () => {
    const r = gateTriggers([f("gap_opportunity", 0.5), f("gap_opportunity", 0.9)], { maxConcurrent: 1 });
    expect(r.surfaced[0]!.fireScore).toBe(0.9);
  });
  it("空入力 → 空 surface・沈黙 0", () => {
    expect(gateTriggers([])).toEqual({ surfaced: [], silencedCount: 0 });
  });
});
