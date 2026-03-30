// lib/stargazer/contextShiftAnalyzer.ts
// 文脈間の性格変化を分析する
// 心理学的根拠: 本音と建前、Rogers (real self / ideal self)、Johari Window
// 「演じていること自体が悪いのではない。演技のコストを知ることが大切」

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

// ── Types ──

export interface ContextShift {
  /** 変化が最も大きい軸 */
  axis: TraitAxisKey;
  /** 各文脈でのスコア */
  contexts: { context: string; contextLabel: string; score: number }[];
  /** 最大スコア差 */
  gap: number;
  /** パーソナライズされた洞察 */
  insight: string;
  /** この変化が示唆するもの */
  implication: string;
  /** なぜこの文脈で変化するのか——心理的仮説 */
  deepWhyHypothesis: string;
  /** Eurich式「What」質問——自己観察を促す問いかけ */
  selfAwarenessQuestion: string;
}

/** 文脈間変動のタイプ分類 */
export type VariabilityType =
  | "chameleon"   // 多くの文脈で大きく変化する
  | "consistent"  // ほぼ全文脈で安定している
  | "selective";  // 特定の文脈でのみ大きく変化する

export interface ContextProfile {
  /** 全体的な文脈間変動の大きさ (0-1) */
  overallVariability: number;
  /** 変動パターンの分類 */
  variabilityType: VariabilityType;
  /** 最も「演じている」文脈 */
  mostPerformativeContext: string | null;
  /** 最も「素」に近い文脈 */
  mostAuthenticContext: string | null;
  /** 検出された文脈シフト（上位3つ） */
  shifts: ContextShift[];
  /** 総合的な洞察 */
  summary: string;
  /** 本音/建前の文化的洞察——どの文脈が本音に近く、どこで建前を使っているか */
  honneInsight: string;
}

// ── Context Labels ──

const CONTEXT_LABELS: Record<string, string> = {
  friends: "友人といる時",
  friendship: "友人といる時",
  romance: "恋愛の場面",
  romantic: "恋愛の場面",
  romantic_partner: "恋人といる時",
  partner: "パートナーといる時",
  work: "仕事の場面",
  family: "家族といる時",
  general: "ふだんの自分",
  alone: "ひとりの時",
  one_on_one: "二人きりの時",
  online: "オンラインの場面",
  spouse: "配偶者といる時",
  cocreation: "共創の場面",
  community: "コミュニティの中",
};

function getContextLabel(ctx: string): string {
  if (!ctx || ctx === "undefined") return "ふだんの自分";
  return CONTEXT_LABELS[ctx] ?? ctx.replace(/_/g, " ");
}

// ── Axis Labels ──

function getAxisLabel(axis: TraitAxisKey): string {
  const def = TRAIT_AXES.find((a) => a.id === axis);
  if (!def) return axis;
  return `${def.labelLeft} ⇔ ${def.labelRight}`;
}

function getAxisPoleLabel(axis: TraitAxisKey, score: number): string {
  const def = TRAIT_AXES.find((a) => a.id === axis);
  if (!def) return score > 0 ? "高い" : "低い";
  return score > 0 ? def.labelRight : def.labelLeft;
}

// ── Deep Why Hypothesis ──

function generateDeepWhyHypothesis(
  axis: TraitAxisKey,
  highCtx: { context: string; score: number },
  lowCtx: { context: string; score: number },
): string {
  const highLabel = getContextLabel(highCtx.context);
  const lowLabel = getContextLabel(lowCtx.context);

  // Context-pair specific psychological hypotheses
  const isRelational =
    highCtx.context === "romance" || lowCtx.context === "romance";
  const involvesWork =
    highCtx.context === "work" || lowCtx.context === "work";
  const involvesAlone =
    highCtx.context === "alone" || lowCtx.context === "alone";
  const involvesFamily =
    highCtx.context === "family" || lowCtx.context === "family";

  if (axis === "introvert_vs_extrovert") {
    if (involvesWork && involvesAlone) {
      return `職場では「求められる自分」を演じるために外向性のスイッチを入れている可能性がある。ひとりの時間は、その消耗を回復する「充電」ではなく、本来の自分に戻る「帰還」かもしれない。`;
    }
    if (isRelational) {
      return `親密な関係では、相手に受け入れられたいという欲求が外向/内向のモードを切り替えさせている。この変化は愛着スタイルに根ざしている可能性がある。`;
    }
    return `${highLabel}では社会的期待に応えるため、エネルギーの使い方を無意識に切り替えている。長期的には、切り替えのコストが蓄積し、特定の場面を避けたくなる傾向につながりうる。`;
  }

  if (
    axis === "direct_vs_diplomatic" ||
    axis === "independence_vs_harmony"
  ) {
    if (involvesFamily) {
      return `家族との関係では、幼少期に学んだコミュニケーションパターンが自動的に作動している可能性がある。「この家族の中での自分の役割」が、今も無意識に振る舞いを規定している。`;
    }
    if (involvesWork) {
      return `職場では「波風を立てないこと」と「自分の意見を通すこと」の間で常に計算が働いている。この使い分けは処世術だが、長く続くと「本当はどう思っているのか分からない」という自己疎外を生むことがある。`;
    }
    return `${highLabel}と${lowLabel}での自己表現の差は、「この場で本音を出しても安全か」という無意識の査定の結果。信頼と安全の感覚が、あなたの正直さの水位を決めている。`;
  }

  if (
    axis === "emotional_regulation" ||
    axis === "emotional_variability"
  ) {
    if (involvesAlone) {
      return `ひとりの時に感情が解放されるのは、他者の前では感情を「管理すべきもの」として扱っているから。感情の自然な流れを許せる場所が限られていることは、心理的安全の分布図そのもの。`;
    }
    return `感情の出し方の差は、「この場で感情を見せたら、どう扱われるか」という過去の経験に基づく予測から来ている。安心できる場でだけ感情が動くのは、傷つくことへの賢い防御。`;
  }

  if (axis === "cautious_vs_bold" || axis === "plan_vs_spontaneous") {
    return `意思決定スタイルの変化は、「失敗した時に誰が責任を取るか」の無意識の計算を反映している。${highLabel}では自由に決められるが、${lowLabel}では失敗のコストが高いと感じているのかもしれない。`;
  }

  if (axis === "social_initiative" || axis === "boundary_awareness") {
    return `人との距離感の変化は、過去に「近づきすぎて傷ついた」か「距離を取りすぎて後悔した」経験の痕跡。${highLabel}と${lowLabel}で異なる距離感を使い分けるのは、それぞれの場で学んだ「安全な距離」が違うから。`;
  }

  if (axis === "public_private_gap") {
    return `公私の使い分けが大きいのは、「見られている自分」と「見られていない自分」の間に橋を架けることへの不安があるのかもしれない。どちらかが「本当の自分」ではなく、両方が本当——ただし、片方を隠すエネルギーコストは無視できない。`;
  }

  // Fallback for other axes
  return `${highLabel}と${lowLabel}での振る舞いの差は、それぞれの場面で「何を失いたくないか」が異なることを示唆している。守りたいものが変われば、見せる自分も変わる。それは弱さではなく、あなたの価値観の地図。`;
}

// ── Self-Awareness Question (Eurich "What" questions) ──

function generateSelfAwarenessQuestion(
  axis: TraitAxisKey,
  highCtx: { context: string; score: number },
  lowCtx: { context: string; score: number },
): string {
  const highLabel = getContextLabel(highCtx.context);
  const lowLabel = getContextLabel(lowCtx.context);

  // Eurich's research: "What" questions promote self-insight;
  // "Why" questions trigger rationalization and defensiveness.

  if (axis === "introvert_vs_extrovert") {
    return `${highLabel}から${lowLabel}に切り替わる瞬間、身体はどんな感覚を覚えていますか？——たとえば呼吸、肩の力、声のトーン。`;
  }
  if (
    axis === "direct_vs_diplomatic" ||
    axis === "independence_vs_harmony"
  ) {
    return `${lowLabel}で言わなかった言葉が、もしそのまま出ていたら、何が変わっていたと思いますか？`;
  }
  if (
    axis === "emotional_regulation" ||
    axis === "emotional_variability"
  ) {
    return `${highLabel}で感じている感情を、もし${lowLabel}でも同じように出せたとしたら、周囲の反応はどう変わると想像しますか？`;
  }
  if (axis === "cautious_vs_bold") {
    return `${highLabel}での大胆さを${lowLabel}でも発揮できたとき、あなたは何を手に入れ、何を手放すことになりますか？`;
  }
  if (axis === "plan_vs_spontaneous") {
    return `${lowLabel}で計画的になるとき、あなたが実は守っているものは何ですか？`;
  }
  if (axis === "social_initiative" || axis === "boundary_awareness") {
    return `${highLabel}での距離感が心地よいとしたら、${lowLabel}で同じ距離を取れない時、あなたの中で何がブレーキをかけていますか？`;
  }
  if (axis === "public_private_gap") {
    return `公の自分と私の自分、どちらの自分でいる時に時間が早く過ぎますか？　その差は何を意味していると思いますか？`;
  }

  // Generic but still "What" framing
  return `${highLabel}の自分と${lowLabel}の自分——もし両方が会話できるとしたら、お互いに何と言い合うと思いますか？`;
}

// ── Insight Generation ──

function generateShiftInsight(
  axis: TraitAxisKey,
  highCtx: { context: string; score: number },
  lowCtx: { context: string; score: number },
  gap: number,
): {
  insight: string;
  implication: string;
  deepWhyHypothesis: string;
  selfAwarenessQuestion: string;
} {
  const highLabel = getContextLabel(highCtx.context);
  const lowLabel = getContextLabel(lowCtx.context);
  const highPole = getAxisPoleLabel(axis, highCtx.score);
  const lowPole = getAxisPoleLabel(axis, lowCtx.score);

  // Gap magnitude interpretation
  const gapDesc =
    gap > 0.8
      ? "非常に大きい"
      : gap > 0.6
        ? "かなり大きい"
        : gap > 0.4
          ? "はっきりした"
          : "目立つ";

  const insight = `${highLabel}のあなたは「${highPole}」寄り。でも${lowLabel}では「${lowPole}」に振れる。この${gapDesc}振れ幅は、場面によってあなたが別の顔を見せていることを意味する。`;

  // Generate specific implication based on axis type
  let implication: string;

  if (axis === "introvert_vs_extrovert") {
    if (highCtx.score > 0) {
      implication = `${highLabel}では外向的に振る舞っているが、それはエネルギーを消費する「演技」かもしれない。${lowLabel}のあなたが本来のエネルギーの方向を示している可能性がある。`;
    } else {
      implication = `${highLabel}では内向的でいられるが、${lowLabel}では外向性が求められている。その適応力は強みだが、コストにも注意。`;
    }
  } else if (
    axis === "direct_vs_diplomatic" ||
    axis === "independence_vs_harmony"
  ) {
    implication = `${highLabel}と${lowLabel}で、あなたは自分の出し方を変えている。どちらが「本当の自分」ではなく、どちらも自分。ただ、${lowLabel}で我慢していることがあるなら、それは蓄積する。`;
  } else if (
    axis === "emotional_regulation" ||
    axis === "emotional_variability"
  ) {
    implication = `感情の出し方が場面で変わる。これは日本文化では自然なことだが、「素の感情」を出せる場所があるかどうかが、あなたの心の健康に直結する。`;
  } else if (axis === "cautious_vs_bold" || axis === "plan_vs_spontaneous") {
    implication = `意思決定のスタイルが場面で変わる。${highLabel}での判断基準と${lowLabel}での判断基準が違う。どちらの自分がより「楽」か、振り返ってみる価値がある。`;
  } else if (axis === "social_initiative" || axis === "boundary_awareness") {
    implication = `人との距離の取り方が場面で変わる。特定の場面だけで見せる社交性や警戒心がある。それは相手に対する信頼の度合いを反映している。`;
  } else {
    implication = `この変化は、あなたが環境に適応する力の表れ。ただし、どの場面の自分が最もエネルギーを使わずに済むか——それがあなたの「自然な状態」に近い。`;
  }

  const deepWhyHypothesis = generateDeepWhyHypothesis(axis, highCtx, lowCtx);
  const selfAwarenessQuestion = generateSelfAwarenessQuestion(
    axis,
    highCtx,
    lowCtx,
  );

  return { insight, implication, deepWhyHypothesis, selfAwarenessQuestion };
}

// ── Variability Classification ──

function classifyVariabilityType(
  axisGaps: { gap: number }[],
  overallVariability: number,
): VariabilityType {
  if (overallVariability < 0.2) return "consistent";

  // Count how many axes show significant shifts (gap >= 0.4)
  const significantShifts = axisGaps.filter((ag) => ag.gap >= 0.4).length;
  const totalAxesWithData = axisGaps.length;

  if (totalAxesWithData === 0) return "consistent";

  const shiftRatio = significantShifts / totalAxesWithData;

  // Chameleon: many axes shift significantly (>40% of measured axes)
  if (shiftRatio > 0.4 && significantShifts >= 3) return "chameleon";

  // Selective: only a few axes shift, but they shift meaningfully
  if (significantShifts >= 1) return "selective";

  return "consistent";
}

// ── Honne / Tatemae Insight ──

function generateHonneInsight(
  mostAuthenticContext: string | null,
  mostPerformativeContext: string | null,
  shifts: ContextShift[],
  variabilityType: VariabilityType,
): string {
  if (!mostAuthenticContext && !mostPerformativeContext) {
    return "まだ十分な文脈データがありません。異なる場面での観測が増えると、あなたの本音と建前の境界線が見えてきます。";
  }

  const authLabel = mostAuthenticContext
    ? getContextLabel(mostAuthenticContext)
    : null;
  const perfLabel = mostPerformativeContext
    ? getContextLabel(mostPerformativeContext)
    : null;

  if (variabilityType === "consistent") {
    return `あなたは場面を問わず、ほぼ同じ自分を生きている。建前のレイヤーが薄い——つまり、本音がそのまま表に出ている状態。これは稀有な一貫性であり、周囲から「裏表がない」と感じられているはず。ただし、本音を出し続けること自体が、ある種の勇気の産物なのか、それとも建前を必要としない環境に恵まれているのか——その区別は、観測を重ねると見えてくる。`;
  }

  if (variabilityType === "chameleon") {
    return `あなたは多くの場面で異なる自分を使い分けている。日本文化における「場の空気を読む」力が非常に高い。${authLabel ? `${authLabel}が最も素に近い。` : ""}${perfLabel ? `一方、${perfLabel}では建前の層が厚い。` : ""}これは社会的知性の表れだが、「どの仮面も本当の自分じゃない」と感じる瞬間があるなら、それは使い分けのコストが臨界点に近づいているサイン。`;
  }

  // selective
  if (authLabel && perfLabel) {
    const topShiftAxis = shifts[0]
      ? getAxisLabel(shifts[0].axis)
      : null;

    return `${authLabel}——そこにあなたの本音が滲んでいる。${perfLabel}では、意識的か無意識的かを問わず、社会的な仮面をかぶっている。${topShiftAxis ? `特に「${topShiftAxis}」の軸で建前が厚くなる。` : ""}興味深いのは、建前を使う場面ほど、あなたが「大切にしたい何か」を守ろうとしていること。建前は嘘ではなく、防衛。何を守っているのかに気づくことが、自己理解の次のステップになる。`;
  }

  if (authLabel) {
    return `${authLabel}が、あなたの本音に最も近い場所。ここでの振る舞いが、社会的フィルターを通さない「生の自分」に近い。他の場面との差分が、あなたが無意識に行っている翻訳作業——本音を建前に変換する作業——の量を物語っている。`;
  }

  if (perfLabel) {
    return `${perfLabel}で最も建前の層が厚くなる。この場面であなたが守ろうとしているもの——評価、関係性、自己イメージ——がそこにある。建前の奥にある本音は、まだ観測の途中。`;
  }

  return "文脈間の差分から、あなたの本音と建前の境界線が徐々に見えてきています。観測を重ねることで、より鮮明になります。";
}

// ── Summary Generation (Poetic / Emotionally Resonant) ──

function generatePoeticSummary(
  overallVariability: number,
  variabilityType: VariabilityType,
  shifts: ContextShift[],
  mostAuthenticContext: string | null,
  mostPerformativeContext: string | null,
): string {
  const authLabel = mostAuthenticContext
    ? getContextLabel(mostAuthenticContext)
    : null;
  const perfLabel = mostPerformativeContext
    ? getContextLabel(mostPerformativeContext)
    : null;

  if (variabilityType === "consistent" && shifts.length === 0) {
    return `あなたという人間は、どの場面でもほぼ同じ輪郭をしている。水が器を選ばないように、あなたは環境に形を変えない。それは静かな強さであり、稀有な自己一致。周囲はあなたの中に「芯」を感じているはず。`;
  }

  if (variabilityType === "consistent" && shifts.length > 0) {
    const shiftDesc = shifts[0]
      ? `「${getAxisLabel(shifts[0].axis)}」の軸にだけ、かすかな揺れがある`
      : "";
    return `一貫した自分を生きながらも、${shiftDesc}。その小さな揺れは、あなたが完全に固定された人間ではなく、特定の場面で微かに呼吸を変える生きた存在である証。`;
  }

  if (variabilityType === "chameleon") {
    return `あなたは場面ごとに異なる色を見せる——カメレオンのように。${perfLabel ? `${perfLabel}では特に、別の誰かのように振る舞う。` : ""}${authLabel ? `${authLabel}でだけ、鎧を下ろす。` : ""}この適応力は、あなたが「場の力学」を肌で読む人間であることを示している。ただ、すべての場面で「最適な自分」を演じ続けることは、いつか「最適ではない素の自分」を忘れるリスクをはらんでいる。`;
  }

  // selective
  if (shifts.length >= 2) {
    const ctx1 = shifts[0].contexts.sort((a, b) => b.score - a.score);
    const ctx2 = shifts[1].contexts.sort((a, b) => b.score - a.score);
    const scene1 = ctx1[0]?.contextLabel ?? "";
    const scene2 = ctx2[0]?.contextLabel ?? "";

    return `あなたの中には、場面によって現れる複数の自分がいる。${scene1}で見せる顔と${scene2}で見せる顔は、同じ人間の異なる周波数。どちらも嘘ではない——ただ、どちらかに無理をしている自分がいるなら、その無理は静かに蓄積する。あなたが最も「考えなくても自分でいられる」場面を知ることが、次の問いの入口になる。`;
  }

  if (shifts.length === 1 && shifts[0]) {
    const topAxis = getAxisLabel(shifts[0].axis);
    return `ほとんどの場面で安定しているあなたが、「${topAxis}」の軸でだけ顔を変える。その一点の変化は、あなたが意識的に——あるいは無意識に——守っている何かの輪郭を浮かび上がらせる。一貫性の中の例外にこそ、あなたの核心が隠れている。`;
  }

  return `場面によって少しずつ異なるあなたが見えてきた。その差分の一つひとつが、あなたという人間の地図を描くための座標点になる。`;
}

// ── Main Analyzer ──

/**
 * 文脈間スコアの差を分析し、パーソナライズされた洞察を生成する
 */
export function analyzeContextShifts(
  contextScores: Record<string, Partial<Record<TraitAxisKey, number>>>,
): ContextProfile {
  const contexts = Object.keys(contextScores);
  if (contexts.length < 2) {
    return {
      overallVariability: 0,
      variabilityType: "consistent" as const,
      mostPerformativeContext: null,
      mostAuthenticContext: null,
      shifts: [],
      summary:
        "文脈データが不足しています。異なる場面での観測を増やすと、ここに分析が表示されます。",
      honneInsight:
        "まだ十分な文脈データがありません。異なる場面での観測が増えると、あなたの本音と建前の境界線が見えてきます。",
    };
  }

  // Collect all axes that have data in at least 2 contexts
  const axisSet = new Set<TraitAxisKey>();
  for (const scores of Object.values(contextScores)) {
    for (const key of Object.keys(scores) as TraitAxisKey[]) {
      axisSet.add(key);
    }
  }

  // Calculate gap per axis across contexts
  const axisGaps: {
    axis: TraitAxisKey;
    gap: number;
    entries: { context: string; score: number }[];
  }[] = [];

  for (const axis of axisSet) {
    const entries: { context: string; score: number }[] = [];
    for (const ctx of contexts) {
      const score = contextScores[ctx]?.[axis];
      if (score !== undefined) entries.push({ context: ctx, score });
    }
    if (entries.length < 2) continue;

    const scores = entries.map((e) => e.score);
    const gap = Math.max(...scores) - Math.min(...scores);
    if (gap >= 0.3) {
      axisGaps.push({ axis, gap, entries });
    }
  }

  // Sort by gap descending
  axisGaps.sort((a, b) => b.gap - a.gap);

  // Build shifts (top 3)
  const shifts: ContextShift[] = axisGaps.slice(0, 3).map((ag) => {
    const sorted = [...ag.entries].sort((a, b) => b.score - a.score);
    const highCtx = sorted[0];
    const lowCtx = sorted[sorted.length - 1];
    const {
      insight,
      implication,
      deepWhyHypothesis,
      selfAwarenessQuestion,
    } = generateShiftInsight(ag.axis, highCtx, lowCtx, ag.gap);

    return {
      axis: ag.axis,
      contexts: ag.entries.map((e) => ({
        context: e.context,
        contextLabel: getContextLabel(e.context),
        score: e.score,
      })),
      gap: ag.gap,
      insight,
      implication,
      deepWhyHypothesis,
      selfAwarenessQuestion,
    };
  });

  // Overall variability = average of top gaps
  const overallVariability =
    axisGaps.length > 0
      ? Math.min(
          axisGaps.slice(0, 5).reduce((sum, ag) => sum + ag.gap, 0) /
            Math.min(axisGaps.length, 5),
          1,
        )
      : 0;

  // Find most performative context (highest average deviation from "general")
  let mostPerformativeContext: string | null = null;
  let mostAuthenticContext: string | null = null;

  if (contextScores.general) {
    let maxDeviation = 0;
    let minDeviation = Infinity;

    for (const ctx of contexts) {
      if (ctx === "general") continue;
      let totalDev = 0;
      let count = 0;
      for (const axis of axisSet) {
        const gen = contextScores.general[axis];
        const ctxScore = contextScores[ctx]?.[axis];
        if (gen !== undefined && ctxScore !== undefined) {
          totalDev += Math.abs(ctxScore - gen);
          count++;
        }
      }
      if (count > 0) {
        const avgDev = totalDev / count;
        if (avgDev > maxDeviation) {
          maxDeviation = avgDev;
          mostPerformativeContext = ctx;
        }
        if (avgDev < minDeviation) {
          minDeviation = avgDev;
          mostAuthenticContext = ctx;
        }
      }
    }
  }

  // Classify variability type
  const variabilityType = classifyVariabilityType(axisGaps, overallVariability);

  // Generate poetic summary
  const summary = generatePoeticSummary(
    overallVariability,
    variabilityType,
    shifts,
    mostAuthenticContext,
    mostPerformativeContext,
  );

  // Generate honne/tatemae insight
  const honneInsight = generateHonneInsight(
    mostAuthenticContext,
    mostPerformativeContext,
    shifts,
    variabilityType,
  );

  return {
    overallVariability,
    variabilityType,
    mostPerformativeContext,
    mostAuthenticContext,
    shifts,
    summary,
    honneInsight,
  };
}
