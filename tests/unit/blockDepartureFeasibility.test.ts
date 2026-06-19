/**
 * RO-2 D6 — blockDepartureFeasibility（RO-1 ScheduledWorkBlock × 出発線の read-only 接続口）。
 *   RO-1 型変更ゼロ・TaskPlacementRiskFactor に needs_departure_before_window を additive 追加・block を mutate しない。
 * 正本設計: docs/reality-os-ro2-mobility-control-tower-design.md（RO-2 D6）
 */
import { describe, it, expect } from "vitest";
import { blockDepartureFeasibility } from "@/lib/plan/realityCore/blockDepartureFeasibility";
import { buildScheduledWorkBlock, type ScheduledWorkBlockV0 } from "@/lib/plan/realityCore/scheduledWorkBlock";
import { buildLeaveByLines, unresolvedLeaveByLines } from "@/lib/plan/realityCore/leaveByLines";
import { heuristicAttribute } from "@/lib/plan/realityCore/realityAttribute";

const ARRIVAL = "2026-06-20T14:00:00+09:00";
const prep40 = heuristicAttribute<number>(40, 0.3, ["prep"]);
const RESOLVED = buildLeaveByLines({ arrivalTargetInstant: ARRIVAL, durMin: 42, prepTime: prep40 }); // hard=13:13

const anchored = (start: string, end: string): ScheduledWorkBlockV0 =>
  buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 0, startHHMM: start, endHHMM: end, placementKind: "anchored", anchorId: "anc-1" });
const tentative = (start: string, end: string): ScheduledWorkBlockV0 =>
  buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 0, startHHMM: start, endHHMM: end });

describe("RO-2 D6 blockDepartureFeasibility（read-only）", () => {
  it("#1 anchored ∧ hard(13:13) ≤ block end(13:30) → needs_departure_before_window", () => {
    const r = blockDepartureFeasibility(anchored("13:00", "13:30"), RESOLVED);
    expect(r.evaluable).toBe(true);
    expect(r.needsDepartureBeforeWindow).toBe(true);
    expect(r.riskFactor).toBe("needs_departure_before_window");
  });
  it("#2 hard(13:13) > block end(12:30) → 出発は窓後ゆえ risk なし", () => {
    const r = blockDepartureFeasibility(anchored("12:00", "12:30"), RESOLVED);
    expect(r.evaluable).toBe(true);
    expect(r.needsDepartureBeforeWindow).toBe(false);
    expect(r.riskFactor).toBeNull();
  });
  it("#3 tentative（anchored 化前）→ 評価しない（ern 不在の偽判定を防ぐ）", () => {
    const r = blockDepartureFeasibility(tentative("13:00", "13:30"), RESOLVED);
    expect(r.evaluable).toBe(false);
    expect(r.riskFactor).toBeNull();
  });
  it("#4 hard 未解決（dormant）→ 評価しない", () => {
    const r = blockDepartureFeasibility(anchored("13:00", "13:30"), unresolvedLeaveByLines());
    expect(r.evaluable).toBe(false);
    expect(r.riskFactor).toBeNull();
  });
  it("#5 block を mutate しない（read-only）", () => {
    const b = anchored("13:00", "13:30");
    const snapshot = JSON.stringify(b);
    blockDepartureFeasibility(b, RESOLVED);
    expect(JSON.stringify(b)).toBe(snapshot);
  });
});
