// lib/stargazer/prophecyAccuracy.ts
// Prophecy verification accuracy tracking engine.
// Computes detailed stats, streaks, milestones, and trends
// from verified prophecy data.

import type { ProphecyCategory, VerificationLevel } from "./dailyProphecy";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface VerifiedProphecy {
  id: string;
  prophecyDate: string;
  category: ProphecyCategory;
  verificationLevel: VerificationLevel;
  accuracyScore: number;
  verifiedAt: string;
}

export interface AccuracyStats {
  totalVerified: number;
  exactHits: number;
  closeHits: number;
  partialHits: number;
  misses: number;
  hitRate: number;
  streak: number;
  bestStreak: number;
  recentTrend: "improving" | "stable" | "declining";
  weekdayAccuracy: Record<string, number>;
  categoryAccuracy: Record<string, number>;
  milestones: AccuracyMilestone[];
}

export interface AccuracyMilestone {
  id: string;
  label: string;
  description: string;
  unlockedAt?: string;
  icon: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Milestone definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

const MILESTONE_DEFS: Array<{
  id: string;
  label: string;
  description: string;
  icon: string;
  check: (stats: AccuracyStats) => boolean;
}> = [
  {
    id: "first_verify",
    label: "初回検証",
    description: "最初の予言を検証した",
    icon: "eye",
    check: (s) => s.totalVerified >= 1,
  },
  {
    id: "streak_3",
    label: "3連的中",
    description: "3日連続で的中",
    icon: "flame",
    check: (s) => s.bestStreak >= 3,
  },
  {
    id: "streak_7",
    label: "1週間の眼",
    description: "7日連続で的中",
    icon: "telescope",
    check: (s) => s.bestStreak >= 7,
  },
  {
    id: "streak_14",
    label: "半月の予知者",
    description: "14日連続で的中",
    icon: "moon",
    check: (s) => s.bestStreak >= 14,
  },
  {
    id: "rate_70",
    label: "70%の壁を超えた",
    description: "的中率70%突破（10件以上）",
    icon: "target",
    check: (s) => s.totalVerified >= 10 && s.hitRate >= 0.7,
  },
  {
    id: "rate_80",
    label: "80%の領域",
    description: "的中率80%突破（20件以上）",
    icon: "star",
    check: (s) => s.totalVerified >= 20 && s.hitRate >= 0.8,
  },
  {
    id: "total_30",
    label: "30回の観測",
    description: "30回の検証を完了",
    icon: "layers",
    check: (s) => s.totalVerified >= 30,
  },
  {
    id: "total_100",
    label: "100回の悟り",
    description: "100回の検証を完了",
    icon: "infinity",
    check: (s) => s.totalVerified >= 100,
  },
  {
    id: "weekday_master",
    label: "曜日の法則",
    description: "特定曜日で90%以上の的中率",
    icon: "calendar",
    check: (s) => {
      return Object.values(s.weekdayAccuracy).some((rate) => rate >= 0.9);
    },
  },
  {
    id: "category_master",
    label: "カテゴリマスター",
    description: "特定カテゴリで85%以上（10件以上）",
    icon: "award",
    check: (s) => {
      return Object.values(s.categoryAccuracy).some((rate) => rate >= 0.85);
    },
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Map a verification level to whether it counts as a "hit" */
function isHit(level: VerificationLevel): boolean {
  return level === "exact" || level === "close";
}

/** Map the old 3-status model to 5-level verification */
export function statusToLevel(
  status: string,
  accuracyScore: number,
): VerificationLevel {
  if (status === "correct" || status === "yes" || accuracyScore >= 0.85) {
    return "exact";
  }
  if (accuracyScore >= 0.6) return "close";
  if (
    status === "partially_correct" ||
    status === "partial" ||
    accuracyScore >= 0.35
  ) {
    return "partial";
  }
  if (accuracyScore <= 0.05) return "opposite";
  return "off";
}

/**
 * Calculate comprehensive accuracy stats from verified prophecy data.
 */
export function calculateAccuracyStats(
  prophecies: VerifiedProphecy[],
): AccuracyStats {
  if (prophecies.length === 0) {
    return {
      totalVerified: 0,
      exactHits: 0,
      closeHits: 0,
      partialHits: 0,
      misses: 0,
      hitRate: 0,
      streak: 0,
      bestStreak: 0,
      recentTrend: "stable",
      weekdayAccuracy: {},
      categoryAccuracy: {},
      milestones: [],
    };
  }

  // Sort by date ascending for streak calculation
  const sorted = [...prophecies].sort(
    (a, b) => a.prophecyDate.localeCompare(b.prophecyDate),
  );

  let exactHits = 0;
  let closeHits = 0;
  let partialHits = 0;
  let misses = 0;

  for (const p of sorted) {
    switch (p.verificationLevel) {
      case "exact":
        exactHits++;
        break;
      case "close":
        closeHits++;
        break;
      case "partial":
        partialHits++;
        break;
      case "off":
      case "opposite":
        misses++;
        break;
    }
  }

  const totalVerified = sorted.length;
  const hitRate =
    totalVerified > 0 ? (exactHits + closeHits) / totalVerified : 0;

  // Streak calculation
  let streak = 0;
  let bestStreak = 0;
  let runningStreak = 0;

  for (const p of sorted) {
    if (isHit(p.verificationLevel)) {
      runningStreak++;
      bestStreak = Math.max(bestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }
  streak = runningStreak;

  // Recent trend: last 14 vs prior 14
  let recentTrend: "improving" | "stable" | "declining" = "stable";
  if (sorted.length >= 10) {
    const mid = Math.floor(sorted.length / 2);
    const recentHalf = sorted.slice(mid);
    const earlierHalf = sorted.slice(0, mid);
    const recentHitRate =
      recentHalf.filter((p) => isHit(p.verificationLevel)).length /
      recentHalf.length;
    const earlierHitRate =
      earlierHalf.filter((p) => isHit(p.verificationLevel)).length /
      earlierHalf.length;
    const diff = recentHitRate - earlierHitRate;
    if (diff > 0.08) recentTrend = "improving";
    else if (diff < -0.08) recentTrend = "declining";
  }

  // Weekday accuracy
  const weekdayGroups: Record<string, { hits: number; total: number }> = {};
  for (const p of sorted) {
    const d = new Date(p.prophecyDate);
    const dayIdx = d.getDay();
    const dayName = WEEKDAY_NAMES[dayIdx];
    if (!weekdayGroups[dayName]) weekdayGroups[dayName] = { hits: 0, total: 0 };
    weekdayGroups[dayName].total++;
    if (isHit(p.verificationLevel)) weekdayGroups[dayName].hits++;
  }
  const weekdayAccuracy: Record<string, number> = {};
  for (const [day, data] of Object.entries(weekdayGroups)) {
    weekdayAccuracy[day] = data.total > 0 ? data.hits / data.total : 0;
  }

  // Category accuracy
  const catGroups: Record<string, { hits: number; total: number }> = {};
  for (const p of sorted) {
    if (!catGroups[p.category]) catGroups[p.category] = { hits: 0, total: 0 };
    catGroups[p.category].total++;
    if (isHit(p.verificationLevel)) catGroups[p.category].hits++;
  }
  const categoryAccuracy: Record<string, number> = {};
  for (const [cat, data] of Object.entries(catGroups)) {
    categoryAccuracy[cat] = data.total > 0 ? data.hits / data.total : 0;
  }

  // Milestones
  const stats: AccuracyStats = {
    totalVerified,
    exactHits,
    closeHits,
    partialHits,
    misses,
    hitRate,
    streak,
    bestStreak,
    recentTrend,
    weekdayAccuracy,
    categoryAccuracy,
    milestones: [],
  };

  stats.milestones = MILESTONE_DEFS.filter((m) => m.check(stats)).map((m) => ({
    id: m.id,
    label: m.label,
    description: m.description,
    icon: m.icon,
  }));

  return stats;
}

/**
 * Detect newly unlocked milestones by comparing current stats
 * against previously unlocked milestone IDs.
 */
export function checkNewMilestones(
  stats: AccuracyStats,
  previousMilestoneIds: string[],
): AccuracyMilestone[] {
  const previousSet = new Set(previousMilestoneIds);
  return stats.milestones
    .filter((m) => !previousSet.has(m.id))
    .map((m) => ({
      ...m,
      unlockedAt: new Date().toISOString(),
    }));
}

/**
 * Generate a human-readable accuracy message in Japanese.
 */
export function formatAccuracyMessage(stats: AccuracyStats): string {
  if (stats.totalVerified === 0) {
    return "まだ検証データがありません。予言を検証すると精度が測定されます。";
  }

  const hitPct = Math.round(stats.hitRate * 100);
  const trendLabel =
    stats.recentTrend === "improving"
      ? "上昇"
      : stats.recentTrend === "declining"
        ? "低下"
        : "安定";

  // Find best weekday
  let bestWeekday = "";
  let bestWeekdayRate = 0;
  for (const [day, rate] of Object.entries(stats.weekdayAccuracy)) {
    if (rate > bestWeekdayRate) {
      bestWeekday = day;
      bestWeekdayRate = rate;
    }
  }

  let msg = `あなたの予言精度は${hitPct}%。${trendLabel}傾向。`;
  if (bestWeekday && bestWeekdayRate > 0) {
    msg += `${bestWeekday}曜日が最も正確(${Math.round(bestWeekdayRate * 100)}%)。`;
  }
  if (stats.streak > 0) {
    msg += `現在${stats.streak}日連続的中中。`;
  }

  return msg;
}

/**
 * Map the old status-based verification to a VerificationLevel
 * so the UI can use the 5-level system.
 */
export function mapToVerificationLevel(
  answer: string,
): VerificationLevel {
  const lower = answer.toLowerCase();

  // Exact hits
  if (
    lower.includes("その通り") ||
    lower.includes("まさに") ||
    lower.includes("確かに") ||
    lower.includes("動かされた")
  ) {
    return "exact";
  }

  // Close hits
  if (
    lower.includes("少し違") ||
    lower.includes("近い") ||
    lower.includes("似た感覚") ||
    lower.includes("部分的に当て")
  ) {
    return "close";
  }

  // Partial
  if (
    lower.includes("部分") ||
    lower.includes("違う形") ||
    lower.includes("理由が違") ||
    lower.includes("抑えた")
  ) {
    return "partial";
  }

  // Opposite
  if (
    lower.includes("逆") ||
    lower.includes("向き合えた") // For avoidance: opposite of avoidance prediction
  ) {
    return "opposite";
  }

  // Off (default miss)
  return "off";
}

/**
 * Get all milestone definitions (for rendering locked/unlocked UI).
 */
export function getAllMilestones(): Array<{
  id: string;
  label: string;
  description: string;
  icon: string;
}> {
  return MILESTONE_DEFS.map((m) => ({
    id: m.id,
    label: m.label,
    description: m.description,
    icon: m.icon,
  }));
}
