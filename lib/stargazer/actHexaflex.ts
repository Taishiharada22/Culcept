// lib/stargazer/actHexaflex.ts
// ACT Hexaflex — 心理的柔軟性の6プロセス観測
// 心理学的根拠: Hayes et al. (2006) ACT — Acceptance and Commitment Therapy
//
// 6 Processes:
// 1. Acceptance (受容) — 不快な体験を回避せず受け入れる
// 2. Cognitive Defusion (脱フュージョン) — 思考を事実ではなく思考として見る
// 3. Present Moment (今この瞬間) — 今に意識を向ける
// 4. Self-as-Context (文脈としての自己) — 思考や感情の「観察者」としての自分
// 5. Values (価値) — 人生で本当に大切にしたいもの
// 6. Committed Action (コミットされた行動) — 価値に沿った具体的行動

import type { TraitAxisKey } from "./traitAxes";

export type HexaflexProcess =
  | "acceptance"
  | "defusion"
  | "present_moment"
  | "self_as_context"
  | "values"
  | "committed_action";

export interface HexaflexScore {
  process: HexaflexProcess;
  label: string;
  score: number; // 0-1 (1 = high flexibility)
  description: string;
  /** この人にとってのこのプロセスの現れ方 */
  manifestation: string;
  /** 柔軟性を高めるためのヒント */
  growthHint: string;
}

export interface HexaflexResult {
  scores: HexaflexScore[];
  overallFlexibility: number; // 0-1
  summary: string;
  /** 最も柔軟なプロセス */
  strongest: HexaflexProcess;
  /** 最も硬直しているプロセス */
  weakest: HexaflexProcess;
  /** 柔軟性と硬直性のパターンの解釈 */
  patternInsight: string;
}

export const PROCESS_LABELS: Record<HexaflexProcess, string> = {
  acceptance: "受容",
  defusion: "脱フュージョン",
  present_moment: "今この瞬間",
  self_as_context: "文脈としての自己",
  values: "価値",
  committed_action: "コミットされた行動",
};

interface ProcessMapping {
  process: HexaflexProcess;
  description: string;
  /** 軸とその重み（正=柔軟性が高い方向） */
  weights: Partial<Record<TraitAxisKey, number>>;
  /** 柔軟 → 硬直の manifestation テンプレート */
  flexibleManif: string;
  rigidManif: string;
  growthHint: string;
}

const PROCESS_MAPPINGS: ProcessMapping[] = [
  {
    process: "acceptance",
    description: "不快な感情や思考を、排除しようとせず、そのまま受け入れる能力",
    weights: {
      emotional_regulation: 0.5,
      change_embrace_vs_resist: -0.4,
      stress_isolation_vs_social: -0.2,
      rumination_tendency: -0.4,
    },
    flexibleManif:
      "不快な感情が来ても、それを「ある」と認めて通り過ぎるのを待てる",
    rigidManif:
      "不快な感情を避けようとするか、コントロールしようとする傾向がある",
    growthHint:
      "感情を「問題」ではなく「情報」として扱ってみる。感情があること自体は問題ではない。",
  },
  {
    process: "defusion",
    description: "思考を「事実」ではなく「心が生み出したストーリー」として見る能力",
    weights: {
      analytical_vs_intuitive: -0.3,
      rumination_tendency: -0.6,
      public_private_gap: -0.3,
    },
    flexibleManif:
      "「自分はダメだ」という思考が浮かんでも、それを距離を置いて眺められる",
    rigidManif:
      "思考と自分が融合しやすく、考えたことが「事実」に感じられやすい",
    growthHint:
      "思考の前に「〜という考えが浮かんだ」と付けてみる。思考は天気のように変わるもの。",
  },
  {
    process: "present_moment",
    description: "過去や未来ではなく、今この瞬間に意識を向ける能力",
    weights: {
      plan_vs_spontaneous: 0.4,
      rumination_tendency: -0.5,
      emotional_variability: 0.2,
    },
    flexibleManif:
      "今やっていることに集中でき、過去の後悔や未来の不安に引きずられにくい",
    rigidManif:
      "過去を反芻したり未来を心配したりして、今この瞬間から離れやすい",
    growthHint:
      "1日1回、「今、自分の五感は何をキャッチしている？」と問いかけてみる。",
  },
  {
    process: "self_as_context",
    description: "思考や感情の「観察者」としての自分に気づく能力",
    weights: {
      relationship_mode_split: 0.3,
      public_private_gap: 0.2,
      boundary_awareness: 0.3,
      shame_vs_guilt: 0.4,
    },
    flexibleManif:
      "感情や思考を「自分が体験しているもの」として観察でき、それに飲み込まれない",
    rigidManif:
      "感情や思考と自分が同一化しやすく、「私は不安だ」ではなく「不安が全て」になりやすい",
    growthHint:
      "「私は〜だ」を「私は今〜を経験している」に言い換えてみる。観察者は常にそこにいる。",
  },
  {
    process: "values",
    description: "人生で本当に大切にしたいものを明確に知り、それに基づいて判断する能力",
    weights: {
      independence_vs_harmony: -0.3,
      locus_of_control: -0.4,
      intent_stability: 0.4,
      fairness_sensitivity: 0.2,
    },
    flexibleManif:
      "自分にとって本当に大切なものが明確で、判断の軸がブレにくい",
    rigidManif:
      "何が大切なのか曖昧で、周囲の期待や一時的な感情に流されやすい",
    growthHint:
      "「80歳の自分が振り返った時、何を大切にしていた人生だったと言いたいか？」を考えてみる。",
  },
  {
    process: "committed_action",
    description: "価値に沿った具体的な行動を、困難があっても続ける能力",
    weights: {
      cautious_vs_bold: 0.4,
      growth_mindset: -0.4,
      locus_of_control: -0.3,
      perfectionist_vs_pragmatic: 0.3,
    },
    flexibleManif: "価値に基づいて行動を起こし、失敗してもまた立ち上がれる",
    rigidManif:
      "行動すべきだと分かっていても、不安や完璧主義が行動を妨げやすい",
    growthHint:
      "「完璧な一歩」ではなく「今日できる小さな一歩」を選ぶ。価値の方向に1ミリ動けば十分。",
  },
];

/**
 * 軸スコアから ACT Hexaflex の6プロセスを推定する
 * axisScores の各値は -1.0 〜 +1.0 の範囲
 */
export function assessHexaflex(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): HexaflexResult | null {
  const entries = Object.entries(axisScores);
  if (entries.length < 5) return null;

  const scores: HexaflexScore[] = [];

  for (const mapping of PROCESS_MAPPINGS) {
    let totalSignal = 0;
    let maxPossible = 0;

    for (const [axis, weight] of Object.entries(mapping.weights) as [
      TraitAxisKey,
      number,
    ][]) {
      const score = axisScores[axis];
      maxPossible += Math.abs(weight);
      if (score === undefined) continue;
      totalSignal += score * weight;
    }

    if (maxPossible === 0) continue;

    // Normalize: totalSignal/maxPossible is in [-1, 1], map to [0, 1]
    const rawFlex = (totalSignal / maxPossible + 1) / 2;
    const flexibility = Math.max(0, Math.min(1, rawFlex));

    scores.push({
      process: mapping.process,
      label: PROCESS_LABELS[mapping.process],
      score: flexibility,
      description: mapping.description,
      manifestation:
        flexibility >= 0.5 ? mapping.flexibleManif : mapping.rigidManif,
      growthHint: mapping.growthHint,
    });
  }

  if (scores.length === 0) return null;

  scores.sort((a, b) => b.score - a.score);

  const overall =
    scores.reduce((s, sc) => s + sc.score, 0) / scores.length;
  const strongest = scores[0].process;
  const weakest = scores[scores.length - 1].process;

  const patternInsight =
    overall >= 0.65
      ? "全体的に心理的柔軟性が高い。不快な体験を受け入れ、価値に沿って行動できる傾向がある。"
      : overall >= 0.45
        ? "心理的柔軟性は中程度。一部のプロセスでは柔軟だが、特定の場面で硬直しやすいパターンがある。"
        : "心理的柔軟性にやや課題がある。不快な体験を回避しようとするパターンが強い可能性がある。";

  const summary = `あなたの心理的柔軟性は${(overall * 100).toFixed(0)}%。最も柔軟な領域は「${PROCESS_LABELS[strongest]}」、最も成長の余地がある領域は「${PROCESS_LABELS[weakest]}」。`;

  return {
    scores,
    overallFlexibility: overall,
    summary,
    strongest,
    weakest,
    patternInsight,
  };
}
