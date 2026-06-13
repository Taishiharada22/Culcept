import { describe, it, expect } from "vitest";
import { buildProposals } from "@/lib/shared/travel/proposal-builder";
import { compareProposals } from "@/lib/shared/travel/proposal-comparator";
import { decide } from "@/lib/shared/travel/decision-core";
import { assessReadiness, toSharedReadinessView, type ReadinessInput } from "@/lib/shared/travel/readiness-core";
import type { ReadinessPolicy } from "@/lib/shared/travel/readiness-types";
import type { TravelProposal } from "@/lib/shared/travel/proposal-types";
import type { DecisionResult } from "@/lib/shared/travel/decision-types";
import type { ParticipantImpact } from "@/lib/shared/travel/proposal-comparison-types";
import type { ExtractedSlot, ExtractionSurface } from "@/lib/shared/travel/slot-types";
import { assertNoEngineOnlyLeak } from "@/lib/shared/personalization/engineOnly";

// ── 合成 builder（risk 個別検証用） ──
const mkProposal = (over: Partial<TravelProposal> = {}): TravelProposal => ({
  candidateId: "proposal:relaxed", angle: "relaxed", title: "T", summary: "S",
  timeWindow: { kind: "single_day", date: "2026-07-01" },
  areaPlaceholder: "京都", budgetBand: { lo: 0, hi: 30000, confidence: 0.9, currency: "JPY" },
  paceFit: "fit", mobilityFit: "fit", softPreferenceMatches: [], uncertainty: "low",
  missingInputs: [], rationale: { shared: "", forParticipant: {} }, ...over,
});
const imp = (over: Partial<ParticipantImpact> = {}): ParticipantImpact => ({ participantId: "P1", satisfiedShared: 0, satisfiedPrivate: 0, stretchedShared: 0, stretchedPrivate: 0, ...over });
const mkDecision = (selected: TravelProposal, over: Partial<DecisionResult> = {}): DecisionResult => ({
  state: "recommend", recommendedProposalId: selected.candidateId, tiedProposalIds: [], followUpQuestion: null,
  blockers: [], consensusReadiness: "ready", impact: [imp({ participantId: "P1" }), imp({ participantId: "P2" })],
  tiltedByHistory: false, tiltVisibility: null, rationale: { shared: "", forParticipant: {} }, inputError: null, ...over,
});

// ── 実 pipeline（state 系検証用） ──
const ev = (surface: ExtractionSurface, refId: string, speaker?: string) => speaker ? { surface, refId, speakerParticipantId: speaker } : { surface, refId };
type Slot = ExtractedSlot;
const dest = (a: string): Slot => ({ key: "destination_area", value: { areaText: a }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("form_input", "f:d")] });
const date = (d: string): Slot => ({ key: "date_or_range", value: { kind: "single_day", date: d }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("session_context", "s:w")] });
const budget = (hi: number): Slot => ({ key: "budget_band", value: { lo: 0, hi, confidence: 0.9, currency: "JPY" }, status: "confirmed", fillState: "filled", confidence: 0.9, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("quick_action", "a:b")] });
const softPref = (v: string, vis: "shared" | "private", owner: string): Slot => ({ key: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 0.7, owner: { kind: "participant", participantId: owner }, visibility: vis, evidence: [ev("chat_message", "m:s", owner)] });
const redLine = (k: "require" | "avoid", v: string): Slot => ({ key: "red_line", value: { descriptorKey: k, descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "participant", participantId: "P1" }, visibility: "shared", evidence: [ev("chat_message", "m:r", "P1")] });

function pipeline(slots: Slot[], policy?: ReadinessPolicy): ReadinessInput {
  const result = buildProposals({ participantIds: ["P1", "P2"], slots });
  const comparison = compareProposals({ result, slots });
  const decision = decide({ comparison });
  const selected = result.proposals.find((p) => p.candidateId === decision.recommendedProposalId) ?? null;
  return { decision, selected, policy };
}

// ════════════════════════════════════════════════════════════════════════════
describe("1. 低リスク recommend → ready_to_propose", () => {
  it("nature 推奨・単日・無 stretch・propose_plan → ready_to_propose", () => {
    const r = assessReadiness(pipeline([dest("京都"), date("2026-07-01"), budget(30000), softPref("nature", "shared", "P1")]));
    expect(r.state).toBe("ready_to_propose");
    expect(r.actionKind).toBe("propose_plan");
    expect(r.requiredConfirmations).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2/3. needs_question / blocked passthrough", () => {
  it("destination 欠如 → needs_question", () => {
    const r = assessReadiness(pipeline([date("2026-07-01"), softPref("nature", "shared", "P1")]));
    expect(r.state).toBe("needs_question");
    expect(r.actionKind).toBe("discuss_only");
    expect(r.pendingQuestion?.slotKey).toBe("destination_area");
  });
  it("矛盾 → blocked", () => {
    const r = assessReadiness(pipeline([dest("京都"), date("2026-07-01"), redLine("require", "onsen"), redLine("avoid", "onsen")]));
    expect(r.state).toBe("blocked");
    expect(r.inputError).toBe("contradictory_red_lines");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. 高 uncertainty → 確認必須", () => {
  it("uncertainty high + propose_plan → needs_confirmation(high_uncertainty)", () => {
    const sel = mkProposal({ uncertainty: "high" });
    const r = assessReadiness({ decision: mkDecision(sel), selected: sel });
    expect(r.state).toBe("needs_confirmation");
    expect(r.requiredConfirmations.map((c) => c.reason)).toContain("high_uncertainty");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. 有償/取消不能/長期 → 確認必須", () => {
  it("paid booking + reserve → needs_confirmation(paid_booking)", () => {
    const sel = mkProposal();
    const r = assessReadiness({ decision: mkDecision(sel), selected: sel, policy: { intendedAction: "reserve_or_book_later", involvesPaidBooking: true } });
    expect(r.state).toBe("needs_confirmation");
    expect(r.requiredConfirmations.map((c) => c.reason)).toContain("paid_booking");
    expect(r.actionKind).toBe("reserve_or_book_later");
  });
  it("irreversible + schedule_hold → needs_confirmation・long_travel は overnight で発火", () => {
    const sel = mkProposal({ timeWindow: { kind: "range", startDate: "2026-07-01", endDate: "2026-07-02", nights: 1 } });
    const r = assessReadiness({ decision: mkDecision(sel), selected: sel, policy: { intendedAction: "schedule_hold", irreversible: true } });
    expect(r.requiredConfirmations.map((c) => c.reason)).toEqual(expect.arrayContaining(["irreversible", "long_travel"]));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. 相手影響 → 確認 + 承認必須", () => {
  it("schedule_hold + 2人 → other_participant_impact・承認 [P1,P2]", () => {
    const sel = mkProposal();
    const r = assessReadiness({ decision: mkDecision(sel), selected: sel, policy: { intendedAction: "schedule_hold" } });
    expect(r.requiredConfirmations.map((c) => c.reason)).toContain("other_participant_impact");
    expect(r.participantApprovalRequired).toEqual(["P1", "P2"]);
  });
  it("propose_plan は相手承認不要（提案自体が ask）", () => {
    const sel = mkProposal();
    const r = assessReadiness({ decision: mkDecision(sel), selected: sel, policy: { intendedAction: "propose_plan" } });
    expect(r.participantApprovalRequired).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("7+11. private 制約衝突は確認を起こすが shared に漏れない", () => {
  const CANARY = "SECRET_ready_zzz";
  it("stretchedPrivate>0 → needs_confirmation(private)・shared では ready に戻り canary 非漏洩", () => {
    const sel = mkProposal();
    const d = mkDecision(sel, { impact: [imp({ participantId: "P1", stretchedPrivate: 1 }), imp({ participantId: "P2" })], rationale: { shared: "", forParticipant: { P1: `あなたの希望（prefer:${CANARY}）を反映` } } });
    const r = assessReadiness({ decision: d, selected: sel });
    expect(r.state).toBe("needs_confirmation");
    expect(r.requiredConfirmations.map((c) => c.reason)).toContain("private_constraint_conflict");
    const shared = toSharedReadinessView(r);
    expect(shared.state).toBe("ready_to_propose"); // private のみの確認 → shared では ready
    expect(shared.requiredConfirmations).toHaveLength(0);
    expect(shared.riskFlags).not.toContain("private_constraint_conflict");
    expect(JSON.stringify(shared)).not.toContain(CANARY);
    expect(JSON.stringify(r)).toContain(CANARY); // full には残る
    expect(() => assertNoEngineOnlyLeak(shared)).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("8. shared 制約は shared rationale に出る", () => {
  it("high_uncertainty(shared) は shared view でも残る", () => {
    const sel = mkProposal({ uncertainty: "high" });
    const r = assessReadiness({ decision: mkDecision(sel), selected: sel });
    const shared = toSharedReadinessView(r);
    expect(shared.state).toBe("needs_confirmation");
    expect(shared.requiredConfirmations.map((c) => c.reason)).toContain("high_uncertainty");
    expect(shared.rationale.shared).toContain("high_uncertainty");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("9+10. participantId のみ・source kind/provider は出力に出ない", () => {
  it("出力に source kind / provider mode の語が出ない・participantId は使う", () => {
    const sel = mkProposal();
    const r = assessReadiness({ decision: mkDecision(sel), selected: sel, policy: { intendedAction: "schedule_hold" } });
    const json = JSON.stringify(r);
    for (const f of ["talk_pair_member", "culcept_relation", "plan_session", "fixture", "talk_thread", "providerMode", "sourceKind"]) expect(json).not.toContain(f);
    expect(json).toContain("P1");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("12. 決定論 / 冪等 + 選択不正 fail-closed", () => {
  it("同一入力 → 深い等価", () => {
    const sel = mkProposal({ uncertainty: "high" });
    const input = { decision: mkDecision(sel), selected: sel, policy: { intendedAction: "reserve_or_book_later" as const, involvesPaidBooking: true } };
    expect(assessReadiness(input)).toEqual(assessReadiness(input));
  });
  it("selected が recommendedProposalId と不一致 → not_ready(fail closed)", () => {
    const sel = mkProposal({ candidateId: "proposal:active" });
    const r = assessReadiness({ decision: mkDecision(mkProposal({ candidateId: "proposal:relaxed" })), selected: sel });
    expect(r.state).toBe("not_ready");
  });
});
