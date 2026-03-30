// lib/stargazer/reactionTypes.ts
// 5つの反応タイプ定義 — Core, Drive, Defence, Sync, Quest

import type { TraitAxisKey } from "./traitAxes";

// ── 反応タイプコード ──

export type ReactionTypeCode = "core" | "drive" | "defence" | "sync" | "quest";

export interface ReactionTypeDef {
  code: ReactionTypeCode;
  label: string;
  englishLabel: string;
  emoji: string;
  description: string;
  keywords: string[];
  indicatorAxes: {
    key: TraitAxisKey;
    direction: "positive" | "negative";
    weight: number;
  }[];
  visualModifier: {
    accentColor: string;
    lightSuffix: string;
  };
}

// ── 5 反応タイプ定義 ──

export const REACTION_TYPES: ReactionTypeDef[] = [
  {
    code: "core",
    label: "自然体",
    englishLabel: "Core",
    emoji: "🌀",
    description:
      "もっとも自然な状態。外圧や役割に引っ張られず、その人の核が素直に出ている。",
    keywords: ["素直", "安定", "ブレない", "自然体"],
    indicatorAxes: [
      { key: "emotional_variability", direction: "negative", weight: 1.2 },
      { key: "public_private_gap", direction: "negative", weight: 1.0 },
      { key: "emotional_regulation", direction: "positive", weight: 0.8 },
      { key: "relationship_mode_split", direction: "negative", weight: 0.7 },
      { key: "intent_stability", direction: "positive", weight: 0.6 },
    ],
    visualModifier: {
      accentColor: "rgba(240,235,220,0.6)",
      lightSuffix: "穏やかな常光",
    },
  },
  {
    code: "drive",
    label: "推進",
    englishLabel: "Drive",
    emoji: "🔥",
    description:
      "動かす・進める・突破する方向に力が出る。意思や推進力が表に出やすい。",
    keywords: ["推進力", "大胆", "行動力", "突破"],
    indicatorAxes: [
      { key: "cautious_vs_bold", direction: "positive", weight: 1.2 },
      { key: "social_initiative", direction: "positive", weight: 1.0 },
      { key: "direct_vs_diplomatic", direction: "negative", weight: 0.8 },
      { key: "plan_vs_spontaneous", direction: "positive", weight: 0.6 },
      { key: "introvert_vs_extrovert", direction: "positive", weight: 0.5 },
    ],
    visualModifier: {
      accentColor: "rgba(255,140,50,0.6)",
      lightSuffix: "推進の炎",
    },
  },
  {
    code: "defence",
    label: "守護",
    englishLabel: "Defence",
    emoji: "🛡️",
    description:
      "守る・警戒する・秩序を維持する方向に力が出る。自己防衛だけでなく、相手や場を守る形でも出る。",
    keywords: ["守護", "秩序", "慎重", "安全"],
    indicatorAxes: [
      { key: "boundary_awareness", direction: "positive", weight: 1.2 },
      { key: "change_embrace_vs_resist", direction: "positive", weight: 1.0 },
      { key: "cautious_vs_bold", direction: "negative", weight: 0.8 },
      { key: "boundary_respect", direction: "positive", weight: 0.7 },
      { key: "consent_maturity", direction: "positive", weight: 0.6 },
    ],
    visualModifier: {
      accentColor: "rgba(100,160,255,0.6)",
      lightSuffix: "守護の盾光",
    },
  },
  {
    code: "sync",
    label: "共鳴",
    englishLabel: "Sync",
    emoji: "🫧",
    description:
      "周囲とのズレを小さくし、共鳴や調整を優先する。人や空気、関係性への感応が高い。",
    keywords: ["共鳴", "調和", "配慮", "感応"],
    indicatorAxes: [
      { key: "independence_vs_harmony", direction: "positive", weight: 1.2 },
      { key: "direct_vs_diplomatic", direction: "positive", weight: 1.0 },
      { key: "stress_isolation_vs_social", direction: "positive", weight: 0.8 },
      { key: "reassurance_need", direction: "positive", weight: 0.6 },
      { key: "introvert_vs_extrovert", direction: "positive", weight: 0.5 },
    ],
    visualModifier: {
      accentColor: "rgba(180,140,255,0.6)",
      lightSuffix: "共鳴の波紋",
    },
  },
  {
    code: "quest",
    label: "探究",
    englishLabel: "Quest",
    emoji: "🔮",
    description:
      "未知への好奇心が前に出る。試す、越える、広げる、探る方向で反応する。",
    keywords: ["好奇心", "探究", "挑戦", "拡張"],
    indicatorAxes: [
      { key: "tradition_vs_novelty", direction: "positive", weight: 1.2 },
      { key: "change_embrace_vs_resist", direction: "negative", weight: 1.0 },
      { key: "quality_vs_quantity", direction: "positive", weight: 0.6 },
      { key: "analytical_vs_intuitive", direction: "positive", weight: 0.5 },
      { key: "plan_vs_spontaneous", direction: "positive", weight: 0.5 },
    ],
    visualModifier: {
      accentColor: "rgba(100,220,180,0.6)",
      lightSuffix: "探究の光芒",
    },
  },
];

// ── 反応タイプ解決 ──

export function resolveReactionType(
  axisScores: Partial<Record<TraitAxisKey, number>>
): ReactionTypeCode {
  let bestCode: ReactionTypeCode = "core";
  let bestScore = -Infinity;

  for (const rt of REACTION_TYPES) {
    let score = 0;
    let totalWeight = 0;

    for (const indicator of rt.indicatorAxes) {
      const axisVal = axisScores[indicator.key];
      if (axisVal == null) continue;

      const directionMultiplier =
        indicator.direction === "positive" ? 1 : -1;
      score += axisVal * directionMultiplier * indicator.weight;
      totalWeight += indicator.weight;
    }

    // Normalize by available weight
    const normalized = totalWeight > 0 ? score / totalWeight : 0;
    if (normalized > bestScore) {
      bestScore = normalized;
      bestCode = rt.code;
    }
  }

  return bestCode;
}

export function getReactionType(
  code: ReactionTypeCode
): ReactionTypeDef | undefined {
  return REACTION_TYPES.find((r) => r.code === code);
}

export const REACTION_TYPE_CODES: ReactionTypeCode[] = [
  "core",
  "drive",
  "defence",
  "sync",
  "quest",
];
