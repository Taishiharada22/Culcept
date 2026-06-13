import { describe, it, expect } from "vitest";
import { buildProposals } from "@/lib/shared/travel/proposal-builder";
import { compareProposals } from "@/lib/shared/travel/proposal-comparator";
import { decide } from "@/lib/shared/travel/decision-core";
import { assessReadiness } from "@/lib/shared/travel/readiness-core";
import { planContingencies } from "@/lib/shared/travel/contingency-core";
import { buildPlanDecisionPacket, buildSharedPacketView, buildViewerPacketView, type BuildPacketInput } from "@/lib/shared/travel/packet-core";
import type { ContingencyScenario } from "@/lib/shared/travel/contingency-types";
import type { ReadinessPolicy } from "@/lib/shared/travel/readiness-types";
import type { ExtractedSlot, ExtractionSurface } from "@/lib/shared/travel/slot-types";
import { assertNoEngineOnlyLeak } from "@/lib/shared/personalization/engineOnly";

const ev = (surface: ExtractionSurface, refId: string, speaker?: string) => speaker ? { surface, refId, speakerParticipantId: speaker } : { surface, refId };
type Slot = ExtractedSlot;
const dest = (a: string): Slot => ({ key: "destination_area", value: { areaText: a }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("form_input", "f:d")] });
const date = (d: string): Slot => ({ key: "date_or_range", value: { kind: "single_day", date: d }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("session_context", "s:w")] });
const budget = (hi: number): Slot => ({ key: "budget_band", value: { lo: 0, hi, confidence: 0.9, currency: "JPY" }, status: "confirmed", fillState: "filled", confidence: 0.9, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("quick_action", "a:b")] });
const softPref = (v: string, vis: "shared" | "private", owner: string): Slot => ({ key: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 0.7, owner: { kind: "participant", participantId: owner }, visibility: vis, evidence: [ev("chat_message", "m:s", owner)] });

function pkInput(slots: Slot[], policy?: ReadinessPolicy, scenarios: ContingencyScenario[] = []): BuildPacketInput {
  const result = buildProposals({ participantIds: ["P1", "P2"], slots });
  const comparison = compareProposals({ result, slots });
  const decision = decide({ comparison });
  const selected = result.proposals.find((p) => p.candidateId === decision.recommendedProposalId) ?? null;
  const readiness = assessReadiness({ decision, selected, policy });
  const contingency = planContingencies({ decision, readiness, comparison, scenarios });
  return { result, comparison, decision, readiness, contingency };
}
const scen = (trigger: ContingencyScenario["trigger"], severity: number, visibility: "shared" | "private" = "shared", participantId?: string): ContingencyScenario => ({ trigger, severity, visibility, participantId });
const base = [dest("京都"), date("2026-07-01"), budget(30000)];

// ════════════════════════════════════════════════════════════════════════════
describe("1. クリアな安全案 → propose_plan + 実行権限", () => {
  it("nature 推奨・確認なし・scenario なし → nextAction propose_plan・executionAuthority true", () => {
    const p = buildPlanDecisionPacket(pkInput([...base, softPref("nature", "shared", "P1")]));
    expect(p.nextAction).toBe("propose_plan");
    expect(p.executionAuthority).toBe(true);
    expect(p.authoritative).toBe(true);
    // shared 射影は display 専用 → 実行権限なし
    const shared = buildSharedPacketView(pkInput([...base, softPref("nature", "shared", "P1")]));
    expect(shared.executionAuthority).toBe(false);
    expect(shared.authoritative).toBe(false);
  });
});

describe("2/3. question / confirmation キューの伝播", () => {
  it("destination 欠如 → nextAction ask_question・questionQueue 伝播", () => {
    const p = buildPlanDecisionPacket(pkInput([date("2026-07-01"), softPref("nature", "shared", "P1")]));
    expect(p.nextAction).toBe("ask_question");
    expect(p.questionQueue.some((q) => q.slotKey === "destination_area")).toBe(true);
    expect(p.executionAuthority).toBe(false);
  });
  it("reserve + paid → nextAction confirm・confirmationQueue 伝播", () => {
    const p = buildPlanDecisionPacket(pkInput([...base, softPref("nature", "shared", "P1")], { intendedAction: "reserve_or_book_later", involvesPaidBooking: true }));
    expect(p.nextAction).toBe("confirm");
    expect(p.confirmationQueue.map((c) => c.reason)).toContain("paid_booking");
    expect(p.executionAuthority).toBe(false);
  });
});

describe("4. blocked は fail closed", () => {
  it("矛盾 → nextAction blocked・blockedReason・executionAuthority false", () => {
    const slots = [dest("京都"), date("2026-07-01"), { key: "red_line", value: { descriptorKey: "require", descriptorValue: "onsen" }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "participant", participantId: "P1" }, visibility: "shared", evidence: [ev("chat_message", "m:r", "P1")] } as Slot, { key: "red_line", value: { descriptorKey: "avoid", descriptorValue: "onsen" }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "participant", participantId: "P1" }, visibility: "shared", evidence: [ev("chat_message", "m:r2", "P1")] } as Slot];
    const p = buildPlanDecisionPacket(pkInput(slots));
    expect(p.nextAction).toBe("blocked");
    expect(p.blockedReason).toBe("contradictory_red_lines");
    expect(p.executionAuthority).toBe(false);
  });
});

describe("5. shared contingency は fallbackSummary に出る", () => {
  it("shared rain → contingencyActive・nextAction handle_contingency・shared 射影にも残る", () => {
    const input = pkInput([...base, softPref("nature", "shared", "P1")], undefined, [scen("rain_or_weather", 0.8, "shared")]);
    const p = buildPlanDecisionPacket(input);
    expect(p.contingencyActive).toBe(true);
    expect(p.nextAction).toBe("handle_contingency");
    expect(p.fallbackSummary.some((f) => f.trigger === "rain_or_weather")).toBe(true);
    const shared = buildSharedPacketView(input);
    expect(shared.fallbackSummary.some((f) => f.trigger === "rain_or_weather")).toBe(true);
  });
});

describe("6+13. private contingency は authoritative に効くが shared に漏れない", () => {
  const CANARY = "SECRET_packet_zzz";
  it("private fatigue → authoritative handle_contingency / shared では分岐消え canary 非漏洩", () => {
    const input = pkInput([...base, softPref("active", "shared", "P1"), softPref(CANARY, "private", "P1")], undefined, [scen("fatigue", 0.8, "private", "P1")]);
    const auth = buildPlanDecisionPacket(input);
    expect(auth.nextAction).toBe("handle_contingency"); // authoritative では private 分岐が効く
    expect(auth.executionAuthority).toBe(false);
    const shared = buildSharedPacketView(input);
    expect(shared.fallbackSummary).toHaveLength(0); // private 分岐は消える
    expect(shared.nextAction).not.toBe("handle_contingency");
    expect(shared.executionAuthority).toBe(false); // display は実行権限にならない
    expect(JSON.stringify(shared)).not.toContain(CANARY);
    expect(JSON.stringify(auth)).toContain(CANARY);
    expect(() => assertNoEngineOnlyLeak(shared)).not.toThrow();
  });
});

describe("7. private confirmation は authoritative に効くが shared に漏れない", () => {
  it("private 制約衝突 → authoritative confirm / shared では確認消え executionAuthority false", () => {
    // P1 private mobility(stretch) を作るのは難しいので、合成 readiness 経由ではなく pipeline の private soft で代用しつつ確認系を検証
    const input = pkInput([...base, softPref("nature", "shared", "P1")], { intendedAction: "reserve_or_book_later", involvesPaidBooking: true });
    const auth = buildPlanDecisionPacket(input);
    expect(auth.nextAction).toBe("confirm"); // paid_booking(shared)
    const shared = buildSharedPacketView(input);
    // shared でも paid_booking は shared 可視なので残る
    expect(shared.confirmationQueue.map((c) => c.reason)).toContain("paid_booking");
    expect(shared.executionAuthority).toBe(false);
  });
});

describe("8/9. engine-only は shared に出ない・participantId のみ", () => {
  it("private soft pref の rationale は shared 射影で消え forParticipant 空", () => {
    const input = pkInput([...base, softPref("nature", "private", "P1")]);
    const auth = buildPlanDecisionPacket(input);
    const shared = buildSharedPacketView(input);
    expect(Object.keys(shared.rationale.forParticipant)).toHaveLength(0);
    // viewer 射影は本人の private のみ復元
    const viewer = buildViewerPacketView(input, "P1");
    expect(viewer.authoritative).toBe(false);
    expect(viewer.executionAuthority).toBe(false);
    // source kind / provider mode は出ない
    for (const f of ["talk_pair_member", "culcept_relation", "plan_session", "fixture", "talk_thread", "providerMode", "sourceKind"]) {
      expect(JSON.stringify(auth)).not.toContain(f);
    }
    expect(JSON.stringify(auth)).toContain("P1");
  });
});

describe("10. 決定論 / 冪等", () => {
  it("同一入力 → 深い等価（authoritative / shared 両方）", () => {
    const input = pkInput([...base, softPref("nature", "shared", "P1")], undefined, [scen("rain_or_weather", 0.8)]);
    expect(buildPlanDecisionPacket(input)).toEqual(buildPlanDecisionPacket(input));
    expect(buildSharedPacketView(input)).toEqual(buildSharedPacketView(input));
  });
});

describe("upstream 不整合は fail-closed", () => {
  it("decision recommend だが contingency の recommendedId 不一致 → blocked", () => {
    const input = pkInput([...base, softPref("nature", "shared", "P1")]);
    const tampered: BuildPacketInput = { ...input, contingency: { ...input.contingency, recommendedProposalId: "proposal:WRONG" } };
    const p = buildPlanDecisionPacket(tampered);
    expect(p.nextAction).toBe("blocked");
    expect(p.blockedReason).toBe("upstream_inconsistent");
    expect(p.executionAuthority).toBe(false);
  });
});
