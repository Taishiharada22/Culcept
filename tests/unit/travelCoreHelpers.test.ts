import { describe, it, expect } from "vitest";
import {
  severityRank,
  compareSeverityDesc,
  isAtLeastSevere,
  maxSeverity,
  isCoherentConstraint,
  filterConstraintsForViewer,
  isValidBudgetBand,
  normalizeBudgetBand,
  MINUTES_PER_DAY,
  isValidMinuteOfDay,
  isValidMinuteRange,
  nodeRangesOverlap,
  isValidIsoDate,
  dateSpanDays,
  isValidPlanWindow,
  MVP_MAX_PARTICIPANTS,
  isValidParticipantSource,
  validateParticipantsForMvp,
  isUncertaintyLevel,
  isConstraintSeverity,
  normalizeReversalCost,
} from "@/lib/shared/travel/core-helpers";
import {
  CONSTRAINT_SEVERITIES,
  type BudgetBand,
  type ParticipantSourceRef,
  type TravelConstraint,
  type TravelParticipant,
} from "@/lib/shared/travel/core-types";

const band = (lo: number, hi: number, confidence = 0.5): BudgetBand => ({ lo, hi, confidence, currency: "JPY" });

const constraint = (over: Partial<TravelConstraint> = {}): TravelConstraint => ({
  constraintId: "c1",
  axis: "time",
  severity: "hard",
  owner: { kind: "shared" },
  visibility: "shared",
  descriptor: "return_by:20:00",
  ...over,
});

const participant = (participantId: string, source: ParticipantSourceRef): TravelParticipant => ({
  participantId,
  source,
});

// 4 kind を網羅する source ファクトリ（userId 可変）
const SOURCES = (uid: string): ParticipantSourceRef[] => [
  { kind: "self", userId: uid },
  { kind: "talk_pair_member", pairStateId: "pair1", userId: uid },
  { kind: "culcept_relation", relationId: "rel1", userId: uid },
  { kind: "plan_session", planSessionId: "sess1", userId: uid },
];

// ─────────────────────────────────────────────────────────────────────────────
describe("severity ordering", () => {
  it("rank: red_line > hard > soft > preference", () => {
    expect(severityRank("red_line")).toBe(3);
    expect(severityRank("hard")).toBe(2);
    expect(severityRank("soft")).toBe(1);
    expect(severityRank("preference")).toBe(0);
  });

  it("comparator は最強を先頭に sort し、isAtLeastSevere / maxSeverity が整合する", () => {
    const sorted = [...CONSTRAINT_SEVERITIES].reverse().sort(compareSeverityDesc);
    expect(sorted).toEqual(["red_line", "hard", "soft", "preference"]);
    expect(isAtLeastSevere("hard", "soft")).toBe(true);
    expect(isAtLeastSevere("soft", "hard")).toBe(false);
    expect(isAtLeastSevere("hard", "hard")).toBe(true);
    expect(maxSeverity(["soft", "red_line", "preference"])).toBe("red_line");
    expect(maxSeverity([])).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("budget band clamp / order", () => {
  it("lo>hi は swap・負値は 0 クランプ・confidence 0..1 クランプ・非有限は 0", () => {
    expect(normalizeBudgetBand(band(30000, 20000))).toEqual(band(20000, 30000));
    expect(normalizeBudgetBand(band(-500, 1000, 1.5))).toEqual(band(0, 1000, 1));
    expect(normalizeBudgetBand(band(-300, -100, -1))).toEqual(band(0, 0, 0));
    expect(normalizeBudgetBand({ lo: NaN, hi: 5000, confidence: NaN, currency: "JPY" })).toEqual(band(0, 5000, 0));
  });

  it("normalize 後は常に isValidBudgetBand を満たす（入力は不変）", () => {
    const dirty = band(9, 1, 7);
    const n = normalizeBudgetBand(dirty);
    expect(isValidBudgetBand(n)).toBe(true);
    expect(dirty).toEqual(band(9, 1, 7)); // 入力不変
    expect(isValidBudgetBand(dirty)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("time range validation", () => {
  it("minute-of-day: 0..1439 の整数のみ", () => {
    expect(isValidMinuteOfDay(0)).toBe(true);
    expect(isValidMinuteOfDay(MINUTES_PER_DAY - 1)).toBe(true);
    expect(isValidMinuteOfDay(MINUTES_PER_DAY)).toBe(false);
    expect(isValidMinuteOfDay(-1)).toBe(false);
    expect(isValidMinuteOfDay(600.5)).toBe(false);
  });

  it("range は start<end・端点接触は overlap しない", () => {
    expect(isValidMinuteRange(600, 660)).toBe(true);
    expect(isValidMinuteRange(660, 660)).toBe(false);
    expect(isValidMinuteRange(660, 600)).toBe(false);
    expect(nodeRangesOverlap({ startMin: 600, endMin: 660 }, { startMin: 630, endMin: 700 })).toBe(true);
    expect(nodeRangesOverlap({ startMin: 600, endMin: 660 }, { startMin: 660, endMin: 700 })).toBe(false);
  });

  it("ISO 日付・日数差・計画窓（nights 一致）", () => {
    expect(isValidIsoDate("2026-07-01")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false); // 実在しない日
    expect(isValidIsoDate("2026/07/01")).toBe(false);
    expect(dateSpanDays("2026-07-01", "2026-07-02")).toBe(1);
    expect(dateSpanDays("2026-07-01", "bad")).toBeNull();
    expect(isValidPlanWindow({ kind: "single_day", date: "2026-07-01" })).toBe(true);
    expect(isValidPlanWindow({ kind: "range", startDate: "2026-07-01", endDate: "2026-07-02", nights: 1 })).toBe(true);
    expect(isValidPlanWindow({ kind: "range", startDate: "2026-07-01", endDate: "2026-07-03", nights: 1 })).toBe(false); // 日数差≠nights
    expect(isValidPlanWindow({ kind: "range", startDate: "2026-07-02", endDate: "2026-07-01", nights: 1 })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("visibility handling（M5）", () => {
  const cShared = constraint({ constraintId: "s1", visibility: "shared" });
  const cPrivP1 = constraint({ constraintId: "p1", visibility: "private", owner: { kind: "participant", participantId: "P1" } });
  const cPrivP2 = constraint({ constraintId: "p2", visibility: "private", owner: { kind: "participant", participantId: "P2" } });
  const cBroken = constraint({ constraintId: "x1", visibility: "private", owner: { kind: "shared" } });

  it("shared は全員可視・private は owner 本人のみ・不整合は fail-closed で誰にも見せない", () => {
    const forP1 = filterConstraintsForViewer([cShared, cPrivP1, cPrivP2, cBroken], "P1");
    expect(forP1.map((c) => c.constraintId)).toEqual(["s1", "p1"]);
    const forP2 = filterConstraintsForViewer([cShared, cPrivP1, cPrivP2, cBroken], "P2");
    expect(forP2.map((c) => c.constraintId)).toEqual(["s1", "p2"]);
  });

  it("isCoherentConstraint: private+shared-owner は不整合", () => {
    expect(isCoherentConstraint(cBroken)).toBe(false);
    expect(isCoherentConstraint(cShared)).toBe(true);
    expect(isCoherentConstraint(cPrivP1)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("participant source handling（self + 3 external/session カテゴリ）", () => {
  it("4 kind すべての形を検証できる（非空 ID 必須）", () => {
    for (const src of SOURCES("u1")) {
      expect(isValidParticipantSource(src)).toBe(true);
    }
    expect(isValidParticipantSource({ kind: "self", userId: "" })).toBe(false);
    expect(isValidParticipantSource({ kind: "talk_pair_member", pairStateId: "", userId: "u1" })).toBe(false);
    expect(isValidParticipantSource({ kind: "culcept_relation", relationId: "", userId: "u1" })).toBe(false);
    expect(isValidParticipantSource({ kind: "plan_session", planSessionId: "s", userId: "" })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("MVP 1–2 participant validation", () => {
  it("0 名=empty / 1 名 OK / 2 名 OK / 3 名=mvp_limit", () => {
    expect(validateParticipantsForMvp([])).toEqual({ ok: false, reason: "empty" });
    expect(validateParticipantsForMvp([participant("P1", { kind: "self", userId: "u1" })])).toEqual({ ok: true });
    expect(
      validateParticipantsForMvp([
        participant("P1", { kind: "self", userId: "u1" }),
        participant("P2", { kind: "plan_session", planSessionId: "s1", userId: "u2" }),
      ]),
    ).toEqual({ ok: true });
    expect(
      validateParticipantsForMvp([
        participant("P1", { kind: "self", userId: "u1" }),
        participant("P2", { kind: "plan_session", planSessionId: "s1", userId: "u2" }),
        participant("P3", { kind: "culcept_relation", relationId: "r1", userId: "u3" }),
      ]),
    ).toEqual({ ok: false, reason: "mvp_limit" });
    expect(MVP_MAX_PARTICIPANTS).toBe(2);
  });

  it("participantId / userId の重複・不正 source を拒否", () => {
    expect(
      validateParticipantsForMvp([
        participant("P1", { kind: "self", userId: "u1" }),
        participant("P1", { kind: "plan_session", planSessionId: "s1", userId: "u2" }),
      ]),
    ).toEqual({ ok: false, reason: "duplicate_participant_id" });
    expect(
      validateParticipantsForMvp([
        participant("P1", { kind: "self", userId: "u1" }),
        participant("P2", { kind: "culcept_relation", relationId: "r1", userId: "u1" }),
      ]),
    ).toEqual({ ok: false, reason: "duplicate_user_id" });
    expect(
      validateParticipantsForMvp([participant("P1", { kind: "talk_pair_member", pairStateId: "", userId: "u1" })]),
    ).toEqual({ ok: false, reason: "invalid_source" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("★ source kind は consent / trait / fairness / 優先度を意味しない", () => {
  it("source kind だけが異なる participant 集合は、全 helper で同一の結果になる", () => {
    // 同じ uid 構成・kind だけ違う 4 通りの「2 人集合」を作る
    const combos = SOURCES("u1").map((srcA, i) => [
      participant("P1", srcA),
      participant("P2", SOURCES("u2")[(i + 1) % 4]),
    ]);
    const results = combos.map((c) => validateParticipantsForMvp(c));
    // 全 kind 組合せで完全に同じ結果（= kind から何も推論していない）
    for (const r of results) expect(r).toEqual({ ok: true });
  });

  it("visibility フィルタは participantId のみで判定し、source kind に依存しない", () => {
    const cPriv = constraint({ constraintId: "p", visibility: "private", owner: { kind: "participant", participantId: "P1" } });
    // viewer が同じ participantId なら、その人の source kind が何であれ結果は同じ
    const visible = filterConstraintsForViewer([cPriv], "P1");
    const hidden = filterConstraintsForViewer([cPriv], "P2");
    expect(visible).toHaveLength(1);
    expect(hidden).toHaveLength(0);
    // helper の引数シグネチャ自体が source を受け取らない＝構造的に kind 非依存
  });

  it("talk_pair_member は特別扱いされない（他 kind と同じ規則で valid/invalid が決まる）", () => {
    const talk = participant("P1", { kind: "talk_pair_member", pairStateId: "pair1", userId: "u1" });
    const plan = participant("P1", { kind: "plan_session", planSessionId: "s1", userId: "u1" });
    expect(validateParticipantsForMvp([talk])).toEqual(validateParticipantsForMvp([plan]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("uncertainty / reversal-cost normalization", () => {
  it("type guard: 既知リテラルのみ通す（fallback 判断はしない）", () => {
    expect(isUncertaintyLevel("high")).toBe(true);
    expect(isUncertaintyLevel("unknown")).toBe(false);
    expect(isUncertaintyLevel(3)).toBe(false);
    expect(isConstraintSeverity("red_line")).toBe(true);
    expect(isConstraintSeverity("redline")).toBe(false);
  });

  it("reversal: cancellable=false は deadline/fee を除去・true は fee 正規化 + 不正 deadline 除去", () => {
    expect(
      normalizeReversalCost({ cancellable: false, deadline: "2026-06-30", fee: band(100, 50) }),
    ).toEqual({ cancellable: false });
    expect(
      normalizeReversalCost({ cancellable: true, deadline: "2026-06-30", fee: band(100, 50) }),
    ).toEqual({ cancellable: true, deadline: "2026-06-30", fee: band(50, 100) });
    expect(normalizeReversalCost({ cancellable: true, deadline: "bad-date" })).toEqual({ cancellable: true });
  });
});
