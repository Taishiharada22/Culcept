// lib/stargazer/contradictionEngine.ts
// 矛盾検出エンジン — 同一軸への対立回答を「二面性」として保存
//
// 従来: 同じ軸に 1 と 5 → 平均 3（中立）→ 情報消失
// 新方式: 二峰性係数(BC)で二面性を検出、poles として保存
//
// 参考: Pfister et al. (2013) — Bimodality coefficient for response time distributions
//       Carver & Scheier (1998) — Self-regulation and dual-process models

import type { TraitAxisKey } from "./traitAxes";

// ── 型定義 ──

export interface AxisDistributionStats {
  /** 重み付き平均（後方互換） */
  mean: number;
  /** 回答の分散 */
  variance: number;
  /** 二峰性係数 (0〜1) — > 0.555 で二峰性を示唆 */
  bimodalityCoeff: number;
  /** 真の二面性があるか */
  isDual: boolean;
  /** 二面性の場合の2つの極 — [低い方, 高い方] */
  poles: [number, number] | null;
  /** 矛盾の強さ (0〜1) — |pole2 - pole1| / 2 */
  contradictionStrength: number;
  /** この軸に対する回答数 */
  sampleCount: number;
}

export type ContradictionMap = Partial<Record<TraitAxisKey, AxisDistributionStats>>;

// ── 定数 ──

/** 二峰性を判定する閾値 (Pfister et al. 2013 standard) */
const BIMODALITY_THRESHOLD = 0.555;

/** 二面性と認定するために必要な最小分散 */
const MIN_VARIANCE_FOR_DUALITY = 0.20;

/** 最低限必要なサンプル数 */
const MIN_SAMPLES = 3;

// ── メイン関数 ──

/**
 * 単一軸に対する回答スコア群から分布統計を算出
 *
 * @param answerScores  この軸への正規化済みスコア群 (-1〜+1)
 * @param weights       各スコアに対応する質問の重み
 * @returns AxisDistributionStats
 */
export function computeAxisDistributionStats(
  answerScores: number[],
  weights: number[],
): AxisDistributionStats {
  const n = answerScores.length;

  if (n === 0) {
    return {
      mean: 0, variance: 0, bimodalityCoeff: 0,
      isDual: false, poles: null, contradictionStrength: 0, sampleCount: 0,
    };
  }
  if (n === 1) {
    return {
      mean: answerScores[0], variance: 0, bimodalityCoeff: 0,
      isDual: false, poles: null, contradictionStrength: 0, sampleCount: 1,
    };
  }

  // ── 重み付き平均 ──
  let wSum = 0;
  let wTotal = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.abs(weights[i] ?? 1);
    wSum += answerScores[i] * w;
    wTotal += w;
  }
  const mean = wTotal > 0 ? wSum / wTotal : 0;

  // ── 重み付き分散 ──
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.abs(weights[i] ?? 1);
    varSum += w * (answerScores[i] - mean) ** 2;
  }
  const variance = wTotal > 0 ? varSum / wTotal : 0;

  // ── 二峰性係数 (Bimodality Coefficient) ──
  // BC = (g² + 1) / (κ + 3 * (n-1)² / ((n-2)(n-3)))
  // ここで g = skewness, κ = excess kurtosis
  let bc = 0;

  if (n >= MIN_SAMPLES && variance > 0.001) {
    // 中心モーメント (非重み付き — 簡易版)
    let m2 = 0, m3 = 0, m4 = 0;
    for (let i = 0; i < n; i++) {
      const d = answerScores[i] - mean;
      m2 += d * d;
      m3 += d * d * d;
      m4 += d * d * d * d;
    }
    m2 /= n;
    m3 /= n;
    m4 /= n;

    if (m2 > 0.0001) {
      const skewness = m3 / Math.pow(m2, 1.5);
      const kurtosis = (m4 / (m2 * m2)) - 3; // excess kurtosis

      // BC 計算 (小サンプル補正付き)
      if (n > 3) {
        const correction = 3 * ((n - 1) ** 2) / ((n - 2) * (n - 3));
        const denominator = kurtosis + correction;
        if (denominator > 0) {
          bc = (skewness * skewness + 1) / denominator;
        }
      } else {
        // n <= 3: 簡易 BC
        bc = (skewness * skewness + 1) / (kurtosis + 3);
      }
    }
  }

  bc = Math.max(0, Math.min(1, bc));

  // ── 二面性判定 ──
  const isDual = bc > BIMODALITY_THRESHOLD && variance > MIN_VARIANCE_FOR_DUALITY && n >= MIN_SAMPLES;

  // ── 二極の検出 (簡易2-means クラスタリング) ──
  let poles: [number, number] | null = null;
  let contradictionStrength = 0;

  if (isDual) {
    const sorted = [...answerScores].sort((a, b) => a - b);
    const midIdx = Math.floor(sorted.length / 2);
    const lower = sorted.slice(0, midIdx);
    const upper = sorted.slice(midIdx);

    if (lower.length > 0 && upper.length > 0) {
      const lowerMean = lower.reduce((a, b) => a + b, 0) / lower.length;
      const upperMean = upper.reduce((a, b) => a + b, 0) / upper.length;

      // 2つの極が十分に離れている場合のみ認定
      const separation = Math.abs(upperMean - lowerMean);
      if (separation > 0.3) {
        poles = [
          Math.max(-1, Math.min(1, lowerMean)),
          Math.max(-1, Math.min(1, upperMean)),
        ];
        contradictionStrength = Math.min(1, separation / 2);
      }
    }
  }

  return {
    mean,
    variance,
    bimodalityCoeff: bc,
    isDual: poles !== null,
    poles,
    contradictionStrength,
    sampleCount: n,
  };
}

// ── バッチ処理: 全軸の矛盾マップを生成 ──

export interface AxisAnswerAccumulator {
  scores: number[];
  weights: number[];
}

/**
 * 回答ごとの軸スコアを蓄積器に追加
 */
export function accumulateForContradiction(
  accumulator: Map<string, AxisAnswerAccumulator>,
  axisKey: string,
  score: number,
  weight: number,
): void {
  let entry = accumulator.get(axisKey);
  if (!entry) {
    entry = { scores: [], weights: [] };
    accumulator.set(axisKey, entry);
  }
  entry.scores.push(score);
  entry.weights.push(weight);
}

/**
 * 蓄積器から全軸の矛盾マップを生成
 */
export function buildContradictionMap(
  accumulator: Map<string, AxisAnswerAccumulator>,
): ContradictionMap {
  const result: ContradictionMap = {};
  for (const [key, entry] of accumulator.entries()) {
    result[key as TraitAxisKey] = computeAxisDistributionStats(entry.scores, entry.weights);
  }
  return result;
}

// ── ユーティリティ: 二面性サマリー ──

export interface DualityFlag {
  axis: TraitAxisKey;
  poles: [number, number];
  strength: number;
  /** 人間が読めるインサイト */
  insight: string;
}

/** 矛盾マップから重要な二面性を抽出 */
export function extractDualityFlags(
  contradictionMap: ContradictionMap,
): DualityFlag[] {
  const flags: DualityFlag[] = [];

  for (const [key, stats] of Object.entries(contradictionMap)) {
    if (!stats?.isDual || !stats.poles) continue;

    const axis = key as TraitAxisKey;
    flags.push({
      axis,
      poles: stats.poles,
      strength: stats.contradictionStrength,
      insight: generateDualityInsight(axis, stats.poles),
    });
  }

  // 強い矛盾順にソート
  return flags.sort((a, b) => b.strength - a.strength);
}

// ── 二面性インサイト生成 ──

const DUALITY_INSIGHT_MAP: Partial<Record<TraitAxisKey, [string, string]>> = {
  introvert_vs_extrovert: ["一人を求める面", "人とつながりたい面"],
  cautious_vs_bold: ["慎重に構える面", "大胆に動く面"],
  analytical_vs_intuitive: ["論理で判断する面", "直感に従う面"],
  plan_vs_spontaneous: ["計画を立てたい面", "流れに任せたい面"],
  independence_vs_harmony: ["自分を通す面", "周囲と合わせる面"],
  emotional_regulation: ["感情を抑える面", "感情を開放する面"],
  direct_vs_diplomatic: ["率直に伝える面", "配慮して言い換える面"],
  change_embrace_vs_resist: ["変化を求める面", "安定を守りたい面"],
  function_vs_expression: ["実用を重視する面", "表現を大切にする面"],
  tradition_vs_novelty: ["既存を信頼する面", "新しさに惹かれる面"],
};

function generateDualityInsight(axis: TraitAxisKey, poles: [number, number]): string {
  const labels = DUALITY_INSIGHT_MAP[axis];
  if (labels) {
    const [lowLabel, highLabel] = labels;
    // poles[0] が低い方、poles[1] が高い方
    return `あなたの中に${lowLabel}と${highLabel}の両方がある — これは矛盾ではなく、状況に応じて使い分けられる柔軟性です`;
  }
  return `この軸で二面性が検出されました — あなたは状況に応じて異なる判断基準を持っています`;
}
