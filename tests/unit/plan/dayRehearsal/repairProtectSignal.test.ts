/**
 * Repair Protect Signal v0 — pure layer のテスト。
 * protect disposition（use_recovery_window / protect_buffer）のみ signal 化 / non-protect 除外 /
 * targetStepIndex・evidence 保持 / recovery_core hint / deterministic / pure を検証。
 * ★Reality 非接続・ChangeSet/apply なし（橋渡し候補を作るだけ）。
 */
import { describe, it, expect } from "vitest";
import { exportRepairProtectSignals } from "@/lib/plan/dayRehearsal/repairProtectSignal";
import type { DayRepairCandidate, DayRepairKind } from "@/lib/plan/dayRehearsal/dayRepairCandidates";
import type { Evidence } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";

const EV: Evidence = { basis: ["b"], known: ["k"], unknown: [], inferred: ["i"] };
const cand = (kind: DayRepairKind, targetStepIndex: number | null = 0, evidence: Evidence = EV): DayRepairCandidate => ({
  kind,
  suggestion: "s",
  targetStepIndex,
  evidence,
});
const kinds = (s: ReturnType<typeof exportRepairProtectSignals>) => s.map((x) => x.kind);

describe("exportRepairProtectSignals（protect のみ・Reality 非接続・pure）", () => {
  it("PS1. protect kind（use_recovery_window / protect_buffer）→ signal 化", () => {
    expect(kinds(exportRepairProtectSignals([cand("use_recovery_window")]))).toEqual(["use_recovery_window"]);
    expect(kinds(exportRepairProtectSignals([cand("protect_buffer")]))).toEqual(["protect_buffer"]);
  });

  it("PS2. non-protect（leave_earlier / confirm_uncertain / reduce_density）→ 除外", () => {
    const out = exportRepairProtectSignals([cand("leave_earlier"), cand("confirm_uncertain"), cand("reduce_density")]);
    expect(out).toEqual([]);
  });

  it("PS3. 混在入力 → protect のみ抽出・順序保持", () => {
    const out = exportRepairProtectSignals([
      cand("leave_earlier"),
      cand("use_recovery_window", 2),
      cand("reduce_density"),
      cand("protect_buffer", 5),
      cand("confirm_uncertain"),
    ]);
    expect(kinds(out)).toEqual(["use_recovery_window", "protect_buffer"]);
  });

  it("PS4. targetStepIndex を保持", () => {
    const out = exportRepairProtectSignals([cand("use_recovery_window", 7)]);
    expect(out[0].targetStepIndex).toBe(7);
  });

  it("PS5. targetStepIndex null も保持", () => {
    const out = exportRepairProtectSignals([cand("protect_buffer", null)]);
    expect(out[0].targetStepIndex).toBeNull();
  });

  it("PS6. evidence を保持（candidate のものをそのまま）", () => {
    const out = exportRepairProtectSignals([cand("use_recovery_window", 0, EV)]);
    expect(out[0].evidence).toBe(EV);
  });

  it("PS7. protectionHint は recovery（gap-meaning・v1 補正: recovery_core でない）", () => {
    for (const k of ["use_recovery_window", "protect_buffer"] as const) {
      expect(exportRepairProtectSignals([cand(k)])[0].protectionHint).toBe("recovery");
    }
  });

  it("PS8. 空 → 空", () => {
    expect(exportRepairProtectSignals([])).toEqual([]);
  });

  it("PS9. 全 non-protect → 空", () => {
    expect(exportRepairProtectSignals([cand("leave_earlier"), cand("reduce_density")])).toEqual([]);
  });

  it("PS10. deterministic（同入力 → 同出力）", () => {
    const cs = [cand("use_recovery_window", 1), cand("protect_buffer", 3)];
    expect(exportRepairProtectSignals(cs)).toEqual(exportRepairProtectSignals(cs));
  });

  it("PS11. pure（入力 candidate 配列を破壊しない）", () => {
    const cs = [cand("use_recovery_window", 1), cand("leave_earlier", 2)];
    exportRepairProtectSignals(cs);
    expect(cs).toHaveLength(2);
    expect(cs.map((c) => c.kind)).toEqual(["use_recovery_window", "leave_earlier"]);
  });

  it("PS12. signal は ChangeSet/apply field を持たない（橋渡し候補のみ）", () => {
    const s = exportRepairProtectSignals([cand("use_recovery_window")])[0] as unknown as Record<string, unknown>;
    for (const forbidden of ["ops", "changeSet", "before", "after", "applied", "startMin", "endMin", "itemId"]) {
      expect(s[forbidden]).toBeUndefined();
    }
  });
});
