// ============================================================
// Instant Resonance Engine
// 行動選択から性格軸を推定するオンボーディング体験
// ============================================================

import type { MatchingVector } from "./types";

// ---------- Types ----------

export type ResonanceCard = {
  id: string;
  optionA: { label: string; imageHint: string; emoji: string };
  optionB: { label: string; imageHint: string; emoji: string };
  axisMapping: {
    axis: keyof MatchingVector;
    aValue: number;
    bValue: number;
    weight: number;
  }[];
};

export type ResonanceChoice = {
  cardId: string;
  selected: "a" | "b";
};

export type ResonanceResult = {
  partialVector: Partial<MatchingVector>;
  confidence: Record<string, number>;
  discoveredAxes: {
    axis: string;
    label: string;
    value: number;
    confidence: number;
  }[];
  readyForMatching: boolean;
};

export type InstantChemistry = {
  overallResonance: number; // 0..100
  sparkAxes: {
    axis: string;
    label: string;
    type: "harmony" | "complement" | "tension";
  }[];
  narrativeHint: string;
};

// ---------- Axis Labels (Japanese) ----------

const AXIS_LABELS: Record<keyof MatchingVector, string> = {
  conversation_temperature: "会話の温度",
  distance_need: "距離感",
  depth_speed: "深まる速度",
  stability_need: "安定への欲求",
  stimulation_need: "刺激への感度",
  initiative: "主導性",
  emotional_openness: "感情の開き方",
  conflict_directness: "衝突への向き合い方",
  social_energy: "社交エネルギー",
  structure_preference: "構造への志向",
};

// ---------- 12 Resonance Cards ----------

export const RESONANCE_CARDS: ResonanceCard[] = [
  {
    id: "forest-vs-skyline",
    optionA: {
      label: "森の中の小道",
      imageHint: "forest_path",
      emoji: "🌿",
    },
    optionB: {
      label: "街の展望台",
      imageHint: "city_skyline",
      emoji: "🌃",
    },
    axisMapping: [
      { axis: "social_energy", aValue: 0.25, bValue: 0.75, weight: 1.0 },
      { axis: "stimulation_need", aValue: 0.3, bValue: 0.7, weight: 0.6 },
    ],
  },
  {
    id: "latenight-vs-morning",
    optionA: {
      label: "深夜の長電話",
      imageHint: "late_night_call",
      emoji: "🌙",
    },
    optionB: {
      label: "朝のショートメッセージ",
      imageHint: "morning_message",
      emoji: "☀️",
    },
    axisMapping: [
      {
        axis: "conversation_temperature",
        aValue: 0.8,
        bValue: 0.3,
        weight: 1.0,
      },
      { axis: "depth_speed", aValue: 0.75, bValue: 0.35, weight: 0.7 },
    ],
  },
  {
    id: "surprise-vs-together",
    optionA: {
      label: "サプライズの贈り物",
      imageHint: "surprise_gift",
      emoji: "🎁",
    },
    optionB: {
      label: "一緒に選ぶ時間",
      imageHint: "shopping_together",
      emoji: "🛍️",
    },
    axisMapping: [
      { axis: "initiative", aValue: 0.8, bValue: 0.35, weight: 1.0 },
      {
        axis: "structure_preference",
        aValue: 0.3,
        bValue: 0.7,
        weight: 0.5,
      },
    ],
  },
  {
    id: "debate-vs-harmony",
    optionA: {
      label: "激しい議論",
      imageHint: "intense_debate",
      emoji: "🔥",
    },
    optionB: {
      label: "穏やかな合意",
      imageHint: "peaceful_agreement",
      emoji: "🕊️",
    },
    axisMapping: [
      {
        axis: "conflict_directness",
        aValue: 0.85,
        bValue: 0.2,
        weight: 1.0,
      },
      {
        axis: "emotional_openness",
        aValue: 0.7,
        bValue: 0.4,
        weight: 0.6,
      },
    ],
  },
  {
    id: "adventure-vs-familiar",
    optionA: {
      label: "新しい冒険",
      imageHint: "new_adventure",
      emoji: "🚀",
    },
    optionB: {
      label: "馴染みの場所",
      imageHint: "familiar_place",
      emoji: "🏡",
    },
    axisMapping: [
      { axis: "stimulation_need", aValue: 0.85, bValue: 0.2, weight: 1.0 },
      { axis: "stability_need", aValue: 0.2, bValue: 0.85, weight: 0.8 },
    ],
  },
  {
    id: "silence-vs-chat",
    optionA: {
      label: "沈黙を共有",
      imageHint: "shared_silence",
      emoji: "🤫",
    },
    optionB: {
      label: "絶え間ない会話",
      imageHint: "endless_conversation",
      emoji: "💬",
    },
    axisMapping: [
      { axis: "distance_need", aValue: 0.75, bValue: 0.25, weight: 1.0 },
      {
        axis: "conversation_temperature",
        aValue: 0.2,
        bValue: 0.85,
        weight: 0.7,
      },
    ],
  },
  {
    id: "intuition-vs-deliberate",
    optionA: {
      label: "直感で決める",
      imageHint: "intuition",
      emoji: "⚡",
    },
    optionB: {
      label: "じっくり考える",
      imageHint: "deliberate_thinking",
      emoji: "🧠",
    },
    axisMapping: [
      { axis: "depth_speed", aValue: 0.25, bValue: 0.8, weight: 1.0 },
      {
        axis: "structure_preference",
        aValue: 0.2,
        bValue: 0.8,
        weight: 0.7,
      },
    ],
  },
  {
    id: "party-vs-dinner",
    optionA: {
      label: "大勢のパーティ",
      imageHint: "big_party",
      emoji: "🎉",
    },
    optionB: {
      label: "二人きりのディナー",
      imageHint: "intimate_dinner",
      emoji: "🕯️",
    },
    axisMapping: [
      { axis: "social_energy", aValue: 0.85, bValue: 0.2, weight: 1.0 },
      { axis: "distance_need", aValue: 0.2, bValue: 0.8, weight: 0.6 },
    ],
  },
  {
    id: "honest-vs-read",
    optionA: {
      label: "本音をぶつける",
      imageHint: "honesty",
      emoji: "💎",
    },
    optionB: {
      label: "空気を読む",
      imageHint: "read_the_room",
      emoji: "🌊",
    },
    axisMapping: [
      {
        axis: "conflict_directness",
        aValue: 0.8,
        bValue: 0.2,
        weight: 1.0,
      },
      {
        axis: "emotional_openness",
        aValue: 0.75,
        bValue: 0.3,
        weight: 0.7,
      },
    ],
  },
  {
    id: "lead-vs-follow",
    optionA: {
      label: "リードしたい",
      imageHint: "leading",
      emoji: "🧭",
    },
    optionB: {
      label: "ついていきたい",
      imageHint: "following",
      emoji: "🌟",
    },
    axisMapping: [
      { axis: "initiative", aValue: 0.85, bValue: 0.2, weight: 1.0 },
      { axis: "stability_need", aValue: 0.4, bValue: 0.7, weight: 0.5 },
    ],
  },
  {
    id: "words-vs-actions",
    optionA: {
      label: "感情を言葉にする",
      imageHint: "express_words",
      emoji: "📝",
    },
    optionB: {
      label: "態度で示す",
      imageHint: "show_by_actions",
      emoji: "🤝",
    },
    axisMapping: [
      {
        axis: "emotional_openness",
        aValue: 0.85,
        bValue: 0.3,
        weight: 1.0,
      },
      {
        axis: "conversation_temperature",
        aValue: 0.7,
        bValue: 0.35,
        weight: 0.5,
      },
    ],
  },
  {
    id: "planned-vs-spontaneous",
    optionA: {
      label: "計画通りの旅",
      imageHint: "planned_trip",
      emoji: "📋",
    },
    optionB: {
      label: "ノープランの旅",
      imageHint: "spontaneous_trip",
      emoji: "🎲",
    },
    axisMapping: [
      {
        axis: "structure_preference",
        aValue: 0.85,
        bValue: 0.15,
        weight: 1.0,
      },
      { axis: "stimulation_need", aValue: 0.3, bValue: 0.8, weight: 0.6 },
    ],
  },
];

// ---------- Minimum cards required ----------

const MIN_CARDS_FOR_MATCHING = 6;

// ---------- Inference Engine ----------

/**
 * 選択結果からpartial MatchingVectorを推定する
 */
export function inferInitialVector(
  choices: ResonanceChoice[],
): ResonanceResult {
  const cardMap = new Map(RESONANCE_CARDS.map((c) => [c.id, c]));

  // axis ごとに (weighted value, weight) を蓄積
  const axisAccum: Record<string, { sumWeightedValue: number; sumWeight: number }> = {};

  for (const choice of choices) {
    const card = cardMap.get(choice.cardId);
    if (!card) continue;

    for (const mapping of card.axisMapping) {
      const value =
        choice.selected === "a" ? mapping.aValue : mapping.bValue;

      if (!axisAccum[mapping.axis]) {
        axisAccum[mapping.axis] = { sumWeightedValue: 0, sumWeight: 0 };
      }
      axisAccum[mapping.axis].sumWeightedValue += value * mapping.weight;
      axisAccum[mapping.axis].sumWeight += mapping.weight;
    }
  }

  // partialVector と confidence を計算
  const partialVector: Partial<MatchingVector> = {};
  const confidence: Record<string, number> = {};

  for (const [axis, acc] of Object.entries(axisAccum)) {
    const value = acc.sumWeight > 0
      ? Math.max(0, Math.min(1, acc.sumWeightedValue / acc.sumWeight))
      : 0.5;
    (partialVector as Record<string, number>)[axis] = Math.round(value * 100) / 100;

    // confidence = sumWeight を正規化 (max weight per axis ~ 3.4 for 12 cards)
    confidence[axis] = Math.min(1, acc.sumWeight / 2.5);
  }

  // top 3 を discoveredAxes に
  const sortedAxes = Object.entries(confidence)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  const discoveredAxes = sortedAxes.map(([axis, conf]) => ({
    axis,
    label: AXIS_LABELS[axis as keyof MatchingVector] ?? axis,
    value: (partialVector as Record<string, number>)[axis] ?? 0.5,
    confidence: Math.round(conf * 100) / 100,
  }));

  return {
    partialVector,
    confidence,
    discoveredAxes,
    readyForMatching: choices.length >= MIN_CARDS_FOR_MATCHING,
  };
}

// ---------- Instant Chemistry ----------

/**
 * 2つのpartial vectorからクイック相性を計算
 */
export function computeInstantChemistry(
  myVector: Partial<MatchingVector>,
  otherVector: Partial<MatchingVector>,
): InstantChemistry {
  const axes = Object.keys(AXIS_LABELS) as (keyof MatchingVector)[];
  const sparkAxes: InstantChemistry["sparkAxes"] = [];
  let totalSimilarity = 0;
  let comparedCount = 0;

  for (const axis of axes) {
    const myVal = myVector[axis];
    const otherVal = otherVector[axis];
    if (myVal === undefined || otherVal === undefined) continue;

    const diff = Math.abs(myVal - otherVal);
    comparedCount++;

    // harmony: both similar direction
    if (diff < 0.15) {
      totalSimilarity += 1;
      sparkAxes.push({
        axis,
        label: AXIS_LABELS[axis],
        type: "harmony",
      });
    }
    // complement: opposite but could work well
    else if (diff > 0.5) {
      // complementary axes add moderate resonance
      totalSimilarity += 0.5;
      sparkAxes.push({
        axis,
        label: AXIS_LABELS[axis],
        type: "complement",
      });
    }
    // tension: moderate gap
    else if (diff > 0.3) {
      totalSimilarity += 0.3;
      sparkAxes.push({
        axis,
        label: AXIS_LABELS[axis],
        type: "tension",
      });
    } else {
      totalSimilarity += 0.7;
    }
  }

  const overallResonance =
    comparedCount > 0
      ? Math.round((totalSimilarity / comparedCount) * 100)
      : 50;

  // top 3 spark axes, prioritize harmony > complement > tension
  const priorityOrder = { harmony: 0, complement: 1, tension: 2 };
  const topSparks = sparkAxes
    .sort((a, b) => priorityOrder[a.type] - priorityOrder[b.type])
    .slice(0, 3);

  const narrativeHint = generateNarrativeHint(topSparks, overallResonance);

  return {
    overallResonance,
    sparkAxes: topSparks,
    narrativeHint,
  };
}

// ---------- Narrative Generator ----------

function generateNarrativeHint(
  sparks: InstantChemistry["sparkAxes"],
  resonance: number,
): string {
  if (resonance >= 80) {
    const harmonyAxis = sparks.find((s) => s.type === "harmony");
    return harmonyAxis
      ? `${harmonyAxis.label}が自然に重なる、稀有な共鳴`
      : "深いレベルで響き合う予感";
  }
  if (resonance >= 60) {
    const complement = sparks.find((s) => s.type === "complement");
    if (complement) {
      return `${complement.label}が補い合う、刺激的な組み合わせ`;
    }
    return "心地よい距離感で繋がれる関係";
  }
  if (resonance >= 40) {
    const tension = sparks.find((s) => s.type === "tension");
    if (tension) {
      return `${tension.label}に小さな緊張。成長を促す出会いかも`;
    }
    return "互いの違いが新しい視点を開く可能性";
  }
  return "未知の化学反応が起きるかもしれない出会い";
}

// ---------- Axis Discovery Message ----------

/**
 * カード選択後に表示する「発見メッセージ」を生成
 */
export function getAxisRevealMessage(
  choice: ResonanceChoice,
): string | null {
  const card = RESONANCE_CARDS.find((c) => c.id === choice.cardId);
  if (!card) return null;

  // 最も weight の高い axis を選ぶ
  const primaryMapping = card.axisMapping.reduce((best, m) =>
    m.weight > best.weight ? m : best,
  );

  const label = AXIS_LABELS[primaryMapping.axis];
  const value =
    choice.selected === "a"
      ? primaryMapping.aValue
      : primaryMapping.bValue;

  // ポエティックなメッセージ
  if (value >= 0.7) {
    return `${label} が高く輝いている...`;
  }
  if (value <= 0.3) {
    return `${label} は静かに灯っている...`;
  }
  return `${label} が見えてきた...`;
}
