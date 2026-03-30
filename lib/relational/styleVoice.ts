// ============================================================
// Feature 4: 感覚翻訳 (Style Voice)
// 相手のスタイルを感覚的な日本語で翻訳する
// ============================================================

import { TRAIT_AXES, type TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { StyleVoice } from "./types";

// safety / relational_deep は対象外
const ALLOWED_CATEGORIES = new Set(["core", "relational", "emotional", "motion", "aesthetic"]);

// 軸ごとの感覚キーワード (negative方向 / positive方向)
const MOOD_MAP: Partial<
  Record<TraitAxisKey, { negative: string; positive: string }>
> = {
  introvert_vs_extrovert: { negative: "静謐", positive: "活気" },
  individual_vs_social: { negative: "深淵", positive: "温もり" },
  cautious_vs_bold: { negative: "慎み", positive: "胆力" },
  analytical_vs_intuitive: { negative: "明晰", positive: "閃き" },
  change_embrace_vs_resist: { negative: "流動", positive: "安寧" },
  plan_vs_spontaneous: { negative: "秩序", positive: "自由" },
  tradition_vs_novelty: { negative: "古典", positive: "革新" },
  independence_vs_harmony: { negative: "孤高", positive: "融和" },
  direct_vs_diplomatic: { negative: "率直", positive: "気遣い" },
  function_vs_expression: { negative: "合理", positive: "情緒" },
  minimal_vs_maximal: { negative: "削ぎ", positive: "彩り" },
  perfectionist_vs_pragmatic: { negative: "研磨", positive: "前進" },
  quality_vs_quantity: { negative: "深み", positive: "広がり" },
  classic_vs_trendy: { negative: "不朽", positive: "鮮度" },
  emotional_regulation: { negative: "激情", positive: "穏和" },
};

// 軸の組み合わせに対する詩的テンプレート
type VoiceTemplate = {
  axes: [TraitAxisKey, string][]; // [axisId, "negative"|"positive"]
  poeticLine: string;
  sensoryLine: string;
};

const VOICE_TEMPLATES: VoiceTemplate[] = [
  {
    axes: [["introvert_vs_extrovert", "negative"], ["minimal_vs_maximal", "negative"]],
    poeticLine: "研ぎ澄まされた静けさの中に、確かな存在感がある",
    sensoryLine: "近づきすぎないのに、ちゃんとそこにいる安心感",
  },
  {
    axes: [["introvert_vs_extrovert", "positive"], ["cautious_vs_bold", "positive"]],
    poeticLine: "エネルギーが前に出ていて、気持ちいい突風のような人",
    sensoryLine: "勢いがあるのに、どこか計算ではない自然体",
  },
  {
    axes: [["direct_vs_diplomatic", "positive"], ["emotional_regulation", "positive"]],
    poeticLine: "やわらかいのに芯がある、春の枝のような人",
    sensoryLine: "配慮が行き届いているのに、窮屈さがない",
  },
  {
    axes: [["quality_vs_quantity", "negative"], ["perfectionist_vs_pragmatic", "negative"]],
    poeticLine: "ひとつひとつに手を抜かない、職人のような凛とした空気",
    sensoryLine: "こだわりが強いのに、押しつけがましさがない",
  },
  {
    axes: [["function_vs_expression", "positive"], ["tradition_vs_novelty", "positive"]],
    poeticLine: "表現と革新が同居する、次の時代を感じる人",
    sensoryLine: "見た目の華やかさの奥に、しっかりした意志がある",
  },
  {
    axes: [["independence_vs_harmony", "negative"], ["individual_vs_social", "negative"]],
    poeticLine: "孤高でありながら、淋しさの匂いがしない人",
    sensoryLine: "一人で立てる強さが、かえって近づきやすさを生んでいる",
  },
  {
    axes: [["independence_vs_harmony", "positive"], ["emotional_regulation", "positive"]],
    poeticLine: "場をやわらかくする力があり、そこにいるだけで空気が整う",
    sensoryLine: "主張しないのに、存在感がじんわり残る",
  },
  {
    axes: [["cautious_vs_bold", "negative"], ["plan_vs_spontaneous", "negative"]],
    poeticLine: "慎重さの中に確かな美意識がある、品のある人",
    sensoryLine: "急がない時間の流れが心地いい",
  },
  {
    axes: [["change_embrace_vs_resist", "negative"], ["cautious_vs_bold", "positive"]],
    poeticLine: "変化を恐れない大胆さに、未来を感じる",
    sensoryLine: "新しいことに向かうときの目の輝きが印象的",
  },
  {
    axes: [["minimal_vs_maximal", "positive"], ["function_vs_expression", "positive"]],
    poeticLine: "華やかさと情緒が重なり、見ているだけで楽しい人",
    sensoryLine: "色彩が豊かで、会うたびに違う発見がある",
  },
];

// フォールバック: 上位2軸から自動生成
function generateFallbackVoice(
  topAxes: Array<{ axis: TraitAxisKey; score: number; mood: string }>,
): { poeticLine: string; sensoryLine: string } {
  if (topAxes.length === 0) {
    return {
      poeticLine: "まだ輪郭が見えてきている途中の人",
      sensoryLine: "観測を重ねることで、もっと見えてくる",
    };
  }
  const first = topAxes[0];
  const second = topAxes[1];

  if (second) {
    return {
      poeticLine: `${first.mood}と${second.mood}が同居する、印象に残る人`,
      sensoryLine: `${first.mood}が強く出ているが、${second.mood}も感じられる`,
    };
  }

  return {
    poeticLine: `${first.mood}が自然に漂う人`,
    sensoryLine: `強さと静けさのバランスが印象的`,
  };
}

export function computeStyleVoice(
  counterpartScores: Partial<Record<TraitAxisKey, number>>,
  _counterpartMoodSummary?: string | null,
  _counterpartStyleSummary?: string | null,
): StyleVoice | null {
  // 上位軸を抽出 (|score|が大きい順)
  const scoredAxes: Array<{
    axis: TraitAxisKey;
    score: number;
    direction: "negative" | "positive";
    mood: string;
  }> = [];

  for (const axisDef of TRAIT_AXES) {
    if (!ALLOWED_CATEGORIES.has(axisDef.category)) continue;
    const score = counterpartScores[axisDef.id];
    if (score === undefined) continue;

    const moodEntry = MOOD_MAP[axisDef.id];
    if (!moodEntry) continue;

    const direction = score < 0 ? "negative" : "positive";
    scoredAxes.push({
      axis: axisDef.id,
      score,
      direction,
      mood: moodEntry[direction],
    });
  }

  if (scoredAxes.length < 2) return null;

  scoredAxes.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const topAxes = scoredAxes.slice(0, 4);
  const dominantMood = topAxes[0].mood;

  // テンプレートマッチ: 上位4軸のうち2つがテンプレートに一致するか
  for (const tpl of VOICE_TEMPLATES) {
    const allMatch = tpl.axes.every(([axisId, dir]) =>
      topAxes.some((a) => a.axis === axisId && a.direction === dir),
    );
    if (allMatch) {
      return {
        poeticLine: tpl.poeticLine,
        sensoryLine: tpl.sensoryLine,
        dominantMood,
      };
    }
  }

  // フォールバック
  const fallback = generateFallbackVoice(topAxes);
  return {
    poeticLine: fallback.poeticLine,
    sensoryLine: fallback.sensoryLine,
    dominantMood,
  };
}
