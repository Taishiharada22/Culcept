/**
 * Phase 3-N Plan P2 Step 2 v3.1 — LLM-as-judge 評価 harness 構造
 *
 * 設計書: docs/alter-plan-p2-llm-step2-readiness-v3.md §3.2 + Q4 確定
 *
 * 役割 (= CEO + GPT 2026-05-25 G2 通過判定 Q4 採用):
 *   - 50 件 dataset × 5 user profile = 250 評価ケース で Step 1 vs Step 2 LLM 出力を比較
 *   - 3 軸 (= 自然さ / あなたらしさ / 押しつけ感の弱さ) × 5 階で採点
 *   - 既存 lib/ai/judge.ts (= LLM-as-judge) 流用 (= 実 LLM 呼出は別 script)
 *   - 採用基準 (= readiness §3.2.5): 自然さ ≥ 4.2、 あなたらしさ ≥ 3.5、 押しつけ感の弱さ ≥ 4.0
 *
 * 注: 本 file は **harness 構造** のみ (= 実 LLM 呼出は npm test では skip、 別 script で run)。
 *     judge LLM 呼出が high cost のため、 CEO smoke / canary 判定 timing で実行。
 *
 * 不変原則:
 *   - 型 + helper 関数のみ (= pure)
 *   - LLM 実呼出は本 file 外で行う
 */

import type { SyntheticAnchor, EvalUserProfile } from "./planAlterNoteDataset";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 評価ケース型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1 評価ケース = 1 anchor × 1 user profile
 *
 * 出力候補 (= deterministic / Step 1 LLM / Step 2 LLM) を持ち、 3 軸採点される。
 */
export type EvalCase = {
  readonly caseId: string; // `${userProfileId}_${anchorId}`
  readonly anchor: SyntheticAnchor;
  readonly userProfile: EvalUserProfile;
};

/**
 * 1 出力候補 (= deterministic / Step 1 / Step 2 のいずれか)
 */
export type EvalOutputCandidate = {
  readonly source: "deterministic" | "step1_llm" | "step2_llm";
  readonly text: string | undefined;
  readonly model?: string;
  readonly latencyMs?: number;
};

/**
 * 3 軸採点 (= 1-5 階)
 */
export type EvalScoreAxis = "naturalness" | "personalness" | "non_pushy";

export type EvalScore = Record<EvalScoreAxis, number>;

/**
 * 1 採点 entry (= judge LLM or CEO による採点結果)
 */
export type EvalScoredEntry = {
  readonly caseId: string;
  readonly candidate: EvalOutputCandidate;
  readonly judge: "llm_as_judge" | "ceo" | "build_unit";
  readonly score: EvalScore;
  readonly comment?: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 採用基準 (= readiness §3.2.5)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ADOPTION_THRESHOLDS: Record<EvalScoreAxis, number> = {
  naturalness: 4.2,
  personalness: 3.5,
  non_pushy: 4.0,
};

/**
 * 採用判定 (= 3 軸すべて基準を超えたら 「世界トップ級」 達成、 readiness §3.2.5)
 */
export function isAdoptionPass(avgScores: EvalScore): boolean {
  return (
    avgScores.naturalness >= ADOPTION_THRESHOLDS.naturalness &&
    avgScores.personalness >= ADOPTION_THRESHOLDS.personalness &&
    avgScores.non_pushy >= ADOPTION_THRESHOLDS.non_pushy
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: dataset → evaluation case 配列 (= pure)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * dataset + user profiles から evaluation case 配列を生成 (= 250 ケース)
 *
 * caseId = `${userProfileId}_${anchorId}`
 *
 * pure (= deterministic、 入力 mutate なし)
 */
export function buildEvalCases(
  anchors: ReadonlyArray<SyntheticAnchor>,
  userProfiles: ReadonlyArray<EvalUserProfile>,
): ReadonlyArray<EvalCase> {
  const cases: EvalCase[] = [];
  for (const profile of userProfiles) {
    for (const anchor of anchors) {
      cases.push({
        caseId: `${profile.id}_${anchor.id}`,
        anchor,
        userProfile: profile,
      });
    }
  }
  return cases;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: 採点集計 (= pure)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 採点 entry 配列から平均 score を計算
 */
export function computeAverageScore(
  entries: ReadonlyArray<EvalScoredEntry>,
): EvalScore {
  if (entries.length === 0) {
    return { naturalness: 0, personalness: 0, non_pushy: 0 };
  }
  let sumN = 0;
  let sumP = 0;
  let sumU = 0;
  for (const e of entries) {
    sumN += e.score.naturalness;
    sumP += e.score.personalness;
    sumU += e.score.non_pushy;
  }
  return {
    naturalness: sumN / entries.length,
    personalness: sumP / entries.length,
    non_pushy: sumU / entries.length,
  };
}

/**
 * source 別 (= deterministic / step1 / step2) で平均 score 計算
 */
export function computeAverageScoreBySource(
  entries: ReadonlyArray<EvalScoredEntry>,
): Record<EvalOutputCandidate["source"], EvalScore> {
  const det = entries.filter((e) => e.candidate.source === "deterministic");
  const s1 = entries.filter((e) => e.candidate.source === "step1_llm");
  const s2 = entries.filter((e) => e.candidate.source === "step2_llm");
  return {
    deterministic: computeAverageScore(det),
    step1_llm: computeAverageScore(s1),
    step2_llm: computeAverageScore(s2),
  };
}
