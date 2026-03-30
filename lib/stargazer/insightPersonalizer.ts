// lib/stargazer/insightPersonalizer.ts
// パーソナライゼーション学習ループ — ユーザーの反応履歴からインサイト嗜好を構築し、
// AI 生成のプロンプトコンテキストに変換する。

import type { SupabaseClient } from "@supabase/supabase-js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface InsightPreference {
  preferredCategories: string[]; // categories with high "resonated" rate
  avoidedCategories: string[]; // categories with high "off_target" rate
  preferredTone: "warm" | "provocative" | "analytical" | "neutral";
  insightDepthPreference: "shallow" | "medium" | "deep";
  reactionSummary: Record<string, { resonated: number; total: number }>;
}

interface ReactionRow {
  category?: string | null;
  reaction?: string | null;
  type?: string | null;
  depth?: string | null;
  tone?: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const POSITIVE_REACTIONS = new Set(["resonated", "surprising"]);
const NEGATIVE_REACTIONS = new Set(["off_target", "unclear", "expected"]);
const RESONATED_THRESHOLD = 0.6; // 60% resonated = preferred
const AVOIDED_THRESHOLD = 0.5; // 50% off_target = avoided

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Build preference from reaction history
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function buildInsightPreference(
  userId: string,
  supabase: SupabaseClient,
): Promise<InsightPreference> {
  // Aggregate category -> { resonated, total } from multiple tables
  const reactionSummary: Record<string, { resonated: number; total: number }> =
    {};
  const toneCounts: Record<string, number> = {
    warm: 0,
    provocative: 0,
    analytical: 0,
    neutral: 0,
  };
  const depthCounts: Record<string, number> = {
    shallow: 0,
    medium: 0,
    deep: 0,
  };

  // 1. stargazer_observations (meta_observation / afterglow_reaction / ghost_resonance_reaction)
  try {
    const { data: observations } = await supabase
      .from("stargazer_observations")
      .select("observation_type, response_value, question_category")
      .eq("user_id", userId)
      .in("observation_type", [
        "meta_observation",
        "afterglow_reaction",
        "ghost_resonance_reaction",
      ])
      .order("answered_at", { ascending: false })
      .limit(200);

    if (observations) {
      for (const row of observations) {
        const category =
          (row.question_category as string) ?? (row.observation_type as string);
        const reaction = row.response_value as string;
        if (!category || !reaction) continue;

        if (!reactionSummary[category]) {
          reactionSummary[category] = { resonated: 0, total: 0 };
        }
        reactionSummary[category].total++;
        if (POSITIVE_REACTIONS.has(reaction)) {
          reactionSummary[category].resonated++;
        }
      }
    }
  } catch {
    // non-fatal
  }

  // 2. stargazer_vanishing_insights (user_reaction field)
  try {
    const { data: insights } = await supabase
      .from("stargazer_vanishing_insights")
      .select("depth, user_reaction, tone")
      .eq("user_id", userId)
      .not("user_reaction", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (insights) {
      for (const row of insights) {
        const category = mapDepthToCategory(row.depth as string);
        const reaction = row.user_reaction as string;

        if (!reactionSummary[category]) {
          reactionSummary[category] = { resonated: 0, total: 0 };
        }
        reactionSummary[category].total++;
        if (POSITIVE_REACTIONS.has(reaction)) {
          reactionSummary[category].resonated++;
        }

        // Track tone preference based on positive reactions
        const tone = row.tone as string;
        if (tone && POSITIVE_REACTIONS.has(reaction)) {
          const mappedTone = mapToToneKey(tone);
          if (mappedTone in toneCounts) {
            toneCounts[mappedTone]++;
          }
        }

        // Track depth preference
        const depth = row.depth as string;
        if (depth && POSITIVE_REACTIONS.has(reaction)) {
          const mappedDepth = mapToDepthKey(depth);
          if (mappedDepth in depthCounts) {
            depthCounts[mappedDepth]++;
          }
        }
      }
    }
  } catch {
    // non-fatal
  }

  // 3. stargazer_alter_letters (user_reaction field)
  try {
    const { data: letters } = await supabase
      .from("stargazer_alter_letters")
      .select("letter_type, user_reaction")
      .eq("user_id", userId)
      .not("user_reaction", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (letters) {
      for (const row of letters) {
        const category =
          (row.letter_type as string) ?? "alter_letter";
        const reaction = row.user_reaction as string;

        if (!reactionSummary[category]) {
          reactionSummary[category] = { resonated: 0, total: 0 };
        }
        reactionSummary[category].total++;
        if (POSITIVE_REACTIONS.has(reaction)) {
          reactionSummary[category].resonated++;
        }
      }
    }
  } catch {
    // non-fatal
  }

  // 4. stargazer_blind_spot_drops (reaction field)
  try {
    const { data: drops } = await supabase
      .from("stargazer_blind_spot_drops")
      .select("category, reaction, tone")
      .eq("user_id", userId)
      .not("reaction", "is", null)
      .order("drop_date", { ascending: false })
      .limit(50);

    if (drops) {
      for (const row of drops) {
        const category = (row.category as string) ?? "blind_spot";
        const reaction = row.reaction as string;

        if (!reactionSummary[category]) {
          reactionSummary[category] = { resonated: 0, total: 0 };
        }
        reactionSummary[category].total++;
        if (POSITIVE_REACTIONS.has(reaction)) {
          reactionSummary[category].resonated++;
        }

        // Track tone preference
        const tone = row.tone as string;
        if (tone && POSITIVE_REACTIONS.has(reaction)) {
          const mappedTone = mapToToneKey(tone);
          if (mappedTone in toneCounts) {
            toneCounts[mappedTone]++;
          }
        }
      }
    }
  } catch {
    // non-fatal
  }

  // Derive preferred / avoided categories
  const preferredCategories: string[] = [];
  const avoidedCategories: string[] = [];

  for (const [category, stats] of Object.entries(reactionSummary)) {
    if (stats.total < 2) continue; // need at least 2 data points
    const rate = stats.resonated / stats.total;
    if (rate >= RESONATED_THRESHOLD) {
      preferredCategories.push(category);
    }
    // Check if most reactions are negative
    const negativeRate = (stats.total - stats.resonated) / stats.total;
    if (negativeRate >= AVOIDED_THRESHOLD && stats.total >= 3) {
      avoidedCategories.push(category);
    }
  }

  // Determine preferred tone
  const preferredTone = (
    Object.entries(toneCounts) as [InsightPreference["preferredTone"], number][]
  ).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";

  // Determine depth preference
  const preferredDepth = (
    Object.entries(depthCounts) as [InsightPreference["insightDepthPreference"], number][]
  ).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "medium";

  return {
    preferredCategories,
    avoidedCategories,
    preferredTone: preferredTone as InsightPreference["preferredTone"],
    insightDepthPreference: preferredDepth as InsightPreference["insightDepthPreference"],
    reactionSummary,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Generate prompt context from preference
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function preferenceToPromptContext(pref: InsightPreference): string {
  const parts: string[] = [];

  // Preferred categories
  if (pref.preferredCategories.length > 0) {
    parts.push(
      `このユーザーは「${pref.preferredCategories.join("」「")}」カテゴリのインサイトに共鳴しやすい傾向があります。`,
    );
  }

  // Avoided categories
  if (pref.avoidedCategories.length > 0) {
    parts.push(
      `「${pref.avoidedCategories.join("」「")}」にはピンとこない傾向があります。`,
    );
  }

  // Tone preference
  const toneDescriptions: Record<InsightPreference["preferredTone"], string> = {
    warm: "温かみのあるトーンを好みます。",
    provocative: "鋭く挑発的なトーンに響きやすいです。",
    analytical: "分析的で論理的なトーンを好みます。",
    neutral: "特にトーンの偏りはありません。",
  };
  if (pref.preferredTone !== "neutral") {
    parts.push(toneDescriptions[pref.preferredTone]);
  }

  // Depth preference
  const depthDescriptions: Record<InsightPreference["insightDepthPreference"], string> = {
    shallow: "表層的で分かりやすいインサイトを好みます。",
    medium: "中程度の深さのインサイトが最も響きます。",
    deep: "深層的で核心に迫るインサイトに共鳴しやすいです。",
  };
  if (pref.insightDepthPreference !== "medium") {
    parts.push(depthDescriptions[pref.insightDepthPreference]);
  }

  // Reaction summary context
  const totalReactions = Object.values(pref.reactionSummary).reduce(
    (sum, s) => sum + s.total,
    0,
  );
  if (totalReactions > 0) {
    const totalResonated = Object.values(pref.reactionSummary).reduce(
      (sum, s) => sum + s.resonated,
      0,
    );
    const overallRate = Math.round((totalResonated / totalReactions) * 100);
    parts.push(
      `全体の共鳴率は${overallRate}%（${totalReactions}回の反応データから）。`,
    );
  }

  if (parts.length === 0) {
    return ""; // No preference data available
  }

  return `\n【ユーザーの嗜好プロファイル】\n${parts.join("\n")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mapDepthToCategory(depth: string | null): string {
  switch (depth) {
    case "core":
    case "nucleus":
    case "kernel":
      return "盲点";
    case "deep":
    case "depth":
      return "深層の兆候";
    case "mid":
    case "medium":
      return "矛盾発見";
    case "surface":
    case "shallow":
      return "行動パターン";
    default:
      return depth ?? "予感";
  }
}

function mapToToneKey(
  tone: string,
): InsightPreference["preferredTone"] {
  switch (tone) {
    case "warm":
    case "poetic":
      return "warm";
    case "harsh":
    case "provocative":
      return "provocative";
    case "clinical":
    case "analytical":
      return "analytical";
    default:
      return "neutral";
  }
}

function mapToDepthKey(
  depth: string,
): InsightPreference["insightDepthPreference"] {
  switch (depth) {
    case "core":
    case "nucleus":
    case "deep":
    case "depth":
      return "deep";
    case "mid":
    case "medium":
      return "medium";
    case "surface":
    case "shallow":
      return "shallow";
    default:
      return "medium";
  }
}
