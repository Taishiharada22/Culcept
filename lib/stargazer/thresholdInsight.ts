// lib/stargazer/thresholdInsight.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 0: The Threshold — 10問で1つの核心的インサイトを抽出する
//
// 原理:
//   EIG（期待情報利得）で「10問で最大の情報を得る質問セット」を選出し、
//   回答後に最も確信度の高い軸からナラティブインサイトを生成する。
//
//   10問で衝撃的な発見を出すことが Stargazer の生命線。
//   ここが弱ければユーザーは離脱し、強ければ「もっと知りたい」が生まれる。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { TRAIT_AXIS_KEYS, type TraitAxisKey } from "./traitAxes";
import { QUESTIONS } from "./questions";
import {
  createEmptyBeliefSet,
  updateAxisBelief,
  computeEvidencePrecision,
  type BeliefSet,
  type AxisBelief,
} from "./bayesianAxisUpdater";
import { computeResponseTimeSignal } from "./responseTimeEngine";
import {
  rankQuestionsByEIG,
  propagateBeliefs,
  computeSyncPercentage,
} from "./informationGain";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. EIG ベースの10問選出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * オンボーディング用35問から、EIGが最大の10問を選出する。
 *
 * 逐次選択: 1問選ぶ → beliefs をシミュレーション更新 → 次の1問のEIGを再計算
 * → これにより「同じ軸の質問ばかり選ばれる」問題を防ぐ
 */
export function selectThresholdQuestions(
  allQuestions: typeof QUESTIONS,
): typeof QUESTIONS {
  const TARGET_COUNT = 10;
  let beliefs = createEmptyBeliefSet();
  const selected: typeof QUESTIONS = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < TARGET_COUNT; i++) {
    // 未使用の質問から候補を作成
    const candidates = allQuestions
      .filter((q) => !usedIds.has(q.id))
      .map((q) => {
        // 質問が影響する全軸の合計EIGで評価
        const primaryAxis = q.axes[0];
        return {
          id: q.id,
          axisId: primaryAxis?.key ?? ("introvert_vs_extrovert" as TraitAxisKey),
          weight: primaryAxis?.weight ?? 0.5,
          discrimination: 1.0,
        };
      });

    // EIG ランキング
    const ranked = rankQuestionsByEIG(candidates, beliefs);
    if (ranked.length === 0) break;

    const bestId = ranked[0].questionId;
    const bestQuestion = allQuestions.find((q) => q.id === bestId);
    if (!bestQuestion) break;

    selected.push(bestQuestion);
    usedIds.add(bestId);

    // シミュレーション更新: この質問に「中立」(0) で回答した場合の beliefs を計算
    // → 次の質問のEIG計算に反映（同じ軸ばかり選ばれるのを防ぐ）
    for (const axis of bestQuestion.axes) {
      const evidPrec = computeEvidencePrecision({
        questionAxisWeight: axis.weight,
        responseTimeConfidence: 1.0,
        statePrecisionMultiplier: 1.0,
        sourceMultiplier: 2.0, // オンボーディング
        itemDiscrimination: 1.0,
      });
      beliefs[axis.key] = updateAxisBelief(beliefs[axis.key], 0, evidPrec);
    }
  }

  return selected;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. 10問の回答から核心インサイトを抽出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ThresholdAnswer {
  questionId: string;
  /** 1-5 のリッカート or バイナリ変換済み */
  value: number;
  responseTimeMs?: number;
}

export interface ThresholdInsight {
  /** インサイトのテキスト（日本語、2-3文） */
  text: string;
  /** 根拠となった軸 */
  axisId: TraitAxisKey;
  /** 確信度 0-1 */
  confidence: number;
  /** 方向: positive(右寄り) or negative(左寄り) */
  direction: "positive" | "negative";
  /** 更新された信念セット（後続の Stage1 で使用） */
  beliefs: BeliefSet;
  /** 同期率 */
  syncPercentage: number;
  /** 回答時間から検出された躊躇パターン */
  hesitationDetected: boolean;
}

/**
 * 10問の回答から最も確信度の高い1つのインサイトを生成
 */
export function extractThresholdInsight(
  answers: ThresholdAnswer[],
  questions: typeof QUESTIONS,
): ThresholdInsight {
  let beliefs = createEmptyBeliefSet();
  let maxHesitation = 0;

  // ベイズ更新（相関伝播あり）
  for (const answer of answers) {
    const question = questions.find((q) => q.id === answer.questionId);
    if (!question) continue;

    const rtSignal = computeResponseTimeSignal(answer.responseTimeMs);
    const normalized = (answer.value - 3) / 2;

    for (const axis of question.axes) {
      const effectiveScore = axis.invert ? -normalized : normalized;
      const evidencePrecision = computeEvidencePrecision({
        questionAxisWeight: axis.weight,
        responseTimeConfidence: rtSignal.confidenceMultiplier,
        statePrecisionMultiplier: 1.0,
        sourceMultiplier: 2.0,
        itemDiscrimination: 1.0,
      });

      beliefs[axis.key] = updateAxisBelief(beliefs[axis.key], effectiveScore, evidencePrecision);

      // 相関軸への伝播
      beliefs = propagateBeliefs(beliefs, axis.key, effectiveScore, evidencePrecision);
    }

    if (rtSignal.conflictIndicator > maxHesitation) {
      maxHesitation = rtSignal.conflictIndicator;
    }
  }

  // 最も確信度の高い軸を特定
  let bestAxis: TraitAxisKey = "introvert_vs_extrovert";
  let bestConfidence = 0;

  for (const key of TRAIT_AXIS_KEYS) {
    const belief = beliefs[key];
    // mu の絶対値 × precision で「確信を持って方向が分かる」軸を選ぶ
    const strength = Math.abs(belief.mu) * Math.sqrt(belief.precision);
    if (strength > bestConfidence) {
      bestConfidence = strength;
      bestAxis = key;
    }
  }

  const bestBelief = beliefs[bestAxis];
  const direction = bestBelief.mu >= 0 ? "positive" : "negative";

  // インサイトテキスト生成
  const text = generateInsightText(bestAxis, direction, bestBelief, maxHesitation > 0.5);

  return {
    text,
    axisId: bestAxis,
    confidence: bestBelief.confidence,
    direction,
    beliefs,
    syncPercentage: computeSyncPercentage(beliefs),
    hesitationDetected: maxHesitation > 0.5,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. インサイトテキスト生成（テンプレート方式）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type InsightTemplate = {
  axis: TraitAxisKey;
  positive: string;
  negative: string;
  /** 躊躇が検出された場合の追記 */
  hesitationSuffix?: string;
};

const INSIGHT_TEMPLATES: InsightTemplate[] = [
  {
    axis: "introvert_vs_extrovert",
    negative: "あなたは、一人の時間で世界を整理する人だ。人といる時間は楽しめるけど、本当の充電は静けさの中で起きる。",
    positive: "あなたは、人との間で自分を確認する人だ。一人でいると少し不安になるのは、弱さじゃなくて、人が燃料だから。",
    hesitationSuffix: "ただ、この質問で少し迷いがあった。状況によって、どちらの自分も出てくるんだね。",
  },
  {
    axis: "analytical_vs_intuitive",
    negative: "あなたは、決断する前に、無意識に退路を確保する人だ。リスクを減らしたいんじゃない。安心して進みたいだけ。",
    positive: "あなたは、直感が先に動く人だ。理由は後から見つける。それは無謀じゃなくて、身体が先に答えを知っている。",
    hesitationSuffix: "でも時々、その直感を疑う瞬間がある。その揺れが、あなたの判断を深くしてる。",
  },
  {
    axis: "cautious_vs_bold",
    negative: "あなたは、見えない危険を察知するセンサーが強い人だ。臆病なんじゃない。予測の解像度が高いだけ。",
    positive: "あなたは、不確実性をエネルギーに変える人だ。「やってみないとわからない」が口癖になってない？",
  },
  {
    axis: "plan_vs_spontaneous",
    negative: "あなたは、未来を先に体験する人だ。計画を立てることで、まだ来てない明日を生きてる。",
    positive: "あなたは、今この瞬間に全力を注ぐ人だ。計画は退屈。目の前のことに没頭するのが自然体。",
  },
  {
    axis: "emotional_variability",
    negative: "あなたの感情は、深い湖のように静かだ。波は小さいけど、その下には誰にも見えない流れがある。",
    positive: "あなたの感情は、天気のように移り変わる。激しく動くのは弱さじゃない。感じる力が人より強いだけ。",
    hesitationSuffix: "この質問、答えるのに少し時間がかかったね。感情について語ること自体に、小さな抵抗がある。",
  },
  {
    axis: "independence_vs_harmony",
    negative: "あなたは、「自分の道」を歩くことに価値を置く人だ。周りに合わせるのが苦手なんじゃなくて、自分を曲げるのが嫌なだけ。",
    positive: "あなたは、場の調和を身体で感じる人だ。誰かが不快になると、自分も落ち着かない。それは優しさの証拠。",
  },
  {
    axis: "boundary_awareness",
    negative: "あなたは、人との距離を自然に調整できる人だ。でも時々、その壁が「冷たさ」に見えてないか気にしてる。",
    positive: "あなたは、人の領域に入るのが得意な人だ。でもたまに、入りすぎて相手を驚かせることがある。",
  },
  {
    axis: "emotional_regulation",
    negative: "あなたの中には、表に出さない感情の貯水池がある。制御できてるように見えるけど、実は「感じないようにしてる」時がある。",
    positive: "あなたは感情を隠さない。でもそれは「制御できない」のとは違う。出すことを選んでる。",
  },
  {
    axis: "change_embrace_vs_resist",
    negative: "あなたは、変化の前に「本当に必要か」を問う人だ。保守的なんじゃない。大切なものを守りたいだけ。",
    positive: "あなたは、変化を待てない人だ。今のままでいることの方が、変わることよりリスクに感じる。",
  },
  {
    axis: "stress_isolation_vs_social",
    negative: "あなたは、辛い時に一人になりたがる。弱さを見せたくないんじゃなくて、自分で処理したい。でもそれが、時々孤独を生む。",
    positive: "あなたは、辛い時こそ人を求める。話すことで整理される。でもそれが、時々相手を疲れさせる。",
  },
  {
    axis: "intimacy_pace",
    negative: "あなたは、関係をゆっくり深めたい人だ。急に距離を詰められると、少し息苦しくなる。それは信頼を大事にしてる証拠。",
    positive: "あなたは、出会った瞬間から深く入りたい人だ。表面的な会話より、本音の方が楽。",
  },
  {
    axis: "reassurance_need",
    negative: "あなたは、自分の中に答えを持っている人だ。他人の承認がなくても、自分で確信できる。ただ、それが時々「冷たさ」に見える。",
    positive: "あなたは、大切な人の反応で安心する人だ。「大丈夫だよ」の一言が、想像以上に大きい。それは依存じゃなくて、つながりの形。",
  },
];

function generateInsightText(
  axis: TraitAxisKey,
  direction: "positive" | "negative",
  belief: AxisBelief,
  hesitationDetected: boolean,
): string {
  const template = INSIGHT_TEMPLATES.find((t) => t.axis === axis);

  if (template) {
    const baseText = direction === "positive" ? template.positive : template.negative;
    if (hesitationDetected && template.hesitationSuffix) {
      return `${baseText}\n\n${template.hesitationSuffix}`;
    }
    return baseText;
  }

  // フォールバック: テンプレートがない軸
  const strength = Math.abs(belief.mu);
  if (strength > 0.5) {
    return direction === "positive"
      ? "あなたには、はっきりとした傾向がある。自分でも気づいてるかもしれないけど、思ってる以上に強いよ。"
      : "あなたの中に、静かだけど確かな傾向がある。普段は意識しないかもしれないけど、選択の瞬間に必ず顔を出す。";
  }
  return "あなたの中で、2つの力がせめぎ合ってる。どちらかに決めきれないのは、どちらも本当のあなただから。";
}
