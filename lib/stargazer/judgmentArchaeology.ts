// lib/stargazer/judgmentArchaeology.ts
// 判断考古学 — 選択排除順序から判断原理を発掘する
//
// 原理: 人は選択肢を排除する順序に無意識の価値観を露出させる。
// 「最初に捨てたもの」は最も遠い自己像、「最後まで残ったもの」は核心に近い。
// この排除の「地層」を掘り返すことで、本人も気づいていない判断原理を発掘する。

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 排除イベント — ある質問で選択肢が排除された記録 */
export interface EliminationEvent {
  questionId: string;
  /** 排除された選択肢ID（排除順） */
  eliminationOrder: string[];
  /** 最終的に選んだ選択肢 */
  chosenOptionId: string;
  /** 各排除までにかかった時間 (ms) */
  eliminationTimings?: number[];
  /** 関連する軸 */
  axisId?: TraitAxisKey;
}

/** 発掘された判断パターン */
export interface JudgmentLayer {
  /** 地層の深さ (0=表層, 1=最深層) */
  depth: number;
  /** 判断のタイプ */
  patternType: "instant_reject" | "reluctant_abandon" | "careful_elimination" | "agonized_choice";
  /** パターンの説明 */
  label: string;
  /** 心理的意味 */
  insight: string;
  /** 平均排除速度 (ms) */
  avgEliminationSpeed: number;
  /** 該当する質問数 */
  questionCount: number;
}

/** 判断考古学の結果 */
export interface JudgmentArchaeologyResult {
  /** 発掘された判断の地層 */
  layers: JudgmentLayer[];
  /** 排除パターンのサマリー */
  eliminationProfile: {
    /** 即座に排除する傾向の強さ (0-1) */
    decisiveness: number;
    /** 排除に苦しむ傾向 (0-1) */
    reluctance: number;
    /** 排除順序の一貫性 (0-1) — 高い = いつも同じ基準で排除 */
    consistency: number;
  };
  /** 最も早く排除される概念群 */
  fastRejects: {
    concept: string;
    frequency: number;
    implication: string;
  }[];
  /** 最後まで残りやすい概念群（核心に近い） */
  coreRetentions: {
    concept: string;
    frequency: number;
    implication: string;
  }[];
  /** 排除に最も長く苦しんだ軸 — 内的葛藤の最前線 */
  conflictFrontier: {
    axisId: TraitAxisKey;
    avgHesitationMs: number;
    interpretation: string;
  }[];
  /** 全体解釈 */
  interpretation: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 判断考古学を実行
 * 排除順序から判断原理の地層を発掘する
 */
export function analyzeJudgmentArchaeology(
  events: EliminationEvent[],
): JudgmentArchaeologyResult {
  if (events.length === 0) {
    return {
      layers: [],
      eliminationProfile: { decisiveness: 0, reluctance: 0, consistency: 0 },
      fastRejects: [],
      coreRetentions: [],
      conflictFrontier: [],
      interpretation: "判断データがまだ不足しています。",
    };
  }

  // ── 排除速度の統計 ──
  const allTimings: number[] = [];
  const firstRejectTimings: number[] = [];
  const lastRejectTimings: number[] = [];

  for (const event of events) {
    if (!event.eliminationTimings || event.eliminationTimings.length === 0) continue;
    allTimings.push(...event.eliminationTimings);
    firstRejectTimings.push(event.eliminationTimings[0]);
    if (event.eliminationTimings.length > 1) {
      lastRejectTimings.push(event.eliminationTimings[event.eliminationTimings.length - 1]);
    }
  }

  const avgAll = mean(allTimings);
  const avgFirst = mean(firstRejectTimings);
  const avgLast = mean(lastRejectTimings);

  // ── 判断の地層を構築 ──
  const layers: JudgmentLayer[] = [];

  // Layer 0: 瞬間排除（1秒以内） — 最も無意識的な判断
  const instantCount = firstRejectTimings.filter((t) => t < 1000).length;
  if (instantCount > 0) {
    layers.push({
      depth: 0,
      patternType: "instant_reject",
      label: "直感的排除",
      insight:
        "1秒以内に排除される選択肢は、意識的な検討を経ていない。これは最も深い価値観の表れ—「自分とは絶対に違う」という確信。",
      avgEliminationSpeed: mean(firstRejectTimings.filter((t) => t < 1000)),
      questionCount: instantCount,
    });
  }

  // Layer 1: 慎重な排除（1-3秒）
  const carefulCount = allTimings.filter((t) => t >= 1000 && t < 3000).length;
  if (carefulCount > 0) {
    layers.push({
      depth: 0.3,
      patternType: "careful_elimination",
      label: "比較的排除",
      insight:
        "1〜3秒で排除される選択肢は、一瞬の比較検討を経ている。「悪くないが自分ではない」という判断。",
      avgEliminationSpeed: mean(allTimings.filter((t) => t >= 1000 && t < 3000)),
      questionCount: carefulCount,
    });
  }

  // Layer 2: 未練のある排除（3-6秒）
  const reluctantCount = allTimings.filter((t) => t >= 3000 && t < 6000).length;
  if (reluctantCount > 0) {
    layers.push({
      depth: 0.6,
      patternType: "reluctant_abandon",
      label: "未練の排除",
      insight:
        "3〜6秒かけて排除される選択肢は、「これも自分かもしれない」という未練がある。もう一人の自分の影。",
      avgEliminationSpeed: mean(allTimings.filter((t) => t >= 3000 && t < 6000)),
      questionCount: reluctantCount,
    });
  }

  // Layer 3: 苦悶の選択（6秒以上）
  const agonizedCount = lastRejectTimings.filter((t) => t >= 6000).length;
  if (agonizedCount > 0) {
    layers.push({
      depth: 1.0,
      patternType: "agonized_choice",
      label: "苦悶の判断",
      insight:
        "6秒以上の排除は深い内的葛藤の証。この最後の一手が、あなたの判断原理の最も繊細な部分を露出させている。",
      avgEliminationSpeed: mean(lastRejectTimings.filter((t) => t >= 6000)),
      questionCount: agonizedCount,
    });
  }

  // ── 排除プロファイル ──
  const decisiveness = avgFirst > 0 ? Math.min(2000 / avgFirst, 1) : 0.5;
  const reluctance = avgLast > 0 ? Math.min(avgLast / 8000, 1) : 0;
  const consistency = computeEliminationConsistency(events);

  // ── 最速排除・最終残留パターン ──
  const rejectFreq = new Map<string, number>();
  const retainFreq = new Map<string, number>();

  for (const event of events) {
    if (event.eliminationOrder.length > 0) {
      const firstRejected = event.eliminationOrder[0];
      rejectFreq.set(firstRejected, (rejectFreq.get(firstRejected) ?? 0) + 1);
    }
    retainFreq.set(event.chosenOptionId, (retainFreq.get(event.chosenOptionId) ?? 0) + 1);
  }

  const fastRejects = [...rejectFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([concept, frequency]) => ({
      concept,
      frequency,
      implication: "最初に排除される選択肢は、自己認識から最も遠い概念を表す。",
    }));

  const coreRetentions = [...retainFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([concept, frequency]) => ({
      concept,
      frequency,
      implication: "繰り返し最後まで残る選択肢は、あなたの判断原理の核心に最も近い。",
    }));

  // ── 葛藤の最前線（軸別の排除躊躇） ──
  const axisHesitation = new Map<TraitAxisKey, number[]>();
  for (const event of events) {
    if (!event.axisId || !event.eliminationTimings) continue;
    const existing = axisHesitation.get(event.axisId) ?? [];
    existing.push(...event.eliminationTimings);
    axisHesitation.set(event.axisId, existing);
  }

  const conflictFrontier = [...axisHesitation.entries()]
    .map(([axisId, timings]) => ({
      axisId,
      avgHesitationMs: mean(timings),
      interpretation: "",
    }))
    .sort((a, b) => b.avgHesitationMs - a.avgHesitationMs)
    .slice(0, 3)
    .map((item) => {
      const axis = TRAIT_AXES.find((a) => a.id === item.axisId);
      return {
        ...item,
        interpretation: axis
          ? `「${axis.labelLeft} ⇔ ${axis.labelRight}」の領域で最も排除に苦しんでいる。この軸が内的葛藤の最前線。`
          : "この領域に深い葛藤がある。",
      };
    });

  // ── 全体解釈 ──
  let interpretation: string;
  if (decisiveness > 0.7 && reluctance < 0.3) {
    interpretation =
      "決断の速い判断者。直感的に「違うもの」を排除できる強い内的基準がある。一方で、速すぎる排除は可能性の見落としにもなりうる。";
  } else if (decisiveness < 0.3 && reluctance > 0.7) {
    interpretation =
      "慎重な探求者。すべての選択肢の価値を感じ取れる共感力がある。代わりに、決断のエネルギーコストが高い傾向がある。";
  } else if (consistency > 0.7) {
    interpretation =
      "一貫した判断原理の持ち主。同じ基準で繰り返し排除しており、確立された価値体系がある。";
  } else if (consistency < 0.3) {
    interpretation =
      "状況適応型の判断者。排除の基準が場面ごとに変わる。これは柔軟性の表れであり、同時に「自分の基準」がまだ定まっていない可能性もある。";
  } else {
    interpretation =
      "バランス型の判断者。直感と熟慮を使い分けている。一部の領域で深い葛藤を抱えながらも、全体として適応的な判断をしている。";
  }

  return {
    layers,
    eliminationProfile: { decisiveness, reluctance, consistency },
    fastRejects,
    coreRetentions,
    conflictFrontier,
    interpretation,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Utilities
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * 排除順序の一貫性スコアを計算
 * 同じ選択肢を同じ順番で排除しているほど高い
 */
function computeEliminationConsistency(events: EliminationEvent[]): number {
  if (events.length < 2) return 0.5;

  // 各選択肢の排除位置を集計
  const positionMap = new Map<string, number[]>();

  for (const event of events) {
    for (let pos = 0; pos < event.eliminationOrder.length; pos++) {
      const optionId = event.eliminationOrder[pos];
      const existing = positionMap.get(optionId) ?? [];
      existing.push(pos / Math.max(event.eliminationOrder.length - 1, 1));
      positionMap.set(optionId, existing);
    }
  }

  // 各選択肢の位置分散を計算
  let totalVariance = 0;
  let count = 0;

  for (const positions of positionMap.values()) {
    if (positions.length < 2) continue;
    const avg = mean(positions);
    const variance = positions.reduce((s, p) => s + (p - avg) ** 2, 0) / positions.length;
    totalVariance += variance;
    count++;
  }

  if (count === 0) return 0.5;

  // 低い分散 = 高い一貫性
  const avgVariance = totalVariance / count;
  return Math.max(0, 1 - avgVariance * 4); // Scale: 0.25 variance → 0 consistency
}
