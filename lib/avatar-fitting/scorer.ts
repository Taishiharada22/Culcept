// lib/avatar-fitting/scorer.ts
import "server-only";
import { calcFitScore } from "@/lib/matchScore/fit";
import { calcColorScore } from "@/lib/matchScore/color";
import { calcStyleScore } from "@/lib/matchScore/style";
import { band, bandExplanation } from "@/lib/matchScore/index";
import { DEFAULT_USE_CASE_WEIGHTS, DEFAULT_OVERALL_WEIGHTS, adjustScoreByLayerCoverage } from "./weights";
import type { AllLayerData, ExtractedItemAttributes, AvatarFittingResult, SubScoreDetail } from "./types";

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

function computeSizeScore(layers: AllLayerData, item: ExtractedItemAttributes) {
  if (!layers.l1.bodyMeasurements) return { score: 50, reasons: ["体型データ未登録のため暫定評価"], detail: null };
  const fitResult = calcFitScore({
    category: item.category === "unknown" ? null : item.category,
    fitPreference: item.estimated_fit,
    bodyMeasurements: layers.l1.bodyMeasurements,
    garmentMeasurements: null,
    bodyType: layers.l1.bodyType,
  });
  return { score: fitResult.score, reasons: fitResult.reasons, detail: fitResult };
}

function computeColorScore(layers: AllLayerData, item: ExtractedItemAttributes) {
  if (item.dominant_colors.length === 0) return { score: 50, reasons: ["色情報なし"], detail: null };
  const colorResult = calcColorScore({
    pcSeason: layers.l1.pcSeason,
    pcAxes: layers.l1.pcAxes ?? undefined,
    dominantColors: item.dominant_colors,
    favoriteColors: layers.l1.favoriteColors,
    avoidColors: layers.l1.avoidColors,
  });
  return { score: colorResult.score, reasons: colorResult.reasons, detail: colorResult };
}

function computeVisualScore(layers: AllLayerData, item: ExtractedItemAttributes) {
  const styleResult = calcStyleScore({
    userLanes: layers.l2.styleTags,
    userMoodKeywords: layers.l2.moodKeywords,
    itemStyleTags: item.style_tags,
    itemMoodTags: item.mood_tags,
    swipePrefs: layers.l3.swipePrefs ?? undefined,
  });
  return { score: styleResult.score, reasons: styleResult.reasons, detail: styleResult };
}

function computePreferenceScore(layers: AllLayerData, item: ExtractedItemAttributes) {
  const knownLanes = ["minimal","street","vintage","sporty","luxury","daily","elegant","workwear","outdoor","casual","classic"];
  const itemLanes = item.style_tags.filter(t => knownLanes.includes(t.toLowerCase()));
  const itemLikes = [...item.silhouette_tags, ...item.material_tags].map(t => t.toLowerCase());
  const userLikes: string[] = [];
  const userAvoid: string[] = [];
  if (layers.l2.prefProfile) {
    for (const cat of ["silhouette","material","detail","pattern"] as const) {
      const w = layers.l2.prefProfile[cat];
      if (!w) continue;
      for (const [k, v] of Object.entries(w)) {
        if (typeof v === "number" && v > 0.5) userLikes.push(k.toLowerCase());
        if (typeof v === "number" && v < -0.5) userAvoid.push(k.toLowerCase());
      }
    }
  }
  const userLanes = layers.l2.styleTags.filter(t => knownLanes.includes(t.toLowerCase()));
  const sharedLanes = userLanes.filter(l => itemLanes.includes(l));
  const sharedLikes = userLikes.filter(l => itemLikes.includes(l));
  const conflicts = [...userLikes.filter(l => ([] as string[]).includes(l)), ...itemLikes.filter(l => userAvoid.includes(l))];

  let score = 0;
  score += (sharedLanes.length / Math.max(userLanes.length, itemLanes.length, 1)) * 40;
  score += (sharedLikes.length / Math.max(userLikes.length, itemLikes.length, 1)) * 30;
  score -= (conflicts.length / Math.max(userLikes.length + itemLikes.length, 1)) * 20;
  if (userLanes.length > 0 || userLikes.length > 0) score += 30;
  else score = 50;
  score = clamp(Math.round(score), 0, 100);

  const reasons: string[] = [];
  if (sharedLanes.length > 0) reasons.push(`レーン一致: ${sharedLanes.join(", ")}`);
  if (sharedLikes.length > 0) reasons.push(`好み一致: ${sharedLikes.slice(0,3).join(", ")}`);
  if (conflicts.length > 0) reasons.push(`衝突: ${conflicts.slice(0,2).join(", ")}`);
  if (reasons.length === 0) reasons.push("好みデータ不足");
  return { score, reasons, detail: { sharedLanes, sharedLikes, conflicts } };
}

export function scoreFitting(layers: AllLayerData, item: ExtractedItemAttributes): AvatarFittingResult {
  const ucw = DEFAULT_USE_CASE_WEIGHTS;
  const ow = DEFAULT_OVERALL_WEIGHTS;
  const lc = { l1: layers.l1.coverage, l2: layers.l2.coverage, l3: layers.l3.coverage, l4: layers.l4.coverage };

  const sizeRaw = computeSizeScore(layers, item);
  const colorRaw = computeColorScore(layers, item);
  const visualRaw = computeVisualScore(layers, item);
  const prefRaw = computePreferenceScore(layers, item);

  const sizeAdj = adjustScoreByLayerCoverage(sizeRaw.score, ucw.size, lc);
  const colorAdj = adjustScoreByLayerCoverage(colorRaw.score, ucw.color, lc);
  const visualAdj = adjustScoreByLayerCoverage(visualRaw.score, ucw.visual, lc);
  const prefAdj = adjustScoreByLayerCoverage(prefRaw.score, ucw.preference, lc);

  const mkSub = (raw: any, adj: any): SubScoreDetail => ({
    score: raw.score, reasons: raw.reasons, adjustedScore: adj.adjustedScore, layerCoverage: adj.effectiveCoverage,
  });

  const overallMatch = Math.round(
    sizeAdj.adjustedScore * ow.size + colorAdj.adjustedScore * ow.color +
    visualAdj.adjustedScore * ow.visual + prefAdj.adjustedScore * ow.preference
  );
  const confidence = Math.round(clamp((lc.l1 + lc.l2 + lc.l3 + lc.l4) / 4, 0, 1) * 100) / 100;
  const total300 = sizeAdj.adjustedScore + colorAdj.adjustedScore + visualAdj.adjustedScore;
  const matchBand = band(total300, visualAdj.adjustedScore, colorAdj.adjustedScore, sizeAdj.adjustedScore, confidence);

  return {
    overallMatch: clamp(overallMatch, 0, 100), band: matchBand, bandReason: bandExplanation(matchBand), confidence,
    sizeScore: mkSub(sizeRaw, sizeAdj), visualScore: mkSub(visualRaw, visualAdj),
    colorScore: mkSub(colorRaw, colorAdj), preferenceScore: mkSub(prefRaw, prefAdj),
    avatarComment: "", extractedAttributes: item, layerCoverage: lc,
    weightsUsed: { overall: ow, useCaseWeights: ucw as any },
    details: { fitResult: sizeRaw.detail ?? undefined, colorResult: colorRaw.detail ?? undefined, styleResult: visualRaw.detail ?? undefined, iAmCompatibility: prefRaw.detail ? { score: prefRaw.score, ...prefRaw.detail } : undefined },
  };
}
