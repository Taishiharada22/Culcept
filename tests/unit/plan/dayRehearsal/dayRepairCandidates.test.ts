/**
 * Day Rehearsal Repair Candidate v0 — pure layer のテスト。
 * read-only 候補生成 / evidence trace / 根拠が弱い時は出さない / suggestion トーン（禁止語なし）を検証。
 */
import { describe, it, expect } from "vitest";
import { generateDayRepairCandidates, type DayRepairCandidate } from "@/lib/plan/dayRehearsal/dayRepairCandidates";
import type { DayRehearsal, Evidence, RehearsalStepResult, ConvergenceFactor } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";

const EV: Evidence = { basis: [], known: [], unknown: [], inferred: [] };
const EST = { level: "low" as const, score: 0, evidence: EV };

function step(o: Partial<RehearsalStepResult> = {}): RehearsalStepResult {
  return {
    stepIndex: 0,
    eventId: "e",
    cumulativeStrain: EST,
    friction: EST, // transition step（最終 event は friction:null を明示）
    bufferStatus: "sufficient",
    bufferMin: null,
    recovery: null,
    convergence: null,
    ...o,
  };
}
const conv = (factors: readonly ConvergenceFactor[]) => ({ level: "high" as const, factors, evidence: EV });
function reh(o: Partial<DayRehearsal> = {}): DayRehearsal {
  return {
    date: "2026-06-07",
    density: "balanced",
    viability: { outlook: "tight", breaksAtStepIndex: null, evidence: EV },
    steps: [],
    peakStrain: EST,
    recoveryWindows: [],
    convergencePoints: [],
    coverage: { transitionsTotal: 0, travelKnown: 0, travelUnknown: 0, eventsAssumedDuration: 0 },
    ...o,
  };
}
const kinds = (cs: readonly DayRepairCandidate[]) => cs.map((c) => c.kind);

describe("generateDayRepairCandidates", () => {
  it("R1. viability unknown → 候補なし（根拠が弱い）", () => {
    expect(
      generateDayRepairCandidates(reh({ viability: { outlook: "unknown", breaksAtStepIndex: null, evidence: EV }, convergencePoints: [0], steps: [step({ convergence: conv(["buffer_short", "strain_high"]) })] })),
    ).toEqual([]);
  });

  it("R2. convergence(余白不足でない) → protect_buffer（factors を evidence に）", () => {
    const cs = generateDayRepairCandidates(reh({ convergencePoints: [0], steps: [step({ stepIndex: 0, bufferStatus: "sufficient", convergence: conv(["strain_high", "friction_high"]) })] }));
    expect(kinds(cs)).toEqual(["protect_buffer"]);
    expect(cs[0].targetStepIndex).toBe(0);
    expect(cs[0].evidence.basis).toContain("strain_high");
  });

  it("R3. insufficient buffer → leave_earlier", () => {
    const cs = generateDayRepairCandidates(reh({ steps: [step({ bufferStatus: "insufficient" })] }));
    expect(kinds(cs)).toEqual(["leave_earlier"]);
    expect(cs[0].evidence.known).toContain("移動の余白が不足");
  });

  it("R4. convergence かつ insufficient → leave_earlier のみ（protect_buffer と排他）", () => {
    const cs = generateDayRepairCandidates(reh({ convergencePoints: [0], steps: [step({ stepIndex: 0, bufferStatus: "insufficient", convergence: conv(["buffer_short", "strain_high"]) })] }));
    expect(kinds(cs)).toEqual(["leave_earlier"]);
    expect(kinds(cs)).not.toContain("protect_buffer");
  });

  it("R5. not_applicable + friction あり（transition）→ confirm_uncertain", () => {
    const cs = generateDayRepairCandidates(reh({ steps: [step({ bufferStatus: "not_applicable", friction: EST })] }));
    expect(kinds(cs)).toEqual(["confirm_uncertain"]);
    expect(cs[0].evidence.unknown).toContain("移動の余白が未確定");
  });

  it("R6. not_applicable + friction null（最終 event）→ confirm_uncertain を出さない", () => {
    const cs = generateDayRepairCandidates(reh({ steps: [step({ bufferStatus: "not_applicable", friction: null })] }));
    expect(kinds(cs)).toEqual([]);
  });

  it("R7. context.recoverySteps → use_recovery_window", () => {
    const cs = generateDayRepairCandidates(reh({ steps: [step({ stepIndex: 2 })] }), { recoverySteps: new Set([2]) });
    expect(kinds(cs)).toEqual(["use_recovery_window"]);
    expect(cs[0].targetStepIndex).toBe(2);
  });

  it("R8. context なし → rehearsal.recoveryWindows を使う", () => {
    const cs = generateDayRepairCandidates(reh({ recoveryWindows: [0], steps: [step({ stepIndex: 0 })] }));
    expect(kinds(cs)).toEqual(["use_recovery_window"]);
  });

  it("R9. density packed → reduce_density（全体・targetStepIndex null）", () => {
    const cs = generateDayRepairCandidates(reh({ density: "packed", steps: [] }));
    expect(kinds(cs)).toEqual(["reduce_density"]);
    expect(cs[0].targetStepIndex).toBeNull();
  });

  it("R10. holds・シグナルなし → 候補なし（no-op）", () => {
    const cs = generateDayRepairCandidates(reh({ viability: { outlook: "holds", breaksAtStepIndex: null, evidence: EV }, density: "balanced", steps: [step({ bufferStatus: "sufficient" })] }));
    expect(cs).toEqual([]);
  });

  it("R11. 全候補が evidence trace を持つ", () => {
    const cs = generateDayRepairCandidates(reh({
      density: "packed",
      convergencePoints: [1],
      recoveryWindows: [2],
      steps: [step({ stepIndex: 0, bufferStatus: "insufficient" }), step({ stepIndex: 1, bufferStatus: "sufficient", convergence: conv(["strain_high", "friction_high"]) }), step({ stepIndex: 2 }), step({ stepIndex: 3, bufferStatus: "not_applicable", friction: EST })],
    }));
    expect(cs.length).toBeGreaterThan(0);
    for (const c of cs) {
      expect(c.evidence).toHaveProperty("basis");
      expect(c.evidence).toHaveProperty("known");
      expect(c.evidence).toHaveProperty("unknown");
      expect(c.evidence).toHaveProperty("inferred");
    }
  });

  it("R12. suggestion に禁止語・生スコア・命令がない（suggestion トーン）", () => {
    const cs = generateDayRepairCandidates(reh({
      density: "packed",
      convergencePoints: [1],
      recoveryWindows: [2],
      steps: [step({ stepIndex: 0, bufferStatus: "insufficient" }), step({ stepIndex: 1, bufferStatus: "sufficient", convergence: conv(["strain_high"]) }), step({ stepIndex: 2 }), step({ stepIndex: 3, bufferStatus: "not_applicable", friction: EST })],
    }));
    const all = cs.map((c) => c.suggestion).join(" / ");
    expect(all).not.toMatch(/危険|警告|失敗|疲れ|疲労|壊れ|絶対|すべき|べきです/); // 禁止語
    expect(all).not.toMatch(/\d/); // 生スコア・数値なし
    expect(all).not.toMatch(/high|moderate|low|score|slack|shortfall/i); // 内部名なし
    expect(all).toMatch(/そう|かもしれません/); // suggestion トーン
  });

  it("R13. 複数シグナル → step 順 + reduce_density 末尾（決定論）", () => {
    const cs = generateDayRepairCandidates(reh({
      density: "packed",
      convergencePoints: [1],
      recoveryWindows: [2],
      steps: [step({ stepIndex: 0, bufferStatus: "insufficient" }), step({ stepIndex: 1, bufferStatus: "sufficient", convergence: conv(["strain_high"]) }), step({ stepIndex: 2 })],
    }));
    expect(kinds(cs)).toEqual(["leave_earlier", "protect_buffer", "use_recovery_window", "reduce_density"]);
  });
});
