import { describe, it, expect } from "vitest";
import {
  evaluateReceptivityGate,
  rankDeliveryMode,
  type ReceptivityInput,
} from "@/lib/plan/reality/receptivity-gate";

// 既定: 完全に push 可能な高 stakes・行動可能・高 confidence
function inp(p: Partial<ReceptivityInput> = {}): ReceptivityInput {
  return {
    stakes: "high",
    actionable: true,
    allowedActions: ["one_tap_confirm"],
    confidence: 0.8,
    sourceTraceStrength: 0.8,
    receptivity: 0.7,
    timeCritical: false,
    pushPermission: true,
    budget: { remaining: 5, recentDismissals: 0, trust: 0.9 },
    ...p,
  };
}

const mode = (p: Partial<ReceptivityInput> = {}) => evaluateReceptivityGate(inp(p)).mode;

describe("reality/receptivity-gate — 12 required scenarios", () => {
  it("1. high stakes + actionable + high confidence → push (urgent if time-critical)", () => {
    expect(mode()).toBe("push");
    expect(mode({ timeCritical: true })).toBe("urgent_push");
  });

  it("2. high stakes + no action → NOT push (INV-1)", () => {
    const m = mode({ actionable: false, allowedActions: [] });
    expect(["push", "urgent_push"]).not.toContain(m);
    expect(evaluateReceptivityGate(inp({ actionable: false, allowedActions: [] })).reasons).toContain("low_actionability");
  });

  it("3. low stakes + low confidence → silent/on_open", () => {
    expect(["silent", "on_open"]).toContain(mode({ stakes: "low", confidence: 0.3 }));
  });

  it("4. Daily Plan Quality passed + morning + 1tap + permission + budget + receptivity → morning push (highStakes 不要)", () => {
    const d = evaluateReceptivityGate(
      inp({ stakes: "low", isMorningDailyPlan: true, dailyPlanQualityPassed: true, allowedActions: ["one_tap_confirm", "adjust"], receptivity: 0.6 })
    );
    expect(d.mode).toBe("push");
    expect(d.reasons).toContain("daily_plan_quality_passed");
  });

  it("5. Daily Plan with weak source trace → demote to on_open", () => {
    const d = evaluateReceptivityGate(inp({ stakes: "low", isMorningDailyPlan: true, dailyPlanQualityPassed: true, sourceTraceStrength: 0.2 }));
    expect(d.mode).toBe("on_open");
    expect(d.reasons).toContain("weak_source_trace");
  });

  it("6. no source trace → push 不可", () => {
    expect(["push", "urgent_push"]).not.toContain(mode({ sourceTraceStrength: 0 }));
  });

  it("7. no push permission + high stakes + request_permission action → permission_prompt", () => {
    expect(mode({ pushPermission: false, allowedActions: ["one_tap_confirm", "request_permission"] })).toBe("permission_prompt");
    // request_permission アクションが無ければ on_open
    expect(mode({ pushPermission: false, allowedActions: ["one_tap_confirm"] })).toBe("on_open");
  });

  it("8. budget exhausted → on_open/silent", () => {
    expect(["on_open", "silent"]).toContain(mode({ budget: { remaining: 0, recentDismissals: 0, trust: 0.9 } }));
  });

  it("9. repeated ignored → push 抑制", () => {
    const d = evaluateReceptivityGate(inp({ budget: { remaining: 5, recentDismissals: 3, trust: 0.9 } }));
    expect(["push", "urgent_push"]).not.toContain(d.mode);
    expect(d.reasons).toContain("repeated_ignored");
  });

  it("10. Final Check + not arrived + action → push/urgent_push", () => {
    const d = evaluateReceptivityGate(inp({ isFinalCheck: true, timeCritical: true, allowedActions: ["mark_arrived", "leave_now"] }));
    expect(["push", "urgent_push"]).toContain(d.mode);
    expect(d.reasons).toContain("final_check_required");
  });

  it("11. degradation reflected: no_network blocks push; no_location does not; low_battery suppresses low-stakes", () => {
    expect(["push", "urgent_push"]).not.toContain(mode({ degradationMode: "no_network" }));
    expect(mode({ degradationMode: "no_location" })).toBe("push"); // 位置縮退は配信を止めない
    expect(["push", "urgent_push"]).not.toContain(mode({ degradationMode: "low_battery", stakes: "low" }));
    expect(mode({ degradationMode: "low_battery", stakes: "critical" })).toBe("push");
  });

  it("12. urgent does NOT bypass hard gates (no action / weak trace)", () => {
    expect(["push", "urgent_push"]).not.toContain(mode({ timeCritical: true, stakes: "critical", actionable: false, allowedActions: [] }));
    expect(["push", "urgent_push"]).not.toContain(mode({ timeCritical: true, stakes: "critical", sourceTraceStrength: 0.1 }));
  });
});

describe("reality/receptivity-gate — structural invariants", () => {
  it("push/urgent_push ALWAYS carry an action (no-action notification forbidden)", () => {
    const variants: Partial<ReceptivityInput>[] = [
      {},
      { timeCritical: true },
      { isMorningDailyPlan: true, dailyPlanQualityPassed: true, stakes: "low" },
      { isFinalCheck: true, timeCritical: true, allowedActions: ["mark_arrived"] },
    ];
    for (const v of variants) {
      const d = evaluateReceptivityGate(inp(v));
      if (d.mode === "push" || d.mode === "urgent_push") {
        expect(d.allowedActions.length).toBeGreaterThan(0);
      }
    }
  });

  it("manual degradation mode never auto-pushes", () => {
    expect(["push", "urgent_push"]).not.toContain(mode({ degradationMode: "manual" }));
  });

  it("chain is a fallback ending in silent; mode is chain[0]", () => {
    const d = evaluateReceptivityGate(inp());
    expect(d.chain[d.chain.length - 1]).toBe("silent");
    expect(d.mode).toBe(d.chain[0]);
    expect(rankDeliveryMode(inp())).toEqual(d.chain);
  });

  it("high stakes alone (low confidence + low receptivity) does NOT push", () => {
    expect(["push", "urgent_push"]).not.toContain(mode({ stakes: "high", confidence: 0.2, receptivity: 0.2 }));
  });

  it("permission_prompt is gated (no spam): low receptivity / budget → on_open instead", () => {
    const base = { pushPermission: false, allowedActions: ["one_tap_confirm", "request_permission"] as const };
    expect(mode({ ...base })).toBe("permission_prompt"); // 揃えば prompt
    expect(mode({ ...base, receptivity: 0.2 })).toBe("on_open"); // 受容性低→prompt しない
    expect(mode({ ...base, budget: { remaining: 0, recentDismissals: 0, trust: 0.9 } })).toBe("on_open"); // 予算切れ→prompt しない
  });
});
