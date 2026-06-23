import { describe, it, expect } from "vitest";

import { COALTER_DEMO_FAIRNESS_LEDGER } from "@/app/(culcept)/plan/tabs/coalter/coalterFairnessFixture";
import { buildCoAlterFairnessNudge } from "@/app/(culcept)/plan/tabs/coalter/coalterFairnessNudge";
import type { FairnessLedgerEntry } from "@/lib/shared/personalization/types";

function entry(biasScore: number, decidedAt = "2026-06-01T00:00:00.000Z"): FairnessLedgerEntry {
  return { biasScore, decidedAt };
}

describe("S4-1 CoAlter fairness nudge（これまでの釣り合い・読み取りのみ・捏造なし）", () => {
  it("demo 台帳（あなた寄りが続く）→ leaning=self・相手を立てる番", () => {
    const n = buildCoAlterFairnessNudge(COALTER_DEMO_FAIRNESS_LEDGER, "Mio");
    expect(n?.leaning).toBe("self");
    expect(n?.message.includes("あなたの希望が通りがち")).toBe(true);
    expect(n?.message.includes("Mio")).toBe(true);
  });

  it("相手寄りが続く → leaning=partner・あなたの希望を多めでも釣り合う", () => {
    const rows = [entry(0.4), entry(0.5), entry(0.3)];
    const n = buildCoAlterFairnessNudge(rows, "Mio");
    expect(n?.leaning).toBe("partner");
    expect(n?.message.includes("Mioの希望が通りがち")).toBe(true);
    expect(n?.message.includes("あなたの希望")).toBe(true);
  });

  it("honesty: おおむね均衡（|平均| <= deadzone）→ null（どちらの番とも言わない）", () => {
    const rows = [entry(0.1), entry(-0.15), entry(0.05)]; // 平均 ≒ 0
    expect(buildCoAlterFairnessNudge(rows, "Mio")).toBeNull();
  });

  it("honesty: 履歴なし → null", () => {
    expect(buildCoAlterFairnessNudge([], "Mio")).toBeNull();
  });

  it("直近 10 行の平均で判定（古い偏りは窓外）", () => {
    // 古い 3 件は相手寄り(+)、直近 10 件はあなた寄り(-) → 全体は self。
    const old = Array.from({ length: 3 }, () => entry(0.9, "2026-01-01T00:00:00.000Z"));
    const recent = Array.from({ length: 10 }, () => entry(-0.5, "2026-06-01T00:00:00.000Z"));
    const n = buildCoAlterFairnessNudge([...old, ...recent], "Mio");
    expect(n?.leaning).toBe("self"); // 直近 10 が支配
  });

  it("raw bias 値非漏洩: leaning/message のみ（数値を含まない）", () => {
    const n = buildCoAlterFairnessNudge(COALTER_DEMO_FAIRNESS_LEDGER, "Mio");
    expect(n).not.toBeNull();
    if (n) {
      expect(Object.keys(n).sort()).toEqual(["leaning", "message"]);
      expect(/-?\d+\.\d+/.test(n.message)).toBe(false); // 小数の bias 値を露出しない
    }
  });
});
