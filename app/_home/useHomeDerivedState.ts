"use client";

/**
 * useHomeDerivedState — Extracts all pure useMemo computations from AneurasyncHome.
 * These are client-side derivations from useHomeData results, with no side effects.
 */

import { useMemo } from "react";
import { getTemporalMirror, type TemporalMirrorResult } from "@/lib/stargazer/temporalSelfMirror";
import { generateConvergentInsight, type ConvergentInsightResult } from "@/lib/stargazer/convergentInsightSystem";
import { generateGhostResonance } from "@/lib/stargazer/ghostResonance";
import { generatePsycheSignature } from "@/lib/stargazer/psycheSignature";
import { buildLeaderboard } from "@/lib/stargazer/anonymousLeaderboard";
import type { HomeDataResult } from "@/hooks/useHomeData";
import {
  extractRecommendationView, resolveOutfitCategory,
  weather, outfitSlots, picks, identity,
  type RecommendationView, type WeekDay,
} from "./constants";

/* ── Types ── */

export interface HomeDerivedState {
  temporalMirror: TemporalMirrorResult | null;
  convergentInsight: ConvergentInsightResult | null;
  percentileLabel: string | null;
  ghostData: ReturnType<typeof generateGhostResonance> | null;
  psycheSignature: ReturnType<typeof generatePsycheSignature> | null;
}

/* ── Hook ── */

export function useHomeDerivedState(data: HomeDataResult): HomeDerivedState {
  const { sgData, innerWeather, streakDays } = data;

  const temporalMirror = useMemo<TemporalMirrorResult | null>(() => {
    if (!sgData || (sgData.observationCount ?? 0) < 5) return null;
    try {
      return getTemporalMirror({
        contradictions: [],
        totalContradictions: 0,
        distributions: [],
        innerWeather: innerWeather?.label ?? "不明",
        predictionAccuracy: sgData.confidence ?? 0,
        predictionMisses: 0,
        observationCount: sgData.observationCount ?? 0,
        streakDays: 0,
        avgQuality: 0.5,
      });
    } catch { return null; }
  }, [sgData?.observationCount, sgData?.confidence, innerWeather?.label]);

  const convergentInsight = useMemo<ConvergentInsightResult | null>(() => {
    if (!sgData) return null;
    try {
      return generateConvergentInsight({
        contradictionAxes: [],
        fluctuatingAxes: [],
        predictionErrorAxes: [],
      });
    } catch { return null; }
  }, [sgData]);

  const percentileLabel = useMemo<string | null>(() => {
    if (!sgData) return null;
    try {
      const lb = buildLeaderboard(
        streakDays ?? 0,
        sgData?.confidence ?? 0.5,
        "observer",
        { streakDistribution: {}, totalUsers: 0 },
      );
      return lb.myPercentile > 0
        ? `上位 ${Math.round(100 - lb.myPercentile)}% の観測者`
        : null;
    } catch { return null; }
  }, [sgData?.confidence, streakDays]);

  const ghostData = useMemo(() => {
    const obsCount = sgData?.observationCount ?? 0;
    if (obsCount < 10) return null;
    try {
      return generateGhostResonance({
        archetypeCode: sgData?.archetypeCode ?? "unknown",
        shadowCode: "default",
        axisScores: (sgData as any)?.axisScores ?? {},
        contradictions: [],
        observationDepth: obsCount,
      });
    } catch { return null; }
  }, [sgData?.observationCount, sgData?.archetypeCode]);

  const psycheSignature = useMemo(() => {
    const obsCount = sgData?.observationCount ?? 0;
    if (obsCount < 20) return null;
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      return generatePsycheSignature({
        axisScores: (sgData as any)?.axisScores ?? {},
        archetypeCode: sgData?.archetypeCode ?? "unknown",
        weatherHistory: [],
        blindSpotDrops: 0,
        prophecyAccuracy: 0,
        mapProgress: 0,
        discoveries: [],
        period: "weekly",
        periodStart: weekAgo.toISOString().slice(0, 10),
        periodEnd: now.toISOString().slice(0, 10),
      });
    } catch { return null; }
  }, [sgData?.observationCount, sgData?.archetypeCode]);

  return { temporalMirror, convergentInsight, percentileLabel, ghostData, psycheSignature };
}
