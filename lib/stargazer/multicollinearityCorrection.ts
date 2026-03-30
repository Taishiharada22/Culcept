// lib/stargazer/multicollinearityCorrection.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 多重共線性補正エンジン v1
//
// 同一質問から複数軸にスコアが流れる際の二重計上を検出・補正する。
// 例: emotional_variability と reassurance_need が同じ質問から高スコアを得ると、
// 実際は1つの情報なのに2軸分として計上され、感情系が過大評価される。
//
// 補正原理:
// 1. 各軸の質問ソース（どの質問IDからスコアを得たか）を集合で保持
// 2. 共線性グループ内で質問ソースの重複率（Jaccard index）を計算
// 3. 重複率が高い場合、アンカー軸以外にデフレーションを適用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";

// ── 型定義 ──

export interface CollinearityGroup {
  id: string;
  axes: TraitAxisKey[];
  /** デフレーション係数 (0.0-1.0): 高いほど強く補正 */
  deflationFactor: number;
  /** 心理測定学的根拠 */
  rationale: string;
}

export interface CorrectionResult {
  correctedScores: Record<string, number>;
  corrections: CorrectionDetail[];
}

export interface CorrectionDetail {
  groupId: string;
  axis: TraitAxisKey;
  originalScore: number;
  correctedScore: number;
  jaccardIndex: number;
  anchorAxis: TraitAxisKey;
}

// ── 共線性グループ定義 ──

export const COLLINEARITY_GROUPS: CollinearityGroup[] = [
  {
    id: "emotional_cluster",
    axes: ["emotional_variability", "reassurance_need", "emotional_regulation"],
    deflationFactor: 0.30,
    rationale: "Neuroticism subfacets (Costa & McCrae 1992) — shared latent factor of emotional instability",
  },
  {
    id: "independence_cluster",
    axes: ["independence_vs_harmony", "individual_vs_social"],
    deflationFactor: 0.25,
    rationale: "Both load on Agency/Communion dimension (Wiggins 1995)",
  },
  {
    id: "mode_split_cluster",
    axes: ["public_private_gap", "relationship_mode_split"],
    deflationFactor: 0.25,
    rationale: "Both measure consistency of self-presentation (Goffman 1959)",
  },
];

// ── 質問ソース重複の計算 ──

/**
 * 回答データから各軸の質問ソースIDセットを構築
 */
export function computeQuestionSourceMap(
  answers: { questionId: string; targetAxes: TraitAxisKey[] }[],
): Map<TraitAxisKey, Set<string>> {
  const sourceMap = new Map<TraitAxisKey, Set<string>>();

  for (const answer of answers) {
    for (const axis of answer.targetAxes) {
      if (!sourceMap.has(axis)) sourceMap.set(axis, new Set());
      sourceMap.get(axis)!.add(answer.questionId);
    }
  }

  return sourceMap;
}

/**
 * 2つの集合の Jaccard index を計算
 * Jaccard = |A ∩ B| / |A ∪ B|
 */
function jaccardIndex(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── メイン補正関数 ──

/**
 * 多重共線性補正を適用
 *
 * @param scores - 現在の軸スコア
 * @param questionSourceMap - 各軸の質問ソースID（computeQuestionSourceMap で構築）
 *                           null の場合はソース不明としてグループ内全軸に一律補正
 * @param observationCounts - 各軸の観測数（アンカー選択用）
 */
export function applyCollinearityCorrection(
  scores: Record<string, number>,
  questionSourceMap: Map<TraitAxisKey, Set<string>> | null,
  observationCounts?: Partial<Record<TraitAxisKey, number>>,
): CorrectionResult {
  const correctedScores = { ...scores };
  const corrections: CorrectionDetail[] = [];

  for (const group of COLLINEARITY_GROUPS) {
    // グループ内で実際にスコアを持つ軸だけを対象に
    const activeAxes = group.axes.filter(
      (axis) => axis in scores && Math.abs(scores[axis] ?? 0) > 0.001
    );
    if (activeAxes.length < 2) continue;

    // アンカー軸を決定: 観測数が最も多い軸（同数なら最もスコアが大きい軸）
    const anchorAxis = activeAxes.reduce((best, axis) => {
      const bestCount = observationCounts?.[best] ?? 0;
      const axisCount = observationCounts?.[axis] ?? 0;
      if (axisCount > bestCount) return axis;
      if (axisCount === bestCount && Math.abs(scores[axis] ?? 0) > Math.abs(scores[best] ?? 0)) {
        return axis;
      }
      return best;
    }, activeAxes[0]);

    // アンカー以外の軸に対してデフレーション適用
    for (const axis of activeAxes) {
      if (axis === anchorAxis) continue;

      // 質問ソース重複率を計算
      let overlap: number;
      if (questionSourceMap) {
        const anchorSources = questionSourceMap.get(anchorAxis) ?? new Set();
        const axisSources = questionSourceMap.get(axis) ?? new Set();
        overlap = jaccardIndex(anchorSources, axisSources);
      } else {
        // ソース不明の場合、デフォルト重複率を仮定
        overlap = 0.6;
      }

      // Jaccard > 0.3 の場合のみ補正（低い重複率なら補正不要）
      if (overlap < 0.3) continue;

      // デフレーション量 = 重複率 × デフレーション係数 × アンカーとの相関方向
      const anchorScore = scores[anchorAxis] ?? 0;
      const axisScore = scores[axis] ?? 0;
      const sameDirection = Math.sign(anchorScore) === Math.sign(axisScore);

      // 同方向の場合のみ補正（逆方向は真の独立情報の可能性が高い）
      if (!sameDirection) continue;

      const deflation = overlap * group.deflationFactor;
      const corrected = axisScore * (1 - deflation);
      correctedScores[axis] = corrected;

      corrections.push({
        groupId: group.id,
        axis,
        originalScore: axisScore,
        correctedScore: corrected,
        jaccardIndex: overlap,
        anchorAxis,
      });
    }
  }

  return { correctedScores, corrections };
}
