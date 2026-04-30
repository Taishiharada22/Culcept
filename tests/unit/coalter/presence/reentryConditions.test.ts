/**
 * Stage 2 L2-j — 再介入条件サマリ test (§6.7)
 */

import { describe, it, expect } from "vitest";

import {
  REENTRY_TABLE,
  isExplicitCallAllowed,
  isSameSessionRetryAllowed,
  type RejectionCategory,
} from "@/lib/coalter/presence/reentryConditions";

describe("L2-j reentryConditions — §6.7 再介入条件サマリ", () => {
  it("REENTRY_TABLE は 3 カテゴリすべて埋まっている (mode_escalation / individual_proposal / coalter_retreat)", () => {
    const keys = Object.keys(REENTRY_TABLE).sort();
    expect(keys).toEqual(
      [
        "coalter_retreat",
        "individual_proposal",
        "mode_escalation",
      ].sort(),
    );
  });

  it("各カテゴリで sameSession / nextSession / explicitCallAllowed が定義済", () => {
    for (const category of [
      "mode_escalation",
      "individual_proposal",
      "coalter_retreat",
    ] as RejectionCategory[]) {
      const r = REENTRY_TABLE[category];
      expect(typeof r.sameSession).toBe("string");
      expect(typeof r.nextSession).toBe("string");
      expect(typeof r.explicitCallAllowed).toBe("boolean");
    }
  });

  it("§6.7 表 不変原則: 全カテゴリで明示呼び出しは応答可", () => {
    expect(isExplicitCallAllowed("mode_escalation")).toBe(true);
    expect(isExplicitCallAllowed("individual_proposal")).toBe(true);
    expect(isExplicitCallAllowed("coalter_retreat")).toBe(true);
  });

  it("isSameSessionRetryAllowed: 全カテゴリで false (default 抑制方向)", () => {
    expect(isSameSessionRetryAllowed("mode_escalation")).toBe(false);
    expect(isSameSessionRetryAllowed("individual_proposal")).toBe(false);
    expect(isSameSessionRetryAllowed("coalter_retreat")).toBe(false);
  });

  it("各カテゴリの sameSession 文言に該当 § 番号 / 抑制範囲が含まれる", () => {
    expect(REENTRY_TABLE.mode_escalation.sameSession).toContain("§6.6.1");
    expect(REENTRY_TABLE.coalter_retreat.sameSession).toContain("§6.6.3");
  });
});
