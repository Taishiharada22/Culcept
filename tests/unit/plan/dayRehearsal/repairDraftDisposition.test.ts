/**
 * Repair Draft Disposition v0 — pure layer のテスト。
 * candidate → disposition 分類 / v0 は全 draftable=false / blockers / realityHint / evidence・suggestion 保持 / pure を検証。
 * ★ChangeSet/applyChangeSet/Reality 接続/予定変更は一切しない（分類のみ）。
 */
import { describe, it, expect } from "vitest";
import { classifyRepairDisposition, classifyRepairDispositions, type RepairDisposition } from "@/lib/plan/dayRehearsal/repairDraftDisposition";
import type { DayRepairCandidate, DayRepairKind } from "@/lib/plan/dayRehearsal/dayRepairCandidates";
import type { Evidence } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";

const EV: Evidence = { basis: ["b"], known: ["k"], unknown: [], inferred: ["i"] };
const cand = (kind: DayRepairKind, suggestion = "s", targetStepIndex: number | null = 0, evidence: Evidence = EV): DayRepairCandidate => ({
  kind,
  suggestion,
  targetStepIndex,
  evidence,
});

const ALL_KINDS: readonly DayRepairKind[] = ["leave_earlier", "protect_buffer", "confirm_uncertain", "use_recovery_window", "reduce_density"];

describe("classifyRepairDisposition（v0: 分類のみ・全 draftable=false・Reality 非接続）", () => {
  const expected: Record<DayRepairKind, RepairDisposition> = {
    leave_earlier: "adjust",
    confirm_uncertain: "confirm",
    use_recovery_window: "protect",
    protect_buffer: "protect",
    reduce_density: "reduce",
  };

  it("DD1. kind → disposition の対応（CEO 指定どおり）", () => {
    for (const kind of ALL_KINDS) {
      expect(classifyRepairDisposition(cand(kind)).disposition).toBe(expected[kind]);
    }
  });

  it("DD2. v0 は全 kind で draftable=false", () => {
    for (const kind of ALL_KINDS) {
      expect(classifyRepairDisposition(cand(kind)).draftable).toBe(false);
    }
  });

  it("DD3. 全 kind が blockers を持つ（draftable=false の理由）", () => {
    for (const kind of ALL_KINDS) {
      expect(classifyRepairDisposition(cand(kind)).blockers.length).toBeGreaterThan(0);
    }
  });

  it("DD4. 全 kind が realityHint を持つ（将来 Reality 対応の doc）", () => {
    for (const kind of ALL_KINDS) {
      expect(classifyRepairDisposition(cand(kind)).realityHint.length).toBeGreaterThan(0);
    }
  });

  it("DD5. leave_earlier の blockers に magnitude 欠落と Reality move 未実装", () => {
    const b = classifyRepairDisposition(cand("leave_earlier")).blockers;
    expect(b).toContain("no_magnitude(option_d)");
    expect(b).toContain("reality_move_mode_unimplemented");
  });

  it("DD6. confirm/protect は plan-change でない blocker を持つ", () => {
    expect(classifyRepairDisposition(cand("confirm_uncertain")).blockers.join(" ")).toMatch(/not_a_plan_change/);
    expect(classifyRepairDisposition(cand("use_recovery_window")).blockers.join(" ")).toMatch(/not_a_plan_change/);
  });

  it("DD7. protect_buffer は dormant blocker を持つ（Option D 不到達）", () => {
    expect(classifyRepairDisposition(cand("protect_buffer")).blockers.join(" ")).toMatch(/dormant/);
  });

  it("DD8. realityHint は Reality 概念に対応（move / protection / verify / optimize）", () => {
    expect(classifyRepairDisposition(cand("leave_earlier")).realityHint).toMatch(/update|move/);
    expect(classifyRepairDisposition(cand("use_recovery_window")).realityHint).toMatch(/protection|recovery_core/);
    expect(classifyRepairDisposition(cand("confirm_uncertain")).realityHint).toMatch(/verify/);
    expect(classifyRepairDisposition(cand("reduce_density")).realityHint).toMatch(/optimize/);
  });

  it("DD9. evidence を保持（candidate のものをそのまま）", () => {
    const c = cand("leave_earlier", "s", 0, EV);
    expect(classifyRepairDisposition(c).evidence).toBe(EV);
  });

  it("DD10. suggestion を保持（copy 無改変）", () => {
    const c = cand("leave_earlier", "この移動の前後は、出発を少し早める余地があるかもしれません");
    expect(classifyRepairDisposition(c).suggestion).toBe("この移動の前後は、出発を少し早める余地があるかもしれません");
  });

  it("DD11. kind を保持", () => {
    for (const kind of ALL_KINDS) {
      expect(classifyRepairDisposition(cand(kind)).kind).toBe(kind);
    }
  });

  it("DD12. deterministic（同入力 → 同出力）", () => {
    const c = cand("use_recovery_window");
    expect(classifyRepairDisposition(c)).toEqual(classifyRepairDisposition(c));
  });

  it("DD13. pure（入力 candidate を破壊しない）", () => {
    const c = cand("leave_earlier", "orig", 3);
    classifyRepairDisposition(c);
    expect(c.suggestion).toBe("orig");
    expect(c.targetStepIndex).toBe(3);
    expect(c.kind).toBe("leave_earlier");
  });

  it("DD14. ChangeSet/apply を出力しない（分類オブジェクトのみ・予定変更 field を持たない）", () => {
    const r = classifyRepairDisposition(cand("leave_earlier")) as unknown as Record<string, unknown>;
    // 予定変更/実行を示す field が無いこと（before/after/ops/applied/startMin 等）。
    for (const forbidden of ["ops", "changeSet", "before", "after", "applied", "startMin", "endMin", "itemId"]) {
      expect(r[forbidden]).toBeUndefined();
    }
  });
});

describe("classifyRepairDispositions（配列・順序保持）", () => {
  it("DD15. 全件分類・順序保持", () => {
    const cs = [cand("reduce_density"), cand("leave_earlier"), cand("use_recovery_window")];
    const out = classifyRepairDispositions(cs);
    expect(out.map((x) => x.disposition)).toEqual(["reduce", "adjust", "protect"]);
    expect(out.every((x) => x.draftable === false)).toBe(true);
  });

  it("DD16. 空 → 空", () => {
    expect(classifyRepairDispositions([])).toEqual([]);
  });
});
