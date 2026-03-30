// ============================================================
// Orbiter Feature 3: Self State Report
// 「今の自分」レポート — 状態に基づく判断品質ヒントと軸シフト検出
//
// currentState: observation_state → overallLabel マッピング
// recentShifts: 直近7日 vs その前7日の軸平均を比較
// attractionWarning: 疲労・感情状態に基づく注意喚起
// decisionQualityHint: optimal / caution / rest_first
// ============================================================

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { getAxisLabels } from "@/lib/stargazer/traitAxes";
import type { AxisDistribution } from "@/lib/stargazer/fluctuationEngine";
import type {
  AxisShiftReport,
  SelfStateReport,
  DecisionQualityHint,
} from "./types";

// ── Types for input ──

export interface ObservationState {
  energy: string;
  emotion: string;
  social: string;
  timeOfDay?: string;
}

export interface AxisSnapshot {
  axis_id: string;
  score: number;
  session_date: string;
}

// ── State → Label Mapping ──

interface StateLabelRule {
  energy: string[];
  emotion: string[];
  label: string;
  quality: DecisionQualityHint;
}

const STATE_LABEL_RULES: StateLabelRule[] = [
  // rest_first patterns
  {
    energy: ["very_low"],
    emotion: ["tired", "frustrated", "anxious"],
    label: "回復を最優先にしたい状態",
    quality: "rest_first",
  },
  {
    energy: ["low"],
    emotion: ["frustrated"],
    label: "疲れとストレスが重なっている状態",
    quality: "rest_first",
  },

  // caution patterns
  {
    energy: ["low"],
    emotion: ["tired", "anxious"],
    label: "少し無理をしている状態",
    quality: "caution",
  },
  {
    energy: ["very_low", "low"],
    emotion: ["calm", "neutral"],
    label: "エネルギーが低めだが安定している状態",
    quality: "caution",
  },
  {
    energy: ["moderate"],
    emotion: ["anxious", "frustrated"],
    label: "心がざわついている状態",
    quality: "caution",
  },
  {
    energy: ["very_high"],
    emotion: ["joyful"],
    label: "テンションが高い状態（判断が楽観的になりやすい）",
    quality: "caution",
  },

  // optimal patterns
  {
    energy: ["moderate", "high"],
    emotion: ["calm"],
    label: "穏やかで安定した状態",
    quality: "optimal",
  },
  {
    energy: ["moderate", "high"],
    emotion: ["joyful"],
    label: "前向きで開放的な状態",
    quality: "optimal",
  },
  {
    energy: ["high", "very_high"],
    emotion: ["calm", "neutral"],
    label: "エネルギッシュで冷静な状態",
    quality: "optimal",
  },
  {
    energy: ["moderate"],
    emotion: ["neutral"],
    label: "フラットで冷静な状態",
    quality: "optimal",
  },
];

function matchStateLabel(state: ObservationState): {
  label: string;
  quality: DecisionQualityHint;
} {
  for (const rule of STATE_LABEL_RULES) {
    if (
      rule.energy.includes(state.energy) &&
      rule.emotion.includes(state.emotion)
    ) {
      return { label: rule.label, quality: rule.quality };
    }
  }
  // Default fallback
  return { label: "通常の状態", quality: "optimal" };
}

// ── Attraction Warning ──

function generateAttractionWarning(
  state: ObservationState | null,
): string | null {
  if (!state) return null;

  const { energy, emotion } = state;

  if (energy === "very_low" || energy === "low") {
    if (emotion === "tired" || emotion === "anxious") {
      return "疲れた時は直感に頼りやすい。いつもと違う判断をする可能性がある";
    }
    return "エネルギーが低い時は、新しい出会いへの判断を急がない方が良いかも";
  }

  if (emotion === "frustrated") {
    return "イライラしている時は普段気にならない差異が大きく見えやすい";
  }

  if (energy === "very_high" && emotion === "joyful") {
    return "テンションが高い時は、相手の良い面だけが目に入りやすい傾向がある";
  }

  return null;
}

// ── Recommendation ──

function generateRecommendation(
  quality: DecisionQualityHint,
  state: ObservationState | null,
): string {
  switch (quality) {
    case "rest_first":
      return "今は判断を急がず、まず休息を取ることをおすすめします。リフレッシュした後に改めて見ると、違った印象を受けるかもしれません";
    case "caution":
      if (state?.emotion === "frustrated") {
        return "少し気持ちを落ち着けてから判断すると、より自分らしい選択ができそうです";
      }
      if (state?.energy === "very_high") {
        return "テンションが高い時は楽観的になりやすい。1日置いてもう一度見てみても良いかも";
      }
      return "今の状態を意識しつつ判断すると、より正確な自分の気持ちに気づけそうです";
    case "optimal":
      return "今の状態はバランスが良く、自分の直感を信頼して大丈夫です";
  }
}

// ── Recent Shifts Detection ──

function detectRecentShifts(
  distributions: AxisDistribution[],
  recentSnapshots: AxisSnapshot[],
): AxisShiftReport[] {
  if (recentSnapshots.length < 4) return []; // 最低4件必要

  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  // 直近7日 vs その前7日
  const recentWeek: AxisSnapshot[] = [];
  const previousWeek: AxisSnapshot[] = [];

  for (const snap of recentSnapshots) {
    const snapTime = new Date(snap.session_date).getTime();
    const daysAgo = (now - snapTime) / weekMs;
    if (daysAgo <= 1) recentWeek.push(snap);
    else if (daysAgo <= 2) previousWeek.push(snap);
  }

  if (recentWeek.length < 2 || previousWeek.length < 2) return [];

  // 軸ごとの平均を計算
  const avgByAxis = (
    snaps: AxisSnapshot[],
  ): Map<string, { sum: number; count: number }> => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const s of snaps) {
      const entry = map.get(s.axis_id) ?? { sum: 0, count: 0 };
      entry.sum += s.score;
      entry.count++;
      map.set(s.axis_id, entry);
    }
    return map;
  };

  const recentAvg = avgByAxis(recentWeek);
  const previousAvg = avgByAxis(previousWeek);

  const shifts: AxisShiftReport[] = [];
  const SHIFT_THRESHOLD = 0.1;

  for (const [axisId, recent] of recentAvg) {
    const previous = previousAvg.get(axisId);
    if (!previous) continue;

    const currentCenter = recent.sum / recent.count;
    const previousCenter = previous.sum / previous.count;
    const diff = currentCenter - previousCenter;

    if (Math.abs(diff) < SHIFT_THRESHOLD) continue;

    const labels = getAxisLabels(axisId as TraitAxisKey);
    const axisLabel = labels
      ? `${labels.left} ↔ ${labels.right}`
      : axisId;

    const shiftDirection: "left" | "right" | "stable" =
      diff > SHIFT_THRESHOLD
        ? "right"
        : diff < -SHIFT_THRESHOLD
          ? "left"
          : "stable";

    const dirLabel =
      shiftDirection === "right"
        ? labels?.right ?? "右極"
        : labels?.left ?? "左極";

    shifts.push({
      axis: axisId as TraitAxisKey,
      axisLabel,
      previousCenter,
      currentCenter,
      shiftDirection,
      shiftMagnitude: Math.abs(diff),
      narrative: `${axisLabel}が${dirLabel}寄りに変化中（${diff > 0 ? "+" : ""}${diff.toFixed(2)}）`,
    });
  }

  // シフト量でソート
  shifts.sort((a, b) => b.shiftMagnitude - a.shiftMagnitude);
  return shifts.slice(0, 5); // 上位5件
}

// ── Main Export ──

export function computeSelfStateReport(params: {
  distributions: AxisDistribution[];
  currentState: ObservationState | null;
  recentSnapshots: AxisSnapshot[];
}): SelfStateReport {
  const { distributions, currentState, recentSnapshots } = params;

  // Current state → label + quality
  let currentStateOutput: SelfStateReport["currentState"] = null;
  let decisionQualityHint: DecisionQualityHint = "optimal";

  if (currentState) {
    const { label, quality } = matchStateLabel(currentState);
    decisionQualityHint = quality;
    currentStateOutput = {
      energy: currentState.energy,
      emotion: currentState.emotion,
      social: currentState.social,
      overallLabel: label,
    };
  }

  // Recent shifts
  const recentShifts = detectRecentShifts(distributions, recentSnapshots);

  // Attraction warning
  const attractionWarning = generateAttractionWarning(currentState);

  // Override quality if there are major shifts
  if (recentShifts.some((s) => s.shiftMagnitude > 0.3)) {
    if (decisionQualityHint === "optimal") {
      decisionQualityHint = "caution";
    }
  }

  // Recommendation
  const recommendation = generateRecommendation(
    decisionQualityHint,
    currentState,
  );

  return {
    currentState: currentStateOutput,
    recentShifts,
    attractionWarning,
    recommendation,
    decisionQualityHint,
  };
}
