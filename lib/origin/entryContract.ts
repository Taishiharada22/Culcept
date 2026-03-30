// lib/origin/entryContract.ts
// Entry Contract — 判断ベースの選択肢式エントリー
// 「今日、一番エネルギーを使った場面は？」から始まる軽量な入口

// ---------------------------------------------------------------------------
// Judgment Categories（判断の場面カテゴリ）
// ---------------------------------------------------------------------------

export type JudgmentCategory =
  | "work_decision"      // 仕事の判断
  | "relationship"       // 人間関係
  | "time_allocation"    // 時間の使い方
  | "self_care"          // 自分のケア
  | "money"              // お金の使い方
  | "nothing_special";   // 特になし（これもデータ）

export type JudgmentCategoryMeta = {
  label: string;
  emoji: string;
  description: string;
  /** Stargazer 軸との関連（パイプライン連携用） */
  relatedAxes: string[];
};

export const JUDGMENT_CATEGORIES: Record<JudgmentCategory, JudgmentCategoryMeta> = {
  work_decision: {
    label: "仕事の判断",
    emoji: "💼",
    description: "業務上の決定、優先順位づけ",
    relatedAxes: ["analytical_vs_intuitive", "plan_vs_spontaneous", "decision_tempo"],
  },
  relationship: {
    label: "人間関係",
    emoji: "🤝",
    description: "対人関係での気遣いや判断",
    relatedAxes: ["direct_vs_diplomatic", "independence_vs_harmony", "public_private_gap"],
  },
  time_allocation: {
    label: "時間の使い方",
    emoji: "⏰",
    description: "何に時間を使うかの選択",
    relatedAxes: ["plan_vs_spontaneous", "function_vs_expression", "perfectionist_vs_pragmatic"],
  },
  self_care: {
    label: "自分のケア",
    emoji: "🌿",
    description: "休息、運動、心のケア",
    relatedAxes: ["emotional_regulation", "locus_of_control", "stress_isolation_vs_social"],
  },
  money: {
    label: "お金の使い方",
    emoji: "💰",
    description: "購買、投資、節約の判断",
    relatedAxes: ["cautious_vs_bold", "quality_vs_quantity", "function_vs_expression"],
  },
  nothing_special: {
    label: "特になし",
    emoji: "🌙",
    description: "判断コストが低い日（これも重要なデータ）",
    relatedAxes: [],
  },
};

export const JUDGMENT_CATEGORY_ORDER: JudgmentCategory[] = [
  "work_decision",
  "relationship",
  "time_allocation",
  "self_care",
  "money",
  "nothing_special",
];

// ---------------------------------------------------------------------------
// Entry Record — 1日のエントリー記録
// ---------------------------------------------------------------------------

export type EntryRecord = {
  date: string;          // YYYY-MM-DD
  category: JudgmentCategory;
  /** オプション: 一言メモ（自由記述、省略可） */
  note?: string;
  recordedAt: string;    // ISO string
};

// ---------------------------------------------------------------------------
// Entry History Analysis
// ---------------------------------------------------------------------------

export type CategoryFrequency = {
  category: JudgmentCategory;
  count: number;
  percentage: number;
};

/**
 * 直近 N 日のエントリーからカテゴリ頻度を集計
 */
export function analyzeEntryHistory(
  entries: EntryRecord[],
  days: number = 14,
): CategoryFrequency[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const recent = entries.filter((e) => e.date >= cutoffStr);
  if (recent.length === 0) return [];

  const counts: Partial<Record<JudgmentCategory, number>> = {};
  for (const e of recent) {
    counts[e.category] = (counts[e.category] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([cat, count]) => ({
      category: cat as JudgmentCategory,
      count: count!,
      percentage: Math.round((count! / recent.length) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 「特になし」の頻度から判断コストの傾向を検出
 */
export function detectLowJudgmentDays(entries: EntryRecord[], days: number = 14): {
  ratio: number;
  trend: "increasing" | "stable" | "decreasing";
} {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const recent = entries.filter((e) => e.date >= cutoffStr);
  if (recent.length < 3) return { ratio: 0, trend: "stable" };

  const nothingCount = recent.filter((e) => e.category === "nothing_special").length;
  const ratio = nothingCount / recent.length;

  // 前半 vs 後半で増減トレンド
  const mid = Math.floor(recent.length / 2);
  const firstHalf = recent.slice(0, mid).filter((e) => e.category === "nothing_special").length;
  const secondHalf = recent.slice(mid).filter((e) => e.category === "nothing_special").length;
  const firstRate = firstHalf / Math.max(mid, 1);
  const secondRate = secondHalf / Math.max(recent.length - mid, 1);

  let trend: "increasing" | "stable" | "decreasing" = "stable";
  if (secondRate - firstRate > 0.15) trend = "increasing";
  else if (firstRate - secondRate > 0.15) trend = "decreasing";

  return { ratio, trend };
}

// ---------------------------------------------------------------------------
// Entry → DailyOrbit 連携
// ---------------------------------------------------------------------------

/**
 * Entry のカテゴリから、DailyOrbit で優先すべき層を提案する。
 * 適応的レイヤー表示（P1）の基盤。
 */
export function suggestOrbitLayers(category: JudgmentCategory): string[] {
  switch (category) {
    case "work_decision":
      return ["tasks", "shadowIntention", "selfForecast"];
    case "relationship":
      return ["tasks", "bodyEcho", "reflection"];
    case "time_allocation":
      return ["tasks", "timeTexture", "selfForecast"];
    case "self_care":
      return ["bodyEcho", "dayState", "reflection"];
    case "money":
      return ["tasks", "shadowIntention", "timeTexture"];
    case "nothing_special":
      return ["bodyEcho", "temporalDialogue", "reflection"];
  }
}
