/**
 * RO-1 D3 — TaskPlacementFeasibility（Energy 参加の入口）。
 *   energyLevel/focusReserve/emotionalReserve/recoveryNeed を読み energyFit/cognitiveLoadFit/emotionalFit/
 *   deadlineFit/splitFit + 閉じた riskFactors を返す。pure・injected fixtures のみ。
 * 正本設計: docs/reality-os-ro1-task-work-foundation-design.md（RO-1 D3）
 */
import { describe, it, expect } from "vitest";
import {
  evaluateTaskPlacementFeasibility,
  type TaskPlacementFeasibilityInputV0,
  type TaskPlacementRiskFactor,
} from "@/lib/plan/realityCore/taskPlacementFeasibility";
import { buildTaskRealityNode, type TaskRealityNodeInputV0 } from "@/lib/plan/realityCore/taskRealityNode";
import { inferredAttribute, heuristicAttribute, unknownAttribute, realityAttributeViolations } from "@/lib/plan/realityCore/realityAttribute";
import type { ChangeEligibilityValue } from "@/lib/plan/realityCore/eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";
import type { MomentStateV0, EnergyLevelValue, ReserveLevel, RecoveryNeedLevel } from "@/lib/plan/dayState/dayStateTypes";
import type { ConfidentValue } from "@/lib/stargazer/alterHomeAdapter";
import type { TimeBucket } from "@/lib/plan/dayGraph/dayGraphTypes";

const CE: ChangeEligibilityValue = {
  canSuggestMove: true, canSuggestShorten: false, canSuggestSkip: false, canSuggestDelegate: false,
  requiresConfirmation: false, requiresExternalCommunication: false, blockedReason: null,
};

function task(over: Partial<TaskRealityNodeInputV0> = {}) {
  return buildTaskRealityNode({
    taskId: "t1", title: "作業",
    deadline: inferredAttribute("2026-06-20T23:00:00", 0.7, ["d"], { source: "known_from_user", status: "confirmed" }),
    estimatedDuration: heuristicAttribute(60, 0.3, ["dur"]),
    cognitiveLoad: heuristicAttribute(0.7, 0.3, ["load"]),
    canSplit: inferredAttribute(true, 0.6, ["split"]),
    canMove: inferredAttribute(true, 0.6, ["move"]),
    changeEligibility: inferredAttribute(CE, 0.6, ["gov"]),
    permissionLevel: inferredAttribute<PermissionLevel>(2, 0.6, ["gov"]),
    ...over,
  });
}

const cv = <T>(value: T, source: "inferred" | "unknown" = "inferred", confidence = 0.6): ConfidentValue<T> => ({ value, confidence, source });

function moment(over: Partial<MomentStateV0> = {}): MomentStateV0 {
  return {
    nowHHMM: "20:00", timeBucket: "night", nowSegment: null, nextFixedEventAt: null, minutesUntilNextFixedEvent: null,
    departureDeadlineHHMM: null, minutesUntilDeparture: null, eveningSlackRemainingMin: 60, timePressure: "low",
    currentMode: "open", interruptibility: "high", receptivity: "on_open", interventionWindow: "open", isNightCheckWindow: true,
    ...over,
  };
}

function input(over: Partial<TaskPlacementFeasibilityInputV0> = {}): TaskPlacementFeasibilityInputV0 {
  return {
    task: task(),
    candidateWindow: { startHHMM: "20:30", endHHMM: "22:00", timeBucket: "night" as TimeBucket },
    energy: {
      energyLevel: cv<EnergyLevelValue>("medium"),
      focusReserve: cv<ReserveLevel>("medium"),
      emotionalReserve: cv<ReserveLevel>("medium"),
      recoveryNeed: cv<RecoveryNeedLevel>("medium"),
    },
    momentState: moment(),
    ...over,
  };
}

const ALLOWED_RISK: ReadonlyArray<TaskPlacementRiskFactor> = [
  "evening_high_load", "low_focus_reserve", "low_emotional_reserve", "deadline_tight", "window_too_short",
  "cannot_split", "high_cognitive_load", "recovery_need_high", "missing_duration", "missing_deadline",
];

describe("RO-1 D3 TaskPlacementFeasibility", () => {
  it("#1 5 fit を返し全て INV-RC1 適合（heuristic ≤0.35）", () => {
    const r = evaluateTaskPlacementFeasibility(input());
    for (const [k, a] of Object.entries({ energyFit: r.energyFit, cognitiveLoadFit: r.cognitiveLoadFit, emotionalFit: r.emotionalFit, deadlineFit: r.deadlineFit, splitFit: r.splitFit })) {
      expect(realityAttributeViolations(k, a)).toEqual([]);
      if (a.status === "heuristic") expect(a.confidence).toBeLessThanOrEqual(0.35);
    }
  });

  it("#2 emotionalReserve を読み emotionalFit を返す（CEO v0.1・対人作業の余力）", () => {
    const high = evaluateTaskPlacementFeasibility(input({ energy: { energyLevel: cv<EnergyLevelValue>("medium"), focusReserve: cv<ReserveLevel>("medium"), emotionalReserve: cv<ReserveLevel>("high"), recoveryNeed: cv<RecoveryNeedLevel>("low") } }));
    expect(high.emotionalFit.value).toBe("high");
    const low = evaluateTaskPlacementFeasibility(input({ energy: { energyLevel: cv<EnergyLevelValue>("medium"), focusReserve: cv<ReserveLevel>("medium"), emotionalReserve: cv<ReserveLevel>("low"), recoveryNeed: cv<RecoveryNeedLevel>("low") } }));
    expect(low.emotionalFit.value).toBe("low");
    expect(low.riskFactors).toContain("low_emotional_reserve"); // 「体力はあるが人と話す余力がない」
  });

  it("#3 夜 × 高 cognitiveLoad → cognitiveLoadFit 低 + evening_high_load risk", () => {
    const r = evaluateTaskPlacementFeasibility(input({ task: task({ cognitiveLoad: heuristicAttribute(0.8, 0.3, ["load"]) }), candidateWindow: { startHHMM: "20:30", endHHMM: "22:00", timeBucket: "night" } }));
    expect(r.cognitiveLoadFit.value).toBe("low");
    expect(r.riskFactors).toContain("evening_high_load");
    expect(r.riskFactors).toContain("high_cognitive_load");
  });

  it("#4 riskFactors は閉じた union のみ（自由文混入なし）", () => {
    const lowEnergy = evaluateTaskPlacementFeasibility(input({
      task: task({ deadline: unknownAttribute<string>(), estimatedDuration: unknownAttribute<number>() }),
      energy: { energyLevel: cv<EnergyLevelValue>("depleted"), focusReserve: cv<ReserveLevel>("low"), emotionalReserve: cv<ReserveLevel>("low"), recoveryNeed: cv<RecoveryNeedLevel>("high") },
    }));
    for (const rf of lowEnergy.riskFactors) expect(ALLOWED_RISK).toContain(rf);
    expect(lowEnergy.riskFactors).toContain("missing_deadline");
    expect(lowEnergy.riskFactors).toContain("missing_duration");
    expect(lowEnergy.riskFactors).toContain("recovery_need_high");
    expect(lowEnergy.riskFactors).toContain("low_focus_reserve");
  });

  it("#5 入力推定 unknown の fit は unknownAttribute（捏造しない）", () => {
    const r = evaluateTaskPlacementFeasibility(input({ energy: { energyLevel: cv<EnergyLevelValue>("medium", "unknown"), focusReserve: cv<ReserveLevel>("medium"), emotionalReserve: cv<ReserveLevel>("medium", "unknown"), recoveryNeed: cv<RecoveryNeedLevel>("medium") } }));
    expect(r.energyFit.status).toBe("unknown");
    expect(r.energyFit.value).toBeNull();
    expect(r.emotionalFit.status).toBe("unknown");
  });

  it("#6 deadlineFit: window が deadline 内 → high / 超過 → low + deadline_tight", () => {
    const inTime = evaluateTaskPlacementFeasibility(input({ candidateWindow: { startHHMM: "20:30", endHHMM: "22:00", timeBucket: "night" }, task: task({ deadline: inferredAttribute("2026-06-20T23:00:00", 0.7, ["d"], { status: "confirmed" }) }) }));
    expect(inTime.deadlineFit.value).toBe("high");
    const over = evaluateTaskPlacementFeasibility(input({ candidateWindow: { startHHMM: "20:30", endHHMM: "22:00", timeBucket: "night" }, task: task({ deadline: inferredAttribute("2026-06-20T21:00:00", 0.7, ["d"], { status: "confirmed" }) }) }));
    expect(over.deadlineFit.value).toBe("low");
    expect(over.riskFactors).toContain("deadline_tight");
  });

  it("#7 splitFit: window<見積 ∧ canSplit ∧ minimalProgress → medium（分割で前進）/ canSplit=false → low + cannot_split", () => {
    const split = evaluateTaskPlacementFeasibility(input({
      candidateWindow: { startHHMM: "20:30", endHHMM: "21:00", timeBucket: "night" }, // 30 分 < 60
      task: task({ canSplit: inferredAttribute(true, 0.6, ["s"]), minimalProgress: inferredAttribute("構成だけ", 0.6, ["mp"]) }),
    }));
    expect(split.splitFit.value).toBe("medium");
    expect(split.riskFactors).toContain("window_too_short");
    const noSplit = evaluateTaskPlacementFeasibility(input({
      candidateWindow: { startHHMM: "20:30", endHHMM: "21:00", timeBucket: "night" },
      task: task({ canSplit: inferredAttribute(false, 0.6, ["s"]) }),
    }));
    expect(noSplit.splitFit.value).toBe("low");
    expect(noSplit.riskFactors).toContain("cannot_split");
  });

  it("#8 新規 energy 観測をしない（出力は入力 estimates の derived のみ・confidence は入力以下）", () => {
    const r = evaluateTaskPlacementFeasibility(input({ energy: { energyLevel: cv<EnergyLevelValue>("high", "inferred", 0.2), focusReserve: cv<ReserveLevel>("high"), emotionalReserve: cv<ReserveLevel>("high"), recoveryNeed: cv<RecoveryNeedLevel>("low") } }));
    expect(r.energyFit.confidence).toBeLessThanOrEqual(0.3); // 入力 0.2 と heuristic cap の小さい方以下
  });
});
