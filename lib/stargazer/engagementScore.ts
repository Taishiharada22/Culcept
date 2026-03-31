// lib/stargazer/engagementScore.ts
// Stargazer Daily Engagement Score — 日々のアクションを定量化する
//
// localStorage ベースで即座に動作。サーバー依存なし。
import { safeSetItem } from "@/lib/stargazer/localStorageHelper";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DailyEngagement {
  /** 朝の質問に回答した (+30pt) */
  morningQuestionAnswered: boolean;
  /** 観測を完了した (+50pt) */
  observationCompleted: boolean;
  /** 予測を検証した (+20pt) */
  predictionVerified: boolean;
  /** 消えるインサイトを閲覧した (+10pt) */
  vanishingInsightViewed: boolean;
  /** リアクションを送った (+5pt per reaction, max 3) */
  reactionCount: number;
  /** Alter との対話を行った (+25pt) */
  alterConversation: boolean;
}

export interface ScoreLevel {
  label: string;
  color: string;
  /** Tailwind text color class */
  textClass: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const POINTS = {
  morningQuestion: 30,
  observation: 50,
  predictionVerified: 20,
  vanishingInsight: 10,
  reactionEach: 5,
  reactionMax: 3,
  alterConversation: 25,
} as const;

/** Maximum possible daily score */
export const MAX_DAILY_SCORE =
  POINTS.morningQuestion +
  POINTS.observation +
  POINTS.predictionVerified +
  POINTS.vanishingInsight +
  POINTS.reactionEach * POINTS.reactionMax +
  POINTS.alterConversation; // 150

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Score Calculation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function calculateDailyScore(engagement: DailyEngagement): number {
  let score = 0;

  if (engagement.morningQuestionAnswered) score += POINTS.morningQuestion;
  if (engagement.observationCompleted) score += POINTS.observation;
  if (engagement.predictionVerified) score += POINTS.predictionVerified;
  if (engagement.vanishingInsightViewed) score += POINTS.vanishingInsight;

  const clampedReactions = Math.min(engagement.reactionCount, POINTS.reactionMax);
  score += clampedReactions * POINTS.reactionEach;

  if (engagement.alterConversation) score += POINTS.alterConversation;

  return score;
}

export function getScoreLevel(score: number): ScoreLevel {
  if (score >= 120) {
    return { label: "極めて活発", color: "#8b5cf6", textClass: "text-violet-600" };
  }
  if (score >= 80) {
    return { label: "活発", color: "#06b6d4", textClass: "text-cyan-600" };
  }
  if (score >= 50) {
    return { label: "順調", color: "#10b981", textClass: "text-emerald-600" };
  }
  if (score >= 20) {
    return { label: "静か", color: "#f59e0b", textClass: "text-amber-500" };
  }
  return { label: "未着手", color: "#94a3b8", textClass: "text-slate-400" };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// localStorage Persistence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getStorageKey(date?: Date): string {
  const d = date ?? new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `sg_daily_engagement_${yyyy}-${mm}-${dd}`;
}

const DEFAULT_ENGAGEMENT: DailyEngagement = {
  morningQuestionAnswered: false,
  observationCompleted: false,
  predictionVerified: false,
  vanishingInsightViewed: false,
  reactionCount: 0,
  alterConversation: false,
};

export function loadTodayEngagement(): DailyEngagement {
  if (typeof window === "undefined") return { ...DEFAULT_ENGAGEMENT };
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return { ...DEFAULT_ENGAGEMENT };
    return { ...DEFAULT_ENGAGEMENT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_ENGAGEMENT };
  }
}

export function saveTodayEngagement(engagement: DailyEngagement): void {
  if (typeof window === "undefined") return;
  try {
    safeSetItem(getStorageKey(), JSON.stringify(engagement));
  } catch {
    // safeSetItem handles quota cleanup internally
  }
}

/**
 * Update a single field of today's engagement.
 * Returns the updated engagement object.
 */
export function updateEngagementField(
  field: keyof DailyEngagement,
  value: boolean | number,
): DailyEngagement {
  const current = loadTodayEngagement();
  const updated = { ...current, [field]: value };
  saveTodayEngagement(updated);
  return updated;
}

/**
 * Increment reaction count (capped at max 3).
 */
export function incrementReaction(): DailyEngagement {
  const current = loadTodayEngagement();
  const updated = {
    ...current,
    reactionCount: Math.min(current.reactionCount + 1, POINTS.reactionMax),
  };
  saveTodayEngagement(updated);
  return updated;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Accuracy Trend
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AccuracyTrend = "improving" | "stable" | "declining";

/**
 * Determine the trend direction from an array of recent accuracy values.
 * Expects values in chronological order (oldest first).
 */
export function getAccuracyTrend(recentValues: number[]): AccuracyTrend {
  if (recentValues.length < 2) return "stable";

  const last3 = recentValues.slice(-3);
  if (last3.length < 2) return "stable";

  const first = last3[0];
  const last = last3[last3.length - 1];
  const diff = last - first;

  if (diff > 5) return "improving";
  if (diff < -5) return "declining";
  return "stable";
}

export function getTrendIndicator(trend: AccuracyTrend): string {
  switch (trend) {
    case "improving":
      return "\u2191"; // ↑
    case "declining":
      return "\u2193"; // ↓
    case "stable":
    default:
      return "\u2192"; // →
  }
}
