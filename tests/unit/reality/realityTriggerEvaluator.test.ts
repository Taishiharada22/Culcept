/**
 * R4-2 Trigger Condition Evaluator（pure）— 時刻/予定/状態系のみ・nowMinute null 不発火・位置系 deferred。
 */
import { describe, it, expect } from "vitest";
import { evaluateTriggers } from "@/lib/plan/reality/triggers/trigger-evaluator";
import type { TriggerContext } from "@/lib/plan/reality/triggers/trigger-model";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

function ws(over: Partial<WorldState> = {}): WorldState {
  return { date: "2026-06-20", nowMinute: 600, todaySchedule: [], availableWindows: [], context: null, mobility: null, permissionLevel: 2, ...over };
}
const ctx = (w: WorldState): TriggerContext => ({ worldState: w, emptyDay: null });
const kinds = (w: WorldState) => evaluateTriggers(ctx(w)).map((f) => f.kind);

describe("R4-2 evaluateTriggers", () => {
  it("nowMinute null → 何も発火しない（捏造しない）", () => {
    expect(evaluateTriggers(ctx(ws({ nowMinute: null, todaySchedule: [{ startMinute: 700, endMinute: 760, label: null, protection: null }] })))).toEqual([]);
  });
  it("preflight: 次予定の leaveBy 接近で発火", () => {
    const out = evaluateTriggers(ctx(ws({ nowMinute: 670, todaySchedule: [{ startMinute: 720, endMinute: 780, label: "会議", protection: "hard_external" }] })));
    const pf = out.find((f) => f.kind === "preflight")!;
    expect(pf).toBeDefined();
    expect(pf.coarse).toBe(true); // placeholder buffer
    expect(pf.leaveByMinute).toBe(720 - 45);
  });
  it("empty_day: 朝帯 ∧ 予定なし ∧ 空き窓あり", () => {
    expect(kinds(ws({ nowMinute: 400, todaySchedule: [], availableWindows: [{ startMinute: 540, endMinute: 660, meaning: null }] }))).toContain("empty_day");
  });
  it("empty_day: 予定あり/夜 では発火しない", () => {
    expect(kinds(ws({ nowMinute: 400, todaySchedule: [{ startMinute: 700, endMinute: 760, label: null, protection: null }], availableWindows: [{ startMinute: 540, endMinute: 660, meaning: null }] }))).not.toContain("empty_day");
  });
  it("gap_opportunity: 間もなく開始の十分な空き枠", () => {
    expect(kinds(ws({ nowMinute: 650, availableWindows: [{ startMinute: 660, endMinute: 800, meaning: null }] }))).toContain("gap_opportunity");
    expect(kinds(ws({ nowMinute: 650, availableWindows: [{ startMinute: 660, endMinute: 690, meaning: null }] }))).not.toContain("gap_opportunity"); // 30分<45
  });
  it("wind_down: 遅め夜 ∧ 今日予定あり", () => {
    expect(kinds(ws({ nowMinute: 1250, todaySchedule: [{ startMinute: 700, endMinute: 760, label: null, protection: null }] }))).toContain("wind_down");
  });
  it("位置ベース trigger は出力に現れない（deferred）", () => {
    const all = kinds(ws({ nowMinute: 1250, todaySchedule: [{ startMinute: 700, endMinute: 760, label: null, protection: null }], availableWindows: [{ startMinute: 660, endMinute: 800, meaning: null }] }));
    expect(all).not.toContain("departure");
    expect(all).not.toContain("linger");
    expect(all).not.toContain("off_route");
  });
});
