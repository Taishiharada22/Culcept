/**
 * R4-5 Trigger Fixture Smoke — WorldState → evaluate → content + gate end-to-end。
 *   empty-day朝/preflight接近/nowMinute null沈黙/複数→cap1/位置系不発火/欠損signal。pure のみ。
 */
import { describe, it, expect } from "vitest";
import { evaluateTriggers } from "@/lib/plan/reality/triggers/trigger-evaluator";
import { buildAllTriggerContent } from "@/lib/plan/reality/triggers/trigger-content";
import { gateTriggers } from "@/lib/plan/reality/triggers/trigger-gating";
import type { TriggerContext } from "@/lib/plan/reality/triggers/trigger-model";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { EmptyDayProposalSet } from "@/lib/plan/reality/empty-day/empty-day-generator";

function ws(over: Partial<WorldState> = {}): WorldState {
  return { date: "2026-06-20", nowMinute: 600, todaySchedule: [], availableWindows: [], context: null, mobility: null, permissionLevel: 2, ...over };
}
const ctx = (w: WorldState, emptyDay: EmptyDayProposalSet | null = null): TriggerContext => ({ worldState: w, emptyDay });
function run(w: WorldState, emptyDay: EmptyDayProposalSet | null = null) {
  const c = ctx(w, emptyDay);
  const fired = evaluateTriggers(c);
  return { fired, content: buildAllTriggerContent(fired, c), gate: gateTriggers(fired) };
}

describe("R4-5 smoke — end-to-end", () => {
  it("空白の朝: empty_day が surface・content に組み方", () => {
    const set: EmptyDayProposalSet = { date: "2026-06-20", proposals: [], recommended: "protect" };
    const { gate, content } = run(ws({ nowMinute: 400, availableWindows: [{ startMinute: 540, endMinute: 720, meaning: null }] }), set);
    expect(gate.surfaced.map((f) => f.kind)).toContain("empty_day");
    expect(content.some((m) => m.headline.includes("予定が空いています"))).toBe(true);
  });
  it("予定接近: preflight が surface（高 fireScore）", () => {
    const { gate } = run(ws({ nowMinute: 672, todaySchedule: [{ startMinute: 720, endMinute: 780, label: "会議", protection: "hard_external" }] }));
    expect(gate.surfaced.map((f) => f.kind)).toContain("preflight");
  });
  it("nowMinute null: 全沈黙（捏造発火しない）", () => {
    const { fired, gate } = run(ws({ nowMinute: null, todaySchedule: [{ startMinute: 720, endMinute: 780, label: null, protection: null }] }));
    expect(fired).toHaveLength(0);
    expect(gate.surfaced).toHaveLength(0);
  });
  it("複数発火: silence-by-default で cap 1・残りは沈黙カウント", () => {
    // 夜帯 ∧ 予定あり(wind_down) ∧ 進行中の空き枠(gap)
    const { fired, gate } = run(ws({ nowMinute: 1250, todaySchedule: [{ startMinute: 700, endMinute: 760, label: null, protection: null }], availableWindows: [{ startMinute: 1200, endMinute: 1380, meaning: null }] }));
    expect(fired.length).toBeGreaterThanOrEqual(2);
    expect(gate.surfaced.length).toBeLessThanOrEqual(1);
    expect(gate.silencedCount).toBe(fired.length - gate.surfaced.length);
  });
  it("位置ベース trigger は end-to-end でも一切出ない", () => {
    const { fired } = run(ws({ nowMinute: 1250, todaySchedule: [{ startMinute: 700, endMinute: 760, label: null, protection: null }] }));
    expect(fired.every((f) => ["preflight", "empty_day", "gap_opportunity", "wind_down"].includes(f.kind))).toBe(true);
  });
  it("何も条件を満たさない静かな時間帯: 完全沈黙", () => {
    const { gate } = run(ws({ nowMinute: 800, todaySchedule: [], availableWindows: [] })); // 昼・予定も窓もなし
    expect(gate.surfaced).toHaveLength(0);
  });
});
