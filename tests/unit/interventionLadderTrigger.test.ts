/**
 * RO-2 D4+D5 — Intervention Ladder（movement/clarification 2 系統）+ Structured TriggerCondition（partial-eval lattice）。
 *   CEO v0.2: ETA 未供給で **movement 4 系は未生成・ask（clarification）は生成**。recommended≠null で movement 生成・ask 不生成。
 * 正本設計: docs/reality-os-ro2-mobility-control-tower-design.md（RO-2 D4/D5）
 */
import { describe, it, expect } from "vitest";
import {
  planInterventionLadder,
  interventionLadderViolations,
  type PlanInterventionLadderInputV0,
} from "@/lib/plan/realityCore/interventionLadder";
import {
  buildTriggerCondition,
  isV0EvaluatedKind,
  type TriggerEvalContextV0,
} from "@/lib/plan/realityCore/triggerCondition";
import { buildLeaveByLines, unresolvedLeaveByLines } from "@/lib/plan/realityCore/leaveByLines";
import { heuristicAttribute, unknownAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { MomentStateV0 } from "@/lib/plan/dayState/dayStateTypes";

const ARRIVAL = "2026-06-20T14:00:00+09:00";
const prep40 = heuristicAttribute<number>(40, 0.3, ["prep"]);
const RESOLVED = buildLeaveByLines({ arrivalTargetInstant: ARRIVAL, durMin: 42, prepTime: prep40 });
const RESOLVED_NO_PREP = buildLeaveByLines({ arrivalTargetInstant: ARRIVAL, durMin: 42, prepTime: unknownAttribute<number>() });
const DORMANT = unresolvedLeaveByLines();

function moment(over: Partial<MomentStateV0> = {}): MomentStateV0 {
  return {
    nowHHMM: "12:00", timeBucket: "noon", nowSegment: null, nextFixedEventAt: "14:00", minutesUntilNextFixedEvent: 120,
    departureDeadlineHHMM: "12:48", minutesUntilDeparture: 48, eveningSlackRemainingMin: null, timePressure: "low",
    currentMode: "open", interruptibility: "high", receptivity: "on_open", interventionWindow: "open", isNightCheckWindow: false,
    ...over,
  };
}
const ladderInput = (lines = RESOLVED, ms = moment()): PlanInterventionLadderInputV0 => ({ targetNodeId: "ern:2026-06-20:e1", leaveByLines: lines, prepTime: prep40, momentState: ms });

describe("RO-2 D4 dormant: ETA 未供給で movement 4 系は未生成・ask は生成", () => {
  it("#1 recommended=null → movement 未生成・**ask（clarification）のみ生成**", () => {
    const steps = planInterventionLadder(ladderInput(DORMANT));
    expect(steps.map((s) => s.interventionKind)).toEqual(["ask"]);
    expect(steps[0].stepClass).toBe("clarification");
    expect(steps.some((s) => s.stepClass === "movement")).toBe(false);
    expect(interventionLadderViolations(steps, false)).toEqual([]);
  });
  it("#2 ask は eta_source_missing reasonCode + departure_unresolved trigger（偽 deadline でなく聞く）", () => {
    const ask = planInterventionLadder(ladderInput(DORMANT))[0];
    expect(ask.reasonCodes).toContain("eta_source_missing");
    expect(ask.triggerCondition.predicate.kind).toBe("departure_unresolved");
    expect(ask.triggerCondition.evalStatus).toBe("evaluable_now"); // 「組めない」は今わかる
    expect(ask.at).toBeNull(); // 時刻非依存
  });
});

describe("RO-2 D4 recommended≠null で movement 生成・ask 不生成", () => {
  it("#3 prepTime あり → wake/prepare/final_decision/fallback の 4 movement・ask なし", () => {
    const steps = planInterventionLadder(ladderInput(RESOLVED));
    expect(steps.map((s) => s.interventionKind)).toEqual(["wake", "prepare", "final_decision", "fallback"]);
    expect(steps.every((s) => s.stepClass === "movement")).toBe(true);
    expect(steps.some((s) => s.interventionKind === "ask")).toBe(false);
    expect(interventionLadderViolations(steps, true)).toEqual([]);
  });
  it("#4 prepTime null → wake/prepare 未生成（偽生成しない）・final_decision/fallback のみ", () => {
    const steps = planInterventionLadder({ ...ladderInput(RESOLVED_NO_PREP), prepTime: unknownAttribute<number>() });
    expect(steps.map((s) => s.interventionKind)).toEqual(["final_decision", "fallback"]);
    expect(interventionLadderViolations(steps, true)).toEqual([]);
  });
  it("#5 final_decision は ladderDeliveryCeiling=push（上限のみ）+ guarantee_language_forbidden", () => {
    const fd = planInterventionLadder(ladderInput(RESOLVED)).find((s) => s.interventionKind === "final_decision")!;
    expect(fd.ladderDeliveryCeiling).toBe("push");
    expect(fd.reasonCodes).toContain("guarantee_language_forbidden");
  });
  it("#6 全 step に行動導線 messageType（no-action step 禁止）・ceiling は 5 値 DeliveryMode", () => {
    const steps = planInterventionLadder(ladderInput(RESOLVED));
    const FIVE: ReadonlyArray<string> = ["silent", "on_open", "push", "urgent_push", "permission_prompt"];
    for (const s of steps) {
      expect(s.messageType).toBeTruthy();
      expect(FIVE).toContain(s.ladderDeliveryCeiling);
    }
  });
});

describe("RO-2 D5 TriggerCondition partial-eval lattice（window_state 第一級・v0 時刻+window のみ評価）", () => {
  const ctx = (lines = RESOLVED, ms = moment()): TriggerEvalContextV0 => ({ momentState: ms, leaveByLines: lines });

  it("#7 window_state が MomentState.interventionWindow で evaluable_now", () => {
    const t = buildTriggerCondition({ kind: "window_state", window: ["open"] }, ctx());
    expect(t.evalStatus).toBe("evaluable_now");
    const tUnknown = buildTriggerCondition({ kind: "window_state", window: ["open"] }, ctx(RESOLVED, moment({ interventionWindow: "unknown" })));
    expect(tUnknown.evalStatus).toBe("unknown");
  });
  it("#8 time_at_or_after(wakeAt): 解決済→evaluable_now / null→unknown(cannot fire)+missingInputs", () => {
    const ok = buildTriggerCondition({ kind: "time_at_or_after", ref: "wakeAt" }, ctx(RESOLVED));
    expect(ok.evalStatus).toBe("evaluable_now");
    const dormant = buildTriggerCondition({ kind: "time_at_or_after", ref: "wakeAt" }, ctx(DORMANT));
    expect(dormant.evalStatus).toBe("unknown");
    expect(dormant.missingInputs).toContain("eta_source_missing");
  });
  it("#9 state_unmet / location_* は deferred_by_gate のみ（v0 は実評価しない）", () => {
    const prep = buildTriggerCondition({ kind: "state_unmet", state: "prep_not_ready" }, ctx());
    expect(prep.evalStatus).toBe("deferred_by_gate");
    expect(prep.deferredByGate).toContain("prep_state");
    const loc = buildTriggerCondition({ kind: "location_off_route" }, ctx());
    expect(loc.evalStatus).toBe("deferred_by_gate");
    expect(loc.deferredByGate).toContain("location");
    expect(isV0EvaluatedKind("state_unmet")).toBe(false);
    expect(isV0EvaluatedKind("location_off_route")).toBe(false);
    expect(isV0EvaluatedKind("window_state")).toBe(true);
  });
  it("#10 AND join: time(evaluable) ∧ window(evaluable) → evaluable_now / + 位置 deferred → deferred_by_gate", () => {
    const live = buildTriggerCondition({ kind: "and", operands: [{ kind: "time_at_or_after", ref: "hard" }, { kind: "window_state", window: ["closing"] }] }, ctx(RESOLVED));
    expect(live.evalStatus).toBe("evaluable_now");
    const withLoc = buildTriggerCondition({ kind: "and", operands: [{ kind: "time_at_or_after", ref: "hard" }, { kind: "location_off_route" }] }, ctx(RESOLVED));
    expect(withLoc.evalStatus).toBe("deferred_by_gate"); // 位置条件は eval せず deferred（reminder-app でなく状態条件介入）
    expect(withLoc.deferredByGate).toContain("location");
  });
  it("#11 reminder-app trap: 時刻 true でも位置/prep は deferred であり full 条件成立を偽装しない", () => {
    // wake step の trigger は time∧window のみ（位置/prep は含めない）→ deferred を勝手に true 化しない
    const wake = planInterventionLadder(ladderInput(RESOLVED)).find((s) => s.interventionKind === "wake")!;
    const kinds = collectKinds(wake.triggerCondition.predicate);
    // v0 step は state_unmet/location_* を評価ブランチに入れない
    expect(kinds.includes("state_unmet")).toBe(false);
    expect(kinds.includes("location_off_route")).toBe(false);
    expect(kinds.every((k) => isV0EvaluatedKind(k))).toBe(true);
  });
});

type TPKind = import("@/lib/plan/realityCore/triggerCondition").TriggerPredicate["kind"];
function collectKinds(p: import("@/lib/plan/realityCore/triggerCondition").TriggerPredicate): TPKind[] {
  if (p.kind === "and" || p.kind === "or") return p.operands.flatMap(collectKinds);
  return [p.kind];
}
