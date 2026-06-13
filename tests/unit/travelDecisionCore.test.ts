import { describe, it, expect } from "vitest";
import { buildProposals } from "@/lib/shared/travel/proposal-builder";
import { compareProposals } from "@/lib/shared/travel/proposal-comparator";
import { decide, toSharedDecisionView, type DecideInput } from "@/lib/shared/travel/decision-core";
import type { FairnessHistoryInput } from "@/lib/shared/travel/decision-types";
import type { ExtractedSlot, ExtractionSurface } from "@/lib/shared/travel/slot-types";
import { assertNoEngineOnlyLeak } from "@/lib/shared/personalization/engineOnly";

const ev = (surface: ExtractionSurface, refId: string, speaker?: string) =>
  speaker ? { surface, refId, speakerParticipantId: speaker } : { surface, refId };
type Slot = ExtractedSlot;
const dest = (areaText: string): Slot => ({ key: "destination_area", value: { areaText }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("form_input", "f:dest")] });
const date = (d: string): Slot => ({ key: "date_or_range", value: { kind: "single_day", date: d }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("session_context", "s:win")] });
const budget = (hi: number): Slot => ({ key: "budget_band", value: { lo: 0, hi, confidence: 0.9, currency: "JPY" }, status: "confirmed", fillState: "filled", confidence: 0.9, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("quick_action", "a:b")] });
const softPref = (v: string, vis: "shared" | "private", owner: string): Slot => ({ key: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 0.7, owner: { kind: "participant", participantId: owner }, visibility: vis, evidence: [ev("chat_message", "m:sp", owner)] });
const redLine = (k: "require" | "avoid", v: string): Slot => ({ key: "red_line", value: { descriptorKey: k, descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "participant", participantId: "P1" }, visibility: "shared", evidence: [ev("chat_message", "m:rl", "P1")] });

const decideFrom = (slots: Slot[], history?: FairnessHistoryInput, participantIds = ["P1", "P2"]): DecideInput => {
  const result = buildProposals({ participantIds, slots });
  const comparison = compareProposals({ result, slots });
  return { comparison, fairnessHistory: history };
};

// ════════════════════════════════════════════════════════════════════════════
describe("1. 明確な勝者 → recommend", () => {
  it("単一 soft pref が 1 角度を支配 → その案を recommend", () => {
    const r = decide(decideFrom([dest("京都"), date("2026-07-01"), budget(30000), softPref("nature", "shared", "P1")]));
    expect(r.state).toBe("recommend");
    expect(r.recommendedProposalId).toBe("proposal:nature");
    // nature は P1 の pref のみ満たし P2 に偏る(leanShared=P1)→ consensus は tentative（公平性シグナル）
    expect(r.consensusReadiness).toBe("tentative");
    expect(r.impact.length).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. 候補なし → blocked", () => {
  it("矛盾(require+avoid) → blocked・inputError passthrough", () => {
    const r = decide(decideFrom([dest("京都"), date("2026-07-01"), redLine("require", "onsen"), redLine("avoid", "onsen")]));
    expect(r.state).toBe("blocked");
    expect(r.inputError).toBe("contradictory_red_lines");
    expect(r.recommendedProposalId).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. tie/no dominance → tie or question", () => {
  it("soft pref なし → 全案同点 → tie + tie_preference 質問", () => {
    const r = decide(decideFrom([dest("京都"), date("2026-07-01"), budget(30000)]));
    expect(r.state).toBe("tie");
    expect(r.tiedProposalIds.length).toBeGreaterThan(1);
    expect(r.followUpQuestion?.about).toBe("tie_preference");
    expect(r.followUpQuestion?.optionIds).toEqual(r.tiedProposalIds);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. required 欠如 → recommendation をブロック（needs_question）", () => {
  it("destination 欠如 → needs_question（提案は出ても recommend しない）", () => {
    const r = decide(decideFrom([date("2026-07-01"), softPref("nature", "shared", "P1")]));
    expect(r.state).toBe("needs_question");
    expect(r.recommendedProposalId).toBeNull();
    expect(r.followUpQuestion?.about).toBe("missing_slot");
    expect(r.followUpQuestion?.slotKey).toBe("destination_area");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. fairness history は gently tilt するが hard blocker を覆さない", () => {
  // P1:nature / P2:art → nature(P1寄り) と culture(P2寄り) が pareto 同点
  const split = () => [dest("京都"), date("2026-07-01"), budget(30000), softPref("nature", "shared", "P1"), softPref("art", "shared", "P2")];

  it("履歴なし → tie", () => {
    const r = decide(decideFrom(split()));
    expect(r.state).toBe("tie");
  });
  it("履歴(過去 P1 寄り) → P2 寄り(culture)へ tilt → recommend", () => {
    const r = decide(decideFrom(split(), { participantA: "P1", participantB: "P2", priorBias: -0.5, visibility: "shared" }));
    expect(r.state).toBe("recommend");
    expect(r.recommendedProposalId).toBe("proposal:culture");
    expect(r.tiltedByHistory).toBe(true);
  });
  it("hard blocker（required 欠如）は履歴で覆らない", () => {
    const r = decide(decideFrom([softPref("nature", "shared", "P1"), softPref("art", "shared", "P2")], { participantA: "P1", participantB: "P2", priorBias: -0.9, visibility: "shared" }));
    expect(r.state).toBe("needs_question"); // destination/date 欠如が優先
    expect(r.recommendedProposalId).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6+11. private 履歴/制約は決定に影響するが shared に漏れない", () => {
  const CANARY = "SECRET_decide_zzz";
  it("private soft pref canary は shared 決定 view に出ない（full には出る）", () => {
    const r = decide(decideFrom([dest("京都"), date("2026-07-01"), budget(30000), softPref("nature", "shared", "P1"), softPref(CANARY, "private", "P1")]));
    const shared = toSharedDecisionView(r);
    expect(JSON.stringify(shared)).not.toContain(CANARY);
    expect(JSON.stringify(r)).toContain(CANARY);
    expect(shared.rationale.forParticipant).toEqual({});
    expect(() => assertNoEngineOnlyLeak(shared)).not.toThrow();
  });
  it("private 履歴 tilt は shared view で隠れる（tiltedByHistory=false）", () => {
    const r = decide(decideFrom([dest("京都"), date("2026-07-01"), budget(30000), softPref("nature", "shared", "P1"), softPref("art", "shared", "P2")], { participantA: "P1", participantB: "P2", priorBias: -0.5, visibility: "private" }));
    expect(r.state).toBe("recommend");
    expect(r.tiltedByHistory).toBe(true); // full では tilt した
    const shared = toSharedDecisionView(r);
    expect(shared.tiltedByHistory).toBe(false); // shared では隠す
    expect(shared.tiltVisibility).toBeNull();
    expect(shared.rationale.shared).not.toContain("優先"); // private 優先理由は shared に出ない
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("7. shared 履歴/条件は shared rationale に出てよい", () => {
  it("shared 履歴 tilt は shared 文に調整理由が出る", () => {
    const r = decide(decideFrom([dest("京都"), date("2026-07-01"), budget(30000), softPref("nature", "shared", "P1"), softPref("art", "shared", "P2")], { participantA: "P1", participantB: "P2", priorBias: -0.5, visibility: "shared" }));
    const shared = toSharedDecisionView(r);
    expect(shared.rationale.shared).toContain("偏りを考慮");
    expect(shared.tiltedByHistory).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("8+9. participantId のみ・source kind/provider は決定に影響しない・出力に出ない", () => {
  it("出力に source kind / provider mode の語が出ない・participantId は使う", () => {
    const r = decide(decideFrom([dest("京都"), date("2026-07-01"), softPref("nature", "shared", "P1")]));
    const json = JSON.stringify(r);
    for (const f of ["talk_pair_member", "culcept_relation", "plan_session", "fixture", "talk_thread", "providerMode", "sourceKind"]) {
      expect(json).not.toContain(f);
    }
    expect(json).toContain("P1");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("10. 決定論 / 冪等", () => {
  it("同一入力 → 深い等価", () => {
    const input = decideFrom([dest("京都"), date("2026-07-01"), budget(30000), softPref("nature", "shared", "P1")], { participantA: "P1", participantB: "P2", priorBias: -0.3, visibility: "shared" });
    expect(decide(input)).toEqual(decide(input));
  });
});
