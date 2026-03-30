// lib/stargazer/ahaOrchestrator.ts
// Aha Insight オーケストレーター
// テンプレートエンジン + ブラインドスポット発見 + AI ナラティブを統合し、
// 最適なインサイトを選択して返す

import { TRAIT_AXES, type TraitAxisKey } from "./traitAxes";
import type { DetectedPattern } from "./patternDetectionEngine";
import {
  calculateSurpriseScore,
  discoverBlindSpots,
  generatePatternNarrative,
  generateTopInsights,
  type BlindSpotDiscovery,
} from "./ahaEngine";
import {
  generateInsightsFromTemplates,
  type InsightData,
  type GeneratedInsight,
} from "./insightTemplateEngine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AhaContext {
  currentFeature: string;
  recentPatterns: DetectedPattern[];
  axisScores: Record<string, number>;
  archetypeCode: string;
  previousInsightIds: string[];
  sessionNumber: number;
  timeOfDay: number; // 0-23
  dayOfWeek: number; // 0=Sun
  userSelfReport?: Record<string, number>;
  previousInsightTexts?: string[];
  userId?: string;
}

export interface OrchestratedInsight {
  insight: string;
  category: string;
  surpriseScore: number;
  source: "template" | "blind_spot" | "cross_reference" | "narrative";
  actionSuggestion?: string;
  blindSpot?: BlindSpotDiscovery;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature-specific action suggestions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FEATURE_SUGGESTIONS: Record<string, string[]> = {
  home: [
    "stargazer/blind-spot",
    "stargazer/weather",
    "stargazer/oracle",
  ],
  stargazer_home: [
    "stargazer/blind-spot",
    "stargazer/prophecy",
    "stargazer/alter",
  ],
  observation: [
    "stargazer/weather",
    "stargazer/blind-spot",
  ],
  prophecy: [
    "stargazer/blind-spot",
    "stargazer/alter",
  ],
  blind_spot: [
    "stargazer/alter",
    "stargazer/oracle",
  ],
  alter: [
    "stargazer/blind-spot",
    "stargazer/prophecy",
  ],
  weather: [
    "stargazer/prophecy",
    "stargazer/oracle",
  ],
};

function pickActionSuggestion(
  currentFeature: string,
  category: string,
): string | undefined {
  const suggestions = FEATURE_SUGGESTIONS[currentFeature];
  if (!suggestions || suggestions.length === 0) return undefined;

  // Pick based on category affinity
  switch (category) {
    case "self_image_gap":
    case "contradiction":
      return suggestions.find((s) => s.includes("blind-spot")) ?? suggestions[0];
    case "time_pattern":
    case "emotional_cycle":
      return suggestions.find((s) => s.includes("weather") || s.includes("prophecy")) ?? suggestions[0];
    case "growth_trajectory":
    case "growth_edge":
      return suggestions.find((s) => s.includes("oracle") || s.includes("alter")) ?? suggestions[0];
    default:
      return suggestions[0];
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Time-based insight boosting
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 現在の時間帯・曜日に合わせてインサイトの relevance をブーストする。
 * 例: 深夜にアクセスしているなら temporal_blind のインサイトを優先
 */
function timeRelevanceBoost(
  category: string,
  timeOfDay: number,
  dayOfWeek: number,
): number {
  let boost = 0;

  // 深夜（22-4時）: 時間帯パターンや感情系を優先
  if (timeOfDay >= 22 || timeOfDay < 4) {
    if (category === "time_pattern" || category === "emotional_cycle") {
      boost += 0.15;
    }
    if (category === "self_image_gap") {
      boost += 0.1; // 深夜は内省的になりやすい
    }
  }

  // 週の真ん中（水・木）: 判断疲れ系を優先
  if (dayOfWeek === 3 || dayOfWeek === 4) {
    if (category === "decision_pattern" || category === "stress_response") {
      boost += 0.1;
    }
  }

  // 月曜朝: 成長系を優先
  if (dayOfWeek === 1 && timeOfDay >= 6 && timeOfDay < 12) {
    if (category === "growth_trajectory" || category === "value_hierarchy") {
      boost += 0.1;
    }
  }

  // 金曜夕方以降: 社会行動系を優先
  if (dayOfWeek === 5 && timeOfDay >= 17) {
    if (category === "social_behavior" || category === "unconscious_preference") {
      boost += 0.1;
    }
  }

  return boost;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Behavioral indicators extraction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * パターンデータから行動指標を推定する。
 * 自己申告スコアとの乖離を計算するために使用。
 */
function extractBehavioralIndicators(
  patterns: DetectedPattern[],
  axisScores: Record<string, number>,
): Record<string, number> {
  const indicators: Record<string, number> = { ...axisScores };

  // Contradictions shift the indicator away from self-report
  for (const p of patterns) {
    if (p.patternType === "contradiction" && p.axisId) {
      const current = indicators[p.axisId] ?? 0;
      const rate = (p.metadata.contradictionRate as number) ?? 0.5;
      // If contradictions are frequent, behavioral indicator moves opposite
      indicators[p.axisId] = current * (1 - rate * 0.5);
    }

    // Behavioral blinds suggest the real score is less extreme
    if (p.patternType === "behavioral_blind" && p.axisId) {
      const current = indicators[p.axisId] ?? 0;
      indicators[p.axisId] = current * 0.6; // Pull toward center
    }

    // Weekday deviations create micro-indicators
    if (p.patternType === "weekday" && p.axisId) {
      const deviation = (p.metadata.deviation as number) ?? 0;
      const current = indicators[p.axisId] ?? 0;
      // Weighted average toward the deviated value
      indicators[p.axisId] = current * 0.8 + (current + deviation) * 0.2;
    }
  }

  return indicators;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Orchestrator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全インサイトソースを統合し、最適な1つを選択して返す。
 *
 * 選択ロジック:
 * 1. テンプレートエンジンからインサイト候補を生成
 * 2. ブラインドスポット発見エンジンから候補を生成
 * 3. 全候補に Surprise Score を計算
 * 4. 時間帯・曜日ブーストを適用
 * 5. 最高スコアのインサイトを返す
 * 6. データ不足の場合は AI ナラティブにフォールバック
 */
export async function getNextAhaInsight(
  userId: string,
  context: AhaContext,
): Promise<OrchestratedInsight | null> {
  const {
    currentFeature,
    recentPatterns,
    axisScores,
    archetypeCode,
    previousInsightIds,
    sessionNumber,
    timeOfDay,
    dayOfWeek,
    userSelfReport,
    previousInsightTexts = [],
  } = context;

  // Early exit: not enough data
  if (recentPatterns.length === 0 && Object.keys(axisScores).length === 0) {
    return null;
  }

  const candidates: OrchestratedInsight[] = [];
  const behavioralIndicators = extractBehavioralIndicators(
    recentPatterns,
    axisScores,
  );

  // ── Source 1: Template Engine ──
  const templateData: InsightData = {
    axisScores,
    patterns: recentPatterns,
    archetypeCode,
    sessionNumber,
    timeOfDay,
    dayOfWeek,
    previousInsightIds,
  };

  const templateInsights = generateInsightsFromTemplates(templateData, 5);

  for (const ti of templateInsights) {
    const surprise = calculateSurpriseScore(
      ti.text,
      userSelfReport ?? axisScores,
      behavioralIndicators,
      previousInsightTexts,
    );

    const boost = timeRelevanceBoost(ti.category, timeOfDay, dayOfWeek);

    candidates.push({
      insight: ti.text,
      category: ti.category,
      surpriseScore: Math.min(1, surprise + boost),
      source: "template",
      actionSuggestion: pickActionSuggestion(currentFeature, ti.category),
    });
  }

  // ── Source 2: Blind Spot Discovery ──
  const blindSpots = discoverBlindSpots(
    recentPatterns,
    axisScores,
    userSelfReport,
  );

  for (const bs of blindSpots.slice(0, 3)) {
    // Skip if already shown
    const bsId = `bs_${bs.type}_${bs.title.slice(0, 20)}`;
    if (previousInsightIds.includes(bsId)) continue;

    const surprise = calculateSurpriseScore(
      bs.description,
      userSelfReport ?? axisScores,
      behavioralIndicators,
      previousInsightTexts,
    );

    // Blind spots get a base boost for being inherently surprising
    const blindSpotBoost = 0.1;
    const boost = timeRelevanceBoost(bs.category, timeOfDay, dayOfWeek);

    candidates.push({
      insight: bs.description,
      category: bs.category,
      surpriseScore: Math.min(1, Math.max(surprise, bs.surpriseScore) + blindSpotBoost + boost),
      source: "blind_spot",
      actionSuggestion: pickActionSuggestion(currentFeature, bs.category),
      blindSpot: bs,
    });
  }

  // ── Source 3: Cross-reference AI insights (only if few template results) ──
  if (candidates.length < 2 && recentPatterns.length >= 2) {
    try {
      const crossRefInsights = await generateTopInsights(
        recentPatterns,
        archetypeCode,
        userId,
        previousInsightTexts,
        2,
      );

      for (const ci of crossRefInsights) {
        const surprise = calculateSurpriseScore(
          ci.text,
          userSelfReport ?? axisScores,
          behavioralIndicators,
          previousInsightTexts,
        );

        candidates.push({
          insight: ci.text,
          category: ci.category,
          surpriseScore: Math.min(1, surprise),
          source: "cross_reference",
          actionSuggestion: pickActionSuggestion(currentFeature, ci.category),
        });
      }
    } catch (e) {
      console.warn("[ahaOrchestrator] Cross-reference generation failed:", e);
    }
  }

  // ── Source 4: AI Narrative fallback ──
  if (candidates.length === 0 && recentPatterns.length >= 1) {
    try {
      const narrative = await generatePatternNarrative(
        recentPatterns,
        archetypeCode,
        axisScores,
        userId,
      );

      if (narrative) {
        candidates.push({
          insight: narrative,
          category: "discovery",
          surpriseScore: 0.4, // Base score for AI-generated
          source: "narrative",
          actionSuggestion: pickActionSuggestion(currentFeature, "discovery"),
        });
      }
    } catch (e) {
      console.warn("[ahaOrchestrator] Narrative generation failed:", e);
    }
  }

  if (candidates.length === 0) return null;

  // ── Final selection: highest surprise score ──
  candidates.sort((a, b) => b.surpriseScore - a.surpriseScore);

  // Diversity check: if top 2 are from same source, prefer diversity
  if (
    candidates.length >= 2 &&
    candidates[0].source === candidates[1].source &&
    candidates[1].surpriseScore > candidates[0].surpriseScore * 0.85
  ) {
    // Check if there's a different source in top 5
    const diverse = candidates
      .slice(1, 5)
      .find((c) => c.source !== candidates[0].source);
    if (
      diverse &&
      diverse.surpriseScore > candidates[0].surpriseScore * 0.7
    ) {
      // Swap for diversity
      return diverse;
    }
  }

  return candidates[0];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Batch generation: multiple insights at once
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 複数のインサイトを一括生成する。
 * ダッシュボード表示や、1日分のインサイトリスト生成に使用。
 */
export async function getAhaInsightBatch(
  userId: string,
  context: AhaContext,
  count: number = 3,
): Promise<OrchestratedInsight[]> {
  const results: OrchestratedInsight[] = [];
  const usedIds = [...context.previousInsightIds];
  const usedTexts = [...(context.previousInsightTexts ?? [])];

  for (let i = 0; i < count; i++) {
    const insight = await getNextAhaInsight(userId, {
      ...context,
      previousInsightIds: usedIds,
      previousInsightTexts: usedTexts,
    });

    if (!insight) break;

    results.push(insight);
    usedTexts.push(insight.insight);

    // Track blind spot IDs to avoid repeats
    if (insight.blindSpot) {
      usedIds.push(
        `bs_${insight.blindSpot.type}_${insight.blindSpot.title.slice(0, 20)}`,
      );
    }
  }

  return results;
}
