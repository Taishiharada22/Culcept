import { describe, it, expect } from "vitest";
import {
  deriveAfterActionLearning,
  applyAfterActionLearning,
  pruneExpiredDeltas,
} from "@/lib/shared/travel/after-action-core";
import type { AfterActionFeedback, AfterActionInput, AfterActionLearningDelta } from "@/lib/shared/travel/after-action-types";
import { runTravelPlanEngine } from "@/lib/shared/travel/engine";
import type { TravelPlanEngineInput } from "@/lib/shared/travel/engine-types";
import type { ExtractedSlot, ExtractionSurface } from "@/lib/shared/travel/slot-types";
import { assertNoEngineOnlyLeak } from "@/lib/shared/personalization/engineOnly";

const shared = { kind: "shared" as const };
const p = (id: string) => ({ kind: "participant" as const, participantId: id });
const fb = (over: Partial<AfterActionFeedback> & Pick<AfterActionFeedback, "dimension" | "direction">): AfterActionFeedback => ({
  magnitude: "moderate", owner: shared, visibility: "shared", ...over,
});
const derive = (feedback: AfterActionFeedback[], pastConditions?: AfterActionInput["pastConditions"]) =>
  deriveAfterActionLearning({ feedback, participantIds: ["P1", "P2"], pastConditions });
const payload = (d: AfterActionLearningDelta) => d.payload as Record<string, unknown>;

// ════════════════════════════════════════════════════════════════════════════
describe("1. 移動が多すぎた → mobility 控えめ（soft・相対）", () => {
  it("mobility reduce moderate + anchor 6km → ~4.2km・soft", () => {
    const r = derive([fb({ dimension: "mobility", direction: "reduce" })], { maxWalkKm: 6 });
    expect(r.deltas[0].target).toBe("mobility");
    expect(r.deltas[0].hardness).toBe("soft");
    expect(payload(r.deltas[0]).maxWalkKm).toBeLessThan(6);
  });
});

describe("2. 朝が早すぎた → later-start soft（hard でない）", () => {
  it("time reduce moderate + anchor 7:00 → departAfter 遅く・soft", () => {
    const r = derive([fb({ dimension: "time", direction: "reduce" })], { departAfterMin: 420 });
    expect(r.deltas[0].target).toBe("time");
    expect(payload(r.deltas[0]).departAfterMin).toBeGreaterThan(420);
    expect(r.deltas[0].hardness).toBe("soft");
  });
});

describe("3. 高すぎた → budget 調整", () => {
  it("budget reduce → hi < anchor", () => {
    const r = derive([fb({ dimension: "budget", direction: "reduce", magnitude: "strong" })], { budgetHi: 30000 });
    expect(r.deltas[0].target).toBe("budget");
    expect((payload(r.deltas[0]).band as { hi: number }).hi).toBeLessThan(30000);
  });
});

describe("4/5. 宿はよかった / 夕食付きがいい → preference reinforce", () => {
  it("lodging reinforce → prefer:descriptor（soft）", () => {
    const r = derive([fb({ dimension: "lodging", direction: "reinforce", descriptor: "onsen_ryokan" })]);
    expect(r.deltas[0].target).toBe("preference");
    expect(payload(r.deltas[0])).toMatchObject({ descriptorKey: "prefer", descriptorValue: "onsen_ryokan" });
  });
  it("食事 increase + dinner_included → prefer:dinner_included", () => {
    const r = derive([fb({ dimension: "food", direction: "increase", descriptor: "dinner_included" })]);
    expect(payload(r.deltas[0])).toMatchObject({ descriptorKey: "prefer", descriptorValue: "dinner_included" });
  });
});

describe("6. participant 不均衡 → fairness bias（hard override しない）", () => {
  it("over-favored P1 → fairness_bias・soft", () => {
    const r = derive([fb({ dimension: "participant_balance", direction: "reduce", owner: p("P1") })]);
    expect(r.deltas[0].target).toBe("fairness_bias");
    expect(payload(r.deltas[0])).toMatchObject({ overFavoredParticipantId: "P1" });
    expect(r.deltas[0].hardness).toBe("soft");
  });
});

describe("7/13. private feedback は authoritative に効くが shared に漏れない（canary）", () => {
  const CANARY = "SECRET_aa_zzz";
  it("private preference canary は forParticipant のみ・shared 文に非出現", () => {
    const r = derive([fb({ dimension: "place", direction: "avoid", descriptor: CANARY, owner: p("P1"), visibility: "private" })]);
    expect(r.rationale.shared).not.toContain(CANARY);
    expect(JSON.stringify(r.rationale.forParticipant)).not.toContain(CANARY); // 文言には descriptor を出さない設計
    expect(r.deltas[0].visibility).toBe("private");
    expect(payload(r.deltas[0]).descriptorValue).toBe(CANARY); // delta payload には保持（authoritative 次回入力で効く）
    expect(() => assertNoEngineOnlyLeak(r)).not.toThrow();
  });
  it("private feedback は participant owner 必須（shared owner private → clarification）", () => {
    const r = derive([fb({ dimension: "mobility", direction: "reduce", owner: shared, visibility: "private" })]);
    expect(r.deltas).toHaveLength(0);
    expect(r.clarifications[0].reason).toBe("private_requires_participant_owner");
  });
});

describe("8. shared feedback は shared rationale に出る", () => {
  it("shared mobility → shared 文に dimension が出る", () => {
    const r = derive([fb({ dimension: "mobility", direction: "reduce" })], { maxWalkKm: 5 });
    expect(r.rationale.shared).toContain("学び");
    expect(r.deltas[0].rationale.shared).toContain("移動");
  });
});

describe("9. 矛盾フィードバック → clarification（fail-closed）", () => {
  it("同 owner 同 dim reduce+increase → clarification・delta 出さない", () => {
    const r = derive([
      fb({ dimension: "budget", direction: "reduce" }),
      fb({ dimension: "budget", direction: "increase" }),
    ]);
    expect(r.deltas).toHaveLength(0);
    expect(r.clarifications[0].reason).toBe("conflicting_directions");
  });
});

describe("10/11. 単発弱は hard にならない・明示 hard は hard", () => {
  it("単発 slight・フラグなし → soft", () => {
    expect(derive([fb({ dimension: "pace", direction: "reduce", magnitude: "slight" })]).deltas[0].hardness).toBe("soft");
  });
  it("explicitHardRule → hard・preference は red_line 化", () => {
    const r = derive([fb({ dimension: "place", direction: "avoid", descriptor: "crowd", explicitHardRule: true })]);
    expect(r.deltas[0].hardness).toBe("hard");
    const next = applyAfterActionLearning({ slots: [], participantIds: ["P1", "P2"] }, r.deltas);
    expect(next.slots.some((s) => s.key === "red_line")).toBe(true);
  });
  it("反復証拠 ≥3 → hard 昇格", () => {
    expect(derive([fb({ dimension: "mobility", direction: "reduce", magnitude: "slight", repeatedEvidenceCount: 3 })]).deltas[0].hardness).toBe("hard");
  });
});

describe("12. 決定論 / 冪等", () => {
  it("同一入力 → 深い等価", () => {
    const input: AfterActionInput = { feedback: [fb({ dimension: "mobility", direction: "reduce" })], participantIds: ["P1", "P2"], pastConditions: { maxWalkKm: 6 } };
    expect(deriveAfterActionLearning(input)).toEqual(deriveAfterActionLearning(input));
  });
});

describe("decay: pruneExpiredDeltas（elapsed は pure input）", () => {
  it("soft delta は ttl 超過で除去・hard(ttl null) は残る", () => {
    const soft = derive([fb({ dimension: "mobility", direction: "reduce" })]).deltas;
    expect(pruneExpiredDeltas(soft, 999)).toHaveLength(0); // soft 90/180 日 < 999
    const hard = derive([fb({ dimension: "mobility", direction: "reduce", explicitHardRule: true })]).deltas;
    expect(pruneExpiredDeltas(hard, 999)).toHaveLength(1); // hard は decay なし
  });
});

describe("applyAfterActionLearning: 学習 slot は after_action provenance・normalized", () => {
  it("mobility 学習 → mobility_tolerance slot(after_action surface・normalized・user 上書き可)", () => {
    const r = derive([fb({ dimension: "mobility", direction: "reduce" })], { maxWalkKm: 6 });
    const next = applyAfterActionLearning({ slots: [], participantIds: ["P1", "P2"] }, r.deltas);
    const s = next.slots.find((x) => x.key === "mobility_tolerance")!;
    expect(s.status).toBe("normalized");
    expect(s.evidence[0].surface).toBe("after_action" as ExtractionSurface);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 15. end-to-end: feedback → applyAfterActionLearning → runTravelPlanEngine が変わる
// ════════════════════════════════════════════════════════════════════════════
describe("15. end-to-end（learning が次回 engine 出力を変える）", () => {
  const ev = (surface: ExtractionSurface, refId: string, speaker?: string) => speaker ? { surface, refId, speakerParticipantId: speaker } : { surface, refId };
  type Slot = ExtractedSlot;
  const dest = (a: string): Slot => ({ key: "destination_area", value: { areaText: a }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("form_input", "f")] });
  const date = (d: string): Slot => ({ key: "date_or_range", value: { kind: "single_day", date: d }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("session_context", "s")] });
  const budget = (hi: number): Slot => ({ key: "budget_band", value: { lo: 0, hi, confidence: 0.9, currency: "JPY" }, status: "confirmed", fillState: "filled", confidence: 0.9, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("quick_action", "b")] });
  const softPref = (v: string, owner: string): Slot => ({ key: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 0.7, owner: { kind: "participant", participantId: owner }, visibility: "shared", evidence: [ev("chat_message", "m", owner)] });

  it("participant_balance(P1 過剰優遇) の学習 → 次回 tie が P2(culture) へ tilt", () => {
    // base: P1 nature / P2 art → tie（履歴なし）
    const baseInput: TravelPlanEngineInput = { slots: [dest("京都"), date("2026-07-01"), budget(30000), softPref("nature", "P1"), softPref("art", "P2")], participantIds: ["P1", "P2"] };
    expect(runTravelPlanEngine(baseInput).authoritative.nextAction).toBe("await_preference"); // tie

    const learned = derive([fb({ dimension: "participant_balance", direction: "reduce", owner: p("P1") })]).deltas;
    const nextInput = applyAfterActionLearning(baseInput, learned);
    const out = runTravelPlanEngine(nextInput);
    expect(out.authoritative.recommendedProposalId).toBe("proposal:culture"); // P2 寄りへ tilt
    expect(out.authoritative.nextAction).toBe("propose_plan");
  });
});
