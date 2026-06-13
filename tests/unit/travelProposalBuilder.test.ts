import { describe, it, expect } from "vitest";
import { buildProposals, toSharedProposalView, type BuildProposalsInput } from "@/lib/shared/travel/proposal-builder";
import { PROPOSAL_ANGLES, MVP_MAX_PROPOSALS } from "@/lib/shared/travel/proposal-types";
import type { ExtractedSlot, ExtractionSurface } from "@/lib/shared/travel/slot-types";
import { assertNoEngineOnlyLeak } from "@/lib/shared/personalization/engineOnly";

// ── slot factory（normalized 済みを模す） ──
const ev = (surface: ExtractionSurface, refId: string, speaker?: string) =>
  speaker ? { surface, refId, speakerParticipantId: speaker } : { surface, refId };

type Slot = ExtractedSlot;
const dest = (areaText: string, vis: "shared" | "private" = "shared", owner?: string): Slot => ({ key: "destination_area", value: { areaText }, status: "confirmed", fillState: "filled", confidence: 1, owner: owner ? { kind: "participant", participantId: owner } : { kind: "shared" }, visibility: vis, evidence: [ev("form_input", "f:dest")] });
const date = (d: string): Slot => ({ key: "date_or_range", value: { kind: "single_day", date: d }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("session_context", "s:win")] });
const budget = (hi: number): Slot => ({ key: "budget_band", value: { lo: 0, hi, confidence: 0.9, currency: "JPY" }, status: "confirmed", fillState: "filled", confidence: 0.9, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("quick_action", "a:b")] });
const pace = (p: "slow" | "normal" | "intense", vis: "shared" | "private" = "shared", owner?: string): Slot => ({ key: "pace", value: p, status: "confirmed", fillState: "filled", confidence: 1, owner: owner ? { kind: "participant", participantId: owner } : { kind: "shared" }, visibility: vis, evidence: [ev("chat_message", "m:p", owner)] });
const mobility = (maxWalkKm: number, vis: "shared" | "private" = "shared", owner?: string): Slot => ({ key: "mobility_tolerance", value: { maxWalkKm }, status: "confirmed", fillState: "filled", confidence: 1, owner: owner ? { kind: "participant", participantId: owner } : { kind: "shared" }, visibility: vis, evidence: [ev("chat_message", "m:mob", owner)] });
const redLine = (k: "require" | "avoid", v: string, vis: "shared" | "private" = "shared", owner = "P1"): Slot => ({ key: "red_line", value: { descriptorKey: k, descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "participant", participantId: owner }, visibility: vis, evidence: [ev("chat_message", "m:rl", owner)] });
const softPref = (k: "prefer" | "food_focus" | "atmosphere" | "scene", v: string, vis: "shared" | "private" = "shared", owner = "P1"): Slot => ({ key: "soft_preference", value: { descriptorKey: k, descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 0.7, owner: { kind: "participant", participantId: owner }, visibility: vis, evidence: [ev("chat_message", "m:sp", owner)] });

const input = (slots: Slot[], participantIds = ["P1", "P2"]): BuildProposalsInput => ({ participantIds, slots });

// ════════════════════════════════════════════════════════════════════════════
describe("1. confirmed slots → 安定した候補", () => {
  it("destination/date/budget 揃いで提案が出る（最大3案・id 決定論）", () => {
    const out = buildProposals(input([dest("軽井沢"), date("2026-07-01"), budget(30000)]));
    expect(out.inputError).toBeNull();
    expect(out.proposals.length).toBeGreaterThan(0);
    expect(out.proposals.length).toBeLessThanOrEqual(MVP_MAX_PROPOSALS);
    expect(out.proposals[0].candidateId).toMatch(/^proposal:/);
    expect(out.proposals.every((p) => p.areaPlaceholder === "軽井沢")).toBe(true);
    expect(out.proposals.every((p) => p.budgetBand?.hi === 30000)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. 欠損 → missing questions", () => {
  it("destination/date 欠如 → required・budget 欠如 → recommended・uncertainty 反映", () => {
    const out = buildProposals(input([pace("slow")]));
    const intents = out.missingQuestions.map((q) => q.questionIntent);
    expect(intents).toContain("ask_destination");
    expect(intents).toContain("ask_date");
    expect(intents).toContain("ask_budget");
    expect(out.missingQuestions.find((q) => q.questionIntent === "ask_destination")?.priority).toBe("required");
    expect(out.missingQuestions.find((q) => q.questionIntent === "ask_budget")?.priority).toBe("recommended");
    expect(out.proposals.every((p) => p.uncertainty === "high")).toBe(true); // destination 欠如
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. hard constraints fail closed", () => {
  it("pace=slow → active 角度は conflict で reject", () => {
    const out = buildProposals(input([dest("京都"), date("2026-07-01"), pace("slow")]));
    expect(out.proposals.every((p) => p.angle !== "active")).toBe(true);
    expect(out.rejected.some((r) => r.angle === "active")).toBe(true);
  });
  it("低 mobility(2km) → high-fatigue(active) reject", () => {
    const out = buildProposals(input([dest("京都"), date("2026-07-01"), mobility(2)]));
    expect(out.rejected.some((r) => r.angle === "active")).toBe(true);
  });
  it("avoid:food → food_focused 角度 reject", () => {
    const out = buildProposals(input([dest("京都"), date("2026-07-01"), redLine("avoid", "food")]));
    expect(out.proposals.every((p) => p.angle !== "food_focused")).toBe(true);
  });
  it("require:X + avoid:X 矛盾 → 全提案不能(contradictory_red_lines)", () => {
    const out = buildProposals(input([dest("京都"), date("2026-07-01"), redLine("require", "onsen"), redLine("avoid", "onsen")]));
    expect(out.inputError).toBe("contradictory_red_lines");
    expect(out.proposals).toHaveLength(0);
  });
  it("participant 1-2 でない → invalid_participants", () => {
    expect(buildProposals(input([dest("京都")], [])).inputError).toBe("invalid_participants");
    expect(buildProposals(input([dest("京都")], ["P1", "P2", "P3"])).inputError).toBe("invalid_participants");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. private 制約は validity に影響するが shared rationale に漏れない", () => {
  const CANARY = "SECRET_private_avoid_xyz";
  // P1 の private red_line(avoid:food) で food_focused を落とす
  const out = () => buildProposals(input([dest("京都"), date("2026-07-01"), redLine("avoid", "food", "private", "P1"), softPref("prefer", "nature", "private", "P1")]));

  it("private avoid が food_focused の validity に影響（reject される）", () => {
    const o = out();
    expect(o.proposals.every((p) => p.angle !== "food_focused")).toBe(true);
    // full 出力には private 違反が載る
    expect(o.rejected.some((r) => r.violations.some((v) => v.visibility === "private"))).toBe(true);
  });

  it("shared 射影: private 由来 reject は隠れ・forParticipant 消去・private descriptor 非出現", () => {
    // canary を private red_line に仕込む（food と別 angle を落とす avoid:active）
    const o = buildProposals(input([dest("京都"), date("2026-07-01"), redLine("avoid", "active", "private", "P1"), { key: "red_line", value: { descriptorKey: "avoid", descriptorValue: CANARY }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "participant", participantId: "P1" }, visibility: "private", evidence: [ev("chat_message", "m:c", "P1")] }]));
    const shared = toSharedProposalView(o);
    const sharedJson = JSON.stringify(shared);
    expect(sharedJson).not.toContain(CANARY);
    // shared 射影の proposal は forParticipant 空
    expect(shared.proposals.every((p) => Object.keys(p.rationale.forParticipant).length === 0)).toBe(true);
    // private 違反のみの rejected は shared 射影から消える
    expect(shared.rejected.every((r) => r.violations.every((v) => v.visibility === "shared"))).toBe(true);
    // full 出力には canary が存在する（owner 側には見える）
    expect(JSON.stringify(o)).toContain(CANARY);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. shared 条件は shared rationale に出る", () => {
  it("shared destination/budget が shared 文に含まれる", () => {
    const out = buildProposals(input([dest("軽井沢"), date("2026-07-01"), budget(30000)]));
    const shared = toSharedProposalView(out);
    expect(shared.proposals[0].rationale.shared).toContain("軽井沢");
    expect(shared.proposals[0].rationale.shared.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6/7. participantId のみ・source kind / provider mode は出力に出ない", () => {
  it("出力 JSON に source kind / provider mode の語が出ない・participantId は使う", () => {
    const out = buildProposals(input([dest("京都"), date("2026-07-01"), softPref("prefer", "nature", "private", "P1")]));
    const json = JSON.stringify(out);
    for (const forbidden of ["talk_pair_member", "culcept_relation", "plan_session", "fixture", "talk_thread", "providerMode", "sourceKind"]) {
      expect(json).not.toContain(forbidden);
    }
    expect(json).toContain("P1");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("8. 決定論 / 冪等", () => {
  it("同一入力 → 深い等価", () => {
    const i = input([dest("京都"), date("2026-07-01"), budget(30000), softPref("prefer", "nature")]);
    expect(buildProposals(i)).toEqual(buildProposals(i));
  });
  it("提案順は soft 一致数 desc → 角度固定順（nature pref で nature が前に）", () => {
    const out = buildProposals(input([dest("京都"), date("2026-07-01"), softPref("prefer", "nature")]));
    const natureIdx = out.proposals.findIndex((p) => p.angle === "nature");
    expect(natureIdx).toBe(0); // soft 一致で先頭
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("9. EngineOnly / private 射影 canary は漏れない", () => {
  it("shared 射影は assertNoEngineOnlyLeak を通過（branded 混入なし）", () => {
    const out = buildProposals(input([dest("京都"), date("2026-07-01"), softPref("prefer", "nature", "private", "P1")]));
    expect(() => assertNoEngineOnlyLeak(toSharedProposalView(out))).not.toThrow();
    expect(() => assertNoEngineOnlyLeak(out)).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("T3A 型 sanity", () => {
  it("PROPOSAL_ANGLES は 5 種・重複なし", () => {
    expect(PROPOSAL_ANGLES.length).toBe(5);
    expect(new Set(PROPOSAL_ANGLES).size).toBe(5);
  });
});
