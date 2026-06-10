/**
 * A-4-c6 — Life Ops 5 層 cap（pure helper・未配線）unit。
 *   pool cap の不変条件（deadline 不滅・lane 多様性 floor・dropped count・順序保持）と raw input cap を固定。
 *
 * 設計: docs/life-ops-readiness-hardening-a4-c6-mini-design.md §3。
 */
import { describe, it, expect } from "vitest";
import {
  capRawLifeOpsInputs,
  capLifeOpsCandidatePool,
  RAW_INPUT_CAP,
  CANDIDATE_POOL_CAP,
  TIER_FITTING_CAP,
  OVERFLOW_RETAINED_CAP,
  POOL_LANE_FLOOR,
} from "@/lib/plan/reality/lifeops/lifeops-pool-cap";
import { lifeOpsLaneOf } from "@/lib/plan/reality/lifeops/lifeops-placement";
import type { LifeOpsCandidate, DueReason } from "@/lib/lifeops/candidate-types";

/** 手組み candidate（縦正本型を構築するだけ・再定義しない）。 */
function cand(category: LifeOpsCandidate["category"], dueReason: DueReason, placeQuery: string | null = null): LifeOpsCandidate {
  return { category, menu: null, dueReason, suggestedWindow: null, placeQuery, permissionLevelHint: "L1", riskFlags: [] };
}
const deadline = (days: number): DueReason => ({ kind: "deadline", daysUntilDeadline: days, leadDays: 21, overdue: days < 0 });
const eventPrep = (days: number): DueReason => ({ kind: "event_prep", eventKind: "interview", daysUntilEvent: days, recommendedLeadDays: 3 });
const cycle = (phase: "beyond_typical" | "well_beyond"): DueReason => ({ kind: "cycle", elapsedDays: 60, typicalIntervalDays: 47, phase });

describe("① raw input cap", () => {
  it("各観測配列を cap で刻み dropped を数える（入力不変）", () => {
    const big = Array.from({ length: RAW_INPUT_CAP + 7 }, (_, i) => ({ categoryId: "tax_filing", deadlineISO: `2026-07-${(i % 28) + 1}T00:00:00+09:00` }));
    const inputs = { deadlineObservations: big };
    const r = capRawLifeOpsInputs(inputs);
    expect(r.inputs.deadlineObservations!.length).toBe(RAW_INPUT_CAP);
    expect(r.droppedCount).toBe(7);
    expect(inputs.deadlineObservations.length).toBe(RAW_INPUT_CAP + 7); // 入力不変
  });
});

describe("② candidate pool cap（不変条件）", () => {
  /** flood: event_prep 12 + deadline 3 + push cycle 2 + easy cycle 2 = 19 件。 */
  function flood(): LifeOpsCandidate[] {
    const preps = Array.from({ length: 12 }, () => cand("document_prep", eventPrep(5))); // easy lane（>2 日・cyclePhase なし）
    const deadlines = [cand("tax_filing", deadline(2)), cand("license_renewal", deadline(10)), cand("passport_renewal", deadline(40))];
    const pushes = [cand("beauty_salon", cycle("well_beyond"), "美容室"), cand("nail", cycle("beyond_typical"), "ネイルサロン")]; // push lane（美容・非 health）
    const easies = [cand("groceries", cycle("beyond_typical"), "スーパー"), cand("daily_necessities", cycle("beyond_typical"), "ドラッグストア")]; // easy lane（upkeep 非 well_beyond）
    return [...deadlines, ...preps, ...pushes, ...easies];
  }
  it("cap 以下なら同一参照（no-op）", () => {
    const xs = [cand("tax_filing", deadline(2))];
    const r = capLifeOpsCandidatePool(xs);
    expect(r.pool).toBe(xs);
    expect(r.droppedCount).toBe(0);
  });
  it("deadline 不滅: flood でも deadline 3 件は全保持", () => {
    const r = capLifeOpsCandidatePool(flood());
    expect(r.pool.filter((c) => c.dueReason.kind === "deadline").length).toBe(3);
    expect(r.pool.length).toBeLessThanOrEqual(CANDIDATE_POOL_CAP);
  });
  it("lane 多様性 floor: urgency 上位が prep で埋まっても push が最低 2 枠生き残る", () => {
    const r = capLifeOpsCandidatePool(flood());
    const lanes = r.pool.map((c) => lifeOpsLaneOf(c));
    expect(lanes.filter((l) => l === "push").length).toBeGreaterThanOrEqual(POOL_LANE_FLOOR);
    expect(lanes.filter((l) => l === "easy").length).toBeGreaterThanOrEqual(POOL_LANE_FLOOR);
  });
  it("dropped は count で返す（黙って捨てない）・元順序を保持・deterministic", () => {
    const xs = flood();
    const r1 = capLifeOpsCandidatePool(xs);
    const r2 = capLifeOpsCandidatePool(xs);
    expect(r1.droppedCount).toBe(xs.length - r1.pool.length);
    expect(r1.droppedCount).toBeGreaterThan(0);
    // 元順序保持: pool は xs の部分列。
    const idx = r1.pool.map((c) => xs.indexOf(c));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

describe("③-⑤ 定数（設計の具体化・配線は実データ slice）", () => {
  it("presentation と pool の分離が定数として存在する", () => {
    expect(CANDIDATE_POOL_CAP).toBeGreaterThan(TIER_FITTING_CAP);
    expect(TIER_FITTING_CAP).toBeGreaterThanOrEqual(3); // 代表 ≤3 を内包
    expect(OVERFLOW_RETAINED_CAP).toBeGreaterThan(0);
    expect(RAW_INPUT_CAP).toBeGreaterThanOrEqual(CANDIDATE_POOL_CAP);
  });
});
