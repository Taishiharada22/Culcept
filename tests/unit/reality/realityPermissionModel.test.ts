/**
 * R5-1 Permission Model（pure）— Level 0-5・risk 分類（高リスク flag は必ず high）。
 */
import { describe, it, expect } from "vitest";
import { classifyRisk, AUTONOMY_FLOOR, ACTION_BASE_RISK, HIGH_RISK_FLAGS, PERMISSION_LEVEL_CAPABILITY, type ActionKind } from "@/lib/plan/reality/permission/permission-model";

describe("R5-1 classifyRisk", () => {
  it("action 基底 risk（low/elevated/high）", () => {
    expect(classifyRisk("propose", [])).toBe("low");
    expect(classifyRisk("adjust_plan", [])).toBe("elevated");
    expect(classifyRisk("book", [])).toBe("high");
  });
  it("高リスク flag は action に関わらず high", () => {
    expect(classifyRisk("propose", ["personal_info"])).toBe("high");
    expect(classifyRisk("notify", ["high_cost"])).toBe("high");
    expect(classifyRisk("draft", ["involves_others"])).toBe("high");
  });
  it("CEO 指定の高リスク領域が全て HIGH_RISK_FLAGS にある", () => {
    for (const f of ["first_time_place", "high_cost", "personal_info", "involves_others", "sends_message", "confirms_booking", "purchase", "long_distance"] as const) {
      expect(HIGH_RISK_FLAGS.has(f)).toBe(true);
    }
  });
  it("Level 0-5 capability・floor 単調", () => {
    expect(Object.keys(PERMISSION_LEVEL_CAPABILITY)).toHaveLength(6);
    const order: ActionKind[] = ["observe", "notify", "propose", "draft", "adjust_plan"];
    for (let i = 1; i < order.length; i++) expect(AUTONOMY_FLOOR[order[i]!]).toBeGreaterThanOrEqual(AUTONOMY_FLOOR[order[i - 1]!]);
    expect(ACTION_BASE_RISK.book).toBe("high");
  });
});
