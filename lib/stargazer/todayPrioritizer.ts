// lib/stargazer/todayPrioritizer.ts
// Today's Intelligence Prioritizer
// 全エンジンのデータから「今日この人に最も重要な情報」を最大3件に絞り込む

import type { UnderstandingLevel } from "./understandingMeter";
import type { Prediction } from "./predictionEngine";
import type { Revision } from "./revisionEngine";
import type { AfterglowMessage } from "./alterAfterglowEngine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TodayPriority {
  type:
    | "prophecy"
    | "contradiction"
    | "insight"
    | "alter_afterglow"
    | "pattern"
    | "milestone"
    | "decay_warning"
    | "streak"
    | "vanishing_insight"
    | "observation_prompt";
  priority: number; // 1-10
  headline: string; // 1-line Japanese
  body: string; // 2-3 sentences
  action?: { label: string; route: string };
  expiresAt?: number;
  /** Icon for display */
  icon: string;
  /** Indicator color key */
  indicator: "green" | "red" | "gold" | "blue" | "slate";
  /** Whether this item is time-sensitive (triggers pulse animation) */
  timeSensitive?: boolean;
}

export interface TodayPrioritizerInput {
  understandingLevel: UnderstandingLevel | null;
  todayPrediction: Prediction | null;
  pendingVerifications: Prediction[];
  revisions: Revision[];
  afterglowMessage: AfterglowMessage | null;
  totalObservations: number;
  axisScores: Record<string, number>;
  contradictionCount: number;
  streakDays: number;
  daysSinceLastObservation: number;
  hasVanishingInsight: boolean;
  vanishingInsightExpiresAt?: number;
  predictionAccuracy: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Priority Rules (sorted by priority desc)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getTodayPriorities(
  input: TodayPrioritizerInput,
): TodayPriority[] {
  const items: TodayPriority[] = [];

  // 1. Decay warning (priority 10) — understanding is declining
  if (
    input.understandingLevel &&
    input.understandingLevel.trend === "declining"
  ) {
    const decayPercent = Math.min(20, (input.daysSinceLastObservation - 2) * 4);
    items.push({
      type: "decay_warning",
      priority: 10,
      headline: "理解度が低下しています",
      body: `${input.daysSinceLastObservation}日間観測がありません。精度が約${decayPercent}%低下した可能性があります。少しの観測で回復できます。`,
      action: { label: "観測を再開する", route: "/stargazer?tab=observe" },
      icon: "⚠️",
      indicator: "red",
      timeSensitive: true,
    });
  } else if (
    input.daysSinceLastObservation >= 3 &&
    input.totalObservations > 0
  ) {
    const decayPercent = Math.min(20, (input.daysSinceLastObservation - 2) * 4);
    items.push({
      type: "decay_warning",
      priority: 10,
      headline: "観測精度が低下中",
      body: `最後の観測から${input.daysSinceLastObservation}日経過しています。理解度が-${decayPercent}%低下しました。`,
      action: { label: "観測する", route: "/stargazer?tab=observe" },
      icon: "⚠️",
      indicator: "red",
      timeSensitive: true,
    });
  }

  // 2. Milestone reached (priority 9)
  if (input.understandingLevel) {
    const { overall } = input.understandingLevel;
    const milestoneThresholds = [25, 50, 75, 90];
    for (const threshold of milestoneThresholds) {
      if (overall >= threshold && overall < threshold + 5) {
        items.push({
          type: "milestone",
          priority: 9,
          headline: `理解度${threshold}%を達成しました`,
          body: `あなたの自己理解が${threshold}%に到達しました。観測を続けることで、さらに深い洞察が得られます。`,
          icon: "🎯",
          indicator: "gold",
        });
        break;
      }
    }
  }

  // 3. Contradiction discovered (priority 8)
  if (input.contradictionCount > 0) {
    items.push({
      type: "contradiction",
      priority: 8,
      headline: "内面の矛盾が見つかりました",
      body: `${input.contradictionCount}件の興味深い矛盾パターンが検出されています。これは自己発見の重要な手がかりです。`,
      action: { label: "矛盾を確認する", route: "/stargazer?tab=starmap" },
      icon: "💎",
      indicator: "gold",
    });
  }

  // 4. Prophecy to verify (priority 7)
  if (input.pendingVerifications.length > 0) {
    const oldest = input.pendingVerifications[0];
    const date = new Date(oldest.createdAt);
    const dayLabel = `${date.getMonth() + 1}/${date.getDate()}`;
    items.push({
      type: "prophecy",
      priority: 7,
      headline: `${dayLabel}の予測を検証できます`,
      body: `「${oldest.prediction}」は当たりましたか？ 検証すると予測精度が向上します。`,
      action: { label: "検証する", route: "/stargazer/predictions" },
      icon: "🔮",
      indicator: "blue",
      timeSensitive: true,
    });
  }

  // 5. Today's prophecy (priority 6)
  if (input.todayPrediction && !input.todayPrediction.verified) {
    items.push({
      type: "prophecy",
      priority: 6,
      headline: "今日の予測",
      body: input.todayPrediction.prediction,
      icon: "🔮",
      indicator: "blue",
    });
  }

  // 6. Vanishing insight (priority 5)
  if (input.hasVanishingInsight) {
    items.push({
      type: "vanishing_insight",
      priority: 5,
      headline: "消える洞察が現れています",
      body: "時間限定の洞察があなたを待っています。消える前に確認しましょう。",
      expiresAt: input.vanishingInsightExpiresAt,
      icon: "✨",
      indicator: "gold",
      timeSensitive: true,
    });
  }

  // 7. Alter afterglow (priority 4)
  if (input.afterglowMessage) {
    items.push({
      type: "alter_afterglow",
      priority: 4,
      headline: "Alterからのメッセージ",
      body: input.afterglowMessage.message,
      icon: "💬",
      indicator: "gold",
    });
  }

  // 8. Behavioral pattern (priority 3) — only show when enough data
  if (input.totalObservations >= 10 && Object.keys(input.axisScores).length >= 5) {
    const accuracyStr =
      input.predictionAccuracy > 0
        ? `予測精度: ${Math.round(input.predictionAccuracy * 100)}%`
        : "";
    items.push({
      type: "pattern",
      priority: 3,
      headline: "行動パターンを学習中",
      body: `${input.totalObservations}回の観測データからあなたの傾向を分析しています。${accuracyStr}`,
      action: { label: "パターンを見る", route: "/stargazer?tab=starmap" },
      icon: "🧠",
      indicator: "blue",
    });
  }

  // 9. Streak status (priority 2)
  if (input.streakDays > 0) {
    const streakLabels: Record<number, string> = {
      3: "3日連続！いい調子です。",
      7: "1週間達成！ 素晴らしい習慣です。",
      14: "2週間連続観測！ 深い理解に近づいています。",
      30: "1ヶ月達成！ あなたの理解は非常に深まりました。",
    };
    const matchedKey = Object.keys(streakLabels)
      .map(Number)
      .filter((k) => input.streakDays >= k)
      .sort((a, b) => b - a)[0];
    const streakMessage = matchedKey
      ? streakLabels[matchedKey]
      : `${input.streakDays}日連続で観測しています。`;

    items.push({
      type: "streak",
      priority: 2,
      headline: `${input.streakDays}日連続観測中`,
      body: streakMessage,
      icon: input.streakDays >= 7 ? "🌟" : "🔥",
      indicator: input.streakDays >= 7 ? "gold" : "green",
    });
  }

  // 10. Observation prompt (priority 1) — default fallback
  if (items.length === 0) {
    items.push({
      type: "observation_prompt",
      priority: 1,
      headline: "今日の観測を始めましょう",
      body: "日々の観測が、あなた自身の深い理解につながります。",
      action: { label: "観測する", route: "/stargazer?tab=observe" },
      icon: "🔭",
      indicator: "slate",
    });
  }

  // Sort by priority descending, take max 3
  items.sort((a, b) => b.priority - a.priority);
  return items.slice(0, 3);
}
