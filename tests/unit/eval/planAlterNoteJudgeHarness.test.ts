/**
 * Phase 3-N Plan P2 Step 2 v3.1 — judge harness 構造 contract test
 *
 * 検証範囲:
 *   - buildEvalCases: dataset + profiles → 250 ケース
 *   - ADOPTION_THRESHOLDS: 採用基準
 *   - isAdoptionPass: 3 軸合格判定
 *   - computeAverageScore / BySource: 集計 pure
 *
 * 不変原則:
 *   - LLM 呼ばない (= harness 構造のみ)
 *   - 入力 mutate なし
 */

import { describe, it, expect } from "vitest";

import {
  PLAN_ALTER_NOTE_DATASET,
  EVAL_USER_PROFILES,
} from "../../eval/planAlterNoteDataset";
import {
  buildEvalCases,
  ADOPTION_THRESHOLDS,
  isAdoptionPass,
  computeAverageScore,
  computeAverageScoreBySource,
  type EvalScoredEntry,
} from "../../eval/planAlterNoteJudgeHarness";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildEvalCases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildEvalCases", () => {
  it("5 profile × 50 anchor = 250 ケース", () => {
    const cases = buildEvalCases(PLAN_ALTER_NOTE_DATASET, EVAL_USER_PROFILES);
    expect(cases.length).toBe(250);
  });

  it("各 case の caseId = `${profileId}_${anchorId}`", () => {
    const cases = buildEvalCases(PLAN_ALTER_NOTE_DATASET, EVAL_USER_PROFILES);
    const first = cases[0]!;
    expect(first.caseId).toBe(`${first.userProfile.id}_${first.anchor.id}`);
  });

  it("caseId 全件 unique", () => {
    const cases = buildEvalCases(PLAN_ALTER_NOTE_DATASET, EVAL_USER_PROFILES);
    const ids = cases.map((c) => c.caseId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("空 dataset → 0 ケース", () => {
    const cases = buildEvalCases([], EVAL_USER_PROFILES);
    expect(cases.length).toBe(0);
  });

  it("入力 mutate なし", () => {
    const datasetSnapshot = JSON.stringify(PLAN_ALTER_NOTE_DATASET);
    const profilesSnapshot = JSON.stringify(EVAL_USER_PROFILES);
    buildEvalCases(PLAN_ALTER_NOTE_DATASET, EVAL_USER_PROFILES);
    expect(JSON.stringify(PLAN_ALTER_NOTE_DATASET)).toBe(datasetSnapshot);
    expect(JSON.stringify(EVAL_USER_PROFILES)).toBe(profilesSnapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADOPTION_THRESHOLDS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ADOPTION_THRESHOLDS (= readiness §3.2.5)", () => {
  it("3 軸基準値", () => {
    expect(ADOPTION_THRESHOLDS.naturalness).toBe(4.2);
    expect(ADOPTION_THRESHOLDS.personalness).toBe(3.5);
    expect(ADOPTION_THRESHOLDS.non_pushy).toBe(4.0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isAdoptionPass
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isAdoptionPass", () => {
  it("3 軸全合格 (= 全 ≥ 基準) → pass", () => {
    expect(isAdoptionPass({ naturalness: 4.5, personalness: 4.0, non_pushy: 4.5 })).toBe(true);
  });

  it("naturalness 未達 → fail", () => {
    expect(isAdoptionPass({ naturalness: 4.0, personalness: 4.0, non_pushy: 4.5 })).toBe(false);
  });

  it("personalness 未達 → fail", () => {
    expect(isAdoptionPass({ naturalness: 4.5, personalness: 3.0, non_pushy: 4.5 })).toBe(false);
  });

  it("non_pushy 未達 → fail", () => {
    expect(isAdoptionPass({ naturalness: 4.5, personalness: 4.0, non_pushy: 3.5 })).toBe(false);
  });

  it("境界値 (= 全 = 基準) → pass", () => {
    expect(isAdoptionPass({ naturalness: 4.2, personalness: 3.5, non_pushy: 4.0 })).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeAverageScore
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeAverageScore", () => {
  it("空配列 → 全 0", () => {
    const s = computeAverageScore([]);
    expect(s).toEqual({ naturalness: 0, personalness: 0, non_pushy: 0 });
  });

  it("3 entry の平均", () => {
    const entries: EvalScoredEntry[] = [
      {
        caseId: "c1",
        candidate: { source: "step2_llm", text: "a" },
        judge: "llm_as_judge",
        score: { naturalness: 4, personalness: 3, non_pushy: 5 },
      },
      {
        caseId: "c2",
        candidate: { source: "step2_llm", text: "b" },
        judge: "llm_as_judge",
        score: { naturalness: 5, personalness: 4, non_pushy: 4 },
      },
      {
        caseId: "c3",
        candidate: { source: "step2_llm", text: "c" },
        judge: "llm_as_judge",
        score: { naturalness: 3, personalness: 5, non_pushy: 3 },
      },
    ];
    const s = computeAverageScore(entries);
    expect(s.naturalness).toBeCloseTo(4, 2);
    expect(s.personalness).toBeCloseTo(4, 2);
    expect(s.non_pushy).toBeCloseTo(4, 2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeAverageScoreBySource
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeAverageScoreBySource", () => {
  it("source 別集計", () => {
    const entries: EvalScoredEntry[] = [
      {
        caseId: "c1",
        candidate: { source: "deterministic", text: "a" },
        judge: "llm_as_judge",
        score: { naturalness: 3, personalness: 1, non_pushy: 5 },
      },
      {
        caseId: "c2",
        candidate: { source: "step1_llm", text: "b" },
        judge: "llm_as_judge",
        score: { naturalness: 4, personalness: 2, non_pushy: 4 },
      },
      {
        caseId: "c3",
        candidate: { source: "step2_llm", text: "c" },
        judge: "llm_as_judge",
        score: { naturalness: 5, personalness: 4, non_pushy: 5 },
      },
    ];
    const r = computeAverageScoreBySource(entries);
    expect(r.deterministic.naturalness).toBe(3);
    expect(r.step1_llm.naturalness).toBe(4);
    expect(r.step2_llm.naturalness).toBe(5);
    expect(r.deterministic.personalness).toBe(1);
    expect(r.step2_llm.personalness).toBe(4);
  });

  it("source 空 → 全 0", () => {
    const r = computeAverageScoreBySource([]);
    expect(r.step2_llm).toEqual({ naturalness: 0, personalness: 0, non_pushy: 0 });
  });
});
