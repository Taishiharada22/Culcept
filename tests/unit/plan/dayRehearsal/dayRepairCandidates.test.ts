/**
 * Day Rehearsal Repair Candidate v0 — pure layer のテスト。
 * read-only 候補生成 / evidence trace / 根拠が弱い時は出さない / suggestion トーン（禁止語なし）を検証。
 */
import { describe, it, expect } from "vitest";
import { generateDayRepairCandidates, dedupeRepairCandidates, prioritizeRepairCandidates, type DayRepairCandidate } from "@/lib/plan/dayRehearsal/dayRepairCandidates";
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

describe("prioritizeRepairCandidates", () => {
  const c = (kind: DayRepairCandidate["kind"], targetStepIndex = 0): DayRepairCandidate => ({ kind, suggestion: "s", targetStepIndex, evidence: EV });

  it("P1. 優先度順にソート（leave_earlier>protect_buffer>confirm_uncertain>use_recovery_window>reduce_density）", () => {
    const out = prioritizeRepairCandidates([c("reduce_density"), c("use_recovery_window"), c("leave_earlier"), c("protect_buffer"), c("confirm_uncertain")], 5);
    expect(out.map((x) => x.kind)).toEqual(["leave_earlier", "protect_buffer", "confirm_uncertain", "use_recovery_window", "reduce_density"]);
  });
  it("P2. 最大3件に絞る", () => {
    const out = prioritizeRepairCandidates([c("leave_earlier"), c("protect_buffer"), c("confirm_uncertain"), c("use_recovery_window"), c("reduce_density")], 3);
    expect(out).toHaveLength(3);
    expect(out.map((x) => x.kind)).toEqual(["leave_earlier", "protect_buffer", "confirm_uncertain"]);
  });
  it("P3. 同 kind は元順序を保つ（stable）", () => {
    expect(prioritizeRepairCandidates([c("leave_earlier", 5), c("leave_earlier", 2)], 5).map((x) => x.targetStepIndex)).toEqual([5, 2]);
  });
  it("P4. use_recovery_window は低優先（4件中 top3 から外れる）", () => {
    const out = prioritizeRepairCandidates([c("leave_earlier"), c("protect_buffer"), c("confirm_uncertain"), c("use_recovery_window")], 3);
    expect(out.map((x) => x.kind)).not.toContain("use_recovery_window");
  });
  it("P5. 空 → 空", () => {
    expect(prioritizeRepairCandidates([], 3)).toEqual([]);
  });
});

describe("v1 target-aware / evidence-aware copy（logic 不変・文のみ grounded 具体化）", () => {
  const sugg = (cs: readonly DayRepairCandidate[], kind: DayRepairCandidate["kind"]) =>
    cs.find((c) => c.kind === kind)?.suggestion ?? "";

  it("V1. leave_earlier は transition 起点 → 「移動」に grounded（generic な「ここは」でない）", () => {
    const cs = generateDayRepairCandidates(reh({ steps: [step({ bufferStatus: "insufficient" })] }));
    expect(sugg(cs, "leave_earlier")).toContain("移動");
  });

  it("V2. confirm_uncertain は移動の余白＋clarity（見通し）を統合", () => {
    const cs = generateDayRepairCandidates(reh({ steps: [step({ bufferStatus: "not_applicable", friction: EST })] }));
    const s = sugg(cs, "confirm_uncertain");
    expect(s).toContain("移動"); // grounded（confirm_uncertain は必ず transition）
    expect(s).toContain("見通し"); // clarity preview value の統合
  });

  it("V3. use_recovery_window は utilization（次に入りやすい）を統合", () => {
    const cs = generateDayRepairCandidates(reh({ steps: [step({ stepIndex: 2 })] }), { recoverySteps: new Set([2]) });
    const s = sugg(cs, "use_recovery_window");
    expect(s).toContain("一息"); // grounded（gap）
    expect(s).toMatch(/次の予定|残せる/); // utilization preview value の統合
  });

  it("V4. reduce_density は弱め維持（具体的な予定削除/変更を促さない）", () => {
    const cs = generateDayRepairCandidates(reh({ density: "packed", steps: [] }));
    const s = sugg(cs, "reduce_density");
    expect(s).not.toMatch(/削除|やめ|減らし|外す|キャンセル/); // 予定変更指示でない
    expect(s).toMatch(/そう|かもしれません/); // suggestion トーン
  });

  it("V5. v1 全文も禁止語・生数値・命令なし（R12 を v1 copy で再保証）", () => {
    const cs = generateDayRepairCandidates(reh({
      density: "packed",
      recoveryWindows: [2],
      steps: [step({ stepIndex: 0, bufferStatus: "insufficient" }), step({ stepIndex: 1, bufferStatus: "not_applicable", friction: EST }), step({ stepIndex: 2 })],
    }));
    const all = cs.map((c) => c.suggestion).join(" / ");
    expect(all).not.toMatch(/危険|警告|失敗|疲れ|疲労|壊れ|絶対|すべき|べきです/);
    expect(all).not.toMatch(/\d/);
    expect(all).not.toMatch(/high|moderate|low|score|slack|shortfall/i);
    expect(all).toMatch(/そう|かもしれません/);
  });

  it("V6. deterministic（同入力 → 同 suggestion）", () => {
    const mk = () => generateDayRepairCandidates(reh({ steps: [step({ bufferStatus: "insufficient" })] }));
    expect(mk().map((c) => c.suggestion)).toEqual(mk().map((c) => c.suggestion));
  });
});

describe("dedupeRepairCandidates（案A: 同 kind→代表1件・display 専用・copy 無改変）", () => {
  const c = (kind: DayRepairCandidate["kind"], targetStepIndex: number | null = 0, suggestion = "s"): DayRepairCandidate => ({ kind, suggestion, targetStepIndex, evidence: EV });
  const kinds = (cs: readonly DayRepairCandidate[]) => cs.map((x) => x.kind);

  it("D1. 同 kind 複数 → 1 件に集約", () => {
    const out = dedupeRepairCandidates([c("leave_earlier", 0), c("leave_earlier", 1), c("leave_earlier", 2)]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("leave_earlier");
  });

  it("D2. 異なる kind は全て残る（消えない）", () => {
    const out = dedupeRepairCandidates([c("leave_earlier"), c("confirm_uncertain"), c("use_recovery_window"), c("reduce_density", null)]);
    expect(kinds(out)).toEqual(["leave_earlier", "confirm_uncertain", "use_recovery_window", "reduce_density"]);
  });

  it("D3. 順序保持（入力順=step 順）", () => {
    const out = dedupeRepairCandidates([c("use_recovery_window"), c("leave_earlier"), c("use_recovery_window"), c("confirm_uncertain")]);
    expect(kinds(out)).toEqual(["use_recovery_window", "leave_earlier", "confirm_uncertain"]);
  });

  it("D4. 代表は先頭（targetStepIndex/evidence/suggestion を保持・copy 無改変）", () => {
    const ev2: Evidence = { basis: ["b2"], known: [], unknown: [], inferred: [] };
    const out = dedupeRepairCandidates([
      { kind: "leave_earlier", suggestion: "first", targetStepIndex: 5, evidence: EV },
      { kind: "leave_earlier", suggestion: "second", targetStepIndex: 9, evidence: ev2 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].targetStepIndex).toBe(5); // 先頭の step
    expect(out[0].suggestion).toBe("first"); // copy 無改変（先頭そのまま）
    expect(out[0].evidence).toBe(EV); // 代表の evidence 保持
  });

  it("D5. reduce_density は元々最大1 → 不変で残る", () => {
    const out = dedupeRepairCandidates([c("leave_earlier"), c("reduce_density", null)]);
    expect(kinds(out)).toContain("reduce_density");
  });

  it("D6. 空 → 空", () => {
    expect(dedupeRepairCandidates([])).toEqual([]);
  });

  it("D7. pure（入力配列を破壊しない）", () => {
    const input = [c("leave_earlier", 0), c("leave_earlier", 1)];
    const snapshot = input.map((x) => x.targetStepIndex);
    dedupeRepairCandidates(input);
    expect(input).toHaveLength(2); // 入力不変
    expect(input.map((x) => x.targetStepIndex)).toEqual(snapshot);
  });

  it("D8. prioritize(dedupe(...)) 統合: 同一文が並ばず・kind 多様・最大3", () => {
    // leave_earlier ×3（同一文）+ use_recovery_window ×2 + reduce_density ×1
    const raw = [
      c("leave_earlier", 0, "出発"), c("leave_earlier", 2, "出発"), c("leave_earlier", 4, "出発"),
      c("use_recovery_window", 1, "一息"), c("use_recovery_window", 3, "一息"),
      c("reduce_density", null, "密度"),
    ];
    const out = prioritizeRepairCandidates(dedupeRepairCandidates(raw), 3);
    // 同一文が並ばない（suggestion がユニーク）
    const suggs = out.map((x) => x.suggestion);
    expect(new Set(suggs).size).toBe(suggs.length);
    // kind 多様（3 種）・最大3・優先度順
    expect(kinds(out)).toEqual(["leave_earlier", "use_recovery_window", "reduce_density"]);
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it("D9. dedup なしの旧挙動との差（同一文重複が解消）", () => {
    const raw = [c("leave_earlier", 0, "同"), c("leave_earlier", 1, "同"), c("leave_earlier", 2, "同")];
    expect(prioritizeRepairCandidates(raw, 3)).toHaveLength(3); // 旧: 同一文 ×3
    expect(prioritizeRepairCandidates(dedupeRepairCandidates(raw), 3)).toHaveLength(1); // 新: 1 件
  });
});
