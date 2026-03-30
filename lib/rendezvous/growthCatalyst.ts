// ============================================================
// Growth Catalyst Matching
// 相性ではなく「成長触媒ポテンシャル」でマッチングする
// ============================================================

import type { MatchingVector, RendezvousCategory } from "./types";

// ---------- Types ----------

/** 成長方向: Stargazer軸の変化トレンドから推定 */
export type GrowthDirection = {
  axis: keyof MatchingVector;
  label: string;
  currentValue: number; // 0..1
  trajectoryDelta: number; // recent change rate
  desiredDirection: "increase" | "decrease" | "explore"; // inferred desire
};

/** 触媒ポテンシャル: この人があなたの成長をどう加速するか */
export type CatalystPotential = {
  overallCatalystScore: number; // 0..100
  catalystType: CatalystType;
  catalystLabel: string; // Japanese title
  catalystDescription: string; // Japanese 2-3 sentences
  growthZones: GrowthZone[];
  /** どの軸であなたは伸びるか */
  acceleratedAxes: {
    axis: string;
    label: string;
    potential: number;
    narrative: string;
  }[];
  /** リスク（成長の痛み） */
  growthPains: {
    axis: string;
    label: string;
    painLevel: number;
    narrative: string;
  }[];
};

export type CatalystType =
  | "mirror" // 鏡 - あなたの影を映す
  | "challenger" // 挑戦者 - 快適ゾーンを壊す
  | "amplifier" // 増幅器 - 隠れた強みを引き出す
  | "stabilizer" // 安定剤 - 混沌を整理する
  | "spark" // 火花 - 新しい可能性を見せる
  | "healer" // 癒し手 - 傷を受容する場を作る
  | "compass" // 羅針盤 - 方向を示す
  | "wildcard"; // ワイルドカード - 予測不能な変容

export type GrowthZone = {
  name: string; // "快適ゾーン" | "伸張ゾーン" | "恐怖ゾーン"
  axes: string[];
  description: string;
};

// ---------- Constants ----------

const AXIS_LABELS: Record<keyof MatchingVector, string> = {
  conversation_temperature: "会話の温度感",
  distance_need: "距離感への欲求",
  depth_speed: "深さへの速度",
  stability_need: "安定への欲求",
  stimulation_need: "刺激への欲求",
  initiative: "主導性",
  emotional_openness: "感情の開放度",
  conflict_directness: "対立の直接性",
  social_energy: "社交エネルギー",
  structure_preference: "構造への好み",
};

const CATALYST_META: Record<
  CatalystType,
  { label: string; descriptionTemplate: string }
> = {
  mirror: {
    label: "鏡",
    descriptionTemplate:
      "あなた自身の姿を、少しだけ先のバージョンで映し返してくれる存在です。自分では見えない成長の兆しに気づかせてくれます。",
  },
  challenger: {
    label: "挑戦者",
    descriptionTemplate:
      "あなたの快適ゾーンを、愛情を持って壊してくれる存在です。停滞している部分に直接的な刺激を与え、動き出すきっかけを作ります。",
  },
  amplifier: {
    label: "増幅器",
    descriptionTemplate:
      "あなたの中に眠っている強みを引き出し、増幅してくれる存在です。自分では気づかなかった可能性を自然と開花させます。",
  },
  stabilizer: {
    label: "安定剤",
    descriptionTemplate:
      "混沌とした状況に構造と安心を持ち込んでくれる存在です。あなたが安全に冒険できる土台を作ってくれます。",
  },
  spark: {
    label: "火花",
    descriptionTemplate:
      "まったく異なる世界観を持ち込み、新しい可能性の扉を開いてくれる存在です。予想もしなかった方向への成長が始まります。",
  },
  healer: {
    label: "癒し手",
    descriptionTemplate:
      "あなたの傷や抵抗を受け止め、安全に向き合える場を作ってくれる存在です。成長に必要な「受容」のプロセスを支えます。",
  },
  compass: {
    label: "羅針盤",
    descriptionTemplate:
      "方向を見失いかけたとき、明確な指針を示してくれる存在です。迷いの多い時期に、確かな成長の方向を照らします。",
  },
  wildcard: {
    label: "ワイルドカード",
    descriptionTemplate:
      "既存のどのパターンにも当てはまらない、予測不能な触媒です。化学反応のような変容が起きる可能性を秘めています。",
  },
};

// Category-specific weight multipliers for catalyst scoring
const CATEGORY_CATALYST_WEIGHTS: Record<
  RendezvousCategory,
  { stretch: number; pain: number; growth: number }
> = {
  romantic: { stretch: 1.2, pain: 0.8, growth: 1.3 },
  friendship: { stretch: 1.0, pain: 0.6, growth: 1.0 },
  cocreation: { stretch: 1.3, pain: 0.5, growth: 1.4 },
  community: { stretch: 0.8, pain: 0.4, growth: 0.9 },
  partner: { stretch: 1.1, pain: 0.9, growth: 1.2 },
};

// ---------- Growth Direction Computation ----------

/**
 * Compute growth directions from historical vector snapshots.
 * Uses last N snapshots to determine trend for each axis.
 */
export function computeGrowthDirections(
  snapshots: { vector: Partial<MatchingVector>; timestamp: string }[],
): GrowthDirection[] {
  if (snapshots.length < 2) {
    // Not enough data; return neutral directions for all axes
    const latestVector = snapshots[0]?.vector ?? {};
    return (Object.keys(AXIS_LABELS) as (keyof MatchingVector)[]).map(
      (axis) => ({
        axis,
        label: AXIS_LABELS[axis],
        currentValue: latestVector[axis] ?? 0.5,
        trajectoryDelta: 0,
        desiredDirection: "explore" as const,
      }),
    );
  }

  // Sort oldest first
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const latest = sorted[sorted.length - 1].vector;
  const directions: GrowthDirection[] = [];

  for (const axis of Object.keys(AXIS_LABELS) as (keyof MatchingVector)[]) {
    const values = sorted
      .map((s) => s.vector[axis])
      .filter((v): v is number => v !== undefined);

    if (values.length < 2) {
      directions.push({
        axis,
        label: AXIS_LABELS[axis],
        currentValue: latest[axis] ?? 0.5,
        trajectoryDelta: 0,
        desiredDirection: "explore",
      });
      continue;
    }

    // Simple linear trend: average of recent deltas
    const deltas: number[] = [];
    for (let i = 1; i < values.length; i++) {
      deltas.push(values[i] - values[i - 1]);
    }
    const avgDelta =
      deltas.reduce((sum, d) => sum + d, 0) / deltas.length;

    // Infer desired direction from trajectory
    let desiredDirection: "increase" | "decrease" | "explore";
    if (Math.abs(avgDelta) < 0.02) {
      // Stagnant -> explore
      desiredDirection = "explore";
    } else if (avgDelta > 0) {
      desiredDirection = "increase";
    } else {
      desiredDirection = "decrease";
    }

    directions.push({
      axis,
      label: AXIS_LABELS[axis],
      currentValue: latest[axis] ?? 0.5,
      trajectoryDelta: Math.round(avgDelta * 1000) / 1000,
      desiredDirection,
    });
  }

  return directions;
}

// ---------- Catalyst Type Detection ----------

function detectCatalystType(
  myVector: MatchingVector,
  myGrowthDirections: GrowthDirection[],
  otherVector: MatchingVector,
): CatalystType {
  const axes = Object.keys(AXIS_LABELS) as (keyof MatchingVector)[];

  // Compute per-axis differences
  const diffs = axes.map((a) => ({
    axis: a,
    diff: Math.abs(myVector[a] - otherVector[a]),
    myVal: myVector[a],
    otherVal: otherVector[a],
  }));

  const avgDiff =
    diffs.reduce((s, d) => s + d.diff, 0) / diffs.length;

  const stagnantAxes = myGrowthDirections.filter(
    (d) => d.desiredDirection === "explore",
  );
  const exploreRatio = stagnantAxes.length / myGrowthDirections.length;

  // Growth axes: axes where user is actively moving
  const growthAxes = myGrowthDirections.filter(
    (d) => d.desiredDirection !== "explore" && Math.abs(d.trajectoryDelta) > 0.02,
  );

  // Check for resistance (many axes stagnant + low emotional_openness)
  const hasGrowthResistance =
    exploreRatio > 0.6 && myVector.emotional_openness < 0.4;

  // --- Mirror: similar but slightly ahead on growth axes ---
  if (avgDiff < 0.2) {
    const aheadOnGrowth = growthAxes.filter((ga) => {
      const otherVal = otherVector[ga.axis];
      if (ga.desiredDirection === "increase") return otherVal > ga.currentValue;
      if (ga.desiredDirection === "decrease") return otherVal < ga.currentValue;
      return false;
    });
    if (aheadOnGrowth.length >= growthAxes.length * 0.5 && growthAxes.length > 0) {
      return "mirror";
    }
  }

  // --- Challenger: high delta on stagnant axes + high conflict_directness ---
  const stagnantAxisDiffs = stagnantAxes.map((sa) =>
    Math.abs(myVector[sa.axis] - otherVector[sa.axis]),
  );
  const avgStagnantDiff =
    stagnantAxisDiffs.length > 0
      ? stagnantAxisDiffs.reduce((s, d) => s + d, 0) / stagnantAxisDiffs.length
      : 0;

  if (
    avgStagnantDiff > 0.3 &&
    otherVector.conflict_directness > 0.6 &&
    stagnantAxes.length >= 3
  ) {
    return "challenger";
  }

  // --- Healer: high emotional_openness + low conflict when user shows resistance ---
  if (
    hasGrowthResistance &&
    otherVector.emotional_openness > 0.7 &&
    otherVector.conflict_directness < 0.4
  ) {
    return "healer";
  }

  // --- Compass: clear direction when user is directionless ---
  if (exploreRatio > 0.6) {
    const otherGrowthClarity = axes.filter(
      (a) => otherVector[a] > 0.7 || otherVector[a] < 0.3,
    ).length;
    if (otherGrowthClarity >= 5) {
      return "compass";
    }
  }

  // --- Stabilizer: high stability + structure when user is chaotic ---
  const userChaos =
    myVector.stability_need < 0.4 && myVector.structure_preference < 0.4;
  if (
    userChaos &&
    otherVector.stability_need > 0.6 &&
    otherVector.structure_preference > 0.6
  ) {
    return "stabilizer";
  }

  // --- Amplifier: complements weak axes + high emotional_openness ---
  const weakAxes = axes.filter((a) => myVector[a] < 0.35);
  const complementsWeak = weakAxes.filter(
    (a) => otherVector[a] > 0.6,
  ).length;
  if (
    complementsWeak >= 3 &&
    otherVector.emotional_openness > 0.6
  ) {
    return "amplifier";
  }

  // --- Spark: very different vector + high stimulation_need from both ---
  if (
    avgDiff > 0.35 &&
    myVector.stimulation_need > 0.5 &&
    otherVector.stimulation_need > 0.5
  ) {
    return "spark";
  }

  // --- Wildcard: doesn't fit other types ---
  return "wildcard";
}

// ---------- Growth Zone Classification ----------

function classifyGrowthZones(
  myVector: MatchingVector,
  otherVector: MatchingVector,
): GrowthZone[] {
  const axes = Object.keys(AXIS_LABELS) as (keyof MatchingVector)[];

  const comfort: string[] = [];
  const stretch: string[] = [];
  const fear: string[] = [];

  for (const axis of axes) {
    const diff = Math.abs(myVector[axis] - otherVector[axis]);
    const label = AXIS_LABELS[axis];
    if (diff < 0.15) {
      comfort.push(label);
    } else if (diff <= 0.4) {
      stretch.push(label);
    } else {
      fear.push(label);
    }
  }

  return [
    {
      name: "快適ゾーン",
      axes: comfort,
      description:
        comfort.length > 0
          ? `${comfort.slice(0, 3).join("・")}は安全基盤。ここが共通土台になります。`
          : "快適ゾーンの軸は見つかりませんでした。大きな変容の可能性があります。",
    },
    {
      name: "伸張ゾーン",
      axes: stretch,
      description:
        stretch.length > 0
          ? `${stretch.slice(0, 3).join("・")}は成長の余白。心地よい挑戦が待っています。`
          : "伸張ゾーンの軸はありません。快適か恐怖のどちらかに集中しています。",
    },
    {
      name: "恐怖ゾーン",
      axes: fear,
      description:
        fear.length > 0
          ? `${fear.slice(0, 3).join("・")}は大きなギャップ。覚悟があれば最大の成長が起きます。`
          : "恐怖ゾーンの軸はありません。穏やかな成長プロセスが期待できます。",
    },
  ];
}

// ---------- Accelerated Axes & Growth Pains ----------

function computeAcceleratedAxes(
  myVector: MatchingVector,
  myGrowthDirections: GrowthDirection[],
  otherVector: MatchingVector,
): CatalystPotential["acceleratedAxes"] {
  const results: CatalystPotential["acceleratedAxes"] = [];

  for (const gd of myGrowthDirections) {
    const diff = otherVector[gd.axis] - myVector[gd.axis];
    let potential = 0;
    let narrative = "";

    if (gd.desiredDirection === "increase" && diff > 0.1) {
      // Other is ahead in the direction user wants to grow
      potential = Math.min(100, Math.round(diff * 120));
      narrative = `${gd.label}をさらに伸ばす力を持っています。相手の${gd.label}（${Math.round(otherVector[gd.axis] * 100)}%）があなたを引き上げます。`;
    } else if (gd.desiredDirection === "decrease" && diff < -0.1) {
      potential = Math.min(100, Math.round(Math.abs(diff) * 120));
      narrative = `${gd.label}を手放す勇気を見せてくれます。相手の在り方が、あなたの解放を後押しします。`;
    } else if (gd.desiredDirection === "explore" && Math.abs(diff) > 0.2) {
      potential = Math.min(100, Math.round(Math.abs(diff) * 80));
      narrative = `${gd.label}について新しい視点をもたらします。停滞していた軸に動きが生まれるかもしれません。`;
    }

    if (potential > 20) {
      results.push({
        axis: gd.axis,
        label: gd.label,
        potential,
        narrative,
      });
    }
  }

  return results
    .sort((a, b) => b.potential - a.potential)
    .slice(0, 4);
}

function computeGrowthPains(
  myVector: MatchingVector,
  otherVector: MatchingVector,
): CatalystPotential["growthPains"] {
  const axes = Object.keys(AXIS_LABELS) as (keyof MatchingVector)[];
  const results: CatalystPotential["growthPains"] = [];

  for (const axis of axes) {
    const diff = Math.abs(myVector[axis] - otherVector[axis]);
    if (diff > 0.3) {
      const painLevel = Math.min(100, Math.round(diff * 130));
      const label = AXIS_LABELS[axis];

      let narrative: string;
      if (diff > 0.5) {
        narrative = `${label}の大きなギャップは、衝突や戸惑いの原因になり得ます。しかしこの痛みの先に最大の成長があります。`;
      } else {
        narrative = `${label}の違いは時に摩擦を生みますが、互いの理解が深まるほど力に変わります。`;
      }

      results.push({ axis, label, painLevel, narrative });
    }
  }

  return results
    .sort((a, b) => b.painLevel - a.painLevel)
    .slice(0, 3);
}

// ---------- Overall Catalyst Score ----------

function computeOverallScore(
  acceleratedAxes: CatalystPotential["acceleratedAxes"],
  growthPains: CatalystPotential["growthPains"],
  growthZones: GrowthZone[],
  category: RendezvousCategory,
): number {
  const weights = CATEGORY_CATALYST_WEIGHTS[category];

  // Growth potential from accelerated axes
  const growthScore =
    acceleratedAxes.length > 0
      ? acceleratedAxes.reduce((s, a) => s + a.potential, 0) /
        acceleratedAxes.length
      : 0;

  // Stretch zone contribution
  const stretchZone = growthZones.find((z) => z.name === "伸張ゾーン");
  const stretchScore = stretchZone
    ? Math.min(100, stretchZone.axes.length * 18)
    : 0;

  // Pain penalty (some pain is good, too much is bad)
  const avgPain =
    growthPains.length > 0
      ? growthPains.reduce((s, p) => s + p.painLevel, 0) / growthPains.length
      : 0;
  // Inverted U: moderate pain is optimal
  const painModifier =
    avgPain < 30
      ? avgPain / 30 // low pain = low catalyst
      : avgPain < 60
        ? 1.0 // optimal zone
        : 1.0 - (avgPain - 60) / 80; // too much pain

  const raw =
    growthScore * weights.growth * 0.45 +
    stretchScore * weights.stretch * 0.35 +
    painModifier * 20 * weights.pain;

  return Math.round(Math.max(0, Math.min(100, raw)));
}

// ---------- Public API ----------

/**
 * Compute catalyst potential between two people.
 * This is the core function: instead of asking "are you compatible?",
 * it asks "will this person catalyze your transformation?"
 */
export function computeCatalystPotential(
  myVector: MatchingVector,
  myGrowthDirections: GrowthDirection[],
  otherVector: MatchingVector,
  category: RendezvousCategory,
): CatalystPotential {
  const catalystType = detectCatalystType(
    myVector,
    myGrowthDirections,
    otherVector,
  );

  const meta = CATALYST_META[catalystType];
  const growthZones = classifyGrowthZones(myVector, otherVector);
  const acceleratedAxes = computeAcceleratedAxes(
    myVector,
    myGrowthDirections,
    otherVector,
  );
  const growthPains = computeGrowthPains(myVector, otherVector);
  const overallCatalystScore = computeOverallScore(
    acceleratedAxes,
    growthPains,
    growthZones,
    category,
  );

  return {
    overallCatalystScore,
    catalystType,
    catalystLabel: meta.label,
    catalystDescription: meta.descriptionTemplate,
    growthZones,
    acceleratedAxes,
    growthPains,
  };
}

/**
 * Rank candidates by growth catalyst potential (not compatibility!).
 * Returns sorted list, highest catalyst potential first.
 */
export function rankByCatalystPotential(
  myVector: MatchingVector,
  myGrowthDirections: GrowthDirection[],
  candidates: {
    id: string;
    vector: MatchingVector;
    category: RendezvousCategory;
  }[],
): { id: string; potential: CatalystPotential }[] {
  const ranked = candidates.map((c) => ({
    id: c.id,
    potential: computeCatalystPotential(
      myVector,
      myGrowthDirections,
      c.vector,
      c.category,
    ),
  }));

  return ranked.sort(
    (a, b) => b.potential.overallCatalystScore - a.potential.overallCatalystScore,
  );
}
