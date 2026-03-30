// ============================================================
// Orbiter Feature 1: Attraction Discovery
// 「惹かれる」と「うまくいく」を分離するための魅力4層モデル
//
// Stated層: ユーザーが言語化した好み（RendezvousPreferences）
// Instant層: like/passの行動データから推定する即座の魅力パターン
// (Sustained層/Healthy層: Phase 3 で ML 追加予定)
// ============================================================

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { TRAIT_AXES } from "@/lib/stargazer/traitAxes";
import type { RendezvousPreferences } from "@/lib/rendezvous/types";
import type {
  AttractionProfile,
  AttractionAxisWeight,
  AttractionDivergence,
} from "./types";
import type { LikeHistoryItem } from "./signalAccumulator";

// ── Constants ──

/** instant attraction 推定に最低限必要なサンプル数 */
const MIN_SAMPLES_FOR_INSTANT = 5;

/** divergence として検出する閾値（statedとinstantの差） */
const DIVERGENCE_THRESHOLD = 0.3;

/** timeToDecisionMs の重み変換: 速い判断ほど instant attraction を強く反映 */
function decisionSpeedWeight(timeToDecisionMs: number | null): number {
  if (!timeToDecisionMs || timeToDecisionMs <= 0) return 1.0;
  // 5秒以内 → weight 2.0, 30秒 → 1.0, 60秒+ → 0.5
  if (timeToDecisionMs < 5000) return 2.0;
  if (timeToDecisionMs < 30000) return 1.5 - (timeToDecisionMs - 5000) / 50000;
  return Math.max(0.5, 1.0 - (timeToDecisionMs - 30000) / 60000);
}

// ── Stated Layer ──

function extractStatedPreferences(prefs: RendezvousPreferences | null): AttractionProfile["statedPreferences"] {
  if (!prefs) {
    return {
      desiredTypes: [],
      communicationStyle: null,
      pacePreference: null,
      similarityVsComplementarity: 0.5,
    };
  }

  return {
    desiredTypes: prefs.desired_relation_types ?? [],
    communicationStyle: prefs.communication_style,
    pacePreference: prefs.pace_preference,
    similarityVsComplementarity: prefs.similarity_vs_complementarity ?? 0.5,
  };
}

// ── Instant Layer ──

function computeInstantAttraction(
  likeHistory: LikeHistoryItem[],
): AttractionProfile["instantAttraction"] {
  if (likeHistory.length < MIN_SAMPLES_FOR_INSTANT) return null;

  // 軸ごとに重み付き集計: like=+1, pass=-1, × decision speed weight
  const axisWeights: Record<string, { sum: number; weightSum: number; count: number }> = {};

  for (const item of likeHistory) {
    const sign = item.decision === "like" ? 1 : -1;
    const speedW = decisionSpeedWeight(item.timeToDecisionMs);

    for (const [axisId, score] of Object.entries(item.counterpartAxisScores)) {
      if (score === undefined || score === null) continue;
      if (!axisWeights[axisId]) {
        axisWeights[axisId] = { sum: 0, weightSum: 0, count: 0 };
      }
      // like した相手のスコアを正方向、pass した相手のスコアを負方向に
      axisWeights[axisId].sum += sign * score * speedW;
      axisWeights[axisId].weightSum += speedW;
      axisWeights[axisId].count++;
    }
  }

  // 軸ごとの重みを計算
  const topAxes: AttractionAxisWeight[] = [];
  for (const [axisId, data] of Object.entries(axisWeights)) {
    if (data.count < 3) continue; // 最低3サンプル必要
    const weight = data.sum / data.weightSum;
    const confidence = Math.min(1, data.count / 20); // 20サンプルで confidence 1.0
    topAxes.push({
      axis: axisId as TraitAxisKey,
      weight: Math.max(-1, Math.min(1, weight)),
      sampleCount: data.count,
      confidence,
    });
  }

  // 重みの絶対値が大きい上位10軸
  topAxes.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  const top = topAxes.slice(0, 10);

  if (top.length === 0) return null;

  // パターン判定: similar vs complementary vs mixed
  // like した相手の軸スコアの符号と自分の好みの方向の一致度を見る
  const likedItems = likeHistory.filter((h) => h.decision === "like");
  let similarCount = 0;
  let complementaryCount = 0;

  for (const axis of top.slice(0, 5)) {
    // weight > 0 → high score の相手を like する傾向
    // weight < 0 → low score の相手を like する傾向
    // 自分自身のスコアとの一致度は Phase 3 で精密化
    if (Math.abs(axis.weight) > 0.2) {
      // positive weight = attracted to high scorers on this axis
      // We'll count this as "similar" tendency if positive weight (simplified)
      if (axis.weight > 0.2) similarCount++;
      else if (axis.weight < -0.2) complementaryCount++;
    }
  }

  let pattern: "similar" | "complementary" | "mixed" = "mixed";
  if (similarCount > complementaryCount * 2) pattern = "similar";
  else if (complementaryCount > similarCount * 2) pattern = "complementary";

  const overallConfidence =
    top.reduce((acc, a) => acc + a.confidence, 0) / top.length;

  return {
    topAxes: top,
    pattern,
    confidence: Math.min(1, overallConfidence),
  };
}

// ── Divergence Detection ──

function detectDivergences(
  statedPrefs: AttractionProfile["statedPreferences"],
  instantAttraction: AttractionProfile["instantAttraction"],
): AttractionDivergence[] {
  if (!instantAttraction) return [];

  const divergences: AttractionDivergence[] = [];

  // Stated similarity preference vs actual pattern
  const statedSim = statedPrefs.similarityVsComplementarity; // 0=similar, 1=complementary
  const actualPattern = instantAttraction.pattern;

  // 全体的な傾向の乖離
  if (statedSim < 0.3 && actualPattern === "complementary") {
    divergences.push({
      axis: "introvert_vs_extrovert" as TraitAxisKey, // Representative axis
      axisLabel: "類似性 vs 補完性",
      statedDirection: -1 + statedSim * 2, // 0→-1, 0.5→0, 1→1
      actualDirection: 0.7, // complementary tendency
      narrative:
        "似た人を好むと感じているが、実際は異なるタイプに惹かれる傾向がある",
    });
  } else if (statedSim > 0.7 && actualPattern === "similar") {
    divergences.push({
      axis: "introvert_vs_extrovert" as TraitAxisKey,
      axisLabel: "類似性 vs 補完性",
      statedDirection: -1 + statedSim * 2,
      actualDirection: -0.7,
      narrative:
        "違うタイプに惹かれると感じているが、実際は似たタイプを選ぶ傾向がある",
    });
  }

  // 軸レベルの乖離: 上位instant軸について、statedの反対方向かチェック
  for (const axis of instantAttraction.topAxes.slice(0, 5)) {
    if (Math.abs(axis.weight) < DIVERGENCE_THRESHOLD) continue;

    const axisInfo = TRAIT_AXES.find((a) => a.id === axis.axis);
    if (!axisInfo) continue;

    const axisLabel = `${axisInfo.labelLeft} ↔ ${axisInfo.labelRight}`;

    // 排除トレイトに含まれる軸を like している場合 = divergence
    if (
      statedPrefs.desiredTypes.length > 0 &&
      axis.weight > DIVERGENCE_THRESHOLD
    ) {
      divergences.push({
        axis: axis.axis,
        axisLabel,
        statedDirection: 0, // stated preference unknown at axis level
        actualDirection: axis.weight,
        narrative: `${axisInfo.labelRight}寄りの相手に実際は惹かれる傾向がある`,
      });
    }
  }

  return divergences.slice(0, 5); // 最大5件
}

// ── Main Export ──

export function computeAttractionProfile(params: {
  statedPreferences: RendezvousPreferences | null;
  likeHistory: LikeHistoryItem[];
}): AttractionProfile {
  const statedPreferences = extractStatedPreferences(params.statedPreferences);
  const instantAttraction = computeInstantAttraction(params.likeHistory);
  const divergences = detectDivergences(statedPreferences, instantAttraction);

  return {
    statedPreferences,
    instantAttraction,
    divergences,
  };
}
