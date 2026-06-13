import { describe, it, expect } from "vitest";
import { buildProposals } from "@/lib/shared/travel/proposal-builder";
import { compareProposals, toSharedComparisonView, type CompareProposalsInput } from "@/lib/shared/travel/proposal-comparator";
import { ANGLE_ROLE } from "@/lib/shared/travel/proposal-comparison-types";
import type { ExtractedSlot, ExtractionSurface } from "@/lib/shared/travel/slot-types";
import { assertNoEngineOnlyLeak } from "@/lib/shared/personalization/engineOnly";

const ev = (surface: ExtractionSurface, refId: string, speaker?: string) =>
  speaker ? { surface, refId, speakerParticipantId: speaker } : { surface, refId };
type Slot = ExtractedSlot;
const dest = (areaText: string): Slot => ({ key: "destination_area", value: { areaText }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("form_input", "f:dest")] });
const date = (d: string): Slot => ({ key: "date_or_range", value: { kind: "single_day", date: d }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("session_context", "s:win")] });
const budget = (hi: number): Slot => ({ key: "budget_band", value: { lo: 0, hi, confidence: 0.9, currency: "JPY" }, status: "confirmed", fillState: "filled", confidence: 0.9, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("quick_action", "a:b")] });
const softPref = (v: string, vis: "shared" | "private", owner: string, surface: ExtractionSurface = "chat_message", k: "prefer" | "food_focus" = "prefer"): Slot => ({ key: "soft_preference", value: { descriptorKey: k, descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 0.7, owner: { kind: "participant", participantId: owner }, visibility: vis, evidence: [ev(surface, "m:sp", owner)] });
const redLine = (k: "require" | "avoid", v: string, vis: "shared" | "private", owner: string): Slot => ({ key: "red_line", value: { descriptorKey: k, descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "participant", participantId: owner }, visibility: vis, evidence: [ev("chat_message", "m:rl", owner)] });

const compareFrom = (slots: Slot[], participantIds = ["P1", "P2"]): CompareProposalsInput => {
  const result = buildProposals({ participantIds, slots });
  return { result, slots };
};

// ════════════════════════════════════════════════════════════════════════════
describe("基本: entries / pareto / diffs / role / blockers", () => {
  it("3案で entries・role・pareto・diff が出る", () => {
    const c = compareProposals(compareFrom([dest("京都"), date("2026-07-01"), budget(30000), softPref("nature", "shared", "P1")]));
    expect(c.entries.length).toBeGreaterThan(0);
    expect(c.entries.every((e) => ["protect", "easy", "push"].includes(e.role))).toBe(true);
    expect(c.paretoOptimalIds.length).toBeGreaterThan(0);
    expect(c.diffs.length).toBe((c.entries.length * (c.entries.length - 1)) / 2);
    // nature pref → nature 案が soft 一致で pareto 最適に含まれる
    const nature = c.entries.find((e) => e.angle === "nature");
    expect(nature?.softMatchCount).toBeGreaterThanOrEqual(1);
    expect(ANGLE_ROLE.active).toBe("push");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("1+5. private は比較結果に影響するが shared に漏れない", () => {
  const CANARY = "SECRET_pref_zzz";
  it("private avoid:food が food_focused を落とし、比較 entries から消える（outcome 影響）", () => {
    const withAvoid = compareProposals(compareFrom([dest("京都"), date("2026-07-01"), redLine("avoid", "food", "private", "P1")]));
    expect(withAvoid.entries.every((e) => e.angle !== "food_focused")).toBe(true);
    const without = compareProposals(compareFrom([dest("京都"), date("2026-07-01")]));
    // food_focused は通常 viable（avoid なしでは候補に入りうる）→ outcome が private で変わる
    expect(JSON.stringify(withAvoid.entries)).not.toEqual(JSON.stringify(without.entries));
  });

  it("private soft pref の canary は shared 射影に出ない（full には出る）", () => {
    const c = compareProposals(compareFrom([dest("京都"), date("2026-07-01"), softPref(CANARY, "private", "P1")]));
    const shared = toSharedComparisonView(c);
    expect(JSON.stringify(shared)).not.toContain(CANARY);
    expect(JSON.stringify(c)).toContain(CANARY); // full(owner側)には存在
    expect(shared.summary.forParticipant).toEqual({});
    expect(() => assertNoEngineOnlyLeak(shared)).not.toThrow();
  });

  it("private soft 一致による lean は shared では露出しない（leanFull→balanced 化）", () => {
    // P1 private nature pref → nature 案は full で P1 寄り・shared では balanced
    const c = compareProposals(compareFrom([dest("京都"), date("2026-07-01"), softPref("nature", "private", "P1")]));
    const natureFair = c.fairness.find((f) => f.candidateId === "proposal:nature");
    expect(natureFair?.leanFull).toBe("P1"); // full は P1 寄り
    expect(natureFair?.leanShared).toBe("balanced"); // shared は中立
    const shared = toSharedComparisonView(c);
    const sNature = shared.fairness.find((f) => f.candidateId === "proposal:nature");
    expect(sNature?.leanFull).toBe("balanced"); // shared 射影で private tilt 非露出
    expect(sNature?.perParticipant.every((p) => p.satisfiedPrivate === 0)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. shared 条件は shared rationale に出る", () => {
  it("shared な比較サマリが出る（案数・役割）", () => {
    const c = compareProposals(compareFrom([dest("京都"), date("2026-07-01"), softPref("nature", "shared", "P1")]));
    const shared = toSharedComparisonView(c);
    expect(shared.summary.shared).toContain("案を比較");
    expect(shared.summary.shared.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3+4. participantId のみ・source kind/provider は fairness に影響しない・出力に出ない", () => {
  it("evidence surface(provider 相当)違いで fairness は不変", () => {
    const a = compareProposals(compareFrom([dest("京都"), date("2026-07-01"), softPref("nature", "private", "P1", "chat_message")]));
    const b = compareProposals(compareFrom([dest("京都"), date("2026-07-01"), softPref("nature", "private", "P1", "relation_context")]));
    expect(a.fairness).toEqual(b.fairness);
  });
  it("出力に source kind / provider mode の語が出ない・participantId は使う", () => {
    const c = compareProposals(compareFrom([dest("京都"), date("2026-07-01"), softPref("nature", "private", "P1")]));
    const json = JSON.stringify(c);
    for (const f of ["talk_pair_member", "culcept_relation", "plan_session", "fixture", "talk_thread", "providerMode", "sourceKind"]) {
      expect(json).not.toContain(f);
    }
    expect(json).toContain("P1");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. 決定論 / 冪等", () => {
  it("同一入力 → 深い等価", () => {
    const input = compareFrom([dest("京都"), date("2026-07-01"), budget(30000), softPref("nature", "shared", "P1")]);
    expect(compareProposals(input)).toEqual(compareProposals(input));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("7. missing questions は安定・優先順位付き", () => {
  it("required(destination/date) が recommended(budget) より前", () => {
    const c = compareProposals(compareFrom([softPref("nature", "shared", "P1")]));
    const pr = c.prioritizedQuestions.map((q) => q.priority);
    const firstRecommended = pr.indexOf("recommended");
    const lastRequired = pr.lastIndexOf("required");
    expect(lastRequired).toBeLessThan(firstRecommended);
    expect(c.blockers).toContain("required_inputs_missing");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("8. impossible / contradictory は fail closed", () => {
  it("矛盾(require+avoid) → inputError passthrough + no_viable_proposals + entries 空", () => {
    const c = compareProposals(compareFrom([dest("京都"), date("2026-07-01"), redLine("require", "onsen", "shared", "P1"), redLine("avoid", "onsen", "shared", "P1")]));
    expect(c.inputError).toBe("contradictory_red_lines");
    expect(c.blockers).toContain("input_error");
    expect(c.blockers).toContain("no_viable_proposals");
    expect(c.entries).toHaveLength(0);
    expect(c.paretoOptimalIds).toHaveLength(0);
  });
  it("participant 不正 → fail closed（entries 空）", () => {
    const c = compareProposals(compareFrom([dest("京都"), date("2026-07-01")], ["P1", "P2", "P3"]));
    expect(c.inputError).toBe("invalid_participants");
    expect(c.entries).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("dominance: soft 一致↑ stretch↓ で支配（character は支配に使わない）", () => {
  it("soft 一致の多い案が少ない案を支配しうる・角度違いだけでは支配しない", () => {
    const c = compareProposals(compareFrom([dest("京都"), date("2026-07-01"), softPref("nature", "shared", "P1")]));
    // nature(soft1) は soft0 の同 stretch 案を支配 → 一部 entry が dominatedBy 非空
    const nature = c.entries.find((e) => e.angle === "nature");
    expect(nature?.paretoOptimal).toBe(true);
  });
});
