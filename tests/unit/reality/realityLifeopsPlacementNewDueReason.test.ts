/**
 * INT-4B — 新 DueReason（recurring/habit/relationship）の conservative placement 検証（pure）。
 *   - 既存3種（cycle/deadline/event_prep）の挙動が **不変**であること。
 *   - 新3種が **最も非緊急（urgency 300）・easy lane**（protect/push に昇格しない）であること。
 * 設計: docs/life-ops-new-duereason-conservative-placement.md
 */
import { describe, it, expect } from "vitest";
import { lifeOpsUrgencyRank, lifeOpsLaneOf } from "@/lib/plan/reality/lifeops/lifeops-placement";
import type { LifeOpsCandidate, DueReason } from "@/lib/lifeops/candidate-types";

function cand(dueReason: DueReason): LifeOpsCandidate {
  return {
    category: "groceries",
    menu: null,
    dueReason,
    suggestedWindow: null,
    placeQuery: null,
    permissionLevelHint: "L2",
    riskFlags: [],
  };
}

const cycle: DueReason = { kind: "cycle", elapsedDays: 60, typicalIntervalDays: 30, phase: "well_beyond" };
const deadline: DueReason = { kind: "deadline", daysUntilDeadline: 5, leadDays: 3, overdue: false };
const eventPrep: DueReason = { kind: "event_prep", eventKind: "interview", daysUntilEvent: 3, recommendedLeadDays: 2 };
const recurring: DueReason = { kind: "recurring", daysUntilNext: 7, leadDays: 2, recurrenceLabel: "毎月" };
const habit: DueReason = { kind: "habit", phase: "ease_in", weeklyTarget: 3, doneThisWeek: 1, remaining: 2 };
const relationship: DueReason = {
  kind: "relationship",
  touchpointId: "birthday",
  relationKind: "friend",
  personRef: "opaque-token",
  daysUntil: 10,
  daysSince: null,
  overdue: false,
};

describe("INT-4B placement — 既存3種の挙動不変", () => {
  it("cycle(well_beyond) urgency=200・lane は既存ロジックのまま", () => {
    expect(lifeOpsUrgencyRank(cand(cycle))).toBe(200); // 200 + PHASE_RANK.well_beyond(0)
    // groceries=daily_upkeep → well_beyond は protect（既存挙動）
    expect(lifeOpsLaneOf(cand(cycle))).toBe("protect");
  });
  it("deadline urgency=daysUntil・lane=protect（不変）", () => {
    expect(lifeOpsUrgencyRank(cand(deadline))).toBe(5);
    expect(lifeOpsLaneOf(cand(deadline))).toBe("protect");
  });
  it("event_prep urgency=100+daysUntil・lane=protect(直前)（不変）", () => {
    expect(lifeOpsUrgencyRank(cand(eventPrep))).toBe(103);
    expect(lifeOpsLaneOf(cand({ kind: "event_prep", eventKind: "interview", daysUntilEvent: 1, recommendedLeadDays: 2 }))).toBe("protect");
  });
});

describe("INT-4B placement — 新3種 conservative fallback", () => {
  for (const [name, d] of [["recurring", recurring], ["habit", habit], ["relationship", relationship]] as const) {
    it(`${name}: urgency=300（最も非緊急）・lane=easy（昇格しない）`, () => {
      expect(lifeOpsUrgencyRank(cand(d))).toBe(300);
      expect(lifeOpsLaneOf(cand(d))).toBe("easy");
    });
  }
  it("新3種は既存3種より厳密に非緊急（urgency が大きい）", () => {
    const newMax = Math.min(
      lifeOpsUrgencyRank(cand(recurring)),
      lifeOpsUrgencyRank(cand(habit)),
      lifeOpsUrgencyRank(cand(relationship)),
    );
    for (const d of [cycle, deadline, eventPrep]) {
      expect(lifeOpsUrgencyRank(cand(d))).toBeLessThan(newMax);
    }
  });
});
