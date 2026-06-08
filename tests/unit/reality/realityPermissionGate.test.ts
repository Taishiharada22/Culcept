/**
 * R5-3 Permission Gate（pure）— allowed/confirm_required/blocked/insufficient_context。高リスク必ず confirm/blocked。
 */
import { describe, it, expect } from "vitest";
import { evaluatePermission, type PermissionGateInput } from "@/lib/plan/reality/permission/permission-gate";
import type { PlanItemGovernance } from "@/lib/plan/reality/authority";

function g(over: Partial<PlanItemGovernance> = {}): PlanItemGovernance {
  return { origin: "user", authority: "user_owned", flexibility: "locked", protectionReasons: ["hard_external"], ...over };
}
function inp(over: Partial<PermissionGateInput> = {}): PermissionGateInput {
  return { action: "propose", flags: [], level: 2, governance: null, contextComplete: true, ...over };
}

describe("R5-3 evaluatePermission", () => {
  it("文脈不足 → insufficient_context", () => {
    expect(evaluatePermission(inp({ contextComplete: false })).verdict).toBe("insufficient_context");
  });
  it("固定予定を動かす → blocked", () => {
    expect(evaluatePermission(inp({ action: "adjust_plan", level: 5, governance: g({ flexibility: "locked" }) })).verdict).toBe("blocked");
  });
  it("高リスクは絶対 allowed にしない（level≥3→confirm・<3→blocked）", () => {
    expect(evaluatePermission(inp({ action: "book", level: 5 })).verdict).toBe("confirm_required");
    expect(evaluatePermission(inp({ action: "book", level: 2 })).verdict).toBe("blocked");
    expect(evaluatePermission(inp({ action: "propose", flags: ["personal_info"], level: 5 })).verdict).toBe("confirm_required");
    // どの level でも high が allowed にならない
    for (let lv = 0; lv <= 5; lv++) expect(evaluatePermission(inp({ action: "purchase", level: lv as PermissionGateInput["level"] })).verdict).not.toBe("allowed");
  });
  it("low risk(propose): level≥2 allowed / 1 confirm / 0 blocked", () => {
    expect(evaluatePermission(inp({ action: "propose", level: 2 })).verdict).toBe("allowed");
    expect(evaluatePermission(inp({ action: "propose", level: 1 })).verdict).toBe("confirm_required");
    expect(evaluatePermission(inp({ action: "propose", level: 0 })).verdict).toBe("blocked");
  });
  it("elevated(adjust_plan): floor=5・level5 allowed / 4 confirm / 3 blocked", () => {
    expect(evaluatePermission(inp({ action: "adjust_plan", level: 5, governance: g({ flexibility: "movable", protectionReasons: [] }) })).verdict).toBe("allowed");
    expect(evaluatePermission(inp({ action: "adjust_plan", level: 4, governance: g({ flexibility: "movable", protectionReasons: [] }) })).verdict).toBe("confirm_required");
    expect(evaluatePermission(inp({ action: "adjust_plan", level: 3, governance: g({ flexibility: "movable", protectionReasons: [] }) })).verdict).toBe("blocked");
  });
  it("reason は redacted（raw/PII を含まない短文）", () => {
    expect(evaluatePermission(inp({ action: "book", level: 5 })).reason).not.toMatch(/@|住所|電話|\d{3,}/);
  });
});
