// ============================================================
// Bridge Narrative Generator
// 二人の MatchingVector の間に見える関係性の予測テキストを生成
// Act 2 "Between You Two" 用
// ============================================================

import type { MatchingVector } from "./types";

// ---------- Types ----------

export type BridgeNarrative = {
  prediction: string;
  detail: string;
};

type AxisComparison = {
  axis: keyof MatchingVector;
  label: string;
  myValue: number;
  theirValue: number;
  diff: number;
  type: "harmony" | "complement" | "tension" | "neutral";
};

// ---------- Axis Labels ----------

const AXIS_LABELS: Record<keyof MatchingVector, string> = {
  conversation_temperature: "会話の温度",
  distance_need: "距離感",
  depth_speed: "深まる速度",
  stability_need: "安定志向",
  stimulation_need: "刺激志向",
  initiative: "主導性",
  emotional_openness: "感情表現",
  conflict_directness: "衝突スタイル",
  social_energy: "社交性",
  structure_preference: "構造志向",
};

// ---------- Axis-specific prediction templates ----------

type PredictionSet = {
  harmony: string[];
  complement: string[];
  tension: string[];
};

const AXIS_PREDICTIONS: Record<keyof MatchingVector, PredictionSet> = {
  conversation_temperature: {
    harmony: [
      "会話のテンポが近い。自然なリズムで話せる可能性が高い",
      "会話の熱量が似ている。心地よい対話が生まれそう",
    ],
    complement: [
      "会話の温度差が、新しい気づきを生むかもしれない",
      "一方が熱く、一方が冷静。バランスの取れた対話になりそう",
    ],
    tension: [
      "会話のペースにズレがある。合わせる意識が必要",
      "熱量の違いが最初は戸惑いを生むかもしれない",
    ],
  },
  distance_need: {
    harmony: [
      "距離感の好みが一致。心地よい間合いで過ごせそう",
      "パーソナルスペースの感覚が似ている",
    ],
    complement: [
      "距離感の違いが、お互いの成長を促す関係",
      "近づきたい側と、見守りたい側。補い合える",
    ],
    tension: [
      "距離感の好みが違う。最初は戸惑うかもしれないが、学びも大きい",
      "距離の取り方にギャップ。相互理解が鍵になる",
    ],
  },
  depth_speed: {
    harmony: [
      "物事を掘り下げるペースが似ている。会話に深みが出そう",
      "思考の深さが近い。理解し合うのに時間がかからない",
    ],
    complement: [
      "あなたが浅く広く、相手が深く狭く。互いの視野を広げ合える関係",
      "速度の違いが、新しい発見を運んでくる",
    ],
    tension: [
      "考える深さにギャップ。急かさない配慮が大切",
      "深掘りのテンポが合わない可能性。でも、調整次第で良い学びに",
    ],
  },
  stability_need: {
    harmony: [
      "安定への欲求が近い。価値観の根底が似ている",
      "変化に対する感覚が似ている。安心感がある",
    ],
    complement: [
      "安定を求める側と、変化を求める側。刺激的な組み合わせ",
      "一方が支え、一方が引っ張る。良いバランス",
    ],
    tension: [
      "安定vs変化の軸で衝突する可能性。でも、互いの世界を広げるチャンス",
      "ライフスタイルの方向性が違う。すり合わせが必要",
    ],
  },
  stimulation_need: {
    harmony: [
      "刺激への感度が似ている。一緒にいて退屈しない",
      "冒険心のレベルが近い。休日の過ごし方が合いそう",
    ],
    complement: [
      "アクティブ度の違いが、日常に新しい風を吹き込む",
      "一方がブレーキ、一方がアクセル。良い塩梅になりそう",
    ],
    tension: [
      "刺激への耐性が違う。片方が疲れてしまうかも",
      "活動量のギャップ。ペース調整が関係の鍵",
    ],
  },
  initiative: {
    harmony: [
      "リーダーシップのスタイルが似ている。対等な関係が築けそう",
      "どちらも同じくらいの主導性。フラットな関係",
    ],
    complement: [
      "リードする側とフォローする側。自然な役割分担ができそう",
      "主導性の違いが、スムーズな協力関係を生む",
    ],
    tension: [
      "どちらもリードしたい、またはどちらも待ってしまう可能性",
      "主導権の取り方で摩擦が起きるかも。でも、話し合いで解決できる",
    ],
  },
  emotional_openness: {
    harmony: [
      "感情の開き方が似ている。自然体でいられる関係",
      "感情表現のスタイルが近い。誤解が少なそう",
    ],
    complement: [
      "表現の違いが、新しいコミュニケーションの形を教えてくれる",
      "感情の扱い方の違いが、互いの視野を広げる",
    ],
    tension: [
      "感情表現のギャップ。相手の沈黙の意味を読み違えるかも",
      "「もっと言ってほしい」vs「察してほしい」のすれ違いに注意",
    ],
  },
  conflict_directness: {
    harmony: [
      "衝突への向き合い方が似ている。ストレスが少ない",
      "問題解決のスタイルが近い。喧嘩しても長引かない",
    ],
    complement: [
      "直接派と間接派。お互いのスタイルを尊重できれば強い",
      "衝突スタイルの違いが、より多角的な問題解決を可能にする",
    ],
    tension: [
      "衝突の処理方法にギャップ。怒り方・仲直りの仕方のすり合わせが重要",
      "一方が正面衝突、一方が回避。フラストレーションが溜まる可能性",
    ],
  },
  social_energy: {
    harmony: [
      "社交性のレベルが近い。一緒にいて疲れない",
      "人との関わり方のペースが似ている",
    ],
    complement: [
      "外向と内向の組み合わせ。お互いの世界を覗ける関係",
      "社交性の違いが、関係に適度な緊張感をもたらす",
    ],
    tension: [
      "社交ペースの違い。片方が疲れたり、片方が物足りなかったり",
      "人づきあいの頻度で衝突するかもしれない",
    ],
  },
  structure_preference: {
    harmony: [
      "計画性のレベルが似ている。一緒に何かを進めやすい",
      "物事の進め方のスタイルが近い。ストレスフリー",
    ],
    complement: [
      "計画派と即興派。補い合えれば最強の組み合わせ",
      "構造の違いが、柔軟性と安定性の両方をもたらす",
    ],
    tension: [
      "進め方のスタイルにギャップ。予定の立て方で揉めるかも",
      "「ちゃんと決めたい」vs「流れに任せたい」のすれ違い",
    ],
  },
};

// ---------- Chemistry Map Types ----------

type ChemistryMap = {
  resonance: number;
  complement: number;
  friction: number;
  unknown: number;
};

// ---------- Main Generator ----------

export function generateBridgeNarrative(
  myVector: Partial<MatchingVector>,
  theirVector: Partial<MatchingVector>,
  chemistryMap?: Partial<ChemistryMap>,
  catalystPotential?: number,
): BridgeNarrative {
  const axes = Object.keys(AXIS_LABELS) as (keyof MatchingVector)[];

  // Compare all available axes
  const comparisons: AxisComparison[] = [];
  for (const axis of axes) {
    const myVal = myVector[axis];
    const theirVal = theirVector[axis];
    if (myVal === undefined || theirVal === undefined) continue;

    const diff = Math.abs(myVal - theirVal);
    let type: AxisComparison["type"];
    if (diff < 0.15) type = "harmony";
    else if (diff > 0.5) type = "complement";
    else if (diff > 0.3) type = "tension";
    else type = "neutral";

    comparisons.push({
      axis,
      label: AXIS_LABELS[axis],
      myValue: myVal,
      theirValue: theirVal,
      diff,
      type,
    });
  }

  if (comparisons.length === 0) {
    return {
      prediction: "まだ情報が少ない。観測を続けることで見えてくるものがある",
      detail: "分身がもっと多くのデータを集めています",
    };
  }

  // Sort by difference (most notable first)
  comparisons.sort((a, b) => b.diff - a.diff);

  // Find the most impactful axis for prediction
  const mostNotable = comparisons[0];
  const predKey = mostNotable.type === "neutral" ? "harmony" : mostNotable.type;
  const predictions = AXIS_PREDICTIONS[mostNotable.axis][predKey];
  const prediction = pickDeterministic(predictions, myVector, theirVector);

  // Generate detail from secondary axis or chemistry data
  let detail: string;

  if (chemistryMap) {
    const dominantForce = getDominantForce(chemistryMap);
    detail = getChemistryDetail(dominantForce, catalystPotential);
  } else if (comparisons.length >= 2) {
    const secondary = comparisons[1];
    const secKey = secondary.type === "neutral" ? "harmony" : secondary.type;
    const secondaryPredictions = AXIS_PREDICTIONS[secondary.axis][secKey];
    detail = pickDeterministic(secondaryPredictions, myVector, theirVector);
  } else {
    detail = getGenericDetail(comparisons);
  }

  return { prediction, detail };
}

// ---------- Helper: Chemistry bar segments ----------

export function computeChemistrySegments(
  myVector: Partial<MatchingVector>,
  theirVector: Partial<MatchingVector>,
): ChemistryMap {
  const axes = Object.keys(AXIS_LABELS) as (keyof MatchingVector)[];
  let resonance = 0;
  let complement = 0;
  let friction = 0;
  let unknown = 0;
  let total = 0;

  for (const axis of axes) {
    const myVal = myVector[axis];
    const theirVal = theirVector[axis];

    if (myVal === undefined || theirVal === undefined) {
      unknown++;
      total++;
      continue;
    }

    total++;
    const diff = Math.abs(myVal - theirVal);

    if (diff < 0.15) resonance++;
    else if (diff > 0.5) complement++;
    else if (diff > 0.3) friction++;
    else resonance += 0.5; // mild harmony
  }

  if (total === 0) return { resonance: 25, complement: 25, friction: 25, unknown: 25 };

  return {
    resonance: Math.round((resonance / total) * 100),
    complement: Math.round((complement / total) * 100),
    friction: Math.round((friction / total) * 100),
    unknown: Math.round((unknown / total) * 100),
  };
}

// ---------- Internals ----------

function getDominantForce(map: Partial<ChemistryMap>): string {
  const entries = Object.entries(map).filter(([, v]) => v !== undefined) as [string, number][];
  if (entries.length === 0) return "unknown";
  entries.sort(([, a], [, b]) => b - a);
  return entries[0][0];
}

function getChemistryDetail(force: string, catalyst?: number): string {
  const catalystNote =
    catalyst !== undefined && catalyst > 0.7
      ? "触媒ポテンシャルが高い。一緒にいると化学反応が起きやすい"
      : "";

  switch (force) {
    case "resonance":
      return catalystNote || "共鳴が強い。自然体でいられる関係";
    case "complement":
      return catalystNote || "補完関係が目立つ。互いの弱点を補える可能性";
    case "friction":
      return catalystNote || "摩擦はあるが、それが成長の源にもなりうる";
    case "unknown":
      return "まだ未知の部分が多い。観測が進めば見えてくる";
    default:
      return catalystNote || "複合的な力が働いている。しばらく様子を見たい";
  }
}

function getGenericDetail(comparisons: AxisComparison[]): string {
  const harmonyCount = comparisons.filter((c) => c.type === "harmony").length;
  const tensionCount = comparisons.filter((c) => c.type === "tension").length;
  const complementCount = comparisons.filter((c) => c.type === "complement").length;

  if (harmonyCount >= 3) return "多くの軸で共鳴している。直感的に理解し合えるかもしれない";
  if (complementCount >= 3) return "互いに持っていないものを持っている。化学反応が起きそう";
  if (tensionCount >= 3) return "ぶつかる点が多い。でも、乗り越えた先に深い理解がある";
  return "バランスの取れた組み合わせ。自然な距離感で始められそう";
}

function pickDeterministic(
  arr: string[],
  v1: Partial<MatchingVector>,
  v2: Partial<MatchingVector>,
): string {
  const vals1 = Object.values(v1).filter((v): v is number => v !== undefined);
  const vals2 = Object.values(v2).filter((v): v is number => v !== undefined);
  const seed =
    vals1.reduce((a, v) => a + v * 1000, 0) +
    vals2.reduce((a, v) => a + v * 500, 0);
  return arr[Math.floor(seed) % arr.length] ?? arr[0];
}
