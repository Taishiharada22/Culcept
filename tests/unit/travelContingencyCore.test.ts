import { describe, it, expect } from "vitest";
import { buildProposals } from "@/lib/shared/travel/proposal-builder";
import { compareProposals } from "@/lib/shared/travel/proposal-comparator";
import { decide } from "@/lib/shared/travel/decision-core";
import { assessReadiness } from "@/lib/shared/travel/readiness-core";
import { planContingencies, toSharedContingencyView, hasContingencyActionAuthority, type ContingencyInput } from "@/lib/shared/travel/contingency-core";
import type { ContingencyScenario } from "@/lib/shared/travel/contingency-types";
import type { DecisionResult } from "@/lib/shared/travel/decision-types";
import type { ReadinessResult } from "@/lib/shared/travel/readiness-types";
import type { ProposalComparison, ProposalComparisonEntry } from "@/lib/shared/travel/proposal-comparison-types";
import type { ExtractedSlot, ExtractionSurface } from "@/lib/shared/travel/slot-types";
import { assertNoEngineOnlyLeak } from "@/lib/shared/personalization/engineOnly";

// ── 実 pipeline ──
const ev = (surface: ExtractionSurface, refId: string, speaker?: string) => speaker ? { surface, refId, speakerParticipantId: speaker } : { surface, refId };
type Slot = ExtractedSlot;
const dest = (a: string): Slot => ({ key: "destination_area", value: { areaText: a }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("form_input", "f:d")] });
const date = (d: string): Slot => ({ key: "date_or_range", value: { kind: "single_day", date: d }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("session_context", "s:w")] });
const budget = (hi: number): Slot => ({ key: "budget_band", value: { lo: 0, hi, confidence: 0.9, currency: "JPY" }, status: "confirmed", fillState: "filled", confidence: 0.9, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("quick_action", "a:b")] });
const softPref = (v: string, vis: "shared" | "private", owner: string): Slot => ({ key: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 0.7, owner: { kind: "participant", participantId: owner }, visibility: vis, evidence: [ev("chat_message", "m:s", owner)] });

function pipeline(slots: Slot[]): { decision: DecisionResult; readiness: ReadinessResult; comparison: ProposalComparison } {
  const result = buildProposals({ participantIds: ["P1", "P2"], slots });
  const comparison = compareProposals({ result, slots });
  const decision = decide({ comparison });
  const selected = result.proposals.find((p) => p.candidateId === decision.recommendedProposalId) ?? null;
  const readiness = assessReadiness({ decision, selected });
  return { decision, readiness, comparison };
}
const scen = (trigger: ContingencyScenario["trigger"], severity: number, visibility: "shared" | "private" = "shared", participantId?: string): ContingencyScenario => ({ trigger, severity, visibility, participantId });
const plan = (slots: Slot[], scenarios: ContingencyScenario[]) => planContingencies({ ...pipeline(slots), scenarios });

// ── 合成（no-alt fail-closed 用） ──
const mkEntry = (id: string, angle: ProposalComparisonEntry["angle"], role: ProposalComparisonEntry["role"]): ProposalComparisonEntry => ({ candidateId: id, angle, role, softMatchCount: 0, stretchCount: 0, uncertainty: "low", missingCount: 0, dominatedBy: [], paretoOptimal: true });
const synthInput = (entries: ProposalComparisonEntry[], recId: string, scenarios: ContingencyScenario[]): ContingencyInput => ({
  decision: { state: "recommend", recommendedProposalId: recId, tiedProposalIds: [], followUpQuestion: null, blockers: [], consensusReadiness: "ready", impact: [], tiltedByHistory: false, tiltVisibility: null, rationale: { shared: "", forParticipant: {} }, inputError: null },
  readiness: { authoritative: true, state: "ready_to_propose", actionKind: "propose_plan", requiredConfirmations: [], riskFlags: [], blockers: [], pendingQuestion: null, participantApprovalRequired: [], rationale: { shared: "", forParticipant: {} }, inputError: null },
  comparison: { participantIds: ["P1", "P2"], entries, paretoOptimalIds: entries.map((e) => e.candidateId), diffs: [], fairness: [], blockers: [], prioritizedQuestions: [], summary: { shared: "", forParticipant: {} }, inputError: null },
  scenarios,
});

// ════════════════════════════════════════════════════════════════════════════
const base = [dest("京都"), date("2026-07-01"), budget(30000)];

describe("1. 低リスクは keep_plan", () => {
  it("severity 低 → keep_plan・readinessImpact 維持", () => {
    const p = plan([...base, softPref("nature", "shared", "P1")], [scen("delay", 0.2)]);
    expect(p.branches[0].fallbackAction).toBe("keep_plan");
  });
});

describe("2. 高 delay / time shrink → downgrade or ask", () => {
  it("delay 高 → 易しい代替へ downgrade_to_easy", () => {
    const p = plan([...base, softPref("nature", "shared", "P1")], [scen("delay", 0.8), scen("time_window_shrink", 0.9)]);
    expect(p.branches[0].fallbackAction).toBe("downgrade_to_easy");
    expect(p.branches[0].switchToProposalId).toBeTruthy();
    expect(p.branches[1].fallbackAction).toBe("downgrade_to_easy");
  });
});

describe("3. 天候は屋外/nature から切替（weather API なし）", () => {
  it("rain 高 + nature 推奨 → switch_proposal(屋内系)", () => {
    const p = plan([...base, softPref("nature", "shared", "P1")], [scen("rain_or_weather", 0.8)]);
    expect(p.recommendedProposalId).toBe("proposal:nature");
    expect(p.branches[0].fallbackAction).toBe("switch_proposal");
    expect(["proposal:culture", "proposal:food_focused", "proposal:relaxed"]).toContain(p.branches[0].switchToProposalId);
  });
});

describe("4. 疲労は易しい案を優先", () => {
  it("fatigue 高 + active(push) 推奨 → easy 案へ switch", () => {
    const p = plan([...base, softPref("active", "shared", "P1")], [scen("fatigue", 0.8)]);
    expect(p.recommendedProposalId).toBe("proposal:active");
    expect(p.branches[0].fallbackAction).toBe("switch_proposal");
    expect(p.branches[0].switchToProposalId).toBe("proposal:relaxed");
  });
});

describe("5. 休業はブロックか切替", () => {
  it("closure + 代替あり → switch_proposal", () => {
    const p = plan([...base, softPref("nature", "shared", "P1")], [scen("closure", 0.6)]);
    expect(p.branches[0].fallbackAction).toBe("switch_proposal");
  });
});

describe("6. 予算ショックは有償/高予算をブロック", () => {
  it("budget_shock 高 → ask_question + readinessImpact blocked", () => {
    const p = plan([...base, softPref("nature", "shared", "P1")], [scen("budget_shock", 0.8)]);
    expect(p.branches[0].fallbackAction).toBe("ask_question");
    expect(p.branches[0].readinessImpact).toBe("blocked");
    expect(p.branches[0].question?.slotKey).toBe("budget_band");
  });
});

describe("7. 同行者不在は schedule-hold/reserve をブロック", () => {
  it("participant_unavailable → defer + blocked", () => {
    const p = plan([...base, softPref("nature", "shared", "P1")], [scen("participant_unavailable", 0.5, "shared", "P2")]);
    expect(p.branches[0].fallbackAction).toBe("defer");
    expect(p.branches[0].readinessImpact).toBe("blocked");
  });
});

describe("8+13. private scenario は fallback に影響するが shared に漏れない", () => {
  const CANARY = "SECRET_contingency_zzz";
  it("private fatigue は分岐を生む(full)が shared 射影で除去・canary 非漏洩", () => {
    const p = planContingencies({ ...pipeline([...base, softPref("active", "shared", "P1"), softPref(CANARY, "private", "P1")]), scenarios: [scen("fatigue", 0.8, "private", "P1")] });
    expect(p.branches[0].fallbackAction).toBe("switch_proposal"); // full では fallback あり
    const shared = toSharedContingencyView(p);
    expect(shared.branches).toHaveLength(0); // private 分岐は除去
    expect(JSON.stringify(shared)).not.toContain(CANARY);
    expect(JSON.stringify(shared)).not.toContain("疲れ");
    expect(JSON.stringify(p)).toContain(CANARY); // full には残る
    expect(() => assertNoEngineOnlyLeak(shared)).not.toThrow();
  });
});

describe("9. shared scenario は shared rationale に出る", () => {
  it("shared rain は shared 射影に残り理由が出る", () => {
    const p = plan([...base, softPref("nature", "shared", "P1")], [scen("rain_or_weather", 0.8, "shared")]);
    const shared = toSharedContingencyView(p);
    expect(shared.branches).toHaveLength(1);
    expect(shared.branches[0].rationale.shared).toContain("天候");
  });
});

describe("10. no fallback は fail closed", () => {
  it("closure + 代替なし(単一案) → cancel + blocked", () => {
    const p = planContingencies(synthInput([mkEntry("proposal:relaxed", "relaxed", "easy")], "proposal:relaxed", [scen("closure", 0.8)]));
    expect(p.branches[0].fallbackAction).toBe("cancel");
    expect(p.branches[0].readinessImpact).toBe("blocked");
  });
  it("rain + 屋内代替なし(nature 単一) → defer + blocked", () => {
    const p = planContingencies(synthInput([mkEntry("proposal:nature", "nature", "easy")], "proposal:nature", [scen("rain_or_weather", 0.8)]));
    expect(p.branches[0].fallbackAction).toBe("defer");
    expect(p.branches[0].readinessImpact).toBe("blocked");
  });
});

describe("11+12. 決定論 / participantId のみ", () => {
  it("同一入力 → 深い等価", () => {
    const input: ContingencyInput = { ...pipeline([...base, softPref("nature", "shared", "P1")]), scenarios: [scen("rain_or_weather", 0.8), scen("fatigue", 0.7)] };
    expect(planContingencies(input)).toEqual(planContingencies(input));
  });
  it("出力に source kind / provider mode の語が出ない", () => {
    const p = plan([...base, softPref("nature", "private", "P1")], [scen("delay", 0.8)]);
    const json = JSON.stringify(p);
    for (const f of ["talk_pair_member", "culcept_relation", "plan_session", "fixture", "talk_thread", "providerMode", "sourceKind"]) expect(json).not.toContain(f);
  });
});

describe("T7.1. 権限境界: shared 射影は実行権限にならない", () => {
  it("全 keep_plan(低 severity) → authoritative は hasContingencyActionAuthority=true・shared は常に false", () => {
    const p = plan([...base, softPref("nature", "shared", "P1")], [scen("delay", 0.1)]);
    expect(p.authoritative).toBe(true);
    expect(hasContingencyActionAuthority(p)).toBe(true);
    expect(hasContingencyActionAuthority(toSharedContingencyView(p))).toBe(false); // display は権限にならない
  });
  it("private 分岐で defer/blocked → authoritative に残り権限なし・shared は分岐を隠すが権限も付与しない", () => {
    const p = planContingencies({ ...pipeline([...base, softPref("nature", "shared", "P1")]), scenarios: [scen("participant_unavailable", 0.5, "private", "P2")] });
    // authoritative: private 分岐(defer)が残る → 実行権限なし
    expect(p.branches[0].fallbackAction).toBe("defer");
    expect(hasContingencyActionAuthority(p)).toBe(false);
    // shared: private 分岐は隠れる(branches 空に見え得る)が authoritative=false → 権限にならない
    const shared = toSharedContingencyView(p);
    expect(shared.branches).toHaveLength(0);
    expect(shared.authoritative).toBe(false);
    expect(hasContingencyActionAuthority(shared)).toBe(false);
  });
});

describe("recommend 未確定なら分岐なし", () => {
  it("tie(soft pref なし) → recommendedProposalId null・branches 空", () => {
    const p = plan(base, [scen("rain_or_weather", 0.8)]);
    expect(p.recommendedProposalId).toBeNull();
    expect(p.branches).toHaveLength(0);
  });
});
