import { describe, it, expect } from "vitest";
import { runTravelPlanEngine } from "@/lib/shared/travel/engine";
import type { TravelPlanEngineInput } from "@/lib/shared/travel/engine-types";
import type { ExtractedSlot, ExtractionSurface } from "@/lib/shared/travel/slot-types";
import { assertNoEngineOnlyLeak } from "@/lib/shared/personalization/engineOnly";

const ev = (surface: ExtractionSurface, refId: string, speaker?: string) => speaker ? { surface, refId, speakerParticipantId: speaker } : { surface, refId };
type Slot = ExtractedSlot;
const dest = (a: string): Slot => ({ key: "destination_area", value: { areaText: a }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("form_input", "f:d")] });
const date = (d: string): Slot => ({ key: "date_or_range", value: { kind: "single_day", date: d }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("session_context", "s:w")] });
const budget = (hi: number): Slot => ({ key: "budget_band", value: { lo: 0, hi, confidence: 0.9, currency: "JPY" }, status: "confirmed", fillState: "filled", confidence: 0.9, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("quick_action", "a:b")] });
const softPref = (v: string, vis: "shared" | "private", owner: string): Slot => ({ key: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 0.7, owner: { kind: "participant", participantId: owner }, visibility: vis, evidence: [ev("chat_message", "m:s", owner)] });
const pace = (p: "slow" | "normal" | "intense"): Slot => ({ key: "pace", value: p, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("chat_message", "m:p")] });
const mobility = (km: number, vis: "shared" | "private", owner: string): Slot => ({ key: "mobility_tolerance", value: { maxWalkKm: km }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "participant", participantId: owner }, visibility: vis, evidence: [ev("chat_message", "m:mob", owner)] });
const redLine = (k: "require" | "avoid", v: string): Slot => ({ key: "red_line", value: { descriptorKey: k, descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "participant", participantId: "P1" }, visibility: "shared", evidence: [ev("chat_message", "m:r", "P1")] });

const eng = (slots: Slot[], opts: Partial<TravelPlanEngineInput> = {}) => runTravelPlanEngine({ slots, participantIds: ["P1", "P2"], ...opts });
const base = [dest("京都"), date("2026-07-01"), budget(30000)];

// ════════════════════════════════════════════════════════════════════════════
describe("1. 低リスク → 提案可能 packet・shared は実行権限なし", () => {
  it("nature 推奨 → authoritative propose_plan + executionAuthority true / shared は false", () => {
    const o = eng([...base, softPref("nature", "shared", "P1")]);
    expect(o.authoritative.nextAction).toBe("propose_plan");
    expect(o.authoritative.executionAuthority).toBe(true);
    expect(o.shared.executionAuthority).toBe(false);
    expect(o.viewer).toBeNull();
    expect(o.diagnostics.executionAuthority).toBe(true);
    expect(o.diagnostics.nextAction).toBe("propose_plan");
  });
});

describe("2. required 欠如 → question packet", () => {
  it("destination 欠如 → ask_question・executionAuthority false", () => {
    const o = eng([date("2026-07-01"), softPref("nature", "shared", "P1")]);
    expect(o.authoritative.nextAction).toBe("ask_question");
    expect(o.authoritative.questionQueue.some((q) => q.slotKey === "destination_area")).toBe(true);
    expect(o.authoritative.executionAuthority).toBe(false);
  });
});

describe("3. private 制約は authoritative に効くが shared に漏れない", () => {
  const CANARY = "SECRET_engine_zzz";
  it("private soft pref canary は authoritative にあり shared に無い", () => {
    const o = eng([...base, softPref("nature", "shared", "P1"), softPref(CANARY, "private", "P1")], { viewerId: "P1" });
    expect(JSON.stringify(o.authoritative)).toContain(CANARY);
    expect(JSON.stringify(o.shared)).not.toContain(CANARY);
    // viewer(P1) は本人の private を見られる
    expect(JSON.stringify(o.viewer)).toContain(CANARY);
    expect(() => assertNoEngineOnlyLeak(o.shared)).not.toThrow();
  });
});

describe("4. private confirmation は authority をブロックし shared は非漏洩", () => {
  it("pace=intense で active 単独勝者・private mobility stretch → authoritative confirm / shared 非漏洩", () => {
    // pace intense: relaxed を reject、active を fit にして単独 pareto に。private mobility(3) で active に private stretch。
    const slots = [...base, pace("intense"), softPref("active", "shared", "P1"), mobility(3, "private", "P1")];
    const o = eng(slots, { viewerId: "P2" });
    expect(o.authoritative.recommendedProposalId).toBe("proposal:active");
    expect(o.authoritative.nextAction).toBe("confirm"); // private_constraint_conflict
    expect(o.authoritative.executionAuthority).toBe(false);
    expect(o.authoritative.confirmationQueue.map((c) => c.reason)).toContain("private_constraint_conflict");
    // shared / viewer(P2=相手): private 確認は消え executionAuthority も false・private reason 非漏洩
    expect(o.shared.confirmationQueue.map((c) => c.reason)).not.toContain("private_constraint_conflict");
    expect(o.shared.executionAuthority).toBe(false);
    expect(o.viewer!.executionAuthority).toBe(false);
  });
});

describe("5. contingency は shared のときのみ shared/authoritative 両方に・private は authoritative のみ", () => {
  it("shared rain → 両方に handle_contingency 系・fallbackSummary に出る", () => {
    const o = eng([...base, softPref("nature", "shared", "P1")], { scenarios: [{ trigger: "rain_or_weather", severity: 0.8, visibility: "shared" }] });
    expect(o.authoritative.contingencyActive).toBe(true);
    expect(o.authoritative.nextAction).toBe("handle_contingency");
    expect(o.shared.fallbackSummary.some((f) => f.trigger === "rain_or_weather")).toBe(true);
  });
  it("private fatigue → authoritative のみ active・shared では消える", () => {
    const o = eng([...base, softPref("active", "shared", "P1")], { scenarios: [{ trigger: "fatigue", severity: 0.8, visibility: "private", participantId: "P1" }] });
    expect(o.authoritative.nextAction).toBe("handle_contingency");
    expect(o.shared.fallbackSummary).toHaveLength(0);
    expect(o.shared.nextAction).not.toBe("handle_contingency");
    expect(o.shared.executionAuthority).toBe(false);
  });
});

describe("6. no fallback / blocking contingency は fail closed", () => {
  it("participant_unavailable → defer・executionAuthority false", () => {
    const o = eng([...base, softPref("nature", "shared", "P1")], { scenarios: [{ trigger: "participant_unavailable", severity: 0.6, visibility: "shared", participantId: "P2" }] });
    expect(o.authoritative.fallbackSummary[0].fallbackAction).toBe("defer");
    expect(o.authoritative.executionAuthority).toBe(false);
  });
});

describe("7. fairness history は tie を tilt するが blocker を覆さない", () => {
  const split = [...base, softPref("nature", "shared", "P1"), softPref("art", "shared", "P2")];
  it("履歴なし → tie(await_preference)", () => {
    expect(eng(split).authoritative.nextAction).toBe("await_preference");
  });
  it("履歴(P1寄り) → P2寄り(culture)へ tilt → recommend", () => {
    const o = eng(split, { fairnessHistory: { participantA: "P1", participantB: "P2", priorBias: -0.5, visibility: "shared" } });
    expect(o.authoritative.recommendedProposalId).toBe("proposal:culture");
    expect(o.authoritative.nextAction).toBe("propose_plan");
  });
  it("required 欠如は履歴で覆らない → ask_question", () => {
    const o = eng([softPref("nature", "shared", "P1"), softPref("art", "shared", "P2")], { fairnessHistory: { participantA: "P1", participantB: "P2", priorBias: -0.9, visibility: "shared" } });
    expect(o.authoritative.nextAction).toBe("ask_question");
  });
});

describe("8+9. source-agnostic・participantId のみ", () => {
  it("出力に source kind / provider mode の語が出ない・participantId は使う", () => {
    const o = eng([...base, softPref("nature", "private", "P1")], { viewerId: "P1" });
    const json = JSON.stringify(o);
    for (const f of ["talk_pair_member", "culcept_relation", "plan_session", "fixture", "talk_thread", "providerMode", "sourceKind"]) expect(json).not.toContain(f);
    expect(json).toContain("P1");
  });
});

describe("10. 矛盾は end-to-end fail closed", () => {
  it("require+avoid → blocked・inputError 伝播・executionAuthority false", () => {
    const o = eng([dest("京都"), date("2026-07-01"), redLine("require", "onsen"), redLine("avoid", "onsen")]);
    expect(o.authoritative.nextAction).toBe("blocked");
    expect(o.inputError).toBe("contradictory_red_lines");
    expect(o.authoritative.executionAuthority).toBe(false);
  });
});

describe("11. 決定論 / 冪等", () => {
  it("同一入力 → 深い等価", () => {
    const input: TravelPlanEngineInput = { slots: [...base, softPref("nature", "shared", "P1")], participantIds: ["P1", "P2"], scenarios: [{ trigger: "rain_or_weather", severity: 0.8, visibility: "shared" }], viewerId: "P1" };
    expect(runTravelPlanEngine(input)).toEqual(runTravelPlanEngine(input));
  });
});

describe("12. 射影は実行権限を付与しない", () => {
  it("クリア recommend でも shared/viewer の executionAuthority は false", () => {
    const o = eng([...base, softPref("nature", "shared", "P1")], { viewerId: "P1" });
    expect(o.authoritative.executionAuthority).toBe(true);
    expect(o.shared.executionAuthority).toBe(false);
    expect(o.viewer!.executionAuthority).toBe(false);
    expect(o.shared.authoritative).toBe(false);
    expect(o.viewer!.authoritative).toBe(false);
  });
});
